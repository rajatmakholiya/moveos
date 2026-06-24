import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from '@/types';
import { translations, type TxKey } from '@/lib/i18n';

const STORAGE_KEY = 'pahadi_lang';

type LanguageStore = {
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
  hydrate: () => Promise<void>;
  tx: (key: TxKey) => string;
};

export const useLanguageStore = create<LanguageStore>((set, get) => ({
  lang: 'en',

  hydrate: async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'hi') {
      set({ lang: stored });
    }
  },

  setLang: async (lang: Lang) => {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
    set({ lang });
  },

  tx: (key: TxKey) => {
    const { lang } = get();
    return (translations[lang][key] as string) ?? (translations.en[key] as string);
  },
}));
