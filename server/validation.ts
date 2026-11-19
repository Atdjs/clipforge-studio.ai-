import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const MAX_UPLOAD_MB = 1024;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024; // 1 GB (1024 MB)

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'application/octet-stream',
]);

const GEMINI_FILE_NAME_REGEX = /^files\/[a-zA-Z0-9_-]{4,120}$/;
const UPLOAD_ID_REGEX = /^upl_\d{10,16}_[a-z0-9]{6,12}$/;

/**
 * Validates that a remote fileUri belongs strictly to Gemini's Files API host
 * to prevent SSRF or arbitrary external URI injection.
 */
export function isValidGeminiFileUri(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'generativelanguage.googleapis.com' &&
      url.pathname.includes('/files/')
    );
  } catch {
    return false;
  }
}

/**
 * Validates that a YouTube URL is a public HTTPS YouTube or youtu.be link.
 */
export function isValidYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    return (
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be'
    );
  } catch {
    return false;
  }
}

/**
 * Sanitizes a user-supplied filename down to a safe single basename.
 */
export function sanitizeUploadFileName(rawName: string | undefined): string {
  const base = path.basename((rawName || 'clip-cutter-video.mp4').trim());
  const cleaned = base.replace(/[^\w.\- ()]/g, '_').slice(0, 180);
  return cleaned || 'clip-cutter-video.mp4';
}

export const uploadInitSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, 'File name is required.')
    .max(255, 'File name is too long.'),
  fileSize: z.coerce
    .number()
    .int('File size must be an integer byte count.')
    .positive('File size must be greater than 0 bytes.')
    .max(
      MAX_UPLOAD_BYTES,
      `Video file exceeds the 1 GB (${MAX_UPLOAD_MB} MB) maximum upload limit.`,
    ),
  mimeType: z
    .string()
    .trim()
    .max(120)
    .optional()
    .refine(
      (val) => !val || ALLOWED_VIDEO_MIME_TYPES.has(val.toLowerCase()),
      'Unsupported video MIME type. Please upload MP4, MOV, or WebM.',
    ),
});

export const uploadChunkQuerySchema = z.object({
  uploadId: z
    .string()
    .trim()
    .regex(UPLOAD_ID_REGEX, 'Invalid or malformed upload session ID.'),
});

export const uploadCompleteSchema = z.object({
  uploadId: z
    .string()
    .trim()
    .regex(UPLOAD_ID_REGEX, 'Invalid or malformed upload session ID.'),
});

export const uploadIdParamSchema = z.object({
  uploadId: z
    .string()
    .trim()
    .regex(UPLOAD_ID_REGEX, 'Invalid or malformed upload session ID.'),
});

export const geminiFileNameQuerySchema = z.object({
  name: z
    .string()
    .trim()
    .regex(GEMINI_FILE_NAME_REGEX, 'Invalid Gemini file resource name.'),
});

export const captionLanguageSchema = z.enum([
  'English',
  'Hindi',
  'Marathi',
  'Hinglish',
  'Spanish',
]);

export const analyzeVideoSchema = z
  .object({
    fileUri: z
      .string()
      .trim()
      .max(512)
      .optional()
      .refine((val) => !val || isValidGeminiFileUri(val), {
        message: 'fileUri must be a valid Gemini Files API HTTPS URI.',
      }),
    mimeType: z
      .string()
      .trim()
      .max(120)
      .optional()
      .refine((val) => !val || ALLOWED_VIDEO_MIME_TYPES.has(val.toLowerCase()), {
        message: 'Unsupported video MIME type.',
      }),
    youtubeUrl: z
      .string()
      .trim()
      .max(512)
      .optional()
      .refine((val) => !val || isValidYouTubeUrl(val), {
        message: 'youtubeUrl must be a valid youtube.com or youtu.be URL.',
      }),
    durationSeconds: z.coerce
      .number()
      .finite()
      .positive('durationSeconds must be positive.')
      .max(21600, 'Video duration cannot exceed 6 hours.')
      .optional(),
    clipCount: z.coerce.number().int().min(3).max(10).default(5),
    lengthRange: z.enum(['15-30', '30-60', '60-90']).default('30-60'),
    aspectFormat: z.enum(['original', 'vertical']).default('vertical'),
    customPrompt: z
      .string()
      .max(400, 'Custom prompt cannot exceed 400 characters.')
      .optional()
      .transform((val) => (val ? val.replace(/[\u0000-\u001F\u007F]/g, ' ').trim() : '')),
    captionLanguage: captionLanguageSchema.default('English'),
  })
  .superRefine((data, ctx) => {
    if (!data.fileUri && !data.youtubeUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either fileUri or youtubeUrl is required for analysis.',
      });
    }
    if (!data.youtubeUrl && (!data.durationSeconds || data.durationSeconds <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'durationSeconds is required when analyzing an uploaded video file.',
      });
    }
  });

export const translateClipsSchema = z.object({
  targetLanguage: captionLanguageSchema,
  clips: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        caption_text: z.string().max(4000).default(''),
        transcript: z
          .array(
            z.object({
              start_seconds: z.coerce.number().finite().min(0).max(21600),
              end_seconds: z.coerce.number().finite().min(0).max(21600),
              text: z.string().max(2000),
            }),
          )
          .max(400)
          .optional(),
      }),
    )
    .min(1, 'At least one clip is required for translation.')
    .max(20, 'Cannot translate more than 20 clips per request.'),
});

