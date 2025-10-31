import { Player } from '@/types/blackjack';
import { Card } from './Card';
import { calculateHandValue } from '@/utils/contractMapping';
import playerAvatar from '@/assets/player-ghost.png';
import { cn } from '@/lib/utils';
import { ChipStack, ChipMotion } from './ChipStack';
import { RotateCcw } from 'lucide-react';

export type PlayerDecryptState = 'idle' | 'pending' | 'success' | 'error';

// Describes the player seat rendering requirements for any given state.
interface PlayerSpotProps {
  player?: Player;
  isActive?: boolean;
  showCards?: boolean;
  phase?: 'betting' | 'dealing' | 'player-turn' | 'dealer-turn' | 'showdown' | 'waiting';
  roundActive?: boolean;
  isWinner?: boolean;
  dealerWins?: boolean;
  decryptState?: PlayerDecryptState;
  onRetryDecrypt?: () => void;
}

const resultStyles: Record<Exclude<Player['result'], null>, { label: string; className: string }> = {
  blackjack: { label: 'Blackjack!', className: 'bg-emerald-500/90 text-emerald-50' },
  win: { label: 'Winner', className: 'bg-emerald-500/80 text-emerald-50' },
  push: { label: 'Push', className: 'bg-sky-500/80 text-sky-50' },
  lose: { label: 'Lost', className: 'bg-rose-500/80 text-rose-50' },
  bust: { label: 'Bust', className: 'bg-rose-600/80 text-rose-50' }
};

// Seat component: cards, chip stack, status badges, and result ribbons.
export const PlayerSpot = ({
  player,
  isActive,
  showCards = true,
  phase = 'waiting',
  roundActive = false,
  isWinner = false,
  dealerWins = false,
  decryptState,
  onRetryDecrypt
}: PlayerSpotProps) => {
  if (!player) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-24 h-24 rounded-full bg-secondary/30 border-2 border-dashed border-muted flex items-center justify-center">
          <span className="text-muted-foreground text-sm">Empty Seat</span>
        </div>
      </div>
    );
  }

  const revealedTotal = player.cardsRevealed
    ? player.displayTotal ?? calculateHandValue(player.hand)
    : null;
  const totalDisplay = revealedTotal ?? '??';
  const resultInfo = player.cardsRevealed && player.result ? resultStyles[player.result] : null;
  const showDecryptNotice = decryptState && decryptState !== 'idle' && !player.cardsRevealed;
  const decryptText =
    decryptState === 'pending'
      ? 'Decrypting…'
      : decryptState === 'error'
        ? 'Decryption failed'
        : null;

  let chipMotion: ChipMotion = 'idle';
  if (roundActive && phase === 'player-turn') {
    chipMotion = 'toPot';
  } else if (phase === 'showdown') {
    chipMotion = isWinner ? 'return' : dealerWins ? 'idle' : 'idle';
  }

  return (
    <div
      className={cn(
        'relative flex flex-col items-center gap-3 rounded-3xl border border-primary/25 bg-black/35 p-3 shadow-lg backdrop-blur transition-all',
        isActive && 'border-primary/70 shadow-primary/40 scale-[1.03]'
      )}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <div className={cn(
          'relative h-16 w-16 overflow-hidden rounded-full border-4 border-primary/40 bg-background/40 shadow-inner',
          player.bust && 'opacity-60'
        )}>
          <img
            src={playerAvatar}
            alt={player.name}
            className="h-full w-full object-cover"
          />
          {player.blackjack && (
            <div className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground shadow-lg">
              BJ
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col text-right">
          <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/80">{player.name}</span>
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.35em] text-muted-foreground/60">Bank</span>
          <span className="text-base font-black text-primary">{player.chips}</span>
          {player.bet > 0 && (
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/80">Stake: {player.bet}</span>
          )}
        </div>
      </div>

      {player.bet > 0 && (
        <div className="relative flex min-h-[28px] w-full items-center justify-center overflow-visible">
          <ChipStack amount={player.bet} size="sm" motion={chipMotion} />
        </div>
      )}

      {showCards && player.displayHand.length > 0 && (
        <div className="flex w-full flex-col items-center gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 justify-center sm:justify-start">
            <div className="rounded-2xl border border-primary/20 bg-secondary/25 px-3 py-2 shadow-inner">
              <div className="flex items-center">
                {player.displayHand.map((card, index) => (
                  <div
                    key={card.id}
                    className={cn('transition-transform', index > 0 && '-ml-5')}
                    style={{ zIndex: player.displayHand.length - index }}
                  >
                    <Card card={card} size="sm" faceUp={player.cardsRevealed} />
                  </div>
                ))}
              </div>
            </div>
          </div>
         <div
           className={cn(
             'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] shadow',
             player.cardsRevealed
               ? player.bust
                 ? 'bg-rose-600/90 text-rose-50'
                 : player.blackjack
                   ? 'bg-emerald-500/90 text-emerald-50'
                   : 'bg-primary/80 text-primary-foreground'
               : 'bg-muted/60 text-muted-foreground/80'
           )}
         >
           {player.cardsRevealed
             ? player.bust
               ? `Bust! (${totalDisplay})`
               : `Total ${totalDisplay}`
             : 'Encrypted Hand'}
         </div>
       </div>
      )}

      {showDecryptNotice && decryptText && (
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-full border border-primary/30 bg-black/60 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-primary/80">
            {decryptText}
          </div>
          {decryptState === 'error' && onRetryDecrypt && (
            <button
              type="button"
              onClick={onRetryDecrypt}
              className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-primary hover:bg-primary/20"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>
      )}

      {player.cardsRevealed && (player.bust || resultInfo) && (
        <div
          className={cn(
            'absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-widest shadow-lg',
            player.bust
              ? 'bg-rose-600/95 text-rose-50'
              : resultInfo?.className
          )}
        >
          {player.bust ? 'Bust!' : resultInfo?.label}
        </div>
      )}
    </div>
  );
};
