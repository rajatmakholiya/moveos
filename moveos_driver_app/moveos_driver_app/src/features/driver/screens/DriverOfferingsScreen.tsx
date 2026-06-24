import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { DriverButton } from '@/features/driver/components/DriverButton';
import { DriverCard } from '@/features/driver/components/DriverCard';
import { useDriverAction, useDriverRequests, useDriverTrips } from '@/features/driver/api/driverClient';
import { formatPaise } from '@/utils/currency';
import { formatDateTime } from '@/utils/date';
import type { TransportRequest } from '@/types';

type Tab = 'SEAT' | 'FULL_VEHICLE' | 'PARCEL' | 'CLUSTER';

export default function DriverOfferingsScreen() {
  const [tab, setTab] = useState<Tab>('SEAT');
  const seatRequests = useDriverRequests('SEAT');
  const fullRequests = useDriverRequests('FULL_VEHICLE');
  const parcelRequests = useDriverRequests('PARCEL');
  const trips = useDriverTrips('future');
  const action = useDriverAction();

  const visibleRequests = tab === 'SEAT' ? seatRequests : tab === 'FULL_VEHICLE' ? fullRequests : parcelRequests;
  const routeGroups = useMemo(() => {
    return (trips.data ?? []).reduce<Record<string, number>>((acc, trip) => {
      const key = `${trip.from} to ${trip.to}`;
      acc[key] = (acc[key] ?? 0) + trip.frontSeatsLeft + trip.backSeatsLeft;
      return acc;
    }, {});
  }, [trips.data]);

  const refresh = () => {
    void seatRequests.refetch();
    void fullRequests.refetch();
    void parcelRequests.refetch();
    void trips.refetch();
  };

  const accept = (requestId: string) => {
    action.mutate(
      { path: `/driver/requests/${encodeURIComponent(requestId)}/accept` },
      { onSuccess: refresh, onError: () => Toast.show({ type: 'error', text1: 'Could not accept request' }) },
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={visibleRequests.isFetching || trips.isFetching} onRefresh={refresh} />}
      >
        <View>
          <Text style={styles.title}>Offerings</Text>
          <Text style={styles.subtitle}>Pick the work type you want to accept.</Text>
        </View>
        <View style={styles.tabs}>
          {(['SEAT', 'FULL_VEHICLE', 'PARCEL', 'CLUSTER'] as Tab[]).map((item) => (
            <Pressable key={item} style={[styles.tab, tab === item && styles.tabActive]} onPress={() => setTab(item)}>
              <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>
                {item === 'FULL_VEHICLE' ? 'Vehicle' : item === 'SEAT' ? 'Seats' : item === 'CLUSTER' ? 'Cluster' : 'Parcel'}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'CLUSTER' ? (
          <DriverCard title="Route clusters" subtitle="Open seats grouped by route">
            {Object.keys(routeGroups).length === 0 ? (
              <Text style={styles.emptyText}>No active seat clusters yet.</Text>
            ) : Object.entries(routeGroups).map(([route, openSeats]) => (
              <View key={route} style={styles.clusterRow}>
                <Text style={styles.requestTitle}>{route}</Text>
                <Text style={styles.requestMeta}>{openSeats} seats open</Text>
              </View>
            ))}
          </DriverCard>
        ) : visibleRequests.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#0F52BA" />
          </View>
        ) : (visibleRequests.data ?? []).length === 0 ? (
          <DriverCard title="No open requests" subtitle="New passenger demand will appear here." />
        ) : (
          (visibleRequests.data ?? []).map((request) => (
            <RequestCard key={request.id} request={request} onAccept={() => accept(request.id)} loading={action.isPending} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RequestCard({ request, onAccept, loading }: { request: TransportRequest; onAccept: () => void; loading: boolean }) {
  const amount = request.agreedAmountPaise ?? request.budgetPaise;
  return (
    <DriverCard title={`${request.from} to ${request.to}`} subtitle={request.requestedFor ? formatDateTime(request.requestedFor) : 'Flexible timing'} right={request.type}>
      <View style={styles.requestBody}>
        <Text style={styles.requestMeta}>{request.seats ? `${request.seats} seats` : request.type}</Text>
        {amount ? <Text style={styles.requestMeta}>{formatPaise(amount)}</Text> : null}
      </View>
      {request.pickupLocation ? <Text style={styles.locationText}>Pickup: {request.pickupLocation}</Text> : null}
      {request.dropoffLocation ? <Text style={styles.locationText}>Drop: {request.dropoffLocation}</Text> : null}
      {request.note ? <Text style={styles.locationText}>{request.note}</Text> : null}
      <DriverButton label="Accept request" onPress={onAccept} loading={loading} />
    </DriverCard>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 4, color: '#667085', fontSize: 14 },
  tabs: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E4E7EC', padding: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: '#0F52BA' },
  tabText: { fontSize: 12, fontWeight: '800', color: '#667085' },
  tabTextActive: { color: '#FFFFFF' },
  center: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: '#667085', fontSize: 13 },
  requestBody: { flexDirection: 'row', justifyContent: 'space-between' },
  requestTitle: { fontSize: 14, color: '#0F172A', fontWeight: '800' },
  requestMeta: { color: '#475467', fontSize: 13, fontWeight: '700' },
  locationText: { color: '#667085', fontSize: 13, lineHeight: 18 },
  clusterRow: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, gap: 4 },
});
