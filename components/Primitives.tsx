import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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

const headerStyles = StyleSheet.create({
  container: {
    minHeight: 68,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  side: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: color.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const PageHeader = ({ title, left, right, children, style }: any) => (
  <View style={[headerStyles.container, style]}>
    <View style={headerStyles.side}>{left}</View>
    <View style={headerStyles.center}>
      {children ?? (
        <Text numberOfLines={1} style={headerStyles.title}>
          {title}
        </Text>
      )}
    </View>
    <View style={headerStyles.side}>{right}</View>
  </View>
);

export const HeaderIconButton = ({ style, ...props }: any) => (
  <TouchableOpacity
    style={[headerStyles.iconButton, style]}
    activeOpacity={0.85}
    {...props}
  />
);

export { headerStyles };
