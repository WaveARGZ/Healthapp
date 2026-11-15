"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { isCloudConfigured, isSharedTestEnvironment, isTestEnvironment } from "@/lib/cloud/config";
import { firebaseConfig, isFirebaseConfigured, isFirebaseSelected } from "@/lib/firebase/config";
import { recommendLocally, toRecommendationRequest } from "@/lib/recommendations/engine";
import { buildProfileRecommendationContext } from "@/lib/recommendations/profile-context";
import { checkRecommendationApi, checkProductionRecommendationApi, isLocalRecommendationOrigin, isProductionRecommendationOrigin, recommendationErrorMessage, requestAiRanking, requestProductionAiRanking } from "@/lib/recommendations/client";
import { recommendationMode } from "@/lib/recommendations/availability";
import { openRecommendationIdentity, type RecommendationIdentity } from "@/lib/recommendations/firebase-identity";
import { readFirebaseRecommendationRecords } from "@/lib/recommendations/firebase-records";
import { appendPreference, createPendingExample, RECOMMENDATION_LEARNING_CONSENT, type LearningExample } from "@/lib/recommendations/learning";
import { readRecommendationRecords, recommendationStorageKeys } from "@/lib/recommendations/records";
import type { Nutrient, RecommendationCandidate, RecommendationContext, RecommendationInput, RecommendationResult } from "@/lib/recommendations/types";
import { toDateInputValue } from "@/lib/utils/date";
import { isRecommendationPreferences } from "@/types/recommendation-preferences";

const nutrients: Array<[Nutrient, string, string]> = [["calories", "カロリー", "kcal"], ["proteinG", "たんぱく質", "g"], ["fatG", "脂質", "g"], ["carbsG", "炭水化物", "g"]];
type Records = Omit<RecommendationInput, "date" | "constraints">;

export function RecommendationPanel() {
  const mode = recommendationMode({ test: isTestEnvironment, sharedTest: isSharedTestEnvironment,
    cloud: isCloudConfigured, firebase: isFirebaseSelected, firebaseConfigured: isFirebaseConfigured, projectId: firebaseConfig.projectId });
  if (!mode) return <>
    <h1 className="text-2xl font-bold">次の食事・筋トレ</h1>
    <p className="mt-4 text-sm leading-7">この環境ではおすすめ機能を利用できません。別環境の個人記録やAPIへ接続することはありません。</p>
    <Link href="/dashboard" className="text-link mt-5">ホームへ戻る</Link>
  </>;
  return <ConnectedRecommendationPanel mode={mode} />;
}

