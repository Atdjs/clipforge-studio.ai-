import { useRef, useState, type FormEvent } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pause,
  Play,
} from 'lucide-react';
import { DEMO_MEDIA_CONFIG, FAQ_ITEMS } from '../config/siteContent';
import { joinProWaitlist } from '../services/apiClient';

interface LandingSectionsProps {
  onTrySampleVideo: () => void;
  isLoadingSample: boolean;
}

const CAPABILITIES = [
  {
    title: 'Virality score & breakdown',
    desc: 'Every clip is scored 0–100 across Hook, Emotion, Flow, and Shareability before you spend time rendering.',
  },
  {
    title: 'Hook detection & title cards',
    desc: 'Identifies the strongest opening line, lets you start the clip directly on the hook, or burns a 2.2s slate.',
  },
  {
    title: 'Prompt-based clipping',
    desc: 'Ask for specific topics, funny exchanges, pricing advice, or objections across your video or transcript.',
  },
  {
    title: 'Silence & filler trimming',
    desc: 'Combines FFmpeg silence detection (>0.45s dead pauses) with AI-flagged filler spans for tighter pacing.',
  },
  {
    title: 'Burned-in styled captions',
    desc: 'Renders crisp PNG subtitles across five presets in English, Hindi, Marathi, Hinglish, and Spanish.',
  },
  {
    title: '9:16 speaker reframe & .SRT export',
    desc: 'Crops vertical 1080×1920 frames centered on speaker position and exports standalone .SRT and JSON files.',
  },
];

