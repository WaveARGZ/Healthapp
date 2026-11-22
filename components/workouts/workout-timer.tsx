"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

function clock(seconds: number) {
  return [Math.floor(seconds / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
}

export function WorkoutTimer() {
  const id = useId();
  const [duration, setDuration] = useState(90);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const milliseconds = elapsed + (startedAt === null ? 0 : Math.max(0, now - startedAt));
  const finished = duration > 0 && milliseconds >= duration * 1000;
  const running = startedAt !== null && !finished;
  const seconds = duration ? Math.max(0, Math.ceil(duration - milliseconds / 1000)) : Math.floor(milliseconds / 1000);

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 200);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running]);

  function reset() {
    setStartedAt(null);
    setElapsed(0);
  }

  function toggle() {
    const timestamp = Date.now();
    if (running && startedAt !== null) {
      setElapsed(elapsed + Math.max(0, timestamp - startedAt));
      setStartedAt(null);
      return;
    }
    if (finished) setElapsed(0);
    setNow(timestamp);
    setStartedAt(timestamp);
  }

  return <details className="group mb-6 rounded-lg border border-[var(--line)] bg-white px-4">
    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
      <Icon name="timer" className="size-5 shrink-0 text-[var(--sage-deep)]" />
      <span className="min-w-0 flex-1">筋トレ・有酸素タイマー</span>
      <output role="timer" aria-label={duration ? "休憩の残り時間" : "有酸素の経過時間"} className="metric shrink-0 text-lg tabular-nums text-[var(--sage-deep)]">{clock(seconds)}</output>
      <Icon name="chevron-right" className="size-4 shrink-0 group-open:rotate-90" />
    </summary>
    <div className="flex flex-wrap items-end gap-3 border-t border-[var(--line)] py-4">
      <label htmlFor={id} className="block min-w-0 flex-1 basis-44 text-sm font-medium">計測方法
        <select id={id} className="form-input mt-1" value={duration} disabled={running} onChange={(event) => { setDuration(Number(event.target.value)); reset(); }}>
          <option value={90}>休憩 1分30秒</option>
          <option value={30}>休憩 30秒</option>
          <option value={60}>休憩 1分</option>
          <option value={120}>休憩 2分</option>
          <option value={180}>休憩 3分</option>
          <option value={0}>有酸素の経過時間</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={toggle}>{running ? "一時停止" : elapsed > 0 && !finished ? "再開" : "開始"}</Button>
        <Button type="button" variant="secondary" onClick={reset}>リセット</Button>
      </div>
      {finished && <p role="status" className="w-full text-sm font-semibold text-[var(--sage-deep)]">休憩時間が終了しました。</p>}
    </div>
  </details>;
}
