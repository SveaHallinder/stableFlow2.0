import { Platform, useWindowDimensions } from 'react-native';

const DESKTOP_BREAKPOINT = 1024;

export function useIsDesktopWeb() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}
