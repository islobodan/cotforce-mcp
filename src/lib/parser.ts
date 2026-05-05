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

  return null;
}
