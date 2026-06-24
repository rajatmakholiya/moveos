import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useGeoSearch } from '@/features/requests/hooks/useGeoSearch';
import type { GeoPlace } from '@/types';

type Props = {
  label: string;
  placeholder: string;
  routeId?: string;
  selected: GeoPlace | null;
  onSelect: (place: GeoPlace) => void;
  error?: string;
  iconColor?: string;
};

/**
 * Search field with an absolute-overlay autocomplete dropdown.
 *
 * Uses a plain map() (not a FlatList) so it can live inside a ScrollView with no
 * nested-VirtualizedList warning, and renders the backend place shape
 * ({ placeId, label, lat, lng }) directly — the previous version read item.id /
 * item.name which the backend doesn't send, so every row was blank.
 */
export const GeoSearchField: React.FC<Props> = ({
  label,
  placeholder,
  routeId,
  selected,
  onSelect,
  error,
  iconColor = '#16A34A',
}) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  // Only query while focused + typing; once a place is picked we stop searching.
  const { results, loading } = useGeoSearch(focused ? query : '', routeId);

  const showDropdown = focused && query.trim().length >= 2;

  return (
    <View style={[styles.wrap, showDropdown && styles.wrapActive]}>
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.inputRow, !!error && styles.inputRowError]}>
        <View style={[styles.dot, { backgroundColor: iconColor }]} />
        <TextInput
          style={styles.input}
          value={focused ? query : (selected?.label ?? query)}
          onChangeText={setQuery}
          onFocus={() => {
            setFocused(true);
            setQuery(selected?.label ?? '');
          }}
          onBlur={() => {
            // Delay so a tap on a suggestion registers before blur hides it
            setTimeout(() => setFocused(false), 150);
          }}
          placeholder={placeholder}
          placeholderTextColor="#C4CDD5"
        />
        {loading && <ActivityIndicator size="small" color="#0F52BA" />}
        {!!selected && !focused && <Text style={styles.check}>✓</Text>}
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {showDropdown && (
        <View style={styles.dropdown}>
          {results.length === 0 && !loading ? (
            <Text style={styles.noResults}>No places found</Text>
          ) : (
            results.slice(0, 6).map((place, index) => (
              <Pressable
                key={place.placeId ?? `geo-${index}`}
                style={styles.row}
                onPress={() => {
                  onSelect(place);
                  setQuery(place.label);
                  setFocused(false);
                }}
              >
                <Text style={styles.rowPin}>📍</Text>
                <Text style={styles.rowText} numberOfLines={1}>
                  {place.label}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 14, position: 'relative', zIndex: 1 },
  // When the dropdown is open this field must paint ABOVE the next sibling field.
  // On Android paint order is driven by elevation, on iOS by zIndex — set both high.
  wrapActive: { zIndex: 1000, elevation: 24 },
  label: { fontSize: 13, fontWeight: '700', color: '#475467', marginBottom: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputRowError: { borderColor: '#F97066' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  input: { flex: 1, fontSize: 15, color: '#0F172A', padding: 0 },
  check: { color: '#16A34A', fontWeight: '800', fontSize: 16 },
  errorText: { fontSize: 12, color: '#D92D20', marginTop: 4 },

  dropdown: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 24,
    zIndex: 1000,
    overflow: 'hidden',
  },
  noResults: { padding: 14, color: '#98A2B3', fontSize: 13, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F2F4F7',
  },
  rowPin: { fontSize: 15 },
  rowText: { flex: 1, fontSize: 14, color: '#0F172A', fontWeight: '600' },
});

export default GeoSearchField;
