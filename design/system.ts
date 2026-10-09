import { color, radius, shadow, space } from './tokens';

export const systemPalette = {
  background: color.bg,
  backgroundAlt: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3EE',
  surfaceTint: '#EDF3ED',
  surfaceGlass: '#FAFAF7',
  primary: color.tint,
  accent: color.tint,
  warning: '#9A631A',
  error: '#BE4444',
  success: '#28724B',
  info: '#356EA0',
  badge: color.tint,
  textPrimary: color.text,
  textSecondary: '#4D5D53',
  textMuted: color.textMuted,
  textDisabled: '#89948B',
  textInverse: '#FFFFFF',
  icon: color.text,
  border: color.divider,
  borderMuted: '#ECEFE8',
  overlay: 'rgba(32, 44, 39, 0.28)',
};

export const systemStatus = {
  feeding: '#A65E34',
  cleaning: '#356EA0',
  riderAway: '#9A631A',
  farrierAway: '#356EA0',
  vetAway: '#287C79',
  evening: '#6C5A91',
  neutral: '#28724B',
};

export const systemGradients = {
  background: [color.bg, color.bg] as const,
  action: ['#326B52', color.tint] as const,
  weather: ['#356EA0', '#477EAA'] as const,
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
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
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
    gradient: ['#EDF3ED', '#EDF3ED'] as [string, string],
    icon: color.tint,
    accentBorder: '#DAE5D9',
    shadow: 'rgba(36, 87, 67, 0.04)',
  },
  accent: {
    gradient: ['#EDF3ED', '#EDF3ED'] as [string, string],
    icon: color.tint,
    accentBorder: '#DAE5D9',
    shadow: 'rgba(36, 87, 67, 0.04)',
  },
  warning: {
    gradient: ['#FAF2E5', '#FAF2E5'] as [string, string],
    icon: systemPalette.warning,
    accentBorder: '#E9DABC',
    shadow: 'rgba(154, 99, 26, 0.04)',
  },
};

export const surfacePresets = {
  hero: '#EDF3ED',
  section: '#FAFAF7',
  card: systemPalette.surface,
  subtle: systemPalette.surfaceAlt,
};
