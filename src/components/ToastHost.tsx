import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  tone: 'success' | 'info' | 'error';
  title: string;
  detail?: string;
}

interface ToastHostProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

/**
 * Accessible toast stack with crisp Quiet Luxury hairline framing.
 */
export function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 md:bottom-6 md:right-6"
    >
      {toasts.map((toast) => {
        const Icon =
          toast.tone === 'success'
            ? CheckCircle2
            : toast.tone === 'error'
              ? AlertCircle
              : Info;

        const toneClasses =
          toast.tone === 'success'
            ? 'border-emerald-600/40 bg-white text-[#151517] dark:border-emerald-500/40 dark:bg-[#151517] dark:text-[#F2F0EA]'
            : toast.tone === 'error'
              ? 'border-red-500/45 bg-white text-[#151517] dark:border-red-500/45 dark:bg-[#151517] dark:text-[#F2F0EA]'
              : 'border-[#E8A33D]/45 bg-white text-[#151517] dark:border-[#E8A33D]/45 dark:bg-[#151517] dark:text-[#F2F0EA]';

        const iconColor =
          toast.tone === 'success'
            ? 'text-emerald-600 dark:text-emerald-400'
            : toast.tone === 'error'
              ? 'text-red-600 dark:text-red-400'
              : 'text-[#E8A33D]';

        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start justify-between gap-3 rounded-xl border p-3.5 shadow-lg transition-all motion-reduce:transition-none ${toneClasses}`}
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-display text-xs font-semibold leading-snug">
                  {toast.title}
                </p>
                {toast.detail && (
                  <p className="mt-0.5 text-xs leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
                    {toast.detail}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="flex min-h-[32px] min-w-[32px] shrink-0 items-center justify-center rounded-md text-[#64625D] transition-colors hover:bg-[#EFECE4] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:bg-[#1C1C1F] dark:hover:text-[#F2F0EA]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
