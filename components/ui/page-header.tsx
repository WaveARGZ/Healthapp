import { Logo } from "@/components/ui/logo";
import { isTestEnvironment } from "@/lib/cloud/config";

interface PageHeaderProps {
  title: string;
  description?: string;
  compact?: boolean;
}

export function PageHeader({ title, description, compact = false }: PageHeaderProps) {
  return (
    <header className={`rounded-[22px] border border-[var(--line)] bg-[var(--sage-soft)] px-5 text-[var(--ink)] sm:px-7 ${compact ? "mb-5 py-5" : "mb-6 py-6 sm:mb-8 sm:py-7"}`}>
      <span aria-hidden="true" className="mb-3 block h-1 w-8 rounded-full bg-[var(--sage-deep)]" />
      <h1 className="text-[26px] font-bold leading-snug tracking-[-0.035em] text-balance sm:text-[30px]">{title}</h1>
      {description ? <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{description}</p> : null}
    </header>
  );
}

export function AppTopBar() {
  return <header className="safe-top border-b border-[var(--line)] bg-white"><div className="safe-gutters mx-auto flex min-h-[68px] max-w-6xl items-center justify-between gap-3 sm:min-h-[76px]"><Logo href="/dashboard" /><span className={`shrink-0 rounded-full border px-3 py-1 text-xs ${isTestEnvironment ? "border-[var(--coral-soft)] bg-[var(--coral-soft)] font-bold text-[var(--coral)]" : "border-[var(--line)] bg-[var(--sage-soft)] text-[var(--sage-deep)]"}`}>{isTestEnvironment ? "テスト環境" : "身体の記録帳"}</span></div></header>;
}
