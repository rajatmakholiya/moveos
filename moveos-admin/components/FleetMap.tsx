'use client';

import { useMemo } from 'react';
import type { TrackedTrip, TrackingStop } from '@/lib/api';
import type { LiveLocation } from '@/lib/useFleetTrackingSocket';

type LatLng = { lat: number; lng: number };

type Props = {
  trips: TrackedTrip[];
  liveLocations: Record<string, LiveLocation>;
  selectedTripId: string | null;
  onSelectTrip: (tripId: string) => void;
};

const pt = (p: LatLng) => `${p.lat},${p.lng}`;

function hasCoord(s: TrackingStop): s is TrackingStop & { lat: number; lng: number } {
  return s.lat != null && s.lng != null;
}

function driverPos(trip: TrackedTrip, live: Record<string, LiveLocation>): LatLng | null {
  const l = live[trip.driver.id];
  if (l) return { lat: l.lat, lng: l.lng };
  if (trip.location) return { lat: trip.location.lat, lng: trip.location.lng };
  return null;
}

function nextPendingStop(trip: TrackedTrip): (TrackingStop & { lat: number; lng: number }) | null {
  return trip.stops.filter(hasCoord).find((s) => s.status !== 'DONE') ?? null;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function etaLabel(km: number): string {
  const m = Math.round((km / 40) * 60);
  return m < 60 ? `~${m} min` : `~${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * Builds a keyless Google Maps embed URL that routes the driver through all
 * remaining stops. When driver GPS is known it is the saddr; otherwise the
 * first pending stop is used as origin so the map always shows a route.
 */
function buildEmbedUrl(trip: TrackedTrip, live: Record<string, LiveLocation>): string | null {
  const driver = driverPos(trip, live);
  const pending = trip.stops.filter(hasCoord).filter((s) => s.status !== 'DONE');
  const pts: LatLng[] = (pending.length > 0 ? pending : trip.stops.filter(hasCoord)).map(
    (s) => ({ lat: s.lat, lng: s.lng }),
  );

  if (pts.length === 0) return null;

  const origin = driver ?? pts[0];
  // When driver is the origin, route through all stop points; otherwise first
  // point is already the origin so route through the rest.
  const waypoints = (driver ? pts : pts.slice(1)).slice(0, 9);

  if (waypoints.length === 0) {
    return `https://www.google.com/maps?q=${pt(origin)}&z=13&output=embed`;
  }

  const daddr = waypoints.map(pt).join('+to:');
  const params = new URLSearchParams({ saddr: pt(origin), daddr, output: 'embed' });
  return `https://www.google.com/maps?${params.toString().replace(/%2Bto%3A/g, '+to:')}`;
}

function buildOpenUrl(trip: TrackedTrip, live: Record<string, LiveLocation>): string | null {
  const driver = driverPos(trip, live);
  const pending = trip.stops.filter(hasCoord).filter((s) => s.status !== 'DONE');
  const pts: LatLng[] = (pending.length > 0 ? pending : trip.stops.filter(hasCoord)).map(
    (s) => ({ lat: s.lat, lng: s.lng }),
  );
  if (pts.length === 0) return null;

  const origin = driver ?? pts[0];
  const allWaypoints = driver ? pts : pts.slice(1);
  if (allWaypoints.length === 0) {
    return `https://www.google.com/maps/search/?api=1&query=${pt(origin)}`;
  }
  const dest = allWaypoints[allWaypoints.length - 1];
  const wp = allWaypoints.slice(0, -1);
  const params = new URLSearchParams({
    api: '1',
    origin: pt(origin),
    destination: pt(dest),
    travelmode: 'driving',
  });
  const wpStr = wp.length > 0 ? `&waypoints=${encodeURIComponent(wp.map(pt).join('|'))}` : '';
  return `https://www.google.com/maps/dir/?${params.toString()}${wpStr}`;
}

