import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';
import { ENV } from '@/config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LocationResult = {
  address: string;
  lat: number;
  lng: number;
};

type Prediction = {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text?: string;
  };
};

type Props = {
  visible: boolean;
  title?: string;
  initialAddress?: string;
  initialLat?: number;
  initialLng?: number;
  onConfirm: (result: LocationResult) => void;
  onClose: () => void;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

// Default to Dehradun (common origin city for intercity routes)
const DEFAULT_REGION: Region = {
  latitude: 30.3165,
  longitude: 78.0322,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

const KEY = ENV.GOOGLE_MAPS_API_KEY;

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchPredictions(input: string): Promise<Prediction[]> {
  if (input.trim().length < 2) return [];
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
      `?input=${encodeURIComponent(input)}` +
      `&key=${KEY}` +
      `&components=country:in` +
      `&language=en` +
      `&types=geocode|establishment`;
    const res = await fetch(url);
    const data = await res.json();
    return data.status === 'OK' ? (data.predictions as Prediction[]) : [];
  } catch {
    return [];
  }
}

async function fetchPlaceDetails(placeId: string): Promise<LocationResult | null> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${placeId}` +
      `&fields=geometry,formatted_address` +
      `&key=${KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK') {
      return {
        lat: data.result.geometry.location.lat,
        lng: data.result.geometry.location.lng,
        address: data.result.formatted_address,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${lat},${lng}` +
      `&key=${KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.results.length > 0) {
      return data.results[0].formatted_address as string;
    }
  } catch {}
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const LocationPickerSheet: React.FC<Props> = ({
  visible,
  title = 'Select pickup location',
  initialAddress,
  initialLat,
  initialLng,
  onConfirm,
  onClose,
}) => {
  const mapRef = useRef<MapView>(null);
  const searchRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [address, setAddress] = useState(initialAddress ?? '');
  const [searchText, setSearchText] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const requestAndCenterOnUser = useCallback(async (fallbackRegion: Region) => {
    try {
      let granted = true;
      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'Moveos needs your location to suggest nearby pickup points.',
            buttonNeutral: 'Ask Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'Allow',
          },
        );
        granted = result === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (!granted) {
        reverseGeocode(fallbackRegion.latitude, fallbackRegion.longitude).then(setAddress);
        return;
      }
      Geolocation.getCurrentPosition(
        (pos) => {
          const r: Region = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          };
          setRegion(r);
          mapRef.current?.animateToRegion(r, 600);
          reverseGeocode(r.latitude, r.longitude).then(setAddress);
        },
        () => {
          reverseGeocode(fallbackRegion.latitude, fallbackRegion.longitude).then(setAddress);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    } catch {
      reverseGeocode(fallbackRegion.latitude, fallbackRegion.longitude).then(setAddress);
    }
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (!visible) return;
    const lat = initialLat ?? DEFAULT_REGION.latitude;
    const lng = initialLng ?? DEFAULT_REGION.longitude;
    const r: Region = { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setRegion(r);
    setAddress(initialAddress ?? '');
    setSearchText('');
    setPredictions([]);
    setIsDragging(false);
    setConfirming(false);
    if (!initialLat && !initialLng) {
      requestAndCenterOnUser(r);
    }
  }, [visible, initialLat, initialLng, initialAddress, requestAndCenterOnUser]);

  // Debounced autocomplete
  const onSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setPredictions([]);
      setIsPredicting(false);
      return;
    }
    setIsPredicting(true);
    debounceRef.current = setTimeout(async () => {
      const results = await fetchPredictions(text);
      setPredictions(results);
      setIsPredicting(false);
    }, 350);
  }, []);

  const onSelectPrediction = useCallback(async (pred: Prediction) => {
    setPredictions([]);
    setSearchText('');
    searchRef.current?.blur();
    setIsGeocoding(true);
    const details = await fetchPlaceDetails(pred.place_id);
    setIsGeocoding(false);
    if (!details) return;
    const r: Region = {
      latitude: details.lat,
      longitude: details.lng,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    };
    setRegion(r);
    setAddress(details.address);
    mapRef.current?.animateToRegion(r, 500);
  }, []);

  // When user lifts finger off map, reverse geocode the new center
  const onRegionChangeComplete = useCallback(async (r: Region) => {
    setRegion(r);
    setIsDragging(false);
    setIsGeocoding(true);
    const addr = await reverseGeocode(r.latitude, r.longitude);
    setAddress(addr);
    setIsGeocoding(false);
  }, []);

  const onMyLocation = useCallback(async () => {
    try {
      let granted = true;
      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        granted = result === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (!granted) return;
      Geolocation.getCurrentPosition(
        (pos) => {
          const r: Region = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          };
          setRegion(r);
          mapRef.current?.animateToRegion(r, 600);
          reverseGeocode(r.latitude, r.longitude).then(setAddress);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 },
      );
    } catch {}
  }, []);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    onConfirm({ address, lat: region.latitude, lng: region.longitude });
    setConfirming(false);
  }, [address, region, onConfirm]);

  const showSuggestions = predictions.length > 0 || isPredicting;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* ── Map + overlays ── */}
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={region}
            onRegionChange={() => setIsDragging(true)}
            onRegionChangeComplete={onRegionChangeComplete}
            showsUserLocation
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
          />

          {/* Center pin — stays fixed while map pans underneath */}
          <View pointerEvents="none" style={styles.pinWrap}>
            <View style={styles.pinContainer}>
              <View style={[styles.pinHead, isDragging && styles.pinHeadLifted]} />
              <View style={[styles.pinStem, isDragging && styles.pinStemLifted]} />
              <View style={styles.pinShadow} />
            </View>
          </View>

          {/* My location button */}
          <Pressable style={styles.myLocationBtn} onPress={onMyLocation}>
            <Text style={styles.myLocationIcon}>◎</Text>
          </Pressable>
        </View>

        {/* ── Search bar overlay ── */}
        <View style={styles.searchWrap}>
          <View style={styles.searchRow}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              placeholder="Search for a place…"
              placeholderTextColor="#98A2B3"
              value={searchText}
              onChangeText={onSearchChange}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <Pressable
                onPress={() => { setSearchText(''); setPredictions([]); }}
                hitSlop={8}
              >
                <Text style={styles.clearIcon}>✕</Text>
              </Pressable>
            )}
            {isPredicting && <ActivityIndicator size="small" color="#0F52BA" style={{ marginLeft: 8 }} />}
          </View>

          {/* Autocomplete suggestions */}
          {showSuggestions && (
            <FlatList
              style={styles.suggestionList}
              data={predictions}
              keyExtractor={(item) => item.place_id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.suggestionRow}
                  onPress={() => onSelectPrediction(item)}
                >
                  <Text style={styles.suggestionPin}>📍</Text>
                  <View style={styles.suggestionText}>
                    <Text style={styles.suggestionMain} numberOfLines={1}>
                      {item.structured_formatting.main_text}
                    </Text>
                    {!!item.structured_formatting.secondary_text && (
                      <Text style={styles.suggestionSub} numberOfLines={1}>
                        {item.structured_formatting.secondary_text}
                      </Text>
                    )}
                  </View>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.suggestionSep} />}
            />
          )}
        </View>

        {/* ── Bottom confirm panel ── */}
        <View style={styles.bottomPanel}>
          <View style={styles.addressRow}>
            {isGeocoding ? (
              <ActivityIndicator size="small" color="#0F52BA" />
            ) : (
              <Text style={styles.addressPin}>📍</Text>
            )}
            <Text style={styles.addressText} numberOfLines={2}>
              {isGeocoding ? 'Getting address…' : (address || 'Move the map to select')}
            </Text>
          </View>
          <Pressable
            style={[styles.confirmBtn, (!address || isGeocoding || confirming) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!address || isGeocoding || confirming}
          >
            {confirming
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.confirmText}>Confirm location</Text>
            }
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#E4E7EC',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F6F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 18, color: '#0F172A', fontWeight: '700' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#0F172A' },

  // Map
  mapWrap: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  // Uber-style center pin
  pinWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // Offset up by half the pin height so the tip sits at the center
    marginTop: -36,
  },
  pinContainer: { alignItems: 'center' },
  pinHead: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0F52BA',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 5,
  },
  pinHeadLifted: { transform: [{ translateY: -6 }] },
  pinStem: {
    width: 2,
    height: 14,
    backgroundColor: '#0F52BA',
    marginTop: -1,
  },
  pinStemLifted: { height: 20 },
  pinShadow: {
    width: 10,
    height: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginTop: 1,
  },

  // My location
  myLocationBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
  },
  myLocationIcon: { fontSize: 22 },

  // Search overlay
  searchWrap: {
    position: 'absolute',
    top: 64,   // below header
    left: 12,
    right: 12,
    zIndex: 20,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 6,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    paddingVertical: 2,
  },
  clearIcon: { fontSize: 14, color: '#98A2B3', fontWeight: '700' },

  // Suggestions
  suggestionList: { maxHeight: 240 },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  suggestionPin: { fontSize: 16 },
  suggestionText: { flex: 1 },
  suggestionMain: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  suggestionSub: { fontSize: 12, color: '#667085', marginTop: 2 },
  suggestionSep: { height: 1, backgroundColor: '#F2F4F7', marginHorizontal: 14 },

  // Bottom panel
  bottomPanel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: '#E4E7EC',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 8,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  addressPin: { fontSize: 18, marginTop: 1 },
  addressText: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    lineHeight: 20,
  },
  confirmBtn: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#0F52BA',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
  },
  confirmBtnDisabled: { backgroundColor: '#98A2B3', shadowOpacity: 0 },
  confirmText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});

export default LocationPickerSheet;
