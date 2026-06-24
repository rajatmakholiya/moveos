import React, { useCallback, useState } from 'react';
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
import Toast from 'react-native-toast-message';

import BackButton from '@/features/shared/components/BackButton';
import { api, ApiError } from '@/lib/api';
import { useOnboardingStore } from '@/store/onboarding';
import { useAuthStore } from '@/store/auth';
import { useLanguageStore } from '@/store/language';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'ProfileCreate'>;

type Step = 'name' | 'consents';

const ProfileCreateScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const tx = useLanguageStore((s) => s.tx);
  const { onboardingToken } = useOnboardingStore();
  const login = useAuthStore((s) => s.login);

  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const nameValid = name.trim().length >= 2;
  const consentsValid = termsAccepted && privacyAccepted;

  const handleNameContinue = useCallback(() => {
    if (!nameValid) return;
    setStep('consents');
  }, [nameValid]);

  const handleFinish = useCallback(async () => {
    if (!consentsValid || !onboardingToken || loading) return;
    setLoading(true);
    try {
      const res = await api.post<{
        status: string;
        data: {
          authToken: string;
          refreshToken?: string;
          userId: string;
          role: string;
          driverId?: string | null;
          passengerId?: string | null;
          name?: string | null;
          phone?: string;
        };
      }>(
        '/onboarding/profile',
        { name: name.trim() },
        onboardingToken,
      );
      const { data } = res;
      await login({
        token: data.authToken,
        refreshToken: data.refreshToken,
        user: {
          userId: data.userId,
          role: data.role as 'PASSENGER' | 'DRIVER' | 'AGENT' | 'ADMIN',
          driverId: data.driverId ?? undefined,
          passengerId: data.passengerId ?? undefined,
          name: data.name ?? undefined,
          phone: data.phone,
        },
      });
      navigation.replace('AppShell');
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { message?: string })?.message ?? tx('error_generic'))
          : tx('error_network');
      Toast.show({ type: 'error', text1: msg });
    } finally {
      setLoading(false);
    }
  }, [consentsValid, onboardingToken, loading, name, login, navigation, tx]);

  if (step === 'consents') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <BackButton onPress={() => setStep('name')} />
            <Text style={styles.brand}>Moveos</Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={styles.hero}>
            <Text style={styles.title}>{tx('auth_consents_title')}</Text>
            <Text style={styles.subtitle}>
              Please review and accept our policies to continue.
            </Text>
          </View>

          <View style={styles.consentsList}>
            <Pressable
              style={styles.consentRow}
              onPress={() => setTermsAccepted((v) => !v)}
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.consentText}>{tx('auth_consents_terms')}</Text>
            </Pressable>

            <Pressable
              style={styles.consentRow}
              onPress={() => setPrivacyAccepted((v) => !v)}
            >
              <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
                {privacyAccepted && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.consentText}>{tx('auth_consents_privacy')}</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.cta, consentsValid && !loading ? styles.ctaEnabled : styles.ctaDisabled]}
            onPress={handleFinish}
            disabled={!consentsValid || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaText}>{tx('auth_consents_cta')}</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
            <Text style={styles.title}>{tx('auth_name_title')}</Text>
            <Text style={styles.subtitle}>
              We'll use this for your profile and tickets.
            </Text>
          </View>

          <View style={styles.formBlock}>
            <Text style={styles.label}>{tx('auth_name_label')}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Arjun Sharma"
              placeholderTextColor="#C4CDD5"
              style={styles.input}
              autoCapitalize="words"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleNameContinue}
            />
          </View>

          <Pressable
            style={[styles.cta, nameValid ? styles.ctaEnabled : styles.ctaDisabled]}
            onPress={handleNameContinue}
            disabled={!nameValid}
          >
            <Text style={styles.ctaText}>{tx('auth_name_cta')}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FBFF' },
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
  hero: { marginTop: 24, marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 8, fontSize: 16, color: '#475467' },
  formBlock: { gap: 8 },
  label: { fontSize: 16, fontWeight: '700', color: '#101828' },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#101828',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 2,
  },
  consentsList: { gap: 16, marginBottom: 32 },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#0F52BA', borderColor: '#0F52BA' },
  checkmark: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  consentText: { flex: 1, fontSize: 15, color: '#0F172A', fontWeight: '500' },
  cta: {
    marginTop: 'auto',
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
  ctaDisabled: { backgroundColor: '#98A2B3' },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

export default ProfileCreateScreen;
