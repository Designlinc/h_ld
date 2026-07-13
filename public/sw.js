// public/sw.js — Service Worker for push notifications
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Solful';
  const options = {
    body:  data.body  || '',
    icon:  data.icon  || '/icon-192.png',
    badge: '/icon-192.png',
    data:  { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open Square' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    requireInteraction: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url;
  if (url) {
    event.waitUntil(clients.openWindow(url));
  }
});
