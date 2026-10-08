import { Logo } from "@/components/ui/logo";

interface PageHeaderProps {
  title: string;
  description?: string;
  compact?: boolean;
}

export function PageHeader({ title, description, compact = false }: PageHeaderProps) {
  return (
    <header className={compact ? "mb-5" : "mb-6 sm:mb-8"}>
      <h1 className="text-[26px] font-bold leading-snug tracking-[-0.025em] text-balance text-[var(--ink)] sm:text-[30px]">{title}</h1>
      {description ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
    </header>
  );
}

export function AppTopBar() {
  return <header className="safe-top border-b border-[var(--line)] bg-white"><div className="safe-gutters mx-auto flex min-h-[68px] max-w-6xl items-center justify-between gap-3 sm:min-h-[76px]"><Logo href="/dashboard" /><span className="shrink-0 text-xs text-[var(--muted)]">身体の記録帳</span></div></header>;
}
