import type { ViewStyle } from 'react-native';
import { Platform, useWindowDimensions } from 'react-native';

const DESKTOP_BREAKPOINT = 1024;

export function useIsDesktopWeb() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}

/** Web-only sticky positioning — safe to spread onto any View style. */
export const webStickyStyle: ViewStyle | undefined =
  Platform.OS === 'web'
    ? ({ position: 'sticky' as 'relative', top: 20 } as ViewStyle)
    : undefined;
