import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LabeledValue } from '@/components/ui/labeled-value';
import { cn } from '@/lib/utils';
import { Coins, Loader2, LogOut, PlusCircle } from 'lucide-react';

interface StatItem {
  label: string;
  value: string;
}

interface SeatControlsConfig {
  isSeated: boolean;
  hasTable: boolean;
  awaitingNextHand: boolean;
  disableAll: boolean;
  canTopUp: boolean;
  minBuyIn?: string;
  maxBuyIn?: string;
  walletChips?: string;
  availableChips?: string;
  onTopUp?: (amount: string) => Promise<boolean>;
  onLeave?: () => void;
  onCashOut?: () => void;
  onJoin?: (amount: string) => Promise<boolean>;
}

interface TableStatsBarProps {
  stats: StatItem[];
  seatControls?: SeatControlsConfig;
  className?: string;
}

export const TableStatsBar = ({ stats, seatControls, className }: TableStatsBarProps) => {
  const hasSeatControls = Boolean(seatControls);

  return (
    <section
      className={cn(
        'rounded-2xl border border-white/10 bg-gradient-to-r from-black/70 via-black/55 to-black/70 px-3 py-3 shadow-[0_18px_36px_-28px_rgba(0,0,0,0.75)] backdrop-blur-md sm:px-5',
        className
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid w-full grid-cols-2 gap-2 text-[0.55rem] uppercase tracking-[0.28em] text-white/55 sm:grid-cols-4 lg:flex lg:flex-wrap lg:gap-x-6">
          {stats.map((stat) => (
            <LabeledValue key={stat.label} label={stat.label} value={stat.value} className="text-white/70" />
          ))}
        </div>

        {hasSeatControls && seatControls && <SeatControls {...seatControls} />}
      </div>
    </section>
  );
};

interface PopoverActionState {
  open: boolean;
  loading: boolean;
}

const SeatControls = ({
  isSeated,
  hasTable,
  awaitingNextHand,
  disableAll,
  canTopUp,
  minBuyIn,
  maxBuyIn,
  walletChips,
  availableChips,
  onTopUp,
  onLeave,
  onCashOut,
  onJoin
}: SeatControlsConfig) => {
  if (!hasTable) {
    return null;
  }

  if (!isSeated && !onJoin) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      {isSeated ? (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {onTopUp && (
            <TopUpPopover
              onTopUp={onTopUp}
              disableAll={disableAll}
              canTopUp={canTopUp && !awaitingNextHand}
              availableChips={availableChips}
            />
          )}
          {/* {onCashOut && (
            <Button
              onClick={onCashOut}
              disabled={disableAll}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[0.58rem] font-semibold uppercase tracking-[0.26em] text-white hover:border-amber-300/60 hover:bg-amber-300/10"
            >
              Cash Out
            </Button>
          )} */}
          {onLeave && (
            <Button
              onClick={onLeave}
              disabled={disableAll}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[0.58rem] font-semibold uppercase tracking-[0.26em] text-white hover:border-rose-400/70 hover:bg-rose-500/10"
            >
              <LogOut className="h-3.5 w-3.5" /> Leave
            </Button>
          )}
        </div>
      ) : (
        onJoin && (
          <JoinPopover
            onJoin={onJoin}
            disableAll={disableAll}
            minBuyIn={minBuyIn}
            maxBuyIn={maxBuyIn}
            walletChips={walletChips}
          />
        )
      )}
    </div>
  );
};

interface TopUpPopoverProps {
  onTopUp: (amount: string) => Promise<boolean>;
  disableAll: boolean;
  canTopUp: boolean;
  availableChips?: string;
}

const TopUpPopover = ({ onTopUp, disableAll, canTopUp, availableChips }: TopUpPopoverProps) => {
  const [state, setState] = useState<PopoverActionState>({ open: false, loading: false });
  const [amount, setAmount] = useState('');

  const reset = () => setAmount('');

  const handleTopUp = async () => {
    if (!amount.trim()) return;
    setState((prev) => ({ ...prev, loading: true }));
    const success = await onTopUp(amount);
    setState({ open: success ? false : true, loading: false });
    if (success) {
      reset();
    }
  };

  const topUpDisabled = disableAll || state.loading || !canTopUp || !amount.trim();

  return (
    <Popover open={state.open} onOpenChange={(open) => setState((prev) => ({ ...prev, open }))}>
      <PopoverTrigger asChild>
        <Button
          disabled={disableAll}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400 px-4 py-2 text-[0.58rem] font-semibold uppercase tracking-[0.26em] text-slate-950 shadow-[0_18px_36px_-26px_rgba(245,158,11,0.9)] hover:from-amber-300 hover:to-orange-400"
        >
          <Coins className="h-3.5 w-3.5" /> Top Up
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3 rounded-2xl border border-white/15 bg-slate-950/95 p-4 text-white shadow-2xl">
        <div className="space-y-1 text-[0.6rem] uppercase tracking-[0.26em] text-white/60">
          <span>Increase Stack</span>
          {availableChips && <span className="block text-[0.54rem] text-white/40">Stack: {availableChips}</span>}
        </div>
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Chip amount"
          type="number"
          min={0}
          disabled={disableAll || state.loading}
          className="h-10 rounded-xl border-white/15 bg-black/40 text-sm text-white placeholder:text-white/40 focus-visible:border-amber-400/60 focus-visible:ring-0"
        />
        {!canTopUp && (
          <p className="text-[0.54rem] uppercase tracking-[0.26em] text-amber-200/80">Top ups available between hands.</p>
        )}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleTopUp}
            disabled={topUpDisabled}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 py-2 text-[0.58rem] font-semibold uppercase tracking-[0.26em] text-slate-950 hover:from-emerald-300 hover:to-emerald-500"
          >
            {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
          </Button>
          <Button
            type="button"
            onClick={() => setState({ open: false, loading: false })}
            disabled={state.loading}
            variant="secondary"
            className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-[0.56rem] font-semibold uppercase tracking-[0.26em] text-white hover:bg-white/10"
          >
            Cancel
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface JoinPopoverProps {
  onJoin: (amount: string) => Promise<boolean>;
  disableAll: boolean;
  minBuyIn?: string;
  maxBuyIn?: string;
  walletChips?: string;
}

const JoinPopover = ({ onJoin, disableAll, minBuyIn, maxBuyIn, walletChips }: JoinPopoverProps) => {
  const [state, setState] = useState<PopoverActionState>({ open: false, loading: false });
  const [amount, setAmount] = useState('');

  const requirementText = useMemo(() => {
    if (!minBuyIn && !maxBuyIn) return undefined;
    if (minBuyIn && maxBuyIn) return `Range: ${minBuyIn} – ${maxBuyIn}`;
    if (minBuyIn) return `Minimum: ${minBuyIn}`;
    return undefined;
  }, [minBuyIn, maxBuyIn]);

  const handleJoin = async () => {
    if (!amount.trim()) return;
    setState((prev) => ({ ...prev, loading: true }));
    const success = await onJoin(amount);
    setState({ open: success ? false : true, loading: false });
    if (success) {
      setAmount('');
    }
  };

  return (
    <Popover open={state.open} onOpenChange={(open) => setState((prev) => ({ ...prev, open }))}>
      <PopoverTrigger asChild>
        <Button
          disabled={disableAll}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 px-4 py-2 text-[0.58rem] font-semibold uppercase tracking-[0.26em] text-slate-950 shadow-[0_20px_40px_-28px_rgba(34,197,94,0.85)] hover:from-emerald-300 hover:to-emerald-500"
        >
          <PlusCircle className="h-3.5 w-3.5" /> Join
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3 rounded-2xl border border-white/15 bg-slate-950/95 p-4 text-white shadow-2xl">
        <div className="space-y-1 text-[0.6rem] uppercase tracking-[0.26em] text-white/60">
          <span>Enter Buy-In</span>
          {walletChips && <span className="block text-[0.54rem] text-white/40">Wallet chips: {walletChips}</span>}
          {requirementText && <span className="block text-[0.54rem] text-white/40">{requirementText}</span>}
        </div>
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Chip amount"
          type="number"
          min={0}
          disabled={disableAll || state.loading}
          className="h-10 rounded-xl border-white/15 bg-black/40 text-sm text-white placeholder:text-white/40 focus-visible:border-emerald-400/60 focus-visible:ring-0"
        />
        <Button
          onClick={handleJoin}
          disabled={disableAll || state.loading || !amount.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 py-2 text-[0.58rem] font-semibold uppercase tracking-[0.26em] text-slate-950 hover:from-emerald-300 hover:to-emerald-500"
        >
          {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
        </Button>
      </PopoverContent>
    </Popover>
  );
};
