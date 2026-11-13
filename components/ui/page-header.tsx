import { Logo } from "@/components/ui/logo";
import { isTestEnvironment } from "@/lib/cloud/config";

interface PageHeaderProps {
  title: string;
  description?: string;
  compact?: boolean;
}

export function PageHeader({ title, description, compact = false }: PageHeaderProps) {
  return (
    <header className={`rounded-[24px] bg-[var(--navy)] px-5 text-white shadow-[0_18px_40px_rgba(25,24,47,.12)] sm:px-7 ${compact ? "mb-5 py-5" : "mb-6 py-6 sm:mb-8 sm:py-7"}`}>
      <p className="text-[11px] font-semibold tracking-[.18em] text-[#b8b4db]">BODYMAKE</p>
      <h1 className="mt-2 text-[26px] font-bold leading-snug tracking-[-0.025em] text-balance sm:text-[30px]">{title}</h1>
      {description ? <p className="mt-2 text-sm leading-6 text-[#d5d2e9]">{description}</p> : null}
    </header>
  );
}

export function AppTopBar() {
  return <header className="safe-top border-b border-[var(--line)] bg-white"><div className="safe-gutters mx-auto flex min-h-[68px] max-w-6xl items-center justify-between gap-3 sm:min-h-[76px]"><Logo href="/dashboard" /><span className={`shrink-0 rounded-full px-3 py-1 text-xs ${isTestEnvironment ? "bg-[var(--coral-soft)] font-bold text-[var(--coral)]" : "bg-[var(--sand)] text-[var(--muted)]"}`}>{isTestEnvironment ? "テスト環境" : "身体の記録帳"}</span></div></header>;
}
