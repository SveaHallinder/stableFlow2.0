import { Alert, Platform } from 'react-native';

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/**
 * Cross-platform confirmation dialog.
 *
 * `Alert.alert` is a no-op on react-native-web, which silently kills any action
 * gated behind its button callbacks (delete/report/remove flows never run on
 * web). On web we fall back to `window.confirm`; on native we keep the native
 * Alert. Resolves true when the user confirms, false otherwise.
 */
export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = 'OK',
    cancelLabel = 'Avbryt',
    destructive = false,
  } = opts;

  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    const canConfirm =
      typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function';
    return Promise.resolve(canConfirm ? globalThis.confirm(text) : false);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
