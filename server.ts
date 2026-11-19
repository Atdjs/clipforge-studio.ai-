import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { createPartFromUri, createUserContent, GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  getAllowedOrigins,
  redactSensitiveText,
  resolveListenPort,
  serverEnv,
} from './server/env.ts';
import {
  AI_CREDIT_COSTS,
  consumeAiCredits,
  getCreditStatus,
} from './server/quota.ts';
import {
  geminiAiLimiter,
  generalApiLimiter,
  uploadChunkLimiter,
  uploadSessionLimiter,
} from './server/rateLimiters.ts';
import {
  saveFeedbackEntry,
  saveWaitlistEntry,
} from './server/leads.ts';
import {
  analyzeVideoSchema,
  feedbackRequestSchema,
  findMomentsRequestSchema,
  formatZodValidationError,
  geminiFileNameQuerySchema,
  generateMetadataRequestSchema,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  sanitizeUploadFileName,
  scoreClipRequestSchema,
  transcribeRequestSchema,
  translateClipsSchema,
  uploadChunkQuerySchema,
  uploadCompleteSchema,
  uploadIdParamSchema,
  uploadInitSchema,
  validateVideoMagicBytes,
  waitlistRequestSchema,
} from './server/validation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// STEP 1: Initialize the Gemini SDK strictly on the server
// Keeps GEMINI_API_KEY isolated in serverEnv; never exposed to client code.
// ---------------------------------------------------------------------------
function getGeminiClient(): GoogleGenAI {
  const apiKey = serverEnv.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('GEMINI_API_KEY is not configured in environment secrets.'), {
      status: 403,
      code: 'AUTH_ERROR',
      retryable: false,
    });
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ---------------------------------------------------------------------------
// STEP 2: Configure temporary OS disk staging for incoming video uploads (max 1 GB / 1024 MB)
// Files are magic-byte verified, forwarded to Gemini Files API, and immediately unlinked.
// ---------------------------------------------------------------------------
const CHUNK_SESSION_TTL_MS = 30 * 60 * 1000;
const tempUploadDir = path.join(os.tmpdir(), 'clip-cutter-uploads');
fs.mkdirSync(tempUploadDir, { recursive: true });

const upload = multer({
  dest: tempUploadDir,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },
});

interface ChunkUploadSession {
  tempPath: string;
  fileName: string;
  mimeType: string;
  expectedSize: number;
  receivedBytes: number;
  createdAt: number;
}

const activeChunkUploads = new Map<string, ChunkUploadSession>();

interface RawFillerWord {
  word: string;
  start_seconds: number;
  end_seconds: number;
}

interface RawTranscriptSegment {
  start_seconds: number;
  end_seconds: number;
  text: string;
  filler_words?: RawFillerWord[];
}

interface RawSubScores {
  hook: number;
  emotion: number;
  flow: number;
  shareability: number;
}

interface RawGeminiClip {
  start_seconds: number;
  end_seconds: number;
  title: string;
  hook_reason: string;
  caption_text: string;
  speaker_x_ratio?: number;
  virality_score?: number;
  virality_reason?: string;
  sub_scores?: RawSubScores;
  hook_line?: string;
  hook_start_seconds?: number;
  hook_end_seconds?: number;
  description?: string;
  hashtags?: string[];
  transcript?: RawTranscriptSegment[];
}

