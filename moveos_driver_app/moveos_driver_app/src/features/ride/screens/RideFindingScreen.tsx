import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import BackButton from '../../shared/components/BackButton';
import MapPreview from '../../shared/components/MapPreview';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'RideFinding'>;
type Route = RouteProp<RootStackParamList, 'RideFinding'>;

const RideFindingScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const pickupPoint = params.pickupCoords ?? { latitude: 19.076, longitude: 72.8777 };
  const dropoffPoint = params.dropoffCoords ?? { latitude: 19.0896, longitude: 72.8656 };

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('RideTracking', {
        driver: {
          name: 'Arjun',
          rating: 4.8,
          car: params.vehicle,
          color: 'White',
          plate: 'MH 01 AB 1234',
          avatar:
            'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=60',
        },
        pickup: params.pickup,
        dropoff: params.dropoff,
        pickupCoords: params.pickupCoords,
        dropoffCoords: params.dropoffCoords,
        eta: '3 mins',
        progress: 0.75,
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [navigation, params.dropoff, params.dropoffCoords, params.pickup, params.pickupCoords, params.vehicle]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.mapSection}>
        <MapPreview origin={pickupPoint} destination={dropoffPoint} height={320} />
        <View style={styles.mapOverlay}>
          <View style={styles.header}>
            <BackButton tone="dark" onPress={() => navigation.goBack()} />
            <Text style={styles.badge}>Booking</Text>
            <Pressable hitSlop={10}>
              <Text style={styles.headerIcon}>?</Text>
            </Pressable>
          </View>

          <View style={styles.center}>
            <View style={styles.radar}>
              <View style={styles.radarInner}>
                <Text style={{ fontSize: 28 }}>🚗</Text>
              </View>
            </View>
            <Text style={styles.title}>Looking for drivers...</Text>
            <Text style={styles.subtitle}>
              Connecting with nearby taxis in your area
            </Text>

            <View style={styles.pickupCard}>
              <Text style={styles.pickupLabel}>Pickup: {params.pickup}</Text>
              <Text style={styles.pickupSub}>Drop: {params.dropoff}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.dragHandle} />
        <View style={styles.sheetRow}>
          <Text style={styles.sheetTitle}>Finding your ride...</Text>
          <Text style={styles.matching}>Matching</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={styles.progressFill} />
        </View>

        <View style={styles.optionCard}>
          <Image
            source={{ uri: 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png' }}
            style={styles.optionIcon}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>{params.vehicle}</Text>
            <Text style={styles.optionMeta}>Comfortable 4-seater</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.optionPrice}>{params.price}</Text>
            <Text style={styles.optionMeta}>Fixed price</Text>
          </View>
        </View>

        <Pressable style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel Request</Text>
        </Pressable>
        <Text style={styles.feeNote}>
          A small fee may apply if you cancel after a driver accepts.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  mapSection: {
    position: 'relative',
    height: 320,
    marginBottom: 10,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    paddingTop: 12,
  },
  header: {
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
  badge: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F52BA',
  },
  center: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  radar: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,82,186,0.08)',
  },
  radarInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#475467',
    textAlign: 'center',
  },
  pickupCard: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 5,
  },
  pickupLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickupSub: {
    fontSize: 13,
    color: '#475467',
    marginTop: 4,
  },
  sheet: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: -6 },
    shadowRadius: 14,
    elevation: 10,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 60,
    height: 6,
    borderRadius: 99,
    backgroundColor: '#E4E7EC',
  },
  sheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  matching: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F52BA',
    textTransform: 'uppercase',
  },
  progressBar: {
    height: 8,
    borderRadius: 99,
    backgroundColor: '#E4E7EC',
    overflow: 'hidden',
  },
  progressFill: {
    width: '72%',
    height: '100%',
    backgroundColor: '#0F52BA',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    gap: 12,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEF2F6',
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  optionMeta: {
    fontSize: 13,
    color: '#475467',
  },
  optionPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cancelButton: {
    backgroundColor: '#0F52BA',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  cancelText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  feeNote: {
    fontSize: 12,
    color: '#475467',
    textAlign: 'center',
  },
  confirmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 16,
    elevation: 8,
  },
  confirmIconWrap: {
    alignSelf: 'center',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmIcon: {
    fontSize: 28,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  confirmSubtitle: {
    fontSize: 14,
    color: '#475467',
    textAlign: 'center',
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 10,
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  driverMeta: {
    fontSize: 13,
    color: '#475467',
  },
  carThumb: {
    width: 52,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EEF2F6',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#F0FBF4',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0E8C5F',
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  trackButton: {
    marginTop: 4,
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#065F46',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 6,
  },
  trackText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  cancelLink: {
    textAlign: 'center',
    color: '#475467',
    marginTop: 6,
    fontWeight: '700',
  },
});

export default RideFindingScreen;
