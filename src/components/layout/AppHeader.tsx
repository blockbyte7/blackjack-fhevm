import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { WalletControls } from '@/components/wallet/WalletControls';
import logo from '@/assets/cipherjack-logo.jpeg';

interface AppHeaderProps {
  minBet: number;
}

export const AppHeader = ({ minBet }: AppHeaderProps) => {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-primary/35 bg-gradient-to-br from-slate-950/95 via-slate-900/85 to-slate-800/70 shadow-2xl backdrop-blur">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,215,128,0.25),transparent_55%)]" />
      <div className="relative flex flex-col gap-6 p-6 text-primary-foreground lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="hidden h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-primary/40 bg-background/50 shadow-lg md:block">
            <img src={logo} alt="CipherJack" className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.45em] text-primary/80">CipherJack Lounge</p>
            <h1 className="text-4xl font-black tracking-wide text-primary-foreground drop-shadow md:text-5xl">
              Elite Blackjack Table
            </h1>
            <p className="mt-2 max-w-xl text-sm text-primary-foreground/70">
              Seat yourself, steady your wagers, and enjoy a cinematic blackjack flow with polished chip handling and responsive turns.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3 text-right">
          <WalletControls />
          <div className="flex items-center gap-4 rounded-2xl bg-background/60 px-5 py-3 backdrop-blur">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Min Bet</div>
            <div className="text-3xl font-black text-primary">{minBet}</div>
          </div>
          <Link to="/subscribe" className="inline-flex">
            <Button variant="secondary" className="border border-primary/40 bg-primary/20 text-primary-foreground hover:bg-primary/30">
              Subscribe for Updates
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
};
