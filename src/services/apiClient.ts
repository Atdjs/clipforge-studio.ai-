import {
  type AppError,
  type AutoEditSettings,
  type CaptionLanguage,
  type ClipItem,
  type ClipSettings,
  type GeminiFileSession,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  type ServerUsageStatus,
  type TranscriptSegment,
  type ViralitySubScores,
} from '../types/clip';

const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MB slices keep browser memory flat on 1 GB files

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
 * Helper to create a structured AppError from any API/network failure.
 */
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

/**
 * Map raw server clip objects into client ClipItem records.
 */
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
      typeof clip.virality_score === 'number' ? Math.max(0, Math.min(100, Math.round(clip.virality_score))) : 75,
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
 * Try fetching a direct .mp4 / .mov URL in the browser.
 * If the remote server blocks cross-origin requests (CORS), throws a clear error
 * asking the user to download and upload the file instead.
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
      throw toAppError('fetch', { code: 'CANCELLED', message: 'Link fetch cancelled.', retryable: true }, 'Cancelled.');
    }
    throw toAppError(
      'fetch',
      {
        code: 'CORS_ERROR',
        message:
          'Could not fetch this video URL in the browser because the host blocks cross-origin requests (CORS) or is unreachable. Please download the video and upload the file in the "Upload file" tab instead.',
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
        message: `Could not fetch video URL (HTTP ${response.status}). Please download the file and upload it in the "Upload file" tab instead.`,
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
          'This link did not return a direct MP4 or MOV video stream. Please use a direct .mp4 URL, a public YouTube link, or upload the file directly.',
        retryable: false,
      },
      'URL did not return a video.',
    );
  }

  // Enforce 1 GB (1024 MB) limit during streamed URL download
  const contentLengthHeader = response.headers.get('content-length');
  const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (totalBytes > MAX_UPLOAD_BYTES) {
    throw toAppError(
      'fetch',
      {
        code: 'FILE_TOO_LARGE',
        message: `Remote video exceeds the 1 GB (${MAX_UPLOAD_MB} MB) maximum upload limit.`,
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
              message: `Remote video exceeds the 1 GB (${MAX_UPLOAD_MB} MB) maximum upload limit.`,
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
          message: `Remote video exceeds the 1 GB (${MAX_UPLOAD_MB} MB) maximum upload limit.`,
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
 * Step 2A: Stream the video file in 8 MB slices to the server, which forwards it to
 * Gemini's Files API. Keeps memory flat even on 1 GB (1024 MB) files and updates progress smoothly.
 */
export async function uploadVideoToGemini(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<GeminiFileSession & { state: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw toAppError(
      'upload',
      {
        code: 'FILE_TOO_LARGE',
        message: `Video file exceeds the 1 GB (${MAX_UPLOAD_MB} MB) maximum upload limit.`,
        retryable: false,
      },
      'File exceeds 1 GB upload limit.',
    );
  }

  let uploadId = '';

  const cleanupRemoteChunks = () => {
    if (!uploadId) return;
    const idToClean = uploadId;
    uploadId = '';
    void fetch(`/api/videos/upload/${encodeURIComponent(idToClean)}`, { method: 'DELETE' }).catch(
      () => {},
    );
  };

  try {
    onProgress(0);

    // 1. Initialize chunked upload session
    const initRes = await fetch('/api/videos/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      }),
    });

    const initBody = await initRes.json().catch(() => ({}));
    if (!initRes.ok) {
      throw toAppError('upload', initBody, 'Could not start video upload.');
    }
    uploadId = String(initBody.uploadId || '');

    // 2. Stream 8 MB File.slice chunks sequentially so the UI never freezes
    let offset = 0;
    while (offset < file.size) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const end = Math.min(file.size, offset + UPLOAD_CHUNK_BYTES);
      const chunkBlob = file.slice(offset, end);

      const chunkRes = await fetch(
        `/api/videos/upload/chunk?uploadId=${encodeURIComponent(uploadId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: chunkBlob,
          signal,
        },
      );

      if (!chunkRes.ok) {
        const errBody = await chunkRes.json().catch(() => ({}));
        throw toAppError('upload', errBody, `Upload failed during chunk transfer (HTTP ${chunkRes.status}).`);
      }

      offset = end;
      // Reserve 95..100% for server->Gemini handoff
      const pct = Math.min(95, Math.round((offset / file.size) * 95));
      onProgress(pct);
    }

    // 3. Finalize & push assembled file to Gemini Files API
    const completeRes = await fetch('/api/videos/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ uploadId }),
    });
    uploadId = ''; // Server consumes and deletes the temp file on complete

    const completeBody = await completeRes.json().catch(() => ({}));
    if (!completeRes.ok) {
      throw toAppError('upload', completeBody, 'Failed to finalize upload to Gemini Files API.');
    }

    onProgress(100);
    return {
      name: String(completeBody.name || ''),
      uri: String(completeBody.uri || ''),
      mimeType: String(completeBody.mimeType || 'video/mp4'),
      state: String(completeBody.state || 'PROCESSING'),
    };
  } catch (err) {
    cleanupRemoteChunks();
    if ((err as Error)?.name === 'AbortError') {
      throw toAppError(
        'upload',
        { code: 'CANCELLED', message: 'Upload cancelled.', retryable: true },
        'Upload cancelled.',
      );
    }
    if ((err as AppError)?.stage) {
      throw err;
    }
    throw toAppError(
      'upload',
      {
        code: 'NETWORK_ERROR',
        message: 'Network connection lost during upload. Please check your connection and retry.',
        retryable: true,
      },
      'Network error during upload.',
    );
  }
}

/**
 * Step 2B: Poll Gemini Files API status until the uploaded video reaches state === "ACTIVE".
 */
export async function waitForFileActive(
  fileName: string,
  onStatusUpdate: (stateLabel: string) => void,
  signal?: AbortSignal,
): Promise<GeminiFileSession> {
  const maxAttempts = 120; // Up to ~6 minutes for very large 30-min videos

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw toAppError('processing', { code: 'CANCELLED', message: 'Processing cancelled.', retryable: true }, 'Cancelled.');
    }

    const res = await fetch(`/api/videos/status?name=${encodeURIComponent(fileName)}`, {
      signal,
    }).catch((err) => {
      if (err?.name === 'AbortError') {
        throw toAppError('processing', { code: 'CANCELLED', message: 'Processing cancelled.', retryable: true }, 'Cancelled.');
      }
      throw toAppError(
        'processing',
        { code: 'NETWORK_ERROR', message: 'Connection interrupted while checking Gemini file status.', retryable: true },
        'Network error checking file status.',
      );
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw toAppError('processing', data, 'Failed while checking video processing status.');
    }

    const state = String(data.state || 'PROCESSING');
    onStatusUpdate(state);

    if (state === 'ACTIVE') {
      return {
        name: String(data.name || fileName),
        uri: String(data.uri || ''),
        mimeType: String(data.mimeType || 'video/mp4'),
      };
    }

    if (state === 'FAILED') {
      throw toAppError(
        'processing',
        {
          code: 'PROCESSING_FAILED',
          message: 'Gemini could not process this video file. Try re-encoding as standard H.264 MP4.',
          retryable: true,
        },
        'Video processing failed.',
      );
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 3000);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(
            toAppError('processing', { code: 'CANCELLED', message: 'Processing cancelled.', retryable: true }, 'Cancelled.'),
          );
        },
        { once: true },
      );
    });
  }

  throw toAppError(
    'processing',
    { code: 'TIMEOUT', message: 'Video processing took too long to become active. Please try again.', retryable: true },
    'Processing timed out.',
  );
}

/**
 * Step 2C (File Mode): Ask Gemini Flash (gemini-4-hydrogen) to find non-overlapping highlight clips.
 */
export async function analyzeVideoForClips(
  params: {
    session: GeminiFileSession;
    durationSeconds: number;
    settings: ClipSettings;
  },
  signal?: AbortSignal,
): Promise<ClipItem[]> {
  const res = await fetch('/api/videos/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      fileUri: params.session.uri,
      mimeType: params.session.mimeType,
      durationSeconds: params.durationSeconds,
      clipCount: params.settings.clipCount,
      lengthRange: params.settings.lengthRange,
      aspectFormat: params.settings.aspectFormat,
      customPrompt: params.settings.customPrompt,
      captionLanguage: params.settings.captionLanguage,
    }),
  }).catch((err) => {
    if (err?.name === 'AbortError') {
      throw toAppError('analyze', { code: 'CANCELLED', message: 'Analysis cancelled.', retryable: true }, 'Cancelled.');
    }
    throw toAppError(
      'analyze',
      { code: 'NETWORK_ERROR', message: 'Could not reach analysis server. Please retry.', retryable: true },
      'Network error during analysis.',
    );
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw toAppError('analyze', data, 'Gemini analysis failed.');
  }

  const rawClips: RawClipResponse[] = Array.isArray(data.clips) ? data.clips : [];
  return mapRawClips(rawClips, params.settings.captionLanguage, params.settings.autoEdit);
}

/**
 * Step 2C (YouTube Link Mode): Pass a public YouTube URL directly to Gemini Flash as file_uri
 * using the exact same JSON response schema.
 */
export async function analyzeYouTubeForClips(
  params: {
    youtubeUrl: string;
    settings: ClipSettings;
  },
  signal?: AbortSignal,
): Promise<ClipItem[]> {
  const res = await fetch('/api/videos/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      youtubeUrl: params.youtubeUrl,
      clipCount: params.settings.clipCount,
      lengthRange: params.settings.lengthRange,
      aspectFormat: params.settings.aspectFormat,
      customPrompt: params.settings.customPrompt,
      captionLanguage: params.settings.captionLanguage,
    }),
  }).catch((err) => {
    if (err?.name === 'AbortError') {
      throw toAppError('analyze', { code: 'CANCELLED', message: 'Analysis cancelled.', retryable: true }, 'Cancelled.');
    }
    throw toAppError(
      'analyze',
      { code: 'NETWORK_ERROR', message: 'Could not reach analysis server. Please retry.', retryable: true },
      'Network error during YouTube analysis.',
    );
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw toAppError('analyze', data, 'Gemini could not analyze this YouTube video. Make sure it is public.');
  }

  const rawClips: RawClipResponse[] = Array.isArray(data.clips) ? data.clips : [];
  return mapRawClips(rawClips, params.settings.captionLanguage, params.settings.autoEdit);
}

/**
 * Translate existing clips' captions and phrase-level transcripts when the user changes caption language.
 */
export async function translateClipsCaptions(
  clips: ClipItem[],
  targetLanguage: CaptionLanguage,
  signal?: AbortSignal,
): Promise<ClipItem[]> {
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
      throw toAppError('analyze', { code: 'CANCELLED', message: 'Translation cancelled.', retryable: true }, 'Cancelled.');
    }
    throw toAppError(
      'analyze',
      { code: 'NETWORK_ERROR', message: 'Could not reach translation server. Please retry.', retryable: true },
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

  return clips.map((clip) => {
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
  });
}

/**
 * Best-effort cleanup of the remote Gemini file when the user resets or replaces the video.
 */
export async function deleteRemoteVideoFile(fileName?: string): Promise<void> {
  if (!fileName) return;
  try {
    await fetch(`/api/videos/file?name=${encodeURIComponent(fileName)}`, {
      method: 'DELETE',
    });
  } catch {
    // Non-critical cleanup
  }
}

/**
 * Fetch current server-enforced AI credit quota status.
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
 * Proxy call to /api/transcribe for full timestamped speech transcription.
 */
export async function transcribeVideoViaProxy(
  params: {
    session: GeminiFileSession;
    durationSeconds?: number;
    captionLanguage: CaptionLanguage;
  },
  signal?: AbortSignal,
): Promise<{ transcript: TranscriptSegment[]; usage?: ServerUsageStatus }> {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      fileUri: params.session.uri,
      mimeType: params.session.mimeType,
      durationSeconds: params.durationSeconds,
      captionLanguage: params.captionLanguage,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw toAppError('analyze', data, 'Failed to transcribe video.');
  }

  return {
    transcript: Array.isArray(data.transcript) ? (data.transcript as TranscriptSegment[]) : [],
    usage: data.usage as ServerUsageStatus | undefined,
  };
}

/**
 * Proxy call to /api/find-moments for prompt-based searching across transcript or video.
 */
export async function findMomentsViaProxy(
  params: {
    customPrompt: string;
    transcript?: TranscriptSegment[];
    session?: GeminiFileSession | null;
    youtubeUrl?: string;
    durationSeconds?: number;
    settings: ClipSettings;
    clipCount?: number;
  },
  signal?: AbortSignal,
): Promise<{ clips: ClipItem[]; usage?: ServerUsageStatus }> {
  const res = await fetch('/api/find-moments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      fileUri: params.session?.uri,
      mimeType: params.session?.mimeType,
      youtubeUrl: params.youtubeUrl,
      transcript: params.transcript?.map((t) => ({
        start_seconds: t.start_seconds,
        end_seconds: t.end_seconds,
        text: t.text,
      })),
      durationSeconds: params.durationSeconds,
      customPrompt: params.customPrompt,
      clipCount: params.clipCount ?? 5,
      lengthRange: params.settings.lengthRange,
      captionLanguage: params.settings.captionLanguage,
    }),
  }).catch((err) => {
    if (err?.name === 'AbortError') {
      throw toAppError('analyze', { code: 'CANCELLED', message: 'Moment search cancelled.', retryable: true }, 'Cancelled.');
    }
    throw toAppError('analyze', { code: 'NETWORK_ERROR', message: 'Could not reach /api/find-moments.', retryable: true }, 'Network error.');
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
  const res = await fetch('/api/generate-metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      title: params.clip.title,
      hookReason: params.clip.hook_reason,
      captionText: params.clip.caption_text,
      transcriptTexts: (params.clip.transcript || []).map((t) => t.text).slice(0, 40),
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
}

/**
 * Compute or refresh 0-100 virality score + hook/emotion/flow/shareability breakdown via /api/clips/score.
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
      transcriptTexts: (clip.transcript || []).map((t) => t.text).slice(0, 40),
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
}

/**
 * Submit an email with explicit consent to the Pro waitlist.
 */
export async function joinProWaitlist(params: {
  email: string;
  consent: boolean;
}): Promise<{ ok: boolean; alreadyJoined: boolean; message: string }> {
  const res = await fetch('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: params.email,
      consent: params.consent,
      plan: 'pro',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(data.message || 'Could not join waitlist.'));
  }

  return {
    ok: Boolean(data.ok),
    alreadyJoined: Boolean(data.alreadyJoined),
    message: String(data.message || 'Added to the waitlist.'),
  };
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

