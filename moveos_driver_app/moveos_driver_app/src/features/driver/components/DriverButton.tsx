import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function DriverButton({ label, onPress, variant = 'primary', loading, disabled }: Props) {
  return (
    <Pressable
      style={[
        styles.button,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : '#0F52BA'} /> : (
        <Text style={[
          styles.label,
          variant === 'secondary' && styles.secondaryLabel,
          variant === 'danger' && styles.dangerLabel,
        ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    minHeight: 46,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { backgroundColor: '#EEF4FF', borderWidth: 1, borderColor: '#BFD4FF' },
  danger: { backgroundColor: '#FEE4E2', borderWidth: 1, borderColor: '#FDB4A8' },
  disabled: { opacity: 0.55 },
  label: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryLabel: { color: '#0F52BA' },
  dangerLabel: { color: '#D92D20' },
});
