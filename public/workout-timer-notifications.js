self.addEventListener("notificationclick", (event) => {
  if (!event.notification.tag.startsWith("bodymake-rest-")) return;
  event.notification.close();
  const workouts = new URL("workouts/", self.registration.scope).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const tab = tabs.find((client) => client.url === workouts);
    if (tab) await tab.focus();
    else await self.clients.openWindow(workouts);
  })());
});
self.addEventListener("push", (event) => {
  let tag;
  try { tag = event.data?.json().notification?.tag; } catch { /* Use the standard rest alert. */ }
  event.waitUntil(self.registration.showNotification("休憩時間が終了しました", {
    body: "BodyMakeのタイマーを確認してください。",
    tag: typeof tag === "string" && /^bodymake-rest-\d+$/.test(tag) ? tag : "bodymake-rest-push",
  }));
});
