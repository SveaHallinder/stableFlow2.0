import React from 'react';
import { Tabs, useGlobalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import TabToday from '@/assets/images/figma/tab-today.svg';
import TabTodayActive from '@/assets/images/figma/tab-today-active.svg';
import TabCalendar from '@/assets/images/figma/tab-calendar.svg';
import TabCalendarActive from '@/assets/images/figma/tab-calendar-active.svg';
import TabFeed from '@/assets/images/figma/tab-feed.svg';
import TabChat from '@/assets/images/figma/tab-chat.svg';
import TabProfile from '@/assets/images/figma/tab-profile.svg';
import TabsFeedActive from '@/assets/images/figma/tabs-feed.svg';
import TabsChatActive from '@/assets/images/figma/tabs-chat.svg';
import TabsProfileActive from '@/assets/images/figma/tabs-profile.svg';
import HorseIcon from '@/assets/images/figma/profile-horse.svg';
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
            : [styles.tabBar, { bottom: Math.max(10, insets.bottom) }],
        tabBarBackground: isDesktopWeb
          ? undefined
          : () => <BlurView intensity={12.5} style={styles.blurBackground} />,
        tabBarActiveTintColor: palette.primaryText,
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveTintColor: palette.secondaryText,
        tabBarItemStyle: styles.tabBarItem,
        tabBarShowLabel: true,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarLabel: ({ focused, color, children }) => (
          <Text style={[styles.tabBarLabel, { color, fontFamily: focused ? theme.fonts.medium : theme.fonts.regular }]}>{children}</Text>
        ),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Idag',
          tabBarAccessibilityLabel: 'Idag',
          tabBarIcon: ({ focused }) => focused ? <TabTodayActive /> : <TabToday />,
        }}
      />
      <Tabs.Screen
        name="stable-horses"
        options={{
          title: 'Hästar',
          tabBarAccessibilityLabel: 'Hästar',
          tabBarIcon: () => <View style={styles.horseIcon}><HorseIcon /></View>,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Schema',
          tabBarAccessibilityLabel: 'Schema',
          tabBarIcon: ({ focused }) => focused ? <TabCalendarActive /> : <TabCalendar />,
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarAccessibilityLabel: 'Feed',
          tabBarIcon: ({ focused }) => focused ? (
            <View style={styles.feedIconCrop}><View style={styles.feedIconSource}><TabsFeedActive /></View></View>
          ) : <TabFeed />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Chat',
          tabBarAccessibilityLabel: 'Chat',
          tabBarIcon: ({ focused }) => focused ? (
            <View style={styles.chatIconCrop}><View style={styles.chatIconSource}><TabsChatActive /></View></View>
          ) : <TabChat />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarAccessibilityLabel: 'Profil',
          tabBarIcon: ({ focused }) => focused ? (
            <View style={styles.profileIconCrop}><View style={styles.profileIconSource}><TabsProfileActive /></View></View>
          ) : <TabProfile />,
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
    marginLeft: 6,
    marginRight: 6,
    paddingTop: 4,
    paddingBottom: 4,
    alignItems: 'center',
    height: 64,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderRadius: 20,
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
    minHeight: 54,
    minWidth: 44,
    borderRadius: radii.md,
    marginHorizontal: 0,
    justifyContent: 'center',
    alignItems: 'stretch',
    flex: 1,
  },
  tabBarLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    fontWeight: '400',
    marginTop: 3,
  },
  tabBarHidden: {
    display: 'none',
  },
  horseIcon: { transform: [{ scale: 1.45 }] },
  // Preserve the original Figma exports and clip only the active icon slot.
  feedIconCrop: { width: 24, height: 24, overflow: 'hidden' },
  feedIconSource: { position: 'absolute', left: -179.87002563476562, top: -18 },
  chatIconCrop: { width: 25, height: 25, overflow: 'hidden' },
  chatIconSource: { position: 'absolute', left: -257.0224304199219, top: -17.5 },
  profileIconCrop: { width: 21.539127349853516, height: 25, overflow: 'hidden' },
  profileIconSource: { position: 'absolute', left: -335.1578063964844, top: -17.5 },
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
