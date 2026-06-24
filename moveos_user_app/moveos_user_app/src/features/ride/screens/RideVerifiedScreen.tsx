import React, { useEffect } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'RideVerified'>;
type Route = RouteProp<RootStackParamList, 'RideVerified'>;

const RideVerifiedScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.navigate('RideComplete', {
        fare: '₹370.00',
        promo: 'Saved ₹45.00 with promo',
        driver: { name: params.driver.name, avatar: params.driver.avatar },
        breakdown: [
          { label: 'Distance (12.5 km)', value: '₹180.00' },
          { label: 'Time (45 mins)', value: '₹120.00' },
          { label: 'Tolls & Taxes', value: '₹50.00' },
        ],
        paymentMethod: 'Google Pay • .... 4821',
      });
    }, 10000);
    return () => clearTimeout(timer);
  }, [navigation, params.driver.avatar, params.driver.name]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground
        source={{
          uri: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
        }}
        style={styles.map}
      >
        <View style={styles.overlay} />
        <View style={styles.popup}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>✅</Text>
          </View>
          <Text style={styles.title}>Trip Verified</Text>
          <Text style={styles.subtitle}>
            Tracking enabled from current location to destination.
          </Text>
          <Text style={styles.detail}>
            {params.pickup} → {params.dropoff}
          </Text>
          <Pressable
            style={styles.cta}
            onPress={() => navigation.navigate('RideTracking', { ...params })}
          >
            <Text style={styles.ctaText}>Continue Tracking</Text>
          </Pressable>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  map: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.25)',
  },
  popup: {
    width: '84%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 10,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#475467',
    textAlign: 'center',
  },
  detail: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  cta: {
    marginTop: 6,
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});

export default RideVerifiedScreen;
