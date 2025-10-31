import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { PlayerSpot } from './PlayerSpot';
import { DealerSpot } from './DealerSpot';
import { PotDisplay } from './PotDisplay';
import { Fireworks } from './Fireworks';
import { CelebrationOverlay } from './CelebrationOverlay';
import { useBlackjackGame } from '@/hooks/useBlackjackGame';
import { cn } from '@/lib/utils';
import feltTexture from '@/assets/poker-table-felt.jpg';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { formatChips } from '@/utils/contractMapping';
import { parseEther } from 'viem';
import { toast } from '@/lib/toast';
import { PlayControlPanel } from './PlayControlPanel';
import { TableStatsBar } from './TableStatsBar';
import { PlayerDecryptState } from './PlayerSpot';
import { Button } from '@/components/ui/button';

interface BlackjackTableProps {
  tableId?: bigint;
}

const toLowerSafe = (value?: string | null) => value?.toLowerCase() ?? '';

// Styling helpers for the showdown list so each outcome stands out consistently.
const outcomeStyles: Record<
  'blackjack' | 'win' | 'push' | 'lose' | 'bust',
  { label: string; className: string }
> = {
  blackjack: { label: 'Blackjack', className: 'text-emerald-300' },
  win: { label: 'Win', className: 'text-emerald-300' },
  push: { label: 'Push', className: 'text-sky-300' },
  lose: { label: 'Lose', className: 'text-rose-300' },
  bust: { label: 'Bust', className: 'text-rose-300' }
};

// Utility to coerce numeric inputs into positive BigInt chip values.
const parseChipAmount = (value: string): bigint | null => {
  try {
    const normalized = value.trim();
    if (!normalized) return null;
    const big = BigInt(normalized);
    return big > 0n ? big : null;
  } catch {
    return null;
  }
};

// Similar helper for ETH inputs (buying chips via contract payable methods).
const parseEthAmount = (value: string): bigint | null => {
  try {
    const normalized = value.trim();
    if (!normalized) return null;
    const wei = parseEther(normalized as `${number}`);
    return wei > 0n ? wei : null;
  } catch {
    return null;
  }
};

