"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { SelectInput, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { alarmSamples, scheduledRestAlarm } from "@/lib/workouts/rest-timer-audio";

const timeFields = [{ unit: "minutes", label: "分" }, { unit: "seconds", label: "秒" }] as const;

function clock(seconds: number) {
  return [Math.floor(seconds / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
}

type ScheduledAlarm = { player: HTMLAudioElement; url: string };

function releaseScheduledAlarm(alarm: ScheduledAlarm | null) {
  if (!alarm) return;
  alarm.player.pause();
  alarm.player.removeAttribute("src");
  alarm.player.load();
  URL.revokeObjectURL(alarm.url);
}

function countdownTime(startedAt: number, timestamp: number, scheduled: RefObject<ScheduledAlarm | null>) {
  const alarm = scheduled.current;
  if (!alarm) return timestamp;
  const mediaTime = startedAt + alarm.player.currentTime * 1000;
  if (alarm.player.ended || (!alarm.player.paused && !alarm.player.error && timestamp - mediaTime < 3000)) {
    return mediaTime;
  }
  // A suspended or stalled media player should not block the on-screen timer.
  scheduled.current = null;
  releaseScheduledAlarm(alarm);
  return timestamp;
}

export function WorkoutTimer() {
  const id = useId();
  const [mode, setMode] = useState<"rest" | "cardio">("rest");
  const [durationDraft, setDurationDraft] = useState({ minutes: "1", seconds: "30" });
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const alarmPlayer = useRef<HTMLAudioElement>(null);
  const scheduledAlarm = useRef<ScheduledAlarm | null>(null);
  const restMode = mode === "rest";
  const durationMs = (Number(durationDraft.minutes) * 60 + Number(durationDraft.seconds)) * 1000;
  const validDuration = Number.isSafeInteger(durationMs) && durationMs > 0 && Number(durationDraft.seconds) < 60;
  const milliseconds = elapsed + (startedAt === null ? 0 : Math.max(0, now - startedAt));
  const finished = restMode && validDuration && milliseconds >= durationMs;
  const running = startedAt !== null && !finished;
  const timeLocked = running || finished;
  const seconds = restMode ? (validDuration ? Math.max(0, Math.ceil((durationMs - milliseconds) / 1000)) : 0) : Math.floor(milliseconds / 1000);

  useEffect(() => {
    if (!running || startedAt === null) return;
    const tick = () => setNow(countdownTime(startedAt, Date.now(), scheduledAlarm));
    const interval = window.setInterval(tick, 200);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running, startedAt]);

  useEffect(() => {
    if (!finished || document.visibilityState !== "visible") return;
    if (!navigator.vibrate?.([250, 150, 250])) return;
    return () => { navigator.vibrate(0); };
  }, [finished]);

  useEffect(() => {
    const context = audioContext.current;
    if (!finished || !context) return;
    const player = playbackFailed ? undefined : scheduledAlarm.current?.player;
    let alarm: AudioBufferSourceNode | undefined;
    const playFallback = () => {
      if (player && !player.ended && !player.paused && !player.error) return;
      if (document.visibilityState === "visible" && context.state !== "running") void context.resume().catch(() => {});
      if (alarm) return;
      const samples = alarmSamples(context.sampleRate);
      const buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.copyToChannel(samples, 0);
      alarm = context.createBufferSource();
      alarm.buffer = buffer;
      alarm.loop = true;
      alarm.connect(context.destination);
      alarm.start();
    };
    playFallback();
    player?.addEventListener("ended", playFallback);
    player?.addEventListener("error", playFallback);
    document.addEventListener("visibilitychange", playFallback);
    return () => {
      player?.removeEventListener("ended", playFallback);
      player?.removeEventListener("error", playFallback);
      document.removeEventListener("visibilitychange", playFallback);
      alarm?.stop();
      alarm?.disconnect();
    };
  }, [finished, playbackFailed]);

  useEffect(() => () => {
    releaseScheduledAlarm(scheduledAlarm.current);
    scheduledAlarm.current = null;
    const context = audioContext.current;
    audioContext.current = null;
    if (context) void context.close().catch(() => {});
  }, []);

  function clearScheduledAlarm() {
    const alarm = scheduledAlarm.current;
    scheduledAlarm.current = null;
    releaseScheduledAlarm(alarm);
  }

  function reset() {
    clearScheduledAlarm();
    setStartedAt(null);
    setElapsed(0);
  }

  function changeDuration(unit: keyof typeof durationDraft, input: string) {
    const value = input.normalize("NFKC");
    if (!/^\d*$/.test(value)) return;
    setDurationDraft((current) => ({ ...current, [unit]: value }));
    reset();
  }

  function toggle(timestamp: number) {
    if (finished) {
      reset();
      return;
    }
    if (restMode && !validDuration) return;
    if (startedAt !== null) {
      const elapsedMs = elapsed + Math.max(0, countdownTime(startedAt, timestamp, scheduledAlarm) - startedAt);
      if (!restMode || elapsedMs < durationMs) clearScheduledAlarm();
      setElapsed(elapsedMs);
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
      const track = scheduledRestAlarm(durationMs - elapsed);
      setPlaybackFailed(false);
      const player = alarmPlayer.current;
      if (track && player) {
        // Start one media track during the tap, with its first tone at the deadline.
        const url = URL.createObjectURL(track);
        const alarm = { player, url };
        scheduledAlarm.current = alarm;
        player.src = url;
        void player.play().catch(() => {
          if (scheduledAlarm.current !== alarm) return;
          clearScheduledAlarm();
          setPlaybackFailed(true);
        });
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
    <audio ref={alarmPlayer} aria-hidden="true" />
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
        <Button type="button" disabled={restMode && !validDuration} onClick={() => toggle(Date.now())}>
          {finished ? "音を止める" : running ? "一時停止" : elapsed > 0 ? "再開" : "開始"}
        </Button>
        {!finished && <Button type="button" variant="secondary" onClick={reset}>リセット</Button>}
      </div>
    </div>
  </details>;
}
