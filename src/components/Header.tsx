import { HelpCircle, Keyboard, Moon, Scissors, Sun, Upload } from 'lucide-react';
import type { ServerUsageStatus, ThemeMode } from '../types/clip';

interface HeaderProps {
  hasVideo: boolean;
  isBusy: boolean;
  isLegalOpen: boolean;
  theme: ThemeMode;
  usage: ServerUsageStatus | null;
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
 * Zone 3: Server credit count, Legal, Theme toggle, New video action
 */
export function Header({
  hasVideo,
  isBusy,
  isLegalOpen,
  theme,
  usage,
  onToggleTheme,
  onResetVideo,
  onOpenLegal,
  onBackToStudio,
  onOpenShortcuts,
  onOpenTour,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-[#DFDCD2] bg-[#F7F5F0] dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
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
              href="#demo"
              className="whitespace-nowrap transition-colors hover:text-[#151517] dark:hover:text-[#F2F0EA]"
            >
              Demo
            </a>
            <a
              href="#how-it-works"
              className="whitespace-nowrap transition-colors hover:text-[#151517] dark:hover:text-[#F2F0EA]"
            >
              How it works
            </a>
            <a
              href="#pricing"
              className="whitespace-nowrap transition-colors hover:text-[#151517] dark:hover:text-[#F2F0EA]"
            >
              Pricing
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
              className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-medium text-[#64625D] transition-colors hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA] whitespace-nowrap"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
              <span>Guide</span>
            </button>
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-medium text-[#64625D] transition-colors hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA] whitespace-nowrap"
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" />
              <span>Shortcuts</span>
            </button>
          </div>
        )}

        {/* Zone 3: Utility controls */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {usage && (
            <span
              title={`Daily AI credits remaining: ${usage.remaining} of ${usage.limit}`}
              className="hidden font-mono text-xs tabular-nums text-[#64625D] sm:inline dark:text-[#8C8C93]"
            >
              {usage.remaining}/{usage.limit} credits
            </span>
          )}

          <button
            type="button"
            onClick={isLegalOpen ? onBackToStudio : onOpenLegal}
            className={`min-h-[40px] rounded-lg px-2 text-sm font-medium transition-colors hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] whitespace-nowrap shrink-0 ${
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
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#DFDCD2] bg-white px-3 py-1.5 text-sm font-medium text-[#151517] transition-colors hover:border-[#E8A33D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA] whitespace-nowrap shrink-0"
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
