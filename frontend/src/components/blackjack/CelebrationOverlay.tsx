import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Overlay shown during a showdown to highlight winners.
interface CelebrationOverlayProps {
  winners: string[];
  dealerWins: boolean;
  onAcknowledge?: () => void;
  acknowledgeDisabled?: boolean;
}

export const CelebrationOverlay = memo(({ winners, dealerWins, onAcknowledge, acknowledgeDisabled }: CelebrationOverlayProps) => {
  const hasWinners = winners.length > 0;
  if (!hasWinners && !dealerWins) return null;

  const headline = hasWinners ? 'Victory!' : 'House Wins';
  const subline = hasWinners
    ? winners.join(' • ')
    : 'Dealer secures the pot';

  return (
    <div className="pointer-events-none absolute inset-0 top-12 z-10 flex justify-center">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <div className={cn('relative flex flex-col items-center gap-2 rounded-3xl border border-primary/50 bg-gradient-to-br from-white/10 via-slate-900/80 to-black/70 px-10 py-6 shadow-[0_30px_70px_-20px_rgba(8,12,20,0.8)] backdrop-blur-md')}
        >
          <span className="text-sm font-semibold uppercase tracking-[0.65em] text-amber-200/90">{headline}</span>
          <span className="text-2xl font-black tracking-widest text-white drop-shadow">{subline}</span>
          {onAcknowledge && (
            <Button
              onClick={onAcknowledge}
              disabled={acknowledgeDisabled}
              className="pointer-events-auto mt-4 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 px-6 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-emerald-950 shadow hover:from-emerald-300 hover:via-emerald-400 hover:to-teal-400"
            >
              Ready For Next Deal
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

CelebrationOverlay.displayName = 'CelebrationOverlay';
