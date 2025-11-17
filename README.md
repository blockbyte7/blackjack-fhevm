# ♠️ CipherJack – Encrypted Blackjack DApp Suite

CipherJack blends a cinematic blackjack experience with Zama's FHEVM so that every card stays private until it is safe to reveal. This repo tracks the two halves of the product: a polished React frontend for players and a Hardhat-backed smart-contract workspace for builders.

## 📚 Contents
1. [Highlights](#-highlights)
2. [Repository Layout](#%EF%B8%8F-repository-layout)
3. [Gameplay & Flow](#-gameplay--system-flow)
4. [Frontend Setup](#%EF%B8%8F-frontend-ui)
5. [Backend Setup & Tests](#%EF%B8%8F-backend-contracts--tests)
6. [Zama FHE Flow (Code Highlights)](#-zama-fhe-flow-code-highlights)
7. [Quality & Testing Checklist](#-quality--testing-checklist)
8. [Deployment Tips](#-deployment-tips)
9. [Security Notes](#-security--operational-notes)
10. [Contributing](#-contributing)

## ✨ Highlights
- **Wallet-first UX** with multi-player lobbies, rich chip interactions, and responsive layouts.
- **FHE-powered privacy** – encrypted cards are stored on-chain with access controls enforced by Zama coprocessors.
- **Deterministic payouts** handled entirely in Solidity with configurable table stakes and dealer-bank management.
- **Full-stack developer ergonomics** thanks to isolated `frontend/` and `backend/` workspaces, shared documentation, and ready-made scripts.
- **Battle-tested documentation & tests** that clearly outline how the encryption workflow operates from Solidity to the UI.

## 🗂️ Repository Layout
```
blackjack-fhevm/
├── backend/                    # Hardhat project for the Blackjack contract
│   ├── contracts/
│   │   ├── Blackjack.sol       # Core game logic + chip economy
│   │   └── (inherits ZamaEthereumConfig)   # On-chain wiring to FHEVM hosts
│   ├── test/
│   │   └── Blackjack.test.js   # Unit tests for chips, banking, and tables
│   ├── hardhat.config.js       # Multi-compiler setup with viaIR enabled
│   └── package.json            # Hardhat + @fhevm/solidity dependencies
├── frontend/                   # Vite + React + Tailwind application
│   ├── src/                    # Pages, hooks, components, and blackjack logic
│   ├── public/                 # Static assets
│   ├── package.json            # Frontend dependencies and scripts
│   └── README.md               # UI-specific instructions (legacy doc)
└── README.md                   # You are here – high level overview
```

## 🔄 Gameplay & System Flow
```mermaid
graph LR
    A[Connect Wallet] --> B[Seat at Table]
    B --> C[Betting Phase]
    C --> D[Encrypted Dealing]
    D --> E[Player Turns]
    E --> F[Dealer Turn]
    F --> G[Showdown & Payouts]
    G --> H[Next Hand / Cash Out]
```
- **Encrypted state:** every `Card` dealt to a player or dealer is mirrored as `euint8` rank/suit with ACLs that only permit the owner (and relayer) to decrypt.
- **Chip custody:** ETH ↔ chip conversions happen through the contract, enabling free faucets, direct purchases, withdrawals, and a dealer-bank float.
- **Table orchestration:** tables automatically advance from waiting → betting → turns → settlement, emitting events for the frontend lobby to mirror.

## 🧰 Prerequisites
- Node.js 18+
- npm 9+
- Git + a Sepolia wallet for on-chain testing
- (Optional) Bun if you prefer the existing `bun.lockb` inside `frontend/`

## ⚛️ Frontend (UI)
```bash
cd frontend
npm install
npm run dev        # start Vite on http://localhost:5173
npm run build      # production bundle
npm run preview    # preview prod build
npm run lint       # ESLint health check
```
The UI expects the following environment variables (create `frontend/.env`):

| Variable | Description |
| --- | --- |
| `VITE_BLACKJACK_CONTRACT` | Deployed Blackjack contract address |
| `VITE_FHE_TARGET_CHAIN_ID` / `VITE_FHE_GATEWAY_CHAIN_ID` | FHEVM target & gateway chain IDs |
| `VITE_FHE_RELAYER_URL` / `VITE_FHE_RPC_URL` | Relayer + RPC endpoints for encrypted ops |
| `VITE_FHE_ACL_ADDRESS`, `VITE_FHE_KMS_ADDRESS`, `VITE_FHE_INPUT_VERIFIER_ADDRESS`, `VITE_FHE_INPUT_VERIFICATION_ADDRESS`, `VITE_FHE_DECRYPTION_ORACLE_ADDRESS` | Addresses supplied by the Zama coprocessor deployment |

> Sepolia + FHEVM v0.9 currently use `RELAYER_URL=https://relayer.testnet.zama.org`, `GATEWAY_CHAIN_ID=10901`, `ACL=0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D`, `KMS=0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A`, `INPUT_VERIFIER=0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0`, `DECRYPTION_ORACLE=0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478`, and `INPUT_VERIFICATION=0x483b9dE06E4E4C7D35CCf5837A1668487406D955`.
| `VITE_APP_PUBLIC_URL` / `VITE_APP_ICON_URL` | Metadata used by Wagmi connectors |
| `VITE_SEPOLIA_RPC_URL` | Public RPC for wagmi’s chain config |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project identifier |

Refer to `frontend/README.md` for UI-specific copy, gameplay tips, and troubleshooting.

## ⚙️ Backend (Contracts & Tests)
```bash
cd backend
npm install
npm run compile    # hardhat compile
npm run test       # mocha/chai suite via hardhat
```
Key notes:
- `Hardhat` leverages dual compilers (0.8.24 + 0.8.20) plus `viaIR` to keep the Blackjack bytecode buildable despite its large private-state structs.
- Contracts now import `ZamaEthereumConfig` directly, mirroring the official migration guide for FHEVM v0.9.
- Tests (`test/Blackjack.test.js`) cover the chip economy, table lifecycle, owner-only banking, chip top-ups/cash-outs, seated-player restrictions, pause/unpause, ownership transfer, and the `MAX_TABLES` cap. Extend the suite as you expand gameplay logic (betting flows, timeout enforcement, or encrypted reveals).

## 🔐 Zama FHE Flow (Code Highlights)
**On-chain encrypted dealing** – every card is mirrored into `euint8` slots and permissioned so only the receiving wallet (plus the contract/relayer) can decrypt.

```solidity
// backend/contracts/Blackjack.sol
function _dealCardToPlayer(uint tableId, address playerAddr) private {
    Table storage t = _getTable(tableId);
    _ensureCardsAvailable(t, 1, tableId);
    Card memory c = _cardFromIndex(t.deck[t.deckIndex]); t.deckIndex++;
    for (uint i=0; i<t.players.length; i++) if (t.players[i].addr == playerAddr) {
        t.players[i].cards.push(c);
        euint8 encRank = FHE.asEuint8(c.rank);
        euint8 encSuit = FHE.asEuint8(c.suit);
        t.players[i].encRanks.push(encRank);
        t.players[i].encSuits.push(encSuit);
        FHE.allow(encRank, playerAddr);
        FHE.allow(encSuit, playerAddr);
        FHE.allow(encRank, address(this));
        FHE.allow(encSuit, address(this));
        break;
    }
    emit CardDealt(tableId, playerAddr, c);
}
```

**Off-chain handle decryption** – the React hook requests user approval, pulls encrypted handles, and feeds them through Zama's relayer SDK before updating the UI.

```ts
// frontend/src/hooks/useBlackjackGame.ts
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
```

These snippets show how the project wires encrypted storage on-chain to decrypted UI output via Zama's SDK (`FHE.asEuint8` with explicit ACLs on-chain and `fhe.userDecrypt` off-chain).

## 🧪 Quality & Testing Checklist
- `backend`: `npm run test` – deploys to Hardhat Network and executes unit tests.
- `frontend`: `npm run lint` and `npm run build` – ensure TypeScript + Vite output is healthy before deploying.
- Coverage summary (see `backend/test/Blackjack.test.js`):
  - Chip minting, claiming, and withdrawal math.
  - Table creation/join/leave flows and auto game start triggers.
  - Owner-only bank funding/defunding safeguards.
  - Seated-player chip top-ups, cash-outs, and wallet restrictions.
  - Admin controls: pause/unpause, owner transfer, MAX_TABLES caps.
- Optional: wire anvil or Sepolia endpoints plus the relayer to run full integration sessions with the UI.

## 🚀 Deployment Tips
1. **Contracts:** deploy `backend/contracts/Blackjack.sol` to Sepolia (or your FHE-enabled network) using Hardhat scripts or your preferred tool, then fund the dealer bank via `fundBank`.
2. **Relayer:** update the relayer + ACL/KMS addresses in `.env` so the frontend can request encrypted inputs/decryptions.
3. **Frontend:** run `npm run build` inside `frontend/` and publish the `dist/` folder to Vercel, Cloudflare Pages, Netlify, or a static bucket.

## 🔐 Security & Operational Notes
- Always guard the relayer credentials and only expose read-only RPC keys in `.env` files that ship to clients.
- Bank funds are held in-contract; keep `owner` on a hardware wallet and regularly monitor `bankChips` vs. outstanding wagers.
- Consider adding more Hardhat tests for reentrancy guards, timeout forcing, and bet settlement edge cases as you iterate.

## 🤝 Contributing
1. Fork & clone the repo.
2. Decide whether the change touches `frontend/`, `backend/`, or both.
3. Run the relevant test suites (`npm run lint`, `npm run test`).
4. Open a PR summarizing user-facing impacts and any new env/config requirements.

Have questions? Feel free to open an issue describing the table flow, contract upgrade, or relayer challenge you are investigating.
