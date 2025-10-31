export type ChipValue = 10 | 20 | 50 | 100;

export interface ChipBreakdownEntry {
  value: ChipValue;
  count: number;
}

const CHIP_VALUES: ChipValue[] = [100, 50, 20, 10];

export const breakdownChips = (amount: number): ChipBreakdownEntry[] => {
  const entries: ChipBreakdownEntry[] = [];
  let remaining = Math.max(0, Math.floor(amount / 10) * 10);

  for (const value of CHIP_VALUES) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / value);
    if (count > 0) {
      entries.push({ value, count });
      remaining -= count * value;
    }
  }

  return entries;
};

export const sumBreakdown = (breakdown: ChipBreakdownEntry[]): number =>
  breakdown.reduce((total, entry) => total + entry.value * entry.count, 0);

export const CHIP_ORDER = CHIP_VALUES;
