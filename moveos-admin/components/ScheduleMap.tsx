'use client';

import { useMemo } from 'react';
import type { TrackedTrip, TrackingStop } from '@/lib/api';

type LatLng = { lat: number; lng: number };

function hasCoord(s: TrackingStop): s is TrackingStop & { lat: number; lng: number } {
  return s.lat != null && s.lng != null;
}

const pt = (p: LatLng) => `${p.lat},${p.lng}`;

/**
 * Ordered points to route through.
 *  - focusBookingId set → just that passenger: pickup → drop.
 *  - otherwise the whole ride: driver's last position (if any) → all pickups → all drops.
 */
function routeSequence(trip: TrackedTrip, focusBookingId?: string | null): { origin: LatLng | null; rest: LatLng[] } {
  const withCoord = trip.stops.filter(hasCoord);

  if (focusBookingId) {
    const mine = withCoord.filter((s) => s.bookingId === focusBookingId);
    const pickup = mine.find((s) => s.kind === 'PICKUP');
    const drop = mine.find((s) => s.kind === 'DROPOFF');
    const pts = [pickup, drop].filter(Boolean).map((s) => ({ lat: s!.lat, lng: s!.lng }));
    return { origin: pts[0] ?? null, rest: pts.slice(1) };
  }

  const pickups = withCoord.filter((s) => s.kind === 'PICKUP').map((s) => ({ lat: s.lat, lng: s.lng }));
  const drops = withCoord.filter((s) => s.kind === 'DROPOFF').map((s) => ({ lat: s.lat, lng: s.lng }));
  const ordered = [...pickups, ...drops];
  const driver = trip.location ? { lat: trip.location.lat, lng: trip.location.lng } : null;
  const origin = driver ?? ordered[0] ?? null;
  const rest = (driver ? ordered : ordered.slice(1)).slice(0, 9);
  return { origin, rest };
}

// Keyless Google Maps embed — no API key, plots a driving route through the points.
function embedUrl(trip: TrackedTrip, focusBookingId?: string | null): string | null {
  const { origin, rest } = routeSequence(trip, focusBookingId);
  if (!origin) return null;
  if (rest.length === 0) return `https://www.google.com/maps?q=${pt(origin)}&z=13&output=embed`;
  const daddr = rest.map(pt).join('+to:');
  const params = new URLSearchParams({ saddr: pt(origin), daddr, output: 'embed' });
  return `https://www.google.com/maps?${params.toString().replace(/%2Bto%3A/g, '+to:')}`;
}

function openUrl(trip: TrackedTrip, focusBookingId?: string | null): string | null {
  const { origin, rest } = routeSequence(trip, focusBookingId);
  if (!origin) return null;
  if (rest.length === 0) return `https://www.google.com/maps/search/?api=1&query=${pt(origin)}`;
  const destination = rest[rest.length - 1];
  const waypoints = rest.slice(0, -1).map(pt).join('|');
  const params = new URLSearchParams({ api: '1', origin: pt(origin), destination: pt(destination), travelmode: 'driving' });
  const wp = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
  return `https://www.google.com/maps/dir/?${params.toString()}${wp}`;
}

export default function ScheduleMap({ trip, focusBookingId }: { trip: TrackedTrip | null; focusBookingId?: string | null }) {
  const url = useMemo(() => (trip ? embedUrl(trip, focusBookingId) : null), [trip, focusBookingId]);
  const dir = useMemo(() => (trip ? openUrl(trip, focusBookingId) : null), [trip, focusBookingId]);
  const focusName = focusBookingId
    ? trip?.stops.find((s) => s.bookingId === focusBookingId)?.passengerName ?? null
    : null;

  if (!trip) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <div>
          <p className="text-sm font-semibold text-slate-900">Select a scheduled ride</p>
          <p className="mt-1 max-w-md text-sm text-slate-600">Pick a ride from the list to plot its pickup → drop route and the driver&apos;s last known position.</p>
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <div>
          <p className="text-sm font-semibold text-slate-900">No mapped stops yet</p>
          <p className="mt-1 max-w-md text-sm text-slate-600">This ride has no pickup/drop coordinates to plot. Add booking pickup &amp; drop points to see a route.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      <iframe
        key={url}
        title="Scheduled ride route"
        src={url}
        className="h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="absolute left-3 top-3 rounded-md border border-white/80 bg-white/95 px-3 py-2 text-xs shadow-sm">
        <p className="font-semibold text-slate-900">
          {focusName ? `${focusName}’s route` : `${trip.route.from} → ${trip.route.to}`}
        </p>
        <p className="mt-0.5 text-slate-600">
          {focusName
            ? 'Pickup → drop for this passenger'
            : trip.location ? 'Route from driver’s last position' : 'Planned pickup → drop route'}
        </p>
      </div>
      {dir && (
        <a
          href={dir}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-3 right-3 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
        >
          Open in Google Maps
        </a>
      )}
    </div>
  );
}
