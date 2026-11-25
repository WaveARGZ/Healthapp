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
