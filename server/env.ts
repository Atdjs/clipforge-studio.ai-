import 'dotenv/config';
import { z } from 'zod';

/**
 * Helper to treat empty strings in environment variables as undefined so Zod defaults apply cleanly.
 */
const emptyToUndefined = (val: unknown) =>
  typeof val === 'string' && val.trim() === '' ? undefined : val;

const optionalInt = (min: number, max: number, fallback: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(min).max(max).catch(fallback).default(fallback),
  );

/**
 * Server-only environment validation via Zod.
 * Keeps GEMINI_API_KEY and rate-limit tuning strictly on the Node.js/Express backend
 * so secrets are never bundled into client assets or leaked to the browser.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['development', 'production', 'test']).catch('development').default('development'),
  ),
  PORT: optionalInt(1, 65535, 3000),
  DEV_SERVER_PORT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(65535).optional().catch(undefined),
  ),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().trim().default('')),
  APP_URL: z.preprocess(emptyToUndefined, z.string().trim().default('')),
  ALLOWED_ORIGINS: z.preprocess(emptyToUndefined, z.string().trim().default('')),
  RATE_LIMIT_WINDOW_MS: optionalInt(1000, 3_600_000, 15 * 60 * 1000),
  RATE_LIMIT_GENERAL_MAX: optionalInt(10, 5000, 150),
  RATE_LIMIT_AI_MAX: optionalInt(1, 500, 25),
  RATE_LIMIT_UPLOAD_MAX: optionalInt(1, 500, 30),
  RATE_LIMIT_CHUNK_MAX: optionalInt(50, 10000, 800),
});

export const serverEnv = serverEnvSchema.parse(process.env);

/**
 * In development (behind nginx / AI Studio proxy on 8080), always bind port 3000
 * unless DEV_SERVER_PORT is explicitly configured.
 */
export function resolveListenPort(): number {
  if (serverEnv.NODE_ENV !== 'production') {
    return serverEnv.DEV_SERVER_PORT ?? 3000;
  }
  return serverEnv.PORT || 3000;
}

/**
 * Computes allowed origins for state-changing API requests.
 * Supports APP_URL, comma-separated ALLOWED_ORIGINS, and local dev hosts.
 */
export function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://0.0.0.0:3000',
  ]);

  if (serverEnv.APP_URL) {
    try {
      origins.add(new URL(serverEnv.APP_URL).origin);
    } catch {
      // Ignore malformed APP_URL
    }
  }

  if (serverEnv.ALLOWED_ORIGINS) {
    for (const raw of serverEnv.ALLOWED_ORIGINS.split(',')) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      try {
        origins.add(new URL(trimmed).origin);
      } catch {
        // Ignore malformed entry
      }
    }
  }

  return origins;
}

/**
 * Redacts the configured GEMINI_API_KEY (or Google AIza* keys) from strings before logging or returning errors.
 */
export function redactSensitiveText(input: string): string {
  let sanitized = input;
  if (serverEnv.GEMINI_API_KEY && serverEnv.GEMINI_API_KEY.length >= 6) {
    sanitized = sanitized.split(serverEnv.GEMINI_API_KEY).join('[REDACTED_KEY]');
  }
  return sanitized.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]');
}
