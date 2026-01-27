/**
 * Simple in-memory cache with TTL support
 *
 * Used for caching frequently accessed, rarely changing data like
 * organization settings and plan features.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

// Default TTL: 5 minutes
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Get a value from cache
 */
export function get<T>(key: string): T | undefined {
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (!entry) {
    return undefined;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }

  return entry.value;
}

/**
 * Set a value in cache with optional TTL
 */
export function set<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Delete a value from cache
 */
export function del(key: string): void {
  cache.delete(key);
}

/**
 * Delete all values matching a prefix
 */
export function delByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear the entire cache
 */
export function clear(): void {
  cache.clear();
}

/**
 * Cache key generators for common data
 */
export const cacheKeys = {
  orgSettings: (orgId: string) => `org:${orgId}:settings`,
  orgPlan: (orgId: string) => `org:${orgId}:plan`,
  orgFeatures: (orgId: string) => `org:${orgId}:features`,
};

/**
 * Cache-through helper for async functions
 */
export async function cacheThrough<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const cached = get<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  const value = await fetcher();
  set(key, value, ttlMs);
  return value;
}
