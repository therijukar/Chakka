import { Platform, type ViewStyle } from 'react-native';

export const COLORS = {
  // Modern Indian Highway Transport Palette
  navy: '#0B1F3A',
  navyLight: '#16355E',
  primary: '#1D4ED8',
  primaryDark: '#1E3A8A',
  saffron: '#F97316',
  saffronBg: '#FFF7ED',
  accent: '#F59E0B',

  background: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  text: '#0F172A',
  textSecondary: '#475569',
  border: '#E2E8F0',

  // Indian Commercial Yellow Plate
  plateYellow: '#FACC15',
  plateBorder: '#1E293B',
  plateIndBlue: '#1D4ED8',

  // Status & Compliance
  green: '#059669',
  greenBg: '#D1FAE5',
  amber: '#D97706',
  amberBg: '#FEF3C7',
  red: '#DC2626',
  redBg: '#FEE2E2',

  // Driver Action Tile Colors
  startTrip: '#059669',
  endTrip: '#DC2626',
  fuel: '#2563EB',
  expense: '#7C3AED',
  docs: '#0D9488',
};

export const LAYOUT = {
  MIN_TOUCH_TARGET: 56, // Non-negotiable min 56px height for driver buttons
  RADIUS: 18,
  RADIUS_SM: 12,
  PADDING: 16,
};

export const SHADOWS: Record<'card' | 'hero' | 'pill', ViewStyle> = {
  card: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
    },
    default: { elevation: 3 },
  }) as ViewStyle,
  hero: Platform.select({
    ios: {
      shadowColor: '#0B1F3A',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 18,
    },
    default: { elevation: 8 },
  }) as ViewStyle,
  pill: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
    },
    default: { elevation: 2 },
  }) as ViewStyle,
};
