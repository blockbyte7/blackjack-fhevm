# CipherJack Blackjack Experience

A cinematic blackjack table built with React, Vite, Tailwind CSS, and shadcn-ui. The project features polished gameplay state management, animated chip flows.

## Getting Started

Install dependencies and launch the development server:

```sh
npm install
npm run dev
```

The app runs on Vite. Visit the output URL (default: `http://localhost:8080`) to explore the table and subscribe page.

## Available Scripts

- `npm run dev` – start the Vite development server.
- `npm run build` – generate an optimized production build in `dist/`.
- `npm run preview` – preview the production build locally.

## Project Structure

- `src/components/blackjack/` – table UI, dealer/player spots, card visuals, chip animations.
- `src/components/subscribe/` – reusable pieces for the subscribe splash (e.g., the encryption orb).
- `src/pages/` – route-level components (`Index` for the game, `Subscribe` for the launch splash).
- `src/hooks/` – blackjack game state logic and helper hooks.
- `src/assets/` – card, chip, and background artwork.

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS & shadcn-ui
- TanStack Query for async state where needed

## Subscribe Route

A `/subscribe` route offers a lightweight "launching soon" page with:

- Fixed marquee banner linking to our X (Twitter) handle.
- Animated encryption orb centerpiece inspired by secure gameplay.
- Responsive layout tuned for mobile and desktop.

## Blackjack Table Highlights

- Animated chip stacks for bets, pot accumulation, and payouts.
- Fireworks and celebration overlay on round win.
- Responsive grid handling up to four players.
- Detailed card rendering with custom back designs.

## Deployment

Use your preferred hosting for Vite/React builds (e.g., Netlify, Vercel, Cloudflare Pages). Build with `npm run build`, then deploy the `dist/` directory.

## Contributing

1. Fork or clone the repository.
2. Create a feature branch.
3. Run `npm run lint` (if configured) and `npm run build` before opening a PR.
4. Submit a pull request describing your changes.

## License

This project is provided as-is for internal blackjack showcase work. Adapt as needed for your own tables and crypto-enabled experiences.
