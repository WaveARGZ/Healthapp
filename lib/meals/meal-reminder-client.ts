import { currentFirebaseUser } from "@/lib/auth/firebase-session";
import { isSharedTestEnvironment } from "@/lib/cloud/config";
import { isFirebaseSelected } from "@/lib/firebase/config";

const workerUrl = process.env.NEXT_PUBLIC_BODYMAKE_TEST_MEAL_REMINDER_ORIGIN ?? "";
const deviceKey = "bodymake.meal-reminder-device.v1";
const ownerKey = "bodymake.meal-reminder-owner.v1";
const scope = "/settings/";

export const mealReminderConfigured = isSharedTestEnvironment && isFirebaseSelected
  && /^https:\/\/bodymake-test-meal-reminders\.[a-z0-9-]+\.workers\.dev$/.test(workerUrl);

export function supportsMealReminders() {
  return mealReminderConfigured && window.location.origin === "https://bodymake-test-14a3f.web.app"
    && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registrationRequest(path: string, options?: RequestInit, ownerUid?: string) {
  const user = await currentFirebaseUser();
  if (ownerUid && user.uid !== ownerUid) throw new Error("meal_reminder_account_changed");
  const token = await user.getIdToken();
  const headers = new Headers(options?.headers);
  headers.set("Authorization", "Bearer " + token);
  const response = await fetch(workerUrl + path, {
    ...options, headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("meal_reminder_request_failed");
  return response;
}

async function waitForActivation(registration: ServiceWorkerRegistration) {
  if (registration.active) return;
  const worker = registration.installing ?? registration.waiting;
  if (!worker) throw new Error("meal_reminder_worker_unavailable");
  await new Promise<void>((resolve, reject) => {
    const signal = AbortSignal.timeout(8000);
    function finish(error?: Error) {
      worker?.removeEventListener("statechange", check);
      signal.removeEventListener("abort", timedOut);
      if (error) reject(error);
      else resolve();
    }
    function timedOut() {
      finish(new Error("meal_reminder_worker_timeout"));
    }
    function check() {
      if (worker?.state === "activated") finish();
      else if (worker?.state === "redundant") finish(new Error("meal_reminder_worker_unavailable"));
    }
    signal.addEventListener("abort", timedOut, { once: true });
    worker.addEventListener("statechange", check);
    check();
  });
}

export async function prepareMealReminders() {
  const user = await currentFirebaseUser();
  const response = await fetch(workerUrl + "/public-key", {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("meal_reminder_config_failed");
  const { publicKey } = await response.json() as { publicKey?: string };
  if (typeof publicKey !== "string" || !/^[\w-]{87}$/.test(publicKey)) throw new Error("meal_reminder_key_invalid");
  const decoded = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/") + "=");
  const registration = await navigator.serviceWorker.register("/meal-reminder-worker.js", { scope });
  await waitForActivation(registration);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && localStorage.getItem(ownerKey) !== user.uid) {
    if (!await subscription.unsubscribe()) throw new Error("meal_reminder_unsubscribe_failed");
    subscription = null;
    localStorage.removeItem(deviceKey);
  }
  const deviceId = localStorage.getItem(deviceKey);
  let enabled = false;
  if (deviceId && subscription) {
    const status = await registrationRequest("/meal-reminder?" + new URLSearchParams({ deviceId }), undefined, user.uid);
    enabled = (await status.json() as { enabled?: boolean }).enabled === true;
  }
  return {
    enabled,
    enable: async () => {
      const previousOwner = localStorage.getItem(ownerKey);
      const id = (previousOwner === user.uid ? localStorage.getItem(deviceKey) : null) ?? crypto.randomUUID();
      localStorage.setItem(deviceKey, id);
      localStorage.setItem(ownerKey, user.uid);
      // Keep the permission request in the click handler's user activation.
      const notificationSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: Uint8Array.from(decoded, c => c.charCodeAt(0)),
      });
      await registrationRequest("/meal-reminder", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: id, subscription: notificationSubscription.toJSON() }),
      }, user.uid);
    },
  };
}

export async function stopMealReminders() {
  if (!supportsMealReminders()) return;
  const deviceId = localStorage.getItem(deviceKey);
  if (!deviceId) return;
  const [server, browser] = await Promise.allSettled([
    registrationRequest("/meal-reminder", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId }),
    }, localStorage.getItem(ownerKey) ?? undefined),
    navigator.serviceWorker.getRegistration(scope).then(async registration => {
      if (registration?.scope !== new URL(scope, window.location.origin).href) return;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && !await subscription.unsubscribe()) throw new Error("meal_reminder_unsubscribe_failed");
    }),
  ]);
  if (server.status === "rejected" && browser.status === "rejected") throw new Error("meal_reminder_stop_failed");
  localStorage.removeItem(deviceKey);
  localStorage.removeItem(ownerKey);
}
