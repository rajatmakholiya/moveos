import React, { useMemo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import BackButton from '../../shared/components/BackButton';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'RideTracking'>;
type Route = RouteProp<RootStackParamList, 'RideTracking'>;

const RideTrackingScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const [tripStarted, setTripStarted] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [completionFired, setCompletionFired] = React.useState(false);

  const pickupPoint = params.pickupCoords ?? { latitude: 19.076, longitude: 72.8777 };
  const dropoffPoint = params.dropoffCoords ?? { latitude: 19.0896, longitude: 72.8656 };

  const safeProgress = Math.min(Math.max(progress, 0), 1);
  const carPosition = useMemo(() => {
    const lat =
      pickupPoint.latitude + (dropoffPoint.latitude - pickupPoint.latitude) * safeProgress;
    const lng =
      pickupPoint.longitude + (dropoffPoint.longitude - pickupPoint.longitude) * safeProgress;
    return { latitude: lat, longitude: lng };
  }, [dropoffPoint.latitude, dropoffPoint.longitude, pickupPoint.latitude, pickupPoint.longitude, safeProgress]);

  React.useEffect(() => {
    if (!tripStarted) return;
    if (completionFired) return;

    const interval = setInterval(() => {
      setProgress((current) => {
        const next = Math.min(current + 0.05, 1);
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [tripStarted, completionFired]);

  React.useEffect(() => {
    if (!tripStarted) return;
    if (completionFired) return;
    if (safeProgress < 1) return;

    setCompletionFired(true);
    navigation.navigate('RideComplete', {
      fare: '₹370.00',
      promo: 'Saved ₹45.00 with promo',
      driver: { name: params.driver.name, avatar: params.driver.avatar },
      breakdown: [
        { label: 'Distance (12.5 km)', value: '₹180.00' },
        { label: 'Time (45 mins)', value: '₹120.00' },
        { label: 'Tolls & Taxes', value: '₹50.00' },
      ],
      paymentMethod: 'Google Pay • .... 4821',
    });
  }, [completionFired, navigation, params.driver.avatar, params.driver.name, safeProgress, tripStarted]);

  const handleShareOtp = () => {
    setTripStarted(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.mapWrapper}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: (pickupPoint.latitude + dropoffPoint.latitude) / 2,
            longitude: (pickupPoint.longitude + dropoffPoint.longitude) / 2,
            latitudeDelta: Math.abs(pickupPoint.latitude - dropoffPoint.latitude) * 1.6 || 0.1,
            longitudeDelta: Math.abs(pickupPoint.longitude - dropoffPoint.longitude) * 1.6 || 0.1,
          }}
        >
          <Marker coordinate={pickupPoint} title="Pickup" />
          <Marker coordinate={dropoffPoint} title="Drop-off" pinColor="#0F52BA" />
          <Marker coordinate={carPosition} title="Driver" pinColor="#16A34A" />
          <Polyline
            coordinates={[pickupPoint, carPosition, dropoffPoint]}
            strokeColor="#0F52BA"
            strokeWidth={5}
            lineDashPattern={[10, 8]}
          />
        </MapView>
        <View style={styles.mapTopBar}>
          <BackButton tone="dark" onPress={() => navigation.goBack()} />
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>Moveos Premium</Text>
          </View>
          <Pressable hitSlop={8}>
            <Text style={[styles.headerIcon, { color: '#D92D20' }]}>SOS</Text>
          </Pressable>
        </View>
        <View style={styles.arrivingPill}>
          <Text style={styles.arrivingText}>Arriving in {params.eta}</Text>
        </View>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
        <View style={styles.dragHandle} />

        {tripStarted ? (
          <>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>On trip</Text>
              <Text style={styles.progressValue}>
                {Math.round(safeProgress * 100)}% of route completed
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${safeProgress * 100}%` }]} />
            </View>
          </>
        ) : (
          <View style={styles.preOtpBanner}>
            <Text style={styles.preOtpTitle}>Waiting for OTP</Text>
            <Text style={styles.preOtpSubtitle}>Share the OTP to start trip progress</Text>
            <Pressable style={styles.shareOtpButton} onPress={handleShareOtp}>
              <Text style={styles.shareOtpText}>I’ve shared the OTP</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.otpCard}>
          <Text style={styles.otpLabel}>Ride OTP</Text>
          <Text style={styles.otpValue}>2584</Text>
          <Text style={styles.otpHelp}>Share this with your driver to start the trip</Text>
          {tripStarted ? (
            <View style={styles.otpStatusPill}>
              <Text style={styles.otpStatusText}>OTP verified</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.driverRow}>
          <Image source={{ uri: params.driver.avatar }} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName}>{params.driver.name}</Text>
            <Text style={styles.driverMeta}>
              {params.driver.car} • {params.driver.color}
            </Text>
            <Text style={styles.driverMeta}>⭐ {params.driver.rating.toFixed(1)}</Text>
          </View>
          <View style={styles.plate}>
            <Text style={styles.plateText}>{params.driver.plate}</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={[styles.primaryButton, { flex: 1.1 }]}>
            <Text style={styles.primaryButtonText}>Call Driver</Text>
          </Pressable>
          <Pressable style={[styles.secondaryButton, { flex: 1 }]}>
            <Text style={styles.secondaryButtonText}>Chat</Text>
          </Pressable>
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={[styles.shareButton, { flex: 1 }]}>
            <Text style={styles.shareButtonText}>Share Trip</Text>
          </Pressable>
          <Pressable style={[styles.cancelButton, { flex: 1 }]}>
            <Text style={styles.cancelButtonText}>Cancel Ride</Text>
          </Pressable>
        </View>

        <View style={styles.adCard}>
          <Text style={styles.adTitle}>Moveos Plus</Text>
          <Text style={styles.adSubtitle}>Priority pickups and 10% off on weekly rides.</Text>
          <Pressable style={styles.adCta}>
            <Text style={styles.adCtaText}>Upgrade</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mapWrapper: {
    height: 340,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
  },
  mapTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerIcon: {
    fontSize: 18,
    color: '#0F172A',
  },
  tagPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 5,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  arrivingPill: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(15,82,186,0.9)',
    borderRadius: 16,
  },
  arrivingText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 12,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 60,
    height: 6,
    borderRadius: 99,
    backgroundColor: '#E4E7EC',
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  progressValue: {
    fontSize: 12,
    color: '#475467',
  },
  progressBar: {
    height: 8,
    borderRadius: 99,
    backgroundColor: '#E4E7EC',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0F52BA',
  },
  otpCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    alignItems: 'center',
    gap: 6,
  },
  otpLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475467',
  },
  otpValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 3,
  },
  otpHelp: {
    fontSize: 12,
    color: '#475467',
  },
  otpStatusPill: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E8F5E9',
  },
  otpStatusText: {
    color: '#16A34A',
    fontWeight: '800',
    fontSize: 12,
  },
  preOtpBanner: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    gap: 6,
  },
  preOtpTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  preOtpSubtitle: {
    fontSize: 12,
    color: '#475467',
  },
  shareOtpButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#0F52BA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  shareOtpText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEF2F6',
  },
  driverName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  driverMeta: {
    fontSize: 13,
    color: '#475467',
  },
  plate: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  plateText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: '#F5F6F7',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 15,
  },
  shareButton: {
    backgroundColor: '#E8F0FF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFD4FF',
  },
  shareButtonText: {
    color: '#0F52BA',
    fontWeight: '800',
  },
  cancelButton: {
    backgroundColor: '#FEE4E2',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDB4A8',
  },
  cancelButtonText: {
    color: '#D92D20',
    fontWeight: '800',
  },
  adCard: {
    marginTop: 6,
    backgroundColor: '#0F52BA',
    borderRadius: 16,
    padding: 14,
    gap: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 6,
  },
  adTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  adSubtitle: {
    color: '#E0EAFF',
    fontSize: 13,
  },
  adCta: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  adCtaText: {
    color: '#0F52BA',
    fontWeight: '800',
  },
});

export default RideTrackingScreen;
