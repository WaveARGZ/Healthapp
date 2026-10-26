import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { muscleGroups, summarizeMuscleActivity, type MuscleActivity, type MuscleGroup } from "@/lib/workouts/muscle-activity";
import type { WorkoutEntry } from "@/types/workout";

const activityColors = ["#d4e0d6", "#a3d6aa", "#58a96e", "#246b43"];
const activityShades = [
  { light: "#f2f6f0", dark: "#a8bfad" },
  { light: "#e1f2e1", dark: "#6fac7c" },
  { light: "#b9dfba", dark: "#2f8150" },
  { light: "#72ae7f", dark: "#16462e" },
];
const muscleIds: Record<MuscleGroup, string> = {
  "胸": "chest", "背中": "back", "腕": "arms", "肩": "shoulders", "腹筋・体幹": "core", "脚": "legs",
};
const muscleLabels: Record<MuscleGroup, string> = {
  "胸": "胸", "背中": "背中", "腕": "腕", "肩": "肩", "腹筋・体幹": "腹筋", "脚": "脚",
};

function colorFor(days: number): string { return activityColors[Math.min(days, 3)]; }

function BodyFigure({ view, activity }: { view: "front" | "back"; activity: MuscleActivity }) {
  const fill = (group: MuscleGroup) => `url(#${view}-${muscleIds[group]}-volume)`;
  return <div className="rounded-xl border border-[#b7c8bb] bg-[#f9fbf7] px-2 pb-4 pt-4 text-center">
    <p className="text-sm font-bold tracking-[0.18em] text-[var(--ink)]">{view === "front" ? "正面" : "背面"}</p>
    <svg viewBox="0 0 160 345" aria-hidden="true" className="mx-auto mt-2 h-[340px] w-full max-w-[220px] sm:h-[350px]">
      <defs>
        <linearGradient id={`${view}-body-volume`} x1="0%" y1="0%" x2="100%" y2="20%">
          <stop offset="0%" stopColor="#fffdf5" />
          <stop offset="50%" stopColor="#eeeadd" />
          <stop offset="100%" stopColor="#b5c6b6" />
        </linearGradient>
        {muscleGroups.map((group) => {
          const level = Math.min(activity[group], 3);
          return <linearGradient key={group} id={`${view}-${muscleIds[group]}-volume`} x1="0%" y1="0%" x2="100%" y2="25%">
            <stop offset="0%" stopColor={activityShades[level].light} />
            <stop offset="42%" stopColor={activityColors[level]} />
            <stop offset="100%" stopColor={activityShades[level].dark} />
          </linearGradient>;
        })}
        <filter id={`${view}-figure-shadow`} x="-20%" y="-10%" width="140%" height="125%">
          <feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="#304d38" floodOpacity="0.22" />
        </filter>
      </defs>
      <g fill={`url(#${view}-body-volume)`} stroke="#637e6b" strokeLinejoin="round" strokeWidth="2.2" filter={`url(#${view}-figure-shadow)`}>
        <circle cx="80" cy="25" r="17" />
        <path d="M73 40h14l2 15H71z" />
        <path d="M58 53Q69 48 80 53q11-5 22 0 10 9 10 28l-6 46q-4 15-2 28l8 20H48l8-20q2-13-2-28l-6-46q0-19 10-28Z" />
        <path d="M54 57Q43 59 38 72l-9 44-12 46q-4 17 2 22 7 5 11-11l15-44 12-45Z" />
        <path d="M54 57Q43 59 38 72l-9 44-12 46q-4 17 2 22 7 5 11-11l15-44 12-45Z" transform="translate(160 0) scale(-1 1)" />
        <path d="M49 171h30l-1 67-9 48-6 39q-1 10-9 10-7-1-6-11l-3-38-4-51Z" />
        <path d="M49 171h30l-1 67-9 48-6 39q-1 10-9 10-7-1-6-11l-3-38-4-51Z" transform="translate(160 0) scale(-1 1)" />
      </g>
      <g stroke="#f9fbf7" strokeLinejoin="round" strokeWidth="1.7">
        <g fill={fill("肩")}>
          <path d="M57 57q-11 2-16 15l-2 12 12 5 13-19Z" />
          <path d="M57 57q-11 2-16 15l-2 12 12 5 13-19Z" transform="translate(160 0) scale(-1 1)" />
        </g>
        <g fill={fill("腕")}>
          <path d="M40 86l12 5-8 31-11 31-8 23-8-3 5-25 11-36Z" />
          <path d="M40 86l12 5-8 31-11 31-8 23-8-3 5-25 11-36Z" transform="translate(160 0) scale(-1 1)" />
        </g>
        <g fill={fill("脚")}>
          <path d="M49 175h29l-2 61-8 26-16-5-5-31Z" />
          <path d="M49 175h29l-2 61-8 26-16-5-5-31Z" transform="translate(160 0) scale(-1 1)" />
          <path d="M52 262l16 5-6 53-12 1-3-37Z" />
          <path d="M52 262l16 5-6 53-12 1-3-37Z" transform="translate(160 0) scale(-1 1)" />
        </g>
        {view === "front" ? <>
          <g fill={fill("胸")}>
            <path d="M62 71q8-8 17-6v38q-12 4-22-7l-1-17Z" />
            <path d="M62 71q8-8 17-6v38q-12 4-22-7l-1-17Z" transform="translate(160 0) scale(-1 1)" />
          </g>
          <g fill={fill("腹筋・体幹")}>
            <path d="M62 107h17v18H61z" /><path d="M81 107h17l1 18H81z" />
            <path d="M61 127h18v17H59z" /><path d="M81 127h18l2 17H81z" />
            <path d="M59 146h20v21H55z" /><path d="M81 146h20l4 21H81z" />
          </g>
        </> : <g fill={fill("背中")}>
          <path d="M62 69q9-4 17 0v84l-22 12 2-34-5-42Z" />
          <path d="M62 69q9-4 17 0v84l-22 12 2-34-5-42Z" transform="translate(160 0) scale(-1 1)" />
        </g>}
      </g>
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="2" opacity="0.65">
        <path d="M44 76q3-11 12-14M39 96q-7 24-13 47M53 186q-2 27-1 51M53 273l-1 32" />
        <path d="M44 76q3-11 12-14M39 96q-7 24-13 47M53 186q-2 27-1 51M53 273l-1 32" transform="translate(160 0) scale(-1 1)" />
        {view === "front" ? <>
          <path d="M60 80q8-10 17-8M61 111q7-3 15-2M60 131q8-3 16-2" />
          <path d="M60 80q8-10 17-8M61 111q7-3 15-2M60 131q8-3 16-2" transform="translate(160 0) scale(-1 1)" />
        </> : <>
          <path d="M59 83q6-9 18-9M60 101q7-5 17-4M59 128q8-5 18-5" />
          <path d="M59 83q6-9 18-9M60 101q7-5 17-4M59 128q8-5 18-5" transform="translate(160 0) scale(-1 1)" />
        </>}
      </g>
      <path d="M80 54v111" stroke="#708b78" strokeWidth="1.2" strokeDasharray="3 5" />
    </svg>
  </div>;
}

