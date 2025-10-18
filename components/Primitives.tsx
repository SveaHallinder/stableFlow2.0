import React from 'react';
import { Platform, View, TextInput, Text, TouchableOpacity } from 'react-native';
import { shadow, color, radius, space } from '../design/tokens';

export const Card = ({ style, children, ...props }: any) => (
  <View
    style={[
      {
        backgroundColor: color.card,
        borderRadius: radius.lg,
        ...(Platform.OS === 'ios' ? shadow.ios.medium : { elevation: shadow.android.medium }),
      },
      style,
    ]}
    {...props}
  >
    {children}
  </View>
);

export const Pill = ({ active, style, children, ...props }: any) => (
  <View
    style={[
      {
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.full,
        backgroundColor: active ? 'rgba(0,0,0,0.85)' : color.card,
        ...(Platform.OS === 'ios' ? shadow.ios.small : { elevation: shadow.android.small }),
      },
      style,
    ]}
    {...props}
  >
    {children}
  </View>
);

export const SearchBar = ({ style, ...props }: any) => (
  <View
    style={[
      {
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderRadius: radius.xl,
        paddingVertical: space.md,
        paddingHorizontal: space.md,
        ...(Platform.OS === 'ios' ? shadow.ios.small : { elevation: shadow.android.small }),
      },
      style,
    ]}
    {...props}
  >
    <TextInput
      placeholderTextColor={color.textMuted}
      style={{
        fontSize: 16,
        color: color.text,
        padding: 0,
        margin: 0,
      }}
      {...props}
    />
  </View>
);

export const Divider = ({ style, vertical, ...props }: any) => (
  <View
    style={[
      {
        backgroundColor: color.divider,
        [vertical ? 'width' : 'height']: 1,
      },
      style,
    ]}
    {...props}
  />
);
