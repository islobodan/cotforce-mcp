import { detectPattern, createRejectionMemory } from "../src/lib/rejection-memory.js";

describe("detectPattern", () => {
  it("detects markdown fences", () => {
    expect(detectPattern('```json\n{"reasoning": "test", "result": 1}\n```')).toBe("markdown-fences");
  });

  it("detects preamble", () => {
    expect(detectPattern('Here is my answer:\n{"reasoning": "test", "result": 1}')).toBe("preamble");
  });

  it("detects no JSON", () => {
    expect(detectPattern("I think the answer is 42.")).toBe("no-json");
  });

  it("detects truncated via context", () => {
    expect(detectPattern("some text", { truncated: true })).toBe("truncated");
  });

  it("detects schema mismatch via context", () => {
    expect(detectPattern("some text", { schemaError: "missing key" })).toBe("schema-mismatch");
  });

  it("detects result explanation", () => {
    expect(detectPattern('{"reasoning": "r", "result": "the answer is 42"}')).toBe("result-explanation");
  });

  it("detects empty reasoning", () => {
    expect(detectPattern('{"reasoning": "", "result": 1}')).toBe("no-reasoning");
  });

  it("falls back to unknown", () => {
    expect(detectPattern('{"reasoning": "r", "result": 1}')).toBe("unknown");
  });
});

describe("createRejectionMemory", () => {
  it("records and retrieves patterns", () => {
    const mem = createRejectionMemory();
    mem.record({ pattern: "markdown-fences", timestamp: Date.now(), snippet: "```json" });
    expect(mem.getWindow()).toHaveLength(1);
  });

  it("returns null when all patterns have only 1 occurrence", () => {
    const mem = createRejectionMemory();
    mem.record({ pattern: "markdown-fences", timestamp: Date.now(), snippet: "a" });
    mem.record({ pattern: "preamble", timestamp: Date.now(), snippet: "b" });
    expect(mem.mostFrequent()).toBeNull();
  });

  it("returns pattern when >= 2 occurrences", () => {
    const mem = createRejectionMemory();
    mem.record({ pattern: "markdown-fences", timestamp: Date.now(), snippet: "a" });
    mem.record({ pattern: "preamble", timestamp: Date.now(), snippet: "b" });
    mem.record({ pattern: "markdown-fences", timestamp: Date.now(), snippet: "c" });
    expect(mem.mostFrequent()).toBe("markdown-fences");
  });

  it("evicts oldest when over maxSize", () => {
    const mem = createRejectionMemory(3, 60_000);
    const now = Date.now();
    mem.record({ pattern: "a", timestamp: now - 100, snippet: "1" });
    mem.record({ pattern: "b", timestamp: now - 50, snippet: "2" });
    mem.record({ pattern: "c", timestamp: now, snippet: "3" });
    mem.record({ pattern: "d", timestamp: now + 50, snippet: "4" });
    expect(mem.getWindow()).toHaveLength(3);
    expect(mem.getWindow()[0].pattern).toBe("b"); // "a" was evicted
  });

  it("builds preemptive hint when pattern is recurring", () => {
    const mem = createRejectionMemory(10, 60_000);
    const now = Date.now();
    mem.record({ pattern: "markdown-fences", timestamp: now - 100, snippet: "1" });
    mem.record({ pattern: "markdown-fences", timestamp: now, snippet: "2" });

    const hint = mem.buildPreemptiveHint();
    expect(hint).not.toBeNull();
    expect(hint).toContain("SESSION MEMORY");
    expect(hint).toContain("code fences");
  });

  it("returns null hint when no pattern is recurring", () => {
    const mem = createRejectionMemory();
    expect(mem.buildPreemptiveHint()).toBeNull();

    mem.record({ pattern: "markdown-fences", timestamp: Date.now(), snippet: "a" });
    expect(mem.buildPreemptiveHint()).toBeNull(); // only 1 occurrence
  });

  it("reset clears all", () => {
    const mem = createRejectionMemory();
    mem.record({ pattern: "no-json", timestamp: Date.now(), snippet: "text" });
    mem.reset();
    expect(mem.getWindow()).toHaveLength(0);
    expect(mem.mostFrequent()).toBeNull();
  });

  it("expires records after TTL", async () => {
    const mem = createRejectionMemory(10, 10); // 10ms TTL
    mem.record({ pattern: "markdown-fences", timestamp: Date.now(), snippet: "a" });
    mem.record({ pattern: "markdown-fences", timestamp: Date.now(), snippet: "b" });
    expect(mem.buildPreemptiveHint()).not.toBeNull();

    await new Promise((r) => setTimeout(r, 20));

    expect(mem.mostFrequent()).toBeNull();
  });
});
