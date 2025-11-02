# CipherJack Blackjack

CipherJack is an on-chain blackjack table that keeps every card encrypted with fully homomorphic encryption (FHE) until it is safe to reveal. The experience combines a polished UI, responsive chip animations, and wallet-first gameplay for both desktop and mobile (WalletConnect) players.

## Features

- FHE-backed blackjack: cards are dealt and decrypted with user-approved signatures.
- WalletConnect and injected-wallet support, including mobile-friendly flows.
- Responsive table that scales up to four players with celebration overlays and chip animations.
- Built-in safeguards such as the **Force** action for stalled turns and clear status messaging when network services are unavailable.

## Gameplay Overview

1. **Connect & Seat**  
   Connect an EVM wallet, claim/bring chips, and join a table. All chips live on-chain.

2. **Betting Phase**  
   Enter a wager and submit it before the hand begins. The UI displays min bet, stack, and available chips.

3. **Encrypted Turns**  
   Cards are dealt encrypted. Approve the FHE signature request (desktop or WalletConnect) to decrypt your own cards locally.

4. **Actions**  
   - **Hit** – draw another encrypted card.  
   - **Stand** – lock your current hand.  
   - **Double** – double the wager and take exactly one more card (available on the first two cards).  
   - **Force** – once the on-chain turn timer expires for another player, advance the round without waiting.

5. **Showdown**  
   Dealer cards decrypt publicly, payouts are calculated on-chain, and the next betting phase opens.

## Getting Started

Install dependencies and launch the development server:

```sh
npm install
npm run dev
```

The app runs on Vite (`http://localhost:8080` by default). Ensure you have the required environment variables for the blackjack contract and FHE relayer before connecting a wallet.

### Available Scripts

- `npm run dev` – start the Vite development server.
- `npm run build` – generate an optimized production build in `dist/`.
- `npm run preview` – preview the production build locally.
- `npm run lint` – run ESLint to verify code quality.

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS & shadcn-ui
- Wagmi + viem for wallet and contract interactions
- TanStack Query for asynchronous state
- Zama FHE relayer SDK for encrypted card handling

## Deployment

Build the project with `npm run build` and deploy the generated `dist/` directory to your preferred static host (Vercel, Netlify, Cloudflare Pages, etc.).

## Contributing

1. Fork or clone the repository.
2. Create a feature branch.
3. Run `npm run lint` and `npm run build` before opening a PR.
4. Submit a pull request outlining your changes.

## License

This project is provided as-is for internal blackjack showcase work. Adapt it for your own encrypted gaming experiments.
