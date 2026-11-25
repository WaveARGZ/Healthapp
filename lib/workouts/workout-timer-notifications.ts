export function restNotificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" || !("serviceWorker" in navigator) ? "unsupported" : Notification.permission;
}

export async function enableRestNotifications() {
  if (restNotificationPermission() === "unsupported") return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "granted") await restNotificationRegistration();
  return permission;
}

async function restNotificationRegistration() {
  const url = new URL("../workout-timer-notifications.js", window.location.href);
  const registration = await navigator.serviceWorker.register(url);
  return registration.active ? registration : navigator.serviceWorker.ready;
}

export async function showRestNotification(startedAt: number) {
  if (restNotificationPermission() !== "granted") return;
  const registration = await restNotificationRegistration();
  await registration.showNotification("休憩時間が終了しました", {
    body: "BodyMakeのタイマーを確認してください。",
    tag: `bodymake-rest-${startedAt}`,
  });
}
