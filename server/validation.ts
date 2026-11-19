import path from 'node:path';
import { z } from 'zod';

/** Local browser cutting supports MP4/MOV up to 1 GB (never uploaded to server). */
export const MAX_LOCAL_VIDEO_MB = 1024;
export const MAX_LOCAL_VIDEO_BYTES = MAX_LOCAL_VIDEO_MB * 1024 * 1024;

/** Single-request compressed audio transcription cap (~45 minutes @ 32 kbps ≈ 11 MB, hard ceiling 25 MB). */
export const MAX_TRANSCRIBE_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_TRANSCRIBE_DURATION_SECONDS = 45 * 60; // 2700 seconds (45 minutes)

export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/ogg',
  'application/ogg',
  'audio/opus',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
]);

/**
 * Sanitizes a user-supplied filename down to a safe single basename.
 */
export function sanitizeUploadFileName(rawName: string | undefined): string {
  const base = path.basename((rawName || 'audio-track.ogg').trim());
  const cleaned = base.replace(/[^\w.\- ()]/g, '_').slice(0, 180);
  return cleaned || 'audio-track.ogg';
}

export const captionLanguageSchema = z.enum([
  'English',
  'Hindi',
  'Marathi',
  'Hinglish',
  'Spanish',
]);

export const transcribeAudioFieldsSchema = z.object({
  durationSeconds: z.coerce
    .number()
    .finite('durationSeconds must be a valid number.')
    .positive('durationSeconds must be greater than 0.')
    .max(
      MAX_TRANSCRIBE_DURATION_SECONDS,
      'Audio exceeds the 45-minute limit for single-request cloud transcription. Trim the video or switch to On-device Whisper.',
    ),
  captionLanguage: captionLanguageSchema.default('English'),
});

export const transcriptSegmentSchema = z.object({
  start_seconds: z.coerce.number().finite().min(0).max(21600),
  end_seconds: z.coerce.number().finite().min(0).max(21600),
  text: z.string().trim().min(1).max(2000),
});

export const findMomentsRequestSchema = z.object({
  transcript: z
    .array(transcriptSegmentSchema)
    .min(1, 'Transcript segments are required. Transcribe the extracted audio first.')
    .max(2000, 'Transcript exceeds 2,000 segments. Use a shorter recording or trim first.'),
  durationSeconds: z.coerce.number().finite().positive().max(21600).optional(),
  customPrompt: z
    .string()
    .max(400, 'Search prompt cannot exceed 400 characters.')
    .optional()
    .transform((val) => (val ? val.replace(/[\u0000-\u001F\u007F]/g, ' ').trim() : '')),
  clipCount: z.coerce.number().int().min(1).max(10).default(5),
  lengthRange: z.enum(['15-30', '30-60', '60-90']).default('30-60'),
  aspectFormat: z.enum(['original', 'vertical']).default('vertical'),
  captionLanguage: captionLanguageSchema.default('English'),
  allowOverlaps: z.coerce.boolean().optional().default(false),
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

export const generateMetadataRequestSchema = z.object({
  title: z.string().trim().max(150).default('Highlight Clip'),
  hookReason: z.string().trim().max(500).optional().default(''),
  captionText: z.string().trim().max(4000).optional().default(''),
  transcriptTexts: z.array(z.string().max(1000)).max(80).optional().default([]),
  targetLanguage: captionLanguageSchema.default('English'),
  platform: z.enum(['tiktok', 'reels', 'shorts', 'youtube', 'general']).default('general'),
});

const clipScoreInputSchema = z
  .object({
    id: z.string().trim().min(1).max(120).optional().default('clip'),
    title: z.string().trim().max(150).optional().default(''),
    startSeconds: z.coerce.number().finite().min(0).max(21600),
    endSeconds: z.coerce.number().finite().min(1).max(21600),
    captionText: z.string().trim().max(4000).optional().default(''),
    hookReason: z.string().trim().max(500).optional().default(''),
    transcriptTexts: z.array(z.string().max(1000)).max(60).optional().default([]),
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

export const scoreClipRequestSchema = clipScoreInputSchema;

export const scoreBatchRequestSchema = z.object({
  clips: z
    .array(clipScoreInputSchema)
    .min(1, 'At least one clip is required for batched scoring.')
    .max(20, 'Cannot score more than 20 clips in one batch.'),
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
 * Inspects in-memory buffer magic bytes to confirm an uploaded file is a genuine
 * OGG/Opus, MP3, WebM, M4A/MP4 audio, FLAC, or WAV stream.
 */
export function validateAudioMagicBytes(header: Buffer): boolean {
  if (!header || header.byteLength < 12) return false;

  // OGG ('OggS')
  if (header.subarray(0, 4).toString('ascii') === 'OggS') {
    return true;
  }

  // WAV ('RIFF'....'WAVE')
  if (
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return true;
  }

  // MP3 ('ID3' tag or MPEG frame sync 0xFF 0xE0..0xFF)
  if (header.subarray(0, 3).toString('ascii') === 'ID3') {
    return true;
  }
  if (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) {
    return true;
  }

  // WebM / Matroska audio (0x1A 0x45 0xDF 0xA3)
  if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) {
    return true;
  }

  // M4A / ISO BMFF ('ftyp')
  if (header.subarray(4, 8).toString('ascii') === 'ftyp') {
    return true;
  }

  // FLAC ('fLaC')
  if (header.subarray(0, 4).toString('ascii') === 'fLaC') {
    return true;
  }

  return false;
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
