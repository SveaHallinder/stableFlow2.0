import React from 'react';
import { Tabs, useGlobalSearchParams } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/components/theme';
import { DesktopNav } from '@/components/DesktopNav';
import { useAuth } from '@/context/AuthContext';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

// SVG imports
import DashOutlineIcon from '@/assets/images/tabbar-outl-dash.svg';
import DashFillIcon from '@/assets/images/Tabbar-dash.svg';
import CalendarOutlineIcon from '@/assets/images/tabbar-cal.svg';
import CalendarFillIcon from '@/assets/images/tabbar-fill-cal.svg';
import HomeOutlineIcon from '@/assets/images/tabbar-home.svg';
import HomeFillIcon from '@/assets/images/tabbar-fill-home.svg';
import MessageOutlineIcon from '@/assets/images/tabbar-msg.svg';
import MessageFillIcon from '@/assets/images/tabbar-fill-msg.svg';
import ProfileOutlineIcon from '@/assets/images/tabbar-prof.svg';
import ProfileFillIcon from '@/assets/images/tabbar-fill-prof.svg';

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
            : [styles.tabBar, { bottom: Math.max(20, insets.bottom) }],
        tabBarBackground: isDesktopWeb
          ? undefined
          : () => <BlurView intensity={12.5} style={styles.blurBackground} />,
        tabBarActiveTintColor: palette.icon,
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
          tabBarIcon: ({ color, focused }) => (
            focused ? (
              <DashFillIcon width={23} height={25} />
            ) : (
              <DashOutlineIcon width={23} height={25} />
            )
          ),
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
          tabBarIcon: ({ color, focused }) => (
            focused ? (
              <CalendarFillIcon width={25} height={25} />
            ) : (
              <CalendarOutlineIcon width={25} height={25} />
            )
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarAccessibilityLabel: 'Feed',
          tabBarIcon: ({ color, focused }) => (
            focused ? (
              <HomeFillIcon width={24} height={24} />
            ) : (
              <HomeOutlineIcon width={24} height={24} />
            )
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Chat',
          tabBarAccessibilityLabel: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            focused ? (
              <MessageFillIcon width={25} height={25} />
            ) : (
              <MessageOutlineIcon width={25} height={25} />
            )
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          tabBarAccessibilityLabel: 'Profil',
          tabBarIcon: ({ color, focused }) => (
            focused ? (
              <ProfileFillIcon width={22} height={25} />
            ) : (
              <ProfileOutlineIcon width={22} height={25} />
            )
          ),
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
    bottom: 20,
    marginLeft: 20,
    marginRight: 20,
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: 'center',
    height: 72,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1.5,
    borderRadius: radii.full,
    borderColor: palette.border,
    paddingHorizontal: 5,
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
    borderRadius: radii.full,
  },
  tabBarItem: {
    paddingVertical: 6,
    paddingHorizontal: 0,
    minHeight: 56,
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
    width: 272,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(27, 30, 47, 0.06)',
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(15,22,34,0.04)',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 4, height: 0 },
    elevation: 1,
  },
  desktopMain: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#FBFCFB',
  },
});
