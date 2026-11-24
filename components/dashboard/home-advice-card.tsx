"use client";

import { useEffect, useRef, useState } from "react";
import { isTestEnvironment } from "@/lib/cloud/config";
import { isFirebaseConfigured, isFirebaseSelected, firebaseConfig } from "@/lib/firebase/config";
import { openRecommendationIdentity, type RecommendationIdentity } from "@/lib/advice/identity";
import { budgetFromError, errorText, generateAdvice, readAdviceBudget, readAdviceInput } from "@/lib/advice/client";
import type { Advice, AdviceBudget, AdviceInput } from "@/lib/advice/contracts";

const usd = (micros: number) => `$${(micros / 1000000).toFixed(4)}`;
const valueWithUnit = (value: number | null, unit: string) => value === null ? "未入力" : `${Number(value.toFixed(1))}${unit}`;
const goalLabels = { "build-muscle": "筋肉をつける", "lose-fat": "体脂肪を減らす", maintain: "今の状態を保つ" };
export function HomeAdviceCard({ today }: { today: string }) {
  const [preview, setPreview] = useState<AdviceInput | null>(null);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [budget, setBudget] = useState<AdviceBudget | null>(null);
  const [constraints, setConstraints] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const identity = useRef<RecommendationIdentity | null>(null);
  const active = useRef(true); const lock = useRef(false); const generation = useRef(0);
  const configured = !isTestEnvironment && isFirebaseSelected && isFirebaseConfigured && firebaseConfig.projectId === "healthapp-14a3f"
    && process.env.NEXT_PUBLIC_BODYMAKE_ADVICE_ENABLED === "true";
  useEffect(() => {
    active.current = true;
    const invalidate = () => { generation.current++; };
    const clear = () => { generation.current++; setPreview(null); setAdvice(null); setConsent(false); };
    // Returning after edits invalidates an old preview/result; it never triggers a paid call.
    window.addEventListener("focus", clear);
    const visible = () => { if (document.visibilityState === "visible") clear(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active.current = false; invalidate(); identity.current?.dispose(); identity.current = null; window.removeEventListener("focus", clear); document.removeEventListener("visibilitychange", visible); };
  }, [today]);
  async function openIdentity() {
    identity.current?.dispose();
    const session = await openRecommendationIdentity(() => {
      generation.current++;
      if (active.current) { setPreview(null); setAdvice(null); setBudget(null); setConsent(false); setMessage("アカウントが変わったため、提案を閉じました。"); }
    });
    if (!active.current) { session.dispose(); throw new Error("recommendation_auth_changed"); }
    identity.current = session; return session;
  }
  async function prepare() {
    if (!configured || lock.current) return;
    lock.current = true; setBusy(true); setMessage(""); setConsent(false); setAdvice(null); setPreview(null);
    const ticket = ++generation.current;
    try {
      const session = await openIdentity();
      const currentBudget = await readAdviceBudget(session);
      if (active.current && ticket === generation.current) setBudget(currentBudget);
      if (currentBudget.stopped) throw new Error(currentBudget.pending ? "provider_verification_pending" : "credit_exhausted");
      const input = await readAdviceInput(session, today, constraints);
      if (active.current && ticket === generation.current) setPreview(input);
    } catch (e) { if (active.current && ticket === generation.current) setMessage(errorText(e)); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  async function generate() {
    if (!configured || lock.current || !consent || !preview || !identity.current) return;
    lock.current = true; setBusy(true); setMessage(""); setConsent(false);
    const ticket = generation.current; const session = identity.current;
    try {
      const result = await generateAdvice(session, preview, () => readAdviceInput(session, today, constraints));
      if (active.current && ticket === generation.current) { setAdvice(result.advice); setBudget(result.budget); setPreview(null); }
    } catch (e) { if (active.current && ticket === generation.current) { setMessage(errorText(e)); setPreview(null); setAdvice(null); const updated = budgetFromError(e); if (updated) setBudget(updated); } }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  return <section aria-labelledby="home-advice-title" className="min-w-0 rounded-xl border border-[var(--line)] bg-white p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="home-advice-title" className="text-lg font-bold text-[var(--ink)]">これからの食事と筋トレ</h2>
      <span className="rounded-full bg-[var(--sage-soft)] px-3 py-1 text-xs font-semibold text-[var(--sage-deep)]">ChatGPTのアドバイス</span>
    </div>
    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">直近7日間の記録と目標・器具設定から、次に食べるものと取り組む種目を提案します。</p>
    {budget && <div className="mt-3 rounded-lg bg-[var(--canvas)] p-3 text-sm">
      <p>この機能の累計利用額（概算） <strong className="metric">{usd(budget.estimatedMicros)}</strong></p>
      <p className="mt-1 text-xs text-[var(--muted)]">10ドルで通知・利用は継続。OpenAIの残高や他のAPI利用額は含みません。</p>
      {budget.heldMicros > 0 && <p className="mt-1">確認待ちの料金枠 {usd(budget.heldMicros)}</p>}
      {budget.alert && <p role="alert" className="mt-2 font-semibold text-[var(--coral)]">累計利用額の概算が10ドルに達しました。通知後も、確認済みクレジットの範囲で利用を継続できます。</p>}
    </div>}
    {!configured ? <p className="mt-4 rounded-lg bg-[var(--sage-soft)] p-3 text-sm leading-6">{isTestEnvironment ? "テスト画面ではAPIへの送信・クレジットの消費は行いません。" : "APIクレジットの残高・有効期限・自動追加購入の設定を確認中です。確認が終わるまで送信は無効です。"}</p> : <>
      {!preview && !advice && <label className="mt-4 block text-sm font-medium">食事や運動で配慮してほしいこと（任意）
        <textarea value={constraints} onChange={e => setConstraints(e.target.value)} disabled={busy} maxLength={400} rows={2}
          placeholder="例：卵アレルギー、今日は脚に疲れが残っている" className="mt-2 block w-full rounded-lg border border-[var(--line)] bg-white p-3 text-base font-normal" />
        <span className="mt-1 block text-xs font-normal text-[var(--muted)]">氏名や連絡先は入力しないでください。</span>
      </label>}
      {preview && <div className="mt-4 space-y-3 text-sm">
        <p className="font-semibold">今回使用する記録：食事 {preview.days.reduce((s,d) => s+d.meals.length,0)}件／完了した種目 {preview.days.reduce((s,d) => s+d.workouts.length,0)}件</p>
        <details className="rounded-lg border border-[var(--line)] p-3"><summary className="cursor-pointer font-medium">送信する記録を確認</summary>
          <div className="mt-3 space-y-3 leading-6">
            <p>目標：{preview.goal ? goalLabels[preview.goal] : "未設定"}／成人プロフィール：{preview.adult ? "確認済み" : "未確認"}</p>
            <p>使用できる器具：{preview.equipment.join("、") || "器具なしの種目のみ"}</p>
            <p>今日の予定：{preview.plan ? preview.plan.rest ? "休養日" : preview.plan.categories.join("、") : "未設定"}</p>
            {preview.constraints && <p className="whitespace-pre-wrap break-words">配慮事項：{preview.constraints}</p>}
            {preview.days.map(day => <div key={day.date} className="border-t border-[var(--line)] pt-3">
              <time className="font-semibold">{day.date}</time>
              <p className="font-medium">食事</p>
              {day.meals.length ? <ul className="space-y-1">{day.meals.map((m,i) => <li key={i} className="break-words">{m.name}：{valueWithUnit(m.kcal,"kcal")}／たんぱく質 {valueWithUnit(m.protein,"g")}／脂質 {valueWithUnit(m.fat,"g")}／炭水化物 {valueWithUnit(m.carbs,"g")}</li>)}</ul> : <p>記録なし</p>}
              <p className="mt-2 font-medium">完了した運動</p>
              {day.workouts.length ? <ul className="space-y-1">{day.workouts.map((w,i) => <li key={i} className="break-words">{w.name}：{w.sets}セット／合計 {valueWithUnit(w.reps,"回")}／最大重量 {valueWithUnit(w.kg,"kg")}／合計時間 {valueWithUnit(w.minutes,"分")}／合計距離 {valueWithUnit(w.km,"km")}</li>)}</ul> : <p>記録なし</p>}
            </div>)}
          </div>
        </details>
        <label className="flex items-start gap-3 leading-6"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--sage-deep)]" /><span>上の記録の要約と配慮事項をOpenAIへ送信することに同意します。写真やプロフィールの氏名・メールは送りません。</span></label>
        <button type="button" onClick={()=>void generate()} disabled={!consent||busy} className="min-h-12 w-full rounded-lg bg-[var(--sage-deep)] px-4 py-3 font-semibold text-white disabled:opacity-40">{busy ? "記録から提案を作成中…" : "この記録でアドバイスを作る"}</button>
        <p className="text-xs text-[var(--muted)]">既存クレジットを使用します。追加購入・自動送信はしません。</p>
      </div>}
      {!preview && <button type="button" onClick={()=>void prepare()} disabled={busy} className="mt-4 min-h-12 rounded-lg border border-[var(--sage-deep)] px-5 py-3 text-sm font-semibold text-[var(--sage-deep)] disabled:opacity-40">{busy ? "確認中…" : advice ? "最新の記録で作り直す" : "記録を確認してアドバイスを作る"}</button>}
    </>}
    {message && <p role="alert" className="mt-3 text-sm leading-6 text-[var(--coral)]">{message}</p>}
    {advice && <div aria-live="polite" className="mt-5 space-y-5">
      <p className="text-sm leading-7">{advice.summary}</p>
      <div className="grid gap-5 sm:grid-cols-2"><article><h3 className="font-bold text-[var(--sage-deep)]">次の食事</h3><p className="mt-2 font-semibold">{advice.meal.title}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">{advice.meal.foods.map((food,i)=><li key={i}>{food}</li>)}</ul><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{advice.meal.reason}</p></article>
      <article><h3 className="font-bold text-[var(--sage-deep)]">次の筋トレ</h3><p className="mt-2 font-semibold">{advice.workout.title}</p><ul className="mt-2 space-y-2 text-sm leading-6">{advice.workout.exercises.map(ex=><li key={ex.name}><strong>{ex.name}</strong><br/>{ex.amount}</li>)}</ul><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{advice.workout.reason}</p></article></div>
      <p className="border-t border-[var(--line)] pt-4 text-sm leading-6"><strong>回復のために </strong>{advice.recovery}</p>
      {advice.missing.length>0 && <ul className="list-disc pl-5 text-sm leading-6 text-[var(--muted)]">{advice.missing.map((item,i)=><li key={i}>{item}</li>)}</ul>}
      <p className="text-xs text-[var(--muted)]">AIの提案は目安です。量や負荷は体調に合わせて調整してください。</p>
    </div>}
  </section>;
}
