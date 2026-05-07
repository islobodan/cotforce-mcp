import { z } from "zod";

/**
 * Debug logging for parser — only emits when LOG_LEVEL=DEBUG.
 */
function parserDebug(msg: string, snippet?: string): void {
  if (process.env.LOG_LEVEL?.toUpperCase() === "DEBUG") {
    const snip = snippet ? `: ${snippet.slice(0, 80).replace(/\n/g, " ")}` : "";
    console.error(`[PARSER_DEBUG] ${msg}${snip}`);
  }
}

// ------------------------------------------------------------------
// SCHEMA
// ------------------------------------------------------------------
export const AgenticCotSchema = z.object({
  reasoning: z
    .string()
    .min(1, "reasoning must not be empty")
    .describe("Step-by-step internal Chain of Thought."),
  result: z
    .custom<unknown>((val) => val !== undefined, {
      message: "result must be present (can be any value including null)",
    })
    .describe("The final answer ONLY."),
});

export type AgenticCot = z.infer<typeof AgenticCotSchema>;

// ------------------------------------------------------------------
// PARSER PLUGIN INTERFACE
// ------------------------------------------------------------------
/**
 * A single parser in the pipeline. Parsers are tried in priority order.
 * Lower priority number = runs first. Multiple parsers can share the same
 * priority (e.g., different heuristic strategies).
 */
export interface CotParser {
  /** Unique name for logging and selective filtering. */
  name: string;
  /** Lower priority runs first. Default layers: 10, 20, 30, 40, 50. */
  priority: number;
  /**
   * Attempt to extract {reasoning, result} from raw LLM output.
   * Return null if this parser cannot handle the output.
   */
  parse(raw: string): { reasoning: string; result: unknown } | null;
}

// ------------------------------------------------------------------
// PARSER PIPELINE
// ------------------------------------------------------------------
/**
 * Ordered pipeline of CotParser plugins. Runs each parser in priority order
 * and validates results against AgenticCotSchema. First valid match wins.
 *
 * Usage:
 *   const pipeline = new ParserPipeline([...parsers]);
 *   const result = pipeline.parse(rawText);
 *
 * Custom parsers can be injected via constructor or `addParser()`:
 *   pipeline.addParser(new YamlParser());
 */
export class ParserPipeline {
  private parsers: CotParser[];

  constructor(parsers?: CotParser[]) {
    this.parsers = [];
    if (parsers) {
      for (const p of parsers) {
        this.addParser(p);
      }
    }
  }

  /** Add a parser, maintaining priority-sorted order. */
  addParser(parser: CotParser): void {
    this.parsers.push(parser);
    this.parsers.sort((a, b) => a.priority - b.priority);
  }

  /** Remove a parser by name. Returns true if found and removed. */
  removeParser(name: string): boolean {
    const idx = this.parsers.findIndex((p) => p.name === name);
    if (idx === -1) return false;
    this.parsers.splice(idx, 1);
    return true;
  }

  /** Get current list of parsers (sorted by priority). */
  getParsers(): readonly CotParser[] {
    return this.parsers;
  }

  /** Run all parsers in priority order. Returns first valid match or null. */
  parse(raw: string): AgenticCot | null {
    for (const parser of this.parsers) {
      const result = parser.parse(raw);
      if (result !== null) {
        const validated = AgenticCotSchema.safeParse(result);
        if (validated.success) {
          return validated.data;
        }
        parserDebug(`Parser "${parser.name}" returned invalid data`, JSON.stringify(result).slice(0, 100));
      } else {
        parserDebug(`Parser "${parser.name}" returned null`);
      }
    }
    return null;
  }

  /** Number of registered parsers. */
  get size(): number {
    return this.parsers.length;
  }
}

// ------------------------------------------------------------------
// BUILT-IN PARSER PLUGINS
// ------------------------------------------------------------------

