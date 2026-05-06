import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { parseCoT } from "./lib/parser.js";
import {
  computeTokenBudget,
  countTokens,
  getEncodingSafe,
  isTruncated,
} from "./lib/tokens.js";
import {
  CORRECTION_SUFFIX,
  getSystemPrompt,
} from "./lib/prompts.js";
import {
  getMetrics,
  recordFailure,
  recordParseLatency,
  recordRequest,
  recordRetry,
  recordSamplingError,
  recordSuccess,
  recordTokenUsage,
  recordTruncation,
} from "./lib/metrics.js";

// ------------------------------------------------------------------
// 1. LOGGING (Structured, with levels)
// ------------------------------------------------------------------
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;
const currentLevel =
  LOG_LEVELS[(process.env.LOG_LEVEL?.toUpperCase() as LogLevel) ?? "INFO"] ??
  LOG_LEVELS.INFO;

function log(
  level: LogLevel,
  msg: string,
  meta?: Record<string, unknown>
): void {
  const levelNum = LOG_LEVELS[level] ?? 0;
  if (levelNum < currentLevel) return;
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  console.error(`[${timestamp}] [${level}] ${msg}${metaStr}`);
}

const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    log("DEBUG", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) =>
    log("INFO", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    log("WARN", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    log("ERROR", msg, meta),
};

// ------------------------------------------------------------------
// 2. SCHEMAS
// ------------------------------------------------------------------
const SolveProblemArgsSchema = z.object({
  prompt: z.string().min(1, "prompt must not be empty"),
  resultSchema: z.record(z.any()).optional().describe(
    "Optional JSON schema to validate the result field against"
  ),
});

// ------------------------------------------------------------------
// 3. RESULT SCHEMA VALIDATION
// ------------------------------------------------------------------
export function validateResultSchema(
  result: unknown,
  schema: Record<string, unknown>
): { valid: boolean; error?: string } {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return { valid: false, error: "Result must be an object" };
  }

  const obj = result as Record<string, unknown>;
  for (const [key, expected] of Object.entries(schema)) {
    if (!(key in obj)) {
      return { valid: false, error: `Missing required key: "${key}"` };
    }
    if (typeof expected === "string") {
      // Simple type check: { "count": "number", "name": "string" }
      const actualType = typeof obj[key];
      if (actualType !== expected) {
        return {
          valid: false,
          error: `Key "${key}" expected type "${expected}", got "${actualType}"`,
        };
      }
    } else if (expected && typeof expected === "object") {
      // Nested object validation
      const nested = validateResultSchema(obj[key], expected as Record<string, unknown>);
      if (!nested.valid) {
        return { valid: false, error: `Key "${key}": ${nested.error}` };
      }
    }
  }

  return { valid: true };
}

