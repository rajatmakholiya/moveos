import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { GeoPlace } from '@/types';

/**
 * Debounced geo autocomplete backed by the backend `/geo/search` endpoint
 * (no Google Maps native dependency — safe on any device).
 */
export function useGeoSearch(query: string, routeId?: string) {
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (routeId) params.append('routeId', routeId);
        const res = await api.getd<
          { places?: GeoPlace[]; results?: GeoPlace[] } | GeoPlace[]
        >(`/geo/search?${params.toString()}`, null);
        const places = Array.isArray(res)
          ? res
          : (res?.places ?? res?.results ?? []);
        setResults(places);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, routeId]);

  return { results, loading };
}
