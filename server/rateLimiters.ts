import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { serverEnv } from './env.ts';

function buildLimiter(options: {
  windowMs: number;
  limit: number;
  code: string;
  message: string;
  skip?: (req: import('express').Request) => boolean;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: options.skip,
    handler: (_req, res) => {
      const retryAfterSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        code: options.code,
        message: options.message,
        retryable: true,
        retryAfterSeconds,
      });
    },
  });
}

/**
 * General API limiter across /api/* endpoints.
 */
export const generalApiLimiter = buildLimiter({
  windowMs: serverEnv.RATE_LIMIT_WINDOW_MS,
  limit: serverEnv.RATE_LIMIT_GENERAL_MAX,
  code: 'RATE_LIMIT',
  message: 'Too many requests from your connection. Please wait a moment and try again.',
  skip: (req) => req.path === '/health',
});

/**
 * Strict Gemini AI proxy limiter protecting transcription, moment search, scoring, metadata, and translation routes.
 */
export const geminiAiLimiter = buildLimiter({
  windowMs: serverEnv.RATE_LIMIT_WINDOW_MS,
  limit: serverEnv.RATE_LIMIT_AI_MAX,
  code: 'RATE_LIMIT',
  message: 'AI analysis rate limit reached. Please wait a minute before starting another analysis.',
});
