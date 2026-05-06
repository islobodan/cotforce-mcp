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
  estimateTokens,
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
import { callDirectLLM, isDirectModeConfigured } from "./lib/llm.js";

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
// 2. ENVIRONMENT CONSTANTS
// ------------------------------------------------------------------
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "2", 10);

// ------------------------------------------------------------------
// 3. SCHEMAS
// ------------------------------------------------------------------
const SolveProblemArgsSchema = z.object({
  prompt: z.string().min(1, "prompt must not be empty"),
  resultSchema: z.record(z.any()).optional().describe(
    "Optional JSON schema to validate the result field against"
  ),
});

// ------------------------------------------------------------------
// 4. FORMATTING HELPERS
// ------------------------------------------------------------------
function formatResult(result: unknown): string {
  if (result === null) return "null";
  if (result === undefined) return "undefined";
  if (typeof result === "object") return JSON.stringify(result, null, 2);
  return String(result);
}

// ------------------------------------------------------------------
// 5. PROGRESS NOTIFICATIONS
// ------------------------------------------------------------------
type SendNotificationFn = (notification: unknown) => Promise<void>;

function createProgressSender(
  progressToken: string | number | undefined,
  sendNotification: SendNotificationFn,
  totalSteps: number
) {
  if (!progressToken) {
    // Client didn't request progress — return no-op
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return (_progress: number, _message: string) => Promise.resolve();
  }

  let lastSent = -1;
  return async (progress: number, message: string) => {
    // Only send if progress increased (debounce)
    if (progress <= lastSent) return;
    lastSent = progress;
    await sendNotification({
      method: "notifications/progress",
      params: {
        progressToken,
        progress,
        total: totalSteps,
        message,
      },
    });
  };
}

// ------------------------------------------------------------------
// 6. SAMPLING CAPABILITY CHECK
// ------------------------------------------------------------------
let clientSamplingSupported = false;

function checkSamplingCapability(): void {
  const clientCaps = server.getClientCapabilities();
  clientSamplingSupported =
    clientCaps != null &&
    typeof clientCaps === "object" &&
    "sampling" in clientCaps;
}

function assertSamplingSupported(): void {
  if (clientSamplingSupported) return;
  if (shouldUseDirectMode()) return; // direct HTTP will be used instead
  throw new McpError(
    ErrorCode.InternalError,
    "CotForce requires either (a) an MCP client with sampling support, or (b) a direct LLM endpoint. " +
      "Set API_KEY and API_BASE_URL for remote providers, or just API_BASE_URL for local endpoints like LMStudio/Ollama. " +
      "Alternatively, set MODE=direct to force direct HTTP mode."
  );
}

