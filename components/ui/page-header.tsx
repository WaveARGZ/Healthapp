import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";

interface PageHeaderProps {
  title: string;
  description?: string;
  compact?: boolean;
}

export function PageHeader({ title, description, compact = false }: PageHeaderProps) {
  return (
    <header className={compact ? "mb-6 text-[var(--ink)]" : "mb-7 text-[var(--ink)] sm:mb-9"}>
      <h1 className="text-balance text-[clamp(1.65rem,4vw,2rem)] font-semibold leading-tight tracking-[-.025em]">{title}</h1>
      {description && <p className="mt-2 max-w-prose text-[15px] leading-7 text-[var(--muted)]">{description}</p>}
    </header>
  );
}

export function AppTopBar({ showWeeklyReview }: { showWeeklyReview: boolean }) {
  return (
    <header className="safe-top border-b border-[var(--line)] bg-white">
      <div className="safe-gutters mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 sm:min-h-[76px]">
        <Logo href="/dashboard" />
        {showWeeklyReview && <Link href="/weekly-review" className="inline-flex min-h-11 items-center gap-2 rounded-md px-3.5 text-[13px] font-semibold text-[var(--sage-deep)] transition-colors hover:border-[var(--sage-deep)] hover:bg-[var(--sage-soft)] sm:px-4 sm:text-sm">
          <Icon name="progress" className="size-4 shrink-0" />
          週の記録
        </Link>}
      </div>
    </header>
  );
}
