import { radius, shadow, space } from './tokens';

export const systemPalette = {
  background: '#F1F4F0',
  backgroundAlt: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F5F3',
  surfaceTint: '#F5F6F4',
  surfaceGlass: 'rgba(255, 255, 255, 0.3)',
  primary: '#3E9B5F',
  accent: '#3E9B5F',
  warning: '#E29833',
  error: '#F95F5F',
  success: '#2E9E5B',
  info: '#5AA3FF',
  badge: '#3E9B5F',
  textPrimary: '#1B1E2F',
  textSecondary: '#50526A',
  textMuted: '#6E7490',
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
  vetAway: '#2FA3A9',
  evening: '#5E5CE6',
  neutral: '#1BA97A',
};

export const systemGradients = {
  background: ['#EFF3ED', '#F5F7F2'] as const,
  action: ['#4FBE7A', '#3E9B5F'] as const,
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
    gradient: ['#EAF6EE', '#F6FBF8'] as [string, string],
    icon: '#3E9B5F',
    accentBorder: 'rgba(62, 155, 95, 0.18)',
    shadow: 'rgba(62, 155, 95, 0.12)',
  },
  accent: {
    gradient: ['#EAF6EE', '#F6FBF8'] as [string, string],
    icon: '#3E9B5F',
    accentBorder: 'rgba(62, 155, 95, 0.18)',
    shadow: 'rgba(62, 155, 95, 0.12)',
  },
  warning: {
    gradient: ['#FFF6EB', '#FFF9F1'] as [string, string],
    icon: '#E29833',
    accentBorder: 'rgba(226, 152, 51, 0.18)',
    shadow: 'rgba(226, 152, 51, 0.12)',
  },
};

export const surfacePresets = {
  hero: '#F0F7F2',
  section: '#F6F8F5',
  card: systemPalette.surface,
  subtle: systemPalette.surfaceAlt,
};
