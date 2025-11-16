import { cn } from '@/lib/utils';

interface LabeledValueProps {
  label: string;
  value: string;
  className?: string;
}

export const LabeledValue = ({ label, value, className }: LabeledValueProps) => (
  <div className={cn('flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-white/60', className)}>
    <span>{label}</span>
    <span className="text-sm font-semibold text-white tracking-normal">{value}</span>
  </div>
);
