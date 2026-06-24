import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/types';

type Navigation = NativeStackNavigationProp<
  RootStackParamList,
  'MainAppPlaceholder'
>;

const MainAppPlaceholder: React.FC = () => {
  const navigation = useNavigation<Navigation>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Moveos</Text>
        <Text style={styles.subtitle}>
          Connect this entry point to your authenticated app shell once ready.
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => navigation.replace('Onboarding')}
        >
          <Text style={styles.buttonText}>Revisit onboarding</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '86%',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 22,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 16,
    color: '#475467',
    lineHeight: 22,
  },
  button: {
    marginTop: 18,
    backgroundColor: '#0F52BA',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default MainAppPlaceholder;
