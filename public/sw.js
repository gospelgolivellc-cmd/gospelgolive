// Minimal Web Push service worker — shows the notification the server sent
// and focuses/opens the relevant page on click. No caching/offline support;
// this app doesn't need one, so scope this file to push only.

self.addEventListener('push', (event) => {
  let data = { title: 'GospelGoLive', body: '', url: '/' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // Ignore malformed payloads rather than throwing inside the push handler.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/images/logo_icon.png',
      badge: '/images/logo_icon.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
