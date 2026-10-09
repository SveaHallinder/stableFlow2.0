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
  type TextStyle,
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
  Platform.OS === 'android'
    ? { elevation: elevated ? shadow.android.small : 0 }
    : elevated
      ? shadow.ios.small
      : shadow.ios.none;

export const Card = ({ style, children, elevated, tone = 'default', ...props }: CardProps) => (
  <View
    style={[
      {
        backgroundColor: tone === 'muted' ? color.cardGlass : color.card,
        borderRadius: radius.lg,
        borderWidth: 1,
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

type PillProps = PropsWithChildren<
  ViewProps & {
    active?: boolean;
    style?: StyleProp<ViewStyle>;
  }
>;

export const Pill = ({ active, style, children, ...props }: PillProps) => (
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

type SearchBarProps = React.ComponentProps<typeof TextInput> & {
  style?: StyleProp<ViewStyle>;
};

export const SearchBar = ({ style, ...props }: SearchBarProps) => (
  <View
    style={[
      {
        backgroundColor: color.card,
        borderRadius: radius.md,
        paddingVertical: space.md,
        paddingHorizontal: space.md,
        borderWidth: 1,
        borderColor: color.divider,
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

const headerStyles = StyleSheet.create({
  container: {
    minHeight: 72,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  side: {
    minWidth: 48,
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
    fontSize: 24,
    fontWeight: '700',
    color: color.text,
    textAlign: 'center',
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: systemPalette.surface,
    borderWidth: 1,
    borderColor: systemPalette.border,
  },
  titleStack: {
    alignItems: 'center',
    gap: 2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: color.textMuted,
    letterSpacing: -0.2,
  },
  actionButton: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: systemPalette.primary,
    borderWidth: 1,
    borderColor: systemPalette.primary,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: systemPalette.textInverse,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
});

type PageHeaderProps = {
  title?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export const PageHeader = ({ title, left, right, children, style }: PageHeaderProps) => (
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

type HeaderIconButtonProps = PropsWithChildren<
  React.ComponentProps<typeof TouchableOpacity> & {
    style?: StyleProp<ViewStyle>;
  }
>;

export const HeaderIconButton = ({ style, ...props }: HeaderIconButtonProps) => (
  <TouchableOpacity
    accessibilityRole="button"
    style={[headerStyles.iconButton, style]}
    activeOpacity={0.85}
    {...props}
  />
);

type HeaderActionButtonProps = PropsWithChildren<
  React.ComponentProps<typeof TouchableOpacity> & {
    label?: string;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
  }
>;

export const HeaderActionButton = ({ label, children, style, textStyle, ...props }: HeaderActionButtonProps) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={label}
    style={[headerStyles.actionButton, style]}
    activeOpacity={0.85}
    {...props}
  >
    {children ?? (
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[headerStyles.actionLabel, textStyle]}
      >
        {label}
      </Text>
    )}
  </TouchableOpacity>
);

export { headerStyles };
