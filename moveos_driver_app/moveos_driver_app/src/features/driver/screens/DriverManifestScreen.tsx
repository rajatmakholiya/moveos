import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import Toast from 'react-native-toast-message';

import { DriverButton } from '@/features/driver/components/DriverButton';
import { DriverCard } from '@/features/driver/components/DriverCard';
import { ManifestPassenger, useDriverAction, useDriverManifest } from '@/features/driver/api/driverClient';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatDateTime } from '@/utils/date';
import type { RootStackParamList } from '@/navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'DriverManifest'>;
type Route = RouteProp<RootStackParamList, 'DriverManifest'>;

export default function DriverManifestScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const token = useAuthStore((s) => s.token);
  const manifest = useDriverManifest(params.tripId);
  const action = useDriverAction();
  const [sharing, setSharing] = useState(false);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) Geolocation.clearWatch(watchRef.current);
    };
  }, []);

  const trip = manifest.data?.trip;
  const passengers = manifest.data?.passengers ?? [];

  const runTripAction = (name: 'depart' | 'complete' | 'cancel') => {
    action.mutate(
      { path: `/driver/trips/${encodeURIComponent(params.tripId)}/${name}` },
      {
        onSuccess: () => void manifest.refetch(),
        onError: () => Toast.show({ type: 'error', text1: `Could not ${name} trip` }),
      },
    );
  };

  const passengerAction = (bookingId: string, name: 'arrive-pickup' | 'request-otp' | 'dropoff' | 'no-show') => {
    action.mutate(
      { path: `/driver/trips/${encodeURIComponent(params.tripId)}/bookings/${encodeURIComponent(bookingId)}/${name}`, body: name === 'no-show' ? { reason: 'Driver marked no-show' } : {} },
      {
        onSuccess: () => void manifest.refetch(),
        onError: () => Toast.show({ type: 'error', text1: 'Passenger action failed' }),
      },
    );
  };

  const startLocationSharing = () => {
    if (watchRef.current !== null) return;
    watchRef.current = Geolocation.watchPosition(
      (position) => {
        void api.post('/telemetry/location', {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          tripId: params.tripId,
        }, token);
      },
      () => {
        setSharing(false);
        Toast.show({ type: 'error', text1: 'Location permission is required' });
      },
      { enableHighAccuracy: true, distanceFilter: 25, interval: 15000, fastestInterval: 8000 },
    );
    setSharing(true);
  };

  const stopLocationSharing = () => {
    if (watchRef.current !== null) {
      Geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setSharing(false);
  };

  if (manifest.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color="#0F52BA" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>Back</Text></Pressable>
        <Text style={styles.title}>Manifest</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={manifest.isFetching} onRefresh={() => void manifest.refetch()} />}
      >
        {trip ? (
          <DriverCard title={`${trip.from} to ${trip.to}`} subtitle={`${formatDateTime(trip.departureAt)} · ${trip.status}`} right={`${passengers.length} riders`}>
            <View style={styles.actionsGrid}>
              <DriverButton label="Depart" onPress={() => runTripAction('depart')} loading={action.isPending} disabled={trip.status !== 'OPEN'} />
              <DriverButton label={sharing ? 'Stop GPS' : 'Share GPS'} variant="secondary" onPress={sharing ? stopLocationSharing : startLocationSharing} />
            </View>
            <DriverButton label="Complete trip" variant="secondary" onPress={() => runTripAction('complete')} loading={action.isPending} disabled={trip.status !== 'DEPARTED'} />
            <DriverButton label="Cancel trip" variant="danger" onPress={() => Alert.alert('Cancel trip?', 'This will cancel the departure.', [{ text: 'No' }, { text: 'Cancel', style: 'destructive', onPress: () => runTripAction('cancel') }])} />
          </DriverCard>
        ) : (
          <DriverCard title="Trip unavailable" subtitle="The backend did not return trip details." />
        )}

        <Text style={styles.sectionTitle}>Passengers</Text>
        {passengers.length === 0 ? (
          <DriverCard title="No bookings yet" subtitle="Confirmed bookings will appear here." />
        ) : passengers.map((passenger) => (
          <PassengerCard
            key={passenger.id}
            passenger={passenger}
            loading={action.isPending}
            onAction={passengerAction}
            tripId={params.tripId}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function PassengerCard({ passenger, loading, onAction }: {
  passenger: ManifestPassenger;
  loading: boolean;
  tripId: string;
  onAction: (bookingId: string, action: 'arrive-pickup' | 'request-otp' | 'dropoff' | 'no-show') => void;
}) {
  const openMaps = (kind: 'pickup' | 'dropoff') => {
    const point = kind === 'pickup' ? passenger.pickup : passenger.dropoff;
    if (point?.lat && point.lng) {
      void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`);
    }
  };

  return (
    <DriverCard title={passenger.passengerName || passenger.bookingCode} subtitle={`${passenger.seatType} · ${passenger.status}`} right={passenger.paymentStatus}>
      <Text style={styles.passengerMeta}>{passenger.passengerPhone}</Text>
      <Pressable onPress={() => openMaps('pickup')}><Text style={styles.location}>Pickup: {passenger.pickup?.label ?? '-'}</Text></Pressable>
      <Pressable onPress={() => openMaps('dropoff')}><Text style={styles.location}>Drop: {passenger.dropoff?.label ?? '-'}</Text></Pressable>
      <View style={styles.passengerActions}>
        <DriverButton label="Arrived" variant="secondary" loading={loading} onPress={() => onAction(passenger.id, 'arrive-pickup')} />
        <DriverButton label="OTP" variant="secondary" loading={loading} onPress={() => onAction(passenger.id, 'request-otp')} />
      </View>
      <View style={styles.passengerActions}>
        <DriverButton label="Drop off" loading={loading} onPress={() => onAction(passenger.id, 'dropoff')} />
        <DriverButton label="No-show" variant="danger" loading={loading} onPress={() => onAction(passenger.id, 'no-show')} />
      </View>
    </DriverCard>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#E4E7EC' },
  back: { width: 64, color: '#0F52BA', fontWeight: '800' },
  title: { flex: 1, textAlign: 'center', color: '#0F172A', fontSize: 18, fontWeight: '800' },
  headerSpacer: { width: 64 },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  actionsGrid: { flexDirection: 'row', gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  passengerMeta: { color: '#475467', fontSize: 13 },
  location: { color: '#0F52BA', fontSize: 13, fontWeight: '700' },
  passengerActions: { flexDirection: 'row', gap: 10 },
});
