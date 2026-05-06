import { z } from "zod";

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
 * Handles cases where the LLM ran out of tokens mid-response:
 *   {"reasoning": "...incomplete text
 *   {"reasoning": "...complete", "result": 
 *   {"reasoning": "...complete", "result": {incomplete
 */
function recoverTruncatedJson(raw: string): { reasoning: string; result: unknown } | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;

  const json = raw.slice(start).trimEnd();

  // Only recover if JSON is actually truncated (unbalanced braces)
  // If the JSON has a proper closing brace, it's not truncated — other layers handle it
  if (json.endsWith("}")) return null;

  // Try to extract the reasoning string value
  const reasoningMatch = json.match(
    /"reasoning"\s*:\s*"/i
  );
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
    // Reasoning string itself was truncated — take everything and close it
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
  const resultFieldMatch = afterReasoning.match(
    /,\s*"result"\s*:\s*/i
  );

  if (resultFieldMatch) {
    const resultValueStart = reasoningEnd + 1 + afterReasoning.indexOf(resultFieldMatch[0]) + resultFieldMatch[0].length;
    const resultRaw = json.slice(resultValueStart).trim();

    // Try to parse whatever result value we have
    if (resultRaw.startsWith('"')) {
      // String result — find closing quote or truncate
      const closeQuote = findClosingQuote(resultRaw);
      if (closeQuote !== -1) {
        const val = resultRaw.slice(1, closeQuote);
        return { reasoning, result: val };
      }
      // Truncated string
      return { reasoning, result: resultRaw.slice(1).replace(/"$/, "") };
    }

    if (resultRaw.startsWith("{") || resultRaw.startsWith("[")) {
      // Object/array result — try to parse, or fall back to null
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

    // Number, boolean, null
    const simpleMatch = resultRaw.match(/^([0-9]+(?:\.[0-9]+)?|true|false|null)/);
    if (simpleMatch) {
      try {
        return { reasoning, result: JSON.parse(simpleMatch[1]) };
      } catch {
        /* ignore */
      }
    }
  }

  // Only reasoning was present, no result field
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

/**
 * Multi-layer parser for extracting Chain-of-Thought from chaotic LLM outputs.
 * Four fallback layers: direct JSON, fenced blocks, XML/label heuristics, brace balancing.
 */
export function parseCoT(raw: string): AgenticCot | null {
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

  // Layer 5: Truncated JSON recovery
  // If the LLM ran out of tokens mid-JSON, try to salvage the reasoning
  const recovered = recoverTruncatedJson(raw);
  if (recovered) {
    const validated = AgenticCotSchema.safeParse(recovered);
    if (validated.success) return validated.data;
  }

  return null;
}