// ---------------------------------------------------------------------------
// STEP 3: Normalize & redact Gemini/server errors before returning to client
// ---------------------------------------------------------------------------
function formatApiError(err: unknown): {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
} {
  const anyErr = err as { status?: number; code?: string; message?: string };
  const rawMessage = redactSensitiveText(
    anyErr?.message || 'Unexpected error communicating with Gemini.',
  );
  const status = typeof anyErr?.status === 'number' ? anyErr.status : 500;

  if (
    status === 429 ||
    rawMessage.includes('RESOURCE_EXHAUSTED') ||
    rawMessage.toLowerCase().includes('rate limit') ||
    rawMessage.toLowerCase().includes('quota')
  ) {
    return {
      status: 429,
      code: 'RATE_LIMIT',
      message: 'Gemini API rate limit reached. Wait a few seconds and click Retry.',
      retryable: true,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    anyErr?.code === 'AUTH_ERROR' ||
    rawMessage.includes('API_KEY_INVALID') ||
    rawMessage.includes('PERMISSION_DENIED')
  ) {
    return {
      status: 403,
      code: 'AUTH_ERROR',
      message:
        'Gemini API key is missing or invalid on the server. Please verify GEMINI_API_KEY in Secrets.',
      retryable: false,
    };
  }

  if (status === 404 || rawMessage.includes('NOT_FOUND')) {
    return {
      status: 404,
      code: 'FILE_EXPIRED',
      message: 'The uploaded video session expired on Gemini. Click Retry to re-upload and analyze.',
      retryable: true,
    };
  }

  return {
    status: status >= 400 && status < 600 ? status : 502,
    code: anyErr?.code || 'API_ERROR',
    message: rawMessage,
    retryable: true,
  };
}

// ---------------------------------------------------------------------------
// STEP 4: Deterministic sanitizer ensuring clips never overlap & stay in bounds
// ---------------------------------------------------------------------------
function sanitizeTranscript(
  rawTranscript: RawTranscriptSegment[] | undefined,
  safeDuration: number,
): RawTranscriptSegment[] {
  if (!Array.isArray(rawTranscript)) return [];

  return rawTranscript
    .map((seg) => {
      const start = Math.max(0, Math.min(safeDuration, Number(seg.start_seconds) || 0));
      const rawEnd = Number(seg.end_seconds);
      const end = Math.max(
        start + 0.2,
        Math.min(safeDuration, Number.isFinite(rawEnd) ? rawEnd : start + 2),
      );
      const fillers: RawFillerWord[] = Array.isArray(seg.filler_words)
        ? seg.filler_words
            .map((fw) => {
              const fStart = Math.max(0, Math.min(safeDuration, Number(fw.start_seconds) || 0));
              const fRawEnd = Number(fw.end_seconds);
              const fEnd = Math.max(
                fStart + 0.08,
                Math.min(safeDuration, Number.isFinite(fRawEnd) ? fRawEnd : fStart + 0.25),
              );
              return {
                word: String(fw.word || '').trim().slice(0, 40),
                start_seconds: Number(fStart.toFixed(2)),
                end_seconds: Number(fEnd.toFixed(2)),
              };
            })
            .filter((fw) => fw.word.length > 0 && fw.end_seconds > fw.start_seconds)
        : [];

      return {
        start_seconds: Number(start.toFixed(2)),
        end_seconds: Number(end.toFixed(2)),
        text: String(seg.text || '').trim(),
        filler_words: fillers,
      };
    })
    .filter((seg) => seg.text.length > 0 && seg.end_seconds > seg.start_seconds)
    .sort((a, b) => a.start_seconds - b.start_seconds);
}

function clampScore(value: unknown, fallback = 74): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function sanitizeClips(
  rawClips: RawGeminiClip[],
  durationSeconds: number | undefined,
  maxClips: number,
  allowOverlaps = false,
): RawGeminiClip[] {
  const hasKnownDuration = typeof durationSeconds === 'number' && durationSeconds > 0;
  const safeDuration = hasKnownDuration ? Math.max(3, durationSeconds) : Number.MAX_SAFE_INTEGER;

  const normalized = rawClips
    .map((clip) => {
      const maxStart = hasKnownDuration ? Math.max(0, safeDuration - 3) : Number.MAX_SAFE_INTEGER;
      const start = Math.max(0, Math.min(maxStart, Math.round(Number(clip.start_seconds) || 0)));
      const rawEnd = Math.round(Number(clip.end_seconds) || start + 15);
      const end = Math.max(start + 3, Math.min(safeDuration, rawEnd));
      const rawRatio = Number(clip.speaker_x_ratio);
      const speakerXRatio = Number.isFinite(rawRatio)
        ? Math.max(0.15, Math.min(0.85, Number(rawRatio.toFixed(2))))
        : 0.5;
      const transcript = sanitizeTranscript(clip.transcript, safeDuration);

      const hookStartRaw = Number(clip.hook_start_seconds);
      const hookEndRaw = Number(clip.hook_end_seconds);
      const hookStart = Number.isFinite(hookStartRaw)
        ? Math.max(start, Math.min(end - 1, Number(hookStartRaw.toFixed(2))))
        : start;
      const hookEnd = Number.isFinite(hookEndRaw)
        ? Math.max(hookStart + 0.5, Math.min(end, Number(hookEndRaw.toFixed(2))))
        : Math.min(end, hookStart + 4);

      const subHook = clampScore(clip.sub_scores?.hook, 78);
      const subEmotion = clampScore(clip.sub_scores?.emotion, 72);
      const subFlow = clampScore(clip.sub_scores?.flow, 74);
      const subShare = clampScore(clip.sub_scores?.shareability, 70);
      const avgSub = Math.round((subHook + subEmotion + subFlow + subShare) / 4);
      const viralityScore = clampScore(clip.virality_score, avgSub);

      const cleanTags = Array.isArray(clip.hashtags)
        ? clip.hashtags
            .map((tag) => String(tag || '').trim())
            .filter(Boolean)
            .map((tag) => (tag.startsWith('#') ? tag : `#${tag.replace(/^#+/, '')}`))
            .slice(0, 12)
        : [];

      const fallbackHookLine =
        transcript[0]?.text || (clip.caption_text || '').split(/[.!?]/)[0]?.trim() || clip.title;

      return {
        start_seconds: start,
        end_seconds: Math.min(safeDuration, end),
        title: (clip.title || 'Highlight Clip').trim().slice(0, 80),
        hook_reason: (clip.hook_reason || 'Strong engaging moment').trim(),
        caption_text: (clip.caption_text || '').trim(),
        speaker_x_ratio: speakerXRatio,
        virality_score: viralityScore,
        virality_reason: (
          clip.virality_reason ||
          clip.hook_reason ||
          'Strong opening hook and clear takeaway.'
        )
          .trim()
          .slice(0, 240),
        sub_scores: {
          hook: subHook,
          emotion: subEmotion,
          flow: subFlow,
          shareability: subShare,
        },
        hook_line: String(clip.hook_line || fallbackHookLine || '').trim().slice(0, 200),
        hook_start_seconds: hookStart,
        hook_end_seconds: hookEnd,
        description: String(clip.description || '').trim().slice(0, 500),
        hashtags: cleanTags,
        transcript,
      };
    })
    .filter((clip) => clip.end_seconds - clip.start_seconds >= 3)
    .sort((a, b) => a.start_seconds - b.start_seconds);

  if (allowOverlaps) {
    return normalized.slice(0, maxClips);
  }

  const nonOverlapping: RawGeminiClip[] = [];
  let cursor = 0;

  for (const clip of normalized) {
    const adjustedStart = Math.max(clip.start_seconds, cursor);
    const adjustedEnd = Math.min(safeDuration, clip.end_seconds);

    if (adjustedEnd - adjustedStart >= 3) {
      nonOverlapping.push({
        ...clip,
        start_seconds: adjustedStart,
        end_seconds: adjustedEnd,
      });
      cursor = adjustedEnd;
    }

    if (nonOverlapping.length >= maxClips) {
      break;
    }
  }

  return nonOverlapping;
}

function resolveVideoMimeType(mimetype?: string, originalname?: string): string {
  const ext = path.extname(originalname || '').toLowerCase();
  if (ext === '.mov' || mimetype === 'video/quicktime') {
    return 'video/quicktime';
  }
  if (ext === '.webm' || mimetype === 'video/webm') {
    return 'video/webm';
  }
  if (mimetype && mimetype.startsWith('video/')) {
    return mimetype;
  }
  return 'video/mp4';
}

async function startServer() {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  // Trust first reverse-proxy hop (Cloud Run / load balancer) for accurate rate-limit IPs
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers (preserve iframe embed compatibility inside AI Studio preview)
  app.use(
    helmet({
      frameguard: false,
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(express.json({ limit: '2mb' }));

  // Origin check on state-changing /api/* proxy requests to deter cross-origin CSRF
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    const originHeader = req.get('origin');
    if (!originHeader) {
      return next();
    }

    const hostHeader = req.get('host');
    const sameHostHttp = hostHeader ? `http://${hostHeader}` : '';
    const sameHostHttps = hostHeader ? `https://${hostHeader}` : '';

    if (
      originHeader === sameHostHttp ||
      originHeader === sameHostHttps ||
      allowedOrigins.has(originHeader)
    ) {
      return next();
    }

    return res.status(403).json({
      code: 'FORBIDDEN_ORIGIN',
      message: 'Cross-origin API request rejected by backend proxy policy.',
      retryable: false,
    });
  });

  // Apply baseline API rate limiting across all /api/* routes
  app.use('/api', generalApiLimiter);

  // Periodic cleanup for stale / abandoned chunk upload sessions
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of activeChunkUploads.entries()) {
      if (now - session.createdAt > CHUNK_SESSION_TTL_MS) {
        activeChunkUploads.delete(id);
        fs.promises.unlink(session.tempPath).catch(() => {});
      }
    }
  }, 5 * 60 * 1000);
  cleanupTimer.unref();

  // -------------------------------------------------------------------------
  // PROXY HEALTH & QUOTA: Server status & per-IP credit readout (no secrets exposed)
  // -------------------------------------------------------------------------
  const getClientKey = (req: Request) => req.ip || req.socket.remoteAddress || 'anonymous';

  const checkAndConsumeQuota = (req: Request, res: Response, cost: number): boolean => {
    const outcome = consumeAiCredits(getClientKey(req), cost);
    res.setHeader('X-Credits-Limit', String(outcome.status.limit));
    res.setHeader('X-Credits-Remaining', String(outcome.status.remaining));
    if (!outcome.allowed) {
      res.status(429).json({
        code: 'CREDITS_EXHAUSTED',
        message: `Daily AI credit quota reached (${outcome.status.limit} credits/day). Wait for reset or edit clips locally.`,
        retryable: false,
        usage: outcome.status,
      });
      return false;
    }
    return true;
  };

  app.get('/api/health', (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      geminiConfigured: Boolean(serverEnv.GEMINI_API_KEY),
    });
  });

  app.get('/api/usage', (req: Request, res: Response) => {
    return res.json(getCreditStatus(getClientKey(req)));
  });

  // -------------------------------------------------------------------------
  // ROUTE 1A: Single-request upload (enforces 1 GB limit + magic-byte check)
  // -------------------------------------------------------------------------
  app.post('/api/videos/upload', uploadSessionLimiter, (req: Request, res: Response) => {
    upload.single('video')(req, res, async (multerErr: unknown) => {
      if (multerErr) {
        const errCode = (multerErr as { code?: string })?.code;
        if (errCode === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            code: 'FILE_TOO_LARGE',
            message: `Video file exceeds the 1 GB (${MAX_UPLOAD_MB} MB) maximum upload limit.`,
            retryable: false,
          });
        }
        const msg =
          multerErr instanceof Error ? multerErr.message : 'Failed to receive video upload.';
        return res.status(400).json({ code: 'UPLOAD_ERROR', message: msg, retryable: true });
      }

      if (!req.file) {
        return res.status(400).json({
          code: 'MISSING_FILE',
          message: 'No video file was provided.',
          retryable: false,
        });
      }

      const tempPath = req.file.path;
      const safeName = sanitizeUploadFileName(req.file.originalname);
      const mimeType = resolveVideoMimeType(req.file.mimetype, safeName);

      try {
        const isValidVideo = await validateVideoMagicBytes(tempPath);
        if (!isValidVideo) {
          return res.status(400).json({
            code: 'INVALID_FILE_SIGNATURE',
            message: 'Uploaded file header is not a valid MP4, MOV, or WebM video container.',
            retryable: false,
          });
        }

        const ai = getGeminiClient();
        const uploaded = await ai.files.upload({
          file: tempPath,
          config: {
            mimeType,
            displayName: safeName,
          },
        });

        return res.json({
          name: uploaded.name,
          uri: uploaded.uri,
          mimeType: uploaded.mimeType || mimeType,
          state: uploaded.state || 'PROCESSING',
        });
      } catch (err) {
        const formatted = formatApiError(err);
        return res.status(formatted.status).json(formatted);
      } finally {
        fs.promises.unlink(tempPath).catch(() => {});
      }
    });
  });

  // -------------------------------------------------------------------------
  // ROUTE 1B: Chunked streaming upload for large files up to 1 GB (1024 MB)
  // -------------------------------------------------------------------------
  app.post('/api/videos/upload/init', uploadSessionLimiter, (req: Request, res: Response) => {
    const parsed = uploadInitSchema.safeParse(req.body);
    if (!parsed.success) {
      const errPayload = formatZodValidationError(parsed.error);
      const status = errPayload.message.includes('maximum upload limit') ? 413 : 400;
      return res.status(status).json(errPayload);
    }

    const { fileName, fileSize, mimeType } = parsed.data;
    const safeName = sanitizeUploadFileName(fileName);
    const uploadId = `upl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const tempPath = path.join(tempUploadDir, `${uploadId}.bin`);
    fs.writeFileSync(tempPath, Buffer.alloc(0));

    activeChunkUploads.set(uploadId, {
      tempPath,
      fileName: safeName,
      mimeType: resolveVideoMimeType(mimeType, safeName),
      expectedSize: fileSize,
      receivedBytes: 0,
      createdAt: Date.now(),
    });

    return res.json({ uploadId, maxBytes: MAX_UPLOAD_BYTES });
  });

  app.post(
    '/api/videos/upload/chunk',
    uploadChunkLimiter,
    express.raw({ type: 'application/octet-stream', limit: '20mb' }),
    async (req: Request, res: Response) => {
      const parsedQuery = uploadChunkQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json(formatZodValidationError(parsedQuery.error));
      }

      const { uploadId } = parsedQuery.data;
      const session = activeChunkUploads.get(uploadId);

      if (!session) {
        return res.status(404).json({
          code: 'UPLOAD_SESSION_MISSING',
          message: 'Upload session expired or was cancelled. Please retry.',
          retryable: true,
        });
      }

      const chunkBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (chunkBuf.byteLength === 0) {
        return res.status(400).json({
          code: 'EMPTY_CHUNK',
          message: 'Received an empty upload chunk.',
          retryable: true,
        });
      }

      if (session.receivedBytes + chunkBuf.byteLength > MAX_UPLOAD_BYTES) {
        activeChunkUploads.delete(uploadId);
        fs.promises.unlink(session.tempPath).catch(() => {});
        return res.status(413).json({
          code: 'FILE_TOO_LARGE',
          message: `Video file exceeds the 1 GB (${MAX_UPLOAD_MB} MB) maximum upload limit.`,
          retryable: false,
        });
      }

      try {
        await fs.promises.appendFile(session.tempPath, chunkBuf);
        session.receivedBytes += chunkBuf.byteLength;
        return res.json({ receivedBytes: session.receivedBytes });
      } catch (err) {
        activeChunkUploads.delete(uploadId);
        fs.promises.unlink(session.tempPath).catch(() => {});
        const formatted = formatApiError(err);
        return res.status(formatted.status).json(formatted);
      }
    },
  );

  app.post(
    '/api/videos/upload/complete',
    uploadSessionLimiter,
    async (req: Request, res: Response) => {
      const parsed = uploadCompleteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(formatZodValidationError(parsed.error));
      }

      const { uploadId } = parsed.data;
      const session = activeChunkUploads.get(uploadId);

      if (!session) {
        return res.status(404).json({
          code: 'UPLOAD_SESSION_MISSING',
          message: 'Upload session not found. Please click Retry to upload again.',
          retryable: true,
        });
      }

      activeChunkUploads.delete(uploadId);

      try {
        if (session.receivedBytes <= 0) {
          return res.status(400).json({
            code: 'EMPTY_UPLOAD',
            message: 'Uploaded video contains no bytes.',
            retryable: true,
          });
        }

        const isValidVideo = await validateVideoMagicBytes(session.tempPath);
        if (!isValidVideo) {
          return res.status(400).json({
            code: 'INVALID_FILE_SIGNATURE',
            message: 'Uploaded file header is not a valid MP4, MOV, or WebM video container.',
            retryable: false,
          });
        }

        const ai = getGeminiClient();
        const uploaded = await ai.files.upload({
          file: session.tempPath,
          config: {
            mimeType: session.mimeType,
            displayName: session.fileName,
          },
        });

        return res.json({
          name: uploaded.name,
          uri: uploaded.uri,
          mimeType: uploaded.mimeType || session.mimeType,
          state: uploaded.state || 'PROCESSING',
        });
      } catch (err) {
        const formatted = formatApiError(err);
        return res.status(formatted.status).json(formatted);
      } finally {
        fs.promises.unlink(session.tempPath).catch(() => {});
      }
    },
  );

  app.delete('/api/videos/upload/:uploadId', (req: Request, res: Response) => {
    const parsedParams = uploadIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return res.status(400).json(formatZodValidationError(parsedParams.error));
    }

    const { uploadId } = parsedParams.data;
    const session = activeChunkUploads.get(uploadId);
    if (session) {
      activeChunkUploads.delete(uploadId);
      fs.promises.unlink(session.tempPath).catch(() => {});
    }
    return res.status(204).end();
  });

  // -------------------------------------------------------------------------
  // ROUTE 2: Poll Gemini Files API until file state becomes ACTIVE
  // -------------------------------------------------------------------------
  app.get('/api/videos/status', async (req: Request, res: Response) => {
    const parsedQuery = geminiFileNameQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json(formatZodValidationError(parsedQuery.error));
    }

    try {
      const ai = getGeminiClient();
      const file = await ai.files.get({ name: parsedQuery.data.name });
      return res.json({
        name: file.name,
        uri: file.uri,
        mimeType: file.mimeType,
        state: file.state,
        error: file.error,
      });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json(formatted);
    }
  });

  // -------------------------------------------------------------------------
  // ROUTE 3: Analyze video via Gemini API Proxy (with Stage 1 virality & hook intel)
  // -------------------------------------------------------------------------
  const CLIP_ANALYSIS_SCHEMA = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        start_seconds: { type: Type.NUMBER, description: 'Start timestamp in seconds (>= 0).' },
        end_seconds: { type: Type.NUMBER, description: 'End timestamp in seconds.' },
        title: { type: Type.STRING, description: 'Punchy, descriptive title for the clip.' },
        hook_reason: { type: Type.STRING, description: 'Why this segment is engaging.' },
        caption_text: { type: Type.STRING, description: 'Subtitle summary or spoken quote.' },
        speaker_x_ratio: { type: Type.NUMBER, description: 'Normalized speaker X (0.0 to 1.0).' },
        virality_score: { type: Type.NUMBER, description: 'Overall viral potential score 0-100.' },
        virality_reason: { type: Type.STRING, description: 'Concise reason explaining the score.' },
        sub_scores: {
          type: Type.OBJECT,
          properties: {
            hook: { type: Type.NUMBER },
            emotion: { type: Type.NUMBER },
            flow: { type: Type.NUMBER },
            shareability: { type: Type.NUMBER },
          },
          required: ['hook', 'emotion', 'flow', 'shareability'],
        },
        hook_line: { type: Type.STRING, description: 'Strongest hook sentence inside this clip.' },
        hook_start_seconds: { type: Type.NUMBER, description: 'Start timestamp of the hook line.' },
        hook_end_seconds: { type: Type.NUMBER, description: 'End timestamp of the hook line.' },
        description: { type: Type.STRING, description: 'Short social post caption/description.' },
        hashtags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '3 to 6 relevant social hashtags.',
        },
        transcript: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              start_seconds: { type: Type.NUMBER },
              end_seconds: { type: Type.NUMBER },
              text: { type: Type.STRING },
              filler_words: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    start_seconds: { type: Type.NUMBER },
                    end_seconds: { type: Type.NUMBER },
                  },
                  required: ['word', 'start_seconds', 'end_seconds'],
                },
              },
            },
            required: ['start_seconds', 'end_seconds', 'text'],
          },
        },
      },
      required: [
        'start_seconds',
        'end_seconds',
        'title',
        'hook_reason',
        'caption_text',
        'speaker_x_ratio',
        'virality_score',
        'virality_reason',
        'sub_scores',
        'hook_line',
        'description',
        'hashtags',
        'transcript',
      ],
    },
  };

  app.post('/api/videos/analyze', geminiAiLimiter, async (req: Request, res: Response) => {
    const parsedBody = analyzeVideoSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json(formatZodValidationError(parsedBody.error));
    }

    if (!checkAndConsumeQuota(req, res, AI_CREDIT_COSTS.analyze)) return;

    const {
      fileUri,
      mimeType,
      youtubeUrl,
      durationSeconds,
      clipCount,
      lengthRange,
      aspectFormat,
      customPrompt,
      captionLanguage,
    } = parsedBody.data;

    const targetUri = (youtubeUrl || fileUri)!;
    const targetMime = youtubeUrl ? 'video/mp4' : mimeType || 'video/mp4';

    const rangeMap: Record<'15-30' | '30-60' | '60-90', [number, number]> = {
      '15-30': [15, 30],
      '30-60': [30, 60],
      '60-90': [60, 90],
    };
    const [targetMin, targetMax] = rangeMap[lengthRange];
    const hasDuration = typeof durationSeconds === 'number' && durationSeconds > 0;
    const effectiveMin = hasDuration
      ? Math.min(targetMin, Math.max(3, Math.floor(durationSeconds)))
      : targetMin;
    const effectiveMax = hasDuration
      ? Math.min(targetMax, Math.floor(durationSeconds))
      : targetMax;

    const languageMap: Record<typeof captionLanguage, string> = {
      English: 'English',
      Hindi: 'Hindi (natural conversational Hindi in Devanagari script)',
      Marathi: 'Marathi (natural conversational Marathi in Devanagari script)',
      Hinglish:
        'Hinglish (conversational Hindi written in Roman/Latin script mixed naturally with English words)',
      Spanish: 'Spanish (natural conversational Spanish)',
    };
    const langInstruction = languageMap[captionLanguage];

    try {
      const ai = getGeminiClient();

      const durationContext = hasDuration
        ? `Analyze this ${Math.round(durationSeconds)}-second video carefully (both visual action and spoken audio).`
        : `Analyze this public YouTube video carefully (both visual action and spoken audio).`;

      const boundsRule = hasDuration
        ? `1. Every start_seconds and end_seconds MUST stay strictly within 0 and ${Math.floor(durationSeconds)}.`
        : `1. Every start_seconds and end_seconds MUST be >= 0 and strictly within the actual duration of the video.`;

      const focusInstruction = customPrompt
        ? `USER FOCUS INSTRUCTION (HIGHEST PRIORITY): Look specifically for moments matching: "${customPrompt}". Select clips that directly satisfy this focus.`
        : `Prioritize strong opening hooks, emotional peaks, funny moments, surprising twists, or clear valuable tips.`;

      const prompt = [
        durationContext,
        `Find up to ${clipCount} of the most engaging, high-retention clip moments.`,
        focusInstruction,
        `Target clip length: between ${effectiveMin} and ${effectiveMax} seconds per clip (unless the total video duration limits how many non-overlapping clips can fit).`,
        `Target output format context: ${aspectFormat === 'vertical' ? 'Vertical 9:16 social short' : 'Original framing'}.`,
        `CAPTION & METADATA LANGUAGE: Write caption_text, title, description, and every transcript segment's text in ${langInstruction}.`,
        `CRITICAL RULES:`,
        boundsRule,
        `2. Clips MUST NEVER overlap (each clip's start_seconds must be >= the previous clip's end_seconds).`,
        `3. Sort clips in chronological order.`,
        `4. Score each clip's virality_score (0-100) honestly based on its hook, emotion, flow, and shareability sub_scores (each 0-100), plus a brief virality_reason.`,
        `5. Identify the single strongest spoken hook_line inside the clip along with hook_start_seconds and hook_end_seconds.`,
        `6. Include a short social description and 4-5 relevant hashtags.`,
        `7. Include a sentence/phrase-level timestamped transcript array covering the spoken words from start_seconds to end_seconds, plus filler_words timestamps ("um", "uh", "like", "you know", etc.).`,
        `8. Estimate speaker_x_ratio (0.0 left to 1.0 right, 0.5 center) for 9:16 speaker reframing.`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: createUserContent([createPartFromUri(targetUri, targetMime), prompt]),
        config: {
          systemInstruction:
            'You are an expert short-form video editor, viral strategist, and transcriptionist. Return only valid JSON matching the requested schema.',
          responseMimeType: 'application/json',
          responseSchema: CLIP_ANALYSIS_SCHEMA,
        },
      });

      const rawText = (response.text ?? '[]').trim();
      let parsed: RawGeminiClip[];
      try {
        parsed = JSON.parse(rawText) as RawGeminiClip[];
      } catch {
        throw Object.assign(
          new Error('Gemini returned an unexpected format. Click Retry to try again.'),
          { status: 502, code: 'PARSE_ERROR', retryable: true },
        );
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw Object.assign(
          new Error(
            'No highlight clips were detected for this video. Try adjusting settings and retrying.',
          ),
          { status: 422, code: 'EMPTY_RESULTS', retryable: true },
        );
      }

      const clips = sanitizeClips(parsed, hasDuration ? durationSeconds : undefined, clipCount);
      if (clips.length === 0) {
        throw Object.assign(
          new Error('Video may be too short for valid non-overlapping clips. Try a shorter clip length.'),
          { status: 422, code: 'EMPTY_RESULTS', retryable: true },
        );
      }

      return res.json({
        clips,
        captionLanguage,
        usage: getCreditStatus(getClientKey(req)),
      });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json(formatted);
    }
  });

  // -------------------------------------------------------------------------
  // ROUTE 3B: /api/transcribe & /transcribe — Full timestamped transcript proxy
  // -------------------------------------------------------------------------
  const handleTranscribe = async (req: Request, res: Response) => {
    const parsedBody = transcribeRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json(formatZodValidationError(parsedBody.error));
    }

    if (!checkAndConsumeQuota(req, res, AI_CREDIT_COSTS.transcribe)) return;

    const { fileUri, mimeType, durationSeconds, captionLanguage } = parsedBody.data;
    const safeDur = durationSeconds && durationSeconds > 0 ? durationSeconds : Number.MAX_SAFE_INTEGER;

    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: createUserContent([
          createPartFromUri(fileUri, mimeType || 'video/mp4'),
          `Transcribe all spoken speech in this media in ${captionLanguage} as chronological phrase-level segments with accurate start_seconds, end_seconds, text, and any filler_words ("um", "uh", "like", "you know", repeated words) with timestamps.`,
        ]),
        config: {
          systemInstruction:
            'You are a precise audio/video transcriptionist. Return only valid JSON matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                start_seconds: { type: Type.NUMBER },
                end_seconds: { type: Type.NUMBER },
                text: { type: Type.STRING },
                filler_words: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      start_seconds: { type: Type.NUMBER },
                      end_seconds: { type: Type.NUMBER },
                    },
                    required: ['word', 'start_seconds', 'end_seconds'],
                  },
                },
              },
              required: ['start_seconds', 'end_seconds', 'text'],
            },
          },
        },
      });

      const raw = JSON.parse((response.text ?? '[]').trim()) as RawTranscriptSegment[];
      const transcript = sanitizeTranscript(raw, safeDur);
      return res.json({
        transcript,
        captionLanguage,
        usage: getCreditStatus(getClientKey(req)),
      });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json(formatted);
    }
  };

  app.post('/api/transcribe', geminiAiLimiter, handleTranscribe);
  app.post('/transcribe', geminiAiLimiter, handleTranscribe);

  // -------------------------------------------------------------------------
  // ROUTE 3C: /api/find-moments & /find-moments — Prompt-based viral moment search
  // -------------------------------------------------------------------------
  const handleFindMoments = async (req: Request, res: Response) => {
    const parsedBody = findMomentsRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json(formatZodValidationError(parsedBody.error));
    }

    if (!checkAndConsumeQuota(req, res, AI_CREDIT_COSTS.findMoments)) return;

    const {
      fileUri,
      mimeType,
      youtubeUrl,
      transcript,
      durationSeconds,
      customPrompt,
      clipCount,
      lengthRange,
      captionLanguage,
    } = parsedBody.data;

    const rangeMap: Record<'15-30' | '30-60' | '60-90', [number, number]> = {
      '15-30': [15, 30],
      '30-60': [30, 60],
      '60-90': [60, 90],
    };
    const [targetMin, targetMax] = rangeMap[lengthRange];
    const hasDuration = typeof durationSeconds === 'number' && durationSeconds > 0;

    const promptText = [
      customPrompt
        ? `Find up to ${clipCount} clip moments specifically matching: "${customPrompt}".`
        : `Find the top ${clipCount} most viral, high-retention clip moments.`,
      `Target clip duration: ${targetMin} to ${targetMax} seconds each.`,
      `Language for title, caption_text, description, and transcript: ${captionLanguage}.`,
      `Return virality_score (0-100), sub_scores (hook, emotion, flow, shareability), virality_reason, hook_line, hook_start_seconds, hook_end_seconds, description, hashtags, speaker_x_ratio, and transcript segments.`,
      transcript && transcript.length > 0
        ? `SEARCH THIS TRANSCRIPT:\n${JSON.stringify(transcript)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const ai = getGeminiClient();
      const contents =
        transcript && transcript.length > 0 && !fileUri && !youtubeUrl
          ? promptText
          : createUserContent([
              createPartFromUri((youtubeUrl || fileUri)!, youtubeUrl ? 'video/mp4' : mimeType || 'video/mp4'),
              promptText,
            ]);

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction:
            'You are a viral short-form video strategist. Return only valid JSON matching the schema with accurate timestamps inside the source duration.',
          responseMimeType: 'application/json',
          responseSchema: CLIP_ANALYSIS_SCHEMA,
        },
      });

      const parsed = JSON.parse((response.text ?? '[]').trim()) as RawGeminiClip[];
      const clips = sanitizeClips(
        Array.isArray(parsed) ? parsed : [],
        hasDuration ? durationSeconds : undefined,
        clipCount,
        true,
      );

      return res.json({
        clips,
        captionLanguage,
        usage: getCreditStatus(getClientKey(req)),
      });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json(formatted);
    }
  };

  app.post('/api/find-moments', geminiAiLimiter, handleFindMoments);
  app.post('/find-moments', geminiAiLimiter, handleFindMoments);

  // -------------------------------------------------------------------------
  // ROUTE 3D: /api/generate-metadata & /generate-metadata — Viral titles, description & hashtags
  // -------------------------------------------------------------------------
  const handleGenerateMetadata = async (req: Request, res: Response) => {
    const parsedBody = generateMetadataRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json(formatZodValidationError(parsedBody.error));
    }

    if (!checkAndConsumeQuota(req, res, AI_CREDIT_COSTS.generateMetadata)) return;

    const { title, hookReason, captionText, transcriptTexts, targetLanguage, platform } =
      parsedBody.data;

    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          `Generate punchy short-form social metadata in ${targetLanguage} tailored for platform: ${platform}.`,
          `Return 3 alternative viral titles, 1 concise engaging description (max 280 chars), and 5 relevant hashtags.`,
          `Current title: ${title}`,
          hookReason ? `Hook reason: ${hookReason}` : '',
          captionText ? `Caption: ${captionText}` : '',
          transcriptTexts.length > 0 ? `Transcript:\n${transcriptTexts.join(' ')}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        config: {
          systemInstruction:
            'You are a short-form social media copywriter. Return only valid JSON matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              titles: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              description: { type: Type.STRING },
              hashtags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['titles', 'description', 'hashtags'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        titles?: string[];
        description?: string;
        hashtags?: string[];
      };

      const titles = Array.isArray(parsed.titles)
        ? parsed.titles.map((t) => String(t).trim()).filter(Boolean).slice(0, 5)
        : [title];
      const hashtags = Array.isArray(parsed.hashtags)
        ? parsed.hashtags
            .map((h) => String(h).trim())
            .filter(Boolean)
            .map((h) => (h.startsWith('#') ? h : `#${h.replace(/^#+/, '')}`))
            .slice(0, 10)
        : [];

      return res.json({
        titles,
        description: String(parsed.description || '').trim(),
        hashtags,
        targetLanguage,
        usage: getCreditStatus(getClientKey(req)),
      });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json(formatted);
    }
  };

  app.post('/api/generate-metadata', geminiAiLimiter, handleGenerateMetadata);
  app.post('/generate-metadata', geminiAiLimiter, handleGenerateMetadata);

  // -------------------------------------------------------------------------
  // ROUTE 3E: Translate existing clips' captions & transcripts via Gemini Proxy
  // -------------------------------------------------------------------------
  app.post('/api/clips/translate', geminiAiLimiter, async (req: Request, res: Response) => {
    const parsedBody = translateClipsSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json(formatZodValidationError(parsedBody.error));
    }

    if (!checkAndConsumeQuota(req, res, AI_CREDIT_COSTS.translate)) return;

    const { clips, targetLanguage } = parsedBody.data;
    const languageMap: Record<typeof targetLanguage, string> = {
      English: 'English',
      Hindi: 'Hindi (natural conversational Hindi in Devanagari script)',
      Marathi: 'Marathi (natural conversational Marathi in Devanagari script)',
      Hinglish:
        'Hinglish (conversational Hindi written in Roman/Latin script mixed naturally with English words)',
      Spanish: 'Spanish (natural conversational Spanish)',
    };
    const langDescription = languageMap[targetLanguage];

    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          `Translate the caption_text and each transcript phrase text in the JSON below into ${langDescription}.`,
          `Preserve every clip id and keep the transcript array in the exact same order and count.`,
          JSON.stringify(clips),
        ].join('\n\n'),
        config: {
          systemInstruction:
            'You are a precise subtitle translator for short-form video. Return only valid JSON matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                caption_text: { type: Type.STRING },
                transcript_texts: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['id', 'caption_text', 'transcript_texts'],
            },
          },
        },
      });

      const rawText = (response.text ?? '[]').trim();
      const translated = JSON.parse(rawText) as Array<{
        id: string;
        caption_text: string;
        transcript_texts: string[];
      }>;

      return res.json({
        translations: translated,
        targetLanguage,
        usage: getCreditStatus(getClientKey(req)),
      });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json(formatted);
    }
  });

  // -------------------------------------------------------------------------
  // ROUTE 3F: Score / re-score a single clip's virality (0-100 + breakdown) via Gemini Proxy
  // -------------------------------------------------------------------------
  app.post('/api/clips/score', geminiAiLimiter, async (req: Request, res: Response) => {
    const parsedBody = scoreClipRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json(formatZodValidationError(parsedBody.error));
    }

    if (!checkAndConsumeQuota(req, res, AI_CREDIT_COSTS.scoreClip)) return;

    const { title, startSeconds, endSeconds, captionText, hookReason, transcriptTexts } =
      parsedBody.data;
    const clipDuration = Math.max(1, Math.round(endSeconds - startSeconds));

    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          `Evaluate the short-form virality potential of this ${clipDuration}s clip.`,
          `Score each factor honestly from 0 to 100: hook (opening 3-second attention), emotion (curiosity/impact), flow (clarity and pacing), shareability (saves/forwards), and overall virality_score (0-100). Provide a concise 1-sentence virality_reason.`,
          `Title: ${title}`,
          hookReason ? `Context: ${hookReason}` : '',
          captionText ? `Caption: ${captionText}` : '',
          transcriptTexts.length > 0 ? `Transcript:\n${transcriptTexts.join(' ')}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        config: {
          systemInstruction:
            'You are a candid short-form video strategist. Return only valid JSON matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              virality_score: { type: Type.NUMBER },
              virality_reason: { type: Type.STRING },
              sub_scores: {
                type: Type.OBJECT,
                properties: {
                  hook: { type: Type.NUMBER },
                  emotion: { type: Type.NUMBER },
                  flow: { type: Type.NUMBER },
                  shareability: { type: Type.NUMBER },
                },
                required: ['hook', 'emotion', 'flow', 'shareability'],
              },
            },
            required: ['virality_score', 'virality_reason', 'sub_scores'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        virality_score?: number;
        virality_reason?: string;
        sub_scores?: Partial<RawSubScores>;
      };

      const hook = clampScore(parsed.sub_scores?.hook, 76);
      const emotion = clampScore(parsed.sub_scores?.emotion, 72);
      const flow = clampScore(parsed.sub_scores?.flow, 74);
      const shareability = clampScore(parsed.sub_scores?.shareability, 70);
      const avg = Math.round((hook + emotion + flow + shareability) / 4);
      const virality_score = clampScore(parsed.virality_score, avg);
      const virality_reason = String(
        parsed.virality_reason || 'Evaluated from opening hook strength, emotional clarity, and share value.',
      )
        .trim()
        .slice(0, 240);

      return res.json({
        virality_score,
        virality_reason,
        sub_scores: { hook, emotion, flow, shareability },
        usage: getCreditStatus(getClientKey(req)),
      });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json(formatted);
    }
  });

  // -------------------------------------------------------------------------
  // ROUTE 3G: Pro Plan Waitlist & User Feedback Endpoints (Real Server Storage)
  // -------------------------------------------------------------------------
  app.post('/api/waitlist', (req: Request, res: Response) => {
    const parsed = waitlistRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(formatZodValidationError(parsed.error));
    }

    const result = saveWaitlistEntry({
      email: parsed.data.email,
      plan: parsed.data.plan,
      consentGiven: true,
      consentAt: new Date().toISOString(),
    });

    return res.status(result.alreadyJoined ? 200 : 201).json({
      ok: true,
      alreadyJoined: result.alreadyJoined,
      message: result.alreadyJoined
        ? 'This email is already on the Pro waitlist.'
        : 'Added to the Pro waitlist. We will write once 1080p export launches.',
    });
  });

  app.post('/api/feedback', (req: Request, res: Response) => {
    const parsed = feedbackRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(formatZodValidationError(parsed.error));
    }

    saveFeedbackEntry({
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      category: parsed.data.category,
      message: parsed.data.message,
      email: parsed.data.email || undefined,
      submittedAt: new Date().toISOString(),
    });

    return res.status(201).json({
      ok: true,
      message: 'Thank you. Your feedback has been recorded.',
    });
  });

  // -------------------------------------------------------------------------
  // ROUTE 4: Best-effort cleanup of Gemini File when user resets or replaces video
  // -------------------------------------------------------------------------
  app.delete('/api/videos/file', async (req: Request, res: Response) => {
    const parsedQuery = geminiFileNameQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json(formatZodValidationError(parsedQuery.error));
    }

    try {
      const ai = getGeminiClient();
      await ai.files.delete({ name: parsedQuery.data.name });
    } catch {
      // Ignore cleanup errors (file may already be deleted or expired)
    }
    return res.status(204).end();
  });

  // Global error fallback so API routes never emit HTML or secret stack traces
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/')) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json(formatted);
    }
    next(err);
  });

  // Mount Vite dev middleware in development or serve compiled dist/ in production
  if (serverEnv.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const targetPort = resolveListenPort();
  const server = app.listen(targetPort, '0.0.0.0', () => {
    console.log(`Clip Cutter server running on http://0.0.0.0:${targetPort}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && targetPort !== 3000) {
      console.warn(`Port ${targetPort} is already in use; falling back to port 3000.`);
      server.listen(3000, '0.0.0.0');
      return;
    }
    throw err;
  });

  server.requestTimeout = 20 * 60 * 1000;
  server.headersTimeout = 60 * 1000;
}

startServer();
