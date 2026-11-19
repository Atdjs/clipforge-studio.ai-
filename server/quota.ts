/**
 * Server-side per-IP / client credit quota tracker for Gemini AI proxy endpoints.
 * Enforces daily limits strictly on the backend so credits cannot be bypassed in client code.
 */

export const DAILY_CREDIT_LIMIT = 40;
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

export const AI_CREDIT_COSTS = {
  transcribe: 2,
  findMoments: 3,
  analyze: 3,
  generateMetadata: 1,
  translate: 1,
  scoreClip: 1,
} as const;

interface CreditBucket {
  used: number;
  resetAt: number;
}

const buckets = new Map<string, CreditBucket>();

function getBucket(clientKey: string): CreditBucket {
  const now = Date.now();
  const existing = buckets.get(clientKey);
  if (!existing || now >= existing.resetAt) {
    const fresh: CreditBucket = {
      used: 0,
      resetAt: now + QUOTA_WINDOW_MS,
    };
    buckets.set(clientKey, fresh);
    return fresh;
  }
  return existing;
}

export function getCreditStatus(clientKey: string): {
  used: number;
  limit: number;
  remaining: number;
  resetAt: number;
} {
  const bucket = getBucket(clientKey);
  const remaining = Math.max(0, DAILY_CREDIT_LIMIT - bucket.used);
  return {
    used: bucket.used,
    limit: DAILY_CREDIT_LIMIT,
    remaining,
    resetAt: bucket.resetAt,
  };
}

export function consumeAiCredits(
  clientKey: string,
  cost: number,
):
  | { allowed: true; status: ReturnType<typeof getCreditStatus> }
  | { allowed: false; status: ReturnType<typeof getCreditStatus> } {
  const bucket = getBucket(clientKey);
  if (bucket.used + cost > DAILY_CREDIT_LIMIT) {
    return {
      allowed: false,
      status: getCreditStatus(clientKey),
    };
  }
  bucket.used += cost;
  return {
    allowed: true,
    status: getCreditStatus(clientKey),
  };
}

// Periodically prune expired quota buckets
const pruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}, 60 * 60 * 1000);
pruneTimer.unref();
