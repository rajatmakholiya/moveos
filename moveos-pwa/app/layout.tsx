import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AuthProvider } from '../lib/AuthContext';
import { InstallPromptProvider } from '../lib/InstallPromptContext';
import { LanguageProvider } from '../lib/LanguageContext';
import { ToastProvider } from '../lib/ToastContext';
import { InstallBanner } from '../components/InstallBanner';
import { SplashGate } from '../components/SplashGate';
import { Toast } from '../components/ui/Toast';
import { BottomNav } from '../components/BottomNav';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/OfflineBanner';
import { DevServiceWorkerReset } from '../components/DevServiceWorkerReset';

export const metadata: Metadata = {
  title: 'Pahadi Rides',
  description: 'Book available hill taxi seats from live route and trip inventory',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Pahadi Rides',
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0F6E56',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <LanguageProvider>
          <AuthProvider>
            <ToastProvider>
              <InstallPromptProvider>
                <SplashGate>
                  <ErrorBoundary>
                    <main className="mx-auto min-h-screen w-full max-w-[480px] bg-[var(--surface-raised)] pb-[env(safe-area-inset-bottom)]">
                      {children}
                    </main>
                  </ErrorBoundary>
                </SplashGate>
                <OfflineBanner />
                <BottomNav />
                <InstallBanner />
                <Toast />
                <DevServiceWorkerReset />
              </InstallPromptProvider>
            </ToastProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
