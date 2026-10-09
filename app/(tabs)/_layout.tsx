import React from 'react';
import { Tabs, useGlobalSearchParams } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/components/theme';
import { DesktopNav } from '@/components/DesktopNav';
import { useAuth } from '@/context/AuthContext';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

const palette = theme.colors;
const radii = theme.radii;

export default function TabLayout() {
  const { session, loading } = useAuth();
  const isDesktopWeb = useIsDesktopWeb();
  const insets = useSafeAreaInsets();
  const searchParams = useGlobalSearchParams();
  const fromOnboardingRaw = searchParams.fromOnboarding;
  const fromOnboarding = Array.isArray(fromOnboardingRaw)
    ? fromOnboardingRaw[0]
    : fromOnboardingRaw;
  const hideTabs = fromOnboarding === '1';

  if (loading || !session) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.background }}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  const tabs = (
    <Tabs
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown: false,
        tabBarStyle: hideTabs
          ? styles.tabBarHidden
          : isDesktopWeb
            ? [styles.tabBar, styles.tabBarHidden]
            : [styles.tabBar, { bottom: Math.max(12, insets.bottom) }],
        tabBarBackground: isDesktopWeb
          ? undefined
          : () => <BlurView intensity={12.5} style={styles.blurBackground} />,
        tabBarActiveTintColor: palette.primary,
        tabBarActiveBackgroundColor: palette.surfaceTint,
        tabBarInactiveTintColor: palette.secondaryText,
        tabBarItemStyle: styles.tabBarItem,
        tabBarShowLabel: true,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: styles.tabBarLabel,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Idag',
          tabBarAccessibilityLabel: 'Idag',
          tabBarIcon: ({ color }) => <Feather name="grid" size={23} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stable-horses"
        options={{
          title: 'Hästar',
          tabBarAccessibilityLabel: 'Hästar',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="horse-variant" size={25} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Schema',
          tabBarAccessibilityLabel: 'Schema',
          tabBarIcon: ({ color }) => <Feather name="calendar" size={23} color={color} />,
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarAccessibilityLabel: 'Feed',
          tabBarIcon: ({ color }) => <Feather name="file-text" size={23} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Chat',
          tabBarAccessibilityLabel: 'Chat',
          tabBarIcon: ({ color }) => <Feather name="message-circle" size={23} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          tabBarAccessibilityLabel: 'Profil',
          tabBarIcon: ({ color }) => <Feather name="user" size={23} color={color} />,
        }}
      />
    </Tabs>
  );

  if (!isDesktopWeb || hideTabs) {
    return tabs;
  }

  return (
    <View style={styles.desktopShell}>
      <View style={styles.desktopSidebar}>
        <DesktopNav variant="sidebar" />
      </View>
      <View style={styles.desktopMain}>{tabs}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 12,
    marginLeft: 12,
    marginRight: 12,
    paddingTop: 4,
    paddingBottom: 4,
    alignItems: 'center',
    height: 72,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderRadius: radii.lg,
    borderColor: palette.border,
    paddingHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  blurBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.lg,
  },
  tabBarItem: {
    paddingVertical: 4,
    paddingHorizontal: 0,
    minHeight: 56,
    borderRadius: radii.md,
    marginHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  tabBarHidden: {
    display: 'none',
  },
  desktopShell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: palette.background,
  },
  desktopSidebar: {
    width: 240,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: palette.border,
    backgroundColor: palette.surface,
  },
  desktopMain: {
    flex: 1,
    minWidth: 0,
    backgroundColor: palette.background,
  },
});
