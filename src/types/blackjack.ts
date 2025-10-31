export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '??';

export interface Card {
  suit: Suit | '??';
  rank: Rank;
  id: string;
}

export type PlayerOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | null;

export interface Player {
  id: string;
  address: `0x${string}` | string;
  name: string;
  hand: Card[];
  displayHand: Card[];
  displayTotal: number | null;
  cardsRevealed: boolean;
  bet: number;
  chips: number;
  bust: boolean;
  stand: boolean;
  blackjack: boolean;
  position: number;
  isActive: boolean;
  hasActed: boolean;
  result: PlayerOutcome;
}

export interface Dealer {
  hand: Card[];
  displayHand: Card[];
  displayTotal: number | null;
  cardsRevealed: boolean;
  bust: boolean;
  blackjack: boolean;
}

export interface GameState {
  tableId: number;
  status: 'waiting' | 'active' | 'closed';
  minBuyIn: number;
  maxBuyIn: number;
  players: Player[];
  dealer: Dealer;
  deck: Card[];
  phase: 'betting' | 'dealing' | 'player-turn' | 'dealer-turn' | 'showdown' | 'waiting';
  activePlayerIndex: number;
  roundActive: boolean;
  winners: string[];
  pot: number;
  lastActivityTimestamp: number;
  contractPhase?: number;
}

export type PlayerAction = 'hit' | 'stand' | 'double';
