import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { get_encoding } from "tiktoken";

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
// 2. SCHEMAS & PROMPTS (with few‑shot examples)
// ------------------------------------------------------------------
const AgenticCotSchema = z.object({
  reasoning: z
    .string()
    .min(1, "reasoning must not be empty")
    .describe("Step-by-step internal Chain of Thought."),
  result: z.any().describe("The final answer ONLY."),
});

type AgenticCot = z.infer<typeof AgenticCotSchema>;

const SolveProblemArgsSchema = z.object({
  prompt: z.string().min(1, "prompt must not be empty"),
});

const AGENTIC_SYSTEM_PROMPT = `
You are an advanced reasoning engine. You MUST follow this protocol exactly:

1. **INTERNAL THOUGHT**: Before providing any final answer, you MUST perform a step-by-step Chain of Thought (CoT) process inside the \`reasoning\` field. Do not mix this with the final output.
2. **FINAL OUTPUT**: You MUST output a valid JSON object that matches the provided schema. 
3. **STRICT SEPARATION**: The \`result\` field must ONLY contain the final answer (no explanations, no summaries, just the objective result).

Failure to provide valid JSON or to populate the \`reasoning\` field will result in rejection.

### ✅ Correct Example (DO this)
\`\`\`json
{
  "reasoning": "Step 1: Identify the problem. The user asks for the sum of 5 and 7. Step 2: Add 5 + 7 = 12. Step 3: Confirm that 12 is the final answer.",
  "result": 12
}
\`\`\`

### ❌ Incorrect Example (DO NOT do this)
\`\`\`
The answer is 12 because 5+7=12.
\`\`\`
(No JSON, no explicit reasoning field – this will be rejected.)

### ❌ Also Incorrect (mixing reasoning with result)
\`\`\`json
{
  "reasoning": "",
  "result": "The answer is 12. I calculated 5+7 and got 12."
}
\`\`\`
(The reasoning field is empty, and the result contains explanation – both violations.)

### Schema Constraint (use exactly this structure):
\`\`\`json
{
  "reasoning": "string",
  "result": "any"
}
\`\`\`
`;

const CORRECTION_SUFFIX = `
IMPORTANT: Your previous response did not meet the required format. Reply ONLY with a valid JSON object containing "reasoning" and "result". No markdown formatting, no extra text, no code fences.`;

// ------------------------------------------------------------------
// 3. TOKEN BUDGETING (with tiktoken)
// ------------------------------------------------------------------
let encoding: ReturnType<typeof get_encoding> | null = null;

function getEncodingSafe(): ReturnType<typeof get_encoding> | null {
  if (!encoding) {
    try {
      encoding = get_encoding("cl100k_base");
    } catch (e) {
      logger.warn("tiktoken not available, falling back to character heuristic", {
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }
  return encoding;
}

function countTokens(text: string): number {
  const enc = getEncodingSafe();
  if (enc) {
    return enc.encode(text).length;
  }
  return Math.ceil(text.length / 4);
}

function computeTokenBudget(prompt: string, systemPrompt: string): number {
  const totalInput = systemPrompt + "\n" + prompt;
  const inputTokens = countTokens(totalInput);
  const overhead = 650;
  const recommended = overhead + inputTokens * 2;
  const min = 1024;
  const max = 4096;
  const budget = Math.min(max, Math.max(min, recommended));
  logger.debug("Token budget calculated", { inputTokens, budget });
  return budget;
}

// ------------------------------------------------------------------
// 4. SERVER INITIALIZATION
// ------------------------------------------------------------------
const server = new Server(
  { name: "cotforce-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ------------------------------------------------------------------
// 5. MULTI‑LAYER CHAOS PARSER
// ------------------------------------------------------------------
function extractBalancedJson(text: string): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (start === -1) start = i;
      depth++;
      continue;
    }

    if (char === "}") {
      if (start === -1) continue;
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
      continue;
    }
  }

  return null;
}

function parseCoT(raw: string): AgenticCot | null {
  // Layer 1: Direct JSON (with optional code fence removal)
  const clean = raw.trim().replace(/^```json\s*|\s*```$/g, "");
  try {
    const parsed = JSON.parse(clean);
    const validated = AgenticCotSchema.safeParse(parsed);
    if (validated.success) return validated.data;
  } catch {
    /* ignore */
  }

  // Layer 2: JSON inside full markdown code block
  const blockMatch = raw.match(/```(?:json)?\s*\n?({[\s\S]*?})\n?\s*```/i);
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1]);
      const validated = AgenticCotSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    } catch {
      /* ignore */
    }
  }

  // Layer 3: Heuristic extraction (XML tags, label: lines)
  const reasoningMatch =
    raw.match(/<reasoning>([\s\S]*?)<\/reasoning>/i) ||
    raw.match(/(?:^|\n)\s*Reasoning:\s*([\s\S]*?)(?=\n\s*Result:|$)/i);
  const resultMatch =
    raw.match(/<result>([\s\S]*?)<\/result>/i) ||
    raw.match(/(?:^|\n)\s*Result:\s*([\s\S]*?)$/i);
  if (reasoningMatch && resultMatch) {
    const candidate = {
      reasoning: reasoningMatch[1].trim(),
      result: resultMatch[1].trim(),
    };
    const validated = AgenticCotSchema.safeParse(candidate);
    if (validated.success) return validated.data;
  }

  // Layer 4: Brace-balancing scanner for nested JSON objects
  const jsonCandidate = extractBalancedJson(raw);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      const validated = AgenticCotSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    } catch {
      /* ignore */
    }
  }

  return null;
}

// ------------------------------------------------------------------
// 6. LLM SAMPLING FUNCTION (with retry logic, model env, temp_increment)
// ------------------------------------------------------------------
async function sampleLLM(
  prompt: string,
  rejectionMemo: string | null,
  options?: { temperature?: number; isRetry?: boolean }
): Promise<string> {
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

  const maxTokens = computeTokenBudget(augmentedUserPrompt, systemPrompt);

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
    logger.debug("Sampling response received", { length: fullText.length });
    return fullText;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Sampling failed", { error: message });
    throw new McpError(ErrorCode.InternalError, `Sampling failed: ${message}`);
  }
}

// ------------------------------------------------------------------
// 7. TOOL REGISTRATION
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
// 8. TOOL EXECUTION WITH CHAOS PROTOCOL
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
      const rawOutput = await sampleLLM(prompt, lastRejectionMemo, {
        temperature,
        isRetry,
      });
      lastRaw = rawOutput;

      const parsed = parseCoT(rawOutput);
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

      lastRejectionMemo = rawOutput.slice(0, 500);
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
// 9. START
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
