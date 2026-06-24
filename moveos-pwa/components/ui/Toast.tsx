'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useToast, type ToastTone } from '../../lib/ToastContext';

const toneClasses: Record<ToastTone, string> = {
  success: 'border-[var(--teal-100)] bg-[var(--brand-light)] text-[var(--teal-900)]',
  error: 'border-red-200 bg-[var(--red-50)] text-[var(--red-600)]',
  info: 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]',
};

export function Toast() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] mx-auto flex w-full max-w-[480px] flex-col gap-2 px-4">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            type="button"
            className={[
              'pointer-events-auto relative overflow-hidden rounded-xl border px-4 py-3 text-left text-small font-medium shadow-card',
              toneClasses[toast.tone],
            ].join(' ')}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
            onClick={() => dismiss(toast.id)}
          >
            {toast.message}
            <span className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-current opacity-30 [animation:toast-progress_3s_linear_forwards]" />
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
