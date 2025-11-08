import React from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import Logo from '@/assets/images/logo-blue.svg';
import SearchIcon from '@/assets/images/Search-icon.svg';
import {
  HeaderActionButton,
  HeaderIconButton,
  PageHeader,
  headerStyles,
} from '@/components/Primitives';
import { systemPalette } from '@/design/system';

type ScreenHeaderProps = {
  title: string;
  style?: StyleProp<ViewStyle>;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode; // Allow custom content in center
  showSearch?: boolean;
  onPressSearch?: () => void;
  showLogo?: boolean; // Control if logo should show by default
  subtitle?: string;
  meta?: ReactNode | string;
  primaryActionLabel?: string;
  onPressPrimaryAction?: () => void;
  primaryAction?: ReactNode;
  primaryActionDisabled?: boolean;
};

export const ScreenHeader = ({
  title,
  style,
  left,
  right,
  children,
  showSearch = true,
  onPressSearch,
  showLogo = true,
  subtitle,
  meta,
  primaryActionLabel,
  onPressPrimaryAction,
  primaryAction,
  primaryActionDisabled,
}: ScreenHeaderProps) => {
  // Resolve left content
  const resolvedLeft = typeof left !== 'undefined' 
    ? left 
    : showLogo 
      ? <Logo width={32} height={32} />
      : null;

  // Resolve right content
  const resolvedRight =
    typeof right !== 'undefined'
      ? right
      : primaryAction
        ? primaryAction
        : primaryActionLabel
          ? (
            <HeaderActionButton
              label={primaryActionLabel}
              onPress={onPressPrimaryAction}
              disabled={primaryActionDisabled}
              style={primaryActionDisabled && styles.actionDisabled}
              textStyle={primaryActionDisabled && styles.actionDisabledText}
            />
          )
          : showSearch
        ? (
          <HeaderIconButton onPress={onPressSearch}>
            <SearchIcon width={20} height={20} />
          </HeaderIconButton>
        )
        : null;

  const resolvedMeta =
    typeof meta === 'string' ? <Text style={styles.metaText}>{meta}</Text> : meta;

  return (
    <PageHeader
      style={[{ 
        marginBottom: 0, 
        justifyContent: 'space-between', 
        paddingVertical: 0,
        paddingHorizontal: 14,
      }, style]}
      title={title}
      left={resolvedLeft}
      right={resolvedRight}
    >
      {children ?? (
        <View style={styles.titleStack}>
          <Text numberOfLines={1} style={headerStyles.title}>{title}</Text>
          {subtitle ? <Text numberOfLines={1} style={headerStyles.subtitle}>{subtitle}</Text> : null}
          {resolvedMeta}
        </View>
      )}
    </PageHeader>
  );
};

export default ScreenHeader;

const styles = StyleSheet.create({
  titleStack: {
    maxWidth: '80%',
    alignItems: 'center',
    gap: 2,
  },
  metaText: {
    fontSize: 12,
    color: systemPalette.textMuted,
    letterSpacing: -0.1,
  },
  actionDisabled: {
    backgroundColor: systemPalette.surfaceGlass,
    borderColor: systemPalette.border,
  },
  actionDisabledText: {
    color: systemPalette.textMuted,
  },
});
