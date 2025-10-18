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
  bg: '#FDFDFD', // canvas
  card: 'rgba(255,255,255,0.92)',
  text: '#0A0A0A',
  textMuted: 'rgba(0,0,0,0.55)',
  divider: 'rgba(0,0,0,0.05)',
  tint: '#87C6A2', // brand accent (StableFlow green)
};

export const shadow = {
  ios: {
    small: {
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    medium: {
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    large: {
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
  },
  android: { small: 2, medium: 4, large: 8 }, // elevation
};
