'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/AuthContext';
import { copy } from '../lib/utils';
import { useLanguage } from '../lib/LanguageContext';

const hiddenPrefixes = ['/onboarding', '/trips/'];

export function BottomNav() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const { user } = useAuth();

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  const tabs =
    user?.role === 'DRIVER'
      ? [
          { href: '/driver', label: copy(lang, 'Home', 'होम'), icon: '⌂' },
          { href: '/driver/offerings', label: copy(lang, 'Offerings', 'ऑफरिंग'), icon: '▦' },
          { href: '/driver/organizations', label: copy(lang, 'Fleet', 'फ्लीट'), icon: '◉' },
          { href: '/bookings', label: copy(lang, 'Bookings', 'बुकिंग'), icon: '▤' },
          { href: '/profile', label: copy(lang, 'Profile', 'प्रोफाइल'), icon: '○' },
        ]
      : [
          { href: '/', label: copy(lang, 'Home', 'होम'), icon: '⌂' },
          { href: '/bookings', label: copy(lang, 'My Trips', 'मेरी यात्रा'), icon: '▤' },
          { href: '/profile', label: copy(lang, 'Profile', 'प्रोफाइल'), icon: '○' },
        ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
      <div className="flex h-16">
        {tabs.map((tab) => {
          const active = isTabActive(pathname, tab.href);
          return (
            <Link key={tab.href} href={tab.href} className={['relative flex flex-1 flex-col items-center justify-center gap-0.5 text-micro font-medium', active ? 'text-[var(--brand)]' : 'text-[var(--stone-500)]'].join(' ')}>
              <span className="text-heading leading-none" aria-hidden="true">
                {tab.icon}
              </span>
              <span>{tab.label}</span>
              {active ? <motion.span layoutId="tab-indicator" className="absolute bottom-1 h-1 w-1 rounded-full bg-[var(--brand)]" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function isTabActive(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/';
  }

  if (href === '/driver') {
    return pathname === '/driver';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