// ------------------------------------------------------------------
// 4. SERVER INITIALIZATION
// ------------------------------------------------------------------
const server = new Server(
  { name: "cotforce-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ------------------------------------------------------------------
// 5. LLM SAMPLING FUNCTION (with retry logic, model env, temp_increment)
// ------------------------------------------------------------------
interface SamplingResult {
  text: string;
  tokenCount: {
    input: number;
    output: number;
    budget: number;
  };
  truncated: boolean;
}

function getFallbackModels(): string[] {
  const raw = process.env.FALLBACK_MODELS;
  if (!raw) return [];
  return raw.split(",").map((m) => m.trim()).filter(Boolean);
}

async function sampleLLM(
  prompt: string,
  rejectionMemo: string | null,
  options?: {
    temperature?: number;
    isRetry?: boolean;
    budgetOverride?: number;
    modelOverride?: string;
  }
): Promise<SamplingResult> {
  const baseTemp = parseFloat(process.env.BASE_TEMP || "0.1");
  const tempIncrement = parseFloat(process.env.TEMP_INCREMENT || "0.2");
  const temperature =
    options?.temperature ??
    (options?.isRetry ? baseTemp + tempIncrement : baseTemp);

  const modelHint = options?.modelOverride ?? process.env.MODEL;
  const basePrompt = getSystemPrompt(modelHint);
  const systemPrompt = options?.isRetry
    ? basePrompt + "\n\n" + CORRECTION_SUFFIX
    : basePrompt;

  const augmentedUserPrompt = rejectionMemo
    ? `${prompt}\n\n[CONTEXT: Previously the model failed with:\n${rejectionMemo.slice(0, 300)}]`
    : prompt;

  const maxTokens =
    options?.budgetOverride ??
    computeTokenBudget(augmentedUserPrompt, systemPrompt);

  const inputTokens = countTokens(systemPrompt + "\n" + augmentedUserPrompt);

  const modelPreferences = modelHint
    ? { hints: [{ name: modelHint }] }
    : undefined;

  logger.debug("Sampling request", {
    temperature,
    maxTokens,
    modelHint: modelHint || "none",
    isRetry: options?.isRetry,
  });

  try {
    const response = await server.createMessage(
      {
        messages: [
          {
            role: "user",
            content: { type: "text", text: augmentedUserPrompt },
          },
        ],
        systemPrompt,
        modelPreferences,
        maxTokens,
        temperature,
      },
      { timeout: parseInt(process.env.TIMEOUT || "30000", 10) }
    );

    if (response.content.type !== "text") {
      throw new Error(
        `Unsupported sampling response content type: ${response.content.type}`
      );
    }

    const fullText = response.content.text;
    const outputTokens = countTokens(fullText);
    const truncated = isTruncated(outputTokens, maxTokens);

    if (truncated) {
      logger.warn("Response may be truncated", {
        outputTokens,
        budget: maxTokens,
        ratio: (outputTokens / maxTokens).toFixed(2),
      });
    }

    logger.debug("Sampling response received", {
      length: fullText.length,
      outputTokens,
      truncated,
    });

    return {
      text: fullText,
      tokenCount: { input: inputTokens, output: outputTokens, budget: maxTokens },
      truncated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Sampling failed", { error: message });
    throw new McpError(ErrorCode.InternalError, `Sampling failed: ${message}`);
  }
}

// ------------------------------------------------------------------
// 6. TOOL REGISTRATION
// ------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "solve_problem",
      description:
        "Solves a problem using strict Agentic Chain-of-Thought with adaptive parsing, retry logic, token budgeting (via tiktoken), and configurable model.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The problem to solve.",
          },
          resultSchema: {
            type: "object",
            description: "Optional JSON schema to validate the result field against.",
          },
        },
        required: ["prompt"],
      },
    },
  ],
}));

