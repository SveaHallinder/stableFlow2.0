import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StableSwitcher } from '@/components/StableSwitcher';
import { theme } from '@/components/theme';
import {
  useAppData,
  type Horse,
  type HorseDayStatus,
  type Paddock,
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
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

const palette = theme.colors;

const normalizeName = (value: string) => value.trim().toLowerCase();

function getHorsePaddock(horse: Horse, paddocks: Paddock[]) {
  const horseName = normalizeName(horse.name);
  return paddocks.find((paddock) =>
    paddock.horseNames.some((name) => normalizeName(name) === horseName),
  );
}

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
  const { currentStableId, currentUserId } = state;
  const stableHorses = React.useMemo(
    () => state.horses.filter((horse) => horse.stableId === currentStableId),
    [state.horses, currentStableId],
  );
  const stablePaddocks = React.useMemo(
    () => state.paddocks.filter((paddock) => paddock.stableId === currentStableId),
    [state.paddocks, currentStableId],
  );
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
    () => getVisibleHorsesForUser(state, currentStableId, currentUserId, filter),
    [state, currentStableId, currentUserId, filter],
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
          <Card elevated tone={isDesktopWeb ? 'default' : 'muted'} style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryTitleBlock}>
                <Text style={styles.summaryEyebrow}>Stallets hästar</Text>
                <Text style={styles.summaryTitle}>
                  {stableHorses.length ? `${stableHorses.length} hästar` : 'Inga hästar ännu'}
                </Text>
                <Text style={styles.summaryText}>
                  {stableHorses.length
                    ? `${myHorseCount} kopplade till dig. Se hage, box och dagens status.`
                    : currentStableId
                      ? 'Lägg till hästar i onboarding eller stallinställningar.'
                      : 'Slutför setup för att se dagens stallstatus.'}
                </Text>
              </View>
              {!canEditHorses ? (
                <View style={styles.readOnlyPill}>
                  <Feather name="lock" size={13} color={palette.secondaryText} />
                  <Text style={styles.readOnlyText}>Läs</Text>
                </View>
              ) : null}
            </View>
            {!canEditHorses ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>Du kan läsa detta, men inte ändra.</Text>
              </View>
            ) : null}
          </Card>

          {stableHorses.length ? (
            <View style={styles.filterRow}>
              {filterOptions.map((option) => {
                const active = option.id === filter;
                return (
                  <TouchableOpacity
                    key={option.id}
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
                const paddock = getHorsePaddock(horse, stablePaddocks);
                const latestRide = getLatestRide(stableRideLogs, horse.id);
                const responsibleUsers = getResponsibleUsersForHorse(state, horse.id);
                const isMine = isHorseOwner(state, horse.id, currentUserId);
                const isResponsible = isHorseResponsible(state, horse.id, currentUserId, derived.membership);
                return (
                  <Card key={horse.id} elevated tone="default" style={styles.horseCard}>
                    <View style={styles.horseTopRow}>
                      <View style={styles.horseAvatar}>
                        <Feather name="activity" size={20} color={palette.primary} />
                      </View>
                      <View style={styles.horseTitleBlock}>
                        <View style={styles.horseNameRow}>
                          <Text style={styles.horseName}>{horse.name}</Text>
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
                          {[horse.boxNumber ? `Box ${horse.boxNumber}` : null, paddock?.name ?? 'Ingen hage satt']
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.statusGrid}>
                      <View style={styles.statusItem}>
                        <Text style={styles.statusLabel}>Dagens status</Text>
                        <Text style={styles.statusValue}>{formatStatus(status)}</Text>
                      </View>
                      <View style={styles.statusItem}>
                        <Text style={styles.statusLabel}>Dag/natt</Text>
                        <Text style={styles.statusValue}>
                          {status
                            ? `${formatInOut(status.dayStatus)} / ${formatInOut(status.nightStatus)}`
                            : 'Ej satt'}
                        </Text>
                      </View>
                      <View style={styles.statusItem}>
                        <Text style={styles.statusLabel}>Foder</Text>
                        <Text style={styles.statusValue}>
                          {status?.hay ? 'Hö markerat klart idag' : 'Foderplan ej satt ännu'}
                        </Text>
                      </View>
                      <View style={styles.statusItem}>
                        <Text style={styles.statusLabel}>Ridning/vård</Text>
                        <Text style={styles.statusValue}>
                          {latestRide
                            ? `Senast ${latestRide.date}${latestRide.length ? ` · ${latestRide.length}` : ''}`
                            : responsibleUsers.length
                              ? `${responsibleUsers.length} ansvariga`
                              : 'Ingen logg ännu'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardActions}>
                      <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/paddocks')}>
                        <Feather name="map" size={14} color={palette.primaryText} />
                        <Text style={styles.secondaryButtonText}>Hagar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.primaryButton} onPress={() => router.push(`/horses/${horse.id}`)}>
                        <Text style={styles.primaryButtonText}>Profil</Text>
                      </TouchableOpacity>
                      {canEditHorses || canUpdateStatus ? (
                        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/stables')}>
                          <Text style={styles.secondaryButtonText}>
                            {canEditHorses ? 'Redigera' : 'Status'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </Card>
                );
              })}
            </View>
          ) : (
            <Card elevated tone="default" style={styles.emptyCard}>
              <Feather name="activity" size={22} color={palette.primary} />
              <Text style={styles.emptyTitle}>
                {stableHorses.length ? 'Inga hästar i filtret.' : 'Du har ingen häst kopplad ännu.'}
              </Text>
              <Text style={styles.emptyText}>
                {stableHorses.length
                  ? `Mina: ${myHorseCount}. Ansvar: ${responsibleHorseCount}.`
                  : 'När en häst skapas eller kopplas till dig visas hage, box och dagens status här.'}
              </Text>
              {canEditHorses ? (
                <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/stables')}>
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
    paddingTop: 16,
    paddingBottom: 50,
    gap: 16,
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
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 14,
    borderRadius: radius.xl,
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
    fontSize: 14,
    lineHeight: 20,
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
  filterChip: {
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
    padding: 16,
    gap: 14,
    borderRadius: radius.xl,
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
    alignItems: 'center',
    gap: 8,
  },
  horseName: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    color: palette.primaryText,
  },
  horseMeta: {
    fontSize: 13,
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
    gap: 10,
  },
  statusItem: {
    flex: 1,
    minWidth: 150,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceTint,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.secondaryText,
    textTransform: 'uppercase',
  },
  statusValue: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: palette.primaryText,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    backgroundColor: palette.surfaceTint,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.primaryText,
  },
  primaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.full,
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
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 10,
    borderRadius: radius.xl,
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