export default function FleetMap({ trips, liveLocations, selectedTripId, onSelectTrip }: Props) {
  const focusedTrip = useMemo(() => {
    if (selectedTripId) {
      const sel = trips.find((t) => t.tripId === selectedTripId);
      if (sel) return sel;
    }
    return (
      trips.find((t) => driverPos(t, liveLocations)) ??
      trips.find((t) => nextPendingStop(t) !== null) ??
      trips[0]
    );
  }, [trips, liveLocations, selectedTripId]);

  const mapUrl = useMemo(
    () => (focusedTrip ? buildEmbedUrl(focusedTrip, liveLocations) : null),
    [focusedTrip, liveLocations],
  );
  const openUrl = useMemo(
    () => (focusedTrip ? buildOpenUrl(focusedTrip, liveLocations) : null),
    [focusedTrip, liveLocations],
  );

  const etaInfo = useMemo(() => {
    if (!focusedTrip) return null;
    const driver = driverPos(focusedTrip, liveLocations);
    const next = nextPendingStop(focusedTrip);
    if (!driver || !next) return null;
    const km = haversineKm(driver, { lat: next.lat, lng: next.lng });
    return {
      label: etaLabel(km),
      km: km.toFixed(1),
      stopKind: next.kind,
      passengerName: next.passengerName,
    };
  }, [focusedTrip, liveLocations]);

  const hasLiveGps = focusedTrip ? Boolean(liveLocations[focusedTrip.driver.id]) : false;
  const hasLastKnown = focusedTrip ? Boolean(focusedTrip.location) : false;

  if (!mapUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <div>
          <p className="text-sm font-semibold text-slate-900">Live location unavailable</p>
          <p className="mt-1 max-w-md text-sm text-slate-600">
            No active trip has a driver or stop location yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      <iframe
        key={mapUrl}
        title="Live vehicle tracking map"
        src={mapUrl}
        className="h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />

      {/* Top-left: vehicle + route type */}
      <div className="absolute left-3 top-3 max-w-[220px] rounded-md border border-white/80 bg-white/95 px-3 py-2 text-xs shadow-sm">
        <p className="font-semibold text-slate-900 truncate">
          {focusedTrip?.vehicle.plate || focusedTrip?.vehicle.vehicleNumber || focusedTrip?.driver.name}
        </p>
        <p className="mt-0.5 text-slate-500">
          {hasLiveGps
            ? 'Live GPS → next stop'
            : hasLastKnown
              ? 'Last known → next stop'
              : 'Planned pickup → drop route'}
        </p>
        {etaInfo && (
          <p className="mt-1 font-semibold text-blue-700">
            ETA {etaInfo.label} · {etaInfo.km} km
            <span className="ml-1 font-normal text-slate-500">
              to {etaInfo.stopKind === 'PICKUP' ? 'pickup' : 'drop'} ({etaInfo.passengerName})
            </span>
          </p>
        )}
      </div>

      {openUrl && (
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-3 right-3 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
        >
          Open in Google Maps
        </a>
      )}

      {trips.length > 1 && (
        <div className="absolute bottom-3 left-3 max-w-[240px] rounded-md border border-white/80 bg-white/95 p-2 shadow-sm">
          <p className="px-1 pb-1 text-[11px] font-semibold uppercase text-slate-500">Vehicles</p>
          <div className="max-h-28 space-y-1 overflow-auto">
            {trips.map((trip) => {
              const hasAnyCoords = Boolean(nextPendingStop(trip));
              const isLive = Boolean(liveLocations[trip.driver.id]);
              const active = trip.tripId === focusedTrip?.tripId;
              return (
                <button
                  key={trip.tripId}
                  type="button"
                  disabled={!hasAnyCoords}
                  onClick={() => onSelectTrip(trip.tripId)}
                  className={[
                    'block w-full truncate rounded px-2 py-1 text-left text-xs',
                    active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-100',
                    !hasAnyCoords ? 'cursor-not-allowed opacity-50' : '',
                    !isLive && hasAnyCoords ? 'italic' : '',
                  ].join(' ')}
                >
                  {trip.vehicle.plate || trip.vehicle.vehicleNumber || trip.driver.name || trip.tripId}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
