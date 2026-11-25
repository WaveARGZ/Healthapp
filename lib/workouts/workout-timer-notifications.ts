import { currentFirebaseUser } from "@/lib/auth/firebase-session";
import { isSharedTestEnvironment } from "@/lib/cloud/config";

const testAppOrigin = "https://bodymake-test-14a3f.web.app";
const pushOrigin = process.env.NEXT_PUBLIC_BODYMAKE_TEST_TIMER_PUSH_ORIGIN ?? "";
const deviceKey = "bodymake.rest-notification-device.v1";

const hasRestPushConfiguration = isSharedTestEnvironment
  && /^https:\/\/bodymake-test-rest-notifications\.[a-z0-9-]+\.workers\.dev$/.test(pushOrigin);

export function restNotificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" || !("serviceWorker" in navigator) ? "unsupported" : Notification.permission;
}

async function restNotificationRegistration() {
  const registration = await navigator.serviceWorker.register("/workout-timer-notifications.js");
  return registration.active ? registration : navigator.serviceWorker.ready;
}

export type RestPushChannel = {
  manager: PushManager;
  applicationServerKey: Uint8Array<ArrayBuffer>;
};

export async function prepareRestPush(): Promise<RestPushChannel | null> {
  if (!hasRestPushConfiguration || window.location.origin !== testAppOrigin || !("PushManager" in window)
      || restNotificationPermission() === "unsupported") return null;
  const [registration, result] = await Promise.all([
    restNotificationRegistration(),
    fetch(`${pushOrigin}/public-key`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) }),
  ]);
  if (!result.ok) throw new Error("push_setup_unavailable");
  const { publicKey } = await result.json() as { publicKey?: string };
  if (!publicKey || !/^[\w-]{87}$/.test(publicKey)) throw new Error("push_key_invalid");
  const encoded = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const applicationServerKey = Uint8Array.from(atob(encoded + "="), (character) => character.charCodeAt(0));
  return { manager: registration.pushManager, applicationServerKey };
}

export async function changeRestPushSchedule(
  startedAt: number,
  schedule?: { endsAt: number; subscription: PushSubscription },
) {
  if (!hasRestPushConfiguration || window.location.origin !== testAppOrigin) return;
  let deviceId = window.localStorage.getItem(deviceKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem(deviceKey, deviceId);
  }
  const token = await (await currentFirebaseUser()).getIdToken();
  const result = await fetch(`${pushOrigin}/rest-timer`, {
    method: schedule ? "PUT" : "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, startedAt, endsAt: schedule?.endsAt, subscription: schedule?.subscription.toJSON() }),
    keepalive: true, redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (!result.ok) throw new Error("push_schedule_unavailable");
}