export function MuscleActivityMap({ workouts, today, loading, unavailable }: { workouts: WorkoutEntry[]; today: string; loading: boolean; unavailable: boolean }) {
  const activity = summarizeMuscleActivity(workouts, today);
  return <section aria-labelledby="muscle-activity-title" aria-busy={loading} className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--sand)] p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-widest text-[var(--sage-deep)]">TRAINING MAP</p><h2 id="muscle-activity-title" className="section-title mt-1">筋トレ部位マップ</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">今日を含む直近14日間の記録日数</p></div><Link href="/workouts" className="text-link">筋トレを記録<Icon name="arrow-right" className="size-3.5" /></Link></div>
    {loading || unavailable ? <p className="mt-5 text-sm text-[var(--muted)]">{loading ? "筋トレ記録を読み込み中…" : "筋トレ記録を読み込めませんでした。再読み込みしてお試しください。"}</p> : <>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(230px,0.8fr)] lg:items-start">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><BodyFigure view="front" activity={activity} /><BodyFigure view="back" activity={activity} /></div>
        <div className="rounded-xl border border-[var(--line)] bg-white p-4 sm:p-5">
          <h3 className="text-sm font-bold">部位ごとの記録日数</h3>
          <div className="mt-3 grid grid-cols-2 gap-x-4">{muscleGroups.map((group) => <div key={group} className="flex items-center justify-between gap-2 border-b border-[var(--line)] py-3 text-sm"><span className="flex min-w-0 items-center gap-2"><span className="size-3 shrink-0 rounded-full border border-[#ced9cf]" style={{ backgroundColor: colorFor(activity[group]) }} /><span className="truncate">{muscleLabels[group]}</span></span><strong className="metric shrink-0 text-xs">{activity[group]}日</strong></div>)}</div>
          <div className="mt-5"><p className="text-xs font-semibold text-[var(--ink-soft)]">色の目安</p><div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] text-[var(--muted)]">{["0日", "1日", "2日", "3日以上"].map((label, index) => <div key={label}><span className="mx-auto mb-1 block h-3 w-full max-w-9 rounded-sm border border-[#ced9cf]" style={{ backgroundColor: activityColors[index] }} />{label}</div>)}</div></div>
        </div>
      </div>
      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">同じ日の複数セット・種目は各部位につき1日として数えます。種目名から部位を判定できない記録は色に含みません。14日間に記録がなければ元の色に戻ります。</p>
    </>}
  </section>;
}
