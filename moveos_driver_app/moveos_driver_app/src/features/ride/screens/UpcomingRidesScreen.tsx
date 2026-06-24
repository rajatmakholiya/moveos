import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import BackButton from '../../shared/components/BackButton';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'UpcomingRides'>;

type UpcomingRide = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  amount: string;
  pickup: string;
  dropoff: string;
  vehicle: string;
  status: 'scheduled';
  mapPreview: string;
};

const UpcomingRidesScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();

  const upcomingRides = useMemo<UpcomingRide[]>(() => {
    return [
      {
        id: 'u1',
        dateLabel: 'Tomorrow',
        timeLabel: '08:30 AM',
        amount: 'INR 680.00',
        pickup: 'HSR Layout, 17th Cross',
        dropoff: 'Terminal 2, KIA Airport',
        vehicle: 'Sedan',
        status: 'scheduled',
        mapPreview:
          'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
      },
      {
        id: 'u2',
        dateLabel: 'Fri, Oct 27',
        timeLabel: '06:10 PM',
        amount: 'INR 420.00',
        pickup: 'Indiranagar, 100ft Road',
        dropoff: 'MG Road Metro Station',
        vehicle: 'Hatchback',
        status: 'scheduled',
        mapPreview:
          'https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=1200&q=80',
      },
    ];
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Upcoming rides</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Manage your scheduled rides and make changes before pickup.
        </Text>

        {upcomingRides.map((ride) => (
          <View key={ride.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.dateText}>{ride.dateLabel}</Text>
                <Text style={styles.timeText}>{ride.timeLabel}</Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>Scheduled</Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>Pickup</Text>
                <Text style={styles.detailValue}>{ride.pickup}</Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>Drop-off</Text>
                <Text style={styles.detailValue}>{ride.dropoff}</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{ride.vehicle}</Text>
              <Text style={styles.metaText}>{ride.amount}</Text>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={[styles.actionButton, styles.actionGhost]}
                onPress={() => navigation.navigate('RideScheduler')}
              >
                <Text style={styles.actionGhostText}>Reschedule</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.actionPrimary]}
                onPress={() =>
                  navigation.navigate('RideDetail', {
                    ride: {
                      id: ride.id,
                      status: ride.status,
                      amount: ride.amount,
                      dateLabel: ride.dateLabel,
                      timeLabel: ride.timeLabel,
                      pickup: ride.pickup,
                      dropoff: ride.dropoff,
                      vehicle: ride.vehicle,
                      driver: 'Assigned later',
                      driverRating: undefined,
                      distance: 'N/A',
                      duration: 'N/A',
                      paymentMethod: 'UPI - **** 1245',
                      mapPreview: ride.mapPreview,
                    },
                  })
                }
              >
                <Text style={styles.actionPrimaryText}>View details</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    paddingHorizontal: 16,
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    paddingVertical: 12,
    gap: 16,
    paddingBottom: 30,
  },
  subtitle: {
    fontSize: 14,
    color: '#475467',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475467',
  },
  timeText: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusPill: {
    backgroundColor: '#E8F0FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F52BA',
  },
  detailRow: {
    flexDirection: 'row',
  },
  detailBlock: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#98A2B3',
    textTransform: 'uppercase',
  },
  detailValue: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475467',
  },
  actions: {
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
});

export default UpcomingRidesScreen;
