/**
 * Helpers for parsing, validating, and building embed/timestamp URLs for public YouTube videos
 * as well as detecting direct .mp4/.mov URLs.
 */

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extract an 11-character YouTube video ID from standard watch, youtu.be, shorts, live, or embed URLs.
 * Returns null if the URL is not a recognized YouTube video link.
 */
export function extractYouTubeVideoId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const candidate = parsed.pathname.split('/').filter(Boolean)[0] || '';
    return YOUTUBE_ID_REGEX.test(candidate) ? candidate : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (parsed.pathname === '/watch') {
      const v = parsed.searchParams.get('v') || '';
      return YOUTUBE_ID_REGEX.test(v) ? v : null;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (
      segments.length >= 2 &&
      (segments[0] === 'shorts' || segments[0] === 'live' || segments[0] === 'embed')
    ) {
      return YOUTUBE_ID_REGEX.test(segments[1]) ? segments[1] : null;
    }
  }

  return null;
}

/**
 * Canonical YouTube watch URL to pass to Gemini as a video file_uri.
 */
export function buildCanonicalYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Build a YouTube share URL jumping directly to a clip's start timestamp.
 */
export function buildYouTubeTimestampUrl(videoId: string, startSeconds: number): string {
  const t = Math.max(0, Math.floor(startSeconds));
  return `https://youtu.be/${videoId}?t=${t}`;
}

/**
 * Build an embedded YouTube iframe URL restricted to [start, end] seconds.
 */
export function buildYouTubeEmbedUrl(
  videoId: string,
  startSeconds: number,
  endSeconds: number,
): string {
  const start = Math.max(0, Math.floor(startSeconds));
  const end = Math.max(start + 1, Math.ceil(endSeconds));
  return `https://www.youtube.com/embed/${videoId}?start=${start}&end=${end}&rel=0&modestbranding=1`;
}

/**
 * Classify a user-pasted URL into a YouTube video, a direct video URL, or invalid.
 */
export function classifyVideoUrl(
  rawUrl: string,
):
  | { kind: 'youtube'; videoId: string; canonicalUrl: string }
  | { kind: 'direct'; url: string }
  | { kind: 'invalid'; reason: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { kind: 'invalid', reason: 'Please paste a public YouTube link or a direct .mp4 URL.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      kind: 'invalid',
      reason: 'That does not look like a valid URL. Include https:// at the start.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { kind: 'invalid', reason: 'Only http:// and https:// video links are supported.' };
  }

  const ytId = extractYouTubeVideoId(trimmed);
  if (ytId) {
    return {
      kind: 'youtube',
      videoId: ytId,
      canonicalUrl: buildCanonicalYouTubeUrl(ytId),
    };
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') {
    return {
      kind: 'invalid',
      reason:
        'Could not find a YouTube video ID in that link. Paste a watch, Shorts, live, or youtu.be URL.',
    };
  }

  return { kind: 'direct', url: parsed.toString() };
}
