export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  full: 999,
};

export const space = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
};

export const color = {
  bg: '#FFFFFF', // crisp canvas
  card: '#FFFFFF',
  cardGlass: 'rgba(255, 255, 255, 0.72)',
  text: '#101622',
  textMuted: 'rgba(16, 22, 34, 0.55)',
  divider: 'rgba(16, 22, 34, 0.08)',
  tint: '#0A84FF',
  tintSecondary: '#30D158',
  glow: 'transparent',
  glowGreen: 'transparent',
  premium: 'transparent',
};

export const shadow = {
  ios: {
    none: {
      shadowColor: 'rgba(15, 22, 38, 0.04)',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
    },
    micro: {
      shadowColor: 'rgba(15, 22, 38, 0.05)',
      shadowOpacity: 1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
    small: {
      shadowColor: 'rgba(15, 22, 38, 0.08)',
      shadowOpacity: 1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    medium: {
      shadowColor: 'rgba(15, 22, 38, 0.12)',
      shadowOpacity: 1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    large: {
      shadowColor: 'rgba(15, 22, 38, 0.16)',
      shadowOpacity: 1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
    },
    glow: {
      shadowColor: 'rgba(12, 101, 255, 0.22)',
      shadowOpacity: 1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
  },
  android: { small: 1, medium: 3, large: 6 },
};
