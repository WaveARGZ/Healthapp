const meals = { breakfast: "朝食", lunch: "昼食", dinner: "夕食" };
const mealTag = /^bodymake-meal-\d{4}-\d{2}-\d{2}-(breakfast|lunch|dinner)$/;

self.addEventListener("push", event => {
  let tag;
  try { tag = event.data?.json().notification?.tag; } catch { return; }
  const match = typeof tag === "string" ? tag.match(mealTag) : null;
  if (!match) return;
  event.waitUntil(self.registration.showNotification("BodyMake", {
    body: meals[match[1]] + "を登録しましょう。",
    icon: "/bodymake-icon-192.png",
    badge: "/bodymake-icon-192.png",
    tag,
    silent: false,
  }));
});

self.addEventListener("notificationclick", event => {
  if (!mealTag.test(event.notification.tag)) return;
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL("/meals/", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => client.url === url);
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  })());
});
