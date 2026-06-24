import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  ListRenderItem,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/types';
import { onboardingSlides } from '../constants/slides';
import type { OnboardingSlide as Slide } from '../constants/slides';
import OnboardingSlide from '../components/OnboardingSlide';
import PaginationDots from '../components/PaginationDots';

const { width } = Dimensions.get('window');

type Navigation = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

const OnboardingScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 60 }),
    [],
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      if (viewableItems[0]?.index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  );

  const handleSkip = useCallback(() => {
    navigation.replace('AuthPhoneEntry');
  }, [navigation]);

  const handleNext = useCallback(() => {
    const nextIndex = activeIndex + 1;
    if (nextIndex < onboardingSlides.length) {
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    } else {
      navigation.replace('AuthPhoneEntry');
    }
  }, [activeIndex, navigation]);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [],
  );

  const renderItem: ListRenderItem<Slide> = useCallback(
    ({ item }) => (
      <View style={{ width }}>
        <OnboardingSlide slide={item} />
      </View>
    ),
    [],
  );

  const activeSlide = onboardingSlides[activeIndex];
  const ctaLabel =
    activeIndex === onboardingSlides.length - 1 ? 'Get Started' : 'Next';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={[styles.logoBadge, { backgroundColor: '#0F52BA' }]}>
            <Text style={styles.logoLetter}>M</Text>
          </View>
          <Text style={styles.brandName}>Moveos</Text>
        </View>
        <Pressable onPress={handleSkip} hitSlop={12}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={onboardingSlides}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={renderItem}
        snapToInterval={width}
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged.current}
        getItemLayout={getItemLayout}
      />

      <View style={styles.footer}>
        <PaginationDots
          total={onboardingSlides.length}
          activeIndex={activeIndex}
          activeColor={activeSlide?.accentColor}
        />
        <Pressable
          style={[
            styles.ctaButton,
            { backgroundColor: activeSlide?.accentColor ?? '#0F52BA' },
          ]}
          onPress={handleNext}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    paddingHorizontal: 16,
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingTop: StatusBar.currentHeight ?? 0,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  brandName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F52BA',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  ctaButton: {
    marginTop: 6,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default OnboardingScreen;
