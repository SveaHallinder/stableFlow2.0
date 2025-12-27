import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import Logo from '@/assets/images/logo-blue.svg';
import { theme } from '@/components/theme';
import { useAppData } from '@/context/AppDataContext';
import { radius } from '@/design/tokens';
import { UserSwitchModal } from '@/components/UserSwitchModal';

const palette = theme.colors;

const navItems = [
  { label: 'Överblick', route: '/' },
  { label: 'Schema', route: '/calendar' },
  { label: 'Meddelanden', route: '/messages' },
  { label: 'Inlägg', route: '/feed' },
  { label: 'Stall', route: '/stables' },
  { label: 'Medlemmar', route: '/members' },
  { label: 'Profil', route: '/profile' },
];

type DesktopNavProps = {
  style?: StyleProp<ViewStyle>;
  variant?: 'inline' | 'sidebar';
  showHeader?: boolean;
};

export function DesktopNav({ style, variant = 'inline', showHeader = true }: DesktopNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isSidebar = variant === 'sidebar';
  const [userSwitchVisible, setUserSwitchVisible] = React.useState(false);
  const { state, actions } = useAppData();
  const { stables, currentStableId } = state;
  const currentStable = stables.find((stable) => stable.id === currentStableId);
  const currentFarm = state.farms.find((farm) => farm.id === currentStable?.farmId);
  const currentUser = state.users[state.currentUserId];
  const canManageOnboarding = currentUser?.membership.some(
    (entry) => entry.role === 'admin' && (entry.access ?? 'view') === 'owner',
  );
  const memberStableIds = currentUser?.membership.map((entry) => entry.stableId) ?? [];
  const visibleStables = stables.filter((stable) => memberStableIds.includes(stable.id));
  const stablesToShow = visibleStables.length ? visibleStables : stables;
  const membership = currentUser?.membership.find((item) => item.stableId === currentStableId);
  const roleLabel =
    membership?.role === 'admin'
      ? 'Admin'
      : membership?.role === 'staff'
        ? 'Personal'
        : membership?.role === 'rider'
          ? 'Medryttare'
          : membership?.role === 'farrier'
            ? 'Hovslagare'
            : membership?.role === 'vet'
              ? 'Veterinär'
              : membership?.role === 'trainer'
                ? 'Tränare'
                : membership?.role === 'therapist'
                  ? 'Massör'
                  : membership?.role === 'guest'
                    ? 'Gäst'
                    : membership?.role ?? 'Ingen roll';
  const accessLabel =
    membership?.access === 'owner'
      ? 'Full'
      : membership?.access === 'edit'
        ? 'Redigera'
        : membership?.access === 'view'
          ? 'Läsa'
          : '';
  const metaLabel = accessLabel ? `${roleLabel} · ${accessLabel}` : roleLabel;
  const showSidebarHeader = isSidebar && showHeader;

  return (
    <View
      style={[
        styles.container,
        isSidebar && styles.containerSidebar,
        style,
      ]}
    >
      {showSidebarHeader ? (
        <View style={styles.sidebarHeader}>
          <View style={styles.brandRow}>
            <Logo width={28} height={28} />
            <View>
              <Text style={styles.brandTitle}>StableFlow</Text>
              <Text style={styles.brandMeta}>
                {currentFarm?.name ? `Aktiv gård: ${currentFarm.name}` : 'Ingen gård vald'}
              </Text>
            </View>
          </View>
          <View style={styles.stableSwitcher}>
            <Text style={styles.stableLabel}>Stall</Text>
            <View style={styles.stableList}>
              {stablesToShow.length ? (
                stablesToShow.map((stable) => {
                  const active = stable.id === currentStableId;
                  return (
                    <TouchableOpacity
                      key={stable.id}
                      style={[styles.stableItem, active && styles.stableItemActive]}
                      onPress={() => actions.setCurrentStable(stable.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.stableName, active && styles.stableNameActive]}>
                        {stable.name}
                      </Text>
                      {stable.location ? (
                        <Text
                          style={[styles.stableLocation, active && styles.stableLocationActive]}
                          numberOfLines={1}
                        >
                          {stable.location}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={styles.stableEmpty}>Inga stall än</Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={styles.profileRow}
            onPress={() => router.push('/profile')}
            activeOpacity={0.85}
          >
            <Image
              source={currentUser?.avatar ?? require('@/assets/images/dummy-avatar.png')}
              style={styles.profileAvatar}
            />
            <View style={styles.profileText}>
              <Text style={styles.profileName}>{currentUser?.name ?? 'Okänd användare'}</Text>
              <Text style={styles.profileMeta}>{metaLabel}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileActionButton}
            onPress={() => setUserSwitchVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.profileActionText}>Byt användare</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {showSidebarHeader ? (
        <UserSwitchModal visible={userSwitchVisible} onClose={() => setUserSwitchVisible(false)} />
      ) : null}
      {navItems
        .filter((item) => item.route !== '/stables' || canManageOnboarding)
        .map((item) => {
        const isActive = item.route === '/' ? pathname === '/' : pathname.startsWith(item.route);
        return (
          <TouchableOpacity
            key={item.route}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.85}
            style={[
              styles.item,
              isSidebar && styles.itemSidebar,
              isActive && styles.itemActive,
              isActive && isSidebar && styles.itemSidebarActive,
            ]}
          >
            <Text
              style={[
                styles.label,
                isSidebar && styles.labelSidebar,
                isActive && styles.labelActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 28,
    paddingTop: 6,
    paddingBottom: 12,
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'flex-start',
  },
  containerSidebar: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 16,
    maxWidth: '100%',
    width: '100%',
  },
  sidebarHeader: {
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primaryText,
  },
  brandMeta: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  stableSwitcher: {
    gap: 8,
  },
  stableLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    color: palette.secondaryText,
    textTransform: 'uppercase',
  },
  stableList: {
    gap: 8,
  },
  stableItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  stableItemActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  stableName: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  stableNameActive: {
    color: palette.inverseText,
  },
  stableLocation: {
    fontSize: 11,
    color: palette.secondaryText,
  },
  stableLocationActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  stableEmpty: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  profileName: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.primaryText,
  },
  profileMeta: {
    fontSize: 11,
    color: palette.secondaryText,
  },
  profileActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    alignSelf: 'flex-start',
  },
  profileActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryText,
  },
  item: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  itemSidebar: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: palette.surface,
    width: '100%',
  },
  itemActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  itemSidebarActive: {
    shadowColor: palette.primary,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  labelSidebar: {
    fontSize: 14,
  },
  labelActive: {
    color: palette.inverseText,
  },
});
