import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import NetInfo from '@react-native-community/netinfo';
import { queryClient } from '@/store/queryClient';
import { useLanguageStore } from '@/store/language';

function OfflineBanner() {
  const [isOnline, setIsOnline] = React.useState(true);
  const tx = useLanguageStore((s: { tx: (key: any) => string }) => s.tx);

  React.useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? true);
    });
    return unsub;
  }, []);

  if (isOnline) return null;

  return (
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineText}>{tx('offline_banner')}</Text>
    </View>
  );
}

type Props = {
  children: React.ReactNode;
};

export function Providers({ children }: Props) {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
        {children}
        <Toast />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    backgroundColor: '#D92D20',
    paddingVertical: 8,
    alignItems: 'center',
  },
  offlineText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
