import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DeviceInfo from 'react-native-device-info';
import Toast from 'react-native-toast-message';

import BackButton from '@/features/shared/components/BackButton';
import { api, ApiError } from '@/lib/api';
import { getOrCreateDeviceFingerprint } from '@/lib/fingerprint';
import { useOnboardingStore } from '@/store/onboarding';
import { useLanguageStore } from '@/store/language';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'AuthPhoneEntry'>;

const DEFAULT_COUNTRY_CODE = '+91';

const PhoneEntryScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const tx = useLanguageStore((s) => s.tx);
  const { setSession, setPhone: savePhone, role } = useOnboardingStore();

  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const sanitizedPhone = useMemo(
    () => phone.replace(/[^0-9]/g, '').slice(0, 10),
    [phone],
  );

  const handleContinue = useCallback(async () => {
    if (sanitizedPhone.length < 10 || loading) return;
    setLoading(true);

    try {
      const fingerprint = await getOrCreateDeviceFingerprint();
      const appVersion = await DeviceInfo.getVersion();

      // Step 1: start session
      const sessionRes = await api.post<{
        status: string;
        data: { sessionId: string; onboardingToken: string; role: string };
      }>(
        '/onboarding/session',
        {
          deviceFingerprint: fingerprint,
          role,
          appVersion,
          locale: 'en-IN',
          timezone: 'Asia/Kolkata',
        },
        null,
      );

      const { sessionId, onboardingToken } = sessionRes.data;
      setSession(sessionId, onboardingToken);

      // Step 2: request OTP
      const fullPhone = `+91${sanitizedPhone}`;
      await api.post(
        '/onboarding/profile',
        { phone: fullPhone, locale: 'en-IN', timezone: 'Asia/Kolkata' },
        onboardingToken,
      );

      savePhone(sanitizedPhone);
      navigation.navigate('AuthOtpVerify', {
        phoneNumber: sanitizedPhone,
        countryCode: DEFAULT_COUNTRY_CODE,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = (err.body as { message?: string })?.message ?? tx('error_generic');
        Toast.show({ type: 'error', text1: msg });
      } else if (err instanceof TypeError && err.message.includes('Network request failed')) {
        Toast.show({
          type: 'error',
          text1: 'Cannot reach server',
          text2: 'Check your internet or backend URL in src/config/env.ts',
        });
      } else {
        Toast.show({ type: 'error', text1: tx('error_generic') });
      }
    } finally {
      setLoading(false);
    }
  }, [sanitizedPhone, loading, role, setSession, savePhone, navigation, tx]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <BackButton onPress={() => navigation.goBack()} />
            <Text style={styles.brand}>Moveos</Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.hero}>
            <Text style={styles.title}>{tx('auth_phone_title')}</Text>
            <Text style={styles.subtitle}>{tx('auth_phone_subtitle')}</Text>
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>{tx('auth_phone_label')}</Text>
            <View style={styles.inputRow}>
              <View style={styles.countryBadge}>
                <Text style={styles.flag}>🇮🇳</Text>
                <Text style={styles.countryCode}>{DEFAULT_COUNTRY_CODE}</Text>
              </View>
              <TextInput
                keyboardType="phone-pad"
                value={sanitizedPhone}
                onChangeText={setPhone}
                placeholder="00000 00000"
                placeholderTextColor="#C4CDD5"
                style={styles.phoneInput}
                maxLength={10}
                editable={!loading}
              />
            </View>
            <Text style={styles.helper}>{tx('auth_phone_helper')}</Text>
          </View>

          <View style={styles.footer}>
            <Pressable
              style={[
                styles.cta,
                sanitizedPhone.length === 10 && !loading
                  ? styles.ctaEnabled
                  : styles.ctaDisabled,
              ]}
              onPress={handleContinue}
              disabled={sanitizedPhone.length < 10 || loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.ctaText}>{tx('auth_phone_cta')}</Text>
              )}
            </Pressable>
            <Text style={styles.terms}>{tx('auth_phone_terms')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FBFF',
  },
  container: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    flexGrow: 1,
  },
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
  hero: {
    marginTop: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#475467',
  },
  formBlock: {
    marginTop: 32,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
  },
  inputRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 2,
  },
  countryBadge: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRightColor: '#E4E7EC',
    borderRightWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flag: {
    fontSize: 18,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
    color: '#101828',
  },
  helper: {
    marginTop: 12,
    fontSize: 14,
    color: '#667085',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 32,
  },
  cta: {
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaEnabled: {
    backgroundColor: '#0F52BA',
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 16,
    elevation: 6,
  },
  ctaDisabled: {
    backgroundColor: '#98A2B3',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  terms: {
    marginTop: 12,
    fontSize: 13,
    color: '#475467',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default PhoneEntryScreen;