// High-level table component: wires hook data to a rich table UI.
export const BlackjackTable = ({ tableId }: BlackjackTableProps) => {
  // Local form state for top-level chip management and betting controls.
  const [betInput, setBetInput] = useState('');

  const {
    tableId: activeTableId,
    hasTable,
    table,
    gameState,
    connectedPlayer,
    walletChips,
    hasClaimedFreeChips,
    isSeated,
    isPlayerTurn,
    isLoading,
  awaitingNextHand,
  showdownResult,
  lastHandSummary,
  playerTableId,
  actions,
  pendingAction,
  playerDecryptState,
  dealerDecryptState,
  connectedDecryptedHand
  } = useBlackjackGame({ tableId });

  const [showLastResult, setShowLastResult] = useState(false);
  const lastShownHandRef = useRef<number | null>(null);
  const previousAwaitingRef = useRef(false);

  useEffect(() => {
    const currentTimestamp = lastHandSummary?.handTimestamp ?? null;
    const wasAwaiting = previousAwaitingRef.current;

    if (awaitingNextHand) {
      if (currentTimestamp !== null && currentTimestamp !== lastShownHandRef.current) {
        setShowLastResult(true);
      }
    } else if (wasAwaiting) {
      setShowLastResult(false);
    }

    lastShownHandRef.current = currentTimestamp;
    previousAwaitingRef.current = awaitingNextHand;
  }, [awaitingNextHand, lastHandSummary?.handTimestamp]);

  const activeSummary = useMemo(() => {
    if (showLastResult && lastHandSummary) {
      return lastHandSummary;
    }
    if (awaitingNextHand && showdownResult) {
      return showdownResult;
    }
    return null;
  }, [showLastResult, lastHandSummary, awaitingNextHand, showdownResult]);

  // When a showdown snapshot exists reuse it so the post-hand overlay stays stable.
  const players = useMemo(() => {
    if (activeSummary) {
      return activeSummary.players.map(({ player }) => player);
    }
    return gameState?.players ?? [];
  }, [activeSummary, gameState?.players]);

  // Extract the address list according to the same precedence (snapshot > live state).
  const winnersList = useMemo(() => {
    if (activeSummary) {
      return activeSummary.winners.map(({ player }) => player.address as string);
    }
    return gameState?.winners ?? [];
  }, [activeSummary, gameState?.winners]);
  const addressToName = useMemo(() => {
    const mapping = new Map<string, string>();
    players.forEach((player) => {
      mapping.set(player.address, player.name);
    });
    return mapping;
  }, [players]);
  const winnersSet = useMemo(() => new Set(winnersList), [winnersList]);
  const potAmount = activeSummary ? activeSummary.pot : gameState?.pot ?? 0;
  const dealerWins = activeSummary ? activeSummary.dealerWins : (gameState?.phase === 'showdown' && winnersList.length === 0);
  const minBuyIn = gameState?.minBuyIn ?? 10;
  const maxBuyIn = gameState?.maxBuyIn ?? minBuyIn;

  const availableChips = connectedPlayer ? connectedPlayer.chips + connectedPlayer.bet : 0;
  const availableChipsDisplay = formatChips(availableChips);
  const walletChipsDisplay = walletChips !== undefined ? formatChips(walletChips) : '—';
  const connectedCanAct = Boolean(
    connectedPlayer &&
      isPlayerTurn &&
      gameState?.phase === 'player-turn' &&
      !connectedPlayer.bust &&
      connectedPlayer.hand.length > 0
  );

  const canDouble = Boolean(
    connectedCanAct &&
      connectedPlayer &&
      connectedPlayer.hand.length === 2 &&
      connectedPlayer.chips >= connectedPlayer.bet
  );

  const shouldShowCards = Boolean(gameState?.roundActive || gameState?.phase === 'showdown' || activeSummary);
  const roundActiveDisplay = Boolean(gameState?.roundActive || activeSummary);
  const isShowdownPhase = gameState?.phase === 'showdown';

  const phaseLabel = useMemo(() => {
    if (awaitingNextHand) return 'AWAITING NEXT DEAL';
    const phase = gameState?.phase ?? 'waiting';
    return phase.replace('-', ' ').toUpperCase();
  }, [awaitingNextHand, gameState?.phase]);

  const activePlayerName = useMemo(() => {
    if (awaitingNextHand) return '—';
    if (!gameState) return '—';
    const idx = gameState.activePlayerIndex ?? 0;
    return gameState.players?.[idx]?.name ?? '—';
  }, [awaitingNextHand, gameState]);

  const disableActions = pendingAction !== null || isLoading || awaitingNextHand;
  const minBuyInDisplay = formatChips(minBuyIn);
  const maxBuyInDisplay = formatChips(maxBuyIn);
  const potDisplay = formatChips(potAmount);

  // Dealer & winners overlay reference either the persisted snapshot or the live state.
  const overlayDealer = activeSummary ? activeSummary.dealer : gameState?.dealer;
  const overlayDealerWins = activeSummary ? activeSummary.dealerWins : dealerWins;
  const overlayWinnerNames = activeSummary
    ? activeSummary.winners.map((entry) => entry.player.name)
    : winnersList.map((addr) => addressToName.get(addr) ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`);
  const lastHandAvailable = Boolean(lastHandSummary);

  const tableBackground = useMemo(
    () => ({
      backgroundImage: `radial-gradient(circle at top, hsla(45, 100%, 51%, 0.12), transparent 60%), url(${feltTexture})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }),
    []
  );

  const handlePlaceBet = async () => {
    if (!isSeated) {
      toast.error('Join the table before placing a bet.');
      return;
    }

    if (awaitingNextHand) {
      toast.info('Review the hand results and continue when ready.');
      return;
    }

    const amount = parseChipAmount(betInput);
    if (amount === null) {
      toast.error('Enter a valid chip amount to bet.');
      return;
    }

    const minRequirement = BigInt(minBuyIn);
    if (amount < minRequirement) {
      toast.error(`Bet must be at least ${minBuyInDisplay} chips.`);
      return;
    }

    if (connectedPlayer) {
      const maxAvailable = BigInt(connectedPlayer.chips) + BigInt(connectedPlayer.bet);
      if (amount > maxAvailable) {
        toast.error('Insufficient chips for that wager.');
        return;
      }
    }

    await actions.placeBet(amount);
  };

  const handleJoinTable = async (rawAmount: string) => {
    const amount = parseChipAmount(rawAmount);
    if (amount === null) {
      toast.error('Enter a valid buy-in amount.');
      return false;
    }

    const minRequirement = BigInt(minBuyIn);
    const maxLimit = BigInt(maxBuyIn);
    if (amount < minRequirement) {
      toast.error(`Buy-in must be at least ${minBuyInDisplay} chips.`);
      return false;
    }
    if (amount > maxLimit) {
      toast.error(`Buy-in cannot exceed ${maxBuyInDisplay} chips.`);
      return false;
    }

    const joined = await actions.joinTable(amount);
    return joined;
  };

  const handleTopUp = async (rawAmount: string) => {
    if (!isSeated) {
      toast.error('You must be seated to top up chips.');
      return false;
    }
    if (awaitingNextHand) {
      toast.info('Finish reviewing the previous hand before topping up.');
      return false;
    }
    if (gameState?.phase !== 'betting') {
      toast.info('Top ups are only available before cards are dealt.');
      return false;
    }
    const amount = parseChipAmount(rawAmount);
    if (amount === null) {
      toast.error('Enter a valid top-up amount.');
      return false;
    }
    return actions.topUpChips(amount);
  };

  const handleHitAction = () => actions.hit();
  const handleStandAction = () => actions.stand();
  const handleDoubleAction = () => actions.doubleDown();
  const handleForceAdvanceAction = () => actions.forceAdvanceOnTimeout();
  const handleLeaveTableAction = () => actions.leaveTable();
  const handleCashOutAction = () => actions.cashOut();

  const claimFreeChipsAction = actions.claimFreeChips;
  const buyChipsAction = actions.buyChips;
  const withdrawChipsAction = actions.withdrawChips;

  const submitWithdrawChips = useCallback(async (rawAmount: string) => {
    const amount = parseChipAmount(rawAmount);
    if (amount === null) {
      toast.error('Enter the chip amount you want to withdraw.');
      return false;
    }
    return withdrawChipsAction(amount);
  }, [withdrawChipsAction]);

  const submitBuyChips = useCallback(async (rawEth: string) => {
    const wei = parseEthAmount(rawEth);
    if (wei === null) {
      toast.error('Enter a valid ETH amount (e.g. 0.01).');
      return false;
    }
    return buyChipsAction(wei);
  }, [buyChipsAction]);

  const headerTableId = isSeated
    ? activeTableId
    : playerTableId && playerTableId > 0n
      ? playerTableId
      : undefined;

  const walletPanelConfig = useMemo(() => ({
    walletBalance: walletChipsDisplay,
    tableStack: connectedPlayer ? formatChips(connectedPlayer.chips) : undefined,
    availableForBet: availableChipsDisplay,
    pending: pendingAction !== null,
    onBuyChips: submitBuyChips,
    onWithdrawChips: submitWithdrawChips,
    onClaimFreeChips: claimFreeChipsAction,
    hasClaimedFreeChips
  }), [
    walletChipsDisplay,
    connectedPlayer,
    availableChipsDisplay,
    pendingAction,
    submitBuyChips,
    submitWithdrawChips,
    claimFreeChipsAction,
    hasClaimedFreeChips
  ]);

  const tableStats = useMemo(
    () => [
      { label: 'Table', value: `#${activeTableId.toString()}` },
      { label: 'Stage', value: phaseLabel },
      { label: 'Players', value: players.length.toString() },
      { label: 'Active', value: activePlayerName },
      { label: 'Pot', value: potDisplay },
      { label: 'Min Bet', value: minBuyInDisplay },
      { label: 'Max Bet', value: maxBuyInDisplay }
    ],
    [
      activeTableId,
      phaseLabel,
      players.length,
      activePlayerName,
      potDisplay,
      minBuyInDisplay,
      maxBuyInDisplay
    ]
  );

  const actionStatus = useMemo(() => {
    if (awaitingNextHand) return { label: 'Awaiting Next Deal', variant: 'waiting' as const };
    if (connectedCanAct) return { label: 'Your Move', variant: 'active' as const };
    if (disableActions) return { label: 'Locked', variant: 'locked' as const };
    return { label: 'Standing By', variant: 'idle' as const };
  }, [awaitingNextHand, connectedCanAct, disableActions]);

  const playControlPanelProps = {
    betInput,
    onBetChange: setBetInput,
    disableActions,
    isSeated,
    gamePhase: gameState?.phase,
    onPlaceBet: handlePlaceBet,
    onHit: handleHitAction,
    onStand: handleStandAction,
    onDouble: handleDoubleAction,
    onForceAdvance: handleForceAdvanceAction,
    connectedCanAct,
    canDouble,
    isPending: pendingAction !== null,
    availableChips: availableChipsDisplay,
    minBet: minBuyInDisplay,
    status: actionStatus
  } as const;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(235,199,93,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(16,75,95,0.25),transparent_60%)]" />
      <SiteHeader
        playerTableId={headerTableId}
        tablePhase={gameState?.phase}
        walletPanel={walletPanelConfig}
      />
      <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <TableStatsBar
          stats={tableStats}
          seatControls={{
            isSeated,
            hasTable,
            awaitingNextHand,
            disableAll: pendingAction !== null || isLoading,
            canTopUp: gameState?.phase === 'betting',
            minBuyIn: minBuyInDisplay,
            maxBuyIn: maxBuyInDisplay,
            walletChips: walletChipsDisplay,
            availableChips: connectedPlayer ? formatChips(connectedPlayer.chips) : undefined,
            onTopUp: handleTopUp,
            onLeave: handleLeaveTableAction,
            onCashOut: handleCashOutAction,
            onJoin: handleJoinTable
          }}
        />

        <div className="flex flex-1 flex-col gap-4 lg:flex-row">
          <section className="relative flex flex-1 justify-center">
            <div
              className="relative w-full max-w-[1180px] rounded-[40px] border border-primary/25 shadow-[0_32px_72px_-32px_rgba(0,0,0,0.75)]"
              style={tableBackground}
            >
              <div className="absolute inset-0 rounded-[40px] bg-black/28 backdrop-blur" />
              <div className="relative flex h-full flex-col gap-5 px-4 pb-12 pt-4 sm:px-6 sm:pb-12 sm:pt-6 lg:px-10">
                {lastHandAvailable && (
                  <div className="pointer-events-none absolute right-6 top-6 z-20 flex">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowLastResult((prev) => !prev)}
                      className="pointer-events-auto rounded-full px-4 uppercase tracking-[0.25em]"
                    >
                      {showLastResult ? 'Hide Last Hand' : 'Show Last Hand'}
                    </Button>
                  </div>
                )}
                <Fireworks active={Boolean(activeSummary && overlayWinnerNames.length > 0)} />

                <div className="flex w-full justify-center">
                  <DealerSpot
                    dealer={
                      overlayDealer ?? {
                        hand: [],
                        displayHand: [],
                        displayTotal: null,
                        cardsRevealed: Boolean(gameState?.dealer.cardsRevealed),
                        bust: false,
                        blackjack: false
                      }
                    }
                    hideSecondCard={!gameState?.dealer.cardsRevealed && !activeSummary}
                    dealerWins={overlayDealerWins}
                    potAmount={potAmount}
                    awaitingReveal={gameState?.phase === 'dealer-turn' && !gameState?.dealer.cardsRevealed}
                    decryptState={dealerDecryptState as PlayerDecryptState}
                  />
                </div>

                <div className="relative flex justify-center">
                  {activeSummary ? (
                    <CelebrationOverlay
                      winners={overlayWinnerNames}
                      dealerWins={overlayDealerWins}
                      onAcknowledge={awaitingNextHand ? () => actions.acknowledgeShowdown() : undefined}
                      acknowledgeDisabled={pendingAction !== null}
                    />
                  ) : isShowdownPhase ? (
                    <CelebrationOverlay winners={winnersList} dealerWins={overlayDealerWins} />
                  ) : (
                    <PotDisplay
                      amount={potAmount}
                      phase={gameState?.phase ?? 'waiting'}
                      winners={winnersList}
                      dealerWins={overlayDealerWins}
                    />
                  )}
                </div>

                <div className="relative mt-2 rounded-3xl border border-white/5 bg-black/28 px-4 pb-5 pt-5 backdrop-blur sm:px-6">
                  <div
                    className={cn(
                      'grid gap-4 sm:gap-5',
                      players.length === 0 && 'grid-cols-1 place-items-center',
                      players.length === 1 && 'grid-cols-1 place-items-center',
                      players.length === 2 && 'grid-cols-2 place-items-center sm:justify-items-center',
                      players.length === 3 && 'grid-cols-3 place-items-center',
                      players.length >= 4 && 'grid-cols-2 sm:grid-cols-4'
                    )}
                  >
                    {players.length === 0 && (
                      <div className="rounded-3xl border border-dashed border-primary/30 bg-black/30 p-6 text-center text-sm uppercase tracking-[0.45em] text-primary/60">
                        Waiting for players
                      </div>
                    )}
                    {players.map((player, index) => {
                      const isConnectedPlayerSpot =
                        toLowerSafe(player.address) === toLowerSafe(connectedPlayer?.address);
                      return (
                        <div key={player.id} className="flex justify-center">
                          <PlayerSpot
                            player={player}
                            isActive={gameState?.phase === 'player-turn' && index === (gameState?.activePlayerIndex ?? 0)}
                            showCards={shouldShowCards || player.cardsRevealed}
                            phase={gameState?.phase ?? 'waiting'}
                            roundActive={roundActiveDisplay}
                            isWinner={winnersSet.has(player.address)}
                            dealerWins={overlayDealerWins}
                            isConnected={isConnectedPlayerSpot}
                            decryptedHand={isConnectedPlayerSpot ? connectedDecryptedHand : undefined}
                            decryptState={isConnectedPlayerSpot ? (playerDecryptState as PlayerDecryptState) : undefined}
                            onRetryDecrypt={isConnectedPlayerSpot ? actions.retryPlayerDecrypt : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-auto">
                  <div className="sticky bottom-4 left-0 right-0 z-10">
                    <PlayControlPanel
                      {...playControlPanelProps}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
