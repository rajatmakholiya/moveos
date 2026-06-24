import React from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import BackButton from '../../shared/components/BackButton';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'RideDetail'>;
type Route = RouteProp<RootStackParamList, 'RideDetail'>;

const RideDetailScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const ride = params.ride;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Ride details</Text>
        <Pressable hitSlop={8}>
          <Text style={styles.headerIcon}>⋮</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ImageBackground
          source={{ uri: ride.mapPreview }}
          style={styles.map}
          imageStyle={styles.mapImage}
        >
          <View style={styles.mapOverlay} />
          <View style={getStatusPillStyle(ride.status)}>
            <Text style={styles.statusText}>
              {ride.status === 'completed'
                ? 'Completed'
                : ride.status === 'cancelled'
                  ? 'Cancelled'
                  : 'Scheduled'}
            </Text>
          </View>
        </ImageBackground>

        <View style={styles.sectionCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.amount}>{ride.amount}</Text>
            <Text style={styles.meta}>
              {ride.dateLabel} • {ride.timeLabel}
            </Text>
          </View>
          <View style={[styles.rowBetween, { marginTop: 8 }]}>
            <Text style={styles.meta}>{ride.distance} • {ride.duration}</Text>
            <Text style={styles.meta}>{ride.paymentMethod}</Text>
          </View>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.stopLabel}>Pickup</Text>
              <Text style={styles.stopText}>{ride.pickup}</Text>
            </View>
          </View>
          <View style={[styles.rowBetween, { marginTop: 10 }]}>
            <View>
              <Text style={styles.stopLabel}>Drop-off</Text>
              <Text style={styles.stopText}>{ride.dropoff}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.rowBetween}>
            <View style={styles.driverRow}>
              <Image
                source={{
                  uri: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=60',
                }}
                style={styles.avatar}
              />
              <View>
                <Text style={styles.driverName}>{ride.driver}</Text>
                {ride.driverRating ? (
                  <Text style={styles.meta}>⭐ {ride.driverRating.toFixed(1)}</Text>
                ) : null}
              </View>
            </View>
            <View>
              <Text style={styles.meta}>{ride.vehicle}</Text>
              <Text style={styles.meta}>KA 01 AB 1234</Text>
            </View>
          </View>
          <View style={styles.driverActions}>
            <Pressable style={[styles.actionButton, styles.actionGhost]}>
              <Text style={styles.actionGhostText}>Lost & found</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.actionPrimary]}>
              <Text style={styles.actionPrimaryText}>Call support</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Receipt</Text>
          <View style={styles.receiptRow}>
            <Text style={styles.meta}>Trip fare</Text>
            <Text style={styles.meta}>{ride.amount}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.meta}>Taxes & fees</Text>
            <Text style={styles.meta}>Included</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={styles.meta}>Paid via</Text>
            <Text style={styles.meta}>{ride.paymentMethod}</Text>
          </View>
          <Pressable style={styles.receiptButton}>
            <Text style={styles.receiptButtonText}>Download PDF</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

function getStatusPillStyle(status: string) {
  return {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor:
      status === 'completed' ? '#16A34A' : status === 'cancelled' ? '#475467' : '#0F52BA',
  };
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  headerIcon: {
    fontSize: 18,
    color: '#0F172A',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
  },
  map: {
    height: 200,
    borderRadius: 16,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  statusText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  content: {
    paddingVertical: 12,
    gap: 12,
  },
  sectionCard: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  amount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  meta: {
    fontSize: 13,
    color: '#475467',
  },
  stopLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#98A2B3',
    textTransform: 'uppercase',
  },
  stopText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  driverActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGhost: {
    borderWidth: 1,
    borderColor: '#E4E7EC',
    backgroundColor: '#FFFFFF',
  },
  actionGhostText: {
    color: '#0F172A',
    fontWeight: '700',
  },
  actionPrimary: {
    backgroundColor: '#0F52BA',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 4,
  },
  actionPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  receiptButton: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
  },
  receiptButtonText: {
    color: '#0F52BA',
    fontWeight: '800',
  },
});

export default RideDetailScreen;
