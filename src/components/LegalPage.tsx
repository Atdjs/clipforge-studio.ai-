import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, Shield, Trash2 } from 'lucide-react';
import { CONTACT_CONFIG } from '../config/siteContent';

export type LegalSectionId = 'terms' | 'privacy' | 'ai' | 'copyright' | 'contact';

interface LegalPageProps {
  activeSection: LegalSectionId;
  onSelectSection: (section: LegalSectionId) => void;
  onBackToStudio: () => void;
  onClearLocalData: () => Promise<void>;
}

const LEGAL_SECTIONS: Array<{ id: LegalSectionId; label: string }> = [
  { id: 'terms', label: 'Terms of Service' },
  { id: 'privacy', label: 'Privacy & Storage' },
  { id: 'ai', label: 'AI & API Proxy' },
  { id: 'copyright', label: 'Copyright & DMCA' },
  { id: 'contact', label: 'Licensing & Contact' },
];

export function LegalPage({
  activeSection,
  onSelectSection,
  onBackToStudio,
  onClearLocalData,
}: LegalPageProps) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearedLocal, setClearedLocal] = useState(false);
  const [proxyActive, setProxyActive] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ok?: boolean } | null) => {
        if (active) setProxyActive(Boolean(data?.ok));
      })
      .catch(() => {
        if (active) setProxyActive(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_CONFIG.supportEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      // Fallback ignored in restricted clipboard contexts
    }
  };

  const handleEraseLocalData = async () => {
    await onClearLocalData();
    setConfirmClear(false);
    setClearedLocal(true);
    setTimeout(() => setClearedLocal(false), 3500);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-8 flex flex-col gap-4 border-b border-[#DFDCD2] pb-6 sm:flex-row sm:items-end sm:justify-between dark:border-[#2A2A2E]">
        <div className="space-y-2">
          <button
            type="button"
            onClick={onBackToStudio}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg pr-2 text-sm font-medium text-[#E8A33D] transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to Studio</span>
          </button>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#151517] sm:text-4xl [text-wrap:balance] dark:text-[#F2F0EA]">
            Legal, Privacy &amp; AI Transparency
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#64625D] dark:text-[#8C8C93]">
            <span>Clip Cutter</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Effective {CONTACT_CONFIG.legalEffectiveDate}
            </span>
            <span aria-hidden="true">·</span>
            <span>India DPDP &amp; Global Standards</span>
          </div>
        </div>

        {proxyActive !== null && (
          <div className="flex shrink-0 items-center gap-2 text-xs text-[#64625D] dark:text-[#8C8C93]">
            <Shield className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
            <span>
              {proxyActive
                ? 'Server-side API proxy active (keys isolated from browser)'
                : 'Proxy status unavailable'}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[240px_1fr]">
        <aside aria-label="Legal sections" className="md:sticky md:top-20 md:self-start">
          <nav className="flex flex-row gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
            {LEGAL_SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onSelectSection(section.id)}
                  className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] ${
                    isActive
                      ? 'border border-[#E8A33D]/50 bg-[#E8A33D]/10 text-[#9A6516] dark:text-[#E8A33D]'
                      : 'text-[#64625D] hover:bg-[#EFECE4] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:bg-[#151517] dark:hover:text-[#F2F0EA]'
                  }`}
                >
                  {section.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <article className="space-y-8 rounded-xl border border-[#DFDCD2] bg-white p-6 text-sm leading-relaxed text-[#64625D] sm:p-8 dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#8C8C93]">
          {activeSection === 'terms' && (
            <section className="space-y-5">
              <div className="border-b border-[#DFDCD2] pb-4 dark:border-[#2A2A2E]">
                <h2 className="font-display text-2xl font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  Terms of Service
                </h2>
                <p className="mt-1 text-xs">
                  Conditions governing your use of the Clip Cutter web application and backend proxy.
                </p>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  01. Acceptance &amp; Eligibility
                </h3>
                <p>
                  By uploading media, submitting links, or exporting clips with Clip Cutter, you agree
                  to these Terms. You confirm that you are at least 18 years old (or the age of legal
                  majority in your jurisdiction) and legally able to enter into these Terms.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  02. Acceptable Use, Quotas &amp; Rate Limits
                </h3>
                <p>
                  You agree not to bypass, overload, or probe the Express API proxy, upload malformed
                  or malicious files, automate bulk scraping, or submit content that is unlawful,
                  defamatory, non-consensual, or harmful. Backend rate limits and daily credit quotas apply per network IP.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  03. Service Availability &amp; Liability
                </h3>
                <p>
                  Clip Cutter is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
                  basis. Because browser-side cutting depends on your device memory and WebAssembly
                  support, and AI detection depends on external model availability, we do not warrant
                  uninterrupted operation. To the maximum extent permitted by law, liability is limited to fees paid in the preceding 12 months.
                </p>
              </div>
            </section>
          )}

          {activeSection === 'privacy' && (
            <section className="space-y-5">
              <div className="border-b border-[#DFDCD2] pb-4 dark:border-[#2A2A2E]">
                <h2 className="font-display text-2xl font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  Privacy &amp; Data Processing Policy
                </h2>
                <p className="mt-1 text-xs">
                  How your videos, transcripts, waitlist signups, and preferences are handled.
                </p>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  01. Local-First Cutting &amp; Browser Storage
                </h3>
                <p>
                  Videos are cut, reframed, silence-trimmed, and captioned directly on your device using WebAssembly (<code className="font-mono text-xs text-[#E8A33D]">ffmpeg.wasm</code>). Your clip list, PNG watermark, and cut MP4 blobs stay locally inside your browser IndexedDB.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  02. Ephemeral Server Staging
                </h3>
                <p>
                  When you explicitly run an AI analysis, your video or audio stream is chunked through our Node.js/Express proxy solely to forward it to Google Gemini for transcription and highlight detection. Temporary disk chunks are deleted immediately after handoff (or expired within 30 minutes).
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  03. Your Erasure Controls
                </h3>
                <p>
                  You can delete your active Gemini session file using &ldquo;New video&rdquo;, or erase all locally saved clips, source files, and brand assets immediately below.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {!confirmClear ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClear(true)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-4 py-2 text-sm font-medium text-[#151517] transition-colors hover:border-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] whitespace-nowrap"
                    >
                      <Trash2 className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
                      <span>Clear local browser data</span>
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleEraseLocalData()}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 whitespace-nowrap"
                      >
                        <span>Confirm erase</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClear(false)}
                        className="inline-flex min-h-[44px] items-center rounded-lg border border-[#DFDCD2] px-4 py-2 text-sm font-medium text-[#151517] hover:bg-[#EFECE4] dark:border-[#2A2A2E] dark:text-[#F2F0EA] dark:hover:bg-[#1C1C1F] whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {clearedLocal && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Local IndexedDB session &amp; brand settings cleared.
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeSection === 'ai' && (
            <section className="space-y-5">
              <div className="border-b border-[#DFDCD2] pb-4 dark:border-[#2A2A2E]">
                <h2 className="font-display text-2xl font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  AI &amp; Backend Proxy Transparency
                </h2>
                <p className="mt-1 text-xs">
                  How requests are routed to Gemini and limitations of AI-generated clip metadata.
                </p>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  01. Server-Side API Key Isolation
                </h3>
                <p>
                  All calls to the Google Gemini API (upload, status polling, moment analysis, transcription, virality scoring, metadata writing, and translation) run through our Express server. The <code className="font-mono text-xs text-[#E8A33D]">GEMINI_API_KEY</code> secret is never exposed to browser JavaScript.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  02. Validation &amp; Abuse Protection
                </h3>
                <p>
                  Every proxy route validates request schemas via Zod, enforces URI allowlists, inspects video magic bytes, and applies tiered rate limits and daily credit quotas.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  03. Accuracy of AI Output
                </h3>
                <p>
                  Virality scores, suggested clip titles, hook lines, filler spans, and translations are probabilistic estimates. Always review captions and trim bounds before publishing.
                </p>
              </div>
            </section>
          )}

          {activeSection === 'copyright' && (
            <section className="space-y-5">
              <div className="border-b border-[#DFDCD2] pb-4 dark:border-[#2A2A2E]">
                <h2 className="font-display text-2xl font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  Copyright, DMCA &amp; Content Ownership
                </h2>
                <p className="mt-1 text-xs">
                  Your rights and responsibilities regarding source videos and YouTube links.
                </p>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  01. Ownership &amp; Permission
                </h3>
                <p>
                  You retain full ownership of the videos you upload and clips you export. By submitting any video file or public YouTube URL, you confirm you own the copyright or hold valid license or fair-use permission.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  02. No YouTube Stream Downloading
                </h3>
                <p>
                  In link mode, Clip Cutter does not rip copyrighted YouTube streams in your browser. It embeds official playback with timestamps and requires your own authorized source file to cut downloadable MP4s.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  03. Takedown Notices
                </h3>
                <p>
                  Send copyright or takedown requests to <span className="font-mono text-[#151517] dark:text-[#F2F0EA]">{CONTACT_CONFIG.supportEmail}</span> with the specific URL or reference and proof of ownership.
                </p>
              </div>
            </section>
          )}

          {activeSection === 'contact' && (
            <section className="space-y-5">
              <div className="border-b border-[#DFDCD2] pb-4 dark:border-[#2A2A2E]">
                <h2 className="font-display text-2xl font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  Open-Source Attribution &amp; Contact
                </h2>
                <p className="mt-1 text-xs">
                  Support contact, grievance details, and open-source media engine notices.
                </p>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  01. Support &amp; Grievance Contact
                </h3>
                <p>
                  For privacy inquiries, data deletion assistance, copyright notices, or technical support, write to:
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <span className="font-mono text-sm text-[#151517] dark:text-[#F2F0EA]">
                    {CONTACT_CONFIG.supportEmail}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyEmail()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3 py-1.5 text-xs font-medium text-[#151517] transition-colors hover:border-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] whitespace-nowrap"
                  >
                    {copiedEmail ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
                        <span>Copy email</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  02. Open-Source Software Notices
                </h3>
                <p>
                  Client-side video processing uses <strong className="text-[#151517] dark:text-[#F2F0EA]">FFmpeg</strong>{' '}
                  via <code className="font-mono text-xs text-[#E8A33D]">@ffmpeg/ffmpeg</code> and{' '}
                  <code className="font-mono text-xs text-[#E8A33D]">@ffmpeg/core</code> (LGPL-2.1 / MIT).
                </p>
              </div>
            </section>
          )}
        </article>
      </div>
    </main>
  );
}
