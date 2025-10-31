import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWatchContractEvent,
  useWriteContract,
  useWalletClient
} from 'wagmi';
import { blackjackContract } from '@/lib/contracts';
import { blackjackAbi } from '@/lib/blackjackAbi';
import { GameState, Player, Card } from '@/types/blackjack';
import { ContractCard, ContractTable, GamePhase, WinnerEventPayload } from '@/types/blackjackContract';
import {
  normalizeTable,
  toUiGameState,
  toShowdownSummaryFromHand,
  summarizeShowdown,
  ShowdownSummary,
  toHiddenCard,
  toUiCard,
  calculateHandValue
} from '@/utils/contractMapping';
import { ensureFhevmInstance, getBrowserProvider, hexlifyHandle } from '@/lib/fhevm';
import { loadOrCreateSignature } from '@/lib/decryptionSignature';

const DEFAULT_TABLE_ID = 1n;
const TABLE_POLL_INTERVAL = 15_000;
const PLAYER_POLL_INTERVAL = 30_000;
const TURN_POLL_INTERVAL = 12_000;
const WALLET_POLL_INTERVAL = 45_000;
const CLAIM_POLL_INTERVAL = 120_000;

const toLower = (value?: string | null) => value?.toLowerCase();

const HANDLE_RETRY_LIMIT = 3;
const HANDLE_RETRY_DELAY_MS = 250;

const sleep = (ms: number) => new Promise<void>((resolve) => {
  const id = setTimeout(() => {
    clearTimeout(id);
    resolve();
  }, ms);
});

type DecryptState = 'idle' | 'pending' | 'success' | 'error';

export interface UseBlackjackGameOptions {
  tableId?: bigint;
}

export interface BlackjackGameData {
  contractAddress?: `0x${string}`;
  tableId: bigint;
  hasTable: boolean;
  table?: ContractTable;
  gameState?: GameState;
  connectedPlayer?: Player;
  walletChips?: bigint;
  hasClaimedFreeChips?: boolean;
  playerTableId?: bigint;
  isSeated: boolean;
  isPlayerTurn?: boolean;
  winners: WinnerEventPayload | null;
  isLoading: boolean;
  showdownResult: ShowdownSummary | null;
  awaitingNextHand: boolean;
  playerDecryptState: DecryptState;
  dealerDecryptState: DecryptState;
  connectedDecryptedHand?: { cards: Card[]; total: number };
  lastHandSummary: ShowdownSummary | null;
  refetchAll: () => Promise<void>;
  actions: {
    claimFreeChips: () => Promise<boolean>;
    buyChips: (weiAmount: bigint) => Promise<boolean>;
    withdrawChips: (chipAmount: bigint) => Promise<boolean>;
    createTable: (minBuyIn: bigint, maxBuyIn: bigint) => Promise<boolean>;
    joinTable: (buyIn: bigint) => Promise<boolean>;
    leaveTable: () => Promise<boolean>;
    cashOut: () => Promise<boolean>;
    topUpChips: (amount: bigint) => Promise<boolean>;
    placeBet: (amount: bigint) => Promise<boolean>;
    hit: () => Promise<boolean>;
    stand: () => Promise<boolean>;
    doubleDown: () => Promise<boolean>;
    forceAdvanceOnTimeout: () => Promise<boolean>;
    acknowledgeShowdown: () => Promise<void>;
    retryPlayerDecrypt: () => void;
  };
  pendingAction: string | null;
}

