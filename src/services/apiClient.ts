import {
  type AppError,
  type AutoEditSettings,
  type CaptionLanguage,
  type ClipItem,
  type ClipSettings,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  type ServerUsageStatus,
  type TranscriptSegment,
  type ViralitySubScores,
} from '../types/clip';

interface RawClipResponse {
  start_seconds: number;
  end_seconds: number;
  title: string;
  hook_reason: string;
  caption_text: string;
  speaker_x_ratio?: number;
  virality_score?: number;
  virality_reason?: string;
  sub_scores?: ViralitySubScores;
  hook_line?: string;
  hook_start_seconds?: number;
  hook_end_seconds?: number;
  description?: string;
  hashtags?: string[];
  transcript?: TranscriptSegment[];
}

/**
 * In-flight request deduplication so rapid double-clicks reuse the same network Promise.
 */
const inFlightRequests = new Map<string, Promise<unknown>>();

function dedupInFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = factory().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

function toAppError(
  stage: AppError['stage'],
  payload: Partial<{ code: string; message: string; retryable: boolean }>,
  fallbackMessage: string,
): AppError {
  return {
    stage,
    code: payload.code || 'API_ERROR',
    message: payload.message || fallbackMessage,
    retryable: payload.retryable !== false,
  };
}

function mapRawClips(
  rawClips: RawClipResponse[],
  captionLanguage: CaptionLanguage,
  autoEdit: AutoEditSettings,
): ClipItem[] {
  return rawClips.map((clip, index) => ({
    id: `clip-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    start_seconds: Number(clip.start_seconds),
    end_seconds: Number(clip.end_seconds),
    title: clip.title,
    hook_reason: clip.hook_reason,
    caption_text: clip.caption_text,
    speaker_x_ratio:
      typeof clip.speaker_x_ratio === 'number' && Number.isFinite(clip.speaker_x_ratio)
        ? Math.max(0.15, Math.min(0.85, clip.speaker_x_ratio))
        : 0.5,
    virality_score:
      typeof clip.virality_score === 'number'
        ? Math.max(0, Math.min(100, Math.round(clip.virality_score)))
        : 75,
    virality_reason: clip.virality_reason || clip.hook_reason,
    sub_scores: clip.sub_scores,
    hook_line: clip.hook_line,
    hook_start_seconds: clip.hook_start_seconds,
    hook_end_seconds: clip.hook_end_seconds,
    description: clip.description,
    hashtags: Array.isArray(clip.hashtags) ? clip.hashtags : [],
    transcript: Array.isArray(clip.transcript) ? clip.transcript : [],
    captionLanguage,
    removeSilencesAndFillers: autoEdit.removeSilences,
    cutStatus: 'idle',
    cutProgress: 0,
  }));
}

/**
 * Fetch a direct .mp4 / .mov URL in the browser.
 * Remote server must allow CORS; HTML or non-media URLs are rejected cleanly.
 */
export async function fetchDirectVideoUrlInBrowser(
  url: string,
  onProgress: (percent: number | null) => void,
  signal?: AbortSignal,
): Promise<File> {
  let response: Response;
  try {
    response = await fetch(url, { mode: 'cors', signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw toAppError(
        'fetch',
        { code: 'CANCELLED', message: 'Link fetch cancelled.', retryable: true },
        'Cancelled.',
      );
    }
    throw toAppError(
      'fetch',
      {
        code: 'CORS_ERROR',
        message:
          'Could not fetch this video URL in the browser because the host blocks cross-origin requests (CORS) or is unreachable. Please download the MP4/MOV file and upload it in the "Upload file" tab.',
        retryable: false,
      },
      'CORS blocked video fetch.',
    );
  }

  if (!response.ok) {
    throw toAppError(
      'fetch',
      {
        code: 'FETCH_HTTP_ERROR',
        message: `Could not fetch video URL (HTTP ${response.status}). Please download the file and upload it directly.`,
        retryable: false,
      },
      'Failed to fetch video URL.',
    );
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const cleanPath = url.split('?')[0].toLowerCase();
  const looksLikeVideo =
    contentType.startsWith('video/') ||
    contentType === 'application/octet-stream' ||
    cleanPath.endsWith('.mp4') ||
    cleanPath.endsWith('.mov');

  if (!looksLikeVideo) {
    throw toAppError(
      'fetch',
      {
        code: 'NOT_A_VIDEO',
        message:
          'This link did not return a direct MP4 or MOV video stream. Please paste a direct .mp4/.mov URL or upload the video file.',
        retryable: false,
      },
      'URL did not return a video.',
    );
  }

  const contentLengthHeader = response.headers.get('content-length');
  const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (totalBytes > MAX_UPLOAD_BYTES) {
    throw toAppError(
      'fetch',
      {
        code: 'FILE_TOO_LARGE',
        message: `Remote video exceeds the 1 GB (${MAX_UPLOAD_MB} MB) maximum size.`,
        retryable: false,
      },
      'Remote video exceeds 1 GB limit.',
    );
  }

  let blob: Blob;
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.byteLength;
        if (receivedBytes > MAX_UPLOAD_BYTES) {
          void reader.cancel();
          throw toAppError(
            'fetch',
            {
              code: 'FILE_TOO_LARGE',
              message: `Remote video exceeds the 1 GB (${MAX_UPLOAD_MB} MB) maximum size.`,
              retryable: false,
            },
            'Remote video exceeds 1 GB limit.',
          );
        }
        chunks.push(new Uint8Array(value));
        if (totalBytes > 0) {
          onProgress(Math.min(100, Math.round((receivedBytes / totalBytes) * 100)));
        } else {
          onProgress(null);
        }
      }
    }
    blob = new Blob(chunks, {
      type: contentType.startsWith('video/') ? contentType : 'video/mp4',
    });
  } else {
    onProgress(null);
    blob = await response.blob();
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw toAppError(
        'fetch',
        {
          code: 'FILE_TOO_LARGE',
          message: `Remote video exceeds the 1 GB (${MAX_UPLOAD_MB} MB) maximum size.`,
          retryable: false,
        },
        'Remote video exceeds 1 GB limit.',
      );
    }
  }

  const rawFileName = url.split('?')[0].split('/').filter(Boolean).pop() || 'linked-video.mp4';
  const safeName = /\.(mp4|mov)$/i.test(rawFileName) ? rawFileName : `${rawFileName}.mp4`;
  return new File([blob], safeName, {
    type: blob.type || (safeName.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4'),
  });
}

/**
 * Send only the compact 16 kHz mono extracted audio Blob in a single request to /api/transcribe.
 * Video bytes are never uploaded.
 */
export async function transcribeAudioBlobViaProxy(
  params: {
    audioBlob: Blob;
    fileName: string;
    durationSeconds: number;
    captionLanguage: CaptionLanguage;
  },
  signal?: AbortSignal,
): Promise<{ transcript: TranscriptSegment[]; usage?: ServerUsageStatus }> {
  const dedupKey = `transcribe:${params.fileName}:${params.audioBlob.size}:${Math.round(
    params.durationSeconds,
  )}:${params.captionLanguage}`;

  return dedupInFlight(dedupKey, async () => {
    const formData = new FormData();
    formData.append('audio', params.audioBlob, params.fileName);
    formData.append('durationSeconds', String(Math.round(params.durationSeconds * 10) / 10));
    formData.append('captionLanguage', params.captionLanguage);

    const res = await fetch('/api/transcribe', {
      method: 'POST',
      signal,
      body: formData,
    }).catch((err) => {
      if (err?.name === 'AbortError') {
        throw toAppError(
          'transcribe',
          { code: 'CANCELLED', message: 'Transcription cancelled.', retryable: true },
          'Cancelled.',
        );
      }
      throw toAppError(
        'transcribe',
        { code: 'NETWORK_ERROR', message: 'Could not reach /api/transcribe.', retryable: true },
        'Network error.',
      );
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toAppError('transcribe', data, 'Failed to transcribe extracted audio.');
    }

    return {
      transcript: Array.isArray(data.transcript) ? (data.transcript as TranscriptSegment[]) : [],
      usage: data.usage as ServerUsageStatus | undefined,
    };
  });
}

/**
 * Text-only highlight & prompt moment detection on top of the cached transcript.
 */
export async function findMomentsViaProxy(
  params: {
    transcript: TranscriptSegment[];
    durationSeconds: number;
    customPrompt: string;
    settings: ClipSettings;
    clipCount?: number;
    allowOverlaps?: boolean;
  },
  signal?: AbortSignal,
): Promise<{ clips: ClipItem[]; usage?: ServerUsageStatus }> {
  const compactTranscript = params.transcript.map((t) => ({
    start_seconds: Number(t.start_seconds.toFixed(2)),
    end_seconds: Number(t.end_seconds.toFixed(2)),
    text: t.text,
  }));

  const dedupKey = `moments:${params.durationSeconds}:${params.clipCount ?? params.settings.clipCount}:${
    params.settings.lengthRange
  }:${params.settings.captionLanguage}:${params.customPrompt.trim()}:${compactTranscript.length}:${
    compactTranscript[0]?.text?.slice(0, 24) || ''
  }`;

  return dedupInFlight(dedupKey, async () => {
    const res = await fetch('/api/find-moments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        transcript: compactTranscript,
        durationSeconds: params.durationSeconds,
        customPrompt: params.customPrompt,
        clipCount: params.clipCount ?? params.settings.clipCount,
        lengthRange: params.settings.lengthRange,
        captionLanguage: params.settings.captionLanguage,
        allowOverlaps: Boolean(params.allowOverlaps),
      }),
    }).catch((err) => {
      if (err?.name === 'AbortError') {
        throw toAppError(
          'analyze',
          { code: 'CANCELLED', message: 'Moment search cancelled.', retryable: true },
          'Cancelled.',
        );
      }
      throw toAppError(
        'analyze',
        { code: 'NETWORK_ERROR', message: 'Could not reach /api/find-moments.', retryable: true },
        'Network error.',
      );
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toAppError('analyze', data, 'Failed to find matching clip moments.');
    }

    const rawClips: RawClipResponse[] = Array.isArray(data.clips) ? data.clips : [];
    return {
      clips: mapRawClips(rawClips, params.settings.captionLanguage, params.settings.autoEdit),
      usage: data.usage as ServerUsageStatus | undefined,
    };
  });
}

/**
 * Score multiple clips in ONE batched text-only Gemini call to save tokens & quota.
 */
export async function scoreClipsBatchViaProxy(
  clips: ClipItem[],
  signal?: AbortSignal,
): Promise<{
  scores: Array<{
    id: string;
    virality_score: number;
    virality_reason: string;
    sub_scores: ViralitySubScores;
  }>;
  usage?: ServerUsageStatus;
}> {
  if (clips.length === 0) {
    return { scores: [] };
  }

  const payloadClips = clips.slice(0, 12).map((clip) => ({
    id: clip.id,
    title: clip.title,
    startSeconds: clip.start_seconds,
    endSeconds: clip.end_seconds,
    captionText: clip.caption_text,
    hookReason: clip.hook_reason,
    transcriptTexts: (clip.transcript || []).map((t) => t.text).slice(0, 20),
  }));

  const dedupKey = `score-batch:${payloadClips.map((c) => `${c.id}:${c.startSeconds}-${c.endSeconds}`).join(',')}`;

  return dedupInFlight(dedupKey, async () => {
    const res = await fetch('/api/clips/score-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ clips: payloadClips }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toAppError('analyze', data, 'Could not score clips in batch.');
    }

    return {
      scores: Array.isArray(data.scores) ? data.scores : [],
      usage: data.usage as ServerUsageStatus | undefined,
    };
  });
}

/**
 * Score a single clip on demand.
 */
export async function scoreClipViaProxy(
  clip: ClipItem,
  signal?: AbortSignal,
): Promise<{
  virality_score: number;
  virality_reason: string;
  sub_scores: ViralitySubScores;
  usage?: ServerUsageStatus;
}> {
  const dedupKey = `score:${clip.id}:${clip.start_seconds}:${clip.end_seconds}:${clip.title}`;
  return dedupInFlight(dedupKey, async () => {
    const res = await fetch('/api/clips/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        title: clip.title,
        startSeconds: clip.start_seconds,
        endSeconds: clip.end_seconds,
        captionText: clip.caption_text,
        hookReason: clip.hook_reason,
        transcriptTexts: (clip.transcript || []).map((t) => t.text).slice(0, 30),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toAppError('analyze', data, 'Could not score clip virality.');
    }

    return {
      virality_score: Number(data.virality_score ?? 75),
      virality_reason: String(data.virality_reason || ''),
      sub_scores: data.sub_scores as ViralitySubScores,
      usage: data.usage as ServerUsageStatus | undefined,
    };
  });
}

/**
 * Translate existing clips' captions and phrase-level transcripts.
 */
export async function translateClipsCaptions(
  clips: ClipItem[],
  targetLanguage: CaptionLanguage,
  signal?: AbortSignal,
): Promise<{ clips: ClipItem[]; usage?: ServerUsageStatus }> {
  const dedupKey = `translate:${targetLanguage}:${clips.map((c) => c.id).join(',')}`;
  return dedupInFlight(dedupKey, async () => {
    const res = await fetch('/api/clips/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        targetLanguage,
        clips: clips.map((c) => ({
          id: c.id,
          caption_text: c.caption_text,
          transcript: (c.transcript || []).map((t) => ({
            start_seconds: t.start_seconds,
            end_seconds: t.end_seconds,
            text: t.text,
          })),
        })),
      }),
    }).catch((err) => {
      if (err?.name === 'AbortError') {
        throw toAppError(
          'analyze',
          { code: 'CANCELLED', message: 'Translation cancelled.', retryable: true },
          'Cancelled.',
        );
      }
      throw toAppError(
        'analyze',
        { code: 'NETWORK_ERROR', message: 'Could not reach translation server.', retryable: true },
        'Network error during caption translation.',
      );
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toAppError('analyze', data, 'Could not translate captions. Please retry.');
    }

    const translations = Array.isArray(data.translations)
      ? (data.translations as Array<{ id: string; caption_text: string; transcript_texts: string[] }>)
      : [];
    const byId = new Map(translations.map((item) => [item.id, item]));

    return {
      clips: clips.map((clip) => {
        const tr = byId.get(clip.id);
        if (!tr) return clip;
        return {
          ...clip,
          caption_text: tr.caption_text || clip.caption_text,
          captionLanguage: targetLanguage,
          transcript: (clip.transcript || []).map((seg, i) => ({
            ...seg,
            text: tr.transcript_texts?.[i] || seg.text,
          })),
        };
      }),
      usage: data.usage as ServerUsageStatus | undefined,
    };
  });
}

/**
 * Proxy call to /api/generate-metadata for viral titles, descriptions, and hashtags.
 */
export async function generateClipMetadataViaProxy(
  params: {
    clip: ClipItem;
    targetLanguage: CaptionLanguage;
    platform?: 'tiktok' | 'reels' | 'shorts' | 'youtube' | 'general';
  },
  signal?: AbortSignal,
): Promise<{
  titles: string[];
  description: string;
  hashtags: string[];
  usage?: ServerUsageStatus;
}> {
  const dedupKey = `meta:${params.clip.id}:${params.targetLanguage}:${params.platform || 'general'}`;
  return dedupInFlight(dedupKey, async () => {
    const res = await fetch('/api/generate-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        title: params.clip.title,
        hookReason: params.clip.hook_reason,
        captionText: params.clip.caption_text,
        transcriptTexts: (params.clip.transcript || []).map((t) => t.text).slice(0, 30),
        targetLanguage: params.targetLanguage,
        platform: params.platform || 'general',
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toAppError('analyze', data, 'Could not generate clip metadata.');
    }

    return {
      titles: Array.isArray(data.titles) ? (data.titles as string[]) : [],
      description: String(data.description || ''),
      hashtags: Array.isArray(data.hashtags) ? (data.hashtags as string[]) : [],
      usage: data.usage as ServerUsageStatus | undefined,
    };
  });
}

/**
 * Fetch current server-enforced AI usage quota status.
 */
export async function fetchServerUsage(): Promise<ServerUsageStatus | null> {
  try {
    const res = await fetch('/api/usage');
    if (!res.ok) return null;
    return (await res.json()) as ServerUsageStatus;
  } catch {
    return null;
  }
}

/**
 * Submit feedback directly to backend storage.
 */
export async function submitUserFeedback(params: {
  category: 'bug' | 'feature' | 'general';
  message: string;
  email?: string;
}): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(data.message || 'Could not send feedback.'));
  }

  return {
    ok: Boolean(data.ok),
    message: String(data.message || 'Feedback received.'),
  };
}
