import React from 'react';
import type { PropsWithChildren } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type ViewProps,
} from 'react-native';
import { shadow, color, radius, space } from '../design/tokens';
import { systemPalette } from '../design/system';

type CardProps = PropsWithChildren<
  ViewProps & {
    elevated?: boolean;
    tone?: 'default' | 'muted';
    style?: StyleProp<ViewStyle>;
  }
>;

const getCardShadow = (elevated?: boolean) =>
  Platform.OS === 'ios'
    ? elevated
      ? shadow.ios.small
      : shadow.ios.none
    : { elevation: elevated ? shadow.android.small : 0 };

export const Card = ({ style, children, elevated, tone = 'default', ...props }: CardProps) => (
  <View
    style={[
      {
        backgroundColor: tone === 'muted' ? color.cardGlass : color.card,
        borderRadius: radius.lg,
        borderWidth: 0,
        borderColor: color.divider,
        ...getCardShadow(elevated),
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
        backgroundColor: active ? color.tint : color.card,
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
        backgroundColor: color.card,
        borderRadius: radius.xl,
        paddingVertical: space.md,
        paddingHorizontal: space.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: color.divider,
        ...(Platform.OS === 'ios' ? shadow.ios.micro : { elevation: shadow.android.small }),
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
    height: 68, // Fixed height instead of minHeight for consistency
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  side: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0, // Prevent shrinking
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: '400',
    color: color.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 26, // Consistent line height
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: systemPalette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: systemPalette.border,
  },
  titleStack: {
    alignItems: 'center',
    gap: 2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: color.textMuted,
    letterSpacing: -0.2,
  },
  actionButton: {
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.divider,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.2,
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

export const HeaderActionButton = ({ label, children, style, textStyle, ...props }: any) => (
  <TouchableOpacity
    style={[headerStyles.actionButton, style]}
    activeOpacity={0.85}
    {...props}
  >
    {children ?? <Text style={[headerStyles.actionLabel, textStyle]}>{label}</Text>}
  </TouchableOpacity>
);

export { headerStyles };
