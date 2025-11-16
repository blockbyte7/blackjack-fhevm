import { useCallback, useMemo, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { toast } from '@/lib/toast';
import { blackjackContract } from '@/lib/contracts';
import { blackjackAbi } from '@/lib/blackjackAbi';
import { normalizeTable, toUiGameState } from '@/utils/contractMapping';
import { TableStatus } from '@/types/blackjackContract';

export interface LobbyTable {
  id: bigint;
  status: TableStatus;
  minBuyIn: number;
  maxBuyIn: number;
  pot: number;
  phase: string;
  playersSeated: number;
  playerCapacity: number;
}

export interface BlackjackLobbyData {
  tables: LobbyTable[];
  isLoading: boolean;
  pendingAction: string | null;
  refetchTables: () => Promise<void>;
  playerTableId?: bigint;
  walletChips?: bigint;
  hasClaimedFreeChips?: boolean;
  actions: {
    createTable: (minBuyIn: bigint, maxBuyIn: bigint) => Promise<boolean>;
    joinTable: (tableId: bigint, buyIn: bigint) => Promise<boolean>;
    leaveCurrentTable: () => Promise<boolean>;
    claimFreeChips: () => Promise<boolean>;
  };
}

const MAX_PLAYERS = 4;
const LOBBY_POLL_INTERVAL = 45_000;

const logInfo = (...args: unknown[]) => console.info('[BlackjackLobby]', ...args);
const logError = (...args: unknown[]) => console.error('[BlackjackLobby]', ...args);

// Orchestrates lobby reads (table list + player's seat) and exposes lightweight actions.
export const useBlackjackLobby = (): BlackjackLobbyData => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { writeContractAsync, isPending } = useWriteContract();

  const {
    data: rawTables,
    refetch,
    isFetching
  } = useReadContract({
    ...blackjackContract,
    functionName: 'getAllTables',
    query: {
      enabled: Boolean(blackjackContract.address),
      refetchInterval: LOBBY_POLL_INTERVAL,
      onSuccess: (data) => logInfo('getAllTables success', data),
      onError: (err) => logError('getAllTables error', err)
    }
  });

  // Map the raw contract structs to a UI-friendly snapshot that is cheap to render.
  const tables = useMemo(() => {
    if (!rawTables) return [];
    return (rawTables as unknown[]).map((table) => {
      const normalized = normalizeTable(table);
      const ui = toUiGameState(normalized);
      return {
        id: normalized.id,
        status: normalized.status,
        minBuyIn: ui.minBuyIn,
        maxBuyIn: ui.maxBuyIn,
        pot: ui.pot,
        phase: ui.phase,
        playersSeated: ui.players.length,
        playerCapacity: MAX_PLAYERS
      } satisfies LobbyTable;
    });
  }, [rawTables]);

  const { data: playerTableId } = useReadContract({
    ...blackjackContract,
    functionName: 'playerTableId',
    args: address ? [address] as const : undefined,
    query: {
      enabled: Boolean(address && blackjackContract.address),
      refetchInterval: LOBBY_POLL_INTERVAL
    }
  });

  const { data: walletChips } = useReadContract({
    ...blackjackContract,
    functionName: 'playerChips',
    args: address ? [address] as const : undefined,
    query: {
      enabled: Boolean(address && blackjackContract.address),
      refetchInterval: LOBBY_POLL_INTERVAL
    }
  });

  const { data: hasClaimedFreeChips } = useReadContract({
    ...blackjackContract,
    functionName: 'hasClaimedFreeChips',
    args: address ? [address] as const : undefined,
    query: {
      enabled: Boolean(address && blackjackContract.address),
      refetchInterval: LOBBY_POLL_INTERVAL
    }
  });

  // Helper to wait for confirmations from any of the lobby write transactions.
  const waitForReceipt = useCallback(
    async (hash: `0x${string}`) => {
      if (!publicClient) return;
      await publicClient.waitForTransactionReceipt({ hash });
    },
    [publicClient]
  );

  // Early exit helpers so every action surfaces consistent wallet/contract errors.
  const requireWallet = useCallback(() => {
    if (!address) {
      toast.error('Connect your wallet to continue.');
      return false;
    }
    if (!blackjackContract.address) {
      toast.error('Blackjack contract is not configured.');
      return false;
    }
    return true;
  }, [address]);

  type LobbyFunction = 'createTable' | 'joinTable' | 'leaveTable' | 'claimFreeChips';

  // Shared write helper so create/join/leave reuse the same pending + toast flow.
  const execute = useCallback(
    async (
      functionName: LobbyFunction,
      args: readonly unknown[] = [],
      value?: bigint,
      successMessage?: string
    ): Promise<boolean> => {
      if (!requireWallet()) return false;
      try {
        setPendingAction(functionName);
        logInfo('writeContract start', { functionName, args, value });
        const hash = await writeContractAsync({
          address: blackjackContract.address!,
          abi: blackjackAbi,
          functionName,
          args,
          value
        });
        toast.message('Transaction submitted', { description: hash });
        logInfo('writeContract submitted', { functionName, hash });
        await waitForReceipt(hash);
        logInfo('writeContract confirmed', { functionName, hash });
        if (successMessage) {
          toast.success(successMessage);
        }
        await refetch();
        return true;
      } catch (error) {
        logError('writeContract error', { functionName, error });
        const description =
          (error as { shortMessage?: string })?.shortMessage ||
          (error as Error)?.message ||
          'Unknown error';
        toast.error(`Failed to execute ${functionName}`, { description });
        return false;
      } finally {
        setPendingAction(null);
      }
    },
    [refetch, requireWallet, waitForReceipt, writeContractAsync]
  );

  // Public lobby actions – each validates inputs before delegating to the shared executor.
  const actions = useMemo(
    () => ({
      createTable: async (minBuyIn: bigint, maxBuyIn: bigint) => {
        if (minBuyIn <= 0n || maxBuyIn <= 0n) {
          toast.error('Stake values must be positive.');
          return false;
        }
        if (maxBuyIn < minBuyIn) {
          toast.error('Max buy-in must not be lower than min buy-in.');
          return false;
        }
        return execute('createTable', [minBuyIn, maxBuyIn] as const, undefined, 'Table created');
      },
      joinTable: async (tableId: bigint, buyIn: bigint) => {
        if (tableId <= 0n) {
          toast.error('Select a valid table.');
          return false;
        }
        if (buyIn <= 0n) {
          toast.error('Buy-in must be greater than zero.');
          return false;
        }
        return execute('joinTable', [tableId, buyIn] as const, undefined, 'Joined table');
      },
      leaveCurrentTable: async () => {
        if (!playerTableId || playerTableId === 0n) {
          toast.error('You are not seated at any table.');
          return false;
        }
        return execute('leaveTable', [playerTableId] as const, undefined, 'Left current table');
      },
      claimFreeChips: async () => {
        if (hasClaimedFreeChips) {
          toast.info('You have already claimed your free chips.');
          return false;
        }
        return execute('claimFreeChips', [], undefined, 'Free chips claimed');
      }
    }),
    [execute, playerTableId, hasClaimedFreeChips]
  );

  return {
    tables,
    isLoading: isFetching || isPending,
    pendingAction,
    refetchTables: refetch,
    playerTableId: playerTableId as bigint | undefined,
    walletChips: walletChips as bigint | undefined,
    hasClaimedFreeChips: typeof hasClaimedFreeChips === 'boolean' ? hasClaimedFreeChips : undefined,
    actions
  };
};
