"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { isCloudConfigured } from "@/lib/cloud/config";
import { isFirebaseSelected } from "@/lib/firebase/config";

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
    <nav aria-label="メインナビゲーション" className="mobile-nav fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_rgba(25,24,47,.06)] backdrop-blur lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:mt-10 lg:self-start lg:rounded-2xl lg:border lg:bg-white lg:p-2 lg:shadow-[0_8px_24px_rgba(25,24,47,.04)]">
      <p className="mb-2 hidden px-3 pt-2 text-[11px] font-semibold tracking-[.12em] text-[var(--muted)] lg:block">BODYMAKE MENU</p>
      <div className="mx-auto flex h-[var(--mobile-nav-height)] max-w-xl items-stretch justify-around px-2 lg:h-auto lg:flex-col lg:gap-1 lg:p-0">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href === "/progress" && ["/weight", "/photos"].includes(pathname));
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-w-12 flex-1 flex-col items-center justify-center gap-1 border-t-2 px-2 text-xs font-semibold transition-colors lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:border-l-2 lg:border-t-0 lg:px-3 lg:text-sm ${active ? "border-[var(--sage-deep)] text-[var(--sage-deep)] lg:bg-[var(--sage-soft)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)] lg:hover:bg-[var(--sand)]"}`}>
              <Icon name={item.icon} className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <p className="mt-8 hidden border-t border-[var(--line)] px-3 pt-4 text-xs leading-6 text-[var(--muted)] lg:block">{isFirebaseSelected ? "記録はアカウントごと、身体写真はこの端末に保存されます。" : isCloudConfigured ? "記録はアカウントごとに保存されます。" : "記録はこのブラウザに保存されます。"}</p>
    </nav>
  );
}
