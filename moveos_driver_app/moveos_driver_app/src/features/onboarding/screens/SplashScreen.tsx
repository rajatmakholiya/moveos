import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuthStore } from '@/store/auth';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

const SplashScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { isReady, token } = useAuthStore();

  useEffect(() => {
    if (!isReady) return;

    const decide = async () => {
      if (token) {
        navigation.replace('AppShell');
        return;
      }
      navigation.replace('AuthPhoneEntry');
    };

    // Small delay so the splash is visible even on fast devices
    const timer = setTimeout(decide, 1200);
    return () => clearTimeout(timer);
  }, [isReady, navigation, token]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F52BA" />
      <View style={styles.logoCircle}>
        <Text style={styles.logoLetter}>M</Text>
      </View>
      <Text style={styles.brand}>MoveOS Driver</Text>
      <ActivityIndicator color="#FFFFFF" style={styles.spinner} size="small" />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Driver operations</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F52BA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: '#0B3E8A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1D33',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 22,
    elevation: 12,
  },
  logoLetter: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  brand: {
    marginTop: 20,
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  spinner: {
    marginTop: 16,
  },
  badge: {
    position: 'absolute',
    bottom: 32,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 22,
  },
  badgeText: {
    color: '#E4E7EC',
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});

export default SplashScreen;