// ------------------------------------------------------------------
// 7. TOOL EXECUTION WITH CHAOS PROTOCOL
// ------------------------------------------------------------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const requestStart = Date.now();
  recordRequest();

  if (request.params.name !== "solve_problem") {
    recordFailure();
    throw new McpError(
      ErrorCode.InvalidParams,
      `Unknown tool: ${request.params.name}`
    );
  }

  const parseArgs = SolveProblemArgsSchema.safeParse(request.params.arguments);
  if (!parseArgs.success) {
    recordFailure();
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid arguments: ${parseArgs.error.message}`
    );
  }

  const { prompt } = parseArgs.data;

  const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "2", 10);
  const BASE_TEMP = parseFloat(process.env.BASE_TEMP || "0.1");
  const TEMP_INCREMENT = parseFloat(process.env.TEMP_INCREMENT || "0.2");
  const fallbackModels = getFallbackModels();
  const models = [
    process.env.MODEL,
    ...fallbackModels,
  ].filter(Boolean) as string[];

  let lastRaw: string | null = null;
  let lastRejectionMemo: string | null = null;
  let lastTokenCount: SamplingResult["tokenCount"] | null = null;
  let modelIndex = 0;

  while (modelIndex < models.length) {
    const currentModel = models[modelIndex];
    logger.info("Trying model", { model: currentModel, modelIndex });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const temperature =
        attempt === 0 ? BASE_TEMP : BASE_TEMP + TEMP_INCREMENT * attempt;
      const isRetry = attempt > 0;
      if (isRetry) recordRetry();

      logger.info("Processing request attempt", {
        attempt,
        temperature,
        isRetry,
        model: currentModel,
      });

      try {
        const samplingResult = await sampleLLM(prompt, lastRejectionMemo, {
          temperature,
          isRetry,
          modelOverride: currentModel,
        });
        lastRaw = samplingResult.text;
        lastTokenCount = samplingResult.tokenCount;

        if (samplingResult.tokenCount) {
          recordTokenUsage(
            samplingResult.tokenCount.input,
            samplingResult.tokenCount.output,
            samplingResult.tokenCount.budget
          );
        }

        if (samplingResult.truncated) {
          recordTruncation();
          lastRejectionMemo =
            `[TRUNCATED] Your previous response hit the token limit (${samplingResult.tokenCount.output}/${samplingResult.tokenCount.budget}). ` +
            "Please be more concise in your reasoning.\n\n" +
            samplingResult.text.slice(0, 300);
          logger.warn("Truncation detected, injecting conciseness hint", {
            attempt,
            model: currentModel,
          });
          if (attempt === MAX_RETRIES) break;
          continue;
        }

        const parsed = parseCoT(samplingResult.text);
        if (parsed) {
          // Validate against user-supplied result schema if provided
          if (parseArgs.data.resultSchema) {
            const schemaValidation = validateResultSchema(
              parsed.result,
              parseArgs.data.resultSchema
            );
            if (!schemaValidation.valid) {
              lastRejectionMemo =
                `[SCHEMA MISMATCH] The result field did not match the required schema. ` +
                `Errors: ${schemaValidation.error}`;
              logger.warn("Result schema validation failed", {
                attempt,
                error: schemaValidation.error,
              });
              if (attempt === MAX_RETRIES) break;
              continue;
            }
          }

          recordSuccess();
          recordParseLatency(Date.now() - requestStart);
          logger.info("CoT parsed successfully", {
            reasonLength: parsed.reasoning.length,
            model: currentModel,
          });
          const tokenMeta = lastTokenCount
            ? `\n\n📊 Token Usage: ${lastTokenCount.input} in / ${lastTokenCount.output} out / ${lastTokenCount.budget} budget`
            : "";
          const modelMeta = models.length > 1 ? `\n🔄 Model used: ${currentModel}` : "";
          return {
            content: [
              {
                type: "text",
                text:
                  `🤖 Agentic CoT Result:\n\n**Reasoning:** ${parsed.reasoning}\n\n**Answer:** ${parsed.result}` +
                  tokenMeta +
                  modelMeta,
              },
            ],
          };
        }

        lastRejectionMemo = samplingResult.text.slice(0, 500);
        logger.warn("Parse failed, storing rejection memo", {
          attempt,
          snippetLength: lastRejectionMemo.length,
          model: currentModel,
        });

        if (attempt === MAX_RETRIES) break;
      } catch (err) {
        recordSamplingError();
        lastRejectionMemo = `[Sampling error]: ${err instanceof Error ? err.message : String(err)}`;
        logger.error("Attempt failed with exception", {
          attempt,
          error: lastRejectionMemo,
          model: currentModel,
        });
        if (attempt === MAX_RETRIES) {
          recordFailure();
          recordParseLatency(Date.now() - requestStart);
          // Don't throw yet — try next fallback model if available
          break;
        }
      }
    }

    modelIndex++;
    if (modelIndex < models.length) {
      logger.info("Switching to fallback model", {
        from: currentModel,
        to: models[modelIndex],
      });
      lastRejectionMemo =
        `[MODEL SWITCH] Model ${currentModel} failed after ${MAX_RETRIES + 1} attempts. ` +
        `Trying ${models[modelIndex]} instead.`;
    }
  }

  logger.warn("Returning raw output fallback after all models exhausted");
  recordFailure();
  recordParseLatency(Date.now() - requestStart);
  const tokenMeta = lastTokenCount
    ? `\n\n📊 Token Usage: ${lastTokenCount.input} in / ${lastTokenCount.output} out / ${lastTokenCount.budget} budget`
    : "";
  const triedModels = models.length > 1 ? `\n🔄 Tried models: ${models.join(", ")}` : "";
  return {
    content: [
      {
        type: "text",
        text:
          `⚠️ Agentic CoT could not be parsed after trying ${models.length} model(s). Raw LLM output:\n\n${lastRaw || "No output"}` +
          tokenMeta +
          triedModels,
      },
    ],
    isError: false,
  };
});

// ------------------------------------------------------------------
// 8. START
// ------------------------------------------------------------------
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("CotForce-MCP server started", {
    model: process.env.MODEL || "not set (host default)",
    maxRetries: parseInt(process.env.MAX_RETRIES || "2", 10),
    baseTemp: parseFloat(process.env.BASE_TEMP || "0.1"),
    tempIncrement: parseFloat(process.env.TEMP_INCREMENT || "0.2"),
    tiktoken: getEncodingSafe() ? "available" : "fallback to heuristic",
  });
}

function shutdown(): void {
  const snapshot = getMetrics();
  logger.info("Server shutting down", { metrics: snapshot });
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((error: unknown) => {
  logger.error("Fatal server error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
