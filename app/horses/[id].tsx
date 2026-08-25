import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { ScreenHeader } from '@/components/ScreenHeader';
import { theme } from '@/components/theme';
import {
  useAppData,
  type CareEvent,
  type CareEventType,
  type ExternalContact,
  type FeedPlanItem,
  type FeedSlot,
  type Horse,
  type HorseDayStatus,
  type Paddock,
  type PlannedRide,
  type Stable,
} from '@/context/AppDataContext';
import { color, radius } from '@/design/tokens';
import { getResponsibleUsersForHorse, getHorseResponsibility } from '@/lib/horseAccess';
import { toISODate } from '@/lib/schedule';
import { feedSlotLabels } from '@/lib/today';
import { useToast } from '@/components/ToastProvider';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

const FEED_SLOTS: FeedSlot[] = ['morning', 'lunch', 'evening'];

const palette = theme.colors;

const normalizeName = (value: string) => value.trim().toLowerCase();

function getHorsePaddock(horse: Horse, paddocks: Paddock[]) {
  const horseName = normalizeName(horse.name);
  return paddocks.find((paddock) =>
    paddock.horseNames.some((name) => normalizeName(name) === horseName),
  );
}

export default function HorseProfileScreen() {
  const router = useRouter();
  const isDesktopWeb = useIsDesktopWeb();
  const { state, derived, actions } = useAppData();
  const toast = useToast();
  const { id: rawId } = useLocalSearchParams<{ id?: string }>();
  const horseId = Array.isArray(rawId) ? rawId[0] : rawId;
  const horse = horseId ? state.horses.find((item) => item.id === horseId) : undefined;
  const todayIso = toISODate(new Date());
  const stableId = horse?.stableId ?? state.currentStableId;
  const stable = state.stables.find((item) => item.id === stableId);
  const paddock = horse
    ? getHorsePaddock(
        horse,
        state.paddocks.filter((item) => item.stableId === stableId),
      )
    : undefined;
  const status = horse
    ? state.horseDayStatuses.find(
        (item) => item.stableId === stableId && item.horseId === horse.id && item.date === todayIso,
      )
    : undefined;
  const rideLogs = horse
    ? state.rideLogs
        .filter((log) => log.stableId === stableId && log.horseId === horse.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5)
    : [];
  const owner = horse?.ownerUserId ? state.users[horse.ownerUserId] : undefined;
  const responsibleUsers = horse ? getResponsibleUsersForHorse(state, horse.id) : [];
  const stableFeedPlans = state.feedPlans.filter(
    (plan) => plan.stableId === stableId && plan.active,
  );
  const feedChecks = horse
    ? state.feedChecks
        .filter((check) => check.stableId === stableId && check.horseId === horse.id)
        .sort((a, b) => (b.checkedAt ?? '').localeCompare(a.checkedAt ?? ''))
        .slice(0, 6)
    : [];
  const isOwner = Boolean(horse) && horse?.ownerUserId === state.currentUserId;
  const canEditDefaults = derived.permissions.canManageHorses;
  const canEditOverrides = canEditDefaults || isOwner;
  const canCheckFeed = derived.permissions.canUpdateHorseStatus;

  const handleBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/stable-horses');
  }, [router]);

  if (!horse) {
    return (
      <LinearGradient colors={theme.gradients.background} style={styles.background}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader
            title="Hästar"
            showSearch={false}
            left={
              <HeaderIconButton accessibilityLabel="Tillbaka" onPress={handleBack}>
                <Feather name="arrow-left" size={18} color={palette.primaryText} />
              </HeaderIconButton>
            }
          />
          <View style={styles.centerEmpty}>
            <Card elevated style={styles.emptyCard}>
              <Feather name="alert-circle" size={22} color={palette.primary} />
              <Text style={styles.emptyTitle}>Hästen hittades inte.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/stable-horses')}>
                <Text style={styles.primaryButtonText}>Till Hästar</Text>
              </TouchableOpacity>
            </Card>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
          title={horse.name}
          subtitle={stable?.name}
          showSearch={false}
          left={
            <HeaderIconButton accessibilityLabel="Tillbaka" onPress={handleBack}>
              <Feather name="arrow-left" size={18} color={palette.primaryText} />
            </HeaderIconButton>
          }
          primaryAction={
            <HeaderIconButton accessibilityLabel="Öppna hästlistan" onPress={() => router.push('/stable-horses')}>
              <Feather name="list" size={18} color={palette.primaryText} />
            </HeaderIconButton>
          }
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            isDesktopWeb && styles.scrollContentDesktop,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Card elevated style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Feather name="activity" size={24} color={palette.primary} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>{horse.name}</Text>
                <Text style={styles.heroMeta}>
                  {[horse.boxNumber ? `Box ${horse.boxNumber}` : null, paddock?.name ?? 'Ingen hage satt']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
            {horse.note ? <Text style={styles.heroNote}>{horse.note}</Text> : null}
          </Card>

          <View style={styles.sectionGrid}>
            <SectionCard title="Dagens status" icon="check-circle" inGrid>
              {horse ? (
                <DailyStatusEditor
                  status={status}
                  canEdit={canCheckFeed || isOwner}
                  onUpdate={(updates) => {
                    const result = actions.updateHorseDayStatus({
                      horseId: horse.id,
                      date: todayIso,
                      stableId,
                      updates,
                    });
                    if (!result.success) {
                      toast.showToast(result.reason, 'error');
                    } else {
                      toast.showToast('Status uppdaterad.', 'success');
                    }
                  }}
                />
              ) : null}
            </SectionCard>

            <SectionCard title="Foderplan" icon="clipboard" inGrid>
              {horse ? (
                <FeedPlanList
                  horseId={horse.id}
                  stableId={stableId}
                  plans={stableFeedPlans}
                  canEditDefaults={canEditDefaults}
                  canEditOverrides={canEditOverrides}
                  onSave={(input) => {
                    const result = actions.upsertFeedPlan(input);
                    if (!result.success) toast.showToast(result.reason, 'error');
                    else toast.showToast('Foderplan sparad.', 'success');
                    return result.success;
                  }}
                  onDelete={(id) => {
                    const result = actions.deleteFeedPlan(id);
                    if (!result.success) toast.showToast(result.reason, 'error');
                    else toast.showToast('Foderplan borttagen.', 'success');
                    return result.success;
                  }}
                  onCheck={(slot, deviationNote) => {
                    if (!canCheckFeed) {
                      toast.showToast('Du saknar behörighet att markera foder.', 'error');
                      return false;
                    }
                    const result = actions.upsertFeedCheck({
                      stableId,
                      horseId: horse.id,
                      date: todayIso,
                      slot,
                      checked: true,
                      deviationNote,
                    });
                    if (!result.success) toast.showToast(result.reason, 'error');
                    else toast.showToast('Foderkoll registrerad.', 'success');
                    return result.success;
                  }}
                  todayIso={todayIso}
                  feedChecks={state.feedChecks.filter(
                    (check) =>
                      check.stableId === stableId &&
                      check.horseId === horse.id &&
                      check.date === todayIso,
                  )}
                  canCheck={canCheckFeed}
                />
              ) : (
                <Text style={styles.emptyText}>Ingen häst vald.</Text>
              )}
              {feedChecks.length ? (
                <View style={styles.feedHistoryBlock}>
                  <Text style={styles.feedHistoryTitle}>Senaste foderkollar</Text>
                  {feedChecks.map((check) => (
                    <View key={check.id} style={styles.feedHistoryRow}>
                      <Text style={styles.feedHistoryLabel}>
                        {`${check.date} · ${feedSlotLabels[check.slot]}`}
                      </Text>
                      <Text style={styles.feedHistoryValue}>
                        {check.checkedAt ? 'Klart' : 'Ej klart'}
                        {check.deviationNote ? ` · ${check.deviationNote}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </SectionCard>
          </View>

          <SectionCard title="Ridning/träning" icon="calendar">
            {horse ? (
              <PlannedRidesEditor
                stableId={stableId}
                horseId={horse.id}
                stable={stable}
                rides={state.plannedRides.filter(
                  (ride) =>
                    ride.stableId === stableId &&
                    ride.horseId === horse.id &&
                    ride.status !== 'cancelled',
                )}
                canEdit={derived.permissions.canManageRideLogs || isOwner}
                onCreate={(input) => {
                  const result = actions.createPlannedRide(input);
                  if (!result.success) toast.showToast(result.reason, 'error');
                  else toast.showToast('Ridpass planerat.', 'success');
                  return result.success;
                }}
                onUpdate={(input) => {
                  const result = actions.updatePlannedRide(input);
                  if (!result.success) toast.showToast(result.reason, 'error');
                  else toast.showToast('Ridpass uppdaterat.', 'success');
                  return result.success;
                }}
                onDelete={(id) => {
                  const result = actions.deletePlannedRide(id);
                  if (!result.success) toast.showToast(result.reason, 'error');
                  else toast.showToast('Ridpass borttaget.', 'success');
                  return result.success;
                }}
                onComplete={(input) => {
                  const result = actions.completePlannedRide(input);
                  if (!result.success) toast.showToast(result.reason, 'error');
                  else toast.showToast('Ridpass loggat.', 'success');
                  return result.success;
                }}
              />
            ) : null}
            <View style={styles.rideHistoryBlock}>
              <Text style={styles.feedHistoryTitle}>Senaste loggade pass</Text>
              {rideLogs.length ? (
                <View style={styles.rideList}>
                  {rideLogs.map((log) => {
                    const rideType = stable?.rideTypes?.find((item) => item.id === log.rideTypeId);
                    return (
                      <View key={log.id} style={styles.rideRow}>
                        <View style={styles.rideDot} />
                        <View style={styles.rideBody}>
                          <Text style={styles.rideTitle}>{rideType?.label ?? 'Ridpass'}</Text>
                          <Text style={styles.rideMeta}>
                            {[log.date, log.length, log.note].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyText}>Ingen ridning eller träning loggad ännu.</Text>
              )}
            </View>
          </SectionCard>

          <SectionCard title="Vård" icon="heart">
            {horse ? (
              <CareEventsEditor
                stableId={stableId}
                horseId={horse.id}
                events={state.careEvents.filter((event) => event.stableId === stableId && event.horseIds.includes(horse.id))}
                contacts={state.externalContacts.filter((contact) => contact.stableId === stableId)}
                canEdit={derived.permissions.canManageDayEvents || derived.permissions.canManageOnboarding}
                onCreate={(input) => {
                  const result = actions.createCareEvent(input);
                  if (!result.success) toast.showToast(result.reason, 'error');
                  else toast.showToast('Vårdhändelse skapad.', 'success');
                  return result.success;
                }}
                onComplete={(input) => {
                  const result = actions.completeCareEvent(input);
                  if (!result.success) toast.showToast(result.reason, 'error');
                  else toast.showToast('Vårdhändelse markerad klar.', 'success');
                  return result.success;
                }}
                onCancel={(id) => {
                  const result = actions.updateCareEvent({ id, updates: { status: 'cancelled' } });
                  if (!result.success) toast.showToast(result.reason, 'error');
                  else toast.showToast('Vårdhändelse avbokad.', 'success');
                  return result.success;
                }}
                onDelete={(id) => {
                  const result = actions.deleteCareEvent(id);
                  if (!result.success) toast.showToast(result.reason, 'error');
                  else toast.showToast('Vårdhändelse borttagen.', 'success');
                  return result.success;
                }}
              />
            ) : null}
          </SectionCard>

          <SectionCard title="Ägare/ansvariga" icon="users">
            <InfoRow label="Ägare" value={owner?.name ?? 'Ingen ägare satt'} />
            {responsibleUsers.length ? (
              responsibleUsers.map((user) => {
                const responsibility = getHorseResponsibility(state, horse.id, user.id);
                return (
                  <InfoRow
                    key={user.id}
                    label={responsibility?.kind ?? 'Ansvar'}
                    value={user.name}
                  />
                );
              })
            ) : (
              <Text style={styles.emptyText}>Inga ansvariga är kopplade ännu.</Text>
            )}
          </SectionCard>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function SectionCard({
  title,
  icon,
  children,
  inGrid,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  children: React.ReactNode;
  inGrid?: boolean;
}) {
  return (
    <Card elevated style={[styles.sectionCard, inGrid ? styles.sectionCardInGrid : null]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Feather name={icon} size={16} color={palette.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

type DailyStatusEditorProps = {
  status?: HorseDayStatus;
  canEdit: boolean;
  onUpdate: (updates: Partial<Pick<HorseDayStatus, 'dayStatus' | 'nightStatus' | 'checked' | 'water' | 'hay'>>) => void;
};

function DailyStatusEditor({ status, canEdit, onUpdate }: DailyStatusEditorProps) {
  const renderInOutToggle = (
    label: string,
    value: HorseDayStatus['dayStatus'] | undefined,
    field: 'dayStatus' | 'nightStatus',
  ) => (
    <View style={styles.statusEditorRow}>
      <Text style={styles.statusEditorLabel}>{label}</Text>
      <View style={styles.statusEditorButtons}>
        {(['in', 'out'] as const).map((option) => {
          const active = value === option;
          return (
            <TouchableOpacity
              key={option}
              disabled={!canEdit}
              onPress={() => canEdit && onUpdate({ [field]: active ? undefined : option })}
              activeOpacity={0.85}
              style={[
                styles.statusEditorButton,
                active && styles.statusEditorButtonActive,
                !canEdit && styles.statusEditorButtonDisabled,
              ]}
            >
              <Text
                style={[
                  styles.statusEditorButtonText,
                  active && styles.statusEditorButtonTextActive,
                ]}
              >
                {option === 'in' ? 'Inne' : 'Ute'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderToggle = (
    label: string,
    value: boolean | undefined,
    field: 'hay' | 'water' | 'checked',
  ) => (
    <View style={styles.statusEditorRow}>
      <Text style={styles.statusEditorLabel}>{label}</Text>
      <TouchableOpacity
        disabled={!canEdit}
        onPress={() => canEdit && onUpdate({ [field]: !value })}
        activeOpacity={0.85}
        style={[
          styles.statusEditorButton,
          value && styles.statusEditorButtonActive,
          !canEdit && styles.statusEditorButtonDisabled,
        ]}
      >
        <Feather
          name={value ? 'check-circle' : 'circle'}
          size={14}
          color={value ? palette.inverseText : palette.primaryText}
        />
        <Text
          style={[
            styles.statusEditorButtonText,
            value && styles.statusEditorButtonTextActive,
          ]}
        >
          {value ? 'Klart' : 'Markera'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ gap: 8 }}>
      {renderInOutToggle('Dag', status?.dayStatus, 'dayStatus')}
      {renderInOutToggle('Natt', status?.nightStatus, 'nightStatus')}
      {renderToggle('Hö', status?.hay, 'hay')}
      {renderToggle('Vatten', status?.water, 'water')}
      {renderToggle('Kollad', status?.checked, 'checked')}
      {!canEdit ? (
        <Text style={styles.emptyText}>Du kan läsa detta, men inte ändra.</Text>
      ) : null}
    </View>
  );
}

type FeedPlanListProps = {
  horseId: string;
  stableId: string;
  plans: FeedPlanItem[];
  canEditDefaults: boolean;
  canEditOverrides: boolean;
  canCheck: boolean;
  todayIso: string;
  feedChecks: import('@/context/AppDataContext').FeedCheck[];
  onSave: (input: import('@/context/AppDataContext').UpsertFeedPlanInput) => boolean;
  onDelete: (id: string) => boolean;
  onCheck: (slot: FeedSlot, deviationNote?: string) => boolean;
};

function FeedPlanList({
  horseId,
  stableId,
  plans,
  canEditDefaults,
  canEditOverrides,
  canCheck,
  todayIso: _todayIso,
  feedChecks,
  onSave,
  onDelete,
  onCheck,
}: FeedPlanListProps) {
  const [editing, setEditing] = React.useState<{ slot: FeedSlot; mode: 'override' | 'default' } | null>(null);
  const [deviationFor, setDeviationFor] = React.useState<FeedSlot | null>(null);
  const [deviationText, setDeviationText] = React.useState('');

  return (
    <View style={styles.feedList}>
      {FEED_SLOTS.map((slot) => {
        const fallback = plans.find(
          (plan) => plan.isStableDefault && !plan.horseId && plan.slot === slot,
        );
        const override = plans.find(
          (plan) => !plan.isStableDefault && plan.horseId === horseId && plan.slot === slot,
        );
        const active = override ?? fallback;
        const check = feedChecks.find((entry) => entry.slot === slot);
        const isEditingOverride = editing?.slot === slot && editing.mode === 'override';
        const isEditingDefault = editing?.slot === slot && editing.mode === 'default';
        const showDeviation = deviationFor === slot;

        return (
          <View key={slot} style={styles.feedSlotBlock}>
            <View style={styles.feedSlotHeader}>
              <Text style={styles.feedSlotTitle}>{feedSlotLabels[slot]}</Text>
              {check?.checkedAt ? (
                <View style={styles.feedSlotPillSuccess}>
                  <Text style={styles.feedSlotPillText}>Klart idag</Text>
                </View>
              ) : null}
            </View>
            {active ? (
              <View style={styles.feedSlotBody}>
                <Text style={styles.feedSlotLabel}>{active.label}</Text>
                {active.amount ? <Text style={styles.feedSlotMeta}>{active.amount}</Text> : null}
                {active.note ? <Text style={styles.feedSlotMeta}>{active.note}</Text> : null}
                <Text style={styles.feedSlotKind}>
                  {override ? 'Egen plan för hästen' : 'Stallets standardplan'}
                </Text>
              </View>
            ) : (
              <Text style={styles.feedSlotEmpty}>Ingen foderplan satt för {feedSlotLabels[slot].toLowerCase()}.</Text>
            )}

            <View style={styles.feedSlotActions}>
              {canCheck ? (
                <TouchableOpacity
                  style={[
                    styles.feedActionButton,
                    check?.checkedAt ? styles.feedActionButtonMuted : styles.feedActionButtonPrimary,
                  ]}
                  onPress={() => {
                    onCheck(slot);
                  }}
                  activeOpacity={0.85}
                >
                  <Feather
                    name={check?.checkedAt ? 'check-circle' : 'check'}
                    size={14}
                    color={check?.checkedAt ? palette.secondaryText : palette.inverseText}
                  />
                  <Text
                    style={
                      check?.checkedAt ? styles.feedActionButtonTextMuted : styles.feedActionButtonText
                    }
                  >
                    {check?.checkedAt ? 'Markera om' : 'Markera klart'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {canCheck ? (
                <TouchableOpacity
                  style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
                  onPress={() => {
                    setDeviationFor(showDeviation ? null : slot);
                    setDeviationText(check?.deviationNote ?? '');
                  }}
                  activeOpacity={0.85}
                >
                  <Feather name="alert-circle" size={14} color={palette.primaryText} />
                  <Text style={styles.feedActionButtonTextSecondary}>Avvikelse</Text>
                </TouchableOpacity>
              ) : null}
              {canEditOverrides ? (
                <TouchableOpacity
                  style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
                  onPress={() =>
                    setEditing(
                      isEditingOverride
                        ? null
                        : { slot, mode: 'override' },
                    )
                  }
                  activeOpacity={0.85}
                >
                  <Feather name="edit-2" size={14} color={palette.primaryText} />
                  <Text style={styles.feedActionButtonTextSecondary}>
                    {override ? 'Ändra hästplan' : 'Lägg till hästplan'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {canEditDefaults ? (
                <TouchableOpacity
                  style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
                  onPress={() =>
                    setEditing(
                      isEditingDefault
                        ? null
                        : { slot, mode: 'default' },
                    )
                  }
                  activeOpacity={0.85}
                >
                  <Feather name="server" size={14} color={palette.primaryText} />
                  <Text style={styles.feedActionButtonTextSecondary}>
                    {fallback ? 'Ändra stallplan' : 'Lägg till stallplan'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {canEditOverrides && override ? (
                <TouchableOpacity
                  style={[styles.feedActionButton, styles.feedActionButtonDanger]}
                  onPress={() => onDelete(override.id)}
                  activeOpacity={0.85}
                >
                  <Feather name="trash-2" size={14} color={palette.inverseText} />
                  <Text style={styles.feedActionButtonText}>Ta bort hästplan</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {showDeviation ? (
              <View style={styles.feedFormBlock}>
                <Text style={styles.feedFormLabel}>Avvikelseanteckning</Text>
                <TextInput
                  value={deviationText}
                  onChangeText={setDeviationText}
                  placeholder="Ex. Hösilage tog slut – ersatt med torrhö."
                  placeholderTextColor={palette.secondaryText}
                  style={styles.feedFormInput}
                />
                <View style={styles.feedFormActions}>
                  <TouchableOpacity
                    style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
                    onPress={() => {
                      setDeviationFor(null);
                      setDeviationText('');
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.feedActionButtonTextSecondary}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.feedActionButton, styles.feedActionButtonPrimary]}
                    onPress={() => {
                      if (onCheck(slot, deviationText.trim() || undefined)) {
                        setDeviationFor(null);
                        setDeviationText('');
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.feedActionButtonText}>Spara avvikelse</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {editing?.slot === slot ? (
              <FeedPlanForm
                key={`${slot}-${editing.mode}`}
                stableId={stableId}
                horseId={horseId}
                slot={slot}
                isStableDefault={editing.mode === 'default'}
                existing={editing.mode === 'default' ? fallback : override}
                onCancel={() => setEditing(null)}
                onSubmit={(input) => {
                  const ok = onSave(input);
                  if (ok) setEditing(null);
                }}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

type FeedPlanFormProps = {
  stableId: string;
  horseId: string;
  slot: FeedSlot;
  isStableDefault: boolean;
  existing?: FeedPlanItem;
  onCancel: () => void;
  onSubmit: (input: import('@/context/AppDataContext').UpsertFeedPlanInput) => void;
};

function FeedPlanForm({
  stableId,
  horseId,
  slot,
  isStableDefault,
  existing,
  onCancel,
  onSubmit,
}: FeedPlanFormProps) {
  const [label, setLabel] = React.useState(existing?.label ?? '');
  const [amount, setAmount] = React.useState(existing?.amount ?? '');
  const [note, setNote] = React.useState(existing?.note ?? '');

  return (
    <View style={styles.feedFormBlock}>
      <Text style={styles.feedFormLabel}>
        {isStableDefault ? 'Stallets standard' : 'Plan för denna häst'}
      </Text>
      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder="Titel, t.ex. Morgonfoder"
        placeholderTextColor={palette.secondaryText}
        style={styles.feedFormInput}
      />
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="Mängd, t.ex. 2 kg hösilage"
        placeholderTextColor={palette.secondaryText}
        style={styles.feedFormInput}
      />
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Notering (frivillig)"
        placeholderTextColor={palette.secondaryText}
        style={styles.feedFormInput}
      />
      <View style={styles.feedFormActions}>
        <TouchableOpacity
          style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
          onPress={onCancel}
          activeOpacity={0.85}
        >
          <Text style={styles.feedActionButtonTextSecondary}>Avbryt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.feedActionButton, styles.feedActionButtonPrimary]}
          onPress={() =>
            onSubmit({
              id: existing?.id,
              stableId,
              horseId: isStableDefault ? null : horseId,
              slot,
              label,
              amount,
              note,
              isStableDefault,
              active: true,
            })
          }
          activeOpacity={0.85}
        >
          <Text style={styles.feedActionButtonText}>Spara</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

type PlannedRidesEditorProps = {
  stableId: string;
  horseId: string;
  stable?: Stable;
  rides: PlannedRide[];
  canEdit: boolean;
  onCreate: (input: import('@/context/AppDataContext').CreatePlannedRideInput) => boolean;
  onUpdate: (input: import('@/context/AppDataContext').UpdatePlannedRideInput) => boolean;
  onDelete: (id: string) => boolean;
  onComplete: (input: import('@/context/AppDataContext').CompletePlannedRideInput) => boolean;
};

function PlannedRidesEditor({
  stableId,
  horseId,
  stable,
  rides,
  canEdit,
  onCreate,
  onUpdate,
  onDelete,
  onComplete,
}: PlannedRidesEditorProps) {
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState({ date: '', time: '', rideTypeId: '', note: '' });
  const [completing, setCompleting] = React.useState<{ id: string; length: string; note: string } | null>(null);
  const sortedRides = React.useMemo(
    () =>
      [...rides].sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'planned' ? -1 : 1;
        }
        return `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`);
      }),
    [rides],
  );
  const rideTypes = stable?.rideTypes ?? [];

  return (
    <View style={{ gap: 10 }}>
      {sortedRides.length ? (
        sortedRides.map((ride) => {
          const rideType = rideTypes.find((item) => item.id === ride.rideTypeId);
          const isCompleting = completing?.id === ride.id;
          return (
            <View key={ride.id} style={styles.plannedRideCard}>
              <View style={styles.plannedRideHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.plannedRideTitle}>
                    {`${ride.date}${ride.time ? ` · ${ride.time}` : ''}`}
                  </Text>
                  <Text style={styles.plannedRideMeta}>
                    {[rideType?.label ?? 'Ridpass', ride.note]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.plannedRideStatusPill,
                    ride.status === 'done' && styles.plannedRideStatusDone,
                  ]}
                >
                  <Text style={styles.plannedRideStatusText}>
                    {ride.status === 'done' ? 'Klart' : 'Planerat'}
                  </Text>
                </View>
              </View>
              {canEdit && ride.status !== 'done' ? (
                <View style={styles.plannedRideActions}>
                  <TouchableOpacity
                    style={[styles.feedActionButton, styles.feedActionButtonPrimary]}
                    onPress={() =>
                      setCompleting(
                        isCompleting ? null : { id: ride.id, length: '', note: ride.note ?? '' },
                      )
                    }
                    activeOpacity={0.85}
                  >
                    <Feather name="check" size={14} color={palette.inverseText} />
                    <Text style={styles.feedActionButtonText}>Slutför ridpass</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
                    onPress={() => onUpdate({ id: ride.id, updates: { status: 'cancelled' } })}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.feedActionButtonTextSecondary}>Avboka</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.feedActionButton, styles.feedActionButtonDanger]}
                    onPress={() => onDelete(ride.id)}
                    activeOpacity={0.85}
                  >
                    <Feather name="trash-2" size={14} color={palette.inverseText} />
                    <Text style={styles.feedActionButtonText}>Ta bort</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {isCompleting ? (
                <View style={styles.feedFormBlock}>
                  <Text style={styles.feedFormLabel}>Logga ridpasset</Text>
                  <TextInput
                    value={completing?.length ?? ''}
                    onChangeText={(text) =>
                      setCompleting((prev) => (prev ? { ...prev, length: text } : prev))
                    }
                    placeholder="Längd, t.ex. 45 min"
                    placeholderTextColor={palette.secondaryText}
                    style={styles.feedFormInput}
                  />
                  <TextInput
                    value={completing?.note ?? ''}
                    onChangeText={(text) =>
                      setCompleting((prev) => (prev ? { ...prev, note: text } : prev))
                    }
                    placeholder="Notering"
                    placeholderTextColor={palette.secondaryText}
                    style={styles.feedFormInput}
                  />
                  <View style={styles.feedFormActions}>
                    <TouchableOpacity
                      style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
                      onPress={() => setCompleting(null)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.feedActionButtonTextSecondary}>Avbryt</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.feedActionButton, styles.feedActionButtonPrimary]}
                      onPress={() => {
                        if (
                          onComplete({
                            id: ride.id,
                            length: completing?.length,
                            note: completing?.note,
                          })
                        ) {
                          setCompleting(null);
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.feedActionButtonText}>Logga ridpass klart</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })
      ) : (
        <Text style={styles.emptyText}>Inga planerade ridpass.</Text>
      )}

      {canEdit ? (
        creating ? (
          <View style={styles.feedFormBlock}>
            <Text style={styles.feedFormLabel}>Nytt ridpass</Text>
            <TextInput
              value={draft.date}
              onChangeText={(text) => setDraft((prev) => ({ ...prev, date: text }))}
              placeholder="Datum (YYYY-MM-DD)"
              placeholderTextColor={palette.secondaryText}
              style={styles.feedFormInput}
            />
            <TextInput
              value={draft.time}
              onChangeText={(text) => setDraft((prev) => ({ ...prev, time: text }))}
              placeholder="Tid (HH:MM, frivillig)"
              placeholderTextColor={palette.secondaryText}
              style={styles.feedFormInput}
            />
            {rideTypes.length ? (
              <View style={styles.rideTypeRow}>
                {rideTypes.map((type) => {
                  const active = draft.rideTypeId === type.id;
                  return (
                    <TouchableOpacity
                      key={type.id}
                      onPress={() =>
                        setDraft((prev) => ({
                          ...prev,
                          rideTypeId: active ? '' : type.id,
                        }))
                      }
                      style={[
                        styles.feedActionButton,
                        active ? styles.feedActionButtonPrimary : styles.feedActionButtonSecondary,
                      ]}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={
                          active ? styles.feedActionButtonText : styles.feedActionButtonTextSecondary
                        }
                      >
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            <TextInput
              value={draft.note}
              onChangeText={(text) => setDraft((prev) => ({ ...prev, note: text }))}
              placeholder="Notering (frivillig)"
              placeholderTextColor={palette.secondaryText}
              style={styles.feedFormInput}
            />
            <View style={styles.feedFormActions}>
              <TouchableOpacity
                style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
                onPress={() => {
                  setCreating(false);
                  setDraft({ date: '', time: '', rideTypeId: '', note: '' });
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.feedActionButtonTextSecondary}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.feedActionButton, styles.feedActionButtonPrimary]}
                onPress={() => {
                  if (!draft.date.trim()) return;
                  const ok = onCreate({
                    stableId,
                    horseId,
                    date: draft.date.trim(),
                    time: draft.time.trim() || undefined,
                    rideTypeId: draft.rideTypeId || undefined,
                    note: draft.note.trim() || undefined,
                  });
                  if (ok) {
                    setCreating(false);
                    setDraft({ date: '', time: '', rideTypeId: '', note: '' });
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.feedActionButtonText}>Lägg till</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
            onPress={() => setCreating(true)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={14} color={palette.primaryText} />
            <Text style={styles.feedActionButtonTextSecondary}>Planera ridpass</Text>
          </TouchableOpacity>
        )
      ) : null}
    </View>
  );
}

const careEventTypeLabels: Record<CareEventType, string> = {
  farrier: 'Hovslagare',
  vet: 'Veterinär',
  vaccination: 'Vaccination',
  dental: 'Tandvård',
  treatment: 'Behandling',
  other: 'Annat',
};

const careEventTypeOrder: CareEventType[] = [
  'farrier',
  'vet',
  'vaccination',
  'dental',
  'treatment',
  'other',
];

type CareEventsEditorProps = {
  stableId: string;
  horseId: string;
  events: CareEvent[];
  contacts: ExternalContact[];
  canEdit: boolean;
  onCreate: (input: import('@/context/AppDataContext').CreateCareEventInput) => boolean;
  onComplete: (input: import('@/context/AppDataContext').CompleteCareEventInput) => boolean;
  onCancel: (id: string) => boolean;
  onDelete: (id: string) => boolean;
};

function CareEventsEditor({
  stableId,
  horseId,
  events,
  contacts,
  canEdit,
  onCreate,
  onComplete,
  onCancel,
  onDelete,
}: CareEventsEditorProps) {
  const [creating, setCreating] = React.useState(false);
  const [completingId, setCompletingId] = React.useState<string | null>(null);
  const [completeNote, setCompleteNote] = React.useState('');
  const [draft, setDraft] = React.useState<{
    type: CareEventType;
    title: string;
    date: string;
    time: string;
    contactId: string;
    note: string;
  }>(() => ({ type: 'farrier', title: '', date: '', time: '', contactId: '', note: '' }));
  const upcoming = events
    .filter((event) => event.status === 'planned')
    .sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
  const history = events
    .filter((event) => event.status !== 'planned')
    .sort((a, b) =>
      (b.completedAt ?? b.date).localeCompare(a.completedAt ?? a.date),
    );
  const renderEvent = (event: CareEvent) => {
    const contact = contacts.find((entry) => entry.id === event.contactId);
    const isCompleting = completingId === event.id;
    return (
      <View key={event.id} style={styles.plannedRideCard}>
        <View style={styles.plannedRideHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.plannedRideTitle}>
              {`${event.date}${event.time ? ` · ${event.time}` : ''} · ${careEventTypeLabels[event.type]}`}
            </Text>
            <Text style={styles.plannedRideMeta}>
              {[event.title, contact?.name, event.note].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View
            style={[
              styles.plannedRideStatusPill,
              event.status === 'done' && styles.plannedRideStatusDone,
            ]}
          >
            <Text style={styles.plannedRideStatusText}>
              {event.status === 'done'
                ? 'Klart'
                : event.status === 'cancelled'
                  ? 'Avbokat'
                  : 'Planerat'}
            </Text>
          </View>
        </View>
        {canEdit && event.status === 'planned' ? (
          <View style={styles.plannedRideActions}>
            <TouchableOpacity
              style={[styles.feedActionButton, styles.feedActionButtonPrimary]}
              onPress={() => {
                if (isCompleting) {
                  setCompletingId(null);
                  setCompleteNote('');
                } else {
                  setCompletingId(event.id);
                  setCompleteNote(event.note ?? '');
                }
              }}
              activeOpacity={0.85}
            >
              <Feather name="check" size={14} color={palette.inverseText} />
              <Text style={styles.feedActionButtonText}>Slutför vård</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
              onPress={() => onCancel(event.id)}
              activeOpacity={0.85}
            >
              <Text style={styles.feedActionButtonTextSecondary}>Avboka</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.feedActionButton, styles.feedActionButtonDanger]}
              onPress={() => onDelete(event.id)}
              activeOpacity={0.85}
            >
              <Feather name="trash-2" size={14} color={palette.inverseText} />
              <Text style={styles.feedActionButtonText}>Ta bort</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {isCompleting ? (
          <View style={styles.feedFormBlock}>
            <Text style={styles.feedFormLabel}>Slutkommentar</Text>
            <TextInput
              value={completeNote}
              onChangeText={setCompleteNote}
              placeholder="Notering, t.ex. nya skor, dosering, datum för uppföljning"
              placeholderTextColor={palette.secondaryText}
              style={styles.feedFormInput}
            />
            <View style={styles.feedFormActions}>
              <TouchableOpacity
                style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
                onPress={() => {
                  setCompletingId(null);
                  setCompleteNote('');
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.feedActionButtonTextSecondary}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.feedActionButton, styles.feedActionButtonPrimary]}
                onPress={() => {
                  if (
                    onComplete({
                      id: event.id,
                      note: completeNote.trim() || undefined,
                    })
                  ) {
                    setCompletingId(null);
                    setCompleteNote('');
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.feedActionButtonText}>Spara vårdlogg</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ gap: 10 }}>
      {upcoming.length || history.length ? (
        <>
          {upcoming.length ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.feedHistoryTitle}>Kommande vård</Text>
              {upcoming.map(renderEvent)}
            </View>
          ) : null}
          {history.length ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.feedHistoryTitle}>Vårdhistorik</Text>
              {history.map(renderEvent)}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={styles.emptyText}>Ingen vårdhistorik ännu.</Text>
      )}

      {canEdit ? (
        creating ? (
          <View style={styles.feedFormBlock}>
            <Text style={styles.feedFormLabel}>Ny vårdhändelse</Text>
            <View style={styles.rideTypeRow}>
              {careEventTypeOrder.map((type) => {
                const active = draft.type === type;
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setDraft((prev) => ({ ...prev, type }))}
                    style={[
                      styles.feedActionButton,
                      active ? styles.feedActionButtonPrimary : styles.feedActionButtonSecondary,
                    ]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={
                        active ? styles.feedActionButtonText : styles.feedActionButtonTextSecondary
                      }
                    >
                      {careEventTypeLabels[type]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              value={draft.title}
              onChangeText={(text) => setDraft((prev) => ({ ...prev, title: text }))}
              placeholder="Titel, t.ex. Skoning"
              placeholderTextColor={palette.secondaryText}
              style={styles.feedFormInput}
            />
            <TextInput
              value={draft.date}
              onChangeText={(text) => setDraft((prev) => ({ ...prev, date: text }))}
              placeholder="Datum (YYYY-MM-DD)"
              placeholderTextColor={palette.secondaryText}
              style={styles.feedFormInput}
            />
            <TextInput
              value={draft.time}
              onChangeText={(text) => setDraft((prev) => ({ ...prev, time: text }))}
              placeholder="Tid (HH:MM, frivillig)"
              placeholderTextColor={palette.secondaryText}
              style={styles.feedFormInput}
            />
            {contacts.length ? (
              <View style={styles.rideTypeRow}>
                <TouchableOpacity
                  onPress={() => setDraft((prev) => ({ ...prev, contactId: '' }))}
                  style={[
                    styles.feedActionButton,
                    !draft.contactId
                      ? styles.feedActionButtonPrimary
                      : styles.feedActionButtonSecondary,
                  ]}
                  activeOpacity={0.85}
                >
                  <Text
                    style={
                      !draft.contactId
                        ? styles.feedActionButtonText
                        : styles.feedActionButtonTextSecondary
                    }
                  >
                    Ingen kontakt
                  </Text>
                </TouchableOpacity>
                {contacts.map((contact) => {
                  const active = draft.contactId === contact.id;
                  return (
                    <TouchableOpacity
                      key={contact.id}
                      onPress={() =>
                        setDraft((prev) => ({
                          ...prev,
                          contactId: active ? '' : contact.id,
                        }))
                      }
                      style={[
                        styles.feedActionButton,
                        active ? styles.feedActionButtonPrimary : styles.feedActionButtonSecondary,
                      ]}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={
                          active ? styles.feedActionButtonText : styles.feedActionButtonTextSecondary
                        }
                      >
                        {contact.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            <TextInput
              value={draft.note}
              onChangeText={(text) => setDraft((prev) => ({ ...prev, note: text }))}
              placeholder="Notering (frivillig)"
              placeholderTextColor={palette.secondaryText}
              style={styles.feedFormInput}
            />
            <View style={styles.feedFormActions}>
              <TouchableOpacity
                style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
                onPress={() => {
                  setCreating(false);
                  setDraft({ type: 'farrier', title: '', date: '', time: '', contactId: '', note: '' });
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.feedActionButtonTextSecondary}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.feedActionButton, styles.feedActionButtonPrimary]}
                onPress={() => {
                  if (!draft.title.trim() || !draft.date.trim()) return;
                  const ok = onCreate({
                    stableId,
                    horseIds: [horseId],
                    type: draft.type,
                    title: draft.title.trim(),
                    date: draft.date.trim(),
                    time: draft.time.trim() || undefined,
                    contactId: draft.contactId || undefined,
                    note: draft.note.trim() || undefined,
                  });
                  if (ok) {
                    setCreating(false);
                    setDraft({ type: 'farrier', title: '', date: '', time: '', contactId: '', note: '' });
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.feedActionButtonText}>Skapa vårdhändelse</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.feedActionButton, styles.feedActionButtonSecondary]}
            onPress={() => setCreating(true)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={14} color={palette.primaryText} />
            <Text style={styles.feedActionButtonTextSecondary}>Lägg till vårdhändelse</Text>
          </TouchableOpacity>
        )
      ) : null}
    </View>
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
    gap: 14,
  },
  scrollContentDesktop: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 36,
    paddingTop: 0,
    paddingBottom: 40,
  },
  heroCard: {
    padding: 18,
    gap: 14,
    borderRadius: radius.xl,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceTint,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: palette.primaryText,
  },
  heroMeta: {
    fontSize: 14,
    color: palette.secondaryText,
  },
  heroNote: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.primaryText,
  },
  sectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  sectionCard: {
    padding: 16,
    gap: 12,
    borderRadius: radius.xl,
  },
  sectionCardInGrid: {
    flexGrow: 1,
    flexBasis: 280,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceTint,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.primaryText,
  },
  sectionBody: {
    gap: 9,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 3,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.secondaryText,
    textTransform: 'capitalize',
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: palette.primaryText,
    textAlign: 'right',
  },
  rideList: {
    gap: 10,
  },
  rideRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rideDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: palette.primary,
  },
  rideBody: {
    flex: 1,
    minWidth: 0,
  },
  rideTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.primaryText,
  },
  rideMeta: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: palette.secondaryText,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.secondaryText,
  },
  centerEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    padding: 24,
    gap: 12,
    borderRadius: radius.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.primaryText,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: palette.inverseText,
  },
  feedList: {
    gap: 14,
  },
  feedSlotBlock: {
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  feedSlotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  feedSlotTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: palette.primaryText,
  },
  feedSlotPillSuccess: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
  },
  feedSlotPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.primary,
  },
  feedSlotBody: {
    gap: 4,
  },
  feedSlotLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.primaryText,
  },
  feedSlotMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.secondaryText,
  },
  feedSlotKind: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.primary,
    textTransform: 'uppercase',
  },
  feedSlotEmpty: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.secondaryText,
  },
  feedSlotActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  feedActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  feedActionButtonPrimary: {
    backgroundColor: palette.primary,
  },
  feedActionButtonSecondary: {
    backgroundColor: palette.surfaceTint,
  },
  feedActionButtonMuted: {
    backgroundColor: palette.surfaceTint,
  },
  feedActionButtonDanger: {
    backgroundColor: '#B3261E',
  },
  feedActionButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.inverseText,
  },
  feedActionButtonTextSecondary: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primaryText,
  },
  feedActionButtonTextMuted: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.secondaryText,
  },
  feedFormBlock: {
    marginTop: 8,
    padding: 12,
    gap: 8,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceTint,
  },
  feedFormLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.secondaryText,
    textTransform: 'uppercase',
  },
  feedFormInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    color: palette.primaryText,
    fontSize: 14,
  },
  feedFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  feedHistoryBlock: {
    marginTop: 14,
    gap: 6,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  feedHistoryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.secondaryText,
    textTransform: 'uppercase',
  },
  feedHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  feedHistoryLabel: {
    fontSize: 13,
    color: palette.primaryText,
  },
  feedHistoryValue: {
    fontSize: 13,
    color: palette.secondaryText,
    flexShrink: 1,
    textAlign: 'right',
  },
  statusEditorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusEditorLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.primaryText,
  },
  statusEditorButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  statusEditorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
  },
  statusEditorButtonActive: {
    backgroundColor: palette.primary,
  },
  statusEditorButtonDisabled: {
    opacity: 0.5,
  },
  statusEditorButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primaryText,
  },
  statusEditorButtonTextActive: {
    color: palette.inverseText,
  },
  rideHistoryBlock: {
    marginTop: 14,
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  plannedRideCard: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceTint,
    gap: 8,
  },
  plannedRideHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  plannedRideTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.primaryText,
  },
  plannedRideMeta: {
    fontSize: 13,
    color: palette.secondaryText,
  },
  plannedRideStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
  },
  plannedRideStatusDone: {
    backgroundColor: palette.primary,
  },
  plannedRideStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.primaryText,
  },
  plannedRideActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rideTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
