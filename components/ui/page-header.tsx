import { Logo } from "@/components/ui/logo";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  compact?: boolean;
}

export function PageHeader({ eyebrow, title, description, compact = false }: PageHeaderProps) {
  return (
    <header className={compact ? "mb-5 pt-1" : "mb-7 pt-1"}>
      {eyebrow ? <p className="mb-2 text-xs font-bold tracking-[0.14em] text-[var(--sage-deep)]">{eyebrow}</p> : null}
      <h1 className="font-display text-[1.8rem] font-semibold tracking-[-0.045em] text-[var(--ink)]">{title}</h1>
      {description ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
    </header>
  );
}

export function AppTopBar() {
  return <header className="mb-7 flex items-center justify-between pt-1"><Logo href="/dashboard" /><span className="text-xs font-medium text-[var(--muted)]">your body, your pace</span></header>;
}
