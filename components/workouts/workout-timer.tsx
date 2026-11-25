"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SelectInput, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { alarmSamples, prepareRestAlarmSession, restAlarmTrack } from "@/lib/workouts/rest-timer-audio";

const timeFields = [{ unit: "minutes", label: "分" }, { unit: "seconds", label: "秒" }] as const;
type TimerMode = "rest" | "cardio";
type DurationUnit = (typeof timeFields)[number]["unit"];

const TimerContext = createContext<{
  mode: TimerMode;
  durationDraft: Record<DurationUnit, string>;
  seconds: number;
  validDuration: boolean;
  running: boolean;
  finished: boolean;
  hasElapsed: boolean;
  changeMode: (mode: TimerMode) => void;
  changeDuration: (unit: DurationUnit, value: string) => void;
  reset: () => void;
  toggle: (timestamp: number) => void;
} | null>(null);

function clock(seconds: number) {
  return [Math.floor(seconds / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
}

export function WorkoutTimerProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<TimerMode>("rest");
  const [durationDraft, setDurationDraft] = useState({ minutes: "1", seconds: "30" });
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const audioContext = useRef<AudioContext | null>(null);
  const alarmPlayer = useRef<HTMLAudioElement>(null);
  const alarmSession = useRef<ReturnType<typeof prepareRestAlarmSession>>(null);
  const restMode = mode === "rest";
  const durationMs = (Number(durationDraft.minutes) * 60 + Number(durationDraft.seconds)) * 1000;
  const validDuration = Number.isSafeInteger(durationMs) && durationMs > 0 && Number(durationDraft.seconds) < 60;
  const milliseconds = elapsed + (startedAt === null ? 0 : Math.max(0, now - startedAt));
  const finished = restMode && validDuration && milliseconds >= durationMs;
  const running = startedAt !== null && !finished;
  const seconds = restMode ? (validDuration ? Math.max(0, Math.ceil((durationMs - milliseconds) / 1000)) : 0) : Math.floor(milliseconds / 1000);

  useEffect(() => {
    if (!running || startedAt === null) return;
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 200);
    const deadline = restMode
      ? window.setTimeout(tick, Math.min(2147483647, Math.max(0, startedAt + durationMs - elapsed - Date.now())))
      : undefined;
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(deadline);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [durationMs, elapsed, restMode, running, startedAt]);

  useEffect(() => {
    if (!finished || document.visibilityState !== "visible") return;
    if (!navigator.vibrate?.([250, 150, 250])) return;
    return () => { navigator.vibrate(0); };
  }, [finished]);

  useEffect(() => {
    if (!finished) return;
    const player = alarmPlayer.current;
    const session = alarmSession.current;
    let useWebAudio = Boolean(session?.prioritize() && audioContext.current);
    let playing = true;
    let mediaUrl: string | undefined;
    let alarm: AudioBufferSourceNode | undefined;

    const playFallback = () => {
      const context = audioContext.current;
      if (!playing || !context) return;
      useWebAudio = true;
      if (context.state !== "running") void context.resume().catch(() => {});
      if (alarm) return;
      try {
        const samples = alarmSamples(context.sampleRate);
        const buffer = context.createBuffer(1, samples.length, context.sampleRate);
        buffer.copyToChannel(samples, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(context.destination);
        source.start();
        alarm = source;
      } catch {
        // A browser that suspends audio still shows the completed timer.
      }
    };

    if (!useWebAudio && player) {
      mediaUrl = URL.createObjectURL(restAlarmTrack());
      player.src = mediaUrl;
    }
    const playAlarm = () => {
      if (useWebAudio || !player || !mediaUrl) {
        playFallback();
      } else if (player.paused) {
        void player.play().catch(playFallback);
      }
    };
    playAlarm();
    document.addEventListener("visibilitychange", playAlarm);
    return () => {
      playing = false;
      document.removeEventListener("visibilitychange", playAlarm);
      if (player && mediaUrl) {
        player.pause();
        player.removeAttribute("src");
        player.load();
        URL.revokeObjectURL(mediaUrl);
      }
      alarm?.stop();
      alarm?.disconnect();
      session?.restore();
      if (alarmSession.current === session) alarmSession.current = null;
    };
  }, [finished]);

  useEffect(() => () => {
    alarmSession.current?.restore();
    alarmSession.current = null;
    const context = audioContext.current;
    audioContext.current = null;
    if (context) void context.close().catch(() => {});
  }, []);

  function reset() {
    alarmSession.current?.restore();
    alarmSession.current = null;
    setStartedAt(null);
    setElapsed(0);
  }

  function changeMode(next: TimerMode) {
    setMode(next);
    reset();
  }

  function changeDuration(unit: DurationUnit, input: string) {
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
      alarmSession.current?.restore();
      alarmSession.current = null;
      setElapsed(elapsed + Math.max(0, timestamp - startedAt));
      setStartedAt(null);
      return;
    }
    if (restMode) {
      // Unlock Web Audio from the tap without starting a media track or a tone.
      alarmSession.current = prepareRestAlarmSession(navigator);
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

  return <TimerContext.Provider value={{ mode, durationDraft, seconds, validDuration, running, finished, hasElapsed: elapsed > 0, changeMode, changeDuration, reset, toggle }}>
    <audio ref={alarmPlayer} aria-hidden="true" loop />
    {children}
  </TimerContext.Provider>;
}

export function WorkoutTimer({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const timer = useContext(TimerContext);
  if (!timer) return null;
  const { mode, durationDraft, seconds, validDuration, running, finished, hasElapsed, changeMode, changeDuration, reset, toggle } = timer;
  const restMode = mode === "rest";
  const timeLocked = running || finished;
  const action = <Button type="button" size={compact ? "small" : "default"} className={compact ? "w-24 shrink-0 whitespace-nowrap px-2!" : undefined}
    disabled={restMode && !validDuration} onClick={() => toggle(Date.now())}>
    {finished ? "音を止める" : running ? "一時停止" : hasElapsed ? "再開" : "開始"}
  </Button>;

  return <div className={compact ? "flex items-start gap-2 rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 sm:px-3" : "mb-6 rounded-lg border border-[var(--line)] bg-white px-4"}>
    <details className="group min-w-0 flex-1">
      <summary className={`flex cursor-pointer list-none items-center text-sm font-semibold [&::-webkit-details-marker]:hidden ${compact ? "min-h-11 gap-1 sm:gap-2" : "min-h-12 gap-2 py-3"}`}>
        <Icon name="timer" className={`size-5 shrink-0 text-[var(--sage-deep)] ${compact ? "hidden sm:block" : ""}`} />
        <span className="min-w-0 flex-1 truncate">{compact ? (restMode ? "休憩タイマー" : "有酸素タイマー") : "筋トレ・有酸素タイマー"}</span>
        <output role="timer" aria-label={restMode ? "休憩の残り時間" : "有酸素の経過時間"} className="metric shrink-0 text-lg tabular-nums text-[var(--sage-deep)]">{clock(seconds)}</output>
        <Icon name="chevron-right" className={`${compact ? "size-3 sm:size-4" : "size-4"} shrink-0 group-open:rotate-90`} />
      </summary>
      <div className="grid gap-3 border-t border-[var(--line)] py-3 sm:py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor={id} className="block min-w-0 flex-1 basis-40 text-sm font-medium">計測方法
            <SelectInput id={id} className="mt-1" value={mode} disabled={timeLocked} onChange={(event) => changeMode(event.target.value === "cardio" ? "cardio" : "rest")}>
              <option value="rest">休憩タイマー</option>
              <option value="cardio">有酸素の経過時間</option>
            </SelectInput>
          </label>
          {restMode && <fieldset className="min-w-0 flex-1 basis-40" disabled={timeLocked}>
            <legend className="text-sm font-medium">休憩時間</legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {timeFields.map(({ unit, label }) => <label key={unit} className="flex min-w-0 items-center gap-1 text-sm">
                <TextInput aria-label={`休憩時間の${label}`} data-workout-timer-input={compact || undefined} type="text" inputMode="numeric" enterKeyHint="done" value={durationDraft[unit]}
                  onChange={(event) => changeDuration(unit, event.target.value)} onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    event.currentTarget.blur();
                  }} />{label}
              </label>)}
            </div>
          </fieldset>}
        </div>
        {restMode && !validDuration && <p role="status" className="text-sm text-[var(--coral)]">1秒以上の休憩時間を入力してください。秒は0〜59で設定できます。</p>}
        {finished && !compact && <p role="status" className="text-sm font-semibold text-[var(--sage-deep)]">休憩時間が終了しました。</p>}
        {(!compact || !finished) && <div className="flex flex-wrap gap-2">
          {!compact && action}
          {!finished && <Button type="button" size={compact ? "small" : "default"} variant="secondary" onClick={reset}>リセット</Button>}
        </div>}
      </div>
    </details>
    {compact && action}
    {compact && finished && <span role="status" className="sr-only">休憩時間が終了しました。</span>}
  </div>;
}
