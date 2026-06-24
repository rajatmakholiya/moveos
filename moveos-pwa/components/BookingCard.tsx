'use client';

import type { Lang } from '../lib/i18n';
import type { Booking } from '../lib/pahadi';
import { copy, formatCurrency, formatDate, formatTime } from '../lib/utils';
import { Button } from './ui/Button';
import { Pill } from './ui/Pill';

export function BookingCard({ booking, lang, onView, actionLabel }: { booking: Booking; lang: Lang; onView: (booking: Booking) => void; actionLabel?: string }) {
  const pillColor = booking.status === 'CONFIRMED' ? 'teal' : booking.status === 'PENDING' ? 'amber' : 'stone';

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-heading text-[var(--text-primary)]">
            {booking.from} → {booking.to}
          </h2>
          <p className="mt-0.5 text-small text-[var(--text-secondary)]">
            {formatDate(booking.departureAt, lang)} · {formatTime(booking.departureAt, lang)}
          </p>
        </div>
        <Pill color={pillColor} label={statusLabel(booking.status, lang)} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--text-primary)]">{booking.passengerName}</p>
          <p className="mt-0.5 text-small text-[var(--text-secondary)]">
            {booking.seatType === 'FRONT' ? copy(lang, 'Front seat', 'आगे की सीट') : copy(lang, 'Back seat', 'पीछे की सीट')} · {formatCurrency(booking.totalPaise)}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-[var(--surface-inset)] px-2 py-1 font-mono text-[11px] text-[var(--text-secondary)]">{booking.code}</span>
      </div>
      <p className="mt-2 text-small text-[var(--text-secondary)]">{copy(lang, 'Driver', 'ड्राइवर')}: {booking.driverName}</p>
      <div className="mt-4 flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => onView(booking)}>
          {actionLabel ?? copy(lang, 'View ticket', 'टिकट देखें')} →
        </Button>
      </div>
    </article>
  );
}

function statusLabel(status: Booking['status'], lang: Lang) {
  if (status === 'PENDING') {
    return copy(lang, 'Pending', 'बाकी');
  }
  if (status === 'CANCELLED') {
    return copy(lang, 'Cancelled', 'रद्द');
  }
  if (status === 'COMPLETED') {
    return copy(lang, 'Completed', 'पूर्ण');
  }
  return copy(lang, 'Confirmed', 'कन्फर्म');
}
