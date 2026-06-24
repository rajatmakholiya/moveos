'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '../lib/LanguageContext';
import { copy } from '../lib/utils';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export function OfflineBanner() {
  const online = useNetworkStatus();
  const { lang } = useLanguage();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (online) {
      setDismissed(false);
    }
  }, [online]);

  if (online || dismissed) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[80] mx-auto max-w-[480px] px-3 pt-3">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--amber-50)] px-4 py-3 text-small font-medium text-[var(--stone-800)] shadow-card">
        <span>{copy(lang, 'No internet connection - some features unavailable', 'इंटरनेट कनेक्शन नहीं है - कुछ सुविधाएं उपलब्ध नहीं हैं')}</span>
        <button type="button" onClick={() => setDismissed(true)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)]" aria-label={copy(lang, 'Dismiss', 'बंद करें')}>
          ×
        </button>
      </div>
    </div>
  );
}