/**
 * Layer 1 (priority 10): Direct JSON — tries to parse the entire output as JSON.
 * Strips optional ```json fences around the text first.
 */
export class DirectJsonParser implements CotParser {
  name = "direct-json";
  priority = 10;

  parse(raw: string): { reasoning: string; result: unknown } | null {
    const clean = raw.trim().replace(/^```json\s*|\s*```$/g, "");
    try {
      const parsed = JSON.parse(clean);
      return parsed;
    } catch {
      return null;
    }
  }
}

/**
 * Layer 2 (priority 20): Fenced block — extracts JSON from markdown code blocks.
 * Matches ```json ... ``` or ``` ... ``` fences.
 */
export class FencedBlockParser implements CotParser {
  name = "fenced-block";
  priority = 20;

  parse(raw: string): { reasoning: string; result: unknown } | null {
    const blockMatch = raw.match(/```(?:json)?\s*\n?({[\s\S]*?})\n?\s*```/i);
    if (!blockMatch) return null;
    try {
      const parsed = JSON.parse(blockMatch[1]);
      return parsed;
    } catch {
      parserDebug("FencedBlockParser: JSON.parse failed", blockMatch[1]);
      return null;
    }
  }
}

/**
 * Layer 3 (priority 30): Heuristic extraction — looks for XML tags
 * (<reasoning>, <result>) or label: lines (Reasoning:, Result:).
 */
export class HeuristicParser implements CotParser {
  name = "heuristic";
  priority = 30;

  parse(raw: string): { reasoning: string; result: unknown } | null {
    const reasoningMatch =
      raw.match(/<reasoning>([\s\S]*?)<\/reasoning>/i) ||
      raw.match(/(?:^|\n)\s*Reasoning:\s*([\s\S]*?)(?=\n\s*Result:|$)/i);
    const resultMatch =
      raw.match(/<result>([\s\S]*?)<\/result>/i) ||
      raw.match(/(?:^|\n)\s*Result:\s*([\s\S]*?)$/i);
    if (reasoningMatch && resultMatch) {
      return {
        reasoning: reasoningMatch[1].trim(),
        result: resultMatch[1].trim(),
      };
    }
    return null;
  }
}

/**
 * Layer 4 (priority 40): Brace-balanced JSON scanner.
 * Finds the first balanced {} object in arbitrary text.
 */
export class BraceBalancedParser implements CotParser {
  name = "brace-balanced";
  priority = 40;

  parse(raw: string): { reasoning: string; result: unknown } | null {
    const jsonCandidate = extractBalancedJson(raw);
    if (!jsonCandidate) return null;
    try {
      const parsed = JSON.parse(jsonCandidate);
      return parsed;
    } catch {
      parserDebug("BraceBalancedParser: JSON.parse failed", jsonCandidate);
      return null;
    }
  }
}

/**
 * Layer 5 (priority 50): Truncated JSON recovery.
 * Salvages reasoning from responses cut off by token limits.
 */
export class TruncatedJsonParser implements CotParser {
  name = "truncated-recovery";
  priority = 50;

  parse(raw: string): { reasoning: string; result: unknown } | null {
    return recoverTruncatedJson(raw);
  }
}

// ------------------------------------------------------------------
// DEFAULT PIPELINE
// ------------------------------------------------------------------
/**
 * The default parser pipeline with all built-in parsers.
 * Order: direct-json → fenced-block → heuristic → brace-balanced → truncated-recovery
 */