export function LandingSections({
  onTrySampleVideo,
  isLoadingSample,
}: LandingSectionsProps) {
  const demoVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isDemoPlaying, setIsDemoPlaying] = useState(false);

  // FAQ accordion state
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

  // Pro Waitlist state
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistConsent, setWaitlistConsent] = useState(false);
  const [isJoiningWaitlist, setIsJoiningWaitlist] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null);

  const handleToggleDemoVideo = async () => {
    const vid = demoVideoRef.current;
    if (!vid) return;
    if (!vid.paused) {
      vid.pause();
      setIsDemoPlaying(false);
      return;
    }
    try {
      await vid.play();
      setIsDemoPlaying(true);
    } catch {
      setIsDemoPlaying(false);
    }
  };

  const handleWaitlistSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isJoiningWaitlist) return;
    setWaitlistError(null);
    setWaitlistMessage(null);

    const email = waitlistEmail.trim();
    if (!email || !email.includes('@')) {
      setWaitlistError('Enter a valid email address.');
      return;
    }
    if (!waitlistConsent) {
      setWaitlistError('Please confirm consent so we may send one launch email.');
      return;
    }

    setIsJoiningWaitlist(true);
    try {
      const res = await joinProWaitlist({ email, consent: true });
      setWaitlistMessage(res.message);
      setWaitlistEmail('');
    } catch (err) {
      setWaitlistError(err instanceof Error ? err.message : 'Unable to join waitlist.');
    } finally {
      setIsJoiningWaitlist(false);
    }
  };

  return (
    <div className="space-y-16 pt-6 sm:space-y-20 sm:pt-8">
      {/* SECTION 1: DEMO — "See it in action" (Before / After) */}
      <section id="demo" aria-labelledby="demo-heading" className="scroll-mt-20 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <p className="font-mono text-xs uppercase tracking-wider text-[#E8A33D]">
              See it in action
            </p>
            <h2
              id="demo-heading"
              className="font-display text-2xl font-semibold tracking-tight text-[#151517] sm:text-3xl [text-wrap:balance] dark:text-[#F2F0EA]"
            >
              One interview recording into three ready vertical clips
            </h2>
          </div>

          <button
            type="button"
            disabled={isLoadingSample}
            onClick={onTrySampleVideo}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg border border-[#DFDCD2] bg-white px-4 py-2 text-sm font-medium text-[#151517] transition-colors hover:border-[#E8A33D] disabled:opacity-50 dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA] whitespace-nowrap"
          >
            {isLoadingSample ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#E8A33D]" aria-hidden="true" />
                <span>Loading sample...</span>
              </>
            ) : (
              <span>Load sample into editor</span>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Lightweight source video player with poster */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-[#DFDCD2] bg-white lg:col-span-6 dark:border-[#2A2A2E] dark:bg-[#151517]">
            <div className="relative aspect-video w-full bg-[#0E0E0F]">
              <video
                ref={demoVideoRef}
                src={DEMO_MEDIA_CONFIG.videoUrl}
                poster={DEMO_MEDIA_CONFIG.posterUrl}
                playsInline
                preload="none"
                onEnded={() => setIsDemoPlaying(false)}
                onClick={() => void handleToggleDemoVideo()}
                className="h-full w-full cursor-pointer object-cover"
              />
              <button
                type="button"
                onClick={() => void handleToggleDemoVideo()}
                aria-label={isDemoPlaying ? 'Pause demo video' : 'Play demo video'}
                className="absolute bottom-3 left-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/15 bg-[#0E0E0F]/85 px-3.5 text-xs font-semibold text-[#F2F0EA] transition-colors hover:border-[#E8A33D] hover:text-[#E8A33D]"
              >
                {isDemoPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Pause preview</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Play sample source</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[#DFDCD2] px-4 py-3 text-xs dark:border-[#2A2A2E]">
              <span className="truncate font-medium text-[#151517] dark:text-[#F2F0EA]">
                {DEMO_MEDIA_CONFIG.sourceTitle}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                {DEMO_MEDIA_CONFIG.sourceDuration} · 16:9
              </span>
            </div>
          </div>

          {/* Right: 3 resulting clips with virality scores & caption style */}
          <div className="flex flex-col divide-y divide-[#DFDCD2] overflow-hidden rounded-xl border border-[#DFDCD2] bg-white lg:col-span-6 dark:divide-[#2A2A2E] dark:border-[#2A2A2E] dark:bg-[#151517]">
            {DEMO_MEDIA_CONFIG.clips.map((item, idx) => {
              const badgeTone =
                item.viralityScore >= 85
                  ? 'border-emerald-600/35 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/35 dark:text-emerald-400'
                  : item.viralityScore >= 70
                    ? 'border-[#E8A33D]/45 bg-[#E8A33D]/10 text-[#9A6516] dark:text-[#E8A33D]'
                    : 'border-[#DFDCD2] bg-[#EFECE4] text-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#8C8C93]';

              return (
                <div key={item.id} className="flex flex-1 flex-col justify-between gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                        Clip {String(idx + 1).padStart(2, '0')} · {item.timeRange} · 9:16
                      </p>
                      <h3 className="mt-0.5 font-display text-base font-medium text-[#151517] dark:text-[#F2F0EA]">
                        {item.title}
                      </h3>
                    </div>

                    <span
                      className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${badgeTone}`}
                    >
                      {item.viralityScore}/100
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
                    &ldquo;{item.captionPreview}&rdquo;
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 font-mono text-[11px] tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                    <span>Caption: {item.captionPresetLabel}</span>
                    <span>
                      Hook {item.subScores.hook} · Emotion {item.subScores.emotion} · Share{' '}
                      {item.subScores.shareability}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 2: HOW IT WORKS — Single horizontal row of 3 numbered steps with thin dividers */}
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
              title: 'Upload a video or paste a link',
              detail:
                'Choose an MP4/MOV file up to 1 GB (1024 MB) or paste a public YouTube link. Large files stream in 8 MB chunks.',
            },
            {
              num: '02',
              title: 'Review AI-picked moments',
              detail:
                'Inspect virality scores, opening hooks, and transcripts. Adjust start/end bounds on the waveform scrubber or create custom ranges.',
            },
            {
              num: '03',
              title: 'Export captioned vertical clips',
              detail:
                'Run local FFmpeg cuts to remove silences, burn styled captions, reframe to 9:16, and download MP4, .SRT, or ZIP.',
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

      {/* SECTION 3: FEATURES (2-column list of real capabilities) + PROCESSING LIMITS */}
      <section id="features" aria-labelledby="features-heading" className="scroll-mt-20 space-y-6">
        <div className="space-y-1.5">
          <p className="font-mono text-xs uppercase tracking-wider text-[#E8A33D]">
            Capabilities
          </p>
          <h2
            id="features-heading"
            className="font-display text-2xl font-semibold tracking-tight text-[#151517] sm:text-3xl [text-wrap:balance] dark:text-[#F2F0EA]"
          >
            Built for editorial control, not guesswork
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
          MP4 and MOV files up to 1 GB (1024 MB). Works best on source videos up to 30 minutes; export speed and memory capacity depend on your browser and hardware.
        </p>
      </section>

      {/*
        RESERVED CREATOR PROOF SLOT (Intentionally empty until verified creator quotes/logos are added).
        Add real testimonials or studio logos here when available—never fabricate placeholder quotes or metrics.
      */}

      {/* SECTION 4: PRICING — Free vs Pro ("Coming soon" + Join the waitlist) */}
      <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-20 space-y-6">
        <div className="space-y-1.5">
          <p className="font-mono text-xs uppercase tracking-wider text-[#E8A33D]">
            Pricing
          </p>
          <h2
            id="pricing-heading"
            className="font-display text-2xl font-semibold tracking-tight text-[#151517] sm:text-3xl dark:text-[#F2F0EA]"
          >
            Simple plans, honest limits
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Free Tier */}
          <div className="flex flex-col justify-between rounded-xl border border-[#DFDCD2] bg-white p-6 dark:border-[#2A2A2E] dark:bg-[#151517]">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-xl font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  Free
                </h3>
                <span className="font-mono text-sm font-medium text-[#64625D] dark:text-[#8C8C93]">
                  $0 / available now
                </span>
              </div>
              <p className="text-sm text-[#64625D] dark:text-[#8C8C93]">
                Full browser-based trimming, auto-editing, and daily server-proxied AI analysis.
              </p>
              <ul className="space-y-2.5 border-t border-[#DFDCD2] pt-4 text-sm text-[#151517] dark:border-[#2A2A2E] dark:text-[#F2F0EA]">
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-[#E8A33D]" aria-hidden="true" />
                  <span>720p MP4 export with all 5 caption presets</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-[#E8A33D]" aria-hidden="true" />
                  <span>Optional custom PNG watermark overlay</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-[#E8A33D]" aria-hidden="true" />
                  <span>40 daily AI credits for analysis, scoring &amp; translation</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-[#E8A33D]" aria-hidden="true" />
                  <span>Unlimited local cutting, waveform trim &amp; .SRT export</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Pro Tier — Coming soon + Waitlist */}
          <div className="flex flex-col justify-between rounded-xl border border-[#E8A33D]/60 bg-white p-6 dark:bg-[#151517]">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-xl font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  Pro
                </h3>
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#E8A33D]">
                  Coming soon
                </span>
              </div>
              <p className="text-sm text-[#64625D] dark:text-[#8C8C93]">
                Higher export fidelity and expanded daily AI throughput for recurring shows.
              </p>
              <ul className="space-y-2.5 border-t border-[#DFDCD2] pt-4 text-sm text-[#151517] dark:border-[#2A2A2E] dark:text-[#F2F0EA]">
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-[#E8A33D]" aria-hidden="true" />
                  <span>1080p high-bitrate MP4 export</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-[#E8A33D]" aria-hidden="true" />
                  <span>No default watermark, optional studio logo preset</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-[#E8A33D]" aria-hidden="true" />
                  <span>Higher daily AI credit allowance for multi-hour podcasts</span>
                </li>
              </ul>
            </div>

            <form
              onSubmit={(e) => void handleWaitlistSubmit(e)}
              className="mt-6 space-y-3 border-t border-[#DFDCD2] pt-4 dark:border-[#2A2A2E]"
            >
              <label
                htmlFor="pro-waitlist-email"
                className="block text-xs font-medium text-[#151517] dark:text-[#F2F0EA]"
              >
                Join the Pro waitlist
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="pro-waitlist-email"
                  type="email"
                  required
                  value={waitlistEmail}
                  onChange={(e) => {
                    setWaitlistEmail(e.target.value);
                    if (waitlistError) setWaitlistError(null);
                  }}
                  placeholder="you@studio.com"
                  className="min-h-[44px] flex-1 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-3 text-sm text-[#151517] placeholder:text-[#64625D]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA] dark:placeholder:text-[#8C8C93]/70"
                />
                <button
                  type="submit"
                  disabled={isJoiningWaitlist}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-[#E8A33D] px-4 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] disabled:opacity-50 whitespace-nowrap"
                >
                  {isJoiningWaitlist ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Joining...</span>
                    </>
                  ) : (
                    <span>Join waitlist</span>
                  )}
                </button>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-xs text-[#64625D] dark:text-[#8C8C93]">
                <input
                  type="checkbox"
                  checked={waitlistConsent}
                  onChange={(e) => {
                    setWaitlistConsent(e.target.checked);
                    if (waitlistError) setWaitlistError(null);
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#DFDCD2] accent-[#E8A33D] dark:border-[#2A2A2E]"
                />
                <span>
                  I consent to receive a single notification email when Pro 1080p export opens.
                </span>
              </label>

              {waitlistError && (
                <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                  {waitlistError}
                </p>
              )}
              {waitlistMessage && (
                <p role="status" className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {waitlistMessage}
                </p>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* SECTION 5: FAQ ACCORDION */}
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
