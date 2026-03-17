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
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

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
  const isDesktopWeb = useIsDesktopWeb();

  // Resolve left content — hide logo on desktop (sidebar has it)
  const resolvedLeft = typeof left !== 'undefined'
    ? left
    : showLogo && !isDesktopWeb
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

  if (isDesktopWeb) {
    return (
      <View style={[styles.desktopHeader, style]}>
        <View style={styles.desktopHeaderLeft}>
          {children ?? (
            <>
              <Text numberOfLines={1} style={styles.titleDesktop}>{title}</Text>
              {subtitle ? <Text numberOfLines={1} style={styles.subtitleDesktop}>{subtitle}</Text> : null}
              {resolvedMeta}
            </>
          )}
        </View>
        <View style={styles.desktopHeaderRight}>
          {resolvedRight}
        </View>
      </View>
    );
  }

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
  desktopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 4,
    minHeight: 80,
  },
  desktopHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  desktopHeaderRight: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleDesktop: {
    fontSize: 30,
    fontWeight: '700',
    color: systemPalette.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  subtitleDesktop: {
    fontSize: 15,
    fontWeight: '400',
    color: systemPalette.textMuted,
    letterSpacing: -0.2,
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
