'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Lang } from './i18n';

type LanguageContextValue = {
  lang: Lang;
  toggleLang: () => void;
  setLang: (lang: Lang) => void;
};

const STORAGE_KEY = 'pahadi_lang';

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  toggleLang: () => undefined,
  setLang: () => undefined,
});

function isLang(value: string | null): value is Lang {
  return value === 'en' || value === 'hi';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [hasLoadedSavedLang, setHasLoadedSavedLang] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) {
      setLangState(saved);
    }
    setHasLoadedSavedLang(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedSavedLang) {
      return;
    }

    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [hasLoadedSavedLang, lang]);

  const value = useMemo<LanguageContextValue>(() => {
    const setLang = (next: Lang) => setLangState(next);
    const toggleLang = () => setLangState((current) => (current === 'en' ? 'hi' : 'en'));
    return { lang, toggleLang, setLang };
  }, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
