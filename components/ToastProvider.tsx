import React from 'react';
import { Animated, StyleSheet, Text, View, Easing, Platform } from 'react-native';
import { color, radius, space } from '@/design/tokens';
import { systemPalette } from '@/design/system';

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
  const dismissingRef = React.useRef(new Set<string>());

  const removeToast = React.useCallback((id: string) => {
    dismissingRef.current.delete(id);
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = React.useCallback(
    (message: string, type: ToastType = 'info', durationMs = DEFAULT_DURATION) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const toast: ToastRecord = { id, message, type };
      setToasts((prev) => [...prev, toast]);

      setTimeout(() => {
        dismissingRef.current.add(id);
        setToasts((prev) => [...prev]); // trigger re-render so ToastItem sees dismissing state
        // Actual removal after exit animation
        setTimeout(() => removeToast(id), 200);
      }, durationMs);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastViewport toasts={toasts} dismissing={dismissingRef.current} />
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

function ToastViewport({ toasts, dismissing }: { toasts: ToastRecord[]; dismissing: Set<string> }) {
  return (
    <View pointerEvents="none" style={styles.viewport}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} isDismissing={dismissing.has(toast.id)} />
      ))}
    </View>
  );
}

function ToastItem({ toast, isDismissing }: { toast: ToastRecord; isDismissing: boolean }) {
  const translateY = React.useMemo(() => new Animated.Value(-60), []);
  const opacity = React.useMemo(() => new Animated.Value(0), []);

  // Enter animation
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
  }, [translateY, opacity]);

  // Exit animation when dismissing
  React.useEffect(() => {
    if (!isDismissing) return;
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
  }, [isDismissing, translateY, opacity]);

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
    borderWidth: 1,
    borderColor: systemPalette.success,
  },
  info: {
    borderWidth: 1,
    borderColor: systemPalette.info,
  },
  error: {
    borderWidth: 1,
    borderColor: systemPalette.error,
  },
});
