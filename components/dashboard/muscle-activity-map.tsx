import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { muscleGroups, summarizeMuscleActivity, type MuscleActivity, type MuscleGroup } from "@/lib/workouts/muscle-activity";
import type { WorkoutEntry } from "@/types/workout";

const activityColors = ["#c4d5c8", "#a3d6aa", "#58a96e", "#246b43"];
const activityShades = [
  { light: "#e7efe8", dark: "#8da992" },
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
  const bodyScaleX = 0.88;
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
      <g fill={`url(#${view}-body-volume)`} stroke="#31553b" strokeLinejoin="round" strokeWidth="2.5" filter={`url(#${view}-figure-shadow)`}>
        <circle cx="80" cy="25" r="17" />
        <path d="M73 40h14l2 15H71z" />
      </g>
      <g transform={`translate(${80 * (1 - bodyScaleX)} 0) scale(${bodyScaleX} 1)`}>
      <g fill={`url(#${view}-body-volume)`} stroke="#31553b" strokeLinejoin="round" strokeWidth="2.5" filter={`url(#${view}-figure-shadow)`}>
        <path fill={fill(view === "front" ? "腹筋・体幹" : "背中")} d="M59 53Q69 49 80 53q11-4 21 0 15 1 19 23l-6 38q-5 13-10 20l-1 29 8 15q-32 8-64 0l8-15-1-29q-5-7-10-20l-6-38q4-22 21-23Z" />
        <path fill={fill("腕")} d="M53 55Q39 56 33 69L24 102Q22 111 24 122L13 161Q10 175 16 183Q23 187 29 174L43 132Q48 125 48 114L61 82Z" />
        <path fill={fill("腕")} d="M53 55Q39 56 33 69L24 102Q22 111 24 122L13 161Q10 175 16 183Q23 187 29 174L43 132Q48 125 48 114L61 82Z" transform="translate(160 0) scale(-1 1)" />
        <path fill={fill("脚")} d="M49 174Q63 172 80 174L79 232Q77 246 70 260L68 291L65 327Q63 337 55 335Q48 334 47 323L45 291Q40 277 45 260L42 225Q39 197 49 174Z" />
        <path fill={fill("脚")} d="M49 174Q63 172 80 174L79 232Q77 246 70 260L68 291L65 327Q63 337 55 335Q48 334 47 323L45 291Q40 277 45 260L42 225Q39 197 49 174Z" transform="translate(160 0) scale(-1 1)" />
      </g>
      {view === "front" && <path fill={fill("胸")} d="M59 53Q69 49 80 53q11-4 21 0 15 1 19 23l-5 32q-35-7-70 0l-5-32q4-22 19-23Z" />}
      <g stroke="#31583e" strokeOpacity="0.8" strokeLinejoin="round" strokeWidth="1.3">
        <g fill={fill("肩")}>
          <path d="M58 56Q42 53 35 69L31 88Q37 94 49 95L64 71Z" />
          <path d="M58 56Q42 53 35 69L31 88Q37 94 49 95L64 71Z" transform="translate(160 0) scale(-1 1)" />
        </g>
      </g>
      <g fill="none" stroke="#28543a" strokeLinecap="round" strokeOpacity="0.8" strokeWidth="1.7">
        {view === "front" ? <>
          <path d="M48 83Q59 75 77 80Q79 91 73 101Q58 103 46 94M112 83Q101 75 83 80Q81 91 87 101Q102 103 114 94M45 108Q80 101 115 108" />
          <path d="M62 112Q59 133 62 153M98 112Q101 133 98 153M65 120Q80 125 95 120M67 137Q80 142 93 137M70 153Q80 157 90 153M80 109V159" />
        </> : <>
          <path d="M56 64Q67 78 80 81Q93 78 104 64M48 91Q54 116 68 134L80 151M112 91Q106 116 92 134L80 151M80 82V158" />
        </>}
        <path d="M31 91Q28 104 31 116M31 134Q26 149 23 163M51 189Q55 215 56 239M51 268Q48 284 51 301M55 163Q80 169 105 163" />
        <path d="M31 91Q28 104 31 116M31 134Q26 149 23 163M51 189Q55 215 56 239M51 268Q48 284 51 301" transform="translate(160 0) scale(-1 1)" />
      </g>
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="1.6" opacity="0.35">
        <path d="M39 75q4-10 13-12M28 99q-3 16-1 29M50 187q-4 25-1 49M49 270q-3 18 1 40" />
        <path d="M39 75q4-10 13-12M28 99q-3 16-1 29M50 187q-4 25-1 49M49 270q-3 18 1 40" transform="translate(160 0) scale(-1 1)" />
        {view === "front" ? <>
          <path d="M53 82q9-8 22-5M63 116q5-4 12-3M65 134q5-3 10-2" />
          <path d="M53 82q9-8 22-5M63 116q5-4 12-3M65 134q5-3 10-2" transform="translate(160 0) scale(-1 1)" />
        </> : <>
          <path d="M54 83q7-9 22-8M56 104q7-5 19-4M61 126q7-5 14-5" />
          <path d="M54 83q7-9 22-8M56 104q7-5 19-4M61 126q7-5 14-5" transform="translate(160 0) scale(-1 1)" />
        </>}
      </g>
      </g>
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
