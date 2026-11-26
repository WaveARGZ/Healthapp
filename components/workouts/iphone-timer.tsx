"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { IPHONE_TIMER_SHORTCUT, MAX_IPHONE_TIMER_SECONDS } from "@/lib/workouts/iphone-timer";

const subscribe = () => () => {};
const isIphone = () => /iPhone|iPod/.test(navigator.userAgent);
const serverSnapshot = () => false;

export function IphoneTimer({ seconds, enabled, requestedSeconds, onRequest, onReturn }: {
  seconds: number;
  enabled: boolean;
  requestedSeconds: number | null;
  onRequest: (timestamp: number) => string | null;
  onReturn: () => void;
}) {
  const iphone = useSyncExternalStore(subscribe, isIphone, serverSnapshot);
  if (!iphone && requestedSeconds === null) return null;

  return <section aria-label="iPhoneのタイマー連携" className="grid gap-2 rounded-md bg-[var(--sand)] p-3 text-sm">
    {requestedSeconds === null ? <>
      <p className="font-semibold">ロック中・別のアプリでも使う</p>
      <p className="leading-relaxed text-[var(--muted)]">iPhoneの「時計」に切り替えると、ロック画面で確認でき、終了音も鳴ります。初回は下の設定が必要です。</p>
      <Button type="button" variant="secondary" disabled={!enabled || seconds < 1 || seconds > MAX_IPHONE_TIMER_SECONDS} onClick={() => {
        const url = onRequest(Date.now());
        if (!url) return;
        try {
          // Open synchronously from the tap. Opening the URL is not proof of a started timer.
          window.location.assign(url);
        } catch {
          // Keep the confirmation/recovery panel visible when app switching is blocked.
        }
      }}>iPhoneの時計へ切り替える</Button>
      {seconds > MAX_IPHONE_TIMER_SECONDS && <p>時計への連携は24時間未満に設定してください。</p>}
      <p className="text-xs leading-relaxed text-[var(--muted)]">残り時間を渡し、BodyMake側の計測・終了音は止めます。すでに「時計」で動いているタイマーがないか確認してから押してください。</p>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">初回設定・音が鳴らないとき</summary>
        <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
          <li>iPhoneの「ショートカット」で「＋」を押し、名前を「<strong>{IPHONE_TIMER_SHORTCUT}</strong>」にします。</li>
          <li>「時計」の「タイマーを開始」アクションを追加します。</li>
          <li>時間の数字を長押しし、変数「ショートカットの入力」を選びます。時間の単位は「<strong>秒</strong>」にして保存します。</li>
          <li>BodyMakeに戻り、まず10秒に設定して上のボタンを押します。「時計」で10秒のタイマーが始まったことと、ロック中の終了音を確認してください。</li>
        </ol>
        <p className="mt-3 leading-relaxed">「時計」の「タイマー終了時」で音を選び、音量を確認してください。「再生停止」では終了音が鳴りません。Dynamic Islandへの表示は対応機種で利用できます。</p>
        <p className="mt-2 leading-relaxed text-[var(--muted)]">ショートカットが見つからない場合は名前と入力変数を確認してください。設定せず使う場合は「時計」で休憩時間を設定して開始できます。通常の「開始」は画面を閉じると音が鳴らないことがあります。</p>
      </details>
    </> : <>
      <p role="status" className="font-semibold">「時計」で開始を確認してください</p>
      <p className="leading-relaxed">渡した時間は{Math.floor(requestedSeconds / 60)}分{requestedSeconds % 60}秒です。BodyMakeから開始の成否は確認できません。停止・延長・終了音の操作はiPhoneの「時計」で行ってください。</p>
      <p className="leading-relaxed text-[var(--muted)]">BodyMake側は停止しています。下のボタンでは「時計」のタイマーは止まりません。</p>
      <Button type="button" variant="secondary" onClick={onReturn}>開始されなかった／時計を停止済み</Button>
    </>}
  </section>;
}
