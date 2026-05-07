/**
 * Lazy-initialize tiktoken encoding. WASM (~2MB) only loaded on first call to countTokens().
 * Most paths use estimateTokens() or API usage data, so this rarely fires.
 */
let encoding: ReturnType<typeof import("tiktoken")["get_encoding"]> | null = null;
let encodingPromise: Promise<ReturnType<typeof import("tiktoken")["get_encoding"]> | null> | null = null;

export async function getEncodingSafe(): Promise<ReturnType<typeof import("tiktoken")["get_encoding"]> | null> {
  if (encoding) return encoding;
  if (encodingPromise) return encodingPromise;
  encodingPromise = (async () => {
    try {
      const { get_encoding } = await import("tiktoken");
      encoding = get_encoding("cl100k_base");
      return encoding;
    } catch {
      return null;
    }
  })();
  return encodingPromise;
}

export function resetEncoding(): void {
  encoding = null;
  encodingPromise = null;
}

/**
 * Lightweight token estimate without tiktoken.
 * ~1 token per 4 chars for English text. Good enough for budget math.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Exact token count using tiktoken (cl100k_base). Falls back to estimate.
 * tiktoken WASM is lazy-loaded on first call.
 */
export async function countTokens(text: string): Promise<number> {
  const enc = await getEncodingSafe();
  if (enc) {
    return enc.encode(text).length;
  }
  return estimateTokens(text);
}

export interface TokenBudget {
  budget: number;
  inputTokens: number;
}

export function computeTokenBudget(
  prompt: string,
  systemPrompt: string,
  opts?: { min?: number; max?: number; overhead?: number }
): TokenBudget {
  const fullInput = systemPrompt + "\n" + prompt;
  const inputTokens = estimateTokens(fullInput);
  const overhead = opts?.overhead ?? parseInt(process.env.REASONING_OVERHEAD || "800", 10);
  const recommended = overhead + inputTokens * 4;
  const min = opts?.min ?? 4096;
  const max = opts?.max ?? 8192;
  return {
    budget: Math.min(max, Math.max(min, recommended)),
    inputTokens,
  };
}

/**
 * Check if an LLM output appears truncated based on its token count vs budget.
 * Returns true if output consumed >= threshold * budget.
 */
export function isTruncated(
  outputTokens: number,
  budget: number,
  threshold = parseFloat(process.env.TRUNCATION_THRESHOLD || "0.95")
): boolean {
  if (budget <= 0) return false;
  return outputTokens / budget >= threshold;
}
