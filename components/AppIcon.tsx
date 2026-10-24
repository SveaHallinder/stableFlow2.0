import React from 'react';
import { View, type ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HorseIcon from '@/assets/images/figma/profile-horse.svg';
import { theme } from '@/components/theme';

export type AppIconName = 'home' | 'horse' | 'calendar' | 'feed' | 'chat' | 'stable';

type AppIconProps = {
  name: AppIconName;
  size?: number;
  color?: ColorValue;
  focused?: boolean;
};

const symbols = {
  home: ['home-outline', 'home'],
  calendar: ['calendar-outline', 'calendar'],
  feed: ['newspaper-outline', 'newspaper'],
  chat: ['chatbubble-ellipses-outline', 'chatbubble-ellipses'],
  stable: ['business-outline', 'business'],
} as const;

export function AppIcon({ name, size = 22, color = theme.colors.primaryText, focused = false }: AppIconProps) {
  if (name === 'horse') {
    return (
      <View accessible={false} style={{ width: size, height: size, opacity: focused ? 1 : 0.65 }}>
        <HorseIcon width={size} height={size} preserveAspectRatio="xMidYMid meet" />
      </View>
    );
  }
  return <Ionicons name={symbols[name][focused ? 1 : 0]} size={size} color={color} />;
}
