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
  const pathname = usePathname();
  return (
    <nav aria-label="メインナビゲーション" className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-xl items-center justify-around px-2">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href === "/progress" && ["/weight", "/photos"].includes(pathname));
          return (
            <Link key={item.href} href={item.href} className={`flex min-w-12 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold transition ${active ? "text-[var(--sage-deep)]" : "text-[#929995]"}`}>
              <span className={`grid size-7 place-items-center rounded-lg ${active ? "bg-[var(--sage-soft)]" : ""}`}><Icon name={item.icon} className="size-[18px]" /></span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
