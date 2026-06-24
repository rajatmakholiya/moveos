'use client';

import type { Lang } from '../lib/i18n';
import type { Booking } from '../lib/pahadi';
import { copy, formatCurrency, formatLongDate, formatTime } from '../lib/utils';
import { Pill } from './ui/Pill';

export function TicketView({ booking, lang }: { booking: Booking; lang: Lang }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-card">
      <header className="bg-[var(--brand)] p-5 text-white">
        <p className="font-display text-heading">✓ {copy(lang, 'Booking confirmed!', 'बुकिंग कन्फर्म हो गई!')}</p>
        <p className="mt-1 font-mono text-small text-[var(--teal-100)]">{booking.code}</p>
      </header>
      <section className="p-5">
        <h2 className="font-display text-title text-[var(--text-primary)]">
          {booking.from} → {booking.to}
        </h2>
        <p className="mt-1 text-small text-[var(--text-secondary)]">
          {formatLongDate(booking.departureAt, lang)} · {formatTime(booking.departureAt, lang)}
        </p>
        <div className="mt-5 space-y-3 text-body">
          <Row label={booking.seatType === 'FRONT' ? copy(lang, 'Front seat', 'आगे की सीट') : copy(lang, 'Back seat', 'पीछे की सीट')} value={formatCurrency(booking.totalPaise)} />
          <Row label={booking.driverName} value={`${booking.vehicleName} ${booking.vehicleNumber}`} />
          <Row label={copy(lang, 'Pickup', 'पिकअप')} value={booking.pickupPoint} />
        </div>
        <div className="mt-5">
          <Pill color={booking.status === 'CONFIRMED' ? 'teal' : 'stone'} label={booking.status} />
          <span className="ml-2 text-small text-[var(--text-secondary)]">
            · {booking.paymentMethod === 'CASH' ? copy(lang, 'Cash at departure', 'प्रस्थान पर नकद') : copy(lang, 'UPI paid', 'UPI भुगतान')}
          </span>
        </div>
      </section>
      <section className="border-t-2 border-dashed border-[var(--stone-300)] p-5 text-body">
        <Row label={copy(lang, 'Passenger', 'यात्री')} value={booking.passengerName} />
        <div className="mt-3">
          <Row label={copy(lang, 'Phone', 'फोन')} value={booking.phone} />
        </div>
      </section>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-right font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
