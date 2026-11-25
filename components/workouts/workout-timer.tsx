"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SelectInput, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { useWorkoutRestPush } from "@/hooks/use-workout-rest-push";
import { allowTimerAudioMixing, playRestMediaAlarm, requestRestAlarmAudioFocus, scheduleRestChime } from "@/lib/workouts/rest-timer-audio";
import { enableRestNotifications, restNotificationPermission, showRestNotification } from "@/lib/workouts/workout-timer-notifications";
import { initialWorkoutTimer, restDurationMs, restoreWorkoutTimer, workoutTimerElapsed, type DurationUnit, type TimerMode, type WorkoutTimerState } from "@/lib/workouts/workout-timer-state";

const timeFields = [{ unit: "minutes", label: "分" }, { unit: "seconds", label: "秒" }] as const;

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
  notificationPermission: NotificationPermission | "unsupported";
  enableNotifications: () => Promise<void>;
  pushAvailable: boolean;
  pushSubscribed: boolean;
  pushStatus: "idle" | "pending" | "scheduled" | "error";
} | null>(null);

function clock(seconds: number) {
  return [Math.floor(seconds / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
}

const timerKey = "bodymake.workout-timer.v1";
const audioOwnerKey = "bodymake.workout-timer.audio-owner";
const timerChangeEvent = "bodymake:workout-timer-change";
let cachedTimer: WorkoutTimerState = initialWorkoutTimer;
let cachedTimerJson: string | null = null;

function readTimer() {
  try {
    const value = window.localStorage.getItem(timerKey);
    if (cachedTimerJson !== value) {
      cachedTimerJson = value;
      cachedTimer = restoreWorkoutTimer(value);
    }
  } catch { /* Keep the in-memory timer if browser storage is unavailable. */ }
  return cachedTimer;
}

function writeTimer(state: WorkoutTimerState) {
  cachedTimer = state;
  try {
    const value = JSON.stringify(state);
    window.localStorage.setItem(timerKey, value);
    cachedTimerJson = value;
  } catch { /* Keep the in-memory timer if browser storage is unavailable. */ }
  window.dispatchEvent(new Event(timerChangeEvent));
}

function ownsAudio(startedAt: number): boolean {
  try { return window.sessionStorage.getItem(audioOwnerKey) === String(startedAt); }
  catch { return false; }
}

function subscribeTimer(notify: () => void) {
  const sync = (event: StorageEvent) => { if (event.key === null || event.key === timerKey) notify(); };
  window.addEventListener(timerChangeEvent, notify);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(timerChangeEvent, notify);
    window.removeEventListener("storage", sync);
  };
}

type ScheduledAlarm = ReturnType<typeof scheduleRestChime> & { startedAt: number };

function releaseAlarm(alarm: ScheduledAlarm | null) {
  alarm?.source.stop();
  alarm?.source.disconnect();
}

export function WorkoutTimerProvider({ children }: { children: ReactNode }) {
  const timer = useSyncExternalStore(subscribeTimer, readTimer, () => initialWorkoutTimer);
  const { mode, durationDraft, elapsedMs, startedAt } = timer;
  const [now, setNow] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const push = useWorkoutRestPush();
  const audioContext = useRef<AudioContext | null>(null);
  const scheduledAlarm = useRef<ScheduledAlarm | null>(null);
  const timerStartedHere = useRef<number | null>(null);
  const restMode = mode === "rest";
  const durationMs = restDurationMs(durationDraft);
  const validDuration = durationMs > 0;
  const milliseconds = workoutTimerElapsed(timer, now);
  const finished = restMode && validDuration && milliseconds >= durationMs;
  const running = startedAt !== null && !finished;
  const seconds = restMode ? (validDuration ? Math.max(0, Math.ceil((durationMs - milliseconds) / 1000)) : 0) : Math.floor(milliseconds / 1000);

  useEffect(() => {
    if (!running || startedAt === null) return;
    const tick = () => setNow(Date.now());
    const firstTick = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 200);
    const deadline = restMode ? window.setTimeout(tick, Math.min(2_147_483_647, Math.max(0, startedAt + durationMs - elapsedMs - Date.now()))) : undefined;
    window.addEventListener("pageshow", tick);
    document.addEventListener("visibilitychange", tick);
    document.addEventListener("resume", tick);
    return () => {
      window.clearTimeout(firstTick);
      window.clearTimeout(deadline);
      window.clearInterval(interval);
      window.removeEventListener("pageshow", tick);
      document.removeEventListener("visibilitychange", tick);
      document.removeEventListener("resume", tick);
    };
  }, [durationMs, elapsedMs, restMode, running, startedAt]);

  useEffect(() => {
    if (!finished || startedAt === null) return;
    let alertedWhileHidden = false;
    let vibrated = false;
    let startedAudio = false;
    let releaseFocus: (() => void) | null = null;
    let media: ReturnType<typeof playRestMediaAlarm> | null = null;
    const playChime = () => {
      try {
        const context = audioContext.current ??= new AudioContext();
        const scheduled = scheduledAlarm.current;
        // Visibility changes can restore a suspended context. Only replace a
        // chime that is still waiting on a browser audio clock that fell behind.
        if (context.state !== "running") void context.resume().catch(() => {});
        if (scheduled && context.currentTime >= scheduled.playAt) return;
        releaseAlarm(scheduled);
        scheduledAlarm.current = null;
        scheduledAlarm.current = { ...scheduleRestChime(context, 0), startedAt };
      } catch { /* The timer still shows completion if the browser blocks audio. */ }
    };
    const playMedia = (alarm: NonNullable<typeof media>) => {
      void alarm.play().catch(() => {
        if (media !== alarm) return;
        media = null;
        alarm.stop();
        playChime();
      });
    };
    const alert = () => {
      const visible = document.visibilityState === "visible";
      if (!visible && !alertedWhileHidden && restNotificationPermission() === "granted") {
        alertedWhileHidden = true;
        void showRestNotification(startedAt).catch(() => { alertedWhileHidden = false; });
      }
      if (visible && !vibrated) {
        navigator.vibrate?.([250, 150, 250]);
        vibrated = true;
      }
      if (timerStartedHere.current !== startedAt && !ownsAudio(startedAt)) return;
      if (startedAudio) {
        if (!media) playChime();
        else if (visible && media.player.paused) playMedia(media);
        return;
      }
      startedAudio = true;
      releaseFocus = requestRestAlarmAudioFocus(navigator);
      if (!releaseFocus) {
        try {
          media = playRestMediaAlarm();
          playMedia(media);
          return;
        } catch { /* The browser may support only Web Audio. */ }
      }
      playChime();
    };
    alert();
    document.addEventListener("visibilitychange", alert);
    return () => {
      document.removeEventListener("visibilitychange", alert);
      const alarm = media;
      media = null;
      alarm?.stop();
      releaseFocus?.();
      if (vibrated) navigator.vibrate?.(0);
    };
  }, [finished, startedAt]);

  useEffect(() => {
    const alarm = scheduledAlarm.current;
    if (!alarm || alarm.startedAt === startedAt) return;
    scheduledAlarm.current = null;
    releaseAlarm(alarm);
  }, [startedAt]);

  useEffect(() => {
    const updatePermission = () => setNotificationPermission(restNotificationPermission());
    const once = window.setTimeout(updatePermission, 0);
    window.addEventListener("pageshow", updatePermission);
    document.addEventListener("visibilitychange", updatePermission);
    return () => {
      window.clearTimeout(once);
      window.removeEventListener("pageshow", updatePermission);
      document.removeEventListener("visibilitychange", updatePermission);
    };
  }, []);

  useEffect(() => () => {
    releaseAlarm(scheduledAlarm.current);
    scheduledAlarm.current = null;
    const context = audioContext.current;
    audioContext.current = null;
    if (context) void context.close().catch(() => {});
  }, []);

  function clearScheduledAlarm() {
    const alarm = scheduledAlarm.current;
    scheduledAlarm.current = null;
    releaseAlarm(alarm);
  }

  function reset(patch?: Pick<Partial<WorkoutTimerState>, "mode" | "durationDraft">) {
    clearScheduledAlarm();
    const current = readTimer();
    if (current.mode === "rest" && current.startedAt !== null) push.cancel(current.startedAt);
    writeTimer({ ...current, ...patch, startedAt: null, elapsedMs: 0 });
  }

  function changeMode(next: TimerMode) {
    reset({ mode: next });
  }

  function changeDuration(unit: DurationUnit, input: string) {
    const value = input.normalize("NFKC");
    if (!/^\d*$/.test(value)) return;
    reset({ durationDraft: { ...readTimer().durationDraft, [unit]: value } });
  }

  function toggle(timestamp: number) {
    const current = readTimer();
    const passed = workoutTimerElapsed(current, timestamp);
    const target = restDurationMs(current.durationDraft);
    const rest = current.mode === "rest";
    if (rest && target && passed >= target) {
      reset();
      return;
    }
    if (rest && !target) return;
    if (current.startedAt !== null) {
      clearScheduledAlarm();
      if (rest) push.cancel(current.startedAt);
      writeTimer({ ...current, elapsedMs: passed, startedAt: null });
      return;
    }
    if (rest) {
      try {
        // When mixing is supported, queue only the chime for the deadline. Do not
        // start an HTML media track or take exclusive audio focus at countdown start.
        if (allowTimerAudioMixing(navigator)) {
          const context = audioContext.current ??= new AudioContext();
          if (context.state !== "running") void context.resume().catch(() => {});
          scheduledAlarm.current = { ...scheduleRestChime(context, target - passed), startedAt: timestamp };
        }
      } catch {
        // Keep the visual timer available when audio is unsupported.
      }
      timerStartedHere.current = timestamp;
      try { window.sessionStorage.setItem(audioOwnerKey, String(timestamp)); }
      catch { /* The active tab remains the alarm owner without storage. */ }
      push.schedule(timestamp, timestamp + target - passed);
    }
    setNow(timestamp);
    writeTimer({ ...current, startedAt: timestamp });
  }

  async function enableNotifications() {
    try {
      if (push.available) {
        if (await push.enable()) {
          const current = readTimer();
          if (current.mode === "rest" && current.startedAt !== null) {
            const endsAt = current.startedAt + restDurationMs(current.durationDraft) - current.elapsedMs;
            if (endsAt > Date.now()) push.schedule(current.startedAt, endsAt);
          }
        }
        setNotificationPermission(restNotificationPermission());
      } else setNotificationPermission(await enableRestNotifications());
    } catch {
      setNotificationPermission(restNotificationPermission());
    }
  }

  return <TimerContext.Provider value={{ mode, durationDraft, seconds, validDuration, running, finished, hasElapsed: elapsedMs > 0, changeMode, changeDuration, reset: () => reset(), toggle, notificationPermission, enableNotifications, pushAvailable: push.available, pushSubscribed: push.subscribed, pushStatus: push.status }}>
    {children}
  </TimerContext.Provider>;
}

