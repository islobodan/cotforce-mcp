/**
 * Simple TTL-based result cache for CoT responses.
 * Caches parsed {reasoning, result} by prompt + optional schema key.
 * Bounded to prevent unbounded memory growth.
 */

export interface CacheEntry {
  reasoning: string;
  result: unknown;
  cachedAt: number;
}

interface CacheItem {
  entry: CacheEntry;
  expiresAt: number;
}

export interface ResultCache {
  get(key: string): CacheEntry | undefined;
  set(key: string, entry: CacheEntry): void;
  size(): number;
  clear(): void;
}

/**
 * Create a TTL-based result cache.
 *
 * @param ttlMs - Time-to-live in milliseconds (default: env CACHE_TTL or 3600000 = 1 hour)
 * @param maxEntries - Maximum number of entries (default: env CACHE_MAX_ENTRIES or 100)
 */
export function createResultCache(
  ttlMs?: number,
  maxEntries?: number
): ResultCache {
  const ttl = ttlMs ?? parseInt(process.env.CACHE_TTL || "3600000", 10);
  const max = maxEntries ?? parseInt(process.env.CACHE_MAX_ENTRIES || "100", 10);
  const store = new Map<string, CacheItem>();

  // Periodic cleanup every ~30s to evict expired entries
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, item] of store) {
      if (now >= item.expiresAt) {
        store.delete(key);
      }
    }
  }, 30_000);
  cleanupInterval.unref();

  return {
    get(key: string): CacheEntry | undefined {
      const item = store.get(key);
      if (!item) return undefined;
      if (Date.now() >= item.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return item.entry;
    },

    set(key: string, entry: CacheEntry): void {
      // Evict oldest entry if at capacity
      if (store.size >= max) {
        let oldestKey: string | undefined;
        let oldestTime = Infinity;
        for (const [k, v] of store) {
          if (v.entry.cachedAt < oldestTime) {
            oldestTime = v.entry.cachedAt;
            oldestKey = k;
          }
        }
        if (oldestKey) store.delete(oldestKey);
      }

      store.set(key, {
        entry,
        expiresAt: Date.now() + ttl,
      });
    },

    size(): number {
      return store.size;
    },

    clear(): void {
      store.clear();
    },
  };
}

/**
 * Build a cache key from the prompt and optional result schema.
 */
export function buildCacheKey(prompt: string, resultSchema?: Record<string, unknown>): string {
  const schemaPart = resultSchema ? JSON.stringify(resultSchema) : "";
  return `${prompt}::${schemaPart}`;
}
