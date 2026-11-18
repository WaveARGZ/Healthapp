import { Logo } from "@/components/ui/logo";
import { isTestEnvironment } from "@/lib/cloud/config";

interface PageHeaderProps {
  title: string;
  description?: string;
  compact?: boolean;
}

export function PageHeader({ title, description, compact = false }: PageHeaderProps) {
  return (
    <header className={`border-b border-[var(--line)] text-[var(--ink)] ${compact ? "mb-7 pb-6" : "mb-9 pb-8 sm:mb-12 sm:pb-10"}`}>
      <p className="mb-3 text-[11px] font-bold tracking-[.16em] text-[var(--sage-deep)]">BODYMAKE / JOURNAL</p>
      <h1 className="text-[clamp(2rem,7vw,3rem)] font-bold leading-[1.15] tracking-[-0.045em] text-balance">{title}</h1>
      {description ? <p className="mt-3 max-w-prose text-sm leading-7 text-[var(--muted)]">{description}</p> : null}
    </header>
  );
}

export function AppTopBar() {
  return <header className="safe-top border-b border-[var(--line)] bg-white"><div className="safe-gutters mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-3 sm:min-h-[84px]"><Logo href="/dashboard" /><span className={`shrink-0 border-l border-[var(--line)] pl-3 text-[11px] font-medium tracking-wide ${isTestEnvironment ? "text-[var(--coral)]" : "text-[var(--muted)]"}`}>{isTestEnvironment ? "テスト環境" : "身体の記録帳"}</span></div></header>;
}
