export type VideoUrlClassification =
  | { kind: 'direct'; url: string }
  | { kind: 'invalid'; reason: string };

const BLOCKED_PLATFORM_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'vimeo.com',
  'tiktok.com',
  'www.tiktok.com',
  'instagram.com',
  'www.instagram.com',
  'x.com',
  'twitter.com',
];

/**
 * Validates that a user-pasted URL is a direct HTTP(S) MP4/MOV/WebM media link.
 * YouTube and social web pages are explicitly rejected.
 */
export function classifyVideoUrl(rawInput: string): VideoUrlClassification {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { kind: 'invalid', reason: 'Paste a direct .mp4 or .mov video URL.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      kind: 'invalid',
      reason: 'Enter a valid https:// URL pointing directly to an MP4 or MOV file.',
    };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { kind: 'invalid', reason: 'Only http:// or https:// video links are supported.' };
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_PLATFORM_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
    return {
      kind: 'invalid',
      reason:
        'YouTube and social platform URLs are not supported. Paste a direct .mp4 / .mov file URL or upload a local file.',
    };
  }

  return { kind: 'direct', url: trimmed };
}

export const classifyDirectVideoUrl = classifyVideoUrl;
