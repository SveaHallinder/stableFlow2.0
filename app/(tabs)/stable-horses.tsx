import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DataSyncStatus } from '@/components/DataSyncStatus';
import { StableSwitcher } from '@/components/StableSwitcher';
import { theme } from '@/components/theme';
import {
  useAppData,
  type HorseDayStatus,
  type RideLogEntry,
} from '@/context/AppDataContext';
import { color, radius } from '@/design/tokens';
import {
  getResponsibleUsersForHorse,
  getVisibleHorsesForUser,
  isHorseOwner,
  isHorseResponsible,
  type HorseListFilter,
} from '@/lib/horseAccess';
import { toISODate } from '@/lib/schedule';
import { deriveFeedFocus } from '@/lib/today';
import { getHorsePaddocks, hasUnconfirmedPaddockLinks } from '@/lib/paddockLinks';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

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

function formatInOut(value?: HorseDayStatus['dayStatus']) {
  if (!value) {
    return 'Ej satt';
  }
  return value === 'in' ? 'Inne' : 'Ute';
}

const filterOptions: { id: HorseListFilter; label: string }[] = [
  { id: 'all', label: 'Alla' },
  { id: 'mine', label: 'Mina' },
  { id: 'responsible', label: 'Ansvar' },
];

function getLatestRide(rideLogs: RideLogEntry[], horseId: string) {
  return rideLogs
    .filter((log) => log.horseId === horseId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

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
  const stableRideLogs = React.useMemo(
    () => state.rideLogs.filter((log) => log.stableId === currentStableId),
    [state.rideLogs, currentStableId],
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
  const canUpdateStatus = derived.permissions.canUpdateHorseStatus;
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
              <Feather name="map" size={18} color={palette.primaryText} />
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
                    ? `${myHorseCount} ${myHorseCount === 1 ? 'kopplad' : 'kopplade'} till dig. Hage, box och status finns nedan.`
                    : currentStableId
                      ? canEditHorses
                        ? 'Registrera stallets första häst för att samla hage, box och dagens status.'
                        : 'Be någon med Redigera i stallet att registrera hästarna.'
                      : 'Välj ett stall för att se hästar och dagens status.'}
                </Text>
              </View>
              {!canEditHorses ? (
                <View style={styles.readOnlyPill}>
                  <Feather name="lock" size={13} color={palette.secondaryText} />
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
                <Feather name="edit-2" size={16} color={stableHorses.length ? palette.inverseText : palette.primaryText} />
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
              <Feather name="search" size={18} color={palette.secondaryText} />
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
                  <Feather name="x" size={18} color={palette.primaryText} />
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
                const latestRide = getLatestRide(stableRideLogs, horse.id);
                const responsibleUsers = getResponsibleUsersForHorse(state, horse.id);
                const isMine = isHorseOwner(state, horse.id, currentUserId);
                const isResponsible = isHorseResponsible(state, horse.id, currentUserId, derived.membership);
                const plannedFeeds = dailyFeeds
                  .map((feed) => feed.items.find((item) => item.horse.id === horse.id))
                  .filter((item) => item?.plan);
                const checkedFeeds = plannedFeeds.filter((item) => item?.check?.checkedAt);
                return (
                  <Card key={horse.id} tone="default" style={styles.horseCard}>
                    <View style={styles.horseTopRow}>
                      <View style={styles.horseAvatar}>
                        <Feather name="activity" size={20} color={palette.primary} />
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
                          {[horse.boxNumber ? `Box ${horse.boxNumber}` : null, paddockLabel]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.statusGrid}>
                      <View style={[styles.statusItem, isDesktopWeb && styles.statusItemDesktop]}>
                        <Text style={styles.statusLabel}>Dagens status</Text>
                        <Text style={styles.statusValue}>{formatStatus(status)}</Text>
                      </View>
                      <View style={[styles.statusItem, isDesktopWeb && styles.statusItemDesktop]}>
                        <Text style={styles.statusLabel}>Dag/natt</Text>
                        <Text style={styles.statusValue}>
                          {status
                            ? `${formatInOut(status.dayStatus)} / ${formatInOut(status.nightStatus)}`
                            : 'Ej satt'}
                        </Text>
                      </View>
                      <View style={[styles.statusItem, isDesktopWeb && styles.statusItemDesktop]}>
                        <Text style={styles.statusLabel}>Foder</Text>
                        <Text style={styles.statusValue}>
                          {plannedFeeds.length
                            ? `${checkedFeeds.length} av ${plannedFeeds.length} fodringar klara`
                            : 'Ingen foderplan satt'}
                        </Text>
                      </View>
                      <View style={[styles.statusItem, isDesktopWeb && styles.statusItemDesktop]}>
                        <Text style={styles.statusLabel}>Ridning/vård</Text>
                        <Text style={styles.statusValue}>
                          {latestRide
                            ? `Senast ${latestRide.date}${latestRide.length ? ` · ${latestRide.length}` : ''}`
                            : responsibleUsers.length
                              ? `${responsibleUsers.length} ${responsibleUsers.length === 1 ? 'ansvarig' : 'ansvariga'}`
                              : 'Ingen logg ännu'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardActions}>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Hagar" style={styles.secondaryButton} onPress={() => router.push('/paddocks')}>
                        <Feather name="map" size={14} color={palette.primaryText} />
                        <Text style={styles.secondaryButtonText}>Hagar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityRole="button" style={styles.profileButton} onPress={() => router.push(`/horses/${horse.id}`)}>
                        <Text style={styles.profileButtonText}>Profil</Text>
                      </TouchableOpacity>
                      {canEditHorses || canUpdateStatus ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Status för ${horse.name}`}
                          style={styles.secondaryButton}
                          onPress={() => router.push(`/horses/${horse.id}`)}
                        >
                          <Text style={styles.secondaryButtonText}>Status</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </Card>
                );
              })}
            </View>
          ) : (
            <Card tone="default" style={styles.emptyCard}>
              <Feather name="activity" size={22} color={palette.primary} />
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
                  <Feather name="plus" size={16} color={palette.inverseText} />
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
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: color.bg,
  },
  pageHeader: {
    marginBottom: 8,
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
    gap: 12,
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
    padding: 16,
    gap: 12,
    borderRadius: radius.lg,
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
    fontSize: 11,
    fontWeight: '800',
    color: palette.primary,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: palette.primaryText,
  },
  summaryText: {
    fontSize: 13,
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
    fontWeight: '700',
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
    color: palette.secondaryText,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
    minHeight: 52,
    fontSize: 16,
    color: palette.primaryText,
  },
  filterChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  filterChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.primaryText,
  },
  filterChipTextActive: {
    color: palette.inverseText,
  },
  horseList: {
    gap: 12,
  },
  horseCard: {
    padding: 14,
    gap: 12,
    borderRadius: radius.lg,
  },
  horseTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  horseAvatar: {
    width: 42,
    height: 42,
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
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: palette.primaryText,
  },
  horseMeta: {
    fontSize: 14,
    lineHeight: 20,
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
    fontWeight: '700',
    color: palette.primary,
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
    fontWeight: '600',
    color: palette.secondaryText,
    lineHeight: 16,
  },
  statusValue: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
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
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surfaceTint,
  },
  manageButtonPrimary: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    backgroundColor: palette.primary,
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
    fontWeight: '700',
    color: palette.primary,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.primaryText,
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.inverseText,
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
    fontSize: 18,
    fontWeight: '700',
    color: palette.primaryText,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.secondaryText,
    textAlign: 'center',
  },
});
