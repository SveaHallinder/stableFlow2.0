import React from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Logo from '@/assets/images/figma/logo.svg';
import SearchIcon from '@/assets/images/figma/search.svg';
import {
  HeaderActionButton,
  HeaderIconButton,
  PageHeader,
  headerStyles,
} from '@/components/Primitives';
import { systemFonts, systemPalette } from '@/design/system';
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
  const router = useRouter();
  const isDesktopWeb = useIsDesktopWeb();

  // Resolve left content — hide logo on desktop (sidebar has it)
  const resolvedLeft = typeof left !== 'undefined'
    ? left
    : showLogo && !isDesktopWeb
      ? <View style={styles.logo}><Logo /></View>
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
          <HeaderIconButton accessibilityLabel="Sök" onPress={onPressSearch ?? (() => router.push('/search'))}>
            <SearchIcon />
          </HeaderIconButton>
        )
        : null;

  const resolvedMeta =
    typeof meta === 'string' ? <Text style={styles.metaText}>{meta}</Text> : meta;

  if (isDesktopWeb) {
    return (
      <View style={[styles.desktopHeader, style]}>
        {resolvedLeft ? <View style={styles.desktopBack}>{resolvedLeft}</View> : null}
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
        paddingHorizontal: 15,
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
  logo: {
    width: 32.456,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleStack: {
    maxWidth: '100%',
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
    minWidth: 0,
    gap: 4,
  },
  desktopBack: {
    marginRight: 16,
    flexShrink: 0,
  },
  desktopHeaderRight: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleDesktop: {
    fontFamily: systemFonts.medium,
    fontSize: 32,
    fontWeight: '700',
    color: systemPalette.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  subtitleDesktop: {
    fontFamily: systemFonts.regular,
    fontSize: 15,
    fontWeight: '400',
    color: systemPalette.textMuted,
    letterSpacing: -0.2,
  },
  metaText: {
    fontFamily: systemFonts.regular,
    fontSize: 13,
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
