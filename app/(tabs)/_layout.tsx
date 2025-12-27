import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { theme } from '@/components/theme';
import { DesktopNav } from '@/components/DesktopNav';
import { useAppData } from '@/context/AppDataContext';

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
  const { state } = useAppData();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;

  if (!state.sessionUserId) {
    return <Redirect href="/(auth)" />;
  }

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: isDesktopWeb ? [styles.tabBar, styles.tabBarHidden] : styles.tabBar,
        tabBarBackground: isDesktopWeb
          ? undefined
          : () => <BlurView intensity={12.5} style={styles.blurBackground} />,
        tabBarActiveTintColor: palette.icon,
        tabBarInactiveTintColor: palette.secondaryText,
        tabBarItemStyle: styles.tabBarItem,
        tabBarShowLabel: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
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
        name="calendar"
        options={{
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

  if (!isDesktopWeb) {
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
    paddingTop: 5,
    alignItems: 'center',
    height: 60,
    backgroundColor: 'rgba(224, 224, 224, 0.25)',
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
    paddingVertical: 8,
    paddingHorizontal: 0,
    minHeight: 25,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
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
    width: 260,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: palette.border,
    backgroundColor: palette.surfaceTint,
    shadowColor: '#121826',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 8, height: 0 },
    elevation: 2,
  },
  desktopMain: {
    flex: 1,
    minWidth: 0,
  },
});
