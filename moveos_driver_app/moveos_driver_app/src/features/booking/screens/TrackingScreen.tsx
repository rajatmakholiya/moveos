import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useBooking } from '@/features/booking/hooks/useBooking';
import { useTrackingSocket } from '@/features/booking/hooks/useTrackingSocket';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { readNumber, readString, safeRecord } from '@/utils/object';
import type { DriverLocation } from '@/types';
import type { RootStackParamList } from '@/navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'PassengerTracking'>;
type Route = RouteProp<RootStackParamList, 'PassengerTracking'>;

const POLL_INTERVAL_MS = 15_000;

type Coordinate = { lat: number; lng: number; label?: string };
type TripPhase = 'EN_ROUTE_TO_PICKUP' | 'ONBOARD_TO_DROPOFF' | 'DROPPED_OFF';

type TripPosition = {
  driverLocation: DriverLocation | null;
  myPickup: Coordinate | null;
  myDropoff: Coordinate | null;
  phase: TripPhase;
  stopsBeforeMe: number;
  pickedUpCount: number;
  totalPassengers: number;
  distanceKmToPickup: number | null;
  distanceKmToDropoff: number | null;
  dropsBeforeMe: number;
  driverArrivedAtMyPickup: boolean;
  driverArrivedAtMyDropoff: boolean;
  pickedUpAt: string | null;
  droppedOffAt: string | null;
  tripStatus: string;
};

type PickupOtpStatus = { status: string; otp?: string };

