/**
 * OWNER CONTENT CONFIGURATION
 */

export const CONTACT_CONFIG = {
  supportEmail: 'support@clipcutter.app',
  legalEffectiveDate: 'November 19, 2026',
};

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'formats',
    question: 'What file sizes and video formats are supported?',
    answer:
      'You can select local MP4 or MOV files up to 1 GB (1024 MB) or paste a direct CORS-enabled MP4/MOV link. Source videos never upload to any server; FFmpeg.wasm reads byte slices locally via WORKERFS.',
  },
  {
    id: 'privacy',
    question: 'How does audio-only transcription protect privacy and speed?',
    answer:
      'Instead of uploading gigabyte video files, Clip Cutter extracts a small 16 kHz mono speech audio track (32 kbps) inside your browser and sends only that compressed audio once to our Express Gemini proxy (up to 45 minutes). Transcripts are cached in IndexedDB keyed by file hash so repeat searches reuse zero transcription tokens.',
  },
  {
    id: 'whisper',
    question: 'When should I use the optional on-device Whisper toggle?',
    answer:
      'Cloud audio transcription is the default because it finishes quickly with minimal battery drain. If you prefer offline, zero-server transcription—or have a video longer than 45 minutes—enable "On-device Whisper" in settings. Whisper downloads a compact speech model into browser cache (~45 MB) and runs on WebGPU or WASM, which is noticeably slower and uses more battery.',
  },
  {
    id: 'usage',
    question: 'How does the daily AI usage meter work?',
    answer:
      'Every visitor gets a daily allowance (40 requests/units per day) tracked transparently in the top bar: 2 units for cloud transcription (cached once per video), 1 unit for finding moments, 1 unit for batched virality scoring across all clips at once, and 1 unit for social copy or translation. Manual cutting, trimming, and MP4/.SRT exports stay local and use zero AI units.',
  },
  {
    id: 'drive',
    question: 'How does Google Drive Project Sync work?',
    answer:
      'Sign in with Google and use the File Picker modal to save or load lightweight `.clipcutter.json` project snapshots (clips, settings, virality scores, and transcripts) across computers. Your video file itself stays local on your machine, and Drive updates always ask for explicit confirmation before overwriting an existing file.',
  },
  {
    id: 'languages',
    question: 'Which caption and transcript languages are supported?',
    answer:
      'Clip Cutter supports English, Hindi (Devanagari), Marathi (Devanagari), Hinglish (Roman script), and Spanish. Switching languages translates existing transcripts and updates both burned-in PNG captions and downloaded .SRT files.',
  },
];
