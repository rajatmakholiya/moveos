'use client';

import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastActiveElement = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    lastActiveElement.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => panelRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = originalOverflow;
      if (lastActiveElement.current instanceof HTMLElement) {
        lastActiveElement.current.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 90 || info.velocity.y > 500) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation">
          <motion.button
            aria-label="Close dialog"
            className="absolute inset-0 bg-stone-900/35 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            type="button"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.25 }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            onDragEnd={handleDragEnd}
            className="relative max-h-[88vh] w-full max-w-[480px] overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-[0_-10px_32px_rgba(0,0,0,0.16)] focus:outline-none"
          >
            <div className="flex justify-center pt-3">
              <div className="h-1.5 w-12 rounded-full bg-[var(--stone-300)]" />
            </div>
            {title ? <h2 className="px-5 pt-4 font-display text-heading text-[var(--text-primary)]">{title}</h2> : null}
            <div className="max-h-[calc(88vh-48px)] overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