export function WorkoutTimer({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const timer = useContext(TimerContext);
  if (!timer) return null;
  const { mode, durationDraft, seconds, validDuration, running, finished, hasElapsed, changeMode, changeDuration, reset, toggle, notificationPermission, enableNotifications, pushAvailable, pushSubscribed, pushStatus } = timer;
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
        {restMode && (pushAvailable ? !pushSubscribed && notificationPermission !== "denied" : notificationPermission === "default") &&
          <Button type="button" size="small" variant="secondary" className="justify-self-start" onClick={() => void enableNotifications()}>{pushAvailable ? "閉じている間の終了通知を許可" : "終了通知を許可"}</Button>}
        {restMode && (pushSubscribed || !pushAvailable && notificationPermission === "granted") && <p className="text-xs text-[var(--muted)]">{pushSubscribed ? "閉じている間の終了通知を許可済み" : "終了通知を許可済み"}</p>}
        {restMode && pushStatus === "scheduled" && running && <p role="status" className="text-xs text-[var(--sage-deep)]">終了通知を予約しました。</p>}
        {restMode && pushStatus === "error" && <p role="status" className="text-xs text-[var(--coral)]">終了通知の接続に失敗しました。</p>}
        {restMode && !pushSubscribed && <p className="text-xs leading-5 text-[var(--muted)]">端末がブラウザーを停止した場合、開き直すと終了を確認できます。</p>}
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
