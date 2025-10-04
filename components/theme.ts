export const theme = {
  colors: {
    primary: '#4F46E5',
    secondary: '#6B7280',
    background: '#FFFFFF',
    card: '#F9FAFB',
    border: '#E5E7EB',
    error: '#EF4444',
    success: '#10B981',
    lightBlue: '#93C5FD',
    darkBlue: '#3B82F6',
    lightGreen: '#D1FAE5',
    darkGreen: '#059669',
    warning: '#F59E0B',
    lightPink: '#FEE2E2',
    darkPink: '#DC2626',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  typography: {
    h1: {
      fontSize: 32,
      fontWeight: '700' as const,
      lineHeight: 38,
    },
    h2: {
      fontSize: 24,
      fontWeight: '600' as const,
      lineHeight: 30,
    },
    h3: {
      fontSize: 18,
      fontWeight: '600' as const,
      lineHeight: 24,
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as const,
      lineHeight: 22,
    },
    caption: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 20,
      color: '#6B7280',
    },
    small: {
      fontSize: 12,
      fontWeight: '400' as const,
      lineHeight: 16,
      color: '#9CA3AF',
    },
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    },
  }
};