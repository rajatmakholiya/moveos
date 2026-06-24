'use client';

import { useState } from 'react';
import type { Lang } from '../lib/i18n';
import type { SeatType, Trip } from '../lib/pahadi';
import { copy, formatCurrency, formatTime } from '../lib/utils';
import { Button } from './ui/Button';
import { Pill } from './ui/Pill';

export function TripCard({ trip, lang, onBook }: { trip: Trip; lang: Lang; onBook: (trip: Trip, seatType?: SeatType) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isDisabled = trip.status === 'DEPARTED' || trip.status === 'CANCELLED';
  const soldOut = trip.frontSeatsLeft + trip.backSeatsLeft <= 0;

  return (
    <article className={['rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-card', isDisabled ? 'opacity-60' : ''].join(' ')}>
      <button type="button" onClick={() => setExpanded((current) => !current)} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-title text-[var(--text-primary)]">{formatTime(trip.departureAt, lang)}</p>
            <p className="mt-1 text-small text-[var(--text-secondary)]">
              {trip.from} → {trip.to}
            </p>
          </div>
          <div className="text-right">
            {trip.driverName ? <p className="font-medium text-[var(--text-primary)]">{trip.driverName}</p> : null}
            {trip.organizationName ? (
              <p className="text-small font-medium text-[var(--brand)]">{trip.organizationName}</p>
            ) : null}
            {trip.driverRating !== null || trip.driverTrips !== null ? (
              <p className="text-small text-[var(--text-secondary)]">
                {trip.driverRating !== null ? `★ ${trip.driverRating.toFixed(1)}` : null}
                {trip.driverRating !== null && trip.driverTrips !== null ? ' · ' : null}
                {trip.driverTrips !== null ? `${trip.driverTrips} ${copy(lang, 'trips', 'यात्राएं')}` : null}
              </p>
            ) : null}
            {trip.vehicleName || trip.vehicleNumber ? <p className="text-small text-[var(--text-secondary)]">{[trip.vehicleName, trip.vehicleNumber].filter(Boolean).join(' · ')}</p> : null}
          </div>
        </div>
      </button>
      <div className="my-4 h-px bg-[var(--border)]" />
      <SeatLine
        label={copy(lang, 'Front', 'आगे')}
        fare={trip.frontFarePaise}
        seats={trip.frontSeatsLeft}
        lang={lang}
        soldOutLabel={copy(lang, 'Sold out', 'बिक गई')}
      />
      <SeatLine
        label={copy(lang, 'Back', 'पीछे')}
        fare={trip.backFarePaise}
        seats={trip.backSeatsLeft}
        lang={lang}
        soldOutLabel={copy(lang, 'Sold out', 'बिक गई')}
      />
      {expanded ? (
        <div className="mt-4 rounded-xl bg-[var(--surface-raised)] p-4 text-small text-[var(--text-secondary)]">
          {trip.pickupPoint ? <p>{copy(lang, 'Pickup', 'पिकअप')}: {trip.pickupPoint}</p> : null}
          {trip.notes ? <p className="mt-2">{trip.notes}</p> : null}
        </div>
      ) : null}
      {trip.status === 'CANCELLED' ? <Pill color="red" label={copy(lang, 'Cancelled by driver', 'ड्राइवर ने रद्द की')} /> : null}
      {trip.status === 'DEPARTED' ? <Pill color="stone" label={copy(lang, 'Trip departed', 'यात्रा रवाना')} /> : null}
      {soldOut && trip.status === 'OPEN' ? <Pill color="stone" label={copy(lang, 'Fully booked', 'पूरी बुक')} /> : null}
      <Button className="mt-4" fullWidth disabled={isDisabled || soldOut} onClick={() => onBook(trip)}>
        {copy(lang, 'Book seat', 'सीट बुक करें')} →
      </Button>
    </article>
  );
}

function SeatLine({ label, fare, seats, lang, soldOutLabel }: { label: string; fare: number; seats: number; lang: Lang; soldOutLabel: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 text-body">
      <span className={seats <= 0 ? 'text-[var(--text-hint)] line-through' : 'text-[var(--text-primary)]'}>
        {label}: {formatCurrency(fare)}
      </span>
      {seats <= 0 ? (
        <Pill color="stone" label={soldOutLabel} />
      ) : seats < 2 ? (
        <span className="animate-pulse rounded-full bg-[var(--amber-50)] px-3 py-1 text-small font-medium text-[var(--amber-700)]">
          {copy(lang, `Only ${seats} left`, `सिर्फ ${seats} बची`)}
        </span>
      ) : (
        <span className="text-small text-[var(--text-secondary)]">
          {seats} {copy(lang, 'seats left', 'सीटें बची')}
        </span>
      )}
    </div>
  );
}
