import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import BackButton from '../../shared/components/BackButton';
import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'SchemeDetail'>;
type Route = RouteProp<RootStackParamList, 'SchemeDetail'>;

const SchemeDetailScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<Route>();

  const handleBook = () => {
    navigation.replace('AppShell');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton onPress={() => navigation.goBack()} />

        <Text style={styles.title}>{params.title}</Text>
        <Text style={styles.incentive}>{params.incentive}</Text>
        <Text style={styles.description}>{params.description}</Text>

        <View style={styles.detailBox}>
          <Text style={styles.detailHeader}>What to expect</Text>
          <Text style={styles.detailText}>
            This scheme will personalize fares and dispatch rules for your account. Future updates
            will use your routes and preferences to refine recommendations.
          </Text>
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.cta} onPress={handleBook}>
            <Text style={styles.ctaText}>
              {params.ctaLabel ? params.ctaLabel : 'Book a ride with this scheme'}
            </Text>
          </Pressable>
          <Pressable onPress={() => navigation.goBack()} style={styles.secondaryCta}>
            <Text style={styles.secondaryText}>Maybe later</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  incentive: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0E8C5F',
  },
  description: {
    fontSize: 15,
    color: '#475467',
    lineHeight: 22,
  },
  detailBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E4E7EC',
  },
  detailHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  detailText: {
    marginTop: 8,
    fontSize: 14,
    color: '#475467',
    lineHeight: 20,
  },
  footer: {
    gap: 10,
    marginTop: 12,
  },
  cta: {
    backgroundColor: '#0F52BA',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 5,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryCta: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryText: {
    color: '#475467',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default SchemeDetailScreen;
