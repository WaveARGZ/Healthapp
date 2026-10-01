"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

const navItems: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/dashboard", label: "ホーム", icon: "home" },
  { href: "/workouts", label: "筋トレ", icon: "dumbbell" },
  { href: "/meals", label: "食事", icon: "leaf" },
  { href: "/progress", label: "進捗", icon: "progress" },
  { href: "/settings", label: "設定", icon: "settings" },
];

export function BottomNav() {
  const pathname = usePathname().replace(/\/$/, "");
  return (
    <nav aria-label="メインナビゲーション" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white pb-[env(safe-area-inset-bottom)] lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:mt-10 lg:self-start lg:border-0 lg:p-0">
      <p className="mb-4 hidden px-3 text-[11px] font-semibold text-[var(--muted)] lg:block">記録ノート</p>
      <div className="mx-auto flex h-[68px] max-w-xl items-stretch justify-around px-2 lg:h-auto lg:flex-col lg:gap-1 lg:p-0">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href === "/progress" && ["/weight", "/photos"].includes(pathname));
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-w-12 flex-1 flex-col items-center justify-center gap-1 border-t-2 px-2 text-[11px] font-semibold transition-colors lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-r-md lg:border-l-2 lg:border-t-0 lg:px-3 lg:text-sm ${active ? "border-[var(--sage-deep)] text-[var(--sage-deep)] lg:bg-[var(--sage-soft)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)] lg:hover:bg-[var(--sand)]"}`}>
              <Icon name={item.icon} className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <p className="mt-14 hidden border-t border-[var(--line)] px-3 pt-4 text-[11px] leading-6 text-[var(--muted)] lg:block">記録はこのブラウザに保存されます。</p>
    </nav>
  );
}
