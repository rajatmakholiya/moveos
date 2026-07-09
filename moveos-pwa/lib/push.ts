import { api } from './api';

/**
 * FCM web-push token registration. Entirely optional: when the
 * NEXT_PUBLIC_FIREBASE_* env vars are absent (Firebase not set up yet), every
 * function here is a silent no-op — the app works fine without push.
 */

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
};

function readFirebaseConfig(): FirebaseWebConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !messagingSenderId || !appId) {
    return null;
  }
  return {
    apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    projectId,
    messagingSenderId,
    appId,
  };
}

export function isPushConfigured(): boolean {
  return readFirebaseConfig() !== null && typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Ask for notification permission, mint an FCM token, and register it with
 * the backend. Safe to call repeatedly (token registration is idempotent).
 */
export async function registerPushToken(authToken?: string): Promise<boolean> {
  const config = readFirebaseConfig();
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!config || !vapidKey || typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const { initializeApp, getApps } = await import('firebase/app');
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return false;

    const app = getApps()[0] ?? initializeApp(config);
    const messaging = getMessaging(app);

    // The messaging SW receives its config via the query string — it cannot
    // read build-time env vars itself.
    const swUrl = `/firebase-messaging-sw.js?config=${encodeURIComponent(JSON.stringify(config))}`;
    const registration = await navigator.serviceWorker.register(swUrl);

    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return false;

    await api.post('/notifications/device-token', { token, platform: 'web' }, authToken);
    return true;
  } catch {
    // Push is best-effort — never break the app over it.
    return false;
  }
}
