/* eslint-disable no-undef */
// Firebase Cloud Messaging service worker for background push.
// The Firebase config is passed in via the registration query string
// (see lib/push.ts) because service workers cannot read build-time env vars.
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

try {
  const params = new URLSearchParams(self.location.search);
  const rawConfig = params.get('config');
  if (rawConfig) {
    firebase.initializeApp(JSON.parse(rawConfig));
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const title = (payload.notification && payload.notification.title) || 'Pahadi Rides';
      const body = (payload.notification && payload.notification.body) || '';
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        data: payload.data || {},
      });
    });
  }
} catch (err) {
  // Missing/invalid config — push silently disabled.
}
