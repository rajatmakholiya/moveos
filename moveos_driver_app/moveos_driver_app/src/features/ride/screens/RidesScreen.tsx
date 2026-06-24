import React, { useMemo, useState } from 'react';
import {
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackButton from '../../shared/components/BackButton';

type RideStatus = 'completed' | 'cancelled' | 'scheduled';

type Ride = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  amount: string;
  pickup: string;
  dropoff: string;
  vehicle: string;
  status: RideStatus;
  mapPreview: string;
};

const RidesScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'AppShell'>>();
  const [activeTab, setActiveTab] = useState<'past' | 'upcoming'>('past');

  const rides = useMemo<Ride[]>(() => {
    return [
      {
        id: 'r1',
        dateLabel: 'Oct 24, 2023',
        timeLabel: '08:30 AM',
        amount: '₹840.00',
        pickup: 'Indiranagar, 100ft Road',
        dropoff: 'Kempegowda Intl Airport (Terminal 2)',
        vehicle: 'Sedan',
        status: 'completed',
        mapPreview:
          'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
      },
      {
        id: 'r2',
        dateLabel: 'Oct 22, 2023',
        timeLabel: '06:15 PM',
        amount: '₹320.50',
        pickup: 'Koramangala 4th Block',
        dropoff: 'MG Road Metro Station',
        vehicle: 'Hatchback',
        status: 'completed',
        mapPreview:
          'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1200&q=80',
      },
      {
        id: 'r3',
        dateLabel: 'Oct 20, 2023',
        timeLabel: '11:45 AM',
        amount: '₹150.00',
        pickup: 'Whitefield Main Road',
        dropoff: 'Phoenix Marketcity Mall',
        vehicle: 'SUV',
        status: 'cancelled',
        mapPreview:
          'https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=1200&q=80',
      },
      {
        id: 'r4',
        dateLabel: 'Tomorrow',
        timeLabel: '08:30 AM',
        amount: '₹680.00',
        pickup: 'HSR Layout, 17th Cross',
        dropoff: 'Terminal 2, KIA Airport',
        vehicle: 'Sedan',
        status: 'scheduled',
        mapPreview:
          'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
      },
    ];
  }, []);

  const visibleRides = rides.filter((ride) =>
    activeTab === 'past' ? ride.status !== 'scheduled' : ride.status === 'scheduled',
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Your Trips</Text>
        <Pressable hitSlop={8} style={styles.headerAction}>
          <Text style={styles.headerIcon}>☰</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tabItem, activeTab === 'past' ? styles.tabItemActive : null]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabLabel, activeTab === 'past' && styles.tabLabelActive]}>
            Past
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabItem, activeTab === 'upcoming' ? styles.tabItemActive : null]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabLabel, activeTab === 'upcoming' && styles.tabLabelActive]}>
            Upcoming
          </Text>
        </Pressable>
      </View>

      {activeTab === 'upcoming' ? (
        <Pressable
          style={styles.upcomingCta}
          onPress={() => navigation.navigate('UpcomingRides')}
        >
          <Text style={styles.upcomingCtaText}>Open upcoming schedule</Text>
        </Pressable>
      ) : null}

      <ScrollView contentContainerStyle={styles.listContent}>
        {visibleRides.map((ride) => (
          <Pressable
            key={ride.id}
            style={styles.card}
            onPress={() =>
              navigation.navigate('RideDetail', {
                ride: {
                  ...ride,
                  driver: 'Anil Kumar',
                  driverRating: 4.9,
                  distance: '32 km',
                  duration: '48 min',
                  paymentMethod: 'UPI • **** 1245',
                },
              })
            }
          >
            <ImageBackground
              source={{ uri: ride.mapPreview }}
              style={styles.cardMap}
              imageStyle={styles.cardMapImage}
            >
              <View style={styles.mapTint} />
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

            <View style={styles.cardBody}>
              <Text style={styles.datetime}>
                {ride.dateLabel} • {ride.timeLabel}
              </Text>
              <View style={styles.amountRow}>
                <Text
                  style={[
                    styles.amount,
                    ride.status === 'cancelled' ? styles.amountCancelled : null,
                  ]}
                >
                  {ride.amount}
                </Text>
                <Text style={styles.vehicle}>{ride.vehicle}</Text>
              </View>

              <View style={styles.timeline}>
                <View style={styles.timelineMarker} />
                <View style={styles.timelineLine} />
                <View style={[styles.timelineMarker, styles.timelineMarkerEnd]} />
              </View>

              <View style={styles.stops}>
                <View style={styles.stop}>
                  <View style={styles.stopDot} />
                  <View>
                    <Text style={styles.stopLabel}>Pickup</Text>
                    <Text style={styles.stopText}>{ride.pickup}</Text>
                  </View>
                </View>
                <View style={styles.stop}>
                  <View style={[styles.stopDot, styles.stopDotEnd]} />
                  <View>
                    <Text style={styles.stopLabel}>Drop-off</Text>
                    <Text style={styles.stopText}>{ride.dropoff}</Text>
                  </View>
                </View>
              </View>

              {ride.status === 'scheduled' ? (
                <View style={styles.actionsRow}>
                  <Pressable style={[styles.actionButton, styles.actionGhost]}>
                    <Text style={styles.actionGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[styles.actionButton, styles.actionPrimary]}>
                    <Text style={styles.actionPrimaryText}>Edit Trip</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.receiptButton}>
                  <Text style={styles.receiptText}>View receipt</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

function getStatusPillStyle(status: RideStatus) {
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
  headerAction: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#E4E7EC',
  },
  upcomingCta: {
    marginTop: 12,
    marginHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  upcomingCtaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F52BA',
  },
  tabItem: {
    marginRight: 24,
    paddingVertical: 12,
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderColor: '#0F52BA',
  },
  tabLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#98A2B3',
  },
  tabLabelActive: {
    color: '#0F52BA',
  },
  listContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 6,
    overflow: 'hidden',
  },
  cardMap: {
    height: 140,
  },
  cardMapImage: {
    width: '100%',
    height: '100%',
  },
  mapTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  statusText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  cardBody: {
    padding: 14,
    gap: 8,
  },
  datetime: {
    fontSize: 13,
    color: '#475467',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  amountCancelled: {
    textDecorationLine: 'line-through',
    color: '#98A2B3',
  },
  vehicle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475467',
  },
  timeline: {
    position: 'absolute',
    left: 16,
    top: 120,
    bottom: 70,
    alignItems: 'center',
  },
  timelineMarker: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#0F52BA',
  },
  timelineMarkerEnd: {
    backgroundColor: '#0E8C5F',
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#D0D5DD',
  },
  stops: {
    marginTop: 4,
    gap: 10,
    paddingLeft: 30,
  },
  stop: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  stopDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#0F52BA',
    marginTop: 6,
  },
  stopDotEnd: {
    backgroundColor: '#0E8C5F',
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
  },
  actionsRow: {
    marginTop: 8,
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
  receiptButton: {
    marginTop: 6,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#EEF2F6',
  },
  receiptText: {
    color: '#0F52BA',
    fontWeight: '800',
  },
});

export default RidesScreen;