function ConnectedRecommendationPanel({ mode }: { mode: "local" | "firebase" }) {
  const production = mode === "firebase";
  const [records, setRecords] = useState<Records | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [context, setContext] = useState<RecommendationContext | null>(null);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [transferConsent, setTransferConsent] = useState(false);
  const [learningConsent, setLearningConsent] = useState(false);
  const [preferences, setPreferences] = useState<Record<string, "helpful" | "not-helpful">>({});
  const [pendingExample, setPendingExample] = useState<LearningExample | null>(null);
  const [learningError, setLearningError] = useState("");
  const [apiStatus, setApiStatus] = useState<"unchecked" | "checking" | "ready" | "unavailable">("unchecked");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState("");
  const [retryId, setRetryId] = useState<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const learningGeneration = useRef(0);
  const learningGroup = useRef<string | null>(null);
  const preferenceValues = useRef<Record<string, "helpful" | "not-helpful">>({});
  const identity = useRef<RecommendationIdentity | null>(null);
  const loadGeneration = useRef(0);
  const inFlight = useRef(false);

  async function freshRecords(): Promise<Records> {
    if (!production) return readRecommendationRecords(window.localStorage);
    const session = identity.current;
    if (!session) throw new Error("recommendation_auth_required");
    session.assertCurrent();
    const fresh = await readFirebaseRecommendationRecords();
    session.assertCurrent();
    if (fresh.profile && fresh.profile.id !== session.uid) throw new Error("recommendation_auth_changed");
    return fresh;
  }

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const clear = () => {
      generation.current++; learningGeneration.current++; abort.current?.abort();
      inFlight.current = false;
      setBusy(false); setContext(null); setResult(null); setRetryId(null);
      setApiStatus("unchecked");
      setTransferConsent(false); setLearningConsent(false); setPreferences({});
      preferenceValues.current = {}; setPendingExample(null); setLearningError("");
    };
    const load = async () => {
      const version = ++loadGeneration.current;
      setLoading(true); setRecords(null);
      try {
        const next = await freshRecords();
        if (active && version === loadGeneration.current) { setRecords(next); setLoadError(""); }
      } catch {
        if (active && version === loadGeneration.current) setLoadError("本人の最新記録を読み込めませんでした。空の記録で続行せず停止しています。ログインと通信を確認して再読み込みしてください。");
      } finally { if (active && version === loadGeneration.current) setLoading(false); }
    };
    const expire = () => {
      clear();
      setApiError("画面への復帰、または記録の変更があったため、候補を更新してください。");
      void load();
    };
    void (async () => {
      try {
        if (production) {
          if (!isProductionRecommendationOrigin(window.location.origin)) throw new Error("production_origin_required");
          const session = await openRecommendationIdentity(() => {
            if (!active) return;
            clear(); ++loadGeneration.current; setRecords(null); setLoading(false);
            setLoadError("ログイン状態が変わりました。候補・送信同意を破棄しました。画面を読み込み直してください。");
          });
          if (!active) { session.dispose(); return; }
          identity.current = session;
        }
        if (active) await load();
      } catch {
        if (active) { setLoading(false); setLoadError("本番のログイン状態を確認できませんでした。本番サイトでログインしてから開いてください。"); }
      }
    })();
    const storageChanged = (event: StorageEvent) => { if (event.key === null || recommendationStorageKeys.includes(event.key)) expire(); };
    window.addEventListener("storage", storageChanged);
    window.addEventListener("focus", expire);
    const cancelPending = () => { generation.current++; loadGeneration.current++; };
    return () => {
      active = false; mounted.current = false; abort.current?.abort();
      cancelPending(); identity.current?.dispose(); identity.current = null;
      window.removeEventListener("storage", storageChanged); window.removeEventListener("focus", expire);
    };
  // The data source is fixed by the build; never switch sources on a read failure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [production]);

  function invalidate() {
    generation.current++;
    abort.current?.abort();
    inFlight.current = false;
    setBusy(false); setContext(null); setResult(null); setRetryId(null); setApiError("");
    setTransferConsent(false); revokeLearning();
  }

  async function generateLocally() {
    if (!records) return;
    invalidate();
    const current = generation.current;
    setBusy(true);
    try {
      const fresh = await freshRecords();
      if (!mounted.current || current !== generation.current) return;
      if (!isRecommendationPreferences(fresh.profile?.recommendationPreferences)) { setRecords(fresh); return; }
      const next = buildProfileRecommendationContext(fresh, toDateInputValue());
      setRecords(fresh); setLoadError(""); setContext(next); setResult(recommendLocally(next));
    } catch {
      if (mounted.current && current === generation.current) { setRecords(null); setLoadError("記録を正しく読み込めないため、おすすめを停止しています。記録を確認して再読み込みしてください。"); }
    } finally { if (mounted.current && current === generation.current) setBusy(false); }
  }

  async function checkConnection() {
    const current = generation.current;
    setApiStatus("checking");
    try {
      const enabled = production
        ? await checkProductionRecommendationApi({ origin: window.location.origin, identity: identity.current!, signal: AbortSignal.timeout(10000) })
        : await checkRecommendationApi(window.location.origin, AbortSignal.timeout(5000));
      if (mounted.current && current === generation.current) { setApiStatus(enabled ? "ready" : "unavailable"); setApiError(""); }
    } catch (error) { if (mounted.current && current === generation.current) { setApiStatus("unavailable"); setApiError(recommendationErrorMessage(error)); } }
  }

  async function askApi() {
    if (!context || busy || inFlight.current || !transferConsent || apiStatus !== "ready"
      || !(production ? isProductionRecommendationOrigin(window.location.origin) : isLocalRecommendationOrigin(window.location.origin))) return;
    if (context.date !== toDateInputValue()) { invalidate(); setApiError("日付が変わりました。もう一度、端末内で候補を作ってください。"); return; }
    const current = ++generation.current;
    inFlight.current = true; setBusy(true);
    try {
      const fresh = await freshRecords();
      if (!mounted.current || current !== generation.current) return;
      if (!isRecommendationPreferences(fresh.profile?.recommendationPreferences)) { invalidate(); setRecords(fresh); return; }
      const next = buildProfileRecommendationContext(fresh, toDateInputValue());
      if (JSON.stringify(next) !== JSON.stringify(context)) {
        invalidate(); setRecords(fresh); setApiError("記録が変わりました。もう一度、端末内で候補を作って送信内容を確認してください。"); return;
      }
    } catch {
      if (!mounted.current || current !== generation.current) return;
      invalidate(); setRecords(null); setLoadError("記録を正しく読み込めないため、APIには送信しませんでした。再読み込みしてください。"); return;
    }
    const requestId = retryId ?? crypto.randomUUID();
    setRetryId(requestId); setBusy(true); setApiError(""); revokeLearning();
    const controller = new AbortController(); abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const input = { origin: window.location.origin, transferConsent, requestId,
        request: toRecommendationRequest(context), signal: controller.signal };
      const next = production
        ? await requestProductionAiRanking({ ...input, identity: identity.current! })
        : await requestAiRanking(input);
      if (!mounted.current || current !== generation.current) return;
      if (production) {
        const fresh = await freshRecords();
        if (!mounted.current || current !== generation.current) return;
        if (context.date !== toDateInputValue() || JSON.stringify(buildProfileRecommendationContext(fresh, toDateInputValue())) !== JSON.stringify(context)) {
          invalidate(); setRecords(fresh); setApiError("送信後に記録が変わりました。古い条件のAPI回答は表示せず、再送もしません。候補を更新してください。"); return;
        }
      }
      if (mounted.current && current === generation.current) { setResult(next); setRetryId(null); }
    } catch (error) {
      if (mounted.current && current === generation.current) setApiError(recommendationErrorMessage(error));
    } finally {
      clearTimeout(timer);
      if (mounted.current && current === generation.current) { inFlight.current = false; setBusy(false); setTransferConsent(false); }
    }
  }

  function revokeLearning() {
    learningGeneration.current++;
    setLearningConsent(false); setPreferences({}); preferenceValues.current = {};
    setPendingExample(null); setLearningError("");
  }

  async function prepareLearning() {
    if (!context || result?.source !== "openai") return;
    const current = ++learningGeneration.current;
    setLearningConsent(true); setLearningError("");
    learningGroup.current ??= crypto.randomUUID();
    const at = new Date().toISOString();
    try {
      let example = await createPendingExample(toRecommendationRequest(context), result, {
        id: crypto.randomUUID(), groupId: learningGroup.current, source: "app-consent", createdAt: at,
        consent: { granted: true, version: RECOMMENDATION_LEARNING_CONSENT, grantedAt: at },
        featureVersion: "recommendation-features-v1", promptVersion: "bodymake-rank-v1",
      });
      if (!mounted.current || current !== learningGeneration.current) return;
      for (const [candidateId, preference] of Object.entries(preferenceValues.current)) {
        example = appendPreference(example, { id: crypto.randomUUID(), at: new Date().toISOString(),
          value: preference === "helpful" ? "accepted" : "declined", candidateIds: [candidateId] });
      }
      setPendingExample(example);
    } catch {
      if (mounted.current && current === learningGeneration.current) {
        setLearningConsent(false); setPendingExample(null);
        setLearningError("学習候補の整合性を確認できず、仮保持しませんでした。");
      }
    }
  }

  function rateCandidate(id: string, value: "helpful" | "not-helpful") {
    preferenceValues.current = { ...preferenceValues.current, [id]: value };
    setPreferences(preferenceValues.current);
    const event = { id: crypto.randomUUID(), at: new Date().toISOString(),
      value: value === "helpful" ? "accepted" as const : "declined" as const, candidateIds: [id] };
    setPendingExample((example) => example ? appendPreference(example, event) : null);
  }

  const selected = (kind: "meal" | "workout") => {
    const ids = kind === "meal" ? result?.mealIds : result?.workoutIds;
    return (ids ?? []).map((id) => context?.candidates.find((candidate) => candidate.id === id && candidate.kind === kind)).filter((value): value is RecommendationCandidate => Boolean(value));
  };
  const profileReady = isRecommendationPreferences(records?.profile?.recommendationPreferences);

  return <>
    <Link href="/dashboard" className="text-link">← ホーム</Link>
    <header className="mt-5">
      <p className="text-xs font-semibold text-[var(--sage-deep)]">{production ? "本人の記録から作成・AIへの自動送信なし" : "ローカルテスト・自動送信なし"}</p>
      <h1 className="mt-2 text-[26px] font-bold tracking-tight">次の食事・筋トレ</h1>
      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">保存した基本情報、今日の食事と最近の筋トレ、使える器具から次の候補を考えます。まずは端末内で作成し、希望するときだけAIに優先順位を相談できます。</p>
    </header>
    {loading && <p role="status" className="mt-6 text-sm">記録を読み込んでいます…</p>}
    {loadError && <p role="alert" className="mt-6 text-sm leading-7 text-[var(--coral)]">{loadError}</p>}
    {!loading && records && !profileReady && <div className="mt-6 rounded-md border border-[var(--line)] p-4">
      <p className="text-sm leading-7">最初に、おすすめに使う基本情報をプロフィールに追加してください。次回からは保存した内容を使います。</p>
      <Link href="/onboarding" className="text-link mt-3">基本情報を入力する →</Link>
    </div>}
    <div className="mt-6">
      <Button type="button" className="w-full sm:w-auto" onClick={generateLocally} disabled={loading || !records || !profileReady || busy}>端末内で候補を作る（無料）</Button>
      {profileReady && <p className="mt-3 text-xs leading-6 text-[var(--muted)]">基本情報は保存済みです。変更がある場合は<Link href="/onboarding" className="ml-1 underline">プロフィールを編集</Link>してください。</p>}
    </div>

    {context && <>
      <section className="mt-7" aria-labelledby="recommendation-summary">
        <h2 id="recommendation-summary" className="section-title">判断に使った記録</h2>
        <p className="mt-2 text-xs text-[var(--muted)]">{context.date}の食事 {context.nutrition.mealCount}件 ／ 最近の筋トレ {context.recentWorkoutCount}件</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{nutrients.map(([key, label, unit]) => <div key={key} className="min-w-0 rounded border border-[var(--line)] p-3">
          <dt className="text-xs text-[var(--muted)]">{label}</dt>
          <dd className="metric mt-2 break-words text-lg font-semibold">{context.nutrition.totals[key] === null ? "未入力" : `${Math.round(context.nutrition.totals[key]! * 10) / 10} ${unit}`}</dd>
          {!context.nutrition.complete[key] && <p className="mt-1 text-[11px] text-[var(--muted)]">未入力分は含めません</p>}
        </div>)}</dl>
        <ul className="mt-4 space-y-2 text-xs leading-6 text-[var(--muted)]">{context.notices.map((notice, index) => <li key={index}>・{notice}</li>)}</ul>
      </section>

      <section className="mt-7 rounded-md border border-[var(--line)] p-4 sm:p-5" aria-labelledby="recommendation-ai">
        <h2 id="recommendation-ai" className="section-title">AIで優先順位を相談</h2>
        <p className="mt-2 text-xs leading-6 text-[var(--muted)]">APIは候補IDの順位だけを選びます。料理の栄養値や新しい種目・重量は生成させません。APIキーはこの画面に入力しません。</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="small" onClick={checkConnection} disabled={apiStatus === "checking" || busy}>接続状態を確認</Button>
          <span role="status" className="text-xs text-[var(--muted)]">{apiStatus === "ready" ? "APIへの送信準備ができています" : apiStatus === "checking" ? "確認中…" : apiStatus === "unavailable" ? "未設定・無効、または利用できません" : "APIはまだ接続していません"}</span>
        </div>
        <details className="mt-3 text-xs leading-6 text-[var(--muted)]"><summary className="min-h-11 cursor-pointer content-center">送信する内容と保存について</summary>
          <p>送信するのは目標、カロリー・PFCの集計と欠損状態、最近の筋トレ件数、プロフィールに保存した食事・運動の配慮事項と利用時間、候補IDと数値特徴です。氏名・メール・写真・自由入力の料理名・記録そのものは送信しません。</p>
          <p className="mt-2">API側での応答保存は無効にしますが、不正利用監視などの保持がゼロになる設定ではありません。ブラウザ内の回答はこの画面を閉じると消えます。{production ? "Cloudflareの受け口で本人認証し、集計だけをOpenAIへ中継します。予算・重複防止のため、予約額・受付番号・匿名化した識別子・入力ハッシュ・実行状態を永続保存します。個人記録・回答・認証トークンは保存しません。" : "重複呼び出し防止のため、ローカル受け口も終了まで回答・受付番号などをメモリ内に保持します。"}</p>
          {production && <p className="mt-2">OpenAIは全利用者合計・累計5ドルが上限です。現在は安全のため1回0.50ドルを予約し、最大10回で停止します。これは実請求額ではなく、実際の5ドル消費より早く停止します。Cloudflareの無料枠超過時も停止し、有料サービスへ切り替えません。</p>}
          <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer" className="underline">OpenAIのデータ取り扱い</a>
        </details>
        <label className="mt-2 flex min-h-11 items-start gap-3 py-2 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--sage-deep)]" checked={transferConsent} disabled={busy} onChange={(event) => setTransferConsent(event.target.checked)} /><span>今回の集計データをOpenAI APIへ送信することに同意する（APIクレジットを使用）</span></label>
        <Button type="button" className="mt-3 w-full sm:w-auto" onClick={askApi} disabled={busy || !transferConsent || apiStatus !== "ready" || context.candidates.length === 0 || (production && retryId !== null)}>{busy ? "AIに相談中…" : retryId ? (production ? "送信済み（自動再送なし）" : "同じリクエストの結果を再確認") : "AIに順位を相談する"}</Button>
        {apiError && <p role="alert" className="mt-3 text-xs leading-6 text-[var(--coral)]">{apiError}</p>}
      </section>

      <section className="mt-8" aria-labelledby="recommendation-result" aria-busy={busy}>
        <h2 id="recommendation-result" className="section-title">次の候補</h2>
        <p className="mt-2 text-xs text-[var(--muted)]">{result?.source === "openai" ? `APIが順位を選択（${result.model}）・安全性の個別確認は未実施` : "端末内のルールで選択・学習済みAIの結果ではありません"}</p>
        <div className="mt-5 grid gap-7 sm:grid-cols-2">{(["meal", "workout"] as const).map((kind) => <div key={kind} className="min-w-0">
          <h3 className="border-b border-[var(--line)] pb-2 text-sm font-bold">{kind === "meal" ? "次の食事" : "次の筋トレ"}</h3>
          {selected(kind).length === 0 && <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{kind === "meal" ? "条件に合う食事候補がありません。上の注意点とプロフィールを確認してください。" : "今日は休養、または条件・器具・お気に入りの確認を優先してください。"}</p>}
          <ol className="mt-3 space-y-3">{selected(kind).map((candidate, index) => <li key={candidate.id} className="rounded-md border border-[var(--line)] bg-white p-4">
            <p className="text-xs text-[var(--sage-deep)]">候補 {index + 1}</p><h4 className="mt-1 break-words text-sm font-bold leading-6">{candidate.title}</h4>
            <p className="mt-2 text-xs leading-6 text-[var(--muted)]">{candidate.reason}</p>
            {candidate.nutrition && <p className="metric mt-3 text-xs leading-6">約 {candidate.nutrition.calories} kcal<br />P {candidate.nutrition.proteinG}g ／ F {candidate.nutrition.fatG}g ／ C {candidate.nutrition.carbsG}g</p>}
            <div className="mt-3 flex flex-wrap gap-2">{(["helpful", "not-helpful"] as const).map((value) => <Button key={value} type="button" size="small" variant={preferences[candidate.id] === value ? "primary" : "secondary"} aria-pressed={preferences[candidate.id] === value} onClick={() => rateCandidate(candidate.id, value)}>{value === "helpful" ? "参考になる" : "合わない"}</Button>)}</div>
          </li>)}</ol>
          <Link href={kind === "meal" ? "/meals" : "/workouts"} className="text-link mt-3">{kind === "meal" ? "食事を記録する →" : "筋トレ・器具設定へ →"}</Link>
        </div>)}</div>
        <p className="mt-4 text-xs leading-6 text-[var(--muted)]">食事量は例で、残りの摂取ノルマではありません。参考になるという評価も、栄養・運動面で安全という確認には使いません。記録への自動追加は行いません。</p>
      </section>

      <section className="mt-8 rounded-md border border-dashed border-[var(--line)] p-4" aria-labelledby="recommendation-learning">
        <h2 id="recommendation-learning" className="text-sm font-bold">自作AIの学習準備</h2>
        <p className="mt-2 text-xs leading-6 text-[var(--muted)]">APIの回答と利用者の評価は、正解確認前の候補として区別します。独立した安全確認・評価に合格するまで、学習済み・採用済みにはしません。</p>
        <label className="mt-2 flex min-h-11 items-start gap-3 py-2 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--sage-deep)]" disabled={result?.source !== "openai" || busy} checked={learningConsent} onChange={(event) => event.target.checked ? void prepareLearning() : revokeLearning()} /><span>今回のAPI回答・集計・評価を、学習候補としてこの画面のメモリ内に仮保持することに同意する</span></label>
        <p role="status" className="mt-2 text-xs leading-6 text-[var(--muted)]">{pendingExample ? `確認待ちの学習候補（評価履歴 ${pendingExample.events.length}件）。Driveへの保存・受領確認・実学習はまだ行っていません。` : learningConsent ? "学習候補の整合性を確認中…" : "学習共有は無効です。評価はこの画面を閉じると消えます。"}</p>
        {learningError && <p role="alert" className="mt-2 text-xs text-[var(--coral)]">{learningError}</p>}
        {learningConsent && <Button type="button" size="small" variant="secondary" className="mt-2" onClick={revokeLearning}>同意を取り消し、仮保持を破棄</Button>}
        <p className="mt-2 text-xs leading-6 text-[var(--muted)]">取り消しは画面内の学習候補を破棄します。すでに行ったAPI送信や受け口の重複防止用の保持は取り消しません。非公開の保存先・削除対応・API回答の外部モデル学習への利用条件を確認してから、保存と実学習を別途有効にします。</p>
      </section>
    </>}
  </>;
}
