import {
  countTokens,
  computeTokenBudget,
  estimateTokens,
  getEncodingSafe,
  resetEncoding,
} from "../src/lib/tokens.js";

describe("countTokens", () => {
  beforeEach(() => {
    resetEncoding();
  });

  it("counts tokens for simple text", async () => {
    const tokens = await countTokens("hello world");
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });

  it("counts tokens for empty string", async () => {
    expect(await countTokens("")).toBe(0);
  });

  it("returns consistent counts for same input", async () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    const first = await countTokens(text);
    const second = await countTokens(text);
    expect(first).toBe(second);
  });

  it("counts more tokens for longer text", async () => {
    const short = "hi";
    const long = "hi ".repeat(100);
    const shortTokens = await countTokens(short);
    const longTokens = await countTokens(long);
    expect(longTokens).toBeGreaterThan(shortTokens);
  });

  it("handles special characters", async () => {
    const text = "Hello! How are you? 🎉 €100 {\"key\": \"value\"}";
    await expect(countTokens(text)).resolves.toBeGreaterThan(0);
  });

  it("handles unicode", async () => {
    await expect(countTokens("日本語テキスト")).resolves.toBeGreaterThan(0);
  });
});

describe("computeTokenBudget", () => {
  it("returns at least the minimum budget", () => {
    const { budget } = computeTokenBudget("hi", "system");
    expect(budget).toBeGreaterThanOrEqual(4096);
  });

  it("returns at most the maximum budget", () => {
    const { budget } = computeTokenBudget("x".repeat(10000), "system");
    expect(budget).toBeLessThanOrEqual(8192);
  });

  it("increases budget with input size", () => {
    const { budget: short } = computeTokenBudget("short", "sys");
    const { budget: long } = computeTokenBudget("this is a much longer prompt with many words", "sys");
    expect(long).toBeGreaterThanOrEqual(short);
  });

  it("respects custom min bound", () => {
    const { budget } = computeTokenBudget("hi", "sys", { min: 512 });
    expect(budget).toBeGreaterThanOrEqual(512);
  });

  it("respects custom max bound", () => {
    const { budget } = computeTokenBudget("x".repeat(10000), "sys", { max: 2048 });
    expect(budget).toBeLessThanOrEqual(2048);
  });

  it("respects custom overhead", () => {
    // Use a long enough prompt that budget exceeds the minimum (4096)
    const prompt = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(100);
    const { budget: withDefault } = computeTokenBudget(prompt, "system");
    const { budget: withCustom } = computeTokenBudget(prompt, "system", { overhead: 100 });
    expect(withCustom).toBeLessThan(withDefault);
  });

  it("returns integer budget", () => {
    const { budget } = computeTokenBudget("test", "system");
    expect(Number.isInteger(budget)).toBe(true);
  });

  it("respects REASONING_OVERHEAD env var", () => {
    const original = process.env.REASONING_OVERHEAD;
    process.env.REASONING_OVERHEAD = "1000";
    const prompt = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(50);
    const { budget: withHighOverhead } = computeTokenBudget(prompt, "system");
    delete process.env.REASONING_OVERHEAD;
    const { budget: withDefault } = computeTokenBudget(prompt, "system");
    if (original !== undefined) process.env.REASONING_OVERHEAD = original;
    expect(withHighOverhead).toBeGreaterThan(withDefault);
  });

  it("returns inputTokens estimate", () => {
    const { inputTokens } = computeTokenBudget("hello world", "system prompt");
    expect(inputTokens).toBeGreaterThan(0);
    expect(Number.isInteger(inputTokens)).toBe(true);
  });

  it("inputTokens avoids double-counting", () => {
    const text = "system prompt\nuser prompt here";
    const { inputTokens } = computeTokenBudget("user prompt here", "system prompt");
    expect(inputTokens).toBe(estimateTokens(text));
  });
});

describe("estimateTokens", () => {
  it("estimates tokens for simple text", () => {
    const tokens = estimateTokens("hello world");
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("is consistent with itself", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    expect(estimateTokens(text)).toBe(estimateTokens(text));
  });

  it("is roughly proportional to length", () => {
    const short = "hi";
    const long = "hi ".repeat(100);
    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });
});

describe("getEncodingSafe", () => {
  beforeEach(() => {
    resetEncoding();
  });

  it("returns encoding on first call", async () => {
    const enc = await getEncodingSafe();
    expect(enc).not.toBeNull();
  });

  it("returns same encoding on subsequent calls", async () => {
    const first = await getEncodingSafe();
    const second = await getEncodingSafe();
    expect(first).toBe(second);
  });

  it("returns null after reset", async () => {
    await getEncodingSafe();
    resetEncoding();
    // After reset, next call should create a new one
    const enc = await getEncodingSafe();
    expect(enc).not.toBeNull();
  });
});
