import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Toast from 'react-native-toast-message';

import { DriverButton } from '@/features/driver/components/DriverButton';
import { DriverCard } from '@/features/driver/components/DriverCard';
import { useDriverAction, useDriverDashboard } from '@/features/driver/api/driverClient';
import { useAuthStore } from '@/store/auth';
import { formatPaise } from '@/utils/currency';
import { formatTime } from '@/utils/date';
import type { RootStackParamList } from '@/navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'AppShell'>;

export default function DriverDashboardScreen() {
  const navigation = useNavigation<Navigation>();
  const user = useAuthStore((s) => s.user);
  const [online, setOnline] = useState(false);
  const [onlineSince, setOnlineSince] = useState<Date | null>(null);
  const dashboard = useDriverDashboard();
  const action = useDriverAction();

  const activeTrip = useMemo(
    () => dashboard.data?.trips.find((trip) => trip.status === 'DEPARTED') ?? null,
    [dashboard.data?.trips],
  );

  const toggleOnline = () => {
    const next = !online;
    setOnline(next);
    setOnlineSince(next ? new Date() : null);
    action.mutate(
      { path: `/drivers/me/${next ? 'go-online' : 'go-offline'}` },
      {
        onError: () => {
          setOnline(!next);
          setOnlineSince(!next ? new Date() : null);
          Toast.show({ type: 'error', text1: 'Could not update online status' });
        },
      },
    );
  };

  const chooseContext = (contextId: string) => {
    action.mutate(
      { path: '/drivers/me/operating-context', body: { contextId } },
      { onError: () => Toast.show({ type: 'error', text1: 'Could not switch operating context' }) },
    );
  };

  if (dashboard.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color="#0F52BA" size="large" />
          <Text style={styles.centerText}>Loading driver dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={dashboard.isFetching} onRefresh={() => void dashboard.refetch()} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>MoveOS Driver</Text>
            <Text style={styles.title}>{user?.name ? `Hi, ${user.name.split(' ')[0]}` : 'Driver dashboard'}</Text>
          </View>
          <Pressable style={styles.profileButton} onPress={() => navigation.navigate('DriverProfile')}>
            <Text style={styles.profileText}>{user?.name?.[0]?.toUpperCase() ?? 'D'}</Text>
          </Pressable>
        </View>

        {activeTrip ? (
          <DriverCard
            title="Trip in progress"
            subtitle={`${activeTrip.from} to ${activeTrip.to} · ${formatTime(activeTrip.departureAt)}`}
            right="Open"
            onPress={() => navigation.navigate('DriverManifest', { tripId: activeTrip.id })}
          />
        ) : null}

        <View style={[styles.onlineCard, online ? styles.onlineCardActive : null]}>
          <View>
            <Text style={styles.onlineTitle}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
            <Text style={styles.onlineSub}>
              {onlineSince ? `since ${formatTime(onlineSince.toISOString())}` : 'Go online to receive bookings'}
            </Text>
          </View>
          <DriverButton
            label={online ? 'Go offline' : 'Go online'}
            variant={online ? 'secondary' : 'primary'}
            loading={action.isPending}
            onPress={toggleOnline}
          />
        </View>

        <DriverCard title="Compliance" subtitle={`Insurance: ${dashboard.data?.compliance.insurance ?? 'UNKNOWN'}`} right={dashboard.data?.compliance.canAcceptBookings ? 'Ready' : 'Blocked'} />

        <View style={styles.metricGrid}>
          <Metric label="Today" value={formatPaise(dashboard.data?.earnings.todayPaise ?? 0)} />
          <Metric label="This week" value={formatPaise(dashboard.data?.earnings.weekPaise ?? 0)} />
          <Metric label="Open seats" value={String(dashboard.data?.metrics.openSeats ?? 0)} />
          <Metric label="Bookings" value={String(dashboard.data?.metrics.bookings ?? 0)} />
        </View>

        <DriverCard title="Operating context" subtitle="Drive independently or with an organization">
          {(dashboard.data?.contexts.length ? dashboard.data.contexts : [{ id: 'INDIVIDUAL', label: 'Drive independently', activeVehicleCount: 0, canOperate: true }]).map((context) => (
            <Pressable key={context.id} style={styles.contextRow} onPress={() => chooseContext(context.id)}>
              <View>
                <Text style={styles.contextTitle}>{context.label}</Text>
                <Text style={styles.contextSub}>{context.activeVehicleCount} vehicles</Text>
              </View>
              <Text style={[styles.contextStatus, context.canOperate ? styles.ready : styles.blocked]}>
                {context.canOperate ? 'Ready' : 'Blocked'}
              </Text>
            </Pressable>
          ))}
        </DriverCard>

        <DriverCard title="Today trips" subtitle="Departures and posted seat offerings">
          {(dashboard.data?.trips ?? []).length === 0 ? (
            <Text style={styles.emptyText}>No trips posted for today.</Text>
          ) : dashboard.data?.trips.map((trip) => (
            <Pressable key={trip.id} style={styles.tripRow} onPress={() => navigation.navigate('DriverManifest', { tripId: trip.id })}>
              <View>
                <Text style={styles.tripTitle}>{trip.from} to {trip.to}</Text>
                <Text style={styles.tripSub}>{formatTime(trip.departureAt)} · {trip.frontSeatsLeft + trip.backSeatsLeft} seats open</Text>
              </View>
              <Text style={styles.tripAction}>Manifest</Text>
            </Pressable>
          ))}
        </DriverCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  centerText: { color: '#475467', fontSize: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  kicker: { fontSize: 12, fontWeight: '800', color: '#0F52BA', textTransform: 'uppercase' },
  title: { marginTop: 3, fontSize: 24, fontWeight: '800', color: '#0F172A' },
  profileButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0F52BA', alignItems: 'center', justifyContent: 'center' },
  profileText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  onlineCard: { backgroundColor: '#111827', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  onlineCardActive: { backgroundColor: '#0F52BA' },
  onlineTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  onlineSub: { color: '#E4E7EC', marginTop: 3, fontSize: 12 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E4E7EC', padding: 14 },
  metricLabel: { fontSize: 12, color: '#667085', fontWeight: '700' },
  metricValue: { marginTop: 6, fontSize: 18, color: '#0F172A', fontWeight: '800' },
  contextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12 },
  contextTitle: { fontSize: 14, color: '#0F172A', fontWeight: '800' },
  contextSub: { marginTop: 2, fontSize: 12, color: '#667085' },
  contextStatus: { fontSize: 12, fontWeight: '800' },
  ready: { color: '#0E8C5F' },
  blocked: { color: '#D92D20' },
  tripRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12 },
  tripTitle: { fontSize: 14, color: '#0F172A', fontWeight: '800' },
  tripSub: { marginTop: 2, fontSize: 12, color: '#667085' },
  tripAction: { fontSize: 12, color: '#0F52BA', fontWeight: '800' },
  emptyText: { color: '#667085', fontSize: 13 },
});
