import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";

const valueProps = [
  { icon: "camera" as const, title: "見える目標", text: "なりたい身体を、毎日の選択につながる目標に。" },
  { icon: "dumbbell" as const, title: "続く記録", text: "筋トレ、食事、体重を、無理なくひとつに。" },
  { icon: "progress" as const, title: "変化を実感", text: "写真とデータで、小さな積み重ねを見える化。" },
];

export function LandingPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[var(--canvas)]">
      <section className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-9 pt-7 sm:px-7">
        <header className="flex items-center justify-between"><Logo /><Link href="/login" className="text-sm font-bold text-[var(--ink)]">ログイン</Link></header>
        <div className="relative mt-14 flex-1">
          <div className="pointer-events-none absolute -right-28 -top-28 size-72 rounded-full bg-[var(--sage-soft)] blur-3xl" />
          <p className="relative text-xs font-bold tracking-[0.16em] text-[var(--sage-deep)]">BODY MAKING, AT YOUR PACE</p>
          <h1 className="relative mt-4 max-w-md font-display text-[2.7rem] font-semibold leading-[1.16] tracking-[-0.065em] text-[var(--ink)] sm:text-5xl">
            理想の身体を、<br />見える目標に。
          </h1>
          <p className="relative mt-5 max-w-sm text-[15px] leading-7 text-[var(--muted)]">
            BodyMakeは、なりたい見た目を起点に、日々の筋トレ・食事・体重・身体の変化をやさしくつなぐ体づくりのパートナーです。
          </p>

          <div className="relative mt-9 rounded-[28px] bg-[var(--ink)] p-5 text-white shadow-[0_24px_60px_rgba(32,42,37,0.18)]">
            <div className="flex items-start justify-between">
              <div><p className="text-xs font-medium text-white/60">your progress</p><p className="mt-1 font-display text-2xl font-semibold">小さな一歩を、確かな変化に。</p></div>
              <span className="grid size-10 place-items-center rounded-2xl bg-white/10"><Icon name="sparkle" className="size-5 text-[var(--peach)]" /></span>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-2">
              {["筋トレ", "食事", "体重"].map((label, index) => <div key={label} className="rounded-xl bg-white/10 p-3"><div className="h-1.5 rounded-full bg-white/15"><div className="h-full rounded-full bg-[var(--peach)]" style={{ width: `${[75, 56, 88][index]}%` }} /></div><p className="mt-2 text-[11px] font-semibold text-white/75">{label}</p></div>)}
            </div>
          </div>
        </div>

        <div className="mt-9 space-y-3">
          <Link href="/signup" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--ink)] px-5 text-sm font-bold text-white shadow-[0_10px_20px_rgba(31,40,45,0.14)] transition hover:bg-[var(--ink-soft)]">はじめる <Icon name="arrow-right" className="size-4" /></Link>
          <p className="text-center text-xs text-[var(--muted)]">自分のペースで、今日から始められます。</p>
        </div>
      </section>
      <section className="bg-white px-5 py-14 sm:px-7">
        <div className="mx-auto max-w-xl"><p className="text-xs font-bold tracking-[0.14em] text-[var(--sage-deep)]">WHAT BODYMAKE DOES</p><h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.05em] text-[var(--ink)]">数字の先にある、<br />あなたらしい変化へ。</h2><div className="mt-8 space-y-5">{valueProps.map((item) => <div key={item.title} className="flex gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--sage-soft)] text-[var(--sage-deep)]"><Icon name={item.icon} className="size-5" /></span><div><h3 className="text-sm font-bold text-[var(--ink)]">{item.title}</h3><p className="mt-1 text-sm leading-6 text-[var(--muted)]">{item.text}</p></div></div>)}</div></div>
      </section>
    </main>
  );
}
