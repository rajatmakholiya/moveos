import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useAvailableTrips } from '@/features/trips/hooks/useAvailableTrips';
import { TripCard } from '@/features/trips/components/TripCard';
import { TripDetailSheet } from '@/features/trips/components/TripDetailSheet';
import type { RootStackParamList } from '@/navigation/types';
import type { Trip, SeatType } from '@/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'TripList'>;
type Route = RouteProp<RootStackParamList, 'TripList'>;

type FilterType = 'ALL' | 'FRONT' | 'BACK';
type SortType = 'TIME' | 'PRICE';

const TripListScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();

  const [filter, setFilter] = useState<FilterType>('ALL');
  const [sort, setSort] = useState<SortType>('TIME');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  const { data: trips, isLoading, isError, refetch, isFetching } = useAvailableTrips(
    params.routeId,
    params.date,
    true,
    { id: params.routeId, from: params.from, to: params.to, durationHours: 0, distanceKm: 0 },
  );

  const filtered = useMemo<Trip[]>(() => {
    let list = trips ?? [];
    if (filter === 'FRONT') list = list.filter((t) => t.frontSeatsLeft > 0);
    if (filter === 'BACK') list = list.filter((t) => t.backSeatsLeft > 0);
    if (sort === 'TIME') {
      list = [...list].sort((a, b) => a.departureAt.localeCompare(b.departureAt));
    } else {
      list = [...list].sort((a, b) => a.frontFarePaise - b.frontFarePaise);
    }
    return list;
  }, [trips, filter, sort]);

  const handleBook = (seatType: SeatType) => {
    if (!selectedTrip) return;
    setSelectedTrip(null);
    navigation.navigate('BookingForm', {
      tripId: selectedTrip.id,
      seatType,
      trip: {
        ...selectedTrip,
        from: selectedTrip.from || params.from,
        to: selectedTrip.to || params.to,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.routeTitle} numberOfLines={1}>
            {params.from} → {params.to}
          </Text>
          <Text style={styles.dateSub}>{params.date}</Text>
        </View>
        <Pressable
          style={[styles.sortChip, sort === 'PRICE' && styles.sortChipActive]}
          onPress={() => setSort((s) => (s === 'TIME' ? 'PRICE' : 'TIME'))}
        >
          <Text style={[styles.sortText, sort === 'PRICE' && styles.sortTextActive]}>
            {sort === 'TIME' ? '⏱ Time' : '₹ Price'}
          </Text>
        </Pressable>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterBar}>
        {(['ALL', 'FRONT', 'BACK'] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'ALL' ? 'All' : f === 'FRONT' ? 'Front seats' : 'Back seats'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Trips list */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0F52BA" size="large" />
          <Text style={styles.loadingText}>Finding trips…</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Could not load trips</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🚌</Text>
          <Text style={styles.emptyTitle}>No trips available</Text>
          <Text style={styles.emptySub}>
            {filter !== 'ALL'
              ? 'Try switching to "All" to see all trips'
              : `No trips found for ${params.from} → ${params.to} on ${params.date}`}
          </Text>
          {filter === 'ALL' && (
            <Pressable
              style={styles.requestBtn}
              onPress={() =>
                navigation.navigate('RequestsNew', {
                  type: 'SEAT',
                  routeId: params.routeId,
                  from: params.from,
                  to: params.to,
                  date: params.date,
                })
              }
            >
              <Text style={styles.requestBtnText}>＋ Request a ride instead</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TripCard trip={item} onPress={() => setSelectedTrip(item)} />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => void refetch()}
              tintColor="#0F52BA"
            />
          }
          ListFooterComponent={
            filtered.length > 0 ? (
              <Text style={styles.footer}>{filtered.length} trip{filtered.length !== 1 ? 's' : ''} found</Text>
            ) : null
          }
        />
      )}

      {/* Trip detail bottom sheet */}
      <TripDetailSheet
        trip={selectedTrip}
        onClose={() => setSelectedTrip(null)}
        onBook={handleBook}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E4E7EC',
    gap: 10,
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
  routeTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  dateSub: { fontSize: 12, color: '#475467', marginTop: 2 },

  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
  },
  sortChipActive: { backgroundColor: '#0F52BA', borderColor: '#0F52BA' },
  sortText: { fontSize: 13, fontWeight: '700', color: '#475467' },
  sortTextActive: { color: '#FFFFFF' },

  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    gap: 8,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    backgroundColor: '#FFFFFF',
  },
  filterTabActive: { backgroundColor: '#EEF4FF', borderColor: '#BFD4FF' },
  filterText: { fontSize: 13, fontWeight: '700', color: '#475467' },
  filterTextActive: { color: '#0F52BA' },

  listContent: { padding: 16, paddingBottom: 32 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { fontSize: 14, color: '#475467' },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptySub: { fontSize: 14, color: '#475467', textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  requestBtn: {
    marginTop: 8,
    backgroundColor: '#EEF4FF',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#BFD4FF',
  },
  requestBtnText: { color: '#0F52BA', fontWeight: '800', fontSize: 14 },

  footer: { textAlign: 'center', fontSize: 13, color: '#98A2B3', paddingTop: 16 },
});

export default TripListScreen;
