import crypto from 'node:crypto';

export interface CompactTranscriptSegment {
  start_seconds: number;
  end_seconds: number;
  text: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 90 * 1000;
const MAX_CACHE_ENTRIES = 200;

const responseCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

const pruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of responseCache.entries()) {
    if (now >= entry.expiresAt) {
      responseCache.delete(key);
    }
  }
}, 60 * 1000);
pruneTimer.unref();

/**
 * Computes a deterministic SHA-256 cache key scoped to client identity + route + payload.
 */
export function buildRequestDedupKey(
  clientKey: string,
  route: string,
  payload: unknown,
): string {
  const digest = crypto
    .createHash('sha256')
    .update(route)
    .update('|')
    .update(clientKey)
    .update('|')
    .update(JSON.stringify(payload))
    .digest('hex');
  return `${route}:${digest}`;
}

/**
 * Coalesces identical concurrent requests and serves short-lived exact repeats from cache
 * so accidental double-clicks or retries never double-spend Gemini tokens or user credits.
 */
export async function withRequestDedup<T>(
  key: string,
  producer: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<{ data: T; deduplicated: boolean }> {
  const now = Date.now();
  const cached = responseCache.get(key) as CacheEntry<T> | undefined;
  if (cached && now < cached.expiresAt) {
    return { data: cached.value, deduplicated: true };
  }
  if (cached) {
    responseCache.delete(key);
  }

  const inFlight = inFlightRequests.get(key) as Promise<T> | undefined;
  if (inFlight) {
    const data = await inFlight;
    return { data, deduplicated: true };
  }

  const work = producer()
    .then((result) => {
      if (responseCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = responseCache.keys().next().value;
        if (oldestKey) responseCache.delete(oldestKey);
      }
      responseCache.set(key, {
        value: result,
        expiresAt: Date.now() + ttlMs,
      });
      return result;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, work);
  const data = await work;
  return { data, deduplicated: false };
}

/**
 * Formats transcript segments into compact `[start-end] text` lines (~65% fewer tokens than JSON)
 * wrapped in untrusted data delimiters.
 */
export function formatCompactTranscriptBlock(
  segments: CompactTranscriptSegment[],
  maxSegments = 1200,
): string {
  const lines = segments.slice(0, maxSegments).map((seg) => {
    const start = Number(seg.start_seconds).toFixed(1);
    const end = Number(seg.end_seconds).toFixed(1);
    const cleanText = String(seg.text || '').replace(/<\/?TRANSCRIPT_DATA>/gi, '').replace(/\s+/g, ' ').trim();
    return `[${start}-${end}] ${cleanText}`;
  });
  return `<TRANSCRIPT_DATA>\n${lines.join('\n')}\n</TRANSCRIPT_DATA>`;
}
