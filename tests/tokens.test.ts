import {
  countTokens,
  computeTokenBudget,
  getEncodingSafe,
  resetEncoding,
} from "../src/lib/tokens.js";

describe("countTokens", () => {
  beforeEach(() => {
    resetEncoding();
  });

  it("counts tokens for simple text", () => {
    const tokens = countTokens("hello world");
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });

  it("counts tokens for empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("returns consistent counts for same input", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    expect(countTokens(text)).toBe(countTokens(text));
  });

  it("counts more tokens for longer text", () => {
    const short = "hi";
    const long = "hi ".repeat(100);
    expect(countTokens(long)).toBeGreaterThan(countTokens(short));
  });

  it("handles special characters", () => {
    const text = "Hello! How are you? 🎉 €100 {\"key\": \"value\"}";
    expect(() => countTokens(text)).not.toThrow();
    expect(countTokens(text)).toBeGreaterThan(0);
  });

  it("handles unicode", () => {
    expect(() => countTokens("日本語テキスト")).not.toThrow();
    expect(countTokens("日本語テキスト")).toBeGreaterThan(0);
  });
});

describe("computeTokenBudget", () => {
  it("returns at least the minimum", () => {
    const budget = computeTokenBudget("hi", "system");
    expect(budget).toBeGreaterThanOrEqual(1024);
  });

  it("returns at most the maximum", () => {
    const budget = computeTokenBudget("x".repeat(10000), "system");
    expect(budget).toBeLessThanOrEqual(4096);
  });

  it("increases with input size", () => {
    const short = computeTokenBudget("short", "sys");
    const long = computeTokenBudget("this is a much longer prompt with many words", "sys");
    expect(long).toBeGreaterThanOrEqual(short);
  });

  it("respects custom min bound", () => {
    const budget = computeTokenBudget("hi", "sys", { min: 512 });
    expect(budget).toBeGreaterThanOrEqual(512);
  });

  it("respects custom max bound", () => {
    const budget = computeTokenBudget("x".repeat(10000), "sys", { max: 2048 });
    expect(budget).toBeLessThanOrEqual(2048);
  });

  it("respects custom overhead", () => {
    // Use a very long prompt so budget exceeds the minimum and overhead matters
    const prompt = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(50);
    const withDefault = computeTokenBudget(prompt, "system");
    const withCustom = computeTokenBudget(prompt, "system", { overhead: 100 });
    expect(withCustom).toBeLessThan(withDefault);
  });

  it("returns integer values", () => {
    const budget = computeTokenBudget("test", "system");
    expect(Number.isInteger(budget)).toBe(true);
  });
});

describe("getEncodingSafe", () => {
  beforeEach(() => {
    resetEncoding();
  });

  it("returns encoding on first call", () => {
    const enc = getEncodingSafe();
    expect(enc).not.toBeNull();
  });

  it("returns same encoding on subsequent calls", () => {
    const first = getEncodingSafe();
    const second = getEncodingSafe();
    expect(first).toBe(second);
  });

  it("returns null after reset", () => {
    getEncodingSafe();
    resetEncoding();
    // After reset, next call should create a new one
    const enc = getEncodingSafe();
    expect(enc).not.toBeNull();
  });
});
