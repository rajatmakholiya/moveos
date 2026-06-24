import React from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { DriverButton } from '@/features/driver/components/DriverButton';
import { useDriverTrips } from '@/features/driver/api/driverClient';
import { formatDateTime } from '@/utils/date';
import type { RootStackParamList } from '@/navigation/types';
import type { Trip } from '@/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'AppShell'>;

export default function DriverTripsScreen() {
  const navigation = useNavigation<Navigation>();
  const trips = useDriverTrips('future');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Trips</Text>
          <Text style={styles.subtitle}>Post and manage your departures.</Text>
        </View>
        <DriverButton label="Post" onPress={() => navigation.navigate('DriverPostTrip')} />
      </View>
      {trips.isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#0F52BA" /></View>
      ) : (
        <FlatList
          data={trips.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={trips.isFetching} onRefresh={() => void trips.refetch()} />}
          ListEmptyComponent={<Text style={styles.empty}>No future trips posted.</Text>}
          renderItem={({ item }) => <TripRow trip={item} onPress={() => navigation.navigate('DriverManifest', { tripId: item.id })} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

function TripRow({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View>
        <Text style={styles.route}>{trip.from} to {trip.to}</Text>
        <Text style={styles.meta}>{formatDateTime(trip.departureAt)} · {trip.vehicleName} {trip.vehicleNumber}</Text>
        <Text style={styles.meta}>{trip.frontSeatsLeft + trip.backSeatsLeft} open seats · {trip.status}</Text>
      </View>
      <Text style={styles.action}>Manifest</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#E4E7EC', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 4, color: '#667085', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  empty: { textAlign: 'center', color: '#667085', marginTop: 40 },
  separator: { height: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E4E7EC', padding: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  route: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  meta: { marginTop: 4, fontSize: 13, color: '#667085' },
  action: { color: '#0F52BA', fontWeight: '800', fontSize: 13 },
});
