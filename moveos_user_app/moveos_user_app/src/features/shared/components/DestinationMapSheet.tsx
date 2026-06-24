import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import BackButton from './BackButton';
import MapPreview, { MapPoint } from './MapPreview';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.90;
const KEYBOARD_TOP_MARGIN = 250;

type DestinationMapSheetProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  pickupValue: string;
  destinationValue: string;
  onChangePickup: (value: string) => void;
  onChangeDestination: (value: string) => void;
  origin: MapPoint;
  destination: MapPoint;
  showInputs?: boolean;
};

const DestinationMapSheet: React.FC<DestinationMapSheetProps> = ({
  visible,
  onClose,
  onConfirm,
  pickupValue,
  destinationValue,
  onChangePickup,
  onChangeDestination,
  origin,
  destination,
  showInputs = true,
}) => {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [activeField, setActiveField] = useState<'pickup' | 'destination' | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const targetOffset =
      (visible ? SCREEN_HEIGHT - SHEET_HEIGHT : SCREEN_HEIGHT) +
      (visible && (keyboardVisible || activeField) ? KEYBOARD_TOP_MARGIN : 0);

    Animated.spring(translateY, {
      toValue: targetOffset,
      useNativeDriver: true,
      damping: 22,
      stiffness: 240,
    }).start();
  }, [activeField, keyboardVisible, translateY, visible]);

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade">
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            height: SHEET_HEIGHT,
            transform: [{ translateY }],
          },
        ]}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Route preview</Text>
              <BackButton variant="close" onPress={onClose} />
            </View>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              !showInputs ? styles.mapOnlyContent : null,
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {showInputs ? (
              <>
                <View style={styles.inputBlock}>
                  <Text style={styles.label}>Pickup</Text>
                  <TextInput
                    value={pickupValue}
                    style={styles.input}
                    placeholder="Pickup location"
                    placeholderTextColor="#98A2B3"
                    onFocus={() => setActiveField('pickup')}
                    onBlur={() => setActiveField(null)}
                    onChangeText={onChangePickup}
                  />
                </View>

                <View style={styles.inputBlock}>
                  <Text style={styles.label}>Destination</Text>
                  <TextInput
                    value={destinationValue}
                    style={styles.input}
                    placeholder="Destination"
                    placeholderTextColor="#98A2B3"
                    onFocus={() => setActiveField('destination')}
                    onBlur={() => setActiveField(null)}
                    onChangeText={onChangeDestination}
                  />
                </View>
              </>
            ) : null}

              {/* CTA */}
          {showInputs ? (
            <View style={styles.footer}>
              <Pressable style={styles.confirm} onPress={onConfirm ?? onClose}>
                <Text style={styles.confirmText}>Use this route</Text>
              </Pressable>
            </View>
          ) : null}

            {/* Map */}
            <View
              style={[
                styles.mapContainer,
                showInputs ? null : styles.mapContainerFull,
              ]}
            >
              <MapPreview
                origin={origin}
                destination={destination}
                height={showInputs ? 220 : SCREEN_HEIGHT * 0.8}
              />
            </View>
          </ScrollView>

        
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};

export default DestinationMapSheet;


const styles = StyleSheet.create({
  flex: { flex: 1 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    elevation: 20,
  },

  header: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },

  handle: {
    alignSelf: 'center',
    width: 48,
    height: 6,
    borderRadius: 6,
    backgroundColor: '#E4E7EC',
    marginBottom: 12,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
  mapOnlyContent: {
    paddingBottom: 24,
  },

  inputBlock: {
    gap: 6,
  },

  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475467',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  input: {
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '600',
  },

  mapContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  mapContainerFull: {
    borderRadius: 0,
    marginHorizontal: -16,
  },

  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F2F4F7',
  },

  confirm: {
    backgroundColor: '#0F52BA',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },

  confirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
