import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DataSyncStatus } from '@/components/DataSyncStatus';
import { StableSwitcher } from '@/components/StableSwitcher';
import { theme } from '@/components/theme';
import {
  useAppData,
  type HorseDayStatus,
} from '@/context/AppDataContext';
import { color, radius } from '@/design/tokens';
import {
  getVisibleHorsesForUser,
  isHorseOwner,
  isHorseResponsible,
  type HorseListFilter,
} from '@/lib/horseAccess';
import { toISODate } from '@/lib/schedule';
import { deriveFeedFocus } from '@/lib/today';
import { getHorseAge } from '@/lib/horseAge';
import { getHorsePaddocks, hasUnconfirmedPaddockLinks } from '@/lib/paddockLinks';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import HorseIcon from '@/assets/images/figma/profile-horse.svg';

const palette = theme.colors;

const normalizeName = (value: string) => value.trim().toLowerCase();

function formatStatus(status?: HorseDayStatus) {
  if (!status) {
    return 'Status saknas idag';
  }

  const checks = [
    status.hay ? 'hö' : 'hö saknas',
    status.water ? 'vatten' : 'vatten saknas',
    status.checked ? 'kollad' : 'ej kollad',
  ];
  return checks.join(' · ');
}

const filterOptions: { id: HorseListFilter; label: string }[] = [
  { id: 'all', label: 'Alla' },
  { id: 'mine', label: 'Mina' },
  { id: 'responsible', label: 'Ansvar' },
];

