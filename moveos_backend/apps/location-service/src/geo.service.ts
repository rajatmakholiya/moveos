import { BadRequestException, Injectable } from '@nestjs/common';
import { OlaMapsClient } from './ola-maps.client';

type GeoPlace = {
  id: string;
  label: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
};

type Coordinate = {
  lat: number;
  lng: number;
};

export type GeoSearchIntent = 'pickup' | 'dropoff';

export type GeoSearchOptions = {
  routeId?: string;
  intent?: GeoSearchIntent;
  current?: Coordinate;
  origin?: Coordinate;
  destination?: Coordinate;
  searchRadiusKm?: number;
};

const places: GeoPlace[] = [
  { id: 'geo-pth-bus', label: 'Pithoragarh Bus Stand', address: 'Roadways Station, Pithoragarh', city: 'Pithoragarh', lat: 29.5829, lng: 80.2182 },
  { id: 'geo-pth-siltham', label: 'Siltham Chowk', address: 'Siltham, Pithoragarh', city: 'Pithoragarh', lat: 29.5796, lng: 80.2139 },
  { id: 'geo-ddn-isbt', label: 'ISBT Dehradun', address: 'Transport Nagar, Dehradun', city: 'Dehradun', lat: 30.2908, lng: 78.0007 },
  { id: 'geo-ddn-clock', label: 'Clock Tower Dehradun', address: 'Rajpur Road, Dehradun', city: 'Dehradun', lat: 30.3254, lng: 78.0419 },
  { id: 'geo-del-anand', label: 'Anand Vihar ISBT', address: 'Anand Vihar, Delhi', city: 'Delhi', lat: 28.6473, lng: 77.3151 },
  { id: 'geo-del-kashmere', label: 'Kashmere Gate ISBT', address: 'Kashmere Gate, Delhi', city: 'Delhi', lat: 28.6677, lng: 77.2273 },
  { id: 'geo-hld-bus', label: 'Haldwani Bus Stand', address: 'Bareilly Road, Haldwani', city: 'Haldwani', lat: 29.2183, lng: 79.5126 },
];

const DEFAULT_SEARCH_RADIUS_KM = 150;
const MAX_SEARCH_RADIUS_KM = 500;
const MAX_RESULTS = 15;
const INDIA_CENTER: Coordinate = { lat: 22.9734, lng: 78.6569 };

@Injectable()
export class GeoService {
  constructor(private readonly olaMaps: OlaMapsClient) {}

  async search(query = '', options: GeoSearchOptions = {}) {
    const normalized = query.trim().toLowerCase();
    const routeContext = this.resolveRouteContext(options.routeId);
    const biasPoints = this.getBiasPoints(options, routeContext);
    const searchRadiusKm = this.clampRadius(options.searchRadiusKm);

    if (normalized.length >= 2) {
      const olaPlaces = await this.searchOlaMaps(query, options, routeContext, biasPoints, searchRadiusKm);
      if (olaPlaces.length) {
        const ranked = this.rankPlaces(olaPlaces, normalized, biasPoints, routeContext, searchRadiusKm);
        const nearby = ranked.filter((place) => this.isContextualMatch(place, routeContext, biasPoints, searchRadiusKm));
        return {
          places: (nearby.length ? nearby : ranked).slice(0, MAX_RESULTS),
        };
      }

      const remotePlaces = await this.searchOpenStreetMap(query, options, routeContext, biasPoints);
      if (remotePlaces.length) {
        const ranked = this.rankPlaces(remotePlaces, normalized, biasPoints, routeContext, searchRadiusKm);
        const contextual = biasPoints.length > 0 || Boolean(routeContext);
        const nearby = contextual
          ? ranked.filter((place) => this.isContextualMatch(place, routeContext, biasPoints, searchRadiusKm))
          : ranked;

        if (nearby.length) {
          return { places: nearby.slice(0, MAX_RESULTS) };
        }

        return { places: ranked.slice(0, MAX_RESULTS) };
      }
    }

    const localMatches = places
      .filter((place) => normalized ? `${place.label} ${place.address} ${place.city}`.toLowerCase().includes(normalized) : true);
    const contextualLocalMatches = localMatches.filter((place) => this.isContextualMatch(place, routeContext, biasPoints, searchRadiusKm));
    const fallbackMatches = contextualLocalMatches.length > 0
      ? contextualLocalMatches
      : localMatches.length > 0
        ? localMatches
        : normalized.length >= 2
          ? []
          : places;

    return {
      places: this.rankPlaces(fallbackMatches, normalized, biasPoints, routeContext, searchRadiusKm)
        .slice(0, MAX_RESULTS),
    };
  }

