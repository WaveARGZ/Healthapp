"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { mealReminderConfigured, prepareMealReminders, stopMealReminders, supportsMealReminders } from "@/lib/meals/meal-reminder-client";

export function MealReminderSetting() {
  const [browser, setBrowser] = useState<Awaited<ReturnType<typeof prepareMealReminders>> | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!mealReminderConfigured) return;
    void Promise.resolve().then(async () => {
      if (!supportsMealReminders()) {
        if (active) setMessage("このブラウザーでは通知を使えません。iPhoneではホーム画面に追加したBodyMakeを開いてください。");
        return;
      }
      const result = await prepareMealReminders();
      if (active) {
        setBrowser(result);
        setEnabled(result.enabled);
      }
    }).catch(() => {
      if (active) setMessage("通知の設定を読み込めませんでした。");
    });
    return () => { active = false; };
  }, []);

  async function toggle() {
    if (!browser || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (enabled) await stopMealReminders();
      else await browser.enable();
      setEnabled(!enabled);
    } catch {
      setMessage(enabled ? "通知を停止できませんでした。通信状態を確認して、もう一度お試しください。"
        : "通知を有効にできませんでした。端末の通知設定と通信状態を確認してください。");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel" aria-labelledby="meal-reminder-title">
    <h2 id="meal-reminder-title" className="section-title">食事の記録リマインダー</h2>
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {([["朝食", "8:00"], ["昼食", "12:00"], ["夕食", "19:00"]] as const).map(([meal, time]) =>
        <div key={meal} className="flex items-baseline gap-2"><dt>{meal}</dt><dd className="metric font-semibold">{time}</dd></div>)}
    </dl>
    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">日本時間で、該当する食事が未登録のときだけこの端末に通知します。</p>
    {!mealReminderConfigured && <p className="mt-2 text-sm text-[var(--muted)]">通知の配信先は準備中です。</p>}
    {browser && <Button className="mt-3" size="small" type="button" variant={enabled ? "secondary" : "primary"}
      disabled={busy} onClick={() => void toggle()}>
      {busy ? "設定中…" : enabled ? "食事の通知をオフにする" : "食事の通知をオンにする"}
    </Button>}
    {message && <p role="status" className="mt-2 text-sm text-[var(--muted)]">{message}</p>}
  </section>;
}
