import React from 'react';
import { Card as CardType } from '@/types/blackjack';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';

interface CardProps {
  card: CardType;
  faceUp?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const suitSymbols = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const Card = React.memo(({ card, faceUp = true, className, size = 'md' }: CardProps) => {
  const sizeClasses = {
    sm: 'w-11 h-16 text-base rounded-sm',
    md: 'w-16 h-24 text-2xl rounded-md',
    lg: 'w-24 h-36 text-4xl rounded-lg',
  } as const;

  const suitSizeClasses = {
    sm: 'text-[1.35em]',
    md: 'text-[2.1em]',
    lg: 'text-[2.6em]',
  } as const;

  const rankSizeClasses = {
    sm: 'text-[0.65em]',
    md: 'text-[0.8em]',
    lg: 'text-[0.95em]',
  } as const;

  const lockSize = {
    sm: 14,
    md: 22,
    lg: 28,
  } as const;

  const lockWrapper = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  } as const;

  if (!faceUp) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border border-primary/40 bg-gradient-to-br from-amber-500/10 via-emerald-500/10 to-cyan-500/20 shadow-[0_10px_25px_-15px_rgba(0,0,0,0.8)] backdrop-blur',
          sizeClasses[size],
          className
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.35),rgba(12,38,46,0.9))]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn('flex items-center justify-center rounded-full border border-primary/60 bg-black/55 shadow-lg', lockWrapper[size])}>
            <Lock size={lockSize[size]} className="text-primary" strokeWidth={2.4} />
          </div>
        </div>
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-transparent via-primary/10 to-transparent opacity-50" />
      </div>
    );
  }
  
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitSymbol = suitSymbols[card.suit];

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center font-bold drop-shadow-sm overflow-hidden rounded-lg border border-white/70 bg-gradient-to-br from-white via-slate-50 to-slate-200 shadow-[0_14px_35px_-20px_rgba(0,0,0,0.9)]',
        isRed ? 'text-rose-600' : 'text-zinc-900',
        sizeClasses[size],
        className
      )}
    >
      <div className={cn('absolute top-1 left-1.5 leading-none', rankSizeClasses[size])}>{card.rank}</div>
      <div className={cn('flex items-center justify-center', suitSizeClasses[size])}>{suitSymbol}</div>
      <div className={cn('absolute bottom-1 right-1.5 leading-none rotate-180', rankSizeClasses[size])}>{card.rank}</div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-white/20" />
    </div>
  );
});
