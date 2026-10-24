import React from 'react';
import { Tabs, useGlobalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/components/theme';
import { DesktopNav } from '@/components/DesktopNav';
import { AppIcon } from '@/components/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

const palette = theme.colors;

export default function TabLayout() {
  const { session, loading } = useAuth();
  const isDesktopWeb = useIsDesktopWeb();
  const insets = useSafeAreaInsets();
  const searchParams = useGlobalSearchParams();
  const fromOnboardingRaw = searchParams.fromOnboarding;
  const fromOnboarding = Array.isArray(fromOnboardingRaw) ? fromOnboardingRaw[0] : fromOnboardingRaw;
  const hideTabs = fromOnboarding === '1';

  if (loading || !session) {
    return <View style={styles.loading}><ActivityIndicator color={palette.primary} /></View>;
  }

  const tabs = (
    <Tabs
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown: false,
        tabBarStyle: hideTabs || isDesktopWeb
          ? styles.tabBarHidden
          : [styles.tabBar, { height: 64 + insets.bottom, paddingBottom: Math.max(8, insets.bottom) }],
        tabBarActiveTintColor: palette.primaryText,
        tabBarInactiveTintColor: palette.secondaryText,
        tabBarActiveBackgroundColor: 'transparent',
        tabBarItemStyle: styles.tabBarItem,
        tabBarLabelPosition: 'below-icon',
        tabBarLabel: ({ focused, color, children }) => (
          <Text style={[styles.tabBarLabel, { color, fontFamily: focused ? theme.fonts.semibold : theme.fonts.regular }]}>{children}</Text>
        ),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Idag', tabBarAccessibilityLabel: 'Idag', tabBarIcon: ({ focused, color }) => <AppIcon name="home" focused={focused} color={color} /> }} />
      <Tabs.Screen name="stable-horses" options={{ title: 'Hästar', tabBarAccessibilityLabel: 'Hästar', tabBarIcon: ({ focused, color }) => <AppIcon name="horse" focused={focused} color={color} /> }} />
      <Tabs.Screen name="calendar" options={{ title: 'Schema', tabBarAccessibilityLabel: 'Schema', tabBarIcon: ({ focused, color }) => <AppIcon name="calendar" focused={focused} color={color} /> }} />
      <Tabs.Screen name="feed" options={{ title: 'Flöde', tabBarAccessibilityLabel: 'Flöde', tabBarIcon: ({ focused, color }) => <AppIcon name="feed" focused={focused} color={color} /> }} />
      <Tabs.Screen name="messages" options={{ title: 'Chatt', tabBarAccessibilityLabel: 'Chatt', tabBarIcon: ({ focused, color }) => <AppIcon name="chat" focused={focused} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', href: null }} />
    </Tabs>
  );

  if (!isDesktopWeb || hideTabs) return tabs;
  return (
    <View style={styles.desktopShell}>
      <View style={styles.desktopSidebar}><DesktopNav variant="sidebar" /></View>
      <View style={styles.desktopMain}>{tabs}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.background },
  tabBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.border,
    paddingTop: 9, paddingHorizontal: 8, elevation: 0,
  },
  tabBarItem: { minHeight: 48, minWidth: 44, paddingVertical: 2, justifyContent: 'center' },
  tabBarLabel: { fontFamily: theme.fonts.regular, fontSize: 10, marginTop: 4 },
  tabBarHidden: { display: 'none' },
  desktopShell: { flex: 1, flexDirection: 'row', backgroundColor: palette.background },
  desktopSidebar: {
    width: 238, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24,
    borderRightWidth: 1, borderRightColor: palette.border, backgroundColor: palette.surface,
  },
  desktopMain: { flex: 1, minWidth: 0, backgroundColor: palette.background },
});