export default function HorsesScreen() {
  const router = useRouter();
  const { state, derived } = useAppData();
  const isDesktopWeb = useIsDesktopWeb();
  const todayIso = toISODate(new Date());
  const [filter, setFilter] = React.useState<HorseListFilter>('all');
  const [search, setSearch] = React.useState('');
  const { currentStableId, currentUserId } = state;
  const stableHorses = React.useMemo(
    () => state.horses.filter((horse) => horse.stableId === currentStableId),
    [state.horses, currentStableId],
  );
  const stablePaddocks = React.useMemo(
    () => state.paddocks.filter((paddock) => paddock.stableId === currentStableId),
    [state.paddocks, currentStableId],
  );
  const paddockLinksUnconfirmed = state.paddockLinksReady !== true ||
    hasUnconfirmedPaddockLinks(stablePaddocks, stableHorses);
  const todayStatuses = React.useMemo(
    () =>
      state.horseDayStatuses.filter(
        (status) => status.stableId === currentStableId && status.date === todayIso,
      ),
    [state.horseDayStatuses, currentStableId, todayIso],
  );
  const visibleHorses = React.useMemo(
    () => getVisibleHorsesForUser(state, currentStableId, currentUserId, filter)
      .filter((horse) => normalizeName(horse.name).includes(normalizeName(search))),
    [state, currentStableId, currentUserId, filter, search],
  );
  const myHorseCount = React.useMemo(
    () => getVisibleHorsesForUser(state, currentStableId, currentUserId, 'mine').length,
    [state, currentStableId, currentUserId],
  );
  const responsibleHorseCount = React.useMemo(
    () => getVisibleHorsesForUser(state, currentStableId, currentUserId, 'responsible').length,
    [state, currentStableId, currentUserId],
  );
  const canEditHorses = derived.permissions.canManageHorses;
  const dailyFeeds = React.useMemo(
    () => (['morning', 'lunch', 'evening'] as const).map((slot) =>
      deriveFeedFocus({ state, currentStableId, todayIso, slot }),
    ),
    [state, currentStableId, todayIso],
  );

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
          title="Hästar"
          primaryAction={
            <HeaderIconButton accessibilityLabel="Öppna hagar" onPress={() => router.push('/paddocks')}>
              <Ionicons name="map-outline" size={18} color={palette.primaryText} />
            </HeaderIconButton>
          }
        />
        {!isDesktopWeb ? <StableSwitcher showAccess /> : null}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isDesktopWeb && styles.scrollContentDesktop,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <DataSyncStatus />
          <Card tone="default" style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryTitleBlock}>
                <Text style={styles.summaryEyebrow}>Stallets hästar</Text>
                <Text style={styles.summaryTitle}>
                  {stableHorses.length
                    ? `${stableHorses.length} ${stableHorses.length === 1 ? 'häst' : 'hästar'}`
                    : 'Inga hästar ännu'}
                </Text>
                <Text style={styles.summaryText}>
                  {stableHorses.length
                    ? 'Sök en häst och öppna dess status, foderplan och kalender.'
                    : currentStableId
                      ? canEditHorses
                        ? 'Registrera stallets första häst för att samla hage, box och dagens status.'
                        : 'Be någon med Redigera i stallet att registrera hästarna.'
                      : 'Välj ett stall för att se hästar och dagens status.'}
                </Text>
              </View>
              {!canEditHorses ? (
                <View style={styles.readOnlyPill}>
                  <Ionicons name="lock-closed-outline" size={13} color={palette.secondaryText} />
                  <Text style={styles.readOnlyText}>Läsläge</Text>
                </View>
              ) : null}
            </View>
            {canEditHorses ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Hantera hästar"
                style={[styles.manageButton, stableHorses.length > 0 && styles.manageButtonPrimary]}
                onPress={() => router.push('/stables?section=horses')}
              >
                <Ionicons name="create-outline" size={16} color={palette.primaryText} />
                <Text style={[styles.secondaryButtonText, stableHorses.length > 0 && styles.primaryButtonText]}>Hantera hästar</Text>
              </TouchableOpacity>
            ) : null}
            {!canEditHorses ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>Du kan läsa hästarnas grunduppgifter. För att ändra dem behöver du Redigera.</Text>
              </View>
            ) : null}
          </Card>

          {stableHorses.length ? (
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color={palette.secondaryText} />
              <TextInput
                accessibilityLabel="Sök häst efter namn"
                placeholder="Sök häst efter namn"
                placeholderTextColor={palette.secondaryText}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                style={styles.searchInput}
              />
              {search ? (
                <HeaderIconButton style={styles.iconButton} accessibilityLabel="Rensa hästsökning" onPress={() => setSearch('')}>
                  <Ionicons name="close" size={18} color={palette.primaryText} />
                </HeaderIconButton>
              ) : null}
            </View>
          ) : null}

          {stableHorses.length ? (
            <View style={styles.filterRow}>
              {filterOptions.map((option) => {
                const active = option.id === filter;
                return (
                  <TouchableOpacity
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    {...(Platform.OS === 'web' ? { 'aria-pressed': active } : {})}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setFilter(option.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {visibleHorses.length ? (
            <View style={styles.horseList}>
              {visibleHorses.map((horse) => {
                const status = todayStatuses.find((entry) => entry.horseId === horse.id);
                const horsePaddocks = getHorsePaddocks(horse, stablePaddocks);
                const paddockLabel = horsePaddocks.length
                  ? horsePaddocks.map((paddock) => paddock.name).join(', ')
                  : paddockLinksUnconfirmed ? 'Hage ej bekräftad' : 'Ingen hage satt';
                const age = getHorseAge(horse);
                const isMine = isHorseOwner(state, horse.id, currentUserId);
                const isResponsible = isHorseResponsible(state, horse.id, currentUserId, derived.membership);
                const plannedFeeds = dailyFeeds
                  .map((feed) => feed.items.find((item) => item.horse.id === horse.id))
                  .filter((item) => item?.plan);
                const checkedFeeds = plannedFeeds.filter((item) => item?.check?.checkedAt);
                return (
                  <TouchableOpacity key={horse.id} accessibilityRole="button" accessibilityLabel={`Öppna ${horse.name}`} onPress={() => router.push(`/horses/${horse.id}`)} activeOpacity={0.85} style={styles.horseCard}>
                    <View style={styles.horseTopRow}>
                      <View style={styles.horseAvatar}>
                        <HorseIcon />
                      </View>
                      <View style={styles.horseTitleBlock}>
                        <View style={styles.horseNameRow}>
                          <Text accessibilityRole="header" style={styles.horseName}>{horse.name}</Text>
                          {isMine ? (
                            <View style={styles.minePill}>
                              <Text style={styles.minePillText}>Min</Text>
                            </View>
                          ) : null}
                          {!isMine && isResponsible ? (
                            <View style={styles.minePill}>
                              <Text style={styles.minePillText}>Ansvar</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.horseMeta}>
                          {[age !== undefined ? `${age} år` : null, horse.boxNumber ? `Box ${horse.boxNumber}` : null, paddockLabel]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={19} color={palette.secondaryText} />
                    </View>

                    <View style={styles.compactStatusRow}>
                      <Text numberOfLines={1} style={styles.compactStatus}>{formatStatus(status)}</Text>
                      <Text style={styles.compactFeed}>
                        {plannedFeeds.length ? `${checkedFeeds.length}/${plannedFeeds.length} foder` : 'Ingen foderplan'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Card tone="default" style={styles.emptyCard}>
              <HorseIcon />
              <Text style={styles.emptyTitle}>
                {stableHorses.length
                  ? normalizeName(search)
                    ? 'Inga hästar matchar sökningen.'
                    : 'Inga hästar i filtret.'
                  : currentStableId ? 'Inga hästar i stallet ännu.' : 'Välj ett stall för att se hästarna.'}
              </Text>
              <Text style={styles.emptyText}>
                {stableHorses.length
                  ? normalizeName(search)
                    ? 'Prova ett annat namn eller visa alla hästar i stallet.'
                    : `Visa alla hästar för att se hela stallets lista. Mina: ${myHorseCount}. Ansvar: ${responsibleHorseCount}.`
                  : currentStableId
                    ? canEditHorses
                      ? 'Lägg till den första hästen i hästhanteringen. När den är registrerad visas hage, box och dagens status här.'
                      : 'När hästarna är registrerade i stallet visas deras hage, box och dagens status här.'
                    : 'Välj stall ovan. Då visas hästarna du har tillgång till.'}
              </Text>
              {stableHorses.length ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Visa alla hästar"
                  style={[styles.manageButton, styles.emptyAction]}
                  onPress={() => {
                    setSearch('');
                    setFilter('all');
                  }}
                >
                  <Text style={styles.secondaryButtonText}>Visa alla hästar</Text>
                </TouchableOpacity>
              ) : canEditHorses ? (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Lägg till häst" style={[styles.primaryButton, styles.emptyAction]} onPress={() => router.push('/stables?section=horses')}>
                  <Ionicons name="add" size={16} color={palette.primaryText} />
                  <Text style={styles.primaryButtonText}>Lägg till häst</Text>
                </TouchableOpacity>
              ) : null}
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  compactStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 60 },
  compactStatus: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 18, fontFamily: theme.fonts.regular, color: palette.secondaryText },
  compactFeed: { fontSize: 12, fontFamily: theme.fonts.medium, color: palette.primaryText },
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: color.bg,
  },
  pageHeader: {
    marginBottom: 0,
  },
  pageHeaderDesktop: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 36,
    marginBottom: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 21,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 20,
  },
  scrollContentDesktop: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 36,
    paddingTop: 0,
    paddingBottom: 40,
    gap: 18,
  },
  summaryCard: {
    padding: 0,
    gap: 12,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  summaryEyebrow: {
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
    color: palette.secondaryText,
  },
  summaryTitle: {
    fontSize: 26,
    fontFamily: theme.fonts.semibold,
    fontWeight: '600',
    color: palette.primaryText,
  },
  summaryText: {
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    lineHeight: 19,
    color: palette.secondaryText,
  },
  readOnlyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
  },
  readOnlyText: {
    fontSize: 12,
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    color: palette.secondaryText,
  },
  notice: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceTint,
  },
  noticeText: {
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    color: palette.secondaryText,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  iconButton: { width: 44, height: 44 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    color: palette.primaryText,
  },
  filterChip: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: palette.surface,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    color: palette.primaryText,
  },
  filterChipTextActive: {
    color: palette.primaryText,
  },
  horseList: {
    gap: 12,
  },
  horseCard: {
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.xl,
    backgroundColor: palette.surface,
  },
  horseTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  horseAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceTint,
  },
  horseTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  horseNameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  horseName: {
    flexShrink: 1,
    fontSize: 17,
    fontFamily: theme.fonts.medium,
    lineHeight: 23,
    fontWeight: '500',
    color: palette.primaryText,
  },
  horseMeta: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    lineHeight: 18,
    color: palette.secondaryText,
  },
  minePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
  },
  minePillText: {
    fontSize: 11,
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    color: palette.primaryText,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  statusItem: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceTint,
  },
  statusItemDesktop: {
    flexBasis: 0,
    minWidth: 150,
  },
  statusLabel: {
    fontSize: 12,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
    color: palette.secondaryText,
    lineHeight: 16,
  },
  statusValue: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: theme.fonts.regular,
    lineHeight: 18,
    color: palette.primaryText,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  manageButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surfaceTint,
  },
  manageButtonPrimary: {
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    backgroundColor: palette.surfaceTint,
  },
  profileButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.primary,
  },
  profileButtonText: {
    fontSize: 13,
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    color: palette.primary,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    color: palette.primaryText,
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  primaryButtonText: {
    fontSize: 13,
    fontFamily: theme.fonts.medium,
    fontWeight: '500',
    color: palette.primaryText,
  },
  emptyCard: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 10,
    borderRadius: radius.lg,
  },
  emptyAction: {
    flex: 0,
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: theme.fonts.regular,
    fontWeight: '400',
    color: palette.primaryText,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: theme.fonts.regular,
    lineHeight: 20,
    color: palette.secondaryText,
    textAlign: 'center',
  },
});
