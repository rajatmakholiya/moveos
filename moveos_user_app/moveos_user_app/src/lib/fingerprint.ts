// react-native-get-random-values is imported in index.js before this runs
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pahadi_device_fingerprint';

export async function getOrCreateDeviceFingerprint(): Promise<string> {
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return existing;
  const id = `rn-${uuidv4()}`;
  await AsyncStorage.setItem(KEY, id);
  return id;
}
