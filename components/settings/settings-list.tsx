import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";

const settings: Array<{ label: string; description: string; icon: IconName; href: string; tone: string }> = [
  { label: "プロフィール", description: "名前・目標・身体情報を変更", icon: "user", href: "/onboarding", tone: "bg-[var(--sage-soft)] text-[var(--sage-deep)]" },
  { label: "データ管理", description: "記録データの確認・出力（準備中）", icon: "progress", href: "/settings#data", tone: "bg-[#eeeef9] text-[#6e68a6]" },
  { label: "プライバシー", description: "データの取り扱いについて", icon: "lock", href: "/settings#privacy", tone: "bg-[#fff3e9] text-[#b46f42]" },
  { label: "利用規約", description: "BodyMakeのご利用にあたって", icon: "more", href: "/settings#terms", tone: "bg-[var(--sand)] text-[#797f7a]" },
];

export function SettingsList() {
  return <><PageHeader eyebrow="SETTINGS" title="設定" description="BodyMakeをあなたのペースに合わせましょう。" /><div className="space-y-3">{settings.map((item) => <Link key={item.label} href={item.href}><Card className="flex items-center gap-3 p-4 transition hover:-translate-y-0.5"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.tone}`}><Icon name={item.icon} className="size-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--ink)]">{item.label}</span><span className="mt-1 block truncate text-xs text-[var(--muted)]">{item.description}</span></span><Icon name="chevron-right" className="size-4 text-[#aab0ac]" /></Card></Link>)}</div><Link href="/" className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--coral-soft)] text-sm font-bold text-[var(--coral)] transition hover:bg-[#f8deda]"><Icon name="lock" className="size-4" />ログアウト</Link><p className="mt-5 text-center text-[11px] leading-5 text-[var(--muted)]">BodyMake MVP · 記録は現在この端末に保存されています。</p></>;
}
