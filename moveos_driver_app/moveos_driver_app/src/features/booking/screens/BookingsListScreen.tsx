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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  usePassengerBookings,
  usePendingRequests,
  useAcceptedRequests,
} from '@/features/booking/hooks/usePassengerBookings';
import { useFeatureFlagStore } from '@/store/featureFlags';
import { useAuthStore } from '@/store/auth';
import { formatDateTime } from '@/utils/date';
import { formatPaise } from '@/utils/currency';
import type { RootStackParamList } from '@/navigation/types';
import type { Booking, TransportRequest } from '@/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'AppShell'>;
type Tab = 'ongoing' | 'upcoming' | 'past';

// ─── Booking Card ─────────────────────────────────────────────────────────────

const BookingCard: React.FC<{ booking: Booking; onPress: () => void }> = ({
  booking,
  onPress,
}) => {
  const statusColor =
    booking.status === 'CONFIRMED' || booking.status === 'COMPLETED'
      ? '#16A34A'
      : booking.status === 'CANCELLED'
      ? '#D92D20'
      : '#F97316';

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardRoute}>
            {booking.from} → {booking.to}
          </Text>
          <Text style={styles.cardTime}>{formatDateTime(booking.departureAt)}</Text>
        </View>
        <View>
          <Text style={styles.cardFare}>{formatPaise(booking.totalPaise)}</Text>
          <View style={[styles.cardStatusBadge, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.cardStatusText, { color: statusColor }]}>
              {booking.status}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.cardDivider} />
      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>
          {booking.driverName} · {booking.vehicleNumber}
        </Text>
        <Text style={styles.cardSeat}>{booking.seatType} · {booking.code}</Text>
      </View>
    </Pressable>
  );
};

// ─── Request Card ─────────────────────────────────────────────────────────────

