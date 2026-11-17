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
    <nav aria-label="メインナビゲーション" className="mobile-nav fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:sticky lg:inset-auto lg:top-14 lg:z-auto lg:mt-14 lg:self-start lg:border-0 lg:border-r lg:bg-transparent lg:pr-5">
      <p className="mb-5 hidden px-3 pt-2 text-[11px] font-bold tracking-[.16em] text-[var(--muted)] lg:block">NAVIGATION</p>
      <div className="mx-auto flex h-[var(--mobile-nav-height)] max-w-xl items-stretch justify-around gap-1 px-2 py-1.5 lg:h-auto lg:flex-col lg:gap-1 lg:p-0">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href === "/progress" && ["/weight", "/photos"].includes(pathname));
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-w-12 flex-1 flex-col items-center justify-center gap-1 rounded-md border px-1 text-[11px] font-medium transition-[background-color,border-color,color] duration-200 lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm ${active ? "border-[var(--line)] bg-[var(--sand)] text-[var(--ink)] lg:border-l-[var(--sage-deep)]" : "border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-white hover:text-[var(--ink)]"}`}>
              <Icon name={item.icon} className={`size-5 ${active ? "text-[var(--sage-deep)]" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </div>
      <p className="mt-10 hidden border-t border-[var(--line)] px-3 pt-5 text-xs leading-6 text-[var(--muted)] lg:block">{isFirebaseSelected ? "記録はアカウントごと、身体写真はこの端末に保存されます。" : isCloudConfigured ? "記録はアカウントごとに保存されます。" : "記録はこのブラウザに保存されます。"}</p>
    </nav>
  );
}
