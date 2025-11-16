import { useMemo } from 'react';
import { ChipStack, ChipMotion } from './ChipStack';
import { cn } from '@/lib/utils';

// Minimal animated pot readout used during active hands.
interface PotDisplayProps {
  amount: number;
  phase: 'betting' | 'dealing' | 'player-turn' | 'dealer-turn' | 'showdown' | 'waiting';
  winners: string[];
  dealerWins: boolean;
  className?: string;
  floating?: boolean;
}

export const PotDisplay = ({ amount, phase, winners, dealerWins, className, floating = false }: PotDisplayProps) => {
  const motion: ChipMotion = useMemo(() => {
    if (phase === 'player-turn') return 'burst';
    if (phase === 'showdown') return 'toPot';
    return 'idle';
  }, [phase]);

  if (amount <= 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'relative flex flex-col items-center gap-1 text-center mt-4',
        floating && 'pointer-events-none',
        className
      )}
    >
      <div className="relative flex items-center justify-center">
        <div className="absolute h-20 w-20 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative rounded-[22px] border border-primary/50 bg-gradient-to-br from-black/70 via-slate-900/80 to-black/60 px-6 py-4 shadow-[0_25px_55px_-25px_rgba(7,11,16,0.9)] ring-1 ring-primary/20">
          <div className="absolute inset-x-6 bottom-1 h-[5px] rounded-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <ChipStack amount={amount} motion={motion} />
        </div>
      </div>
      <div className="rounded-full border border-primary/40 bg-primary/90 px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.55em] text-primary-foreground shadow-sm">
        Pot {phase === 'showdown' && winners.length === 0 && dealerWins ? '— Dealer Wins' : ''}
      </div>
    </div>
  );
};
