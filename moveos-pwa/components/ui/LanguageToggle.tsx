'use client';

import { useLanguage } from '../../lib/LanguageContext';

export function LanguageToggle() {
  const { lang, toggleLang } = useLanguage();

  return (
    <button
      type="button"
      aria-label="Toggle language"
      onClick={toggleLang}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-small font-medium text-[var(--text-primary)] shadow-card transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
    >
      <span className={lang === 'en' ? 'text-[var(--brand)]' : 'text-[var(--text-secondary)]'}>EN</span>
      <span className="h-4 w-px bg-[var(--border)]" />
      <span className={lang === 'hi' ? 'text-[var(--brand)]' : 'text-[var(--text-secondary)]'}>हिं</span>
    </button>
  );
}
