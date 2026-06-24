import React from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  total: number;
  activeIndex: number;
  activeColor?: string;
};

const PaginationDots: React.FC<Props> = ({
  total,
  activeIndex,
  activeColor = '#0F52BA',
}) => {
  return (
    <View style={styles.container}>
      {Array.from({ length: total }).map((_, idx) => {
        const isActive = idx === activeIndex;
        return (
          <View
            key={idx}
            style={[
              styles.dot,
              isActive ? { backgroundColor: activeColor, width: 28 } : null,
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#D0D5DD',
  },
});

export default PaginationDots;
