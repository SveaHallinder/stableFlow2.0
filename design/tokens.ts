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
  bg: '#F6F5F1',
  card: '#FFFFFF',
  cardGlass: '#FAFAF7',
  text: '#202C27',
  textMuted: '#66736B',
  divider: '#E2E6DF',
  tint: '#245743',
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
      shadowColor: '#202C27',
      shadowOpacity: 0.03,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    small: {
      shadowColor: '#202C27',
      shadowOpacity: 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
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
      shadowColor: 'rgba(62, 155, 95, 0.22)',
      shadowOpacity: 1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
  },
  android: { small: 1, medium: 3, large: 6 },
};