// Rich game hook – handles reads, write helpers, and showdown lifecycle.
export const useBlackjackGame = (
  { tableId = DEFAULT_TABLE_ID }: UseBlackjackGameOptions = {}
): BlackjackGameData => {
  const { address: walletAddress } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [winners, setWinners] = useState<WinnerEventPayload | null>(null);
  const [acknowledgedResultTimestamp, setAcknowledgedResultTimestamp] = useState<number>(0);
  const [decryptedHands, setDecryptedHands] = useState<Record<string, { cards: Card[]; total: number }>>({});
  const [dealerPublicHand, setDealerPublicHand] = useState<{ cards: Card[]; total: number } | null>(null);
  const [playerDecryptState, setPlayerDecryptState] = useState<DecryptState>('idle');
  const [dealerDecryptState, setDealerDecryptState] = useState<DecryptState>('idle');
  const playerDecryptErrorRef = useRef<string | null>(null);
  const dealerDecryptErrorRef = useRef<number | null>(null);
  const lastPlayerHandleSignatureRef = useRef<string | null>(null);
  const lastDealerHandleSignatureRef = useRef<string | null>(null);
  const lastPlayerHandSignatureRef = useRef<string>('0');
  const lastPlayerAttemptedSignatureRef = useRef<string>('0');
  const failedPlayerHandSignatureRef = useRef<string | null>(null);
  const playerDecryptInFlightRef = useRef<string | null>(null);
  const dealerDecryptInFlightRef = useRef<number | null>(null);
  const lastDealerResultTimestampRef = useRef<number>(0);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerDecryptCacheRef = useRef(new Map<string, { cards: Card[]; total: number }>());
  const dealerDecryptCacheRef = useRef(new Map<string, { cards: Card[]; total: number }>());
  const [connectedDecryptedHandState, setConnectedDecryptedHandState] = useState<{ cards: Card[]; total: number } | undefined>(undefined);

  const lowerWalletAddress = useMemo(() => toLower(walletAddress), [walletAddress]);

  const playerDecryptedHand = useMemo(() => {
    if (!walletAddress) return undefined;
    const key = lowerWalletAddress;
    if (!key) return undefined;
    return decryptedHands[key] ?? undefined;
  }, [walletAddress, decryptedHands, lowerWalletAddress]);

  const contractAddress = blackjackContract.address;
  const transportType = publicClient?.transport?.type;
  const supportsFilters = transportType === 'webSocket' || transportType === 'ipc';
  const shouldPoll = !supportsFilters;
  const eventsEnabled = Boolean(contractAddress) && supportsFilters;
  const readEnabled = Boolean(contractAddress);

  const {
    data: tablesCount,
    refetch: refetchTablesCount
  } = useReadContract({
    ...blackjackContract,
    functionName: 'getTablesCount',
    query: {
      enabled: readEnabled,
      refetchInterval: shouldPoll ? TABLE_POLL_INTERVAL : false
    }
  });

  const hasTable = Boolean(tablesCount && tableId <= (tablesCount as bigint));

  const {
    data: rawTable,
    refetch: refetchTable,
    isFetching: isFetchingTable
  } = useReadContract({
    ...blackjackContract,
    functionName: 'getTableState',
    args: [tableId] as const,
    query: {
      enabled: readEnabled && hasTable,
      refetchInterval: shouldPoll ? TABLE_POLL_INTERVAL : false,
      retry: 1
    }
  });

  const {
    data: walletChips,
    refetch: refetchWalletChips
  } = useReadContract({
    ...blackjackContract,
    functionName: 'playerChips',
    args: walletAddress ? [walletAddress] as const : undefined,
    query: {
      enabled: readEnabled && Boolean(walletAddress),
      refetchInterval: shouldPoll ? WALLET_POLL_INTERVAL : false
    }
  });

  const {
    data: hasClaimed,
    refetch: refetchClaimStatus
  } = useReadContract({
    ...blackjackContract,
    functionName: 'hasClaimedFreeChips',
    args: walletAddress ? [walletAddress] as const : undefined,
    query: {
      enabled: readEnabled && Boolean(walletAddress),
      refetchInterval: shouldPoll ? CLAIM_POLL_INTERVAL : false
    }
  });

  const {
    data: currentTableId,
    refetch: refetchPlayerTable
  } = useReadContract({
    ...blackjackContract,
    functionName: 'playerTableId',
    args: walletAddress ? [walletAddress] as const : undefined,
    query: {
      enabled: readEnabled && Boolean(walletAddress),
      refetchInterval: shouldPoll ? PLAYER_POLL_INTERVAL : false
    }
  });

  const {
    data: playerTurn,
    refetch: refetchTurnStatus
  } = useReadContract({
    ...blackjackContract,
    functionName: 'isPlayerTurn',
    args: walletAddress ? [tableId, walletAddress] as const : undefined,
    query: {
      enabled: readEnabled && Boolean(walletAddress) && hasTable,
      refetchInterval: shouldPoll ? TURN_POLL_INTERVAL : false
    }
  });

  const table = useMemo(() => {
    if (!rawTable) return undefined;
    return normalizeTable(rawTable);
  }, [rawTable]);

  // Keep the live in-hand view in sync with `getTableState`.
  const baseGameState = useMemo(() => {
    const normalizedTable = normalizeTable(rawTable);
    return toUiGameState(normalizedTable);
  }, [rawTable]);

  const playerHandSignature = useMemo(() => {
    if (!baseGameState || !walletAddress) return '0';
    const lower = toLower(walletAddress);
    const player = baseGameState.players.find((entry) => toLower(entry.address) === lower);
    if (!player) return '0';
    const ids = player.hand.map((card) => card.id).join('|');
    return `${player.hand.length}:${ids}`;
  }, [baseGameState, walletAddress]);

  const latestResultTimestamp = useMemo(() => {
    if (!table) return 0;
    const timestamp = Number(table.lastHandResult.timestamp ?? 0n);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }, [table]);

  const showdownPlayerCards = useMemo(() => {
    if (!table) return new Map<string, { cards: Card[]; total: number }>();
    const results = table.lastHandResult?.results ?? [];
    const map = new Map<string, { cards: Card[]; total: number }>();
    for (const result of results) {
      const cards = result.cards.map((card, index) => toUiCard(card as ContractCard, index));
      map.set(toLower(result.addr), { cards, total: calculateHandValue(cards) });
    }
    return map;
  }, [table]);

  // Whenever a snapshot exists, transform it for the UI (fallback to live phase if needed).
  const rawShowdownSummary = useMemo(() => {
    if (!table) return null;

    const lookup = new Map<string, Player>();
    if (baseGameState) {
      for (const player of baseGameState.players) {
        const key = toLower(player.address);
        if (key) lookup.set(key, player);
      }
    }

    const summary = toShowdownSummaryFromHand(Number(table.id), table.lastHandResult, lookup);
    if (summary) return summary;

    if (baseGameState && baseGameState.phase === 'showdown') {
      return summarizeShowdown(baseGameState);
    }

    return null;
  }, [table, baseGameState]);

  const betweenHands = useMemo(() => {
    if (baseGameState) {
      return baseGameState.phase === 'betting';
    }
    if (table) {
      return table.phase === GamePhase.WaitingForPlayers;
    }
    return false;
  }, [baseGameState, table]);

  // True until the latest stored snapshot has been acknowledged locally.
  const awaitingNextHand = useMemo(() => {
    if (!rawShowdownSummary) return false;
    if (latestResultTimestamp === 0) return false;
    if (!betweenHands) return false;
    return latestResultTimestamp !== acknowledgedResultTimestamp;
  }, [rawShowdownSummary, latestResultTimestamp, acknowledgedResultTimestamp, betweenHands]);

  // Only surface the showdown summary while we are paused between hands.
  const showdownResult = useMemo(() => {
    if (!awaitingNextHand) return null;
    return rawShowdownSummary;
  }, [awaitingNextHand, rawShowdownSummary]);

  const lastHandSummary = rawShowdownSummary;

  useEffect(() => {
    if (!table) {
      setAcknowledgedResultTimestamp(0);
      return;
    }
  }, [tableId, table]);

  useEffect(() => {
    if (tablesCount !== undefined) {
      console.info('[BlackjackGame] Tables count updated', tablesCount);
    }
  }, [tablesCount]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const resetPending = () => {
      playerDecryptInFlightRef.current = null;
    };

    const run = async () => {
      if (cancelled) return;

      if (!walletAddress || !contractAddress || !publicClient || !baseGameState) {
        if (!walletAddress) {
          setDecryptedHands({});
          lastPlayerHandSignatureRef.current = '0';
          setConnectedDecryptedHandState(undefined);
        }
        playerDecryptErrorRef.current = null;
        setPlayerDecryptState('idle');
        resetPending();
        clearRetryTimer();
        return;
      }

      if (!lowerWalletAddress) {
        resetPending();
        clearRetryTimer();
        return;
      }

      const lower = lowerWalletAddress;
      const player = baseGameState.players.find((entry) => toLower(entry.address) === lower);
      const expectedCardCount = player?.hand.length ?? 0;

      if (!player || expectedCardCount === 0) {
        setDecryptedHands((prev) => {
          if (!(lower in prev)) return prev;
          const next = { ...prev };
          delete next[lower];
          return next;
        });
        if (lower === lowerWalletAddress) {
          setConnectedDecryptedHandState(undefined);
        }
        playerDecryptErrorRef.current = null;
        setPlayerDecryptState('idle');
        lastPlayerHandSignatureRef.current = '0';
        resetPending();
        clearRetryTimer();
        return;
      }

      const currentHandSignature = playerHandSignature;
      if (failedPlayerHandSignatureRef.current && failedPlayerHandSignatureRef.current !== currentHandSignature) {
        failedPlayerHandSignatureRef.current = null;
      }

      const decryptedMatchesHand =
        Boolean(
          playerDecryptedHand &&
          playerDecryptedHand.cards.length === expectedCardCount &&
          lastPlayerHandSignatureRef.current === currentHandSignature
        );

      if (decryptedMatchesHand) {
        resetPending();
        clearRetryTimer();
        if (playerDecryptState !== 'success') {
          setPlayerDecryptState('success');
        }
        return;
      }

      if (failedPlayerHandSignatureRef.current === currentHandSignature) {
        resetPending();
        clearRetryTimer();
        if (playerDecryptState !== 'error') {
          setPlayerDecryptState('error');
        }
        return;
      }

      if (
        lastPlayerAttemptedSignatureRef.current === currentHandSignature &&
        playerDecryptState !== 'pending'
      ) {
        resetPending();
        clearRetryTimer();
        return;
      }

      if (playerDecryptInFlightRef.current === currentHandSignature && playerDecryptState === 'pending') {
        return;
      }

      playerDecryptInFlightRef.current = currentHandSignature;
      lastPlayerAttemptedSignatureRef.current = currentHandSignature;
      failedPlayerHandSignatureRef.current = null;
      setPlayerDecryptState((prev) => (prev === 'pending' ? prev : 'pending'));

      console.info('[BlackjackGame] Player decrypt attempt', {
        tableId: tableId.toString(),
        player: lower,
        handSignature: currentHandSignature,
        handSize: expectedCardCount,
        decryptedSize: playerDecryptedHand?.cards.length ?? 0
      });

      let rankHandles: `0x${string}`[] = [];
      let suitHandles: `0x${string}`[] = [];
      let handleSignature: string | null = null;

      let fetchError: unknown = null;
      for (let attempt = 0; attempt < HANDLE_RETRY_LIMIT; attempt++) {
        if (cancelled) return;
        console.info('[BlackjackGame] Fetching player encrypted handles', {
          tableId: tableId.toString(),
          player: lower,
          expectedCardCount
        });
        try {
          const response = await publicClient.readContract({
            ...blackjackContract,
            functionName: 'getPlayerEncryptedHandles',
            args: [tableId, walletAddress] as const
          });

          [rankHandles, suitHandles] = response as readonly [`0x${string}`[], `0x${string}`[]];
          if (Array.isArray(rankHandles) && rankHandles.length > 0) {
            if (expectedCardCount > 0 && rankHandles.length < expectedCardCount) {
              console.info('[BlackjackGame] Handle fetch incomplete, retrying', {
                tableId: tableId.toString(),
                player: lower,
                expectedCardCount,
                fetched: rankHandles.length
              });
              rankHandles = [];
              suitHandles = [];
            } else {
              handleSignature = `${tableId.toString()}::${lower}::${rankHandles.join('|')}::${suitHandles.join('|')}`;
              console.info('[BlackjackGame] Player handles fetched', {
                tableId: tableId.toString(),
                player: lower,
                rankCount: rankHandles.length,
                suitCount: suitHandles.length,
                handleSignature
              });
              break;
            }
          }
        } catch (error) {
          fetchError = error;
          break;
        }

        if (attempt < HANDLE_RETRY_LIMIT - 1) {
          await sleep(HANDLE_RETRY_DELAY_MS * (attempt + 1));
        }
      }

      if (fetchError) {
        console.error('[BlackjackGame] Failed to load encrypted handles', fetchError);
        if (!cancelled) {
          if (playerDecryptErrorRef.current !== currentHandSignature) {
            playerDecryptErrorRef.current = currentHandSignature;
            toast.error('Unable to read encrypted cards. Retry once the network is available.');
          }
          failedPlayerHandSignatureRef.current = currentHandSignature;
          setPlayerDecryptState('error');
        }
        resetPending();
        clearRetryTimer();
        return;
      }

      if (!Array.isArray(rankHandles) || rankHandles.length === 0) {
        resetPending();
        clearRetryTimer();
        retryTimer = setTimeout(() => {
          console.info('[BlackjackGame] Retrying handle fetch after empty response', {
            tableId: tableId.toString(),
            player: lower,
            handSignature: currentHandSignature
          });
          if (!cancelled) {
            run();
          }
        }, HANDLE_RETRY_DELAY_MS * HANDLE_RETRY_LIMIT);
        return;
      }

      if (handleSignature) {
        if (
          handleSignature === lastPlayerHandleSignatureRef.current &&
          playerDecryptedHand &&
          playerDecryptedHand.cards.length === player.hand.length
        ) {
          lastPlayerHandSignatureRef.current = currentHandSignature;
          resetPending();
          setPlayerDecryptState('success');
          return;
        }

        const cached = playerDecryptCacheRef.current.get(handleSignature);
        if (cached && cached.cards.length === expectedCardCount) {
          if (!cancelled) {
            const cachedCards = cached.cards.map((card) => ({ ...card }));
            setDecryptedHands((prev) => ({
              ...prev,
              [lower]: { cards: cachedCards, total: cached.total }
            }));
            if (lower === lowerWalletAddress) {
              setConnectedDecryptedHandState({
                cards: cachedCards.map((card) => ({ ...card })),
                total: cached.total
              });
            }
            playerDecryptErrorRef.current = null;
            setPlayerDecryptState('success');
            lastPlayerHandleSignatureRef.current = handleSignature;
            lastPlayerHandSignatureRef.current = currentHandSignature;
          }
          resetPending();
          clearRetryTimer();
          return;
        }
      }

      let scheduledHandleRetry = false;
      try {
        const fhe = await ensureFhevmInstance();

        const signingContext = await (async () => {
          try {
            const browserProvider = await getBrowserProvider();
            return { browserProvider };
          } catch (error) {
            if (walletClient) {
              return { walletClient };
            }
            return null;
          }
        })();

        if (!signingContext) {
          console.info('[BlackjackGame] Waiting for wallet provider to authorise decryption');
          scheduledHandleRetry = true;
          playerDecryptInFlightRef.current = null;
          retryTimer = setTimeout(() => {
            if (!cancelled) {
              run();
            }
          }, HANDLE_RETRY_DELAY_MS * (HANDLE_RETRY_LIMIT + 1));
          return;
        }

        const signature = await loadOrCreateSignature(
          fhe,
          contractAddress as `0x${string}`,
          signingContext
        );

        const queries = [...rankHandles, ...suitHandles].map((handle) => ({
          handle: hexlifyHandle(handle),
          contractAddress: contractAddress as `0x${string}`
        }));

        const decrypted = await fhe.userDecrypt(
          queries,
          signature.privateKey,
          signature.publicKey,
          signature.signature,
          signature.contractAddresses,
          signature.userAddress,
          signature.startTimestamp,
          signature.durationDays
        );

        const ranks = rankHandles.map((handle) => Number(decrypted[hexlifyHandle(handle)]));
        const suits = suitHandles.map((handle) => Number(decrypted[hexlifyHandle(handle)]));

        if (ranks.length !== suits.length) {
          throw new Error('Encrypted rank/suit handle count mismatch');
        }

        const cards = ranks.map((rank, index) => {
          const rankValue = Number.isFinite(rank) ? rank : 0;
          const suitValue = Number.isFinite(suits[index]) ? suits[index] : 0;
          const data: ContractCard = { rank: rankValue, suit: suitValue };
          return toUiCard(data, index);
        });
        const total = calculateHandValue(cards);
        if (!cancelled && expectedCardCount > 0 && cards.length < expectedCardCount) {
          console.info('[BlackjackGame] Decrypt yielded fewer cards than expected, retrying', {
            tableId: tableId.toString(),
            player: lower,
            expectedCount: expectedCardCount,
            decryptedCount: cards.length
          });
          scheduledHandleRetry = true;
          playerDecryptInFlightRef.current = null;
          failedPlayerHandSignatureRef.current = null;
          retryTimer = setTimeout(() => {
            if (!cancelled) {
              run();
            }
          }, HANDLE_RETRY_DELAY_MS * (HANDLE_RETRY_LIMIT + 1));
          return;
        }

        if (!cancelled) {
          console.info('[BlackjackGame] Player decrypt result', {
            tableId: tableId.toString(),
            player: lower,
            handSignature: currentHandSignature,
            ranks,
            suits,
            cardCount: cards.length,
            total
          });
          setDecryptedHands((prev) => {
            const nextCards = cards.map((card) => ({ ...card }));
            return {
              ...prev,
              [lower]: { cards: nextCards, total }
            };
          });
          if (lower === lowerWalletAddress) {
            const stateCards = cards.map((card) => ({ ...card }));
            setConnectedDecryptedHandState({ cards: stateCards, total });
          }
          playerDecryptErrorRef.current = null;
          failedPlayerHandSignatureRef.current = null;
          setPlayerDecryptState('success');
          lastPlayerHandleSignatureRef.current = handleSignature;
          lastPlayerHandSignatureRef.current = currentHandSignature;
          if (handleSignature) {
            playerDecryptCacheRef.current.set(handleSignature, {
              cards: cards.map((card) => ({ ...card })),
              total
            });
          }
        }
      } catch (error) {
        console.error('[BlackjackGame] Failed to decrypt player hand', error);
        if (!cancelled) {
          setDecryptedHands((prev) => {
            if (!(lower in prev)) return prev;
            const next = { ...prev };
            delete next[lower];
            return next;
          });
          if (playerDecryptErrorRef.current !== playerHandSignature) {
            playerDecryptErrorRef.current = playerHandSignature;
            toast.error('Unable to decrypt your cards. Use the retry control once you have approved the request.');
          }
          console.warn('[BlackjackGame] Player decrypt failed', {
            tableId: tableId.toString(),
            player: lower,
            handSignature: currentHandSignature,
            expectedCardCount,
            error: (error as Error)?.message ?? error
          });
          setPlayerDecryptState('error');
          lastPlayerHandleSignatureRef.current = null;
          failedPlayerHandSignatureRef.current = currentHandSignature;
          lastPlayerAttemptedSignatureRef.current = currentHandSignature;
        }
      } finally {
        if (!scheduledHandleRetry) {
          resetPending();
          clearRetryTimer();
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      playerDecryptInFlightRef.current = null;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [
    walletAddress,
    lowerWalletAddress,
    contractAddress,
    publicClient,
    walletClient,
    tableId,
    baseGameState,
    playerHandSignature,
    playerDecryptedHand,
    playerDecryptState
  ]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const resetPending = () => {
      dealerDecryptInFlightRef.current = null;
    };

    const run = async () => {
      if (cancelled) return;

      if (!contractAddress || !publicClient || !awaitingNextHand || latestResultTimestamp === 0) {
        clearRetryTimer();
        resetPending();
        if (!cancelled) {
          setDealerPublicHand(null);
          dealerDecryptErrorRef.current = null;
          setDealerDecryptState('idle');
          lastDealerHandleSignatureRef.current = null;
          lastDealerResultTimestampRef.current = 0;
        }
        return;
      }

      if (
        dealerPublicHand &&
        lastDealerResultTimestampRef.current === latestResultTimestamp &&
        dealerDecryptState !== 'error'
      ) {
        resetPending();
        clearRetryTimer();
        if (dealerDecryptState !== 'success') {
          setDealerDecryptState('success');
        }
        return;
      }

      const shouldAttempt =
        dealerDecryptState === 'error' ||
        !dealerPublicHand ||
        lastDealerResultTimestampRef.current !== latestResultTimestamp;

      if (!shouldAttempt) {
        return;
      }

      if (dealerDecryptState === 'pending' && dealerDecryptInFlightRef.current === latestResultTimestamp) {
        return;
      }

      dealerDecryptInFlightRef.current = latestResultTimestamp;
      setDealerDecryptState((prev) => (prev === 'pending' ? prev : 'pending'));

      let rankHandles: `0x${string}`[] = [];
      let suitHandles: `0x${string}`[] = [];
      let handleSignature: string | null = null;

      for (let attempt = 0; attempt < HANDLE_RETRY_LIMIT; attempt++) {
        if (cancelled) return;

        const response = await publicClient.readContract({
          ...blackjackContract,
          functionName: 'getLastDealerEncryptedHandles',
          args: [tableId] as const
        });

        [rankHandles, suitHandles] = response as readonly [`0x${string}`[], `0x${string}`[]];
        if (Array.isArray(rankHandles) && rankHandles.length > 0) {
          handleSignature = `${tableId.toString()}::${latestResultTimestamp.toString()}::${rankHandles.join('|')}::${suitHandles.join('|')}`;
          break;
        }

        if (attempt < HANDLE_RETRY_LIMIT - 1) {
          await sleep(HANDLE_RETRY_DELAY_MS * (attempt + 1));
        }
      }

      if (!Array.isArray(rankHandles) || rankHandles.length === 0) {
        resetPending();
        clearRetryTimer();
        retryTimer = setTimeout(() => {
          if (!cancelled) {
            run();
          }
        }, HANDLE_RETRY_DELAY_MS * HANDLE_RETRY_LIMIT);
        return;
      }

      if (handleSignature) {
        if (handleSignature === lastDealerHandleSignatureRef.current && dealerPublicHand) {
          lastDealerResultTimestampRef.current = latestResultTimestamp;
          resetPending();
          setDealerDecryptState('success');
          return;
        }

        const cached = dealerDecryptCacheRef.current.get(handleSignature);
        if (cached) {
          if (!cancelled) {
            const cachedCards = cached.cards.map((card) => ({ ...card }));
            setDealerPublicHand({ cards: cachedCards, total: cached.total });
            dealerDecryptErrorRef.current = null;
            setDealerDecryptState('success');
            lastDealerHandleSignatureRef.current = handleSignature;
            lastDealerResultTimestampRef.current = latestResultTimestamp;
          }
          resetPending();
          clearRetryTimer();
          return;
        }
      }

      try {
        const fhe = await ensureFhevmInstance();
        const rankHex = rankHandles.map((handle) => hexlifyHandle(handle));
        const suitHex = suitHandles.map((handle) => hexlifyHandle(handle));
        const decrypted = await fhe.publicDecrypt([...rankHex, ...suitHex]);

        const ranks = rankHex.map((handle) => Number(decrypted[handle]));
        const suits = suitHex.map((handle) => Number(decrypted[handle]));

        if (ranks.length !== suits.length) {
          throw new Error('Dealer rank/suit handle mismatch');
        }

        const cards = ranks.map((rank, index) => {
          const rankValue = Number.isFinite(rank) ? rank : 0;
          const suitValue = Number.isFinite(suits[index]) ? suits[index] : 0;
          const data: ContractCard = { rank: rankValue, suit: suitValue };
          return toUiCard(data, index);
        });
        const total = calculateHandValue(cards);

        if (!cancelled) {
          console.debug('[BlackjackGame] Dealer decrypt result', { rankHandles, suitHandles, decrypted });
          setDealerPublicHand({ cards, total });
          dealerDecryptErrorRef.current = null;
          setDealerDecryptState('success');
          lastDealerHandleSignatureRef.current = handleSignature;
          lastDealerResultTimestampRef.current = latestResultTimestamp;
          if (handleSignature) {
            dealerDecryptCacheRef.current.set(handleSignature, {
              cards: cards.map((card) => ({ ...card })),
              total
            });
          }
        }
      } catch (error) {
        console.error('[BlackjackGame] Failed to decrypt dealer hand', error);
        if (!cancelled) {
          setDealerPublicHand(null);
          if (dealerDecryptErrorRef.current !== latestResultTimestamp) {
            dealerDecryptErrorRef.current = latestResultTimestamp;
            toast.error('Unable to reveal dealer cards. Retry once the FHE oracle responds.');
          }
          setDealerDecryptState('error');
          lastDealerHandleSignatureRef.current = null;
          lastDealerResultTimestampRef.current = 0;
        }
      } finally {
        resetPending();
        clearRetryTimer();
      }
    };

    run();

    return () => {
      cancelled = true;
      dealerDecryptInFlightRef.current = null;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [
    contractAddress,
    publicClient,
    tableId,
    awaitingNextHand,
    latestResultTimestamp,
    dealerDecryptState,
    dealerPublicHand
  ]);

  useEffect(() => {
    if (!baseGameState) {
      return;
    }

    const player = lowerWalletAddress
      ? baseGameState.players.find((entry) => toLower(entry.address) === lowerWalletAddress)
      : undefined;
    const expectedCardCount = player?.hand.length ?? 0;
    const decryptedCount = playerDecryptedHand?.cards.length ?? 0;

    if (expectedCardCount === 0) {
      if (playerDecryptState !== 'idle') {
        setPlayerDecryptState('idle');
      }
      return;
    }

    if (decryptedCount >= expectedCardCount && playerDecryptState !== 'success') {
      setPlayerDecryptState('success');
    }
  }, [baseGameState, lowerWalletAddress, playerDecryptedHand, playerDecryptState]);

  useEffect(() => {
    if (table) {
      console.info('[BlackjackGame] Table state updated', {
        tableId,
        phase: table.phase,
        lastActivityTimestamp: table.lastActivityTimestamp,
        latestResultTimestamp
      });
    }
  }, [table, tableId, latestResultTimestamp]);

  useEffect(() => {
    if (!baseGameState || !lowerWalletAddress) return;
    const player = baseGameState.players.find(
      (entry) => toLower(entry.address) === lowerWalletAddress
    );
    if (!player) {
      if (connectedDecryptedHandState) {
        setConnectedDecryptedHandState(undefined);
      }
      playerDecryptInFlightRef.current = null;
      failedPlayerHandSignatureRef.current = null;
      lastPlayerHandSignatureRef.current = '0';
      lastPlayerAttemptedSignatureRef.current = '0';
      return;
    }

    const expectedCardCount = player.hand.length;
    if (expectedCardCount === 0) {
      if (connectedDecryptedHandState) {
        setConnectedDecryptedHandState(undefined);
      }
      playerDecryptInFlightRef.current = null;
      failedPlayerHandSignatureRef.current = null;
      lastPlayerHandSignatureRef.current = '0';
      lastPlayerAttemptedSignatureRef.current = '0';
      return;
    }

    const lower = lowerWalletAddress;
    const storedRecord = lower ? decryptedHands[lower] : undefined;
    const resolvedCount =
      connectedDecryptedHandState?.cards.length ??
      playerDecryptedHand?.cards.length ??
      storedRecord?.cards.length ??
      0;

    if (resolvedCount < expectedCardCount) {
      if (connectedDecryptedHandState) {
        setConnectedDecryptedHandState(undefined);
      }
      playerDecryptInFlightRef.current = null;
      failedPlayerHandSignatureRef.current = null;
      lastPlayerHandSignatureRef.current = '0';
      lastPlayerAttemptedSignatureRef.current = '0';
      if (playerDecryptState !== 'pending') {
        setPlayerDecryptState('pending');
      }
    }
  }, [
    baseGameState,
    connectedDecryptedHandState,
    decryptedHands,
    lowerWalletAddress,
    playerDecryptedHand,
    playerDecryptState
  ]);

  const decoratedGameState = useMemo(() => {
    if (!baseGameState) return undefined;

    const players = baseGameState.players.map((player) => {
      const lower = toLower(player.address);
      const isConnectedPlayer = lowerWalletAddress && lower === lowerWalletAddress;
      const showdown = awaitingNextHand ? showdownPlayerCards.get(lower) : undefined;
      const decryptedSource = isConnectedPlayer
        ? connectedDecryptedHandState ?? playerDecryptedHand ?? decryptedHands[lower ?? '']
        : lower
          ? decryptedHands[lower]
          : undefined;

      const baseHandLength = player.hand.length;
      let displayHand: Card[] = player.displayHand;
      let displayTotal: number | null = player.displayTotal;
      let cardsRevealed = player.cardsRevealed;

      if (showdown) {
        displayHand = showdown.cards;
        displayTotal = showdown.total;
        cardsRevealed = true;
      } else if (decryptedSource) {
        const combined = decryptedSource.cards.slice(0, baseHandLength).map((card) => ({ ...card }));
        const hasFullDecrypt =
          baseHandLength > 0 && decryptedSource.cards.length >= baseHandLength;
        for (let index = combined.length; index < baseHandLength; index++) {
          combined.push(toHiddenCard(index, player.id));
        }
        displayHand = combined;
        displayTotal = hasFullDecrypt ? decryptedSource.total : null;
        cardsRevealed = hasFullDecrypt;
      } else {
        displayHand = player.hand.map((_, index) => toHiddenCard(index, player.id));
        displayTotal = null;
        cardsRevealed = false;
      }

      return {
        ...player,
        displayHand,
        displayTotal,
        cardsRevealed
      };
    });

    let dealerDisplayHand = baseGameState.dealer.displayHand;
    let dealerDisplayTotal = baseGameState.dealer.displayTotal;
    let dealerCardsRevealed = baseGameState.dealer.cardsRevealed;

    if (awaitingNextHand && dealerPublicHand) {
      dealerDisplayHand = dealerPublicHand.cards;
      dealerDisplayTotal = dealerPublicHand.total;
      dealerCardsRevealed = true;
    }

    return {
      ...baseGameState,
      players,
      dealer: {
        ...baseGameState.dealer,
        displayHand: dealerDisplayHand,
        displayTotal: dealerCardsRevealed
          ? dealerDisplayTotal ?? calculateHandValue(baseGameState.dealer.hand)
          : null,
        cardsRevealed: dealerCardsRevealed
      }
    } satisfies GameState;
  }, [awaitingNextHand, baseGameState, dealerPublicHand, decryptedHands, showdownPlayerCards, lowerWalletAddress, playerDecryptedHand, playerDecryptState, connectedDecryptedHandState]);

  const gameState = decoratedGameState;

  const connectedPlayer = useMemo(() => {
    if (!gameState || !walletAddress) return undefined;
    return gameState.players.find(
      (player) => toLower(player.address) === toLower(walletAddress)
    );
  }, [gameState, walletAddress]);

  const isSeated = useMemo(() => {
    if (!currentTableId) return false;
    return currentTableId === tableId;
  }, [currentTableId, tableId]);

  const refetchCore = useCallback(async () => {
    console.info('[BlackjackGame] Core refetch triggered');
    await Promise.allSettled([
      refetchTable(),
      refetchTurnStatus()
    ]);
    console.info('[BlackjackGame] Core refetch completed');
  }, [refetchTable, refetchTurnStatus]);

  const refetchAncillary = useCallback(async () => {
    console.info('[BlackjackGame] Ancillary refetch triggered');
    await Promise.allSettled([
      refetchTablesCount(),
      refetchWalletChips(),
      refetchClaimStatus(),
      refetchPlayerTable()
    ]);
    console.info('[BlackjackGame] Ancillary refetch completed');
  }, [
    refetchClaimStatus,
    refetchPlayerTable,
    refetchTablesCount,
    refetchWalletChips
  ]);

  // Batch refetch helper for post-transaction refreshes.
  const refetchAll = useCallback(async () => {
    await Promise.allSettled([refetchCore(), refetchAncillary()]);
  }, [refetchCore, refetchAncillary]);

  const scheduleCoreRefetch = useCallback(() => {
    if (refetchTimerRef.current) return;
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      void refetchCore();
    }, 120);
  }, [refetchCore]);

  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
    };
  }, []);

  // Standardised toast/error logging so all writes behave consistently.
  const handleError = useCallback((error: unknown, fallback: string) => {
    console.error(error);
    const description =
      (error as { shortMessage?: string })?.shortMessage ||
      (error as Error)?.message ||
      'Unknown error';
    toast.error(fallback, { description });
  }, []);

  // Ensure every action has both signer and contract configured.
  const requireWallet = useCallback(() => {
    if (!walletAddress) {
      toast.error('Connect your wallet to interact with the table.');
      return false;
    }
    if (!contractAddress) {
      toast.error('Blackjack contract address is not configured.');
      return false;
    }
    return true;
  }, [walletAddress, contractAddress]);

  const waitForReceipt = useCallback(
    async (hash: `0x${string}`) => {
      if (!publicClient) return null;
      return publicClient.waitForTransactionReceipt({ hash });
    },
    [publicClient]
  );

  type WriteContractArgs = Parameters<typeof writeContractAsync>[0];
  type RefreshMode = 'auto' | 'core' | 'all' | 'none';

  const retryPlayerDecrypt = useCallback(() => {
    if (!walletAddress || !contractAddress) {
      toast.error('Connect your wallet to retry decryption.');
      return;
    }
    failedPlayerHandSignatureRef.current = null;
    lastPlayerAttemptedSignatureRef.current = '0';
    playerDecryptInFlightRef.current = null;
    setPlayerDecryptState('pending');
  }, [walletAddress, contractAddress]);

  const refetchAfterWrite = useCallback(
    async (mode: RefreshMode = 'auto') => {
      let target: RefreshMode = mode;
      if (target === 'auto') {
        target = supportsFilters ? 'core' : 'all';
      }

      if (target === 'none') return;
      if (target === 'core') {
        await refetchCore();
        return;
      }

      await refetchAll();
    },
    [refetchAll, refetchCore, supportsFilters]
  );

  // Shared execution helper around wagmi's `writeContractAsync`.
  const execute = useCallback(
    async (
      params: Omit<WriteContractArgs, 'address' | 'abi' | 'account'>,
      successMessage?: string,
      refreshMode: RefreshMode = 'auto'
    ): Promise<boolean> => {
      const { functionName } = params;
      if (!requireWallet()) return false;
      try {
        setPendingAction(String(functionName));
        const request = {
          address: contractAddress!,
          abi: blackjackAbi,
          account: walletAddress!,
          ...params
        } satisfies WriteContractArgs;
        console.info('[BlackjackGame] writeContract start', request);
        const hash = await writeContractAsync(request);
        toast.message('Transaction submitted', {
          description: hash
        });
        console.info('[BlackjackGame] writeContract submitted', { functionName, hash });
        await waitForReceipt(hash);
        console.info('[BlackjackGame] writeContract confirmed', { functionName, hash });
        if (successMessage) {
          toast.success(successMessage);
        }
        await refetchAfterWrite(refreshMode);
        return true;
      } catch (error) {
        console.error('[BlackjackGame] writeContract error', { functionName, error });
        handleError(error, `Failed to execute ${String(functionName)}`);
        return false;
      } finally {
        setPendingAction(null);
      }
    },
    [
      contractAddress,
      handleError,
      refetchAll,
      refetchAfterWrite,
      requireWallet,
      waitForReceipt,
      writeContractAsync,
      walletAddress
    ]
  );

  // Public actions – guard against acting mid-showdown and surface UX feedback.
  const actions = useMemo(
    () => ({
      claimFreeChips: async () => (
        execute({ functionName: 'claimFreeChips', args: [] }, 'Free chips claimed', 'all')
      ),
      buyChips: async (weiAmount: bigint) => {
        if (weiAmount <= 0n) {
          toast.error('Send a positive amount of ETH to buy chips.');
          return false;
        }
        return execute({ functionName: 'buyChips', args: [], value: weiAmount }, 'Chips purchased', 'all');
      },
      withdrawChips: async (chipAmount: bigint) => {
        if (chipAmount <= 0n) {
          toast.error('Enter a chip amount greater than zero.');
          return false;
        }
        return execute(
          { functionName: 'withdrawChips', args: [chipAmount] as const },
          `Withdrew ${chipAmount.toString()} chips`,
          'all'
        );
      },
      createTable: async (minBuyIn: bigint, maxBuyIn: bigint) => (
        execute({ functionName: 'createTable', args: [minBuyIn, maxBuyIn] as const }, 'Table created', 'all')
      ),
      joinTable: async (buyIn: bigint) => {
        if (buyIn <= 0n) {
          toast.error('Buy-in must be positive.');
          return false;
        }
        return execute({ functionName: 'joinTable', args: [tableId, buyIn] as const }, 'Joined table', 'all');
      },
      leaveTable: async () => (
        execute({ functionName: 'leaveTable', args: [tableId] as const }, 'Left the table', 'all')
      ),
      cashOut: async () => (
        execute({ functionName: 'cashOut', args: [tableId] as const }, 'Cashed out', 'all')
      ),
      topUpChips: async (amount: bigint) => {
        if (amount <= 0n) {
          toast.error('Enter an amount greater than zero.');
          return false;
        }
        return execute(
          { functionName: 'topUpTableChips', args: [tableId, amount] as const },
          'Chips moved to table',
          'all'
        );
      },
      placeBet: async (amount: bigint) => {
        if (awaitingNextHand) {
          toast.info('Review the last hand before betting again.');
          return false;
        }
        if (amount <= 0n) {
          toast.error('Bet amount must be positive.');
          return false;
        }
        return execute(
          { functionName: 'placeBet', args: [tableId, amount] as const },
          `Bet ${amount.toString()} chips placed`,
          'core'
        );
      },
      hit: async () => {
        if (awaitingNextHand) {
          toast.info('Review the last hand before acting.');
          return false;
        }
        return execute({ functionName: 'hit', args: [tableId] as const }, 'Card dealt', 'core');
      },
      stand: async () => {
        if (awaitingNextHand) {
          toast.info('Review the last hand before acting.');
          return false;
        }
        return execute({ functionName: 'stand', args: [tableId] as const }, 'Stood', 'core');
      },
      doubleDown: async () => {
        if (awaitingNextHand) {
          toast.info('Review the last hand before acting.');
          return false;
        }
        return execute({ functionName: 'doubleDown', args: [tableId] as const }, 'Double down executed', 'core');
      },
      forceAdvanceOnTimeout: async () => (
        execute({ functionName: 'forceAdvanceOnTimeout', args: [tableId] as const }, 'Turn advanced', 'core')
      ),
      acknowledgeShowdown: async () => {
        if (latestResultTimestamp === 0) return;
        setAcknowledgedResultTimestamp(latestResultTimestamp);
        setWinners(null);
      },
      retryPlayerDecrypt: () => retryPlayerDecrypt()
    }),
    [awaitingNextHand, execute, latestResultTimestamp, retryPlayerDecrypt, tableId]
  );

  useWatchContractEvent({
    address: contractAddress,
    abi: blackjackAbi,
    eventName: 'PhaseChanged',
    args: { tableId },
    enabled: eventsEnabled,
    onLogs: (logs) => {
      console.info('[BlackjackGame] PhaseChanged event', { tableId, logs });
      scheduleCoreRefetch();
    }
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: blackjackAbi,
    eventName: 'HandResultStored',
    args: { tableId },
    enabled: eventsEnabled,
    onLogs: (logs) => {
      console.info('[BlackjackGame] HandResultStored event', { tableId, logs });
      scheduleCoreRefetch();
    }
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: blackjackAbi,
    eventName: 'WinnerDetermined',
    args: { tableId },
    enabled: eventsEnabled,
    onLogs: (logs) => {
      console.info('[BlackjackGame] WinnerDetermined event', { tableId, logs });
      const last = logs.pop();
      if (!last?.args) return;
      const payload: WinnerEventPayload = {
        tableId: last.args.tableId as bigint,
        winners: (last.args.winners || []) as `0x${string}`[],
        amounts: (last.args.amounts || []) as bigint[]
      };
      setWinners(payload);
      scheduleCoreRefetch();
    }
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: blackjackAbi,
    eventName: 'PlayerAction',
    args: { tableId },
    enabled: eventsEnabled,
    onLogs: (logs) => {
      console.info('[BlackjackGame] PlayerAction event', { tableId, logs });
      scheduleCoreRefetch();
    }
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: blackjackAbi,
    eventName: 'BetPlaced',
    args: { tableId },
    enabled: eventsEnabled,
    onLogs: (logs) => {
      console.info('[BlackjackGame] BetPlaced event', { tableId, logs });
      scheduleCoreRefetch();
    }
  });

  return {
    contractAddress,
    tableId,
    hasTable,
    table,
    gameState,
    connectedPlayer,
    walletChips: walletChips as bigint | undefined,
    hasClaimedFreeChips: typeof hasClaimed === 'boolean' ? hasClaimed : undefined,
    playerTableId: currentTableId as bigint | undefined,
    isSeated,
    isPlayerTurn: Boolean(playerTurn),
    winners,
    isLoading: isFetchingTable || isPending,
    showdownResult,
    lastHandSummary,
    awaitingNextHand,
    playerDecryptState,
    dealerDecryptState,
    refetchAll,
    actions,
    pendingAction,
    connectedDecryptedHand: connectedDecryptedHandState
  };
};
