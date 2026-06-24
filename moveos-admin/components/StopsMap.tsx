'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { locationApi } from '@/lib/api';

export type StopPoint = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  phone: string;
  label: string;
};

type Props = {
  title: string;
  accent: 'pickup' | 'drop';
  points: StopPoint[];
  driver?: { lat: number; lng: number } | null;
};

type LatLng = { lat: number; lng: number };
type ProjectedPoint = LatLng & { id: string; kind: 'driver' | 'stop'; x: number; y: number; stop?: StopPoint; index?: number };

const COLORS = {
  pickup: { pin: '#059669', route: '#10b981', soft: 'bg-emerald-50', text: 'text-emerald-700' },
  drop: { pin: '#7c3aed', route: '#7c3aed', soft: 'bg-purple-50', text: 'text-purple-700' },
};

const DEFAULT_CENTER = { lat: 30.3165, lng: 78.0322 };

function haversineKm(a: LatLng, b: LatLng) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function nearestNeighbour(pts: LatLng[], start?: LatLng) {
  const remaining = pts.map((p, i) => ({ p, i }));
  const order: number[] = [];
  let cur = start ?? remaining[0]?.p;
  while (cur && remaining.length > 0) {
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < remaining.length; k += 1) {
      const d = haversineKm(cur, remaining[k].p);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    const next = remaining.splice(best, 1)[0];
    order.push(next.i);
    cur = next.p;
  }
  return order;
}

function parseOptimizedOrder(resp: any, n: number): number[] | null {
  const wps = resp?.waypoints ?? resp?.data?.waypoints;
  if (Array.isArray(wps) && wps.length === n && wps.every((w: any) => typeof w?.waypoint_index === 'number')) {
    return wps.map((w: any, i: number) => ({ i, idx: w.waypoint_index })).sort((a, b) => a.idx - b.idx).map((x) => x.i);
  }
  return null;
}

function boundsOf(coords: LatLng[]) {
  if (coords.length === 0) return { center: DEFAULT_CENTER, zoom: 12 };
  let minLat = coords[0].lat;
  let maxLat = coords[0].lat;
  let minLng = coords[0].lng;
  let maxLng = coords[0].lng;
  for (const c of coords) {
    minLat = Math.min(minLat, c.lat);
    maxLat = Math.max(maxLat, c.lat);
    minLng = Math.min(minLng, c.lng);
    maxLng = Math.max(maxLng, c.lng);
  }
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const diagonalKm = haversineKm({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng });
  const zoom = diagonalKm < 0.8 ? 16 : diagonalKm < 2 ? 15 : diagonalKm < 5 ? 14 : diagonalKm < 12 ? 13 : diagonalKm < 30 ? 12 : diagonalKm < 90 ? 10 : 8;
  return { center, zoom };
}

