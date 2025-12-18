import React from 'react';
import { Animated, StyleSheet, Text, View, Easing, Platform } from 'react-native';
import { color, radius, space } from '@/design/tokens';

type ToastType = 'success' | 'info' | 'error';

type ToastRecord = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
};

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 2400;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);

  const showToast = React.useCallback(
    (message: string, type: ToastType = 'info', durationMs = DEFAULT_DURATION) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const toast: ToastRecord = { id, message, type };
      setToasts((prev) => [...prev, toast]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, durationMs);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastViewport toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

function ToastViewport({ toasts }: { toasts: ToastRecord[] }) {
  return (
    <View pointerEvents="none" style={styles.viewport}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </View>
  );
}

function ToastItem({ toast }: { toast: ToastRecord }) {
  const translateY = React.useMemo(() => new Animated.Value(-60), []);
  const opacity = React.useMemo(() => new Animated.Value(0), []);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -60,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    };
  }, [translateY, opacity]);

  return (
    <Animated.View
      style={[
        styles.toast,
        styles[toast.type],
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <Text style={styles.toastText}>{toast.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    top: Platform.select({ ios: 80, android: 60 }),
    left: 0,
    right: 0,
    paddingHorizontal: space.lg,
    gap: 8,
  },
  toast: {
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: color.card,
    shadowColor: 'rgba(16,22,34,0.18)',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  toastText: {
    fontSize: 13,
    color: color.text,
    textAlign: 'center',
  },
  success: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(115,212,139,0.7)',
  },
  info: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(10,132,255,0.5)',
  },
  error: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,69,58,0.6)',
  },
});
