import { cn } from '@/lib/utils';

interface BentoCardProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  headerContent?: React.ReactNode;
}

export const BentoCard = ({ title, description, children, className, headerContent }: BentoCardProps) => (
  <section className={cn('rounded-3xl border border-white/10 bg-black/30 p-4 shadow-lg backdrop-blur-xl sm:p-5', className)}>
    <div className="flex items-start justify-between">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-white/70">{title}</h3>
        {description && <p className="text-xs text-white/50">{description}</p>}
      </div>
      {headerContent}
    </div>
    {children && <div className="mt-4">{children}</div>}
  </section>
);
