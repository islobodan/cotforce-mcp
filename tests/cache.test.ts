import { createResultCache, buildCacheKey } from "../src/lib/cache.js";

describe("createResultCache", () => {
  describe("set and get", () => {
    it("stores and retrieves entries", () => {
      const cache = createResultCache(60_000, 10);
      cache.set("key1", { reasoning: "step by step", result: 42, cachedAt: Date.now() });
      const entry = cache.get("key1");
      expect(entry).toBeDefined();
      expect(entry!.reasoning).toBe("step by step");
      expect(entry!.result).toBe(42);
    });

    it("returns undefined for missing key", () => {
      const cache = createResultCache(60_000, 10);
      expect(cache.get("nonexistent")).toBeUndefined();
    });
  });

  describe("TTL expiry", () => {
    it("expires entries after TTL", async () => {
      const cache = createResultCache(10, 100); // 10ms TTL
      cache.set("key1", { reasoning: "r", result: 1, cachedAt: Date.now() });

      // Should be available immediately
      expect(cache.get("key1")).toBeDefined();

      // Wait for expiry
      await new Promise((r) => setTimeout(r, 20));

      expect(cache.get("key1")).toBeUndefined();
    });
  });

  describe("max entries", () => {
    it("evicts oldest entry when at capacity", () => {
      const cache = createResultCache(60_000, 3); // max 3 entries
      cache.set("a", { reasoning: "a", result: 1, cachedAt: 100 });
      cache.set("b", { reasoning: "b", result: 2, cachedAt: 200 });
      cache.set("c", { reasoning: "c", result: 3, cachedAt: 300 });
      cache.set("d", { reasoning: "d", result: 4, cachedAt: 400 }); // should evict "a"

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeDefined();
      expect(cache.get("c")).toBeDefined();
      expect(cache.get("d")).toBeDefined();
      expect(cache.size()).toBe(3);
    });
  });

  describe("cache size and clear", () => {
    it("reports correct size", () => {
      const cache = createResultCache(60_000, 10);
      expect(cache.size()).toBe(0);
      cache.set("a", { reasoning: "r", result: 1, cachedAt: Date.now() });
      expect(cache.size()).toBe(1);
      cache.set("b", { reasoning: "r", result: 2, cachedAt: Date.now() });
      expect(cache.size()).toBe(2);
    });

    it("clears all entries", () => {
      const cache = createResultCache(60_000, 10);
      cache.set("a", { reasoning: "r", result: 1, cachedAt: Date.now() });
      cache.set("b", { reasoning: "r", result: 2, cachedAt: Date.now() });
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get("a")).toBeUndefined();
    });
  });

  describe("buildCacheKey", () => {
    it("builds key from prompt only", () => {
      const key = buildCacheKey("What is 2+2?");
      expect(key).toBe("What is 2+2?::");
    });

    it("includes resultSchema in key", () => {
      const key = buildCacheKey("What is 2+2?", { answer: "number" });
      expect(key).toContain("What is 2+2?");
      expect(key).toContain('{"answer":"number"}');
    });

    it("produces different keys for different schemas", () => {
      const k1 = buildCacheKey("test", { a: "string" });
      const k2 = buildCacheKey("test", { a: "number" });
      expect(k1).not.toBe(k2);
    });

    it("produces same key for same input", () => {
      const k1 = buildCacheKey("same prompt", { x: "number" });
      const k2 = buildCacheKey("same prompt", { x: "number" });
      expect(k1).toBe(k2);
    });
  });
});
