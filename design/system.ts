import { color, radius, shadow, space } from './tokens';

export const systemPalette = {
  background: color.bg,
  backgroundAlt: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',
  surfaceTint: '#F5F5F5',
  surfaceGlass: '#FAFAFA',
  primary: color.tint,
  accent: color.tint,
  warning: '#9A631A',
  error: '#BE4444',
  success: '#28724B',
  info: '#2196F3',
  badge: color.tint,
  textPrimary: color.text,
  textSecondary: '#666666',
  textMuted: color.textMuted,
  textDisabled: '#999999',
  textInverse: '#FFFFFF',
  icon: color.text,
  border: color.divider,
  borderMuted: '#F5F5F5',
  overlay: 'rgba(0, 0, 0, 0.28)',
};

export const systemStatus = {
  feeding: '#A65E34',
  cleaning: '#0099FF',
  riderAway: '#9A631A',
  farrierAway: '#FFAB00',
  vetAway: '#287C79',
  evening: '#7432FF',
  neutral: '#28724B',
};

export const systemGradients = {
  background: [color.bg, color.bg] as const,
  action: ['#FFFFFF', '#FFFFFF'] as const,
  weather: ['#FFFFFF', '#FFFFFF'] as const,
};

export const systemFonts = {
  regular: 'Inter',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
};

export const systemTypography = {
  headingXL: {
    fontFamily: systemFonts.medium,
    fontSize: 24,
    fontWeight: '500' as const,
    lineHeight: 30,
    color: systemPalette.textPrimary,
  },
  headingLg: {
    fontFamily: systemFonts.medium,
    fontSize: 20,
    fontWeight: '500' as const,
    lineHeight: 26,
    color: systemPalette.textPrimary,
  },
  headingMd: {
    fontFamily: systemFonts.regular,
    fontSize: 17,
    fontWeight: '400' as const,
    lineHeight: 22,
    color: systemPalette.textPrimary,
  },
  title: {
    fontFamily: systemFonts.medium,
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
    color: systemPalette.textPrimary,
  },
  body: {
    fontFamily: systemFonts.regular,
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 24,
    color: systemPalette.textSecondary,
  },
  caption: {
    fontFamily: systemFonts.regular,
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 17,
    color: systemPalette.textMuted,
  },
  label: {
    fontFamily: systemFonts.medium,
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
    gradient: ['#FFFFFF', '#FFFFFF'] as [string, string],
    icon: color.tint,
    accentBorder: '#EAEAEA',
    shadow: 'rgba(0, 153, 255, 0.04)',
  },
  accent: {
    gradient: ['#F5F5F5', '#F5F5F5'] as [string, string],
    icon: color.tint,
    accentBorder: '#F0F0F0',
    shadow: 'rgba(0, 0, 0, 0.04)',
  },
  warning: {
    gradient: ['#FAF2E5', '#FAF2E5'] as [string, string],
    icon: systemPalette.warning,
    accentBorder: '#E9DABC',
    shadow: 'rgba(154, 99, 26, 0.04)',
  },
};

export const surfacePresets = {
  hero: '#F5F5F5',
  section: '#FAFAFA',
  card: systemPalette.surface,
  subtle: systemPalette.surfaceAlt,
};
