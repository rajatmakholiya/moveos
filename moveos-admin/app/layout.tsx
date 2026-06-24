import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AdminAuthProvider } from '@/lib/AuthContext';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MoveOS Admin',
  description: 'MoveOS fleet & organization management portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} h-screen overflow-hidden`}>
        <AdminAuthProvider>
          {children}
          <Toaster richColors position="top-right" />
        </AdminAuthProvider>
      </body>
    </html>
  );
}
