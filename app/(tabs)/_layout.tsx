import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { theme } from '@/components/theme';

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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <BlurView intensity={12.5} style={styles.blurBackground} />
        ),
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
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 19,
    marginLeft: '2.5%',
    width: '95%',
    alignItems: 'center',
    height: 60,
    backgroundColor: palette.surfaceGlass,
    borderColor: 'transparent',
    borderRadius: radii.full,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 0,
    shadowColor: 'rgba(12, 16, 32, 0.12)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
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
});
