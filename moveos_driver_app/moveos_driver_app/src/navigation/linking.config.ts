import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const linkingConfig: LinkingOptions<RootStackParamList> = {
  prefixes: ['pahadi://', 'https://app.pahadi.com'],
  config: {
    screens: {
      // Phase 5 — org invite deep link (placeholder for now)
      // OrgInvite will be added when Driver tabs are wired
    },
  },
};
