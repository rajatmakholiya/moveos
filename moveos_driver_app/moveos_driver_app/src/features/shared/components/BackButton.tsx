import React, { useCallback } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Feather from '@react-native-vector-icons/feather';

type BackButtonProps = {
  label?: string;
  variant?: 'back' | 'close';
  tone?: 'light' | 'dark';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const BackButton: React.FC<BackButtonProps> = ({
  label,
  variant = 'back',
  tone = 'light',
  onPress,
  style,
}) => {
  const navigation = useNavigation();

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation, onPress]);

  return (
    <Pressable
      hitSlop={10}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        tone === 'dark' ? styles.baseDark : styles.baseLight,
        label ? styles.baseWithLabel : null,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          tone === 'dark' ? styles.iconWrapDark : styles.iconWrapLight,
        ]}
      >
        <Feather
          name={variant === 'close' ? 'x' : 'chevron-left'}
          size={18}
          color={tone === 'dark' ? '#FFFFFF' : '#FFFFFF'}
        />
      </View>
      {label ? (
        <Text style={[styles.label, tone === 'dark' ? styles.labelDark : styles.labelLight]}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
  },
  baseWithLabel: {},
  baseLight: {},
  baseDark: {},
  pressed: {},
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A'
  },
  iconWrapLight: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
  },
  iconWrapDark: {
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  labelLight: {
    color: '#0F172A',
  },
  labelDark: {
    color: '#FFFFFF',
  },
});

export default BackButton;
