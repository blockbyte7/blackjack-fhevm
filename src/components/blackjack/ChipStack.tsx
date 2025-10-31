import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import chip10 from '@/assets/chip-10.svg';
import chip20 from '@/assets/chip-20.svg';
import chip50 from '@/assets/chip-50.svg';
import chip100 from '@/assets/chip-100.svg';
import { breakdownChips, ChipBreakdownEntry, ChipValue } from '@/utils/chips';

const CHIP_ASSETS: Record<ChipValue, { src: string; alt: string }> = {
  10: { src: chip10, alt: 'Red 10 chip' },
  20: { src: chip20, alt: 'Green 20 chip' },
  50: { src: chip50, alt: 'Blue 50 chip' },
  100: { src: chip100, alt: 'Black 100 chip' }
};

const chipSizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12'
} as const;

const rowGapClasses = {
  sm: 'gap-1',
  md: 'gap-1.5',
  lg: 'gap-2'
} as const;

const columnGapClasses = {
  sm: 'gap-1',
  md: 'gap-1.5',
  lg: 'gap-2'
} as const;

export type ChipMotion = 'idle' | 'toPot' | 'return' | 'burst';

interface ChipStackProps {
  amount: number;
  size?: keyof typeof chipSizeClasses;
  className?: string;
  motion?: ChipMotion;
  label?: string;
  delayIndex?: number;
}

export const ChipStack = memo(({ amount, size = 'md', className, motion = 'idle', label, delayIndex = 0 }: ChipStackProps) => {
  const breakdown = useMemo(() => breakdownChips(amount), [amount]);

  const chips = useMemo(() => {
    const items: Array<{ key: string; asset: { src: string; alt: string } }> = [];
    breakdown.forEach(entry => {
      const asset = CHIP_ASSETS[entry.value];
      for (let i = 0; i < entry.count; i++) {
        items.push({ key: `${entry.value}-${i}-${items.length}`, asset });
      }
    });
    return items;
  }, [breakdown]);

  if (amount <= 0 || chips.length === 0) {
    return null;
  }

  const rows: typeof chips[] = [];
  for (let i = 0; i < chips.length; i += 5) {
    rows.push(chips.slice(i, i + 5));
  }

  const chipClass = chipSizeClasses[size];
  const rowGap = rowGapClasses[size];
  const colGap = columnGapClasses[size];

  return (
    <div
      className={cn(
        'pointer-events-none relative flex flex-col items-center',
        motion === 'toPot' && 'chip-flight',
        motion === 'return' && 'chip-return',
        motion === 'burst' && 'chip-burst',
        className
      )}
      style={{ animationDelay: motion !== 'idle' ? `${delayIndex * 120}ms` : undefined }}
    >
      <div className={cn('relative flex flex-col items-center', rowGap)}>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className={cn('flex justify-center', colGap)}>
            {row.map(chipItem => (
              <img
                key={chipItem.key}
                src={chipItem.asset.src}
                alt={chipItem.asset.alt}
                className={cn('rounded-full border border-white/20 shadow-lg', chipClass)}
              />
            ))}
          </div>
        ))}
      </div>
      {label && (
        <span className="mt-2 text-xs font-semibold uppercase tracking-[0.32em] text-primary-foreground/80">
          {label}
        </span>
      )}
    </div>
  );
});

ChipStack.displayName = 'ChipStack';