export function defaultParserPipeline(): ParserPipeline {
  const pipeline = new ParserPipeline();
  pipeline.addParser(new DirectJsonParser());
  pipeline.addParser(new FencedBlockParser());
  pipeline.addParser(new HeuristicParser());
  pipeline.addParser(new BraceBalancedParser());
  pipeline.addParser(new TruncatedJsonParser());

  // Apply COT_PARSERS env var filter if set (comma-separated list of parser names)
  const filter = process.env.COT_PARSERS;
  if (filter) {
    const allowed = new Set(filter.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
    if (allowed.size > 0) {
      for (const p of pipeline.getParsers()) {
        if (!allowed.has(p.name)) {
          pipeline.removeParser(p.name);
        }
      }
    }
  }

  return pipeline;
}

/** Singleton default pipeline. */
const _defaultPipeline = defaultParserPipeline();

// ------------------------------------------------------------------
// BACKWARD-COMPATIBLE API
// ------------------------------------------------------------------
/**
 * Parse raw LLM output using the default parser pipeline.
 * Equivalent to `defaultPipeline().parse(raw)`.
 */
export function parseCoT(raw: string): AgenticCot | null {
  return _defaultPipeline.parse(raw);
}

// ------------------------------------------------------------------
// SHARED HELPERS (used by multiple parsers)
// ------------------------------------------------------------------

/**
 * Extract a balanced JSON object from raw text using brace counting.
 * Properly handles nested objects and escaped strings.
 */
export function extractBalancedJson(text: string): string | null {
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

/**
 * Attempt to recover a valid CoT object from truncated JSON.
 * Handles cases where the LLM ran out of tokens mid-response.
 */
function recoverTruncatedJson(raw: string): { reasoning: string; result: unknown } | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;

  const json = raw.slice(start).trimEnd();

  // Only recover if JSON is actually truncated (unbalanced braces)
  if (json.endsWith("}")) return null;

  const reasoningMatch = json.match(/"reasoning"\s*:\s*"/i);
  if (!reasoningMatch) return null;

  const reasoningStart = json.indexOf(reasoningMatch[0]) + reasoningMatch[0].length;

  // Find where the reasoning string value ends (unescaped closing quote)
  let reasoningEnd = -1;
  let escape = false;
  for (let i = reasoningStart; i < json.length; i++) {
    const char = json[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      reasoningEnd = i;
      break;
    }
  }

  if (reasoningEnd === -1) {
    const reasoning = json.slice(reasoningStart);
    if (reasoning.length < 10) return null;
    return {
      reasoning: reasoning
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim() + "\n[Response truncated]",
      result: null,
    };
  }

  const reasoning = json.slice(reasoningStart, reasoningEnd);

  // Check if there's a result field after reasoning
  const afterReasoning = json.slice(reasoningEnd + 1);
  const resultFieldMatch = afterReasoning.match(/,\s*"result"\s*:\s*/i);

  if (resultFieldMatch) {
    const resultValueStart = reasoningEnd + 1 + afterReasoning.indexOf(resultFieldMatch[0]) + resultFieldMatch[0].length;
    const resultRaw = json.slice(resultValueStart).trim();

    if (resultRaw.startsWith('"')) {
      const closeQuote = findClosingQuote(resultRaw);
      if (closeQuote !== -1) {
        return { reasoning, result: resultRaw.slice(1, closeQuote) };
      }
      return { reasoning, result: resultRaw.slice(1).replace(/"$/, "") };
    }

    if (resultRaw.startsWith("{") || resultRaw.startsWith("[")) {
      const balanced = extractBalancedJson(resultRaw);
      if (balanced) {
        try {
          return { reasoning, result: JSON.parse(balanced) };
        } catch {
          /* ignore */
        }
      }
      return { reasoning, result: null };
    }

    const simpleMatch = resultRaw.match(/^([0-9]+(?:\.[0-9]+)?|true|false|null)/);
    if (simpleMatch) {
      try {
        return { reasoning, result: JSON.parse(simpleMatch[1]) };
      } catch {
        /* ignore */
      }
    }
  }

  return { reasoning, result: null };
}

function findClosingQuote(s: string): number {
  let escape = false;
  for (let i = 1; i < s.length; i++) {
    if (escape) {
      escape = false;
      continue;
    }
    if (s[i] === "\\") {
      escape = true;
      continue;
    }
    if (s[i] === '"') return i;
  }
  return -1;
}
