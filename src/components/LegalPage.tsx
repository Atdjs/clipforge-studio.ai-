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
            className="inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg pr-2 text-sm font-medium text-[#E8A33D] transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
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
                  By opening media, loading direct video URLs, or exporting clips with Clip Cutter, you agree to these Terms. You confirm that you are at least 18 years old (or the age of legal majority in your jurisdiction) and legally able to enter into these Terms.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  02. Acceptable Use &amp; Daily Usage Quotas
                </h3>
                <p>
                  Clip Cutter is free to use with fair-use daily AI request limits per IP address. You agree not to bypass, overload, or probe the Express API proxy, submit malformed payloads, or submit content that is unlawful, defamatory, non-consensual, or infringing.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  03. Service Availability &amp; Liability
                </h3>
                <p>
                  Clip Cutter is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. Because browser-side cutting depends on your device memory and WebAssembly support, and cloud AI transcription/analysis depends on model availability, we do not warrant uninterrupted operation.
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
                  How your videos, extracted audio, transcripts, and Google Drive project snapshots are handled.
                </p>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  01. Local-First Cutting &amp; Browser IndexedDB
                </h3>
                <p>
                  Videos are cut, reframed, silence-trimmed, and captioned directly on your device using WebAssembly (<code className="font-mono text-xs text-[#E8A33D]">ffmpeg.wasm</code>). Full video files are never uploaded to our server. Your clip list, cached transcripts (keyed by file hash), PNG watermark, and cut MP4 blobs stay inside your browser IndexedDB.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  02. Audio-Only Cloud Route vs Optional On-Device Whisper
                </h3>
                <p>
                  By default, when you start AI analysis, browser FFmpeg extracts only a compact 16 kHz mono audio track (32 kbps, max 45 minutes) and sends that single audio payload in memory to our proxy for transcription. Follow-up highlight detection, scoring, titles, and translations operate on text transcripts only. Alternatively, enable &ldquo;On-device Whisper&rdquo; in settings to transcribe audio locally without sending audio to our server.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  03. Google Drive Project Sync
                </h3>
                <p>
                  If you choose to sign in with Google, Clip Cutter requests <code className="font-mono text-xs text-[#E8A33D]">drive.file</code> and <code className="font-mono text-xs text-[#E8A33D]">drive.metadata.readonly</code> scopes exclusively to list and sync your <code className="font-mono text-xs text-[#E8A33D]">.clipcutter.json</code> session files via Google File Picker. OAuth tokens remain in browser memory only and are cleared on sign-out or page reload.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  04. Erasure Controls
                </h3>
                <p>
                  You can clear active clips using &ldquo;New video&rdquo;, or erase all locally stored clips, cached transcripts, and brand assets immediately below.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {!confirmClear ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClear(true)}
                      className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-4 py-2 text-sm font-medium text-[#151517] transition-colors hover:border-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
                    >
                      <Trash2 className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
                      <span>Clear local browser data</span>
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleEraseLocalData()}
                        className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
                      >
                        <span>Confirm erase</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClear(false)}
                        className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-lg border border-[#DFDCD2] px-4 py-2 text-sm font-medium text-[#151517] hover:bg-[#EFECE4] dark:border-[#2A2A2E] dark:text-[#F2F0EA] dark:hover:bg-[#1C1C1F]"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {clearedLocal && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Local IndexedDB sessions, transcripts &amp; brand settings cleared.
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
                  How audio transcription and text analysis requests are routed securely.
                </p>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  01. Server-Side API Key Isolation
                </h3>
                <p>
                  All Gemini calls (audio-only transcription, moment selection, batched virality scoring, metadata writing, and translation) execute through our Express proxy. The <code className="font-mono text-xs text-[#E8A33D]">GEMINI_API_KEY</code> secret is never shipped to browser JavaScript.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  02. Validation, Deduplication &amp; Limits
                </h3>
                <p>
                  Every proxy endpoint validates request schemas via Zod, checks audio magic bytes, applies rate limits and daily quotas, deduplicates identical in-flight requests, and enforces strict output token caps.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  03. Accuracy of AI Output
                </h3>
                <p>
                  Virality scores, suggested titles, hook lines, and translations are probabilistic estimates. Always review captions and trim bounds before publishing.
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
                  Your rights and responsibilities regarding local videos and direct media links.
                </p>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  01. Ownership &amp; Permission
                </h3>
                <p>
                  You retain full ownership of the videos you open and clips you export. By loading any video file or direct MP4/MOV URL, you confirm you own the copyright or hold valid license or fair-use permission.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  02. Third-Party Platform Restrictions
                </h3>
                <p>
                  Clip Cutter does not download or scrape streams from YouTube or other video hosting platforms. Direct URL mode is strictly for direct MP4/MOV media files you are authorized to access.
                </p>
              </div>

              <div className="space-y-2.5 border-t border-[#DFDCD2] pt-5 dark:border-[#2A2A2E]">
                <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  03. Takedown Notices
                </h3>
                <p>
                  Send copyright or takedown requests to{' '}
                  <span className="font-mono text-[#151517] dark:text-[#F2F0EA]">
                    {CONTACT_CONFIG.supportEmail}
                  </span>{' '}
                  with details and proof of ownership.
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
                    className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3 py-1.5 text-xs font-medium text-[#151517] transition-colors hover:border-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
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
                  <code className="font-mono text-xs text-[#E8A33D]">@ffmpeg/core</code> (LGPL-2.1 / MIT), and optional local speech recognition via <code className="font-mono text-xs text-[#E8A33D]">@huggingface/transformers</code> (Apache-2.0).
                </p>
              </div>
            </section>
          )}
        </article>
      </div>
    </main>
  );
}
