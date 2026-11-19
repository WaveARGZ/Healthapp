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
    <nav aria-label="メインナビゲーション" className="mobile-nav fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white pb-[env(safe-area-inset-bottom)] lg:sticky lg:inset-auto lg:top-8 lg:z-auto lg:mt-11 lg:self-start lg:border-r lg:bg-transparent lg:py-2 lg:pr-4">
      <div className="mx-auto flex h-[var(--mobile-nav-height)] max-w-xl items-stretch gap-1 px-2 py-1.5 lg:h-auto lg:flex-col lg:gap-1 lg:p-0">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href === "/dashboard" && pathname === "/weekly-review") || (item.href === "/progress" && ["/weight", "/photos"].includes(pathname));
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className="app-nav-item">
              <span className="app-nav-icon"><Icon name={item.icon} className="size-5" /></span>
              {item.label}
            </Link>
          );
        })}
      </div>
      <p className="mt-4 hidden border-t border-[var(--line)] px-2 pb-1 pt-4 text-[13px] leading-6 text-[var(--muted)] lg:block">
        <Icon name="lock" className="mr-1.5 inline size-3.5 align-[-2px]" />
        {isFirebaseSelected ? "記録はクラウドに、身体写真は端末に保存。" : isCloudConfigured ? "記録はアカウントに保存。" : "記録はこのブラウザに保存。"}
      </p>
    </nav>
  );
}
