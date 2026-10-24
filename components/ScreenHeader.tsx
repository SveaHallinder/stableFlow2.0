import React from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Logo from '@/assets/images/figma/logo.svg';
import { HeaderActionButton, HeaderIconButton } from '@/components/Primitives';
import { Avatar } from '@/components/Avatar';
import { systemFonts, systemPalette } from '@/design/system';
import { useAppData } from '@/context/AppDataContext';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

type ScreenHeaderProps = {
  title: string;
  style?: StyleProp<ViewStyle>;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  showSearch?: boolean;
  onPressSearch?: () => void;
  showLogo?: boolean;
  subtitle?: string;
  meta?: ReactNode | string;
  primaryActionLabel?: string;
  onPressPrimaryAction?: () => void;
  primaryAction?: ReactNode;
  primaryActionDisabled?: boolean;
};

const primaryPaths = new Set(['/', '/stable-horses', '/calendar', '/feed', '/messages']);

function AccountShortcut() {
  const router = useRouter();
  const { state } = useAppData();
  const user = state.users[state.currentUserId];
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Öppna profil och mitt stall"
      onPress={() => router.push('/profile')}
      style={styles.accountButton}
      activeOpacity={0.8}
    >
      {user?.avatar ? <Avatar source={user.avatar} style={styles.avatar} /> : (
        <Text style={styles.initials}>{user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('sv-SE') || '·'}</Text>
      )}
    </TouchableOpacity>
  );
}

export const ScreenHeader = ({
  title, style, left, right, children, showSearch = true, onPressSearch,
  showLogo = true, subtitle, meta, primaryActionLabel, onPressPrimaryAction,
  primaryAction, primaryActionDisabled,
}: ScreenHeaderProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const isDesktopWeb = useIsDesktopWeb();
  const fromOnboarding = Array.isArray(params.fromOnboarding) ? params.fromOnboarding[0] : params.fromOnboarding;
  const showAccount = primaryPaths.has(pathname) && fromOnboarding !== '1';
  const resolvedLeft = left !== undefined ? left : showLogo && !isDesktopWeb ? (
    <View style={styles.logo}><Logo width={28} height={31} /></View>
  ) : null;
  const resolvedRight = right !== undefined ? right : primaryAction ?? (primaryActionLabel ? (
    <HeaderActionButton label={primaryActionLabel} onPress={onPressPrimaryAction} disabled={primaryActionDisabled} />
  ) : showSearch ? (
    <HeaderIconButton accessibilityLabel="Sök" onPress={onPressSearch ?? (() => router.push('/search'))}>
      <Ionicons name="search-outline" size={21} color={systemPalette.textPrimary} />
    </HeaderIconButton>
  ) : null);

  return (
    <View style={[styles.header, isDesktopWeb && styles.desktopHeader, style]}>
      <View style={styles.leading}>
        {resolvedLeft}
        <View style={styles.titleStack}>
          {children ?? <>
            <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, isDesktopWeb && styles.titleDesktop]}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {typeof meta === 'string' ? <Text style={styles.subtitle}>{meta}</Text> : meta}
          </>}
        </View>
      </View>
      <View style={styles.actions}>{resolvedRight}{showAccount ? <AccountShortcut /> : null}</View>
    </View>
  );
};

export default ScreenHeader;

const styles = StyleSheet.create({
  header: { minHeight: 76, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  leading: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: { width: 28, height: 31, alignItems: 'center', justifyContent: 'center' },
  titleStack: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: systemFonts.semibold, fontSize: 24, lineHeight: 31, letterSpacing: -0.7, color: systemPalette.textPrimary },
  subtitle: { fontFamily: systemFonts.regular, fontSize: 13, lineHeight: 20, color: systemPalette.textSecondary },
  desktopHeader: { minHeight: 94, paddingVertical: 22, paddingHorizontal: 4 },
  titleDesktop: { fontSize: 30, lineHeight: 38, letterSpacing: -0.9 },
  actions: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  accountButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  initials: { width: 34, height: 34, lineHeight: 34, textAlign: 'center', borderRadius: 17, overflow: 'hidden', backgroundColor: systemPalette.surfaceAlt, color: systemPalette.textPrimary, fontFamily: systemFonts.medium, fontSize: 11 },
});
