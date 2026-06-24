import React, { useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  length?: number;
  accentColor?: string;
};

const OtpInput: React.FC<Props> = ({
  value,
  onChange,
  onComplete,
  length = 6,
  accentColor = '#0F52BA',
}) => {
  const inputs = useRef<Array<TextInput | null>>([]);
  const digits = useMemo(
    () =>
      Array.from({ length }).map((_, idx) => value[idx] ?? ''),
    [length, value],
  );

  useEffect(() => {
    if (value.length === length && onComplete) {
      onComplete(value);
    }
  }, [length, onComplete, value]);

  const handleChange = (text: string, idx: number) => {
    const sanitized = text.replace(/[^0-9]/g, '');
    const nextDigit = sanitized.slice(-1);

    const asArray = digits.slice();
    asArray[idx] = nextDigit;
    const nextValue = asArray.join('');
    onChange(nextValue);

    if (nextDigit && idx < length - 1) {
      inputs.current[idx + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, idx: number) => {
    if (key === 'Backspace' && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  return (
    <View style={styles.row}>
      {digits.map((digit, idx) => (
        <TouchableOpacity
          key={idx}
          activeOpacity={0.9}
          onPress={() => inputs.current[idx]?.focus()}
        >
          <View style={styles.box}>
            <TextInput
              ref={(ref) => { inputs.current[idx] = ref; }}
              value={digit}
              onChangeText={(t) => handleChange(t, idx)}
              onKeyPress={({ nativeEvent }) =>
                handleKeyPress(nativeEvent.key, idx)
              }
              keyboardType="number-pad"
              returnKeyType="next"
              maxLength={1}
              style={[styles.input, { color: '#101828' }]}
              selectionColor={accentColor}
            />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 16,
  },
  box: {
    width: 50,
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  input: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
});

export default OtpInput;
