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
import { AGENTIC_SYSTEM_PROMPT, CORRECTION_SUFFIX } from "./lib/prompts.js";

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
});

// ------------------------------------------------------------------
// 3. SERVER INITIALIZATION
// ------------------------------------------------------------------
const server = new Server(
  { name: "cotforce-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ------------------------------------------------------------------
// 4. LLM SAMPLING FUNCTION (with retry logic, model env, temp_increment)
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

async function sampleLLM(
  prompt: string,
  rejectionMemo: string | null,
  options?: {
    temperature?: number;
    isRetry?: boolean;
    budgetOverride?: number;
  }
): Promise<SamplingResult> {
  const baseTemp = parseFloat(process.env.BASE_TEMP || "0.1");
  const tempIncrement = parseFloat(process.env.TEMP_INCREMENT || "0.2");
  const temperature =
    options?.temperature ??
    (options?.isRetry ? baseTemp + tempIncrement : baseTemp);

  const systemPrompt = options?.isRetry
    ? AGENTIC_SYSTEM_PROMPT + "\n\n" + CORRECTION_SUFFIX
    : AGENTIC_SYSTEM_PROMPT;

  const augmentedUserPrompt = rejectionMemo
    ? `${prompt}\n\n[CONTEXT: Previously the model failed with:\n${rejectionMemo.slice(0, 300)}]`
    : prompt;

  const maxTokens =
    options?.budgetOverride ??
    computeTokenBudget(augmentedUserPrompt, systemPrompt);

  const inputTokens = countTokens(systemPrompt + "\n" + augmentedUserPrompt);

  // Model hint from env
  const modelHint = process.env.MODEL;
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
// 5. TOOL REGISTRATION
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
        },
        required: ["prompt"],
      },
    },
  ],
}));

// ------------------------------------------------------------------
// 6. TOOL EXECUTION WITH CHAOS PROTOCOL
// ------------------------------------------------------------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const parseArgs = SolveProblemArgsSchema.safeParse(request.params.arguments);
  if (!parseArgs.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid arguments: ${parseArgs.error.message}`
    );
  }

  const { prompt } = parseArgs.data;

  const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "2", 10);
  const BASE_TEMP = parseFloat(process.env.BASE_TEMP || "0.1");
  const TEMP_INCREMENT = parseFloat(process.env.TEMP_INCREMENT || "0.2");
  let lastRaw: string | null = null;
  let lastRejectionMemo: string | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const temperature =
      attempt === 0 ? BASE_TEMP : BASE_TEMP + TEMP_INCREMENT * attempt;
    const isRetry = attempt > 0;

    logger.info("Processing request attempt", {
      attempt,
      temperature,
      isRetry,
    });

    try {
      const samplingResult = await sampleLLM(prompt, lastRejectionMemo, {
        temperature,
        isRetry,
      });
      lastRaw = samplingResult.text;

      if (samplingResult.truncated) {
        lastRejectionMemo =
          `[TRUNCATED] Your previous response hit the token limit (${samplingResult.tokenCount.output}/${samplingResult.tokenCount.budget}). ` +
          "Please be more concise in your reasoning.\n\n" +
          samplingResult.text.slice(0, 300);
        logger.warn("Truncation detected, injecting conciseness hint", {
          attempt,
        });
        if (attempt === MAX_RETRIES) break;
        continue;
      }

      const parsed = parseCoT(samplingResult.text);
      if (parsed) {
        logger.info("CoT parsed successfully", {
          reasonLength: parsed.reasoning.length,
        });
        return {
          content: [
            {
              type: "text",
              text: `🤖 Agentic CoT Result:\n\n**Reasoning:** ${parsed.reasoning}\n\n**Answer:** ${parsed.result}`,
            },
          ],
        };
      }

      lastRejectionMemo = samplingResult.text.slice(0, 500);
      logger.warn("Parse failed, storing rejection memo", {
        attempt,
        snippetLength: lastRejectionMemo.length,
      });

      if (attempt === MAX_RETRIES) break;
    } catch (err) {
      lastRejectionMemo = `[Sampling error]: ${err instanceof Error ? err.message : String(err)}`;
      logger.error("Attempt failed with exception", {
        attempt,
        error: lastRejectionMemo,
      });
      if (attempt === MAX_RETRIES) {
        throw new McpError(
          ErrorCode.InternalError,
          `Sampling failed after ${MAX_RETRIES + 1} attempts: ${lastRejectionMemo}`
        );
      }
    }
  }

  logger.warn("Returning raw output fallback after all retries");
  return {
    content: [
      {
        type: "text",
        text: `⚠️ Agentic CoT could not be parsed after ${MAX_RETRIES + 1} attempts. Raw LLM output:\n\n${lastRaw || "No output"}`,
      },
    ],
    isError: false,
  };
});

// ------------------------------------------------------------------
// 7. START
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

main().catch((error: unknown) => {
  logger.error("Fatal server error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
