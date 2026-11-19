import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, MessageSquare, X } from 'lucide-react';
import { submitUserFeedback } from '../services/apiClient';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [category, setCategory] = useState<'bug' | 'feature' | 'general'>('general');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSubmittedMessage(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const trimmed = message.trim();
    if (trimmed.length < 8) {
      setError('Please write at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitUserFeedback({
        category,
        message: trimmed,
        email: email.trim() || undefined,
      });
      setSubmittedMessage(res.message);
      setMessage('');
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send feedback.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-xl border border-[#DFDCD2] bg-white p-5 shadow-2xl sm:rounded-xl sm:p-6 dark:border-[#2A2A2E] dark:bg-[#151517]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] text-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F]">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="feedback-modal-title"
                className="font-display text-lg font-semibold text-[#151517] dark:text-[#F2F0EA]"
              >
                Send product feedback
              </h2>
              <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">
                Report a bug, request an export format, or share editing workflow notes.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback dialog"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#64625D] transition-colors hover:bg-[#EFECE4] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:bg-[#1C1C1F] dark:hover:text-[#F2F0EA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {submittedMessage ? (
          <div className="mt-5 space-y-4 rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-2.5 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{submittedMessage}</p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] rounded-lg bg-[#E8A33D] px-4 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A]"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[#64625D] dark:text-[#8C8C93]">
                Category
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['general', 'General'],
                    ['feature', 'Feature idea'],
                    ['bug', 'Bug report'],
                  ] as const
                ).map(([val, label]) => {
                  const active = category === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCategory(val)}
                      className={`min-h-[44px] rounded-lg border px-3 text-xs font-medium transition-colors ${
                        active
                          ? 'border-[#E8A33D] bg-[#E8A33D]/15 text-[#151517] dark:text-[#F2F0EA]'
                          : 'border-[#DFDCD2] bg-[#F7F5F0] text-[#64625D] hover:text-[#151517] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="feedback-message-input"
                className="block text-xs font-medium text-[#64625D] dark:text-[#8C8C93]"
              >
                Message
              </label>
              <textarea
                id="feedback-message-input"
                rows={4}
                maxLength={1500}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Tell us what worked well or what tripped you up..."
                className="w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3 text-sm text-[#151517] placeholder:text-[#64625D]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA] dark:placeholder:text-[#8C8C93]/70"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="feedback-email-input"
                className="block text-xs font-medium text-[#64625D] dark:text-[#8C8C93]"
              >
                Reply email <span className="opacity-70">(optional)</span>
              </label>
              <input
                id="feedback-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@studio.com"
                className="min-h-[44px] w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-3 text-sm text-[#151517] placeholder:text-[#64625D]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA] dark:placeholder:text-[#8C8C93]/70"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2.5 border-t border-[#DFDCD2] pt-4 sm:flex-row sm:justify-end dark:border-[#2A2A2E]">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-4 text-sm font-medium text-[#151517] transition-colors hover:bg-[#E5E0D5] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:bg-[#252529]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#E8A33D] px-5 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <span>Send feedback</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