export const transcribeRequestSchema = z.object({
  fileUri: z
    .string()
    .trim()
    .max(512)
    .refine((val) => isValidGeminiFileUri(val), {
      message: 'fileUri must be a valid Gemini Files API HTTPS URI.',
    }),
  mimeType: z
    .string()
    .trim()
    .max(120)
    .optional()
    .refine((val) => !val || ALLOWED_VIDEO_MIME_TYPES.has(val.toLowerCase()), {
      message: 'Unsupported video or audio MIME type.',
    }),
  durationSeconds: z.coerce.number().finite().positive().max(21600).optional(),
  captionLanguage: captionLanguageSchema.default('English'),
});

export const findMomentsRequestSchema = z
  .object({
    fileUri: z
      .string()
      .trim()
      .max(512)
      .optional()
      .refine((val) => !val || isValidGeminiFileUri(val), {
        message: 'fileUri must be a valid Gemini Files API HTTPS URI.',
      }),
    mimeType: z
      .string()
      .trim()
      .max(120)
      .optional()
      .refine((val) => !val || ALLOWED_VIDEO_MIME_TYPES.has(val.toLowerCase()), {
        message: 'Unsupported video MIME type.',
      }),
    youtubeUrl: z
      .string()
      .trim()
      .max(512)
      .optional()
      .refine((val) => !val || isValidYouTubeUrl(val), {
        message: 'youtubeUrl must be a valid youtube.com or youtu.be URL.',
      }),
    transcript: z
      .array(
        z.object({
          start_seconds: z.coerce.number().finite().min(0).max(21600),
          end_seconds: z.coerce.number().finite().min(0).max(21600),
          text: z.string().trim().min(1).max(2000),
        }),
      )
      .max(600)
      .optional(),
    durationSeconds: z.coerce.number().finite().positive().max(21600).optional(),
    customPrompt: z
      .string()
      .max(400, 'Search prompt cannot exceed 400 characters.')
      .optional()
      .transform((val) => (val ? val.replace(/[\u0000-\u001F\u007F]/g, ' ').trim() : '')),
    clipCount: z.coerce.number().int().min(1).max(10).default(5),
    lengthRange: z.enum(['15-30', '30-60', '60-90']).default('30-60'),
    captionLanguage: captionLanguageSchema.default('English'),
  })
  .superRefine((data, ctx) => {
    const hasTranscript = Array.isArray(data.transcript) && data.transcript.length > 0;
    if (!data.fileUri && !data.youtubeUrl && !hasTranscript) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide a transcript, fileUri, or youtubeUrl to find moments.',
      });
    }
  });

export const generateMetadataRequestSchema = z.object({
  title: z.string().trim().max(150).default('Highlight Clip'),
  hookReason: z.string().trim().max(500).optional().default(''),
  captionText: z.string().trim().max(4000).optional().default(''),
  transcriptTexts: z.array(z.string().max(1000)).max(80).optional().default([]),
  targetLanguage: captionLanguageSchema.default('English'),
  platform: z.enum(['tiktok', 'reels', 'shorts', 'youtube', 'general']).default('general'),
});

export const scoreClipRequestSchema = z
  .object({
    title: z.string().trim().max(150).optional().default(''),
    startSeconds: z.coerce.number().finite().min(0).max(21600),
    endSeconds: z.coerce.number().finite().min(1).max(21600),
    captionText: z.string().trim().max(4000).optional().default(''),
    hookReason: z.string().trim().max(500).optional().default(''),
    transcriptTexts: z.array(z.string().max(1000)).max(80).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.endSeconds <= data.startSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endSeconds'],
        message: 'endSeconds must be greater than startSeconds.',
      });
    }
    const hasContent =
      Boolean(data.title) ||
      Boolean(data.captionText) ||
      Boolean(data.hookReason) ||
      data.transcriptTexts.some((t) => t.trim().length > 0);
    if (!hasContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title'],
        message: 'Provide clip title, caption, or transcript context to score virality.',
      });
    }
  });

export const waitlistRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.')
    .max(200, 'Email address is too long.'),
  consent: z.literal(true, {
    message: 'Please confirm email consent before joining the waitlist.',
  }),
  plan: z.enum(['pro']).default('pro'),
});

export const feedbackRequestSchema = z.object({
  category: z.enum(['bug', 'feature', 'general']).default('general'),
  message: z
    .string()
    .trim()
    .min(8, 'Please enter at least 8 characters of feedback.')
    .max(1500, 'Feedback cannot exceed 1,500 characters.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.')
    .max(200)
    .optional()
    .or(z.literal('')),
});

/**
 * Inspects container magic bytes on disk to confirm an uploaded file is a genuine
 * MP4/MOV/M4V (ISO BMFF 'ftyp') or WebM/MKV (EBML 0x1A45DFA3) video file.
 */
export async function validateVideoMagicBytes(filePath: string): Promise<boolean> {
  let handle: fs.promises.FileHandle | null = null;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, 16, 0);
    if (bytesRead < 12) return false;

    // ISO Base Media File Format (MP4, MOV, M4V): bytes 4..7 === 'ftyp'
    const boxType = header.subarray(4, 8).toString('ascii');
    if (boxType === 'ftyp' || boxType === 'moov' || boxType === 'wide' || boxType === 'free') {
      return true;
    }

    // EBML container (WebM / Matroska): 0x1A 0x45 0xDF 0xA3
    if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) {
      return true;
    }

    return false;
  } catch {
    return false;
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
  }
}

/**
 * Formats Zod validation issues into a clean client-friendly error payload.
 */
export function formatZodValidationError(error: z.ZodError): {
  code: string;
  message: string;
  retryable: boolean;
  issues: Array<{ path: string; message: string }>;
} {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join('.') || 'request',
    message: issue.message,
  }));
  return {
    code: 'VALIDATION_ERROR',
    message: issues[0]?.message || 'Invalid request parameters.',
    retryable: false,
    issues,
  };
}
