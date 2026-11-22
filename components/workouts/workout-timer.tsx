"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectInput, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";

const timeFields = [{ unit: "minutes", label: "分" }, { unit: "seconds", label: "秒" }] as const;

function clock(seconds: number) {
  return [Math.floor(seconds / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
}

function createAlarmBuffer(context: AudioContext) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, rate * 2, rate);
  const samples = buffer.getChannelData(0);
  const toneLength = Math.floor(rate * 0.18);
  const fadeLength = Math.max(1, Math.floor(rate * 0.01));
  for (const [start, frequency] of [[0, 880], [Math.floor(rate * 0.27), 1100]]) {
    for (let sample = 0; sample < toneLength; sample += 1) {
      const envelope = Math.min(sample, toneLength - sample, fadeLength) / fadeLength;
      samples[start + sample] = Math.sin(2 * Math.PI * frequency * sample / rate) * envelope * 0.2;
    }
  }
  return buffer;
}

export function WorkoutTimer() {
  const id = useId();
  const [mode, setMode] = useState<"rest" | "cardio">("rest");
  const [durationDraft, setDurationDraft] = useState({ minutes: "1", seconds: "30" });
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const audioContext = useRef<AudioContext | null>(null);
  const restMode = mode === "rest";
  const durationMs = (Number(durationDraft.minutes) * 60 + Number(durationDraft.seconds)) * 1000;
  const validDuration = Number.isSafeInteger(durationMs) && durationMs > 0 && Number(durationDraft.seconds) < 60;
  const milliseconds = elapsed + (startedAt === null ? 0 : Math.max(0, now - startedAt));
  const finished = restMode && validDuration && milliseconds >= durationMs;
  const running = startedAt !== null && !finished;
  const timeLocked = running || finished;
  const seconds = restMode ? (validDuration ? Math.max(0, Math.ceil((durationMs - milliseconds) / 1000)) : 0) : Math.floor(milliseconds / 1000);

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

  useEffect(() => {
    const context = audioContext.current;
    if (!finished || !context) return;
    const alarm = context.createBufferSource();
    alarm.buffer = createAlarmBuffer(context);
    alarm.loop = true;
    alarm.connect(context.destination);
    alarm.start();
    return () => {
      alarm.stop();
      alarm.disconnect();
    };
  }, [finished]);

  useEffect(() => () => {
    const context = audioContext.current;
    audioContext.current = null;
    if (context) void context.close().catch(() => {});
  }, []);

  function reset() {
    setStartedAt(null);
    setElapsed(0);
  }

  function changeDuration(unit: keyof typeof durationDraft, input: string) {
    const value = input.normalize("NFKC");
    if (!/^\d*$/.test(value)) return;
    setDurationDraft((current) => ({ ...current, [unit]: value }));
    reset();
  }

  function toggle() {
    if (finished) {
      reset();
      return;
    }
    if (restMode && !validDuration) return;
    const timestamp = Date.now();
    if (startedAt !== null) {
      setElapsed(elapsed + Math.max(0, timestamp - startedAt));
      setStartedAt(null);
      return;
    }
    if (restMode) {
      // Mobile browsers require a tap before allowing audio to play.
      try {
        const context = audioContext.current ??= new AudioContext();
        if (context.state !== "running") void context.resume().catch(() => {});
      } catch {
        // Keep the visual timer available when audio is unsupported.
      }
    }
    setNow(timestamp);
    setStartedAt(timestamp);
  }

  return <details className="group mb-6 rounded-lg border border-[var(--line)] bg-white px-4">
    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
      <Icon name="timer" className="size-5 shrink-0 text-[var(--sage-deep)]" />
      <span className="min-w-0 flex-1">筋トレ・有酸素タイマー</span>
      <output role="timer" aria-label={restMode ? "休憩の残り時間" : "有酸素の経過時間"} className="metric shrink-0 text-lg tabular-nums text-[var(--sage-deep)]">{clock(seconds)}</output>
      <Icon name="chevron-right" className="size-4 shrink-0 group-open:rotate-90" />
    </summary>
    <div className="grid gap-3 border-t border-[var(--line)] py-4">
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={id} className="block min-w-0 flex-1 basis-40 text-sm font-medium">計測方法
          <SelectInput id={id} className="mt-1" value={mode} disabled={timeLocked} onChange={(event) => {
            setMode(event.target.value === "cardio" ? "cardio" : "rest");
            reset();
          }}>
            <option value="rest">休憩タイマー</option>
            <option value="cardio">有酸素の経過時間</option>
          </SelectInput>
        </label>
        {restMode && <fieldset className="min-w-0 flex-1 basis-40" disabled={timeLocked}>
          <legend className="text-sm font-medium">休憩時間</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {timeFields.map(({ unit, label }) => <label key={unit} className="flex min-w-0 items-center gap-1 text-sm">
              <TextInput aria-label={`休憩時間の${label}`} type="text" inputMode="numeric" value={durationDraft[unit]} onChange={(event) => changeDuration(unit, event.target.value)} />{label}
            </label>)}
          </div>
        </fieldset>}
      </div>
      {restMode && !validDuration && <p role="status" className="text-sm text-[var(--coral)]">1秒以上の休憩時間を入力してください。秒は0〜59で設定できます。</p>}
      {finished && <p role="status" className="text-sm font-semibold text-[var(--sage-deep)]">休憩時間が終了しました。</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={restMode && !validDuration} onClick={toggle}>
          {finished ? "音を止める" : running ? "一時停止" : elapsed > 0 ? "再開" : "開始"}
        </Button>
        {!finished && <Button type="button" variant="secondary" onClick={reset}>リセット</Button>}
      </div>
    </div>
  </details>;
}
