import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { OnboardingSlide as Slide } from '../constants/slides';

type Props = {
  slide: Slide;
};

const OnboardingSlide: React.FC<Props> = ({ slide }) => {
  return (
    <View style={styles.container}>
      <View style={[styles.heroCard, { shadowColor: slide.accentColor }]}>
        <Image source={{ uri: slide.imageUri }} style={styles.heroImage} />

        {(slide.statusLabel || slide.statusValue) && (
          <View style={styles.statusCard}>
            {slide.statusLabel ? (
              <Text style={styles.statusLabel}>{slide.statusLabel}</Text>
            ) : null}
            {slide.statusValue ? (
              <Text style={styles.statusValue}>{slide.statusValue}</Text>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.copyBlock}>
        <Text style={styles.title}>
          {slide.title}{' '}
          <Text style={[styles.titleEmphasis, { color: slide.accentColor }]}>
            {slide.highlight}
          </Text>
        </Text>
        <Text style={styles.description}>{slide.description}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  heroCard: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0E2949',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 24,
    elevation: 12,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  statusCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(15, 41, 73, 0.75)',
  },
  statusLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 12,
    color: '#D7DFEC',
    fontWeight: '700',
  },
  statusValue: {
    marginTop: 4,
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  copyBlock: {
    marginTop: 28,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#101828',
    textAlign: 'center',
  },
  titleEmphasis: {
    fontSize: 32,
    fontWeight: '800',
  },
  description: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: '#475467',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});

export default OnboardingSlide;