function etaLabel(km: number) {
  const minutes = Math.max(1, Math.round((km / 40) * 60));
  return minutes < 60 ? `~${minutes} min` : `~${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function parseTripPosition(payload: unknown): TripPosition | null {
  const wrapper = safeRecord(payload);
  const pos = safeRecord(wrapper?.data ?? payload);
  if (!pos) return null;

  const driverLoc = safeRecord(pos.driverLocation);
  const pickup = safeRecord(pos.myPickup);
  const dropoff = safeRecord(pos.myDropoff);

  return {
    driverLocation: driverLoc?.lat && driverLoc?.lng
      ? { lat: Number(driverLoc.lat), lng: Number(driverLoc.lng), updatedAt: String(driverLoc.updatedAt ?? '') }
      : null,
    myPickup: pickup?.lat && pickup?.lng
      ? { lat: Number(pickup.lat), lng: Number(pickup.lng), label: readString(pickup, ['label']) }
      : null,
    myDropoff: dropoff?.lat && dropoff?.lng
      ? { lat: Number(dropoff.lat), lng: Number(dropoff.lng), label: readString(dropoff, ['label']) }
      : null,
    phase: readString(pos, ['phase'], 'EN_ROUTE_TO_PICKUP') as TripPhase,
    stopsBeforeMe: readNumber(pos, ['stopsBeforeMe'], 0),
    pickedUpCount: readNumber(pos, ['pickedUpCount'], 0),
    totalPassengers: readNumber(pos, ['totalPassengers'], 0),
    distanceKmToPickup: pos.distanceKmToPickup != null ? Number(pos.distanceKmToPickup) : null,
    distanceKmToDropoff: pos.distanceKmToDropoff != null ? Number(pos.distanceKmToDropoff) : null,
    dropsBeforeMe: readNumber(pos, ['dropsBeforeMe'], 0),
    driverArrivedAtMyPickup: pos.driverArrivedAtMyPickup === true,
    driverArrivedAtMyDropoff: pos.driverArrivedAtMyDropoff === true,
    pickedUpAt: pos.pickedUpAt ? String(pos.pickedUpAt) : null,
    droppedOffAt: pos.droppedOffAt ? String(pos.droppedOffAt) : null,
    tripStatus: readString(pos, ['tripStatus'], 'OPEN'),
  };
}

const TrackingScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const token = useAuthStore((s) => s.token);
  const { data: booking, refetch } = useBooking(params.bookingId);
  const [position, setPosition] = useState<TripPosition | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [otpStatus, setOtpStatus] = useState<PickupOtpStatus | null>(null);
  const [otpRefreshing, setOtpRefreshing] = useState(false);
  const mapRef = useRef<MapView>(null);
  const { driverLocation: wsDriverLocation, bookingUpdate, wsStatus } = useTrackingSocket(params.bookingId);

  const loadPosition = useCallback(async () => {
    try {
      const response = await api.get<unknown>(`/bookings/${encodeURIComponent(params.bookingId)}/trip-position`, token);
      const next = parseTripPosition(response);
      if (next) {
        setPosition(next);
        setLastUpdated(new Date().toLocaleTimeString());
        if (next.driverLocation) {
          mapRef.current?.animateToRegion({
            latitude: next.driverLocation.lat,
            longitude: next.driverLocation.lng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }, 500);
        }
      }
    } catch {
      // Fall back to the legacy telemetry endpoint below if trip-position is not ready.
      try {
        const loc = await api.get<DriverLocation>(`/telemetry/location?bookingId=${params.bookingId}`, token);
        setPosition((prev) => ({
          ...(prev ?? {
            myPickup: null,
            myDropoff: null,
            phase: 'EN_ROUTE_TO_PICKUP',
            stopsBeforeMe: 0,
            pickedUpCount: 0,
            totalPassengers: 0,
            distanceKmToPickup: null,
            distanceKmToDropoff: null,
            dropsBeforeMe: 0,
            driverArrivedAtMyPickup: false,
            driverArrivedAtMyDropoff: false,
            pickedUpAt: null,
            droppedOffAt: null,
            tripStatus: booking?.tripStatus ?? 'OPEN',
          }),
          driverLocation: loc,
        }));
        setLastUpdated(new Date().toLocaleTimeString());
      } catch {
        // Driver may not have shared location yet.
      }
    }
  }, [booking?.tripStatus, params.bookingId, token]);

  useEffect(() => {
    void loadPosition();
    const interval = setInterval(() => void loadPosition(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadPosition]);

  useEffect(() => {
    if (!wsDriverLocation) return;
    setPosition((prev) => prev ? {
      ...prev,
      driverLocation: {
        lat: wsDriverLocation.lat,
        lng: wsDriverLocation.lng,
        updatedAt: wsDriverLocation.updatedAt,
      },
    } : prev);
    setLastUpdated(new Date().toLocaleTimeString());
  }, [wsDriverLocation]);

  useEffect(() => {
    if (!bookingUpdate) return;
    void refetch();
    void loadPosition();
    if (bookingUpdate.droppedOff || bookingUpdate.droppedOffAt) {
      Alert.alert('Trip complete', 'You have reached your destination.');
    }
  }, [bookingUpdate, loadPosition, refetch]);

  const refreshOtpStatus = useCallback(async () => {
    setOtpRefreshing(true);
    try {
      const response = await api.get<unknown>(`/bookings/${encodeURIComponent(params.bookingId)}/pickup-otp-status`, token);
      const record = safeRecord(response);
      const data = safeRecord(record?.data ?? response);
      setOtpStatus(data ? {
        status: readString(data, ['status']),
        otp: readString(data, ['otp']) || undefined,
      } : null);
    } catch {
      setOtpStatus(null);
    } finally {
      setOtpRefreshing(false);
    }
  }, [params.bookingId, token]);

  useEffect(() => {
    const shouldLoadOtp = position?.tripStatus === 'DEPARTED' && !position?.pickedUpAt;
    if (!shouldLoadOtp) {
      setOtpStatus(null);
      return;
    }
    void refreshOtpStatus();
  }, [position?.pickedUpAt, position?.tripStatus, refreshOtpStatus]);

  const driverLocation = position?.driverLocation ?? null;
  const isBoarded = position?.phase === 'ONBOARD_TO_DROPOFF';
  const mapTarget = isBoarded ? position?.myDropoff ?? null : position?.myPickup ?? null;
  const distanceKm = isBoarded ? position?.distanceKmToDropoff : position?.distanceKmToPickup;
  const openMapsUrl = useMemo(() => {
    const target = mapTarget;
    if (driverLocation && target) {
      return `https://www.google.com/maps/dir/?api=1&origin=${driverLocation.lat},${driverLocation.lng}&destination=${target.lat},${target.lng}&travelmode=driving`;
    }
    const point = driverLocation ?? target;
    return point ? `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}` : null;
  }, [driverLocation, mapTarget]);

  const defaultRegion: Region = {
    latitude: 29.3803,
    longitude: 79.4636,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  };

  const mapRegion: Region | undefined = driverLocation
    ? {
        latitude: driverLocation.lat,
        longitude: driverLocation.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Map */}
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={mapRegion ?? defaultRegion}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {driverLocation && (
            <Marker
              coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
              title={booking?.driverName ?? 'Driver'}
              description={booking?.vehicleNumber}
            >
              <View style={styles.driverMarker}>
                <Text style={styles.driverMarkerIcon}>🚗</Text>
              </View>
            </Marker>
          )}
          {mapTarget && (
            <Marker
              coordinate={{ latitude: mapTarget.lat, longitude: mapTarget.lng }}
              title={isBoarded ? 'Your drop point' : 'Your pickup point'}
              pinColor={isBoarded ? '#0F52BA' : '#16A34A'}
            />
          )}
        </MapView>

        {/* Top bar overlay */}
        <View style={styles.mapTopBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <View style={styles.routePill}>
            {booking ? (
              <View>
                <Text style={styles.routePillText} numberOfLines={1}>
                  {booking.from} → {booking.to}
                </Text>
                <Text style={styles.liveStatus}>{wsStatus === 'connected' ? 'Live' : 'Reconnecting'}</Text>
              </View>
            ) : (
              <ActivityIndicator color="#0F172A" size="small" />
            )}
          </View>
        </View>

        {/* No location banner */}
        {!driverLocation && (
          <View style={styles.waitingBanner}>
            <ActivityIndicator color="#FFFFFF" size="small" />
            <Text style={styles.waitingText}>Waiting for driver location…</Text>
          </View>
        )}

        {/* Last updated */}
        {lastUpdated && (
          <View style={styles.updatedPill}>
            <Text style={styles.updatedText}>Updated {lastUpdated}</Text>
          </View>
        )}
      </View>

      {/* Driver info sheet */}
      <View style={styles.sheet}>
        <View style={styles.handle} />

        {booking ? (
          <>
            {position?.driverArrivedAtMyPickup && !position.pickedUpAt ? (
              <View style={styles.arrivalCard}>
                <Text style={styles.arrivalTitle}>Driver has arrived at your pickup</Text>
                <Text style={styles.arrivalSub}>Share the OTP when requested</Text>
              </View>
            ) : null}

            {otpStatus?.status === 'OTP_PENDING' && otpStatus.otp ? (
              <View style={styles.otpCard}>
                <Text style={styles.otpLabel}>Share this pickup code</Text>
                <Text style={styles.otpValue}>{otpStatus.otp}</Text>
                <Pressable style={styles.otpRefresh} onPress={() => void refreshOtpStatus()} disabled={otpRefreshing}>
                  {otpRefreshing ? <ActivityIndicator color="#0F52BA" /> : <Text style={styles.otpRefreshText}>Refresh OTP</Text>}
                </Pressable>
              </View>
            ) : null}

            {position?.tripStatus === 'DEPARTED' && !position?.pickedUpAt && otpStatus?.status === 'WAITING' ? (
              <View style={styles.waitingOtpCard}>
                <Text style={styles.waitingOtpTitle}>OTP is not available yet</Text>
                <Pressable onPress={() => void refreshOtpStatus()} disabled={otpRefreshing}>
                  <Text style={styles.waitingOtpAction}>Refresh</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.driverRow}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarLetter}>
                  {booking.driverName?.[0]?.toUpperCase() ?? 'D'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{booking.driverName}</Text>
                <Text style={styles.driverMeta}>
                  {booking.vehicleName} · {booking.vehicleNumber}
                </Text>
              </View>
              <View style={styles.codePill}>
                <Text style={styles.codeLabel}>Ticket</Text>
                <Text style={styles.codeValue}>{booking.code}</Text>
              </View>
            </View>

            {position ? (
              <View style={styles.progressCard}>
                <Text style={styles.progressTitle}>
                  {position.phase === 'DROPPED_OFF'
                    ? 'Dropped off'
                    : isBoarded
                    ? position.dropsBeforeMe > 0 ? `${position.dropsBeforeMe} drops before you` : 'On the way to your drop'
                    : position.stopsBeforeMe > 0 ? `${position.stopsBeforeMe} stops before you` : "You're next"}
                </Text>
                <Text style={styles.progressSub}>
                  {distanceKm != null ? `${distanceKm.toFixed(1)} km · ${etaLabel(distanceKm)}` : 'Waiting for route progress'}
                </Text>
              </View>
            ) : null}

            <View style={styles.infoRow}>
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxLabel}>From</Text>
                <Text style={styles.infoBoxValue}>{booking.from}</Text>
              </View>
              <View style={styles.infoBoxDivider} />
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxLabel}>To</Text>
                <Text style={styles.infoBoxValue}>{booking.to}</Text>
              </View>
              <View style={styles.infoBoxDivider} />
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxLabel}>Seat</Text>
                <Text style={styles.infoBoxValue}>{booking.seatType}</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.sheetLoading}>
            <ActivityIndicator color="#0F52BA" />
          </View>
        )}

        <Pressable
          style={styles.viewTicketBtn}
          onPress={() => navigation.navigate('Ticket', { bookingId: params.bookingId })}
        >
          <Text style={styles.viewTicketText}>View Ticket</Text>
        </Pressable>
        {openMapsUrl ? (
          <Pressable
            style={styles.mapsBtn}
            onPress={() => void Linking.openURL(openMapsUrl)}
          >
            <Text style={styles.mapsBtnText}>Open in Maps</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  mapWrap: { flex: 1, position: 'relative' },
  map: { ...StyleSheet.absoluteFillObject },

  mapTopBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  backIcon: { fontSize: 18, color: '#0F172A', fontWeight: '700' },
  routePill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  routePillText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  liveStatus: { fontSize: 11, fontWeight: '800', color: '#0F52BA', marginTop: 2 },

  waitingBanner: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(15,82,186,0.85)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  waitingText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  updatedPill: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  updatedText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },

  driverMarker: {
    backgroundColor: '#0F52BA',
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  driverMarkerIcon: { fontSize: 18 },

  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    gap: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 99,
    backgroundColor: '#E4E7EC',
  },

  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarLetter: { fontSize: 20, fontWeight: '800', color: '#0F52BA' },
  driverName: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  driverMeta: { fontSize: 12, color: '#475467', marginTop: 2 },
  codePill: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  codeLabel: { fontSize: 10, color: '#98A2B3', fontWeight: '700', textTransform: 'uppercase' },
  codeValue: { fontSize: 15, fontWeight: '800', color: '#0F172A', letterSpacing: 1.5 },

  infoRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  infoBox: { flex: 1, padding: 12, alignItems: 'center', gap: 4 },
  infoBoxDivider: { width: 1, backgroundColor: '#E4E7EC' },
  infoBoxLabel: { fontSize: 11, fontWeight: '700', color: '#98A2B3', textTransform: 'uppercase' },
  infoBoxValue: { fontSize: 13, fontWeight: '800', color: '#0F172A', textAlign: 'center' },

  sheetLoading: { alignItems: 'center', paddingVertical: 16 },

  arrivalCard: {
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#BFD4FF',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  arrivalTitle: { fontSize: 14, fontWeight: '800', color: '#0F52BA' },
  arrivalSub: { fontSize: 12, color: '#475467', marginTop: 2 },
  otpCard: {
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#BFD4FF',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  otpLabel: { fontSize: 12, fontWeight: '800', color: '#0F52BA', textTransform: 'uppercase' },
  otpValue: { fontSize: 34, fontWeight: '800', color: '#0F52BA', letterSpacing: 8 },
  otpRefresh: { paddingHorizontal: 12, paddingVertical: 7 },
  otpRefreshText: { color: '#0F52BA', fontWeight: '800' },
  waitingOtpCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  waitingOtpTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  waitingOtpAction: { fontSize: 13, fontWeight: '800', color: '#0F52BA' },
  progressCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  progressTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  progressSub: { fontSize: 12, color: '#475467', marginTop: 3 },

  viewTicketBtn: {
    backgroundColor: '#EEF4FF',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFD4FF',
  },
  viewTicketText: { color: '#0F52BA', fontWeight: '800', fontSize: 14 },
  mapsBtn: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  mapsBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});

export default TrackingScreen;
