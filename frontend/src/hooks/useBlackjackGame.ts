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
const PLAYER_DECRYPT_RETRY_DELAY_MS = 20_000;
const DEALER_DECRYPT_RETRY_DELAY_MS = 25_000;

const messageFromError = (error: unknown): string => (
  (error as { shortMessage?: string })?.shortMessage ??
  (error as Error)?.message ??
  (typeof error === 'string' ? error : '')
);

const isRateLimitError = (error: unknown): boolean => {
  const message = messageFromError(error);
  return typeof message === 'string' && /rate[\s-]?limit|too many requests|429/i.test(message);
};

const isAuthError = (error: unknown): boolean => {
  const message = messageFromError(error);
  return typeof message === 'string' && /unauthorized|authenticat|api key|forbidden|401/i.test(message);
};

const isNetworkLikeError = (error: unknown): boolean => {
  const message = messageFromError(error).toLowerCase();
  if (!message) return false;
  return /fetch|network|timeout|offline|relayer|gateway|disconnect/i.test(message);
};

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
  type CachedDecryptedHand = { cards: Card[]; total: number; signature: string };

  const [decryptedHands, setDecryptedHands] = useState<Record<string, CachedDecryptedHand>>({});
  const [dealerPublicHand, setDealerPublicHand] = useState<{ cards: Card[]; total: number } | null>(null);
  const [playerDecryptState, setPlayerDecryptState] = useState<DecryptState>('idle');
  const [dealerDecryptState, setDealerDecryptState] = useState<DecryptState>('idle');
  const playerDecryptErrorRef = useRef<string | null>(null);
  const dealerDecryptErrorRef = useRef<number | null>(null);
  const lastPlayerHandleSignatureRef = useRef<string | null>(null);
  const lastDealerHandleSignatureRef = useRef<string | null>(null);
  const lastPlayerDecryptErrorAtRef = useRef<number>(0);
  const lastDealerDecryptErrorAtRef = useRef<number>(0);
  const lastPlayerHandSignatureRef = useRef<string>('0');
  const lastPlayerAttemptedSignatureRef = useRef<string>('0');
  const failedPlayerHandSignatureRef = useRef<string | null>(null);
  const playerDecryptInFlightRef = useRef<string | null>(null);
  const dealerDecryptInFlightRef = useRef<number | null>(null);
  const lastDealerResultTimestampRef = useRef<number>(0);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerDecryptCacheRef = useRef(new Map<string, { cards: Card[]; total: number }>());
  const dealerDecryptCacheRef = useRef(new Map<string, { cards: Card[]; total: number }>());
  const playerDecryptRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dealerDecryptRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerHandleCacheRef = useRef(new Map<string, { rank: `0x${string}`[]; suit: `0x${string}`[]; signature: string }>());
  const dealerHandleCacheRef = useRef(new Map<number, { rank: `0x${string}`[]; suit: `0x${string}`[]; signature: string }>());
  const playerDecryptBlockedRef = useRef(false);
  const dealerDecryptBlockedRef = useRef(false);
  const [connectedDecryptedHandState, setConnectedDecryptedHandState] = useState<CachedDecryptedHand | undefined>(undefined);

  const lowerWalletAddress = useMemo(() => toLower(walletAddress), [walletAddress]);

  useEffect(() => {
    playerDecryptBlockedRef.current = false;
    dealerDecryptBlockedRef.current = false;
  }, [walletAddress]);

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

  const playerDecryptedHand = useMemo(() => {
    if (!walletAddress) return undefined;
    const key = lowerWalletAddress;
    if (!key) return undefined;
    const entry = decryptedHands[key];
    if (!entry) return undefined;
    return entry.signature === playerHandSignature ? entry : undefined;
  }, [walletAddress, decryptedHands, lowerWalletAddress, playerHandSignature]);

  useEffect(() => {
  if (playerHandSignature === '0') {
    playerHandleCacheRef.current.clear();
    playerDecryptBlockedRef.current = false;
  }
}, [playerHandSignature]);

  useEffect(() => {
    if (!lowerWalletAddress || playerHandSignature === '0') return;

    const player = baseGameState?.players.find(
      (entry) => toLower(entry.address) === lowerWalletAddress
    );
    const canonicalHand = player?.hand ?? [];

    setDecryptedHands((prev) => {
      const existing = prev[lowerWalletAddress];
      if (!existing) return prev;

      const sharesPrefix = canonicalHand.length > 0
        ? existing.cards.every((card, index) => canonicalHand[index]?.id === card.id)
        : false;

      if (!sharesPrefix) {
        const next = { ...prev };
        delete next[lowerWalletAddress];
        return next;
      }

      if (existing.signature === playerHandSignature) {
        return prev;
      }

      const nextCards = existing.cards.map((card) => ({ ...card }));
      return {
        ...prev,
        [lowerWalletAddress]: {
          cards: nextCards,
          total: calculateHandValue(nextCards),
          signature: playerHandSignature
        }
      };
    });

    if (connectedDecryptedHandState) {
      const sharesPrefix = canonicalHand.length > 0
        ? connectedDecryptedHandState.cards.every((card, index) => canonicalHand[index]?.id === card.id)
        : false;

      if (!sharesPrefix) {
        setConnectedDecryptedHandState(undefined);
      } else if (connectedDecryptedHandState.signature !== playerHandSignature) {
        const nextCards = connectedDecryptedHandState.cards.map((card) => ({ ...card }));
        setConnectedDecryptedHandState({
          cards: nextCards,
          total: calculateHandValue(nextCards),
          signature: playerHandSignature
        });
      }
    }
  }, [baseGameState, connectedDecryptedHandState, lowerWalletAddress, playerHandSignature]);

  const latestResultTimestamp = useMemo(() => {
    if (!table) return 0;
    const timestamp = Number(table.lastHandResult.timestamp ?? 0n);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }, [table]);

  useEffect(() => {
    if (latestResultTimestamp === 0) {
      dealerHandleCacheRef.current.clear();
      dealerDecryptBlockedRef.current = false;
    }
  }, [latestResultTimestamp]);

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

      if (playerDecryptState !== 'pending') {
        resetPending();
        clearRetryTimer();
        return;
      }

      if (playerDecryptBlockedRef.current) {
        resetPending();
        clearRetryTimer();
        return;
      }

      if (playerDecryptState === 'error') {
        resetPending();
        clearRetryTimer();
        return;
      }

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
          playerDecryptBlockedRef.current = false;
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

      const cachedHandles = playerHandleCacheRef.current.get(currentHandSignature);
      if (cachedHandles) {
        rankHandles = [...cachedHandles.rank];
        suitHandles = [...cachedHandles.suit];
        handleSignature = cachedHandles.signature;
      } else {
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
                playerHandleCacheRef.current.set(currentHandSignature, {
                  rank: [...rankHandles],
                  suit: [...suitHandles],
                  signature: handleSignature
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
              const rateLimited = isRateLimitError(fetchError);
              const authIssue = isAuthError(fetchError);
              const description = authIssue
                ? 'Your RPC endpoint rejected the request. Add an authenticated URL (API key) to VITE_SEPOLIA_RPC_URL and reconnect.'
                : rateLimited
                  ? 'RPC provider rate-limited handle fetches. Waiting before retrying automatically.'
                  : 'Could not fetch your encrypted card handles from the contract. Check your RPC connection and try again.';
              toast.error('Encrypted cards unavailable', { description });
            }
            failedPlayerHandSignatureRef.current = currentHandSignature;
            setPlayerDecryptState('error');
            lastPlayerDecryptErrorAtRef.current = Date.now();
            if (isAuthError(fetchError)) {
              playerDecryptBlockedRef.current = true;
            }
          }
          resetPending();
          clearRetryTimer();
          return;
        }
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
              [lower]: { cards: cachedCards, total: cached.total, signature: currentHandSignature }
            }));
            if (lower === lowerWalletAddress) {
              setConnectedDecryptedHandState({
                cards: cachedCards.map((card) => ({ ...card })),
                total: cached.total,
                signature: currentHandSignature
              });
            }
            playerDecryptErrorRef.current = null;
            setPlayerDecryptState('success');
            lastPlayerHandleSignatureRef.current = handleSignature;
            lastPlayerHandSignatureRef.current = currentHandSignature;
            playerDecryptBlockedRef.current = false;
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
          console.warn('[BlackjackGame] No signing provider available for decryption');
          playerDecryptErrorRef.current = currentHandSignature;
          toast.error('Wallet approval required', {
            description: 'Reconnect your wallet to approve the encryption key before cards can be revealed.'
          });
          setPlayerDecryptState('error');
          lastPlayerDecryptErrorAtRef.current = Date.now();
          playerDecryptBlockedRef.current = true;
          playerDecryptInFlightRef.current = null;
          clearRetryTimer();
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
              [lower]: { cards: nextCards, total, signature: currentHandSignature }
            };
          });
          if (lower === lowerWalletAddress) {
            const stateCards = cards.map((card) => ({ ...card }));
            setConnectedDecryptedHandState({ cards: stateCards, total, signature: currentHandSignature });
          }
          playerDecryptErrorRef.current = null;
          failedPlayerHandSignatureRef.current = null;
          setPlayerDecryptState('success');
          lastPlayerHandleSignatureRef.current = handleSignature;
          lastPlayerHandSignatureRef.current = currentHandSignature;
          playerDecryptBlockedRef.current = false;
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
            const rateLimited = isRateLimitError(error);
            const authIssue = isAuthError(error);
            const networkIssue = isNetworkLikeError(error);
            const description = authIssue
              ? 'The relayer call was rejected. Update your RPC credentials or pick a provider that allows eth_call.'
              : rateLimited
                ? 'RPC provider rate-limited the decryption request. Waiting before retrying automatically.'
                : networkIssue
                  ? 'Unable to reach the decryption relayer. Please ensure your network connection is stable and try again.'
                  : 'Use the retry control once you have approved the signature request.';
            toast.error('Card decryption failed', { description });
          }
          console.warn('[BlackjackGame] Player decrypt failed', {
            tableId: tableId.toString(),
            player: lower,
            handSignature: currentHandSignature,
            expectedCardCount,
            error: (error as Error)?.message ?? error
          });
          setPlayerDecryptState('error');
          lastPlayerDecryptErrorAtRef.current = Date.now();
          if (isAuthError(error)) {
            playerDecryptBlockedRef.current = true;
          }
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

      if (dealerDecryptState !== 'pending') {
        resetPending();
        clearRetryTimer();
        return;
      }

      if (dealerDecryptBlockedRef.current) {
        resetPending();
        clearRetryTimer();
        return;
      }

      if (dealerDecryptState === 'error') {
        resetPending();
        clearRetryTimer();
        return;
      }

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
      const cachedDealerHandles = dealerHandleCacheRef.current.get(latestResultTimestamp);
      if (cachedDealerHandles) {
        rankHandles = [...cachedDealerHandles.rank];
        suitHandles = [...cachedDealerHandles.suit];
        handleSignature = cachedDealerHandles.signature;
      } else {
        let fetchError: unknown = null;

        for (let attempt = 0; attempt < HANDLE_RETRY_LIMIT; attempt++) {
          if (cancelled) return;

          try {
            const response = await publicClient.readContract({
              ...blackjackContract,
              functionName: 'getLastDealerEncryptedHandles',
              args: [tableId] as const
            });

            [rankHandles, suitHandles] = response as readonly [`0x${string}`[], `0x${string}`[]];
            if (Array.isArray(rankHandles) && rankHandles.length > 0) {
              handleSignature = `${tableId.toString()}::${latestResultTimestamp.toString()}::${rankHandles.join('|')}::${suitHandles.join('|')}`;
              dealerHandleCacheRef.current.set(latestResultTimestamp, {
                rank: [...rankHandles],
                suit: [...suitHandles],
                signature: handleSignature
              });
              break;
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
          console.error('[BlackjackGame] Failed to load dealer encrypted handles', fetchError);
          if (!cancelled) {
            if (dealerDecryptErrorRef.current !== latestResultTimestamp) {
              dealerDecryptErrorRef.current = latestResultTimestamp;
              const rateLimited = isRateLimitError(fetchError);
              const authIssue = isAuthError(fetchError);
              const description = authIssue
                ? 'Dealer handle fetch was rejected. Provide an authenticated RPC URL and refresh the table.'
                : rateLimited
                  ? 'RPC provider rate-limited dealer handle reads. Waiting before retrying.'
                  : 'Could not load dealer encrypted cards from the contract. Check the RPC connection and try again.';
              toast.error('Dealer reveal unavailable', { description });
            }
            setDealerDecryptState('error');
            lastDealerDecryptErrorAtRef.current = Date.now();
            if (isAuthError(fetchError)) {
              dealerDecryptBlockedRef.current = true;
            }
          }
          resetPending();
          clearRetryTimer();
          return;
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
          dealerDecryptBlockedRef.current = false;
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
            dealerDecryptBlockedRef.current = false;
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
          dealerDecryptBlockedRef.current = false;
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
            const errorMessage = (error as Error)?.message ?? 'Unknown error';
            const rateLimited = isRateLimitError(error);
            const authIssue = isAuthError(error);
            const isNetworkIssue =
              rateLimited || isNetworkLikeError(error) || /relayer|gateway/i.test(errorMessage.toLowerCase());
            const description = authIssue
              ? 'Dealer reveal was rejected by the RPC endpoint. Configure an authenticated provider to continue.'
              : rateLimited
                ? 'Dealer reveal was rate-limited by your RPC provider. Pausing before the next attempt.'
                : isNetworkIssue
                  ? 'Unable to reach the dealer decryption service. Please try again once the relayer is reachable.'
                  : 'Use the force control if the table is stuck, or retry shortly.';
            toast.error('Dealer reveal failed', { description });
          }
          setDealerDecryptState('error');
          lastDealerDecryptErrorAtRef.current = Date.now();
          if (isAuthError(error)) {
            dealerDecryptBlockedRef.current = true;
          }
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
    if (playerDecryptState === 'error' && !playerDecryptBlockedRef.current) {
      if (!playerDecryptRetryTimeoutRef.current) {
        const elapsed = Date.now() - lastPlayerDecryptErrorAtRef.current;
        const delayMs = Math.max(PLAYER_DECRYPT_RETRY_DELAY_MS - Math.max(elapsed, 0), 0);
        playerDecryptRetryTimeoutRef.current = setTimeout(() => {
          playerDecryptRetryTimeoutRef.current = null;
          setPlayerDecryptState((prev) => (prev === 'error' ? 'pending' : prev));
        }, delayMs > 0 ? delayMs : 1);
      }
    } else if (playerDecryptRetryTimeoutRef.current) {
      clearTimeout(playerDecryptRetryTimeoutRef.current);
      playerDecryptRetryTimeoutRef.current = null;
    }
  }, [playerDecryptState]);

  useEffect(() => {
    if (dealerDecryptState === 'error' && !dealerDecryptBlockedRef.current) {
      if (!dealerDecryptRetryTimeoutRef.current) {
        const elapsed = Date.now() - lastDealerDecryptErrorAtRef.current;
        const delayMs = Math.max(DEALER_DECRYPT_RETRY_DELAY_MS - Math.max(elapsed, 0), 0);
        dealerDecryptRetryTimeoutRef.current = setTimeout(() => {
          dealerDecryptRetryTimeoutRef.current = null;
          setDealerDecryptState((prev) => (prev === 'error' ? 'pending' : prev));
        }, delayMs > 0 ? delayMs : 1);
      }
    } else if (dealerDecryptRetryTimeoutRef.current) {
      clearTimeout(dealerDecryptRetryTimeoutRef.current);
      dealerDecryptRetryTimeoutRef.current = null;
    }
  }, [dealerDecryptState]);

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
    const currentHandSignature = playerHandSignature;
    const resolvedCount = (() => {
      if (connectedDecryptedHandState && connectedDecryptedHandState.signature === currentHandSignature) {
        return connectedDecryptedHandState.cards.length;
      }
      if (playerDecryptedHand) {
        return playerDecryptedHand.cards.length;
      }
      if (storedRecord && storedRecord.signature === currentHandSignature) {
        return storedRecord.cards.length;
      }
      return 0;
    })();

    if (resolvedCount < expectedCardCount) {
      if (connectedDecryptedHandState) {
        setConnectedDecryptedHandState(undefined);
      }
      playerDecryptInFlightRef.current = null;
      failedPlayerHandSignatureRef.current = null;
      lastPlayerHandSignatureRef.current = '0';
      lastPlayerAttemptedSignatureRef.current = '0';
      if (!playerDecryptBlockedRef.current && playerDecryptState !== 'pending') {
        setPlayerDecryptState('pending');
      }
    }
  }, [
    baseGameState,
    connectedDecryptedHandState,
    decryptedHands,
    lowerWalletAddress,
    playerDecryptedHand,
    playerDecryptState,
    playerHandSignature
  ]);

  useEffect(() => {
    return () => {
      if (playerDecryptRetryTimeoutRef.current) {
        clearTimeout(playerDecryptRetryTimeoutRef.current);
        playerDecryptRetryTimeoutRef.current = null;
      }
      if (dealerDecryptRetryTimeoutRef.current) {
        clearTimeout(dealerDecryptRetryTimeoutRef.current);
        dealerDecryptRetryTimeoutRef.current = null;
      }
    };
  }, []);

  const decoratedGameState = useMemo(() => {
    if (!baseGameState) return undefined;

    const players = baseGameState.players.map((player) => {
      const lower = toLower(player.address);
      const isConnectedPlayer = lowerWalletAddress && lower === lowerWalletAddress;
      const showdown = awaitingNextHand ? showdownPlayerCards.get(lower) : undefined;
      let decryptedSource: CachedDecryptedHand | undefined;
      if (isConnectedPlayer) {
        if (connectedDecryptedHandState && connectedDecryptedHandState.signature === playerHandSignature) {
          decryptedSource = connectedDecryptedHandState;
        } else if (playerDecryptedHand) {
          decryptedSource = playerDecryptedHand;
        } else if (lower) {
          const fallback = decryptedHands[lower];
          decryptedSource = fallback && fallback.signature === playerHandSignature ? fallback : undefined;
        }
      } else if (lower) {
        decryptedSource = decryptedHands[lower];
      }

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
  }, [awaitingNextHand, baseGameState, dealerPublicHand, decryptedHands, showdownPlayerCards, lowerWalletAddress, playerDecryptedHand, connectedDecryptedHandState, playerHandSignature]);

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
    playerDecryptBlockedRef.current = false;
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