  async reverse(lat: number, lng: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException({ code: 'INVALID_COORDINATES', message: 'lat and lng are required' });
    }

    const olaPlace = await this.reverseOlaMaps(lat, lng);
    if (olaPlace) return { place: olaPlace };

    const remote = await this.reverseOpenStreetMap(lat, lng);
    if (remote) return { place: remote };

    const place = places
      .map((item) => ({ item, distance: Math.abs(item.lat - lat) + Math.abs(item.lng - lng) }))
      .sort((a, b) => a.distance - b.distance)[0]?.item ?? places[0];
    return { place };
  }

  private async reverseOlaMaps(lat: number, lng: number): Promise<GeoPlace | null> {
    try {
      const payload = await this.olaMaps.reverseGeocode({
        latlng: { lat, lng },
        language: 'en',
      });
      return this.extractOlaPlaces(payload, `${lat},${lng}`)[0] ?? null;
    } catch {
      return null;
    }
  }

  private async searchOlaMaps(
    query: string,
    options: GeoSearchOptions,
    routeContext: { origin?: GeoPlace; destination?: GeoPlace } | null,
    biasPoints: Coordinate[],
    searchRadiusKm: number,
  ): Promise<GeoPlace[]> {
    const variants = this.buildQueryVariants(query.trim(), options.intent, routeContext);
    const location = biasPoints[0];
    const radius = Math.min(MAX_SEARCH_RADIUS_KM, Math.max(searchRadiusKm, DEFAULT_SEARCH_RADIUS_KM)) * 1000;

    try {
      const [textResults, autocompleteResults] = await Promise.all([
        this.searchOlaText(variants, location, radius),
        this.searchOlaAutocomplete(variants.slice(0, 4), location, radius),
      ]);

      return this.dedupePlaces([...textResults, ...autocompleteResults]);
    } catch {
      return [];
    }
  }

  private async searchOlaText(variants: string[], location: Coordinate | undefined, radius: number) {
    const batches = await Promise.all(variants.map(async (input) => {
      try {
        const payload = await this.olaMaps.textSearch({
          input,
          location,
          radius,
          size: MAX_RESULTS,
          language: 'en',
        });
        return this.extractOlaPlaces(payload, input);
      } catch {
        return [];
      }
    }));

    return this.dedupePlaces(batches.flat());
  }

  private async searchOlaAutocomplete(variants: string[], location: Coordinate | undefined, radius: number) {
    const autocompleteBatches = await Promise.all(variants.map(async (input) => {
      try {
        const payload = await this.olaMaps.placesAutocomplete({
          input,
          location,
          radius,
          strictbounds: false,
          language: 'en',
        });
        return this.collectPlaceCandidates(payload).map((item) => ({ item, input }));
      } catch {
        return [];
      }
    }));

    const autocompleteCandidates = autocompleteBatches.flat();
    const autocompletePlaces = this.dedupePlaces(autocompleteCandidates
      .map(({ item, input }) => this.toGeoPlaceFromOla(item, input))
      .filter((place): place is GeoPlace => Boolean(place)));
    const placesWithCoordinates = autocompletePlaces.filter((place) => this.isValidCoordinate(place));
    const placeIdsNeedingDetails = autocompleteCandidates
      .map(({ item }) => String(item.place_id ?? item.placeId ?? item.reference ?? ''))
      .filter(Boolean)
      .slice(0, 8);

    const detailedPlaces = await Promise.all(placeIdsNeedingDetails.map(async (placeId) => {
      try {
        const details = await this.olaMaps.placeDetails({ placeId, language: 'en' });
        return this.extractOlaPlaces(details, placeId)[0] ?? null;
      } catch {
        return null;
      }
    }));

    return this.dedupePlaces([
      ...placesWithCoordinates,
      ...detailedPlaces.filter((place): place is GeoPlace => Boolean(place) && this.isValidCoordinate(place ?? undefined)),
    ]);
  }

  private extractOlaPlaces(payload: unknown, fallbackQuery: string): GeoPlace[] {
    const candidates = this.collectPlaceCandidates(payload);
    return this.dedupePlaces(candidates
      .map((item) => this.toGeoPlaceFromOla(item, fallbackQuery))
      .filter((place): place is GeoPlace => Boolean(place)));
  }

  private collectPlaceCandidates(payload: unknown): Record<string, any>[] {
    const candidates: Record<string, any>[] = [];
    const visit = (value: unknown, depth = 0) => {
      if (depth > 5 || value === null || value === undefined) return;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (this.looksLikePlaceCandidate(item)) {
            candidates.push(item as Record<string, any>);
          } else {
            visit(item, depth + 1);
          }
        }
        return;
      }
      if (typeof value !== 'object') return;
      const record = value as Record<string, any>;
      if (this.looksLikePlaceCandidate(record)) {
        candidates.push(record);
      }
      for (const key of ['predictions', 'results', 'places', 'data', 'result', 'place', 'geocodingResults']) {
        if (key in record) {
          visit(record[key], depth + 1);
        }
      }
    };

    visit(payload);
    return candidates;
  }

  private looksLikePlaceCandidate(value: unknown) {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, any>;
    return Boolean(
      record.place_id
      || record.placeId
      || record.reference
      || record.description
      || record.formatted_address
      || record.formattedAddress
      || record.name
      || record.geometry
      || record.location,
    );
  }

  private toGeoPlaceFromOla(item: Record<string, any>, fallbackQuery: string): GeoPlace | null {
    const coordinate = this.readOlaCoordinate(item);
    const label = this.readOlaLabel(item, fallbackQuery);
    const address = this.readOlaAddress(item, label);
    const city = this.readOlaCity(item, address);
    const id = String(item.place_id ?? item.placeId ?? item.reference ?? item.id ?? `ola-${label}-${coordinate?.lat ?? ''}-${coordinate?.lng ?? ''}`);

    if (!label || !coordinate || !this.isValidCoordinate(coordinate)) {
      return null;
    }

    return {
      id: `ola-${id}`,
      label,
      address,
      city,
      lat: coordinate.lat,
      lng: coordinate.lng,
    };
  }

  private readOlaCoordinate(item: Record<string, any>): Coordinate | null {
    const location = item.geometry?.location ?? item.location ?? item.coordinates ?? item.coordinate ?? item;
    const lat = Number(location.lat ?? location.latitude);
    const lng = Number(location.lng ?? location.lon ?? location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  private readOlaLabel(item: Record<string, any>, fallbackQuery: string) {
    const structured = item.structured_formatting ?? item.structuredFormatting ?? {};
    const label = item.name
      ?? item.main_text
      ?? structured.main_text
      ?? structured.mainText
      ?? item.title
      ?? (typeof item.description === 'string' ? item.description.split(',')[0] : undefined)
      ?? (typeof item.formatted_address === 'string' ? item.formatted_address.split(',')[0] : undefined)
      ?? fallbackQuery;
    return String(label).trim();
  }

  private readOlaAddress(item: Record<string, any>, label: string) {
    const structured = item.structured_formatting ?? item.structuredFormatting ?? {};
    const secondary = structured.secondary_text ?? structured.secondaryText;
    return String(item.formatted_address ?? item.formattedAddress ?? item.description ?? item.vicinity ?? secondary ?? label).trim();
  }

  private readOlaCity(item: Record<string, any>, address: string) {
    const addressRecord = item.address ?? {};
    const city = addressRecord.city
      ?? addressRecord.town
      ?? addressRecord.village
      ?? addressRecord.county
      ?? item.city
      ?? item.locality
      ?? item.district;
    if (city) return String(city);

    const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 2] : '';
  }

  private async reverseOpenStreetMap(lat: number, lng: number): Promise<GeoPlace | null> {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'MoveOS-local-route-management/1.0',
          Accept: 'application/json',
        },
      });
      if (!response.ok) return null;
      const item = await response.json() as Record<string, any>;
      const itemLat = Number(item.lat);
      const itemLng = Number(item.lon);
      if (!Number.isFinite(itemLat) || !Number.isFinite(itemLng)) return null;

      const address = (item.address ?? {}) as Record<string, string>;
      const city = address.city ?? address.town ?? address.village ?? address.county ?? address.state ?? '';
      const label = (item.name as string | undefined) || (item.display_name as string | undefined)?.split(',')[0] || city || 'Unknown location';

      return {
        id: `osm-${item.osm_type}-${item.osm_id}`,
        label,
        address: (item.display_name as string | undefined) ?? label,
        city,
        lat: itemLat,
        lng: itemLng,
      };
    } catch {
      return null;
    }
  }

  private async searchOpenStreetMap(
    query: string,
    options: GeoSearchOptions,
    routeContext: { origin?: GeoPlace; destination?: GeoPlace } | null,
    biasPoints: Coordinate[],
  ): Promise<GeoPlace[]> {
    const normalized = query.trim();
    const queryVariants = this.buildQueryVariants(normalized, options.intent, routeContext);
    const viewbox = this.buildViewbox(biasPoints);

    try {
      const batches = await Promise.all(queryVariants.map(async (variant) => {
        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.searchParams.set('q', variant);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('limit', String(MAX_RESULTS));
        url.searchParams.set('countrycodes', 'in');
        if (viewbox) {
          url.searchParams.set('viewbox', viewbox);
          url.searchParams.set('bounded', '0');
        }

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'MoveOS-local-route-management/1.0',
            Accept: 'application/json',
          },
        });
        if (!response.ok) return [];
        return response.json() as Promise<Array<Record<string, any>>>;
      }));

      return this.dedupePlaces(batches.flat()
        .map((item) => {
          const address = item.address ?? {};
          const city = address.city ?? address.town ?? address.village ?? address.county ?? address.state ?? '';
          const label = item.name || item.display_name?.split(',')[0] || city || query;
          const lat = Number(item.lat);
          const lng = Number(item.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            id: `osm-${item.osm_type}-${item.osm_id}`,
            label,
            address: item.display_name ?? label,
            city,
            lat,
            lng,
          } satisfies GeoPlace;
        })
        .filter((place): place is GeoPlace => Boolean(place)));
    } catch {
      return [];
    }
  }

  private buildQueryVariants(query: string, intent?: GeoSearchIntent, routeContext?: { origin?: GeoPlace; destination?: GeoPlace } | null) {
    const cleaned = this.cleanLandmarkQuery(query);
    const expanded = this.expandLandmarkQuery(cleaned);
    const primary = intent === 'dropoff' ? routeContext?.destination : routeContext?.origin;
    const secondary = intent === 'dropoff' ? routeContext?.origin : routeContext?.destination;
    const variants = [
      query,
      cleaned,
      expanded,
    ];
    for (const place of [primary, secondary]) {
      if (place?.city) {
        variants.push(`${cleaned} ${place.city}`);
        variants.push(`${expanded} ${place.city}`);
        variants.push(`${cleaned}, ${place.city}, India`);
      }
    }
    return [...new Set(variants.map((item) => item.trim()).filter(Boolean))].slice(0, 8);
  }

  private cleanLandmarkQuery(query: string) {
    return query
      .toLowerCase()
      .replace(/\b(near|nearby|around|close to|beside|opposite|opp|next to|at)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private expandLandmarkQuery(query: string) {
    if (/\broyal\b/.test(query) && !/\benfield\b/.test(query)) {
      return query.replace(/\broyal\b/g, 'royal enfield');
    }
    return query;
  }

  private rankPlaces(
    input: GeoPlace[],
    normalizedQuery: string,
    biasPoints: Coordinate[],
    routeContext: { origin?: GeoPlace; destination?: GeoPlace } | null,
    radiusKm: number,
  ) {
    return this.dedupePlaces(input)
      .map((place) => {
        const haystack = `${place.label} ${place.address} ${place.city}`.toLowerCase();
        const nearestKm = this.nearestDistanceKm(place, biasPoints);
        const routeBonus = this.matchesRouteCity(place, routeContext) ? -40 : 0;
        const exactBonus = normalizedQuery && place.label.toLowerCase() === normalizedQuery ? -80 : 0;
        const prefixBonus = normalizedQuery && place.label.toLowerCase().startsWith(normalizedQuery) ? -35 : 0;
        const containsBonus = normalizedQuery && haystack.includes(normalizedQuery) ? -20 : 15;
        const proximityPenalty = Number.isFinite(nearestKm) ? Math.min(nearestKm, radiusKm * 2) : 60;
        return { place, score: exactBonus + prefixBonus + containsBonus + routeBonus + proximityPenalty };
      })
      .sort((a, b) => a.score - b.score)
      .map(({ place }) => place);
  }

  private isContextualMatch(
    place: GeoPlace,
    routeContext: { origin?: GeoPlace; destination?: GeoPlace } | null,
    biasPoints: Coordinate[],
    radiusKm: number,
  ) {
    if (!routeContext && biasPoints.length === 0) return true;
    if (this.matchesRouteCity(place, routeContext)) return true;
    return this.nearestDistanceKm(place, biasPoints) <= radiusKm;
  }

  private getBiasPoints(options: GeoSearchOptions, routeContext: { origin?: GeoPlace; destination?: GeoPlace } | null) {
    const points: Coordinate[] = [];
    const relevantCurrent = this.isCurrentRelevantToRoute(options.current, routeContext) ? options.current : undefined;
    if (options.intent === 'pickup') {
      this.pushPoint(points, routeContext?.origin);
      this.pushPoint(points, options.origin);
      this.pushPoint(points, relevantCurrent);
      this.pushPoint(points, options.destination);
      this.pushPoint(points, routeContext?.destination);
    } else if (options.intent === 'dropoff') {
      this.pushPoint(points, options.destination);
      this.pushPoint(points, routeContext?.destination);
      this.pushPoint(points, relevantCurrent);
      this.pushPoint(points, options.origin);
      this.pushPoint(points, routeContext?.origin);
    } else {
      this.pushPoint(points, relevantCurrent);
      this.pushPoint(points, options.origin);
      this.pushPoint(points, options.destination);
      this.pushPoint(points, routeContext?.origin);
      this.pushPoint(points, routeContext?.destination);
    }
    return this.dedupeCoordinates(points);
  }

  private isCurrentRelevantToRoute(current: Coordinate | undefined, routeContext: { origin?: GeoPlace; destination?: GeoPlace } | null) {
    if (!current || !this.isValidCoordinate(current)) return false;
    const anchors = [routeContext?.origin, routeContext?.destination]
      .filter((place): place is GeoPlace => Boolean(place));
    if (anchors.length === 0) return true;
    return this.nearestDistanceKm(current, anchors) <= 250;
  }

  private resolveRouteContext(routeId?: string) {
    if (!routeId) return null;
    const parts = routeId
      .toLowerCase()
      .split(/[^a-z]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const routePlaces = parts
      .map((part) => places.find((place) => place.city.toLowerCase().replace(/\s+/g, '') === part.replace(/\s+/g, '')))
      .filter((place): place is GeoPlace => Boolean(place));
    return {
      origin: routePlaces[0],
      destination: routePlaces[routePlaces.length - 1],
    };
  }

  private buildViewbox(points: Coordinate[]) {
    const usable = points.filter((point) => this.isValidCoordinate(point));
    if (usable.length === 0) return null;
    const lats = usable.map((point) => point.lat);
    const lngs = usable.map((point) => point.lng);
    const pad = usable.length === 1 ? 1.2 : 0.8;
    const minLat = Math.max(6, Math.min(...lats) - pad);
    const maxLat = Math.min(38, Math.max(...lats) + pad);
    const minLng = Math.max(68, Math.min(...lngs) - pad);
    const maxLng = Math.min(98, Math.max(...lngs) + pad);
    return `${minLng},${maxLat},${maxLng},${minLat}`;
  }

  private clampRadius(radius?: number) {
    if (!Number.isFinite(radius)) return DEFAULT_SEARCH_RADIUS_KM;
    return Math.max(5, Math.min(MAX_SEARCH_RADIUS_KM, Number(radius)));
  }

  private matchesRouteCity(place: GeoPlace, routeContext: { origin?: GeoPlace; destination?: GeoPlace } | null) {
    if (!routeContext) return false;
    const haystack = `${place.label} ${place.address} ${place.city}`.toLowerCase();
    return [routeContext.origin, routeContext.destination]
      .filter((item): item is GeoPlace => Boolean(item))
      .some((item) => haystack.includes(item.city.toLowerCase()));
  }

  private nearestDistanceKm(place: Coordinate, points: Coordinate[]) {
    if (points.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...points.map((point) => this.distanceKm(place, point)));
  }

  private distanceKm(a: Coordinate, b: Coordinate) {
    if (!this.isValidCoordinate(a) || !this.isValidCoordinate(b)) return Number.POSITIVE_INFINITY;
    const earthRadiusKm = 6371;
    const dLat = this.toRadians(b.lat - a.lat);
    const dLng = this.toRadians(b.lng - a.lng);
    const lat1 = this.toRadians(a.lat);
    const lat2 = this.toRadians(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  private toRadians(value: number) {
    return value * Math.PI / 180;
  }

  private pushPoint(points: Coordinate[], point?: Coordinate) {
    if (point && this.isValidCoordinate(point)) {
      points.push({ lat: point.lat, lng: point.lng });
    }
  }

  private isValidCoordinate(point?: Coordinate) {
    return Boolean(point)
      && Number.isFinite(point!.lat)
      && Number.isFinite(point!.lng)
      && Math.abs(point!.lat) <= 90
      && Math.abs(point!.lng) <= 180
      && this.distanceKmUnsafe(point!, INDIA_CENTER) < 3000;
  }

  private distanceKmUnsafe(a: Coordinate, b: Coordinate) {
    const earthRadiusKm = 6371;
    const dLat = this.toRadians(b.lat - a.lat);
    const dLng = this.toRadians(b.lng - a.lng);
    const lat1 = this.toRadians(a.lat);
    const lat2 = this.toRadians(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  private dedupePlaces(input: GeoPlace[]) {
    const seen = new Set<string>();
    return input.filter((place) => {
      const key = place.id || `${place.label}:${place.lat.toFixed(5)}:${place.lng.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private dedupeCoordinates(input: Coordinate[]) {
    const seen = new Set<string>();
    return input.filter((point) => {
      const key = `${point.lat.toFixed(4)}:${point.lng.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
