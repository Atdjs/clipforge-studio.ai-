import { Check, Cloud, HelpCircle, Keyboard, Moon, Scissors, Sun, Upload } from 'lucide-react';
import type { LinkedDriveFile, ServerUsageStatus, ThemeMode } from '../types/clip';

interface HeaderProps {
  hasVideo: boolean;
  isBusy: boolean;
  isLegalOpen: boolean;
  theme: ThemeMode;
  usage: ServerUsageStatus | null;
  linkedDriveFile?: LinkedDriveFile | null;
  onOpenDriveSync: () => void;
  onToggleTheme: () => void;
  onResetVideo: () => void;
  onOpenLegal: () => void;
  onBackToStudio: () => void;
  onOpenShortcuts: () => void;
  onOpenTour: () => void;
}

/**
 * Architectural 3-zone studio header:
 * Zone 1: Brand wordmark
 * Zone 2: Landing section anchors (idle) or studio tools (active)
 * Zone 3: AI usage left today meter, Drive Sync, Legal, Theme toggle, New video action
 */
export function Header({
  hasVideo,
  isBusy,
  isLegalOpen,
  theme,
  usage,
  linkedDriveFile,
  onOpenDriveSync,
  onToggleTheme,
  onResetVideo,
  onOpenLegal,
  onBackToStudio,
  onOpenShortcuts,
  onOpenTour,
}: HeaderProps) {
  const usagePct =
    usage && usage.limit > 0
      ? Math.max(0, Math.min(100, Math.round((usage.remaining / usage.limit) * 100)))
      : 100;

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-[#DFDCD2] bg-[#F7F5F0] dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Zone 1: Wordmark */}
        <button
          type="button"
          onClick={onBackToStudio}
          className="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#E8A33D] text-[#0E0E0F]">
            <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-[#151517] dark:text-[#F2F0EA]">
            Clip Cutter
          </span>
        </button>

        {/* Zone 2: Primary links */}
        {!hasVideo && !isLegalOpen ? (
          <nav
            aria-label="Page sections"
            className="hidden items-center gap-6 text-sm font-medium text-[#64625D] lg:flex dark:text-[#8C8C93]"
          >
            <a
              href="#how-it-works"
              className="whitespace-nowrap transition-colors hover:text-[#151517] dark:hover:text-[#F2F0EA]"
            >
              How it works
            </a>
            <a
              href="#features"
              className="whitespace-nowrap transition-colors hover:text-[#151517] dark:hover:text-[#F2F0EA]"
            >
              Capabilities
            </a>
            <a
              href="#faq"
              className="whitespace-nowrap transition-colors hover:text-[#151517] dark:hover:text-[#F2F0EA]"
            >
              FAQ
            </a>
          </nav>
        ) : (
          <div className="hidden items-center gap-5 md:flex">
            <button
              type="button"
              onClick={onOpenTour}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap text-sm font-medium text-[#64625D] transition-colors hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              <span>Guide</span>
            </button>
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap text-sm font-medium text-[#64625D] transition-colors hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]"
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" />
              <span>Shortcuts</span>
            </button>
          </div>
        )}

        {/* Zone 3: AI Usage Meter, Drive Sync, Legal, Theme & Reset */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {usage && (
            <div
              title={`AI usage left today: ${usage.remaining} of ${usage.limit} daily units`}
              className="hidden min-w-[118px] flex-col gap-1 rounded-md border border-[#DFDCD2] bg-white px-2.5 py-1 sm:flex dark:border-[#2A2A2E] dark:bg-[#151517]"
            >
              <div className="flex items-center justify-between gap-2 font-mono text-[10px] tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                <span>AI left today</span>
                <span className="font-semibold text-[#151517] dark:text-[#F2F0EA]">
                  {usage.remaining}/{usage.limit}
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-[#EFECE4] dark:bg-[#2A2A2E]">
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ${
                    usagePct <= 20 ? 'bg-red-500' : 'bg-[#E8A33D]'
                  }`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenDriveSync}
            title={
              linkedDriveFile
                ? `Linked to Google Drive: ${linkedDriveFile.name}`
                : 'Sync or open project from Google Drive'
            }
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] ${
              linkedDriveFile
                ? 'border-[#E8A33D]/60 bg-[#E8A33D]/10 text-[#9A6516] dark:text-[#E8A33D]'
                : 'border-[#DFDCD2] bg-white text-[#151517] hover:border-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA]'
            }`}
          >
            {linkedDriveFile ? (
              <Check className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
            ) : (
              <Cloud className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
            )}
            <span className="hidden md:inline">
              {linkedDriveFile ? 'Drive synced' : 'Drive Sync'}
            </span>
          </button>

          <button
            type="button"
            onClick={isLegalOpen ? onBackToStudio : onOpenLegal}
            className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-lg px-2 text-sm font-medium underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] ${
              isLegalOpen
                ? 'text-[#E8A33D]'
                : 'text-[#64625D] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]'
            }`}
          >
            {isLegalOpen ? 'Studio' : 'Legal'}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-[#DFDCD2] bg-white text-[#151517] transition-colors hover:border-[#E8A33D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA]"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {hasVideo && !isLegalOpen && (
            <button
              type="button"
              onClick={onResetVideo}
              disabled={isBusy}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-white px-3 py-1.5 text-sm font-medium text-[#151517] transition-colors hover:border-[#E8A33D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA]"
            >
              <Upload className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
              <span className="hidden sm:inline">New video</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
