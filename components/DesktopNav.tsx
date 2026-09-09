import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Logo from '@/assets/images/logo-blue.svg';
import { theme } from '@/components/theme';
import { useAppData } from '@/context/AppDataContext';
import { Avatar } from '@/components/Avatar';
import { radius } from '@/design/tokens';
import { roleLabels } from '@/lib/roleLabels';

const palette = theme.colors;

type NavItem = {
  label: string;
  route: string;
  icon: keyof typeof Feather.glyphMap;
  adminOnly?: boolean;
};

type NavGroup = {
  title?: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    items: [
      { label: 'Idag', route: '/', icon: 'layout' },
      { label: 'Hästar', route: '/stable-horses', icon: 'activity' },
      { label: 'Schema', route: '/calendar', icon: 'calendar' },
      { label: 'Feed', route: '/feed', icon: 'edit-3' },
      { label: 'Chat', route: '/messages', icon: 'message-circle' },
    ],
  },
  {
    title: 'Hantering',
    items: [
      { label: 'Admin', route: '/admin', icon: 'settings', adminOnly: true },
      { label: 'Stall', route: '/stables', icon: 'home', adminOnly: true },
      { label: 'Medlemmar', route: '/members', icon: 'users' },
    ],
  },
  {
    title: 'Konto',
    items: [
      { label: 'Profil', route: '/profile', icon: 'user' },
    ],
  },
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
  const { state, actions, derived } = useAppData();
  const { stables, currentStableId } = state;
  const currentStable = stables.find((stable) => stable.id === currentStableId);
  const currentFarm = state.farms.find((farm) => farm.id === currentStable?.farmId);
  const currentUser = state.users[state.currentUserId];
  const canManageOnboarding = derived.canManageOnboardingAny;
  const memberStableIds = currentUser?.membership?.map((entry) => entry.stableId) ?? [];
  const visibleStables = stables.filter((stable) => memberStableIds.includes(stable.id));
  const stablesToShow = visibleStables.length ? visibleStables : stables;
  const membership = currentUser?.membership?.find((item) => item.stableId === currentStableId);
  const roleLabel =
    membership?.access === 'owner'
      ? 'Ägare'
      : membership?.customRole?.trim() || roleLabels[membership?.role ?? 'guest'];
  const accessLabel =
    membership?.access === 'edit'
      ? 'Redigera'
      : membership?.access === 'view'
        ? 'Läsa'
        : '';
  const metaLabel = accessLabel ? `${roleLabel} · ${accessLabel}` : roleLabel;
  const showSidebarHeader = isSidebar && showHeader;

  // Flatten for inline variant
  const allItems = navGroups.flatMap((group) => group.items);

  if (!isSidebar) {
    return (
      <View style={[styles.container, style]}>
        {allItems
          .filter((item) => !item.adminOnly || canManageOnboarding)
          .map((item) => {
            const isActive = item.route === '/' ? pathname === '/' : pathname.startsWith(item.route);
            return (
              <TouchableOpacity
                key={item.route}
                onPress={() => router.push(item.route as Href)}
                activeOpacity={0.85}
                style={[styles.item, isActive && styles.itemActive]}
              >
                <Text style={[styles.label, isActive && styles.labelActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
      </View>
    );
  }

  return (
    <View style={[styles.containerSidebar, style]}>
      {showSidebarHeader ? (
        <View style={styles.sidebarHeader}>
          <View style={styles.brandRow}>
            <Logo width={24} height={24} />
            <View style={styles.brandTextCol}>
              <Text style={styles.brandTitle}>StableFlow</Text>
              {currentFarm?.name ? (
                <Text style={styles.brandMeta} numberOfLines={1}>{currentFarm.name}</Text>
              ) : null}
            </View>
          </View>

          {stablesToShow.length > 0 ? (
            <View style={styles.stableSwitcher}>
              <Text style={styles.sectionLabel}>STALL</Text>
              <View style={styles.stableChips}>
                {stablesToShow.map((stable) => {
                  const active = stable.id === currentStableId;
                  return (
                    <TouchableOpacity
                      key={stable.id}
                      style={[styles.stableChip, active && styles.stableChipActive]}
                      onPress={() => actions.setCurrentStable(stable.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.stableChipText, active && styles.stableChipTextActive]} numberOfLines={1}>
                        {stable.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.navBody}>
        {navGroups.map((group, groupIndex) => {
          const filteredItems = group.items.filter(
            (item) => !item.adminOnly || canManageOnboarding,
          );
          if (filteredItems.length === 0) return null;

          return (
            <View key={groupIndex} style={styles.navGroup}>
              {group.title ? (
                <Text style={styles.sectionLabel}>{group.title.toUpperCase()}</Text>
              ) : null}
              {filteredItems.map((item) => {
                const isActive = item.route === '/' ? pathname === '/' : pathname.startsWith(item.route);
                return (
                  <TouchableOpacity
                    key={item.route}
                    onPress={() => router.push(item.route as Href)}
                    activeOpacity={0.7}
                    style={[
                      styles.navItem,
                      isActive && styles.navItemActive,
                    ]}
                  >
                    <Feather
                      name={item.icon}
                      size={16}
                      color={isActive ? palette.primary : palette.secondaryText}
                    />
                    <Text
                      style={[
                        styles.navLabel,
                        isActive && styles.navLabelActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </View>

      {showSidebarHeader ? (
        <TouchableOpacity
          style={styles.profileRow}
          onPress={() => router.push('/profile')}
          activeOpacity={0.85}
        >
          <Avatar
            source={currentUser?.avatar}
            style={styles.profileAvatar}
            accessibilityLabel={`${currentUser?.name ?? 'Användare'} profilbild`}
          />
          <View style={styles.profileText}>
            <Text style={styles.profileName} numberOfLines={1}>{currentUser?.name ?? 'Okänd'}</Text>
            <Text style={styles.profileMeta} numberOfLines={1}>{metaLabel}</Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Inline variant (horizontal, unchanged)
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 28,
    paddingTop: 6,
    paddingBottom: 12,
    maxWidth: 1400,
    width: '100%',
    alignSelf: 'center',
  },
  item: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  itemActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  labelActive: {
    color: palette.inverseText,
  },

  // Sidebar variant
  containerSidebar: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  sidebarHeader: {
    gap: 16,
    paddingBottom: 16,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(27, 30, 47, 0.06)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandTextCol: {
    flex: 1,
    minWidth: 0,
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.primaryText,
    letterSpacing: -0.3,
  },
  brandMeta: {
    fontSize: 11,
    color: palette.secondaryText,
    marginTop: 1,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: palette.secondaryText,
    opacity: 0.7,
    marginBottom: 2,
  },
  stableSwitcher: {
    gap: 6,
  },
  stableChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stableChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  stableChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  stableChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryText,
  },
  stableChipTextActive: {
    color: palette.inverseText,
  },

  // Navigation body
  navBody: {
    flex: 1,
    gap: 20,
    paddingTop: 12,
  },
  navGroup: {
    gap: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: 'rgba(62, 155, 95, 0.10)',
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.secondaryText,
    letterSpacing: -0.1,
  },
  navLabelActive: {
    color: palette.primary,
    fontWeight: '600',
  },

  // Profile footer
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(27, 30, 47, 0.06)',
  },
  profileAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  profileName: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  profileMeta: {
    fontSize: 11,
    color: palette.secondaryText,
  },
});
