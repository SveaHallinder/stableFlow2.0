import { color, radius, shadow, space } from './tokens';

export const systemPalette = {
  background: '#F8FAFD',
  backgroundAlt: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F3F6FC',
  surfaceTint: '#F6F8FC',
  surfaceSoft: 'rgba(255, 255, 255, 0.85)',
  surfaceGlass: 'rgba(255, 255, 255, 0.3)',
  primary: '#2D6CF6',
  accent: '#1BA97A',
  warning: '#E29833',
  error: '#F95F5F',
  success: '#1BA97A',
  info: '#5AA3FF',
  badge: '#5E5CE6',
  textPrimary: '#1B1E2F',
  textSecondary: '#50526A',
  textMuted: '#8A90A6',
  textDisabled: 'rgba(27, 30, 47, 0.32)',
  textInverse: '#FFFFFF',
  icon: '#1B1E2F',
  border: 'rgba(27, 30, 47, 0.08)',
  borderMuted: 'rgba(27, 30, 47, 0.04)',
  overlay: 'rgba(15, 22, 34, 0.08)',
};

export const systemStatus = {
  feeding: '#F95F5F',
  cleaning: '#2D6CF6',
  riderAway: '#E29833',
  farrierAway: '#5AA3FF',
  evening: '#5E5CE6',
  neutral: '#1BA97A',
};

export const systemGradients = {
  background: ['#F8FAFD', '#FFFFFF'] as const,
  hero: ['#EEF3FF', '#FFFFFF'] as const,
  action: ['#3EDFAF', '#2D8BFF'] as const,
  weather: ['#3A73FF', '#5F96FF'] as const,
};

export const systemTypography = {
  headingXL: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 34,
    color: systemPalette.textPrimary,
  },
  headingLg: {
    fontSize: 22,
    fontWeight: '700' as const,
    lineHeight: 28,
    color: systemPalette.textPrimary,
  },
  headingMd: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 24,
    color: systemPalette.textPrimary,
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
    color: systemPalette.textPrimary,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    color: systemPalette.textSecondary,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500' as const,
    lineHeight: 18,
    color: systemPalette.textMuted,
  },
  label: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
    color: systemPalette.textSecondary,
  },
};

export const systemShadows = {
  card: shadow.ios.small,
  cardSoft: shadow.ios.micro,
  cardStrong: shadow.ios.medium,
};

export const systemSpacing = space;
export const systemRadius = radius;

export const quickActionVariants = {
  primary: {
    gradient: ['#ECF3FF', '#F8FAFF'] as [string, string],
    icon: '#2D6CF6',
    accentBorder: 'rgba(45, 108, 246, 0.18)',
    shadow: 'rgba(45, 108, 246, 0.12)',
  },
  accent: {
    gradient: ['#EAF9F4', '#F6FBF9'] as [string, string],
    icon: '#1BA97A',
    accentBorder: 'rgba(27, 169, 122, 0.18)',
    shadow: 'rgba(27, 169, 122, 0.12)',
  },
  warning: {
    gradient: ['#FFF6EB', '#FFF9F1'] as [string, string],
    icon: '#E29833',
    accentBorder: 'rgba(226, 152, 51, 0.18)',
    shadow: 'rgba(226, 152, 51, 0.12)',
  },
};

export const surfacePresets = {
  hero: '#F4F8FF',
  section: '#F7F9FE',
  card: systemPalette.surface,
  subtle: systemPalette.surfaceAlt,
};
