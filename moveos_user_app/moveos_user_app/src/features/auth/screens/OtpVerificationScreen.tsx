import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Toast from 'react-native-toast-message';

import BackButton from '@/features/shared/components/BackButton';
import { api, ApiError } from '@/lib/api';
import { useOnboardingStore } from '@/store/onboarding';
import { useAuthStore } from '@/store/auth';
import { useLanguageStore } from '@/store/language';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'AuthOtpVerify'>;
type Route = RouteProp<RootStackParamList, 'AuthOtpVerify'>;

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 60;

const OtpVerificationScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();
  const tx = useLanguageStore((s) => s.tx);
  const { onboardingToken } = useOnboardingStore();
  const login = useAuthStore((s) => s.login);

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const [resendCountdown, setResendCountdown] = useState(RESEND_SECONDS);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setInterval(() => setResendCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCountdown]);

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setLockCountdown(remaining);
      if (remaining === 0) setLockedUntil(null);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;

  const handleVerify = useCallback(
    async (code: string) => {
      if (loading || isLocked || !onboardingToken) return;
      setLoading(true);

      try {
        const res = await api.post<{
          status: string;
          data: {
            requiresName?: boolean;
            authToken?: string;
            refreshToken?: string;
            userId?: string;
            role?: string;
            driverId?: string | null;
            passengerId?: string | null;
            name?: string | null;
            phone?: string;
          };
        }>('/onboarding/profile', {
          phone: `${params.countryCode}${params.phoneNumber}`,
          otp: code,
          locale: 'en-IN',
          timezone: 'Asia/Kolkata',
        }, onboardingToken);

        const { data } = res;
        if (data.requiresName) {
          navigation.navigate('ProfileCreate', {
            phoneNumber: params.phoneNumber,
            countryCode: params.countryCode,
          });
        } else if (data.authToken) {
          await login({
            token: data.authToken,
            refreshToken: data.refreshToken,
            user: {
              userId: data.userId!,
              role: data.role as 'PASSENGER' | 'DRIVER' | 'AGENT' | 'ADMIN',
              driverId: data.driverId ?? undefined,
              passengerId: data.passengerId ?? undefined,
              name: data.name ?? undefined,
              phone: data.phone,
            },
          });
          navigation.replace('AppShell');
        }
      } catch (err) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setOtp('');
        inputRef.current?.focus();

        if (newAttempts >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_SECONDS * 1000;
          setLockedUntil(until);
          setAttempts(0);
        } else {
          let msg: string;
          if (err instanceof ApiError) {
            msg = (err.body as { message?: string })?.message ?? 'Incorrect OTP';
          } else if (err instanceof TypeError && err.message.includes('Network request failed')) {
            msg = 'Cannot reach server — check src/config/env.ts API_URL';
          } else {
            msg = tx('error_generic');
          }
          Toast.show({ type: 'error', text1: msg });
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, isLocked, onboardingToken, attempts, login, navigation, params, tx],
  );

  const handleOtpChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    setOtp(digits);
    if (digits.length === OTP_LENGTH) {
      handleVerify(digits);
    }
  };

  const handleResend = useCallback(async () => {
    if (resendCountdown > 0 || !onboardingToken || loading) return;
    setLoading(true);
    try {
      const fullPhone = `+91${params.phoneNumber}`;
      const res = await api.post<{ status: string; data: { devOtpCode?: string } }>(
        '/onboarding/profile',
        { phone: fullPhone, locale: 'en-IN', timezone: 'Asia/Kolkata' },
        onboardingToken,
      );
      if (__DEV__ && res.data.devOtpCode) setDevCode(res.data.devOtpCode);
      setResendCountdown(RESEND_SECONDS);
      setOtp('');
      Toast.show({ type: 'success', text1: 'OTP resent' });
    } catch {
      Toast.show({ type: 'error', text1: tx('error_generic') });
    } finally {
      setLoading(false);
    }
  }, [resendCountdown, onboardingToken, loading, params.phoneNumber, tx]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <BackButton onPress={() => navigation.goBack()} />
            <Text style={styles.brand}>Moveos</Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.hero}>
            <Text style={styles.title}>{tx('auth_otp_title')}</Text>
            <Text style={styles.subtitle}>
              {tx('auth_otp_subtitle')}
              {params.countryCode} {params.phoneNumber}
            </Text>
          </View>

          <TextInput
            ref={inputRef}
            keyboardType="number-pad"
            value={otp}
            onChangeText={handleOtpChange}
            maxLength={OTP_LENGTH}
            style={styles.hiddenInput}
            editable={!loading && !isLocked}
            autoFocus
          />

          <Pressable style={styles.otpRow} onPress={() => inputRef.current?.focus()}>
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.otpBox,
                  otp[i] !== undefined ? styles.otpBoxFilled : null,
                  isLocked ? styles.otpBoxLocked : null,
                ]}
              >
                <Text style={styles.otpDigit}>{otp[i] ?? ''}</Text>
              </View>
            ))}
          </Pressable>

          {isLocked && (
            <View style={styles.lockBanner}>
              <Text style={styles.lockText}>
                {tx('auth_otp_locked')}{lockCountdown}s
              </Text>
            </View>
          )}

          {__DEV__ && devCode && (
            <View style={styles.devBanner}>
              <Text style={styles.devText}>DEV OTP: {devCode}</Text>
            </View>
          )}

          {loading && (
            <ActivityIndicator color="#0F52BA" style={{ marginTop: 24 }} size="large" />
          )}

          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive it? </Text>
            <Pressable
              onPress={handleResend}
              disabled={resendCountdown > 0 || loading || isLocked}
            >
              <Text
                style={[
                  styles.resendLink,
                  (resendCountdown > 0 || isLocked) ? styles.resendDisabled : null,
                ]}
              >
                {resendCountdown > 0
                  ? `${tx('auth_otp_resend_in')}${resendCountdown}s`
                  : tx('auth_otp_resend')}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FBFF' },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 32 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  brand: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F52BA',
    flex: 1,
    textAlign: 'center',
  },
  hero: { marginTop: 24, marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 8, fontSize: 16, color: '#475467' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 0, width: 0 },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 16,
  },
  otpBox: {
    width: 46,
    height: 56,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E4E7EC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  otpBoxFilled: { borderColor: '#0F52BA', backgroundColor: '#EEF4FF' },
  otpBoxLocked: { borderColor: '#E4E7EC', backgroundColor: '#F8FAFC', opacity: 0.6 },
  otpDigit: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  lockBanner: {
    backgroundColor: '#FEE4E2',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  lockText: { color: '#D92D20', fontWeight: '700', fontSize: 14 },
  devBanner: {
    backgroundColor: '#FFF4E5',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F97316',
  },
  devText: { color: '#F97316', fontWeight: '800', fontSize: 16, letterSpacing: 2 },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    alignItems: 'center',
  },
  resendLabel: { fontSize: 14, color: '#475467' },
  resendLink: { fontSize: 14, fontWeight: '700', color: '#0F52BA' },
  resendDisabled: { color: '#98A2B3' },
});

export default OtpVerificationScreen;
