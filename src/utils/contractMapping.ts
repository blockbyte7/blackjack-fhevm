import {
  GamePhase,
  TableStatus,
  ContractTable,
  ContractPlayer,
  ContractCard,
  ContractHandResult,
  ContractPlayerResult,
  ContractOutcome
} from '@/types/blackjackContract';
import { Card, Dealer, GameState, Player, PlayerOutcome } from '@/types/blackjack';

// Static helpers for mapping raw contract card data into UI friendly representations.
const suitMap = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
const rankMap = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export const toRankSymbol = (rank: number) => {
  if (rank < 2 || rank > 14) return '??';
  return rankMap[rank - 2];
};

export const toSuitSymbol = (suit: number) => suitMap[suit] ?? 'hearts';

const shorten = (address: string): string => {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

const toSafeLower = (value?: string | null) => (typeof value === 'string' ? value.toLowerCase() : undefined);

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
type UnknownRecord = Record<string, unknown> | undefined;

// Light value guards that keep the normalisers resilient to chain/toolbox shape changes.
const getNumber = (value: unknown): number => Number(value ?? 0);
const getBigInt = (value: unknown): bigint => (typeof value === 'bigint' ? value : BigInt(value ?? 0));
const getBoolean = (value: unknown): boolean => Boolean(value);
const getArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const getAddress = (value: unknown): `0x${string}` =>
  typeof value === 'string' ? (value as `0x${string}`) : ZERO_ADDRESS;
const getStringArray = (value: unknown): string[] =>
  getArray<unknown>(value).map((entry) => String(entry));

export const normalizeCard = (card: UnknownRecord): ContractCard => ({
  rank: getNumber(card?.['rank']),
  suit: getNumber(card?.['suit'])
});

export const normalizePlayer = (player: UnknownRecord): ContractPlayer => ({
  addr: getAddress(player?.['addr']),
  chips: getBigInt(player?.['chips']),
  bet: getBigInt(player?.['bet']),
  cards: getArray<UnknownRecord>(player?.['cards']).map(normalizeCard),
  encRanks: getStringArray(player?.['encRanks']),
  encSuits: getStringArray(player?.['encSuits']),
  isActive: getBoolean(player?.['isActive']),
  hasActed: getBoolean(player?.['hasActed'])
});

const normalizePlayerResult = (result: UnknownRecord): ContractPlayerResult => ({
  addr: getAddress(result?.['addr']),
  bet: getBigInt(result?.['bet']),
  total: getBigInt(result?.['total']),
  outcome: getNumber(result?.['outcome']),
  payout: getBigInt(result?.['payout']),
  cards: getArray<UnknownRecord>(result?.['cards']).map(normalizeCard)
});

const normalizeHandResult = (hand: UnknownRecord): ContractHandResult => ({
  dealerCards: getArray<UnknownRecord>(hand?.['dealerCards']).map(normalizeCard),
  dealerTotal: getBigInt(hand?.['dealerTotal']),
  dealerBusted: getBoolean(hand?.['dealerBusted']),
  results: getArray<UnknownRecord>(hand?.['results']).map(normalizePlayerResult),
  dealerEncRanks: getStringArray(hand?.['dealerEncRanks']),
  dealerEncSuits: getStringArray(hand?.['dealerEncSuits']),
  pot: getBigInt(hand?.['pot']),
  timestamp: getBigInt(hand?.['timestamp'])
});

export const normalizeTable = (table: UnknownRecord): ContractTable => ({
  id: getBigInt(table?.['id']),
  status: getNumber(table?.['status']) as TableStatus,
  minBuyIn: getBigInt(table?.['minBuyIn']),
  maxBuyIn: getBigInt(table?.['maxBuyIn']),
  deck: getArray<number>(table?.['deck']).map((entry) => Number(entry)),
  deckIndex: getNumber(table?.['deckIndex']),
  phase: getNumber(table?.['phase']) as GamePhase,
  players: getArray<UnknownRecord>(table?.['players']).map(normalizePlayer),
  dealer: {
    cards: getArray<UnknownRecord>((table?.['dealer'] as UnknownRecord)?.['cards']).map(normalizeCard),
    encRanks: getStringArray((table?.['dealer'] as UnknownRecord)?.['encRanks']),
    encSuits: getStringArray((table?.['dealer'] as UnknownRecord)?.['encSuits']),
    hasFinished: getBoolean((table?.['dealer'] as UnknownRecord)?.['hasFinished'])
  },
  lastActivityTimestamp: getBigInt(table?.['lastActivityTimestamp']),
  lastHandResult: normalizeHandResult(table?.['lastHandResult'] as UnknownRecord),
  hasPendingResult: getBoolean(table?.['hasPendingResult']),
  nextHandUnlockTime: getBigInt(table?.['nextHandUnlockTime'])
});

export const toUiCard = (card: ContractCard, index: number): Card => ({
  suit: toSuitSymbol(card.suit),
  rank: toRankSymbol(card.rank),
  id: `${card.rank}-${card.suit}-${index}`
});

export const toHiddenCard = (index: number, prefix: string): Card => ({
  suit: '??',
  rank: '??',
  id: `${prefix}-hidden-${index}`
});

export const calculateHandValue = (cards: Card[]) => {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === '??') {
      continue;
    }
    if (card.rank === 'A') {
      total += 11;
      aces++;
    } else if (['K', 'Q', 'J', '10'].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
};

const toUiPlayer = (player: ContractPlayer, index: number): Player => {
  const hand = player.cards.map((card, cardIndex) => toUiCard(card, cardIndex));
  const hiddenHand = hand.map((_, cardIndex) => toHiddenCard(cardIndex, `${player.addr}-${index}`));
  const value = calculateHandValue(hand);
  const blackjack = hand.length === 2 && value === 21;
  const bust = value > 21;
  const stand = !player.isActive && player.hasActed && !bust && hand.length > 0;

  return {
    id: `${player.addr}-${index}`,
    address: player.addr,
    name: shorten(player.addr),
    hand,
    displayHand: hiddenHand,
    displayTotal: null,
    cardsRevealed: false,
    bet: Number(player.bet),
    chips: Number(player.chips),
    bust,
    stand,
    blackjack,
    position: index,
    isActive: player.isActive,
    hasActed: player.hasActed,
    result: null
  };
};

const toUiDealer = (dealer: ContractTable['dealer']): Dealer => {
  const hand = dealer.cards.map((card, cardIndex) => toUiCard(card, cardIndex));
  const hidden = hand.map((card, index) => (index === 0 ? card : toHiddenCard(index, 'dealer')));
  const value = calculateHandValue(hand);
  const blackjack = hand.length === 2 && value === 21;
  const bust = value > 21;

  return {
    hand,
    displayHand: hidden,
    displayTotal: null,
    cardsRevealed: false,
    blackjack,
    bust
  };
};

const phaseMap: Record<GamePhase, GameState['phase']> = {
  [GamePhase.WaitingForPlayers]: 'betting',
  [GamePhase.Dealing]: 'dealing',
  [GamePhase.PlayerTurns]: 'player-turn',
  [GamePhase.DealerTurn]: 'dealer-turn',
  [GamePhase.Showdown]: 'showdown',
  [GamePhase.Completed]: 'waiting'
};

const statusMap: Record<TableStatus, GameState['status']> = {
  [TableStatus.Waiting]: 'waiting',
  [TableStatus.Active]: 'active',
  [TableStatus.Closed]: 'closed'
};

// Convert the raw contract table into a richer UI state for the live hand view.
export const toUiGameState = (table: ContractTable): GameState => {
  const players = table.players.map(toUiPlayer);
  const dealer = toUiDealer(table.dealer);
  const phase = phaseMap[table.phase] ?? 'waiting';
  const status = statusMap[table.status] ?? 'waiting';

  const activePlayerIndex = players.findIndex((player) => player.isActive);
  const roundActive = ['dealing', 'player-turn', 'dealer-turn', 'showdown'].includes(phase);
  const pot = players.reduce((total, player) => total + player.bet, 0);

  return {
    tableId: Number(table.id),
    status,
    minBuyIn: Number(table.minBuyIn),
    maxBuyIn: Number(table.maxBuyIn),
    phase,
    players,
    dealer,
    deck: [],
    activePlayerIndex: activePlayerIndex === -1 ? 0 : activePlayerIndex,
    roundActive,
    winners: [],
    pot,
    lastActivityTimestamp: Number(table.lastActivityTimestamp),
    contractPhase: table.phase
  };
};

const outcomeMap: Record<number, PlayerOutcome> = {
  [ContractOutcome.Lose]: 'lose',
  [ContractOutcome.Win]: 'win',
  [ContractOutcome.Push]: 'push',
  [ContractOutcome.Blackjack]: 'blackjack'
};

const mapOutcome = (value: number, bust: boolean): PlayerOutcome => {
  if (bust) return 'bust';
  return outcomeMap[value] ?? 'lose';
};

// Convert the persisted showdown snapshot into the same summarised format used elsewhere.
export const toShowdownSummaryFromHand = (
  tableId: number,
  hand: ContractHandResult,
  playersLookup: Map<string, Player>
): ShowdownSummary | null => {
  if (!hand || hand.dealerCards.length === 0) return null;

  const dealerHand = hand.dealerCards.map((card, index) => toUiCard(card, index));
  const dealerValue = Number(hand.dealerTotal ?? 0n);
  const dealerBust = Boolean(hand.dealerBusted);

  const dealer: Dealer & { handValue: number; bust: boolean } = {
    hand: dealerHand,
    displayHand: dealerHand,
    displayTotal: dealerValue,
    cardsRevealed: true,
    blackjack: dealerHand.length === 2 && dealerValue === 21,
    bust: dealerBust,
    handValue: dealerValue
  };

  const summaries: ShowdownPlayerSummary[] = hand.results.map((result) => {
    const handCards = result.cards.map((card, index) => toUiCard(card, index));
    const value = Number(result.total ?? 0n);
    const bust = value > 21;
    const blackjack = handCards.length === 2 && value === 21;
    const lookupKey = toSafeLower(result.addr);
    const basePlayer = (lookupKey && playersLookup.get(lookupKey)) ?? {
      id: `${result.addr}-result`,
      address: result.addr,
      name: shorten(result.addr),
      hand: handCards,
      displayHand: handCards,
      displayTotal: value,
      cardsRevealed: true,
      bet: Number(result.bet),
      chips: 0,
      bust,
      stand: !bust,
      blackjack,
      position: 0,
      isActive: false,
      hasActed: true,
      result: null as PlayerOutcome
    } satisfies Player;

    const player: Player = {
      ...basePlayer,
      hand: handCards,
      displayHand: handCards,
      displayTotal: value,
      cardsRevealed: true,
      bet: Number(result.bet),
      bust,
      blackjack,
      result: mapOutcome(Number(result.outcome), bust)
    };

    const outcome = mapOutcome(Number(result.outcome), bust);

    return {
      player,
      outcome,
      handValue: value,
      blackjack,
      bust
    } satisfies ShowdownPlayerSummary;
  });

  const winners = summaries.filter((summary) =>
    summary.outcome === 'blackjack' || summary.outcome === 'win'
  );
  const dealerWins = winners.length === 0;

  return {
    tableId,
    handTimestamp: Number(hand.timestamp ?? 0n),
    dealer,
    pot: Number(hand.pot ?? 0n),
    players: summaries,
    winners,
    dealerWins
  } satisfies ShowdownSummary;
};

export const formatChips = (value: bigint | number | undefined) => {
  if (value === undefined) return '—';
  const num = typeof value === 'bigint' ? Number(value) : value;
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString();
};

export const formatWeiToEth = (wei: bigint | undefined) => {
  if (wei === undefined) return '0';
  return (Number(wei) / 1e18).toFixed(4);
};

export interface ShowdownPlayerSummary {
  player: Player;
  outcome: PlayerOutcome;
  handValue: number;
  blackjack: boolean;
  bust: boolean;
}

export interface ShowdownSummary {
  tableId: number;
  handTimestamp: number;
  dealer: Dealer & { handValue: number; bust: boolean };
  pot: number;
  players: ShowdownPlayerSummary[];
  winners: ShowdownPlayerSummary[];
  dealerWins: boolean;
}

export const summarizeShowdown = (state: GameState): ShowdownSummary => {
  const dealerValue = calculateHandValue(state.dealer.hand);
  const dealerBust = dealerValue > 21;
  const dealerBlackjack = state.dealer.blackjack || (state.dealer.hand.length === 2 && dealerValue === 21);

  const activePlayers = state.players.filter((player) => player.hand.length > 0 || player.bet > 0);

  const playerSummaries = activePlayers.map((player) => {
    const value = calculateHandValue(player.hand);
    const blackjack = player.blackjack || (player.hand.length === 2 && value === 21);
    const bust = player.bust || value > 21;

    let outcome: PlayerOutcome;

    if (bust) outcome = 'bust';
    else if (blackjack && !dealerBlackjack) outcome = 'blackjack';
    else if (dealerBlackjack && blackjack) outcome = 'push';
    else if (dealerBlackjack) outcome = 'lose';
    else if (dealerBust || value > dealerValue) outcome = 'win';
    else if (value === dealerValue) outcome = 'push';
    else outcome = 'lose';

    const summaryPlayer: Player = {
      ...player,
      hand: player.hand,
      displayHand: player.hand,
      displayTotal: value,
      cardsRevealed: true,
      bust,
      blackjack,
      result: outcome
    };

    return {
      player: summaryPlayer,
      outcome,
      handValue: value,
      blackjack,
      bust
    } satisfies ShowdownPlayerSummary;
  });

  const winners = playerSummaries.filter((summary) => summary.outcome === 'blackjack' || summary.outcome === 'win');
  const dealerWins = winners.length === 0;

  return {
    tableId: state.tableId,
    handTimestamp: state.lastActivityTimestamp,
    dealer: {
      ...state.dealer,
      hand: state.dealer.hand,
      displayHand: state.dealer.hand,
      displayTotal: dealerValue,
      cardsRevealed: true,
      blackjack: dealerBlackjack,
      bust: dealerBust,
      handValue: dealerValue
    },
    pot: state.pot,
    players: playerSummaries,
    winners,
    dealerWins
  } satisfies ShowdownSummary;
};
