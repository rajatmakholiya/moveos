import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
  right?: string;
  onPress?: () => void;
  children?: React.ReactNode;
};

export function DriverCard({ title, subtitle, right, onPress, children }: Props) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <Text style={styles.right}>{right}</Text> : null}
      </View>
      {children}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    padding: 16,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  textWrap: { flex: 1 },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 3, fontSize: 13, color: '#475467', lineHeight: 18 },
  right: { fontSize: 13, fontWeight: '800', color: '#0F52BA' },
});
