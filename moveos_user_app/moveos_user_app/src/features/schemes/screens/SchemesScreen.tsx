import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { schemeCatalog, type Scheme } from '../constants/schemes';

const SchemesScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const openScheme = (scheme: Scheme) => {
    navigation.navigate('SchemeDetail', {
      id: scheme.id,
      title: scheme.title,
      description: scheme.description,
      incentive: scheme.incentive,
      ctaLabel: scheme.ctaLabel,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.headerTitle}>Schemes and offers</Text>
        <Text style={styles.subheader}>
          Curated plans based on your routes, preferences, and activity.
        </Text>

        {schemeCatalog.map((scheme) => (
          <Pressable
            key={scheme.id}
            style={styles.card}
            onPress={() => openScheme(scheme)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{scheme.title}</Text>
              <Text style={styles.tag}>Recommended</Text>
            </View>
            <Text style={styles.cardBody}>{scheme.description}</Text>
            <Text style={styles.cardIncentive}>{scheme.incentive}</Text>
            <Text style={styles.cardCta}>{scheme.ctaLabel ?? 'View details'}</Text>
          </Pressable>
        ))}
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
    gap: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  subheader: {
    fontSize: 14,
    color: '#475467',
    marginTop: 4,
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  tag: {
    fontSize: 12,
    color: '#0F52BA',
    backgroundColor: '#E8F0FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cardBody: {
    marginTop: 8,
    fontSize: 14,
    color: '#475467',
    lineHeight: 20,
  },
  cardIncentive: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#0E8C5F',
  },
  cardCta: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F52BA',
  },
});

export default SchemesScreen;
