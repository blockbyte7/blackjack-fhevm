import { blackjackAbi } from './blackjackAbi';

const blackjackAddress = import.meta.env.VITE_BLACKJACK_CONTRACT as `0x${string}` | undefined;

if (!blackjackAddress) {
  console.warn('VITE_BLACKJACK_CONTRACT is not set. Blackjack interactions will be disabled.');
}

export const blackjackContract = {
  address: blackjackAddress,
  abi: blackjackAbi
} as const;

export type BlackjackContractConfig = typeof blackjackContract;
