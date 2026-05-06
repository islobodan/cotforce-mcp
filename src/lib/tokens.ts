import { get_encoding } from "tiktoken";

let encoding: ReturnType<typeof get_encoding> | null = null;

export function getEncodingSafe(): ReturnType<typeof get_encoding> | null {
  if (!encoding) {
    try {
      encoding = get_encoding("cl100k_base");
    } catch {
      return null;
    }
  }
  return encoding;
}

export function resetEncoding(): void {
  encoding = null;
}

export function countTokens(text: string): number {
  const enc = getEncodingSafe();
  if (enc) {
    return enc.encode(text).length;
  }
  return Math.ceil(text.length / 4);
}

export function computeTokenBudget(
  prompt: string,
  systemPrompt: string,
  opts?: { min?: number; max?: number; overhead?: number }
): number {
  const totalInput = systemPrompt + "\n" + prompt;
  const inputTokens = countTokens(totalInput);
  const overhead = opts?.overhead ?? 650;
  const recommended = overhead + inputTokens * 2;
  const min = opts?.min ?? 1024;
  const max = opts?.max ?? 4096;
  return Math.min(max, Math.max(min, recommended));
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
