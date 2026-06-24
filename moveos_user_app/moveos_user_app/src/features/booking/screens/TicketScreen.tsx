import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import { useBooking } from '@/features/booking/hooks/useBooking';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useLanguageStore } from '@/store/language';
import { formatDateTime } from '@/utils/date';
import { formatPaise } from '@/utils/currency';
import type { RootStackParamList } from '@/navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'Ticket'>;
type Route = RouteProp<RootStackParamList, 'Ticket'>;

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'CONFIRMED' || status === 'COMPLETED'
      ? '#16A34A'
      : status === 'CANCELLED'
      ? '#D92D20'
      : '#F97316';
  const bg =
    status === 'CONFIRMED' || status === 'COMPLETED'
      ? '#E8F5E9'
      : status === 'CANCELLED'
      ? '#FEE4E2'
      : '#FFF4E5';
  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
      <Text style={[styles.statusText, { color }]}>{status}</Text>
    </View>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const paid = status === 'PAID';
  return (
    <View style={[styles.paymentBadge, { backgroundColor: paid ? '#E8F5E9' : '#FFF4E5' }]}>
      <Text style={[styles.paymentBadgeText, { color: paid ? '#16A34A' : '#F97316' }]}>
        {status}
      </Text>
    </View>
  );
}

const TicketScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const token = useAuthStore((s) => s.token);
  const tx = useLanguageStore((s) => s.tx);
  const queryClient = useQueryClient();

  const { data: booking, isLoading, isError, refetch } = useBooking(params.bookingId);

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/bookings/${params.bookingId}/cancel`, {}, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['booking', params.bookingId] });
      void queryClient.invalidateQueries({ queryKey: ['passenger', 'bookings'] });
      Toast.show({ type: 'success', text1: 'Booking cancelled' });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? ((err.body as { message?: string })?.message ?? 'Could not cancel')
          : 'Network error';
      Toast.show({ type: 'error', text1: msg });
    },
  });

  const handleCancel = () => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => cancelMutation.mutate(),
        },
      ],
    );
  };

  const handleShare = async () => {
    if (!booking) return;
    await Share.share({
      message: `Pahadi Rides Booking\nCode: ${booking.code}\n${booking.from} → ${booking.to}\n${formatDateTime(booking.departureAt)}\nDriver: ${booking.driverName} · ${booking.vehicleNumber}`,
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color="#0F52BA" size="large" />
          <Text style={styles.loadingText}>Loading ticket…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !booking) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Could not load ticket</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isCancelled = booking.status === 'CANCELLED';
  const canCancel = booking.status === 'CONFIRMED' || booking.status === 'PENDING';
  const canTrack = booking.status === 'CONFIRMED' && booking.tripStatus === 'DEPARTED';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{tx('ticket_title')}</Text>
        <Pressable onPress={handleShare} hitSlop={12}>
          <Text style={styles.shareIcon}>↑</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Booking code card */}
        <View style={[styles.codeCard, isCancelled && styles.codeCardCancelled]}>
          <View style={styles.codeCardTop}>
            {!isCancelled && <Text style={styles.confirmed}>✓ Confirmed</Text>}
            <StatusBadge status={booking.status} />
          </View>
          <Text style={styles.codeLabel}>{tx('ticket_code')}</Text>
          <Text style={styles.codeValue}>{booking.code}</Text>
          <Text style={styles.codeSub}>Show this to your driver</Text>
        </View>

        {/* Route + time */}
        <View style={styles.section}>
          <View style={styles.routeRow}>
            <View style={styles.routeStop}>
              <View style={[styles.routeDot, { backgroundColor: '#16A34A' }]} />
              <Text style={styles.routeCity}>{booking.from}</Text>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routeStop}>
              <View style={[styles.routeDot, { backgroundColor: '#0F52BA' }]} />
              <Text style={styles.routeCity}>{booking.to}</Text>
            </View>
          </View>
          <Text style={styles.depTime}>{formatDateTime(booking.departureAt)}</Text>
        </View>

        {/* Trip details */}
        <View style={styles.section}>
          <DetailRow label={tx('ticket_seat')} value={booking.seatType} />
          <DetailRow label="Driver" value={booking.driverName} />
          <DetailRow label="Vehicle" value={`${booking.vehicleName} · ${booking.vehicleNumber}`} />
          {booking.pickupPoint ? (
            <DetailRow label={tx('ticket_pickup')} value={booking.pickupPoint} />
          ) : null}
        </View>

        {/* Payment */}
        <View style={styles.section}>
          <View style={styles.paymentRow}>
            <View>
              <Text style={styles.detailLabel}>{tx('ticket_payment')}</Text>
              <Text style={styles.detailValue}>{booking.paymentMethod}</Text>
              <Text style={styles.fareTotal}>{formatPaise(booking.totalPaise)}</Text>
            </View>
            <PaymentBadge status={booking.paymentStatus} />
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>{tx('ticket_share')}</Text>
          </Pressable>

          {canTrack && (
            <Pressable
              style={styles.trackBtn}
              onPress={() => navigation.navigate('PassengerTracking', { bookingId: booking.id })}
            >
              <Text style={styles.trackBtnText}>{tx('ticket_track')}</Text>
            </Pressable>
          )}

          {canCancel && (
            <Pressable
              style={styles.cancelBtn}
              onPress={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <ActivityIndicator color="#D92D20" />
              ) : (
                <Text style={styles.cancelBtnText}>{tx('ticket_cancel')}</Text>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#475467' },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  retryBtn: { backgroundColor: '#0F52BA', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E4E7EC',
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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#0F172A' },
  shareIcon: {
    fontSize: 20,
    color: '#0F52BA',
    fontWeight: '800',
    width: 36,
    textAlign: 'right',
  },

  scroll: { padding: 16, gap: 12, paddingBottom: 40 },

  codeCard: {
    backgroundColor: '#0F52BA',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#0F52BA',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 8,
  },
  codeCardCancelled: { backgroundColor: '#475467' },
  codeCardTop: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' },
  confirmed: { color: '#A8C0FF', fontWeight: '700', fontSize: 13 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontWeight: '800', fontSize: 12 },
  codeLabel: { color: '#A8C0FF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  codeValue: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: 3 },
  codeSub: { fontSize: 12, color: '#BBCFFF' },

  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },

  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeStop: { flex: 1, alignItems: 'center', gap: 4 },
  routeDot: { width: 12, height: 12, borderRadius: 6 },
  routeCity: { fontSize: 15, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  routeLine: { height: 2, flex: 0.4, backgroundColor: '#E4E7EC', borderRadius: 1 },
  depTime: { fontSize: 14, color: '#475467', textAlign: 'center' },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  detailLabel: { fontSize: 13, color: '#98A2B3', fontWeight: '600', flex: 0.4 },
  detailValue: { fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 0.6, textAlign: 'right' },

  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fareTotal: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 4 },
  paymentBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  paymentBadgeText: { fontWeight: '800', fontSize: 12 },

  actions: { gap: 10 },
  shareBtn: {
    backgroundColor: '#EEF4FF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFD4FF',
  },
  shareBtnText: { color: '#0F52BA', fontWeight: '800', fontSize: 15 },
  trackBtn: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#0F52BA',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 4,
  },
  trackBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#FDB4A8',
    backgroundColor: '#FEE4E2',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#D92D20', fontWeight: '800', fontSize: 15 },
});

export default TicketScreen;
