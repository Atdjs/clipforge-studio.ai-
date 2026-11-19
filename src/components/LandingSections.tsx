import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FAQ_ITEMS } from '../config/siteContent';

const CAPABILITIES = [
  {
    title: 'On-device audio extraction',
    desc: 'Extracts a compact 16 kHz mono speech track in browser WASM so large 1 GB videos never upload over your network.',
  },
  {
    title: 'Cached transcript & batched scoring',
    desc: 'Transcribes once per file hash into IndexedDB, finds moments text-only, and scores clips in one batched request.',
  },
  {
    title: 'Optional on-device Whisper',
    desc: 'Switch to local WebGPU/WASM speech recognition for zero-server transcription (slower and uses more battery).',
  },
  {
    title: 'Silence & filler trimming',
    desc: 'Combines FFmpeg silence detection (>0.45s pauses) with flagged filler spans for tighter spoken pacing.',
  },
  {
    title: 'Burned-in styled captions',
    desc: 'Renders crisp PNG subtitles across five presets in English, Hindi, Marathi, Hinglish, and Spanish.',
  },
  {
    title: 'Google Drive session sync',
    desc: 'Save and restore `.clipcutter.json` project timelines, virality scores, and transcripts via Google File Picker.',
  },
];

export function LandingSections() {
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

  return (
    <div className="space-y-16 pt-6 sm:space-y-20 sm:pt-8">
      {/* HOW IT WORKS */}
      <section
        id="how-it-works"
        aria-labelledby="how-heading"
        className="scroll-mt-20 border-y border-[#DFDCD2] py-10 dark:border-[#2A2A2E]"
      >
        <h2
          id="how-heading"
          className="mb-6 font-display text-xl font-semibold text-[#151517] dark:text-[#F2F0EA]"
        >
          How it works
        </h2>

        <ol className="grid grid-cols-1 divide-y divide-[#DFDCD2] md:grid-cols-3 md:divide-x md:divide-y-0 dark:divide-[#2A2A2E]">
          {[
            {
              num: '01',
              title: 'Select a video or direct URL',
              detail:
                'Open a local MP4/MOV up to 1 GB (1024 MB) via WORKERFS or paste a direct CORS-enabled MP4/MOV link.',
            },
            {
              num: '02',
              title: 'Transcribe speech audio once',
              detail:
                'Browser FFmpeg extracts 16 kHz mono audio (capped at 45 min for cloud), caches the transcript locally, and scores highlights.',
            },
            {
              num: '03',
              title: 'Cut, caption & export locally',
              detail:
                'Trim silences, reframe to 9:16, burn captions on your device, and download MP4, .SRT, JSON, or ZIP.',
            },
          ].map((step) => (
            <li
              key={step.num}
              className="py-5 first:pt-0 last:pb-0 md:px-6 md:py-0 md:first:pl-0 md:last:pr-0"
            >
              <span className="font-mono text-xs font-semibold tabular-nums text-[#E8A33D]">
                {step.num}
              </span>
              <h3 className="mt-2 font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
                {step.detail}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* CAPABILITIES + PROCESSING LIMITS */}
      <section id="features" aria-labelledby="features-heading" className="scroll-mt-20 space-y-6">
        <div className="space-y-1.5">
          <p className="font-mono text-xs uppercase tracking-wider text-[#E8A33D]">
            Capabilities
          </p>
          <h2
            id="features-heading"
            className="font-display text-2xl font-semibold tracking-tight text-[#151517] sm:text-3xl [text-wrap:balance] dark:text-[#F2F0EA]"
          >
            Built for editorial control, low cost, and privacy
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-x-10 gap-y-6 border-t border-[#DFDCD2] pt-6 md:grid-cols-2 dark:border-[#2A2A2E]">
          {CAPABILITIES.map((cap) => (
            <div key={cap.title} className="space-y-1">
              <h3 className="font-display text-base font-medium text-[#151517] dark:text-[#F2F0EA]">
                {cap.title}
              </h3>
              <p className="text-sm leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
                {cap.desc}
              </p>
            </div>
          ))}
        </div>

        <p className="rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-4 py-3 font-mono text-xs leading-relaxed text-[#64625D] dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#8C8C93]">
          <strong className="font-semibold text-[#151517] dark:text-[#F2F0EA]">
            Processing limits:
          </strong>{' '}
          Local MP4 and MOV files up to 1 GB (1024 MB). Cloud audio transcription supports recordings up to 45 minutes; rendering speed depends on your browser and hardware.
        </p>
      </section>

      {/* FAQ ACCORDION */}
      <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-20 space-y-5">
        <div className="space-y-1.5">
          <p className="font-mono text-xs uppercase tracking-wider text-[#E8A33D]">
            Questions
          </p>
          <h2
            id="faq-heading"
            className="font-display text-2xl font-semibold tracking-tight text-[#151517] sm:text-3xl dark:text-[#F2F0EA]"
          >
            Frequently asked
          </h2>
        </div>

        <div className="divide-y divide-[#DFDCD2] rounded-xl border border-[#DFDCD2] bg-white dark:divide-[#2A2A2E] dark:border-[#2A2A2E] dark:bg-[#151517]">
          {FAQ_ITEMS.map((item) => {
            const isOpen = openFaqId === item.id;
            return (
              <div key={item.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                  className="flex min-h-[52px] w-full items-center justify-between gap-4 px-5 py-3.5 text-left text-sm font-medium text-[#151517] transition-colors hover:text-[#E8A33D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#E8A33D] dark:text-[#F2F0EA]"
                >
                  <span>{item.question}</span>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-[#64625D] dark:text-[#8C8C93]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-[#64625D] dark:text-[#8C8C93]" />
                  )}
                </button>
                {isOpen && (
                  <p className="px-5 pb-4 text-sm leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
                    {item.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