function worldPoint(coord: LatLng, zoom: number) {
  const siny = Math.sin((coord.lat * Math.PI) / 180);
  const scale = 256 * 2 ** zoom;
  return {
    x: ((coord.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale,
  };
}

function googleMapUrl(center: LatLng, zoom: number) {
  return `https://www.google.com/maps?q=${center.lat},${center.lng}&z=${zoom}&output=embed`;
}

function googleOpenUrl(route: LatLng[] | null, fallback: LatLng | null) {
  const pt = (p: LatLng) => `${p.lat},${p.lng}`;
  if (route && route.length > 1) {
    const destination = route[route.length - 1];
    const waypoints = route.slice(1, -1);
    const params = new URLSearchParams({
      api: '1',
      origin: pt(route[0]),
      destination: pt(destination),
      travelmode: 'driving',
    });
    const wp = waypoints.length ? `&waypoints=${encodeURIComponent(waypoints.map(pt).join('|'))}` : '';
    return `https://www.google.com/maps/dir/?${params.toString()}${wp}`;
  }
  return fallback ? `https://www.google.com/maps/search/?api=1&query=${pt(fallback)}` : null;
}

function localOrder(coords: LatLng[], usesDriver: boolean) {
  if (usesDriver) {
    const rest = coords.slice(1);
    const order = nearestNeighbour(rest, coords[0]);
    return [coords[0], ...order.map((i) => rest[i])];
  }
  return nearestNeighbour(coords).map((i) => coords[i]);
}

export default function StopsMap({ title, accent, points, driver }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 320 });
  const [routeCoords, setRouteCoords] = useState<LatLng[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [hovered, setHovered] = useState<ProjectedPoint | null>(null);
  const color = COLORS[accent];

  const mapCoords = useMemo(() => {
    const coords: LatLng[] = points.map((p) => ({ lat: p.lat, lng: p.lng }));
    return driver ? [driver, ...coords] : coords;
  }, [driver, points]);

  const { center, zoom } = useMemo(() => boundsOf(mapCoords), [mapCoords]);
  const mapUrl = useMemo(() => googleMapUrl(center, zoom), [center, zoom]);
  const openUrl = useMemo(() => googleOpenUrl(routeCoords, mapCoords[0] ?? null), [routeCoords, mapCoords]);

  const projected = useMemo<ProjectedPoint[]>(() => {
    const centerPx = worldPoint(center, zoom);
    const project = (coord: LatLng) => {
      const p = worldPoint(coord, zoom);
      return { x: size.width / 2 + (p.x - centerPx.x), y: size.height / 2 + (p.y - centerPx.y) };
    };
    const stopPoints = points.map((point, index) => ({
      ...point,
      ...project(point),
      id: point.id,
      kind: 'stop' as const,
      stop: point,
      index: index + 1,
    }));
    return driver ? [{ ...driver, ...project(driver), id: 'driver', kind: 'driver' as const }, ...stopPoints] : stopPoints;
  }, [center, driver, points, size, zoom]);

  const routeLine = useMemo(() => {
    if (!routeCoords || routeCoords.length < 2) return '';
    const centerPx = worldPoint(center, zoom);
    return routeCoords.map((coord) => {
      const p = worldPoint(coord, zoom);
      return `${size.width / 2 + (p.x - centerPx.x)},${size.height / 2 + (p.y - centerPx.y)}`;
    }).join(' ');
  }, [center, routeCoords, size, zoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setRouteCoords(null);
    setHovered(null);
  }, [points, driver]);

  async function toggleRoute() {
    if (routeCoords) {
      setRouteCoords(null);
      return;
    }
    if (points.length < 2) return;
    const usesDriver = accent === 'pickup' && !!driver;
    const coords = usesDriver ? [driver!, ...points] : [...points];
    setPlanning(true);
    try {
      const resp = await locationApi.optimizeRoute(
        coords.map((c) => ({ lat: c.lat, lng: c.lng })),
        { source: usesDriver ? 'first' : 'any', destination: 'any' },
      );
      const order = parseOptimizedOrder(resp, coords.length);
      setRouteCoords(order ? order.map((i) => coords[i]) : localOrder(coords, usesDriver));
    } catch {
      setRouteCoords(localOrder(coords, usesDriver));
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color.pin }} />
          <span className="truncate text-sm font-semibold text-slate-800">{title}</span>
          <span className="text-xs text-slate-400">({points.length})</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Google Maps
            </a>
          )}
          <button
            type="button"
            disabled={points.length < 2 || planning}
            onClick={() => void toggleRoute()}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              routeCoords ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            } ${points.length < 2 ? 'cursor-not-allowed opacity-50' : ''}`}
            title="Draw the minimum-displacement planned route through these stops"
          >
            {planning ? 'Planning...' : routeCoords ? 'Hide route' : 'Plan route'}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative h-[320px] overflow-hidden bg-slate-100">
        {mapCoords.length > 0 ? (
          <iframe
            key={mapUrl}
            title={`${title} Google map`}
            src={mapUrl}
            className="pointer-events-none absolute inset-0 h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            tabIndex={-1}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
            No coordinates available for this ride.
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-transparent">
          {routeLine && (
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
              <polyline points={routeLine} fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              <polyline points={routeLine} fill="none" stroke={color.route} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        {projected.map((p) => {
          const hidden = p.x < -40 || p.x > size.width + 40 || p.y < -50 || p.y > size.height + 50;
          if (hidden) return null;
          return (
            <button
              key={p.id}
              type="button"
              onMouseEnter={() => setHovered(p)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(p)}
              onBlur={() => setHovered(null)}
              className="absolute z-10 -translate-x-1/2 -translate-y-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ left: p.x, top: p.y }}
              aria-label={p.kind === 'driver' ? 'Driver location' : `${accent === 'pickup' ? 'Pickup' : 'Drop'} for ${p.stop?.name}`}
            >
              {p.kind === 'driver' ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-sm font-bold text-white shadow-md">D</span>
              ) : (
                <span className="relative flex h-10 w-8 items-start justify-center">
                  <span
                    className="absolute left-1/2 top-0 h-8 w-8 -translate-x-1/2 rotate-45 rounded-full rounded-br-sm border-2 border-white shadow-md"
                    style={{ background: color.pin }}
                  />
                  <span className="relative mt-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold" style={{ color: color.pin }}>
                    {p.index}
                  </span>
                </span>
              )}
            </button>
          );
        })}

        {hovered && (
          <div
            className="pointer-events-none absolute z-20 w-56 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: Math.min(Math.max(hovered.x, 120), size.width - 120),
              top: Math.max(8, hovered.y - 96),
            }}
          >
            {hovered.kind === 'driver' ? (
              <>
                <p className="font-semibold text-blue-700">Driver location</p>
                <p className="mt-0.5 text-slate-500">{hovered.lat.toFixed(5)}, {hovered.lng.toFixed(5)}</p>
              </>
            ) : (
              <>
                <p className={`font-semibold ${color.text}`}>{accent === 'pickup' ? 'Pickup' : 'Drop'} · {hovered.stop?.name || 'Passenger'}</p>
                <p className="mt-0.5 text-slate-600">{hovered.stop?.label || 'Exact point pinned'}</p>
                {hovered.stop?.phone && <p className="mt-1 font-medium text-blue-700">{hovered.stop.phone}</p>}
              </>
            )}
          </div>
        )}

        <div className={`absolute bottom-3 left-3 rounded-md border border-white/80 ${color.soft} px-2.5 py-1 text-xs font-semibold ${color.text} shadow-sm`}>
          Google Maps embed · custom no-key overlays
        </div>
      </div>
    </div>
  );
}