// ------------------------------------------------------------------
// 7. RESULT SCHEMA VALIDATION
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
// 8. SERVER INITIALIZATION
// ------------------------------------------------------------------
const server = new Server(
  { name: "cotforce-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ------------------------------------------------------------------
// 9. LLM SAMPLING FUNCTION (with retry logic, model env, temp_increment)
// ------------------------------------------------------------------
interface SamplingResult {
  text: string;
  tokenCount: {
    input: number;
    output: number;
    budget: number;
  };
  truncated: boolean;
  finishReason?: string;
}

function getFallbackModels(): string[] {
  const raw = process.env.FALLBACK_MODELS;
  if (!raw) return [];
  return raw.split(",").map((m) => m.trim()).filter(Boolean);
}

function shouldUseDirectMode(): boolean {
  const mode = (process.env.MODE || "auto").toLowerCase();
  if (mode === "direct") return true;
  if (mode === "sampling") return false;
  // auto: use direct if configured and client lacks sampling support
  if (mode === "auto") {
    return isDirectModeConfigured() && !clientSamplingSupported;
  }
  return false;
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

  const tokenBudget =
    options?.budgetOverride !== undefined
      ? { budget: options.budgetOverride, inputTokens: estimateTokens(systemPrompt + "\n" + augmentedUserPrompt) }
      : computeTokenBudget(augmentedUserPrompt, systemPrompt);
  const maxTokens = tokenBudget.budget;
  const inputTokens = tokenBudget.inputTokens;

  logger.debug("Sampling request", {
    temperature,
    maxTokens,
    modelHint: modelHint || "none",
    isRetry: options?.isRetry,
    mode: shouldUseDirectMode() ? "direct" : "mcp-sampling",
  });

  // ------------------------------------------------------------------
  // Direct HTTP mode (for clients without MCP sampling support)
  // ------------------------------------------------------------------
  if (shouldUseDirectMode()) {
    const apiKey = process.env.API_KEY || "";
    const baseUrl = process.env.API_BASE_URL || "https://api.openai.com";
    const model = modelHint || "gpt-4o";

    try {
      const result = await callDirectLLM({
        systemPrompt,
        userPrompt: augmentedUserPrompt,
        model,
        maxTokens,
        temperature,
        apiKey,
        baseUrl,
      });

      const fullText = result.text;
      const outputTokens = result.usage?.completion_tokens ?? countTokens(fullText);
      const truncated = result.finishReason === "length" || isTruncated(outputTokens, maxTokens);

      if (truncated) {
        logger.warn("Response truncated", {
          finishReason: result.finishReason,
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
        finishReason: result.finishReason,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Direct LLM call failed", { error: message });
      throw new McpError(ErrorCode.InternalError, `Direct LLM call failed: ${message}`);
    }
  }

  // ------------------------------------------------------------------
  // MCP sampling mode (default, requires client support)
  // ------------------------------------------------------------------
  const modelPreferences = modelHint
    ? { hints: [{ name: modelHint }] }
    : undefined;

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
      { timeout: parseInt(process.env.TIMEOUT || "60000", 10) }
    );

    if (response.content.type !== "text") {
      throw new Error(
        `Unsupported sampling response content type: ${response.content.type}`
      );
    }

    const fullText = response.content.text;
    const outputTokens = estimateTokens(fullText);
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
// 10. TOOL REGISTRATION
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
// 11. TOOL EXECUTION WITH CHAOS PROTOCOL
// ------------------------------------------------------------------
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const requestStart = Date.now();
  recordRequest();

  const progressToken = (request.params as { _meta?: { progressToken?: string | number } })._meta?.progressToken;
  const totalSteps = (MAX_RETRIES + 1) * (getFallbackModels().length + 1);
  const notifyProgress = createProgressSender(progressToken, extra.sendNotification as SendNotificationFn, totalSteps);

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

  // Guard: if client doesn't support sampling, fail fast with a helpful error
  assertSamplingSupported();

  const { prompt } = parseArgs.data;

  const BASE_TEMP = parseFloat(process.env.BASE_TEMP || "0.1");
  const TEMP_INCREMENT = parseFloat(process.env.TEMP_INCREMENT || "0.2");
  const fallbackModels = getFallbackModels();
  const models: (string | undefined)[] = [
    process.env.MODEL,
    ...fallbackModels,
  ].filter((m): m is string => Boolean(m));

  // Ensure we always try at least once with host default when no model configured
  if (models.length === 0) {
    models.push(undefined);
  }

  let lastRaw: string | null = null;
  let lastRejectionMemo: string | null = null;
  let lastTokenCount: SamplingResult["tokenCount"] | null = null;
  let lastError: string | null = null;
  let modelIndex = 0;

  while (modelIndex < models.length) {
    const currentModel = models[modelIndex];
    logger.info("Trying model", { model: currentModel ?? "host default", modelIndex });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const stepNum = modelIndex * (MAX_RETRIES + 1) + attempt + 1;
      const temperature =
        attempt === 0 ? BASE_TEMP : BASE_TEMP + TEMP_INCREMENT * attempt;
      const isRetry = attempt > 0;
      if (isRetry) recordRetry();

      logger.info("Processing request attempt", {
        attempt,
        temperature,
        isRetry,
        model: currentModel ?? "host default",
      });

      await notifyProgress(stepNum, `Calling LLM (attempt ${attempt + 1}/${MAX_RETRIES + 1}, model: ${currentModel ?? "default"})`);

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
          logger.warn("Truncation detected", {
            attempt,
            finishReason: samplingResult.finishReason,
            outputTokens: samplingResult.tokenCount.output,
            budget: samplingResult.tokenCount.budget,
            model: currentModel ?? "host default",
          });

          // Try to recover from truncated response first (avoids timeout on retry)
          await notifyProgress(stepNum, "Response truncated — attempting recovery");
          const recovered = parseCoT(samplingResult.text);
          if (recovered) {
            recordSuccess();
            recordParseLatency(Date.now() - requestStart);
            logger.info("Recovered CoT from truncated response", {
              reasonLength: recovered.reasoning.length,
              model: currentModel ?? "host default",
            });
            const tokenMeta = lastTokenCount
              ? `\n\n📊 Token Usage: ${lastTokenCount.input} in / ${lastTokenCount.output} out / ${lastTokenCount.budget} budget`
              : "";
            const modelMeta = models.length > 1 ? `\n🔄 Model used: ${currentModel ?? "host default"}` : "";
            return {
              content: [
                {
                  type: "text",
                  text:
                    `🤖 Agentic CoT Result:\n\n**Reasoning:** ${formatResult(recovered.reasoning)}\n\n**Answer:** ${formatResult(recovered.result)}` +
                    tokenMeta +
                    modelMeta,
                },
              ],
            };
          }

          // Recovery failed — retry with increased budget and conciseness hint
          const newBudget = Math.ceil(samplingResult.tokenCount.budget * 1.5);
          lastRejectionMemo =
            `[TRUNCATED] Your previous response hit the token limit (${samplingResult.tokenCount.output}/${samplingResult.tokenCount.budget} tokens). ` +
            "Be more concise — skip repetitive analysis and go straight to the key deductions.\n\n" +
            samplingResult.text.slice(0, 300);
          logger.warn("Recovery failed, retrying with increased budget", {
            attempt,
            oldBudget: samplingResult.tokenCount.budget,
            newBudget,
            model: currentModel ?? "host default",
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
          await notifyProgress(totalSteps, "CoT reasoning complete");
          logger.info("CoT parsed successfully", {
            reasonLength: parsed.reasoning.length,
            model: currentModel ?? "host default",
          });
          const tokenMeta = lastTokenCount
            ? `\n\n📊 Token Usage: ${lastTokenCount.input} in / ${lastTokenCount.output} out / ${lastTokenCount.budget} budget`
            : "";
          const modelMeta = models.length > 1 ? `\n🔄 Model used: ${currentModel ?? "host default"}` : "";
          return {
            content: [
              {
                type: "text",
                text:
                  `🤖 Agentic CoT Result:\n\n**Reasoning:** ${formatResult(parsed.reasoning)}\n\n**Answer:** ${formatResult(parsed.result)}` +
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
          model: currentModel ?? "host default",
        });

        if (attempt === MAX_RETRIES) break;
      } catch (err) {
        recordSamplingError();
        const errMsg = err instanceof Error ? err.message : String(err);
        lastError = errMsg;
        lastRejectionMemo = `[Sampling error]: ${errMsg}`;
        logger.error("Attempt failed with exception", {
          attempt,
          error: lastRejectionMemo,
          model: currentModel ?? "host default",
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
      const nextModel = models[modelIndex] ?? "host default";
      await notifyProgress(modelIndex * (MAX_RETRIES + 1), `Switching to fallback model: ${nextModel}`);
      logger.info("Switching to fallback model", {
        from: currentModel ?? "host default",
        to: nextModel,
      });
      lastRejectionMemo =
        `[MODEL SWITCH] Model ${currentModel ?? "host default"} failed after ${MAX_RETRIES + 1} attempts. ` +
        `Trying ${nextModel} instead.`;
    }
  }

  logger.warn("Returning raw output fallback after all models exhausted");
  recordFailure();
  recordParseLatency(Date.now() - requestStart);
  const tokenMeta = lastTokenCount
    ? `\n\n📊 Token Usage: ${lastTokenCount.input} in / ${lastTokenCount.output} out / ${lastTokenCount.budget} budget`
    : "";
  const triedModels = models.length > 1 ? `\n🔄 Tried models: ${models.join(", ")}` : "";
  const errorMeta = lastError ? `\n\n❌ Last error: ${lastError}` : "";
  return {
    content: [
      {
        type: "text",
        text:
          `⚠️ Agentic CoT could not be parsed after trying ${models.length} model(s). Raw LLM output:\n\n${lastRaw || "No output"}` +
          tokenMeta +
          triedModels +
          errorMeta,
      },
    ],
    isError: false,
  };
});

// ------------------------------------------------------------------
// 12. START
// ------------------------------------------------------------------
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  checkSamplingCapability();
  if (!clientSamplingSupported) {
    logger.warn(
      "Connected client does NOT advertise sampling support. LLM calls via sampling/createMessage will fail."
    );
  }

  const mode = process.env.MODE || "auto";
  const directConfigured = isDirectModeConfigured();
  const effectiveMode = shouldUseDirectMode() ? "direct" : "mcp-sampling";

  logger.info("CotForce-MCP server started", {
    model: process.env.MODEL || "not set (host default)",
    mode,
    effectiveMode,
    directConfigured,
    maxRetries: MAX_RETRIES,
    baseTemp: parseFloat(process.env.BASE_TEMP || "0.1"),
    tempIncrement: parseFloat(process.env.TEMP_INCREMENT || "0.2"),
    tiktoken: getEncodingSafe() ? "available" : "fallback to heuristic",
    samplingSupported: clientSamplingSupported,
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
