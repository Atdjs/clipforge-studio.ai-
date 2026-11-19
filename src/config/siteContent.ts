import demoPosterUrl from '../assets/images/demo_studio_poster_1795065163760.jpg';

/**
 * OWNER CONTENT CONFIGURATION
 * Replace values below with your own media files, contact email, and branding details.
 */

export const CONTACT_CONFIG = {
  /** Replace with your real support / DMCA / privacy inbox before launch */
  supportEmail: 'support@clipcutter.app',
  legalEffectiveDate: 'November 18, 2026',
};

export const SAMPLE_VIDEO_CONFIG = {
  /** Replace `/sample-demo.mp4` inside `public/` with any short sample MP4 file (recommended < 15 MB). */
  url: '/sample-demo.mp4',
  fileName: 'clip-cutter-sample-podcast.mp4',
};

export const DEMO_MEDIA_CONFIG = {
  /**
   * Swap `posterUrl` and `videoUrl` with your own walkthrough / creator source video in `public/`.
   * Keeping `videoUrl` in `public/` guarantees zero broken external links.
   */
  posterUrl: demoPosterUrl,
  videoUrl: '/sample-demo.mp4',
  sourceTitle: 'Studio Founder Interview — Full Episode',
  sourceDuration: '28:40',
  clips: [
    {
      id: 'demo-clip-1',
      title: 'Why pricing early creates better feedback',
      timeRange: '04:12 – 04:49',
      captionPreview: 'Wait until you hear why free users rarely ask for the right features.',
      captionPresetLabel: 'Studio Amber',
      viralityScore: 91,
      subScores: { hook: 94, emotion: 86, shareability: 92 },
    },
    {
      id: 'demo-clip-2',
      title: 'The three-frame retention rule',
      timeRange: '11:05 – 11:41',
      captionPreview: 'If the first 2 seconds stall, the algorithm drops distribution.',
      captionPresetLabel: 'Minimal White',
      viralityScore: 84,
      subScores: { hook: 87, emotion: 78, shareability: 86 },
    },
    {
      id: 'demo-clip-3',
      title: 'Cutting a weekly podcast in-house',
      timeRange: '19:22 – 20:04',
      captionPreview: 'We cut 6 vertical shorts directly on the laptop before uploading.',
      captionPresetLabel: 'Creator Gold',
      viralityScore: 76,
      subScores: { hook: 79, emotion: 72, shareability: 77 },
    },
  ],
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
      'You can upload MP4 or MOV files up to 1 GB (1024 MB). Large files stream to our proxy in 8 MB slices and mount locally via WORKERFS. Best performance is on source videos up to 30 minutes; rendering speed and memory limits depend on your device.',
  },
  {
    id: 'privacy',
    question: 'Where are my videos processed and stored?',
    answer:
      'Videos are cut, reframed, silenced-trimmed, and captioned directly on your device using WebAssembly FFmpeg. Your clips and PNG watermark stay in your browser IndexedDB. Audio and video streams are sent securely through our server proxy to Gemini for transcription and highlight analysis only when you start an AI analysis, and temporary server chunks are deleted immediately after handoff.',
  },
  {
    id: 'youtube',
    question: 'How do YouTube links and copyright work?',
    answer:
      'When you paste a public YouTube link, Gemini analyzes the video for highlight timestamps and transcripts without ripping or downloading the stream in your browser. To export cut MP4 files from YouTube timestamps, switch to the Upload tab with your own authorized source file. You must hold copyright, license, or fair-use permission for any media you process.',
  },
  {
    id: 'credits',
    question: 'How do daily AI credits work?',
    answer:
      'Each visitor receives 40 daily AI credits tracked on our backend server: 3 credits for full highlight analysis or prompt moment search, 2 credits for full transcription, and 1 credit for virality re-scoring, social copy generation, or caption translation. Manual cutting, waveform trimming, and local FFmpeg exports never consume AI credits.',
  },
  {
    id: 'languages',
    question: 'Which caption and transcript languages are supported?',
    answer:
      'Clip Cutter supports English, Hindi (Devanagari), Marathi (Devanagari), Hinglish (Roman script), and Spanish. Changing the caption language translates existing transcripts and updates both burned-in PNG captions and downloaded .SRT files.',
  },
  {
    id: 'refunds',
    question: 'What is included in Free vs Pro, and how do refunds work?',
    answer:
      'Clip Cutter is currently free to use with 720p export presets, optional brand watermark overlay, and 40 daily AI credits. Paid Pro plans (1080p export, watermark-free defaults, and higher AI credit allowances) are not open for billing yet—joining the waitlist does not charge your card. When Pro launches, unused first-month subscriptions will include a 14-day refund window.',
  },
];