const RequestCard: React.FC<{ request: TransportRequest }> = ({ request }) => {
  const statusColor = request.status === 'ACCEPTED' ? '#0F52BA' : '#F97316';
  return (
    <View style={[styles.card, styles.requestCard]}>
      <View style={styles.cardHeader}>
        <View>
          <View style={styles.requestTypeBadge}>
            <Text style={styles.requestTypeText}>{request.type}</Text>
          </View>
          <Text style={styles.cardRoute}>
            {request.from} → {request.to}
          </Text>
          <Text style={styles.cardTime}>
            {request.requestedFor ? formatDateTime(request.requestedFor) : ''}
          </Text>
        </View>
        <View style={[styles.cardStatusBadge, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.cardStatusText, { color: statusColor }]}>
            {request.status}
          </Text>
        </View>
      </View>
      {request.driver?.name && (
        <>
          <View style={styles.cardDivider} />
          <Text style={styles.cardMeta}>Driver: {request.driver.name}</Text>
        </>
      )}
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

const BookingsListScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const token = useAuthStore((s) => s.token);
  const flags = useFeatureFlagStore((s) => s.flags);

  const [tab, setTab] = useState<Tab>('upcoming');

  const bookingsQuery = usePassengerBookings();
  const pendingReqQuery = usePendingRequests();
  const acceptedReqQuery = useAcceptedRequests();

  const isLoading = bookingsQuery.isLoading;
  const isRefreshing =
    (bookingsQuery.isFetching || pendingReqQuery.isFetching || acceptedReqQuery.isFetching) &&
    !isLoading;

  const onRefresh = () => {
    void bookingsQuery.refetch();
    void pendingReqQuery.refetch();
    void acceptedReqQuery.refetch();
  };

  const ongoingBookings = useMemo(() => bookingsQuery.data?.ongoingBookings ?? [], [bookingsQuery.data?.ongoingBookings]);
  const upcomingBookings = useMemo(() => bookingsQuery.data?.upcomingBookings ?? [], [bookingsQuery.data?.upcomingBookings]);
  const pastBookings = useMemo(() => bookingsQuery.data?.pastBookings ?? [], [bookingsQuery.data?.pastBookings]);
  const pendingRequests = useMemo(() => pendingReqQuery.data ?? [], [pendingReqQuery.data]);
  const acceptedRequests = useMemo(() => acceptedReqQuery.data ?? [], [acceptedReqQuery.data]);

  // For the upcoming tab: confirmed bookings + pending/accepted requests
  const upcomingItems = useMemo(
    () => ({
      bookings: upcomingBookings,
      requests: [...acceptedRequests, ...pendingRequests],
    }),
    [upcomingBookings, acceptedRequests, pendingRequests],
  );

  // Requires login
  if (!token) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔒</Text>
          <Text style={styles.emptyTitle}>Sign in to view bookings</Text>
          <Pressable
            style={styles.loginBtn}
            onPress={() => navigation.navigate('AuthPhoneEntry')}
          >
            <Text style={styles.loginBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Trips</Text>
        <Pressable
          style={styles.newBookingBtn}
          onPress={() => navigation.navigate('AppShell')}
        >
          <Text style={styles.newBookingText}>＋ Book</Text>
        </Pressable>
      </View>

      {/* Wallet prompt flag */}
      {flags.enableWalletPrompt && (
        <Pressable style={styles.walletBanner} onPress={() => navigation.navigate('AppShell')}>
          <Text style={styles.walletBannerIcon}>💳</Text>
          <Text style={styles.walletBannerText}>
            Top up your wallet for faster checkout on next booking
          </Text>
          <Text style={styles.walletBannerChev}>›</Text>
        </Pressable>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['ongoing', 'upcoming', 'past'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'ongoing' ? `Ongoing${ongoingBookings.length ? ` ${ongoingBookings.length}` : ''}` : t === 'upcoming' ? 'Upcoming' : 'Past'}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0F52BA" size="large" />
          <Text style={styles.loadingText}>Loading trips…</Text>
        </View>
      ) : tab === 'ongoing' ? (
        <FlatList
          data={ongoingBookings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.ongoingWrap}>
              <View style={styles.ongoingBanner}>
                <View style={styles.ongoingPulse} />
                <Text style={styles.ongoingText}>Trip in progress</Text>
                <Pressable onPress={() => navigation.navigate('PassengerTracking', { bookingId: item.id })}>
                  <Text style={styles.ongoingTrack}>Track live</Text>
                </Pressable>
              </View>
              <BookingCard
                booking={item}
                onPress={() => navigation.navigate('PassengerTracking', { bookingId: item.id })}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>⌁</Text>
              <Text style={styles.emptyTitle}>No live trips</Text>
              <Text style={styles.emptySub}>Trips in progress will appear here</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#0F52BA" />
          }
        />
      ) : tab === 'upcoming' ? (
        <FlatList
          data={upcomingItems.bookings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BookingCard
              booking={item}
              onPress={() => navigation.navigate('Ticket', { bookingId: item.id })}
            />
          )}
          ListHeaderComponent={
            upcomingItems.requests.length > 0 ? (
              <View>
                {upcomingItems.requests.map((req) => (
                  <RequestCard key={req.id} request={req} />
                ))}
                <View style={{ height: 4 }} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            upcomingItems.requests.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🎒</Text>
                <Text style={styles.emptyTitle}>No upcoming trips</Text>
                <Text style={styles.emptySub}>Book a trip to see it here</Text>
                <Pressable
                  style={styles.loginBtn}
                  onPress={() => navigation.navigate('AppShell')}
                >
                  <Text style={styles.loginBtnText}>Search Trips</Text>
                </Pressable>
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#0F52BA" />
          }
        />
      ) : (
        <FlatList
          data={pastBookings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BookingCard
              booking={item}
              onPress={() => navigation.navigate('Ticket', { bookingId: item.id })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No past trips</Text>
              <Text style={styles.emptySub}>Your completed trips will appear here</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#0F52BA" />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyState: { alignItems: 'center', gap: 8, paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptySub: { fontSize: 14, color: '#475467', textAlign: 'center' },
  loadingText: { fontSize: 14, color: '#475467' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E4E7EC',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  newBookingBtn: {
    backgroundColor: '#EEF4FF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#BFD4FF',
  },
  newBookingText: { color: '#0F52BA', fontWeight: '800', fontSize: 13 },

  walletBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderColor: '#FDDCB0',
  },
  walletBannerIcon: { fontSize: 20 },
  walletBannerText: { flex: 1, fontSize: 13, color: '#78350F', fontWeight: '600' },
  walletBannerChev: { fontSize: 18, color: '#C47A20', fontWeight: '700' },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E4E7EC',
  },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabActive: { borderColor: '#0F52BA' },
  tabText: { fontSize: 15, fontWeight: '700', color: '#98A2B3' },
  tabTextActive: { color: '#0F52BA' },

  ongoingWrap: { gap: 8 },
  ongoingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  ongoingPulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F97316' },
  ongoingText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#7C2D12' },
  ongoingTrack: { fontSize: 13, fontWeight: '800', color: '#0F52BA' },

  listContent: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    gap: 8,
  },
  requestCard: { borderColor: '#BFD4FF', borderWidth: 1.5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardRoute: { fontSize: 15, fontWeight: '800', color: '#0F172A', maxWidth: 200 },
  cardTime: { fontSize: 12, color: '#475467', marginTop: 3 },
  cardFare: { fontSize: 18, fontWeight: '800', color: '#0F172A', textAlign: 'right' },
  cardStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-end', marginTop: 4 },
  cardStatusText: { fontSize: 11, fontWeight: '800' },
  cardDivider: { height: 1, backgroundColor: '#F0F0F0' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardMeta: { fontSize: 12, color: '#475467', flex: 1 },
  cardSeat: { fontSize: 12, fontWeight: '700', color: '#0F52BA' },

  requestTypeBadge: {
    backgroundColor: '#EEF4FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  requestTypeText: { fontSize: 11, fontWeight: '800', color: '#0F52BA', textTransform: 'uppercase' },

  loginBtn: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  loginBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});

export default BookingsListScreen;
