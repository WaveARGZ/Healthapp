"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { currentFirebaseUser } from "@/lib/auth/firebase-session";
import { isFirebaseSelected } from "@/lib/firebase/config";
import { isTestEnvironment } from "@/lib/cloud/config";

type Timer = { running: boolean; rest: boolean; startedAt: number | null; durationMs: number; elapsed: number };
type Status = "off" | "preparing" | "ready" | "subscribing" | "enabled" | "saving" | "scheduled" | "failed" | "unavailable";
const configuredUrl = process.env.NEXT_PUBLIC_BODYMAKE_TIMER_PUSH_URL ?? "";
const apiUrl = configuredUrl === "https://bodymake-timer-push.ajimo023.workers.dev" ? configuredUrl : "";
const storagePrefix = "bodymake.timerPush.v1.";
function applicationKey(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function nextIdentity() {
  let device = sessionStorage.getItem(storagePrefix + "device");
  if (!device) {
    const data = crypto.getRandomValues(new Uint8Array(32));
    device = btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    sessionStorage.setItem(storagePrefix + "device", device);
  }
  const version = Number(sessionStorage.getItem(storagePrefix + "version") || 0) + 1;
  if (!Number.isSafeInteger(version)) throw Error("invalid_version");
  sessionStorage.setItem(storagePrefix + "version", String(version));
  return { device, version };
}
async function updateTimer(payload: Record<string, unknown>) {
  const user = await currentFirebaseUser();
  const token = await user.getIdToken();
  const result = await fetch(`${apiUrl}/v1/update`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
  if (!result.ok) throw Error("reservation_failed");
}

export function useTimerPush(timer: Timer) {
  const [status, setStatus] = useState<Status>("off");
  const [enabled, setEnabled] = useState(false);
  const ready = useRef<{ registration: ServiceWorkerRegistration; key: Uint8Array } | null>(null);
  const operation = useRef(0);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      if (!apiUrl || !isFirebaseSelected || isTestEnvironment || !("serviceWorker" in navigator) || !("PushManager" in window)) { setStatus("unavailable"); return; }
      setStatus("preparing");
      const response = await fetch(`${apiUrl}/v1/config`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw Error("config_failed");
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || !("publicKey" in value) || typeof value.publicKey !== "string" || !/^[A-Za-z0-9_-]{87}$/.test(value.publicKey)) throw Error("config_invalid");
      const registration = await navigator.serviceWorker.register("/timer-push-worker.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      if (!active) return;
      // A reload resets the on-page timer. Cancel any old reservation for this tab.
      if (sessionStorage.getItem(storagePrefix + "device")) await updateTimer({ ...nextIdentity(), kind: "cancel" });
      if (active) { ready.current = { registration, key: applicationKey(value.publicKey) }; setStatus("ready"); }
    }).catch(() => { if (active) setStatus("failed"); });
    return () => { active = false; };
  }, []);

  const enable = useCallback(async () => {
    const current = ready.current;
    if (!current) { setStatus("unavailable"); return; }
    try {
      nextIdentity(); // Fail before subscription when session storage is blocked.
      setStatus("subscribing");
      // Called directly from the user's click; Safari presents the permission dialog.
      const subscription = await current.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: current.key as BufferSource });
      if (!subscription.endpoint) throw Error("subscription_failed");
      setEnabled(true); setStatus("enabled");
    } catch { setStatus("failed"); }
  }, []);

  const disable = useCallback(async () => {
    setEnabled(false);
    const current = ++operation.current;
    let failed = false;
    try {
      const identity = nextIdentity();
      await updateTimer({ ...identity, kind: "cancel" });
    } catch { failed = true; }
    try {
      const subscription = await ready.current?.registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    } catch { failed = true; }
    if (current === operation.current) setStatus(failed ? "failed" : "ready");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const current = ++operation.current;
    void Promise.resolve().then(async () => {
      if (current !== operation.current) return;
      setStatus("saving");
      const identity = nextIdentity();
      const active = timer.rest && timer.running && timer.startedAt !== null;
      const deadline = active ? timer.startedAt! + timer.durationMs - timer.elapsed : 0;
      if (!active || deadline <= Date.now()) {
        await updateTimer({ ...identity, kind: "cancel" });
        if (current === operation.current) setStatus("enabled");
        return;
      }
      const subscription = await ready.current?.registration.pushManager.getSubscription();
      if (!subscription?.endpoint) throw Error("subscription_missing");
      await updateTimer({ ...identity, kind: "schedule", deadline, endpoint: subscription.endpoint });
      if (current === operation.current) setStatus("scheduled");
    }).catch(() => { if (current === operation.current) setStatus("failed"); });
  }, [enabled, timer.rest, timer.running, timer.startedAt, timer.durationMs, timer.elapsed]);

  return { status, enabled, enable, disable };
}
