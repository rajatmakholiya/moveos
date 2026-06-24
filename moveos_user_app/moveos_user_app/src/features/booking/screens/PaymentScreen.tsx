import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import RazorpayCheckout from 'react-native-razorpay';

import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { ENV } from '@/config/env';
import { formatPaise } from '@/utils/currency';
import type { RootStackParamList } from '@/navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'PassengerPayment'>;
type Route = RouteProp<RootStackParamList, 'PassengerPayment'>;

const PaymentScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const handlePay = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const data = await RazorpayCheckout.open({
        description: 'Pahadi Rides – Seat Booking',
        currency: 'INR',
        key: ENV.RAZORPAY_KEY_ID,
        amount: String(params.amount),
        order_id: params.orderId,
        name: 'Pahadi Rides',
        prefill: {
          contact: params.phone,
          name: params.passengerName,
        },
        theme: { color: '#0F52BA' },
      });

      // Verify with backend
      await api.post(
        `/bookings/${params.bookingId}/verify-payment`,
        {
          orderId: data.razorpay_order_id,
          paymentId: data.razorpay_payment_id,
          signature: data.razorpay_signature,
        },
        token,
      );

      navigation.replace('Ticket', { bookingId: params.bookingId });
    } catch (err: any) {
      // Razorpay throws { code, description } on dismiss/failure
      const isUserDismiss = err?.code === 0 || err?.description?.toLowerCase().includes('cancel');
      if (!isUserDismiss) {
        setFailed(true);
        const msg =
          err instanceof ApiError
            ? ((err.body as { message?: string })?.message ?? 'Payment verification failed')
            : err?.description ?? 'Payment failed. Please try again.';
        Toast.show({ type: 'error', text1: msg });
      }
    } finally {
      setLoading(false);
    }
  }, [params, token, navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Complete Payment</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        {/* Amount card */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Amount to pay</Text>
          <Text style={styles.amountValue}>{formatPaise(params.amount)}</Text>
          <Text style={styles.orderLabel}>Order #{params.orderId}</Text>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>🔒</Text>
            <Text style={styles.infoText}>Payments are 256-bit encrypted and processed by Razorpay</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>↩️</Text>
            <Text style={styles.infoText}>Refund will be processed within 5–7 business days on cancellation</Text>
          </View>
        </View>

        {failed && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>Payment failed. Tap below to retry.</Text>
          </View>
        )}
      </View>

      {/* CTA */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.payBtn, loading && styles.payBtnDisabled]}
          onPress={handlePay}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.payBtnText}>
                {failed ? 'Retry Payment' : `Pay ${formatPaise(params.amount)}`}
              </Text>
              <Text style={styles.payBtnSub}>via UPI · Cards · Net Banking</Text>
            </>
          )}
        </Pressable>
        <Pressable onPress={() => navigation.goBack()} style={styles.cancelLink} disabled={loading}>
          <Text style={styles.cancelLinkText}>Pay cash instead</Text>
        </Pressable>
      </View>
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

  body: { flex: 1, padding: 20, gap: 16 },

  amountCard: {
    backgroundColor: '#0F52BA',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#0F52BA',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 8,
  },
  amountLabel: { fontSize: 13, color: '#A8C0FF', fontWeight: '700', textTransform: 'uppercase' },
  amountValue: { fontSize: 40, fontWeight: '800', color: '#FFFFFF' },
  orderLabel: { fontSize: 12, color: '#7BA3E0' },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  infoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  infoIcon: { fontSize: 16 },
  infoText: { flex: 1, fontSize: 13, color: '#475467', lineHeight: 18 },

  errorCard: {
    backgroundColor: '#FEE4E2',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDB4A8',
  },
  errorText: { color: '#D92D20', fontWeight: '700', textAlign: 'center' },

  footer: { padding: 20, gap: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E4E7EC' },
  payBtn: {
    backgroundColor: '#0F52BA',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#0F52BA',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 6,
  },
  payBtnDisabled: { backgroundColor: '#98A2B3', shadowOpacity: 0 },
  payBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
  payBtnSub: { color: '#A8C0FF', fontSize: 12 },
  cancelLink: { alignItems: 'center', paddingVertical: 8 },
  cancelLinkText: { color: '#475467', fontWeight: '700', fontSize: 14 },
});

export default PaymentScreen;
