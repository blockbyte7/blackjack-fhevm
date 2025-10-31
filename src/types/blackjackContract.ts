export enum TableStatus {
  Waiting,
  Active,
  Closed
}

export enum GamePhase {
  WaitingForPlayers,
  Dealing,
  PlayerTurns,
  DealerTurn,
  Showdown,
  Completed
}

export enum ContractOutcome {
  Lose,
  Win,
  Push,
  Blackjack
}

export interface ContractCard {
  rank: number;
  suit: number;
}

export interface ContractPlayer {
  addr: `0x${string}`;
  chips: bigint;
  bet: bigint;
  cards: ContractCard[];
  encRanks: string[];
  encSuits: string[];
  isActive: boolean;
  hasActed: boolean;
}

export interface ContractDealer {
  cards: ContractCard[];
  encRanks: string[];
  encSuits: string[];
  hasFinished: boolean;
}

export interface ContractPlayerResult {
  addr: `0x${string}`;
  bet: bigint;
  total: bigint;
  outcome: ContractOutcome | number;
  payout: bigint;
  cards: ContractCard[];
}

export interface ContractHandResult {
  dealerCards: ContractCard[];
  dealerTotal: bigint;
  dealerBusted: boolean;
  results: ContractPlayerResult[];
  dealerEncRanks: string[];
  dealerEncSuits: string[];
  pot: bigint;
  timestamp: bigint;
}

export interface ContractTable {
  id: bigint;
  status: TableStatus;
  minBuyIn: bigint;
  maxBuyIn: bigint;
  deck: number[];
  deckIndex: number;
  phase: GamePhase;
  players: ContractPlayer[];
  dealer: ContractDealer;
  lastActivityTimestamp: bigint;
  lastHandResult: ContractHandResult;
  hasPendingResult: boolean;
  nextHandUnlockTime: bigint;
}

export interface WinnerEventPayload {
  tableId: bigint;
  winners: `0x${string}`[];
  amounts: bigint[];
}
