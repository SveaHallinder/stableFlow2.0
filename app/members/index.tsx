import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DesktopNav } from '@/components/DesktopNav';
import { StableSwitcher } from '@/components/StableSwitcher';
import { Card, Pill } from '@/components/Primitives';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { radius, space } from '@/design/tokens';
import type { UserRole } from '@/context/AppDataContext';

const palette = theme.colors;

const roleOrder: UserRole[] = ['admin', 'staff', 'rider', 'farrier', 'vet', 'trainer', 'therapist', 'guest'];
const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  staff: 'Personal',
  rider: 'Medryttare',
  farrier: 'Hovslagare',
  vet: 'Veterinär',
  trainer: 'Tränare',
  therapist: 'Massör',
  guest: 'Gäst',
};
const accessLabels: Record<string, string> = {
  owner: 'Full',
  edit: 'Redigera',
  view: 'Läsa',
};
const accessLevel: Record<string, number> = { view: 0, edit: 1, owner: 2 };

export default function MembersScreen() {
  const toast = useToast();
  const router = useRouter();
  const { state, actions } = useAppData();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const stickyPanelStyle = isDesktopWeb ? ({ position: 'sticky', top: 20 } as any) : undefined;

  const currentUser = state.users[state.currentUserId];
  const memberStableIds = currentUser?.membership.map((entry) => entry.stableId) ?? [];
  const visibleStables = state.stables.filter((stable) => memberStableIds.includes(stable.id));
  const stables = visibleStables.length ? visibleStables : state.stables;

  const [stableFilter, setStableFilter] = React.useState<string>(state.currentStableId);
  const [roleFilter, setRoleFilter] = React.useState<UserRole | 'all'>('all');
  const [horseFilter, setHorseFilter] = React.useState<string>('all');
  const { q } = useLocalSearchParams<{ q?: string | string[] }>();
  const initialQuery = React.useMemo(
    () => (Array.isArray(q) ? q[0] : q) ?? '',
    [q],
  );
  const [query, setQuery] = React.useState(initialQuery);

  React.useEffect(() => {
    if (stableFilter !== 'all' && stableFilter !== state.currentStableId) {
      setStableFilter(state.currentStableId);
    }
  }, [state.currentStableId, stableFilter]);

  React.useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery);
    }
  }, [initialQuery, query]);

  const membershipByStable = React.useMemo(() => {
    return new Map(currentUser?.membership.map((entry) => [entry.stableId, entry]) ?? []);
  }, [currentUser?.membership]);

  const canManageMembersStable = React.useCallback(
    (stableId: string) => {
      const membership = membershipByStable.get(stableId);
      if (!membership) {
        return false;
      }
      const access = membership.access ?? 'view';
      return membership.role === 'admin' && accessLevel[access] >= 2;
    },
    [membershipByStable],
  );

  const horseNameById = React.useMemo(
    () =>
      state.horses.reduce<Record<string, string>>((acc, horse) => {
        acc[horse.id] = horse.name;
        return acc;
      }, {}),
    [state.horses],
  );

  const stableNameById = React.useMemo(
    () =>
      state.stables.reduce<Record<string, string>>((acc, stable) => {
        acc[stable.id] = stable.name;
        return acc;
      }, {}),
    [state.stables],
  );

  const horsesInScope = React.useMemo(() => {
    if (stableFilter === 'all') {
      const stableSet = new Set(memberStableIds);
      return state.horses.filter((horse) => stableSet.has(horse.stableId));
    }
    return state.horses.filter((horse) => horse.stableId === stableFilter);
  }, [memberStableIds, stableFilter, state.horses]);

  const memberRows = React.useMemo(() => {
    const rows: Array<{
      userId: string;
      name: string;
      email?: string;
      phone?: string;
      stableId: string;
      role: UserRole;
      customRole?: string;
      access?: string;
      riderRole?: string;
      horseNames: string[];
    }> = [];

    const search = query.trim().toLowerCase();
    const horsesByUserId = state.horses.reduce<Record<string, string[]>>((acc, horse) => {
      if (horse.ownerUserId) {
        acc[horse.ownerUserId] = [...(acc[horse.ownerUserId] ?? []), horse.name];
      }
      return acc;
    }, {});

    Object.values(state.users).forEach((user) => {
      user.membership.forEach((membership) => {
        if (stableFilter !== 'all' && membership.stableId !== stableFilter) {
          return;
        }
        if (roleFilter !== 'all' && membership.role !== roleFilter) {
          return;
        }
        if (horseFilter !== 'all') {
          const horse = state.horses.find((item) => item.id === horseFilter);
          if (!horse) {
            return;
          }
          const isOwner = horse.ownerUserId === user.id;
          const hasHorse = membership.horseIds?.includes(horseFilter);
          if (!isOwner && !hasHorse) {
            return;
          }
        }

        const horseNames = [
          ...(membership.horseIds ?? []).map((id) => horseNameById[id]).filter(Boolean),
          ...(horsesByUserId[user.id] ?? []),
        ].filter(Boolean);

        const searchText = [
          user.name,
          user.email,
          user.phone,
          membership.customRole,
          stableNameById[membership.stableId],
          ...horseNames,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (search && !searchText.includes(search)) {
          return;
        }

        rows.push({
          userId: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          stableId: membership.stableId,
          role: membership.role,
          customRole: membership.customRole,
          access: membership.access,
          riderRole: membership.riderRole,
          horseNames,
        });
      });
    });

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [
    horseFilter,
    horseNameById,
    query,
    roleFilter,
    stableFilter,
    stableNameById,
    state.horses,
    state.users,
  ]);

  const handleRoleCycle = React.useCallback(
    (userId: string, stableId: string, role: UserRole) => {
      const index = roleOrder.indexOf(role);
      const nextRole = roleOrder[(index + 1) % roleOrder.length];
      const result = actions.updateMemberRole({ userId, stableId, role: nextRole });
      if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const handleRemoveMember = React.useCallback(
    (userId: string, stableId: string) => {
      const result = actions.removeMemberFromStable(userId, stableId);
      if (!result.success) {
        toast.showToast(result.reason, 'error');
      } else {
        toast.showToast('Medlem borttagen.', 'success');
      }
    },
    [actions, toast],
  );

  const handleOpenMember = React.useCallback(
    (userId: string, stableId: string) => {
      if (stableId !== state.currentStableId) {
        actions.setCurrentStable(stableId);
      }
      router.push({
        pathname: '/members/[id]',
        params: { id: userId, stableId },
      });
    },
    [actions, router, state.currentStableId],
  );

  const wrapDesktop = (content: React.ReactNode) => {
    if (!isDesktopWeb) {
      return content;
    }
    return (
      <View style={styles.desktopShell}>
        <View style={styles.desktopSidebar}>
          <DesktopNav variant="sidebar" />
        </View>
        <View style={styles.desktopMain}>{content}</View>
      </View>
    );
  };

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        {wrapDesktop(
          <>
            <ScreenHeader
              style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
              title="Medlemmar"
              showSearch={false}
            />
            {!isDesktopWeb ? <StableSwitcher /> : null}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.content,
                isDesktopWeb && styles.contentDesktop,
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.desktopLayout, isDesktopWeb && styles.desktopLayoutDesktop]}>
                <View style={[styles.desktopPanel, stickyPanelStyle]}>
                  <Card tone="muted" style={styles.filterCard}>
                    <Text style={styles.panelTitle}>Filter</Text>
                    {stables.length > 1 ? (
                      <>
                        <Text style={styles.filterLabel}>Stall</Text>
                        <View style={styles.filterRow}>
                          <TouchableOpacity onPress={() => setStableFilter('all')}>
                            <Pill active={stableFilter === 'all'} style={styles.filterChip}>
                              <Text
                                style={[
                                  styles.filterChipText,
                                  stableFilter === 'all' && styles.filterChipTextActive,
                                ]}
                              >
                                Alla
                              </Text>
                            </Pill>
                          </TouchableOpacity>
                          {stables.map((stable) => (
                            <TouchableOpacity
                              key={stable.id}
                              onPress={() => {
                                actions.setCurrentStable(stable.id);
                                setStableFilter(stable.id);
                              }}
                            >
                              <Pill active={stableFilter === stable.id} style={styles.filterChip}>
                                <Text
                                  style={[
                                    styles.filterChipText,
                                    stableFilter === stable.id && styles.filterChipTextActive,
                                  ]}
                                >
                                  {stable.name}
                                </Text>
                              </Pill>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    ) : null}
                    <Text style={styles.filterLabel}>Roll</Text>
                    <View style={styles.filterRow}>
                      <TouchableOpacity onPress={() => setRoleFilter('all')}>
                        <Pill active={roleFilter === 'all'} style={styles.filterChip}>
                          <Text
                            style={[
                              styles.filterChipText,
                              roleFilter === 'all' && styles.filterChipTextActive,
                            ]}
                          >
                            Alla
                          </Text>
                        </Pill>
                      </TouchableOpacity>
                      {roleOrder.map((role) => (
                        <TouchableOpacity key={role} onPress={() => setRoleFilter(role)}>
                          <Pill active={roleFilter === role} style={styles.filterChip}>
                            <Text
                              style={[
                                styles.filterChipText,
                                roleFilter === role && styles.filterChipTextActive,
                              ]}
                            >
                              {roleLabels[role]}
                            </Text>
                          </Pill>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.filterLabel}>Häst</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.filterRow}>
                        <TouchableOpacity onPress={() => setHorseFilter('all')}>
                          <Pill active={horseFilter === 'all'} style={styles.filterChip}>
                            <Text
                              style={[
                                styles.filterChipText,
                                horseFilter === 'all' && styles.filterChipTextActive,
                              ]}
                            >
                              Alla
                            </Text>
                          </Pill>
                        </TouchableOpacity>
                        {horsesInScope.map((horse) => (
                          <TouchableOpacity key={horse.id} onPress={() => setHorseFilter(horse.id)}>
                            <Pill active={horseFilter === horse.id} style={styles.filterChip}>
                              <Text
                                style={[
                                  styles.filterChipText,
                                  horseFilter === horse.id && styles.filterChipTextActive,
                                ]}
                              >
                                {horse.name}
                              </Text>
                            </Pill>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                    <Text style={styles.filterLabel}>Sök</Text>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Sök namn, roll, häst..."
                      placeholderTextColor={palette.mutedText}
                      value={query}
                      onChangeText={setQuery}
                    />
                  </Card>
                </View>

                <View style={styles.desktopList}>
                  <Card tone="muted" style={styles.listCard}>
                    <View style={styles.listHeader}>
                      <Text style={styles.listTitle}>Medlemmar</Text>
                      <Text style={styles.listCount}>{memberRows.length}</Text>
                    </View>
                    {memberRows.length === 0 ? (
                      <Text style={styles.emptyText}>Inga medlemmar matchar filtret.</Text>
                    ) : (
                      <View style={styles.memberList}>
                        {memberRows.map((row) => {
                          const canManageMembers = canManageMembersStable(row.stableId);
                          const accessLabel = row.access ? accessLabels[row.access] : undefined;
                          const roleLabel = row.customRole?.trim() || roleLabels[row.role];
                          const riderLabel =
                            row.role === 'rider'
                              ? row.riderRole === 'owner'
                                ? 'Hästägare'
                                : row.riderRole === 'medryttare'
                                  ? 'Medryttare'
                                  : row.riderRole === 'other'
                                    ? 'Annat'
                                    : undefined
                              : undefined;
                          const stableLabel = stableFilter === 'all' ? stableNameById[row.stableId] : undefined;
                          return (
                            <View key={`${row.userId}-${row.stableId}`} style={styles.memberRow}>
                              <TouchableOpacity
                                style={styles.memberMain}
                                onPress={() => handleOpenMember(row.userId, row.stableId)}
                                activeOpacity={0.85}
                              >
                                <Text style={styles.memberName}>{row.name}</Text>
                                <Text style={styles.memberMeta}>
                                  {[stableLabel, roleLabel, riderLabel, accessLabel]
                                    .filter(Boolean)
                                    .join(' • ') || 'Ingen roll satt'}
                                </Text>
                                {row.horseNames.length ? (
                                  <Text style={styles.memberMeta}>Hästar: {row.horseNames.join(', ')}</Text>
                                ) : null}
                                {row.email || row.phone ? (
                                  <Text style={styles.memberMeta}>
                                    {[row.email, row.phone].filter(Boolean).join(' · ')}
                                  </Text>
                                ) : null}
                              </TouchableOpacity>
                              {canManageMembers ? (
                                <View style={styles.memberActions}>
                                  {canManageMembers ? (
                                    <TouchableOpacity
                                      style={styles.roleButton}
                                      onPress={() => handleRoleCycle(row.userId, row.stableId, row.role)}
                                      activeOpacity={0.85}
                                    >
                                      <Text style={styles.roleButtonText}>{roleLabels[row.role]}</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                  {row.userId !== state.currentUserId ? (
                                    <TouchableOpacity
                                      style={styles.removeButton}
                                      onPress={() => handleRemoveMember(row.userId, row.stableId)}
                                      activeOpacity={0.85}
                                    >
                                      <Feather name="x" size={14} color={palette.error} />
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </Card>
                </View>
              </View>
            </ScrollView>
          </>,
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: palette.background },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: 50,
    gap: space.xl,
    paddingTop: 16,
  },
  contentDesktop: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
  },
  desktopShell: { flex: 1, flexDirection: 'row' },
  desktopSidebar: {
    width: 260,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: palette.border,
    backgroundColor: palette.surfaceTint,
    shadowColor: '#121826',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 8, height: 0 },
    elevation: 2,
  },
  desktopMain: { flex: 1, minWidth: 0 },
  desktopLayout: { gap: 16 },
  desktopLayoutDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  desktopPanel: { width: '100%' },
  desktopList: { flex: 1, minWidth: 0 },
  pageHeader: { marginBottom: 0 },
  pageHeaderDesktop: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    marginBottom: 8,
  },
  filterCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    borderWidth: 0,
  },
  panelTitle: { fontSize: 15, fontWeight: '700', color: palette.primaryText },
  filterLabel: { fontSize: 12, fontWeight: '600', color: palette.secondaryText },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { backgroundColor: palette.surface },
  filterChipText: { fontSize: 12, fontWeight: '600', color: palette.primaryText },
  filterChipTextActive: { color: palette.primary },
  searchInput: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.primaryText,
    backgroundColor: palette.surface,
  },
  listCard: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
    borderWidth: 0,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  listCount: { fontSize: 12, color: palette.secondaryText },
  memberList: { gap: 12 },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  memberMain: { flex: 1, gap: 4 },
  memberName: { fontSize: 15, fontWeight: '700', color: palette.primaryText },
  memberMeta: { fontSize: 12, color: palette.secondaryText },
  memberActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  roleButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  roleButtonDisabled: { opacity: 0.5 },
  roleButtonText: { fontSize: 12, fontWeight: '600', color: palette.primaryText },
  removeButton: {
    padding: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(249, 95, 95, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(249, 95, 95, 0.22)',
  },
  emptyText: { fontSize: 13, color: palette.secondaryText },
});
