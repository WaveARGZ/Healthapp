/* Notifications contain no meal, exercise, account, or health information. */
self.addEventListener('push', (event) => {
  event.waitUntil(self.registration.showNotification('BodyMake', {
    body: '休憩タイマーが終了しました。',
    icon: '/bodymake-icon-192.png',
    badge: '/bodymake-icon-192.png',
    tag: 'bodymake-rest-timer',
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.focus();
    return self.clients.openWindow('/workouts/');
  })());
});
