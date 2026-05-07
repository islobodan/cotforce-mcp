/**
 * Multi-session rejection memory.
 * Tracks failure patterns across requests to inject preemptive hints,
 * avoiding repeated retries on the same mistake.
 */

// ------------------------------------------------------------------
// PATTERN DEFINITIONS
// ------------------------------------------------------------------

export type FailurePattern =
  | "markdown-fences"     // JSON wrapped in ```json...``` code blocks
  | "preamble"            // Text before the JSON (e.g. "Here is the answer:")
  | "no-reasoning"        // reasoning field missing or empty
  | "result-explanation"  // explanation leaked into result field
  | "no-json"             // No JSON found at all
  | "truncated"           // Response hit token limit
  | "schema-mismatch"     // result didn't match user-supplied schema
  | "unknown";            // Catch-all

export interface FailureRecord {
  pattern: FailurePattern;
  /** When the failure occurred (epoch ms) */
  timestamp: number;
  /** Snippet of the failed response for context */
  snippet: string;
}

// ------------------------------------------------------------------
// PATTERN DETECTION
// ------------------------------------------------------------------

/** Detect failure patterns from raw LLM output and error context. */
export function detectPattern(
  raw: string,
  context?: { truncated?: boolean; schemaError?: string; parseError?: string }
): FailurePattern {
  if (context?.truncated) return "truncated";
  if (context?.schemaError) return "schema-mismatch";
  if (context?.parseError?.includes("markdown") || context?.parseError?.includes("code")) return "markdown-fences";

  // Check for markdown code fences
  if (/```(?:json)?\s*\n/.test(raw)) return "markdown-fences";

  // Check for preamble: any word characters before the first {
  const firstBrace = raw.indexOf("{");
  if (firstBrace > 0 && /[a-zA-Z]/.test(raw.slice(0, firstBrace))) return "preamble";

  // Check for no JSON at all
  if (!raw.includes("{") && !raw.includes("[") && !raw.includes("```")) return "no-json";

  // Check for explanation in result field
  if (/result[\s\S]{0,40}(answer|explanation|step|reason)/i.test(raw)) return "result-explanation";

  // Check for empty reasoning
  if(/"reasoning"\s*:\s*""/.test(raw)) return "no-reasoning";

  return "unknown";
}

// ------------------------------------------------------------------
// HINT MESSAGES
// ------------------------------------------------------------------

const HINTS: Record<FailurePattern, string> = {
  "markdown-fences": "Do NOT wrap the JSON in markdown code fences (no ```json). Output raw JSON only.",
  preamble: "Do NOT add any text before or after the JSON object. Output ONLY the JSON object.",
  "no-reasoning": 'The "reasoning" field must contain your step-by-step thought process. It cannot be empty.',
  "result-explanation": 'The "result" field must contain ONLY the final answer. No explanations, no reasoning, no extra text.',
  "no-json": "You MUST output a valid JSON object with 'reasoning' and 'result' fields. No plain text responses.",
  truncated: "Be more concise in your reasoning. Skip repetitive analysis and go straight to the key deductions.",
  "schema-mismatch": "The result value must match the expected schema type. Check that the result field has the correct structure.",
  unknown: "Your response did not meet the required format. Output ONLY a JSON object with 'reasoning' and 'result' fields.",
};

export function getHint(pattern: FailurePattern): string {
  return HINTS[pattern] || HINTS.unknown;
}

// ------------------------------------------------------------------
// SLIDING WINDOW MEMORY
// ------------------------------------------------------------------

export interface RejectionMemory {
  /** Record a failure pattern. */
  record(record: FailureRecord): void;
  /** Get the most frequent pattern in the current window. */
  mostFrequent(): FailurePattern | null;
  /** Get patterns that have occurred more than once. */
  recurringPatterns(): Array<{ pattern: FailurePattern; count: number }>;
  /** Check if a pattern is known and recurring (2+ occurrences). */
  isKnown(pattern: FailurePattern): boolean;
  /** Build a preemptive hint string for the most common recurring pattern. */
  buildPreemptiveHint(): string | null;
  /** Clear all memory. */
  reset(): void;
  /** Current window (for debugging). */
  getWindow(): FailureRecord[];
}

/**
 * Create a sliding window rejection memory.
 *
 * @param maxSize - Max failures to keep in the window (default 10)
 * @param ttlMs - How long a failure stays in memory (default 30 minutes)
 */
export function createRejectionMemory(
  maxSize = 10,
  ttlMs = 30 * 60 * 1000
): RejectionMemory {
  const window: FailureRecord[] = [];

  /** Prune expired and overflow entries. */
  function prune(): void {
    const now = Date.now();
    // Remove expired
    let i = 0;
    while (i < window.length) {
      if (now - window[i].timestamp > ttlMs) {
        window.splice(i, 1);
      } else {
        i++;
      }
    }
    // Remove oldest if over maxSize
    while (window.length > maxSize) {
      window.shift();
    }
  }

  return {
    record(record: FailureRecord): void {
      window.push(record);
      prune();
    },

    mostFrequent(): FailurePattern | null {
      prune();
      if (window.length === 0) return null;
      const counts = new Map<FailurePattern, number>();
      for (const r of window) {
        counts.set(r.pattern, (counts.get(r.pattern) || 0) + 1);
      }
      let best: FailurePattern | null = null;
      let bestCount = 0;
      for (const [pattern, count] of counts) {
        if (count > bestCount) {
          bestCount = count;
          best = pattern;
        }
      }
      return bestCount >= 2 ? best : null;
    },

    recurringPatterns(): Array<{ pattern: FailurePattern; count: number }> {
      prune();
      const counts = new Map<FailurePattern, number>();
      for (const r of window) {
        counts.set(r.pattern, (counts.get(r.pattern) || 0) + 1);
      }
      return Array.from(counts.entries())
        .filter(([_, c]) => c >= 2)
        .map(([pattern, count]) => ({ pattern, count }))
        .sort((a, b) => b.count - a.count);
    },

    isKnown(pattern: FailurePattern): boolean {
      prune();
      let count = 0;
      for (const r of window) {
        if (r.pattern === pattern) count++;
      }
      return count >= 2;
    },

    buildPreemptiveHint(): string | null {
      const pattern = this.mostFrequent();
      if (!pattern) return null;
      const occurrences = window.filter((r) => r.pattern === pattern).length;
      return `[SESSION MEMORY] In the last ${window.length} request(s), this model repeatedly produced the following issue:\n` +
        `${occurrences}x: ${getHint(pattern)}\n\n` +
        `Please ensure your response avoids this issue. If you do not, your response will be rejected.`;
    },

    reset(): void {
      window.length = 0;
    },

    getWindow(): FailureRecord[] {
      return [...window];
    },
  };
}
