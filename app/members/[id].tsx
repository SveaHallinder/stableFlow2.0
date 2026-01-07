import React from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, HeaderIconButton, Pill } from '@/components/Primitives';
import { DesktopNav } from '@/components/DesktopNav';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { radius, space } from '@/design/tokens';
import type { AssignmentSlot, DefaultPass, UserRole, WeekdayIndex } from '@/context/AppDataContext';

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
  owner: 'Ägare',
  edit: 'Redigera',
  view: 'Läsa',
};

const DEFAULT_WEEKDAYS: { label: string; value: WeekdayIndex }[] = [
  { label: 'Mån', value: 0 },
  { label: 'Tis', value: 1 },
  { label: 'Ons', value: 2 },
  { label: 'Tor', value: 3 },
  { label: 'Fre', value: 4 },
  { label: 'Lör', value: 5 },
  { label: 'Sön', value: 6 },
];

const DEFAULT_SLOTS: { label: string; value: AssignmentSlot }[] = [
  { label: 'Morgon', value: 'Morning' },
  { label: 'Lunch', value: 'Lunch' },
  { label: 'Kväll', value: 'Evening' },
];

function hasDefaultPass(passes: DefaultPass[], weekday: WeekdayIndex, slot: AssignmentSlot) {
  return passes.some((entry) => entry.weekday === weekday && entry.slot === slot);
}

export default function MemberProfileScreen() {
  const router = useRouter();
  const toast = useToast();
  const { state, actions } = useAppData();
  const { id: rawId, stableId: rawStableId } = useLocalSearchParams<{
    id?: string;
    stableId?: string;
  }>();
  const memberId = Array.isArray(rawId) ? rawId[0] : rawId;
  const selectedStableId = Array.isArray(rawStableId) ? rawStableId[0] : rawStableId;
  const stableId = selectedStableId ?? state.currentStableId;
  const member = memberId ? state.users[memberId] : undefined;
  const stable = state.stables.find((item) => item.id === stableId);

  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const handleBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/members');
  }, [router]);

  const currentUser = state.users[state.currentUserId];
  const currentMembership = currentUser?.membership.find((entry) => entry.stableId === stableId);
  const canManageMembers =
    currentMembership?.role === 'admin' && (currentMembership.access ?? 'view') === 'owner';

  const membership = member?.membership.find((entry) => entry.stableId === stableId) ?? member?.membership[0];
  const roleLabel = membership ? membership.customRole?.trim() || roleLabels[membership.role] : 'Ingen roll';
  const accessLabel = membership?.access ? accessLabels[membership.access] : undefined;
  const riderLabel =
    membership?.role === 'rider'
      ? membership.riderRole === 'owner'
        ? 'Hästägare'
        : membership.riderRole === 'medryttare'
          ? 'Medryttare'
          : membership.riderRole === 'other'
            ? 'Annat'
            : undefined
      : undefined;

  const stableHorses = React.useMemo(
    () => state.horses.filter((horse) => horse.stableId === stableId),
    [stableId, state.horses],
  );
  const ownerHorseIds = React.useMemo(
    () => new Set(stableHorses.filter((horse) => horse.ownerUserId === member?.id).map((horse) => horse.id)),
    [member?.id, stableHorses],
  );
  const assignedHorseIds = React.useMemo(
    () => new Set(membership?.horseIds ?? []),
    [membership?.horseIds],
  );

  const handleToggleHorse = React.useCallback(
    (horseId: string) => {
      if (!member || !membership || !canManageMembers) {
        return;
      }
      if (ownerHorseIds.has(horseId)) {
        return;
      }
      const nextIds = new Set(assignedHorseIds);
      if (nextIds.has(horseId)) {
        nextIds.delete(horseId);
      } else {
        nextIds.add(horseId);
      }
      const result = actions.updateMemberHorseIds({
        userId: member.id,
        stableId,
        horseIds: Array.from(nextIds),
      });
      if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, assignedHorseIds, canManageMembers, member, membership, ownerHorseIds, stableId, toast],
  );

  const handleToggleDefaultPass = React.useCallback(
    (weekday: WeekdayIndex, slot: AssignmentSlot) => {
      if (!member || !canManageMembers) {
        return;
      }
      const result = actions.toggleMemberDefaultPass({
        userId: member.id,
        stableId,
        weekday,
        slot,
      });
      if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, canManageMembers, member, stableId, toast],
  );

  const handleMessage = React.useCallback(() => {
    router.push('/messages');
  }, [router]);

  const handleCall = React.useCallback(() => {
    toast.showToast('Direktsamtal öppnas snart.', 'info');
  }, [toast]);

  const handleRoleCycle = React.useCallback(() => {
    if (!member || !membership) {
      return;
    }
    const index = roleOrder.indexOf(membership.role);
    const nextRole = roleOrder[(index + 1) % roleOrder.length];
    const result = actions.updateMemberRole({ userId: member.id, stableId, role: nextRole });
    if (!result.success) {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, member, membership, stableId, toast]);

  const handleRemoveMember = React.useCallback(() => {
    if (!member) {
      return;
    }
    const result = actions.removeMemberFromStable(member.id, stableId);
    if (!result.success) {
      toast.showToast(result.reason, 'error');
    } else {
      toast.showToast('Medlem borttagen.', 'success');
      handleBack();
    }
  }, [actions, handleBack, member, stableId, toast]);

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

  if (!member) {
    return (
      <LinearGradient colors={theme.gradients.background} style={styles.background}>
        <SafeAreaView style={styles.safeArea}>
          <ScreenHeader
            title="Medlem"
            showLogo={false}
            showSearch={false}
            left={
              <HeaderIconButton
                accessibilityRole="button"
                accessibilityLabel="Tillbaka"
                onPress={handleBack}
                style={styles.backButton}
              >
                <Text style={styles.backIcon}>‹</Text>
              </HeaderIconButton>
            }
          />
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Medlem saknas</Text>
            <Text style={styles.emptyText}>Vi hittade ingen medlem med det ID:t.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const heroSection = (
    <Card tone="muted" style={styles.heroCard}>
      <View style={styles.heroRow}>
        <Image
          source={member.avatar ?? require('@/assets/images/dummy-avatar.png')}
          style={styles.avatar}
        />
        <View style={styles.heroText}>
          <Text style={styles.heroName}>{member.name}</Text>
          <Text style={styles.heroMeta}>
            {[roleLabel, riderLabel, accessLabel].filter(Boolean).join(' · ') || 'Medlem'}
          </Text>
          <Text style={styles.heroStable}>{stable?.name ?? 'Okänt stall'}</Text>
        </View>
      </View>
      <View style={styles.heroActions}>
        <TouchableOpacity style={styles.primaryActionButton} onPress={handleCall} activeOpacity={0.85}>
          <Feather name="phone-call" size={16} color={palette.inverseText} />
          <Text style={styles.primaryActionLabel}>Ring</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryActionButton} onPress={handleMessage} activeOpacity={0.85}>
          <Feather name="message-circle" size={16} color="#2D6CF6" />
          <Text style={styles.secondaryActionLabel}>Chatta</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  const contactSection = (
    <Card tone="muted" style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Kontakt</Text>
      <View style={styles.detailList}>
        <DetailRow icon="mail" value={member.email ?? 'Ingen e-post'} />
        <DetailRow icon="phone" value={member.phone || 'Inget nummer'} />
        <DetailRow icon="map-pin" value={member.location || 'Okänd plats'} />
      </View>
    </Card>
  );

  const horsesSection = (
    <Card tone="muted" style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Hästar</Text>
      {stableHorses.length ? (
        <>
          {canManageMembers ? <Text style={styles.sectionHint}>Tryck för att koppla hästar.</Text> : null}
          <View style={styles.chipRow}>
            {stableHorses.map((horse) => {
              const isOwner = ownerHorseIds.has(horse.id);
              const isAssigned = assignedHorseIds.has(horse.id) || isOwner;
              return (
                <TouchableOpacity
                  key={horse.id}
                  onPress={() => handleToggleHorse(horse.id)}
                  activeOpacity={0.85}
                  disabled={!canManageMembers || isOwner}
                >
                  <Pill
                    active={isAssigned}
                    style={[
                      styles.chip,
                      isOwner && styles.ownerChip,
                      (!canManageMembers || isOwner) && styles.disabledChip,
                    ]}
                  >
                    <View style={styles.chipContent}>
                      <Text
                        style={[
                          styles.chipText,
                          isAssigned && styles.chipTextActive,
                        ]}
                      >
                        {horse.name}
                      </Text>
                      {isOwner ? <Text style={styles.chipBadge}>Ägare</Text> : null}
                    </View>
                  </Pill>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : (
        <Text style={styles.sectionText}>Inga hästar i stallet ännu.</Text>
      )}
    </Card>
  );

  const defaultPassSection = (
    <Card tone="muted" style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Standardriddagar</Text>
      {member.defaultPasses.length || canManageMembers ? (
        <View style={styles.defaultPassGrid}>
          {DEFAULT_SLOTS.map((slot) => (
            <View key={slot.value} style={styles.defaultPassRow}>
              <Text style={styles.defaultPassRowLabel}>{slot.label}</Text>
              <View style={styles.defaultPassRowChips}>
                {DEFAULT_WEEKDAYS.map((day) => {
                  const active = hasDefaultPass(member.defaultPasses, day.value, slot.value);
                  return canManageMembers ? (
                    <TouchableOpacity
                      key={`${slot.value}-${day.value}`}
                      onPress={() => handleToggleDefaultPass(day.value, slot.value)}
                      activeOpacity={0.85}
                    >
                      <Pill active={active} style={styles.defaultPassChip}>
                        <Text
                          style={[
                            styles.defaultPassChipText,
                            active && styles.defaultPassChipTextActive,
                          ]}
                        >
                          {day.label}
                        </Text>
                      </Pill>
                    </TouchableOpacity>
                  ) : (
                    <Pill key={`${slot.value}-${day.value}`} active={active} style={styles.defaultPassChip}>
                      <Text
                        style={[
                          styles.defaultPassChipText,
                          active && styles.defaultPassChipTextActive,
                        ]}
                      >
                        {day.label}
                      </Text>
                    </Pill>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.sectionText}>Inga standardpass valda.</Text>
      )}
    </Card>
  );

  const awaySection = (
    <Card tone="muted" style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Planerad frånvaro</Text>
      {member.awayNotices.length ? (
        <View style={styles.awayList}>
          {member.awayNotices.map((notice) => (
            <View key={notice.id} style={styles.awayItem}>
              <Text style={styles.awayRange}>{formatRange(notice.start, notice.end)}</Text>
              <Text style={styles.awayNote}>{notice.note}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.sectionText}>Ingen planerad frånvaro.</Text>
      )}
    </Card>
  );

  const adminSection =
    canManageMembers ? (
      <Card tone="muted" style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Adminåtgärder</Text>
        <View style={styles.adminActions}>
          <TouchableOpacity
            style={[styles.adminButton, !canManageMembers && styles.adminButtonDisabled]}
            onPress={handleRoleCycle}
            activeOpacity={0.85}
            disabled={!canManageMembers}
          >
            <Text style={styles.adminButtonText}>Byt roll</Text>
          </TouchableOpacity>
          {member.id !== state.currentUserId ? (
            <TouchableOpacity
              style={[styles.removeButton, !canManageMembers && styles.adminButtonDisabled]}
              onPress={handleRemoveMember}
              activeOpacity={0.85}
              disabled={!canManageMembers}
            >
              <Text style={styles.removeButtonText}>Ta bort från stallet</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Card>
    ) : null;

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        {wrapDesktop(
          <>
            <ScreenHeader
              title={member.name}
              subtitle={stable?.name ?? 'Stall'}
              meta={roleLabel}
              showLogo={false}
              showSearch={false}
              left={
                <HeaderIconButton
                  accessibilityRole="button"
                  accessibilityLabel="Tillbaka"
                  onPress={handleBack}
                  style={styles.backButton}
                >
                  <Text style={styles.backIcon}>‹</Text>
                </HeaderIconButton>
              }
            />
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}
              showsVerticalScrollIndicator={false}
            >
              {isDesktopWeb ? (
                <View style={styles.desktopLayout}>
                  <View style={styles.desktopSidebarContent}>
                    {heroSection}
                    {contactSection}
                    {adminSection}
                  </View>
                  <View style={styles.desktopMainContent}>
                    {horsesSection}
                    {defaultPassSection}
                    {awaySection}
                  </View>
                </View>
              ) : (
                <>
                  {heroSection}
                  {contactSection}
                  {horsesSection}
                  {defaultPassSection}
                  {awaySection}
                  {adminSection}
                </>
              )}
            </ScrollView>
          </>,
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

function DetailRow({ icon, value }: { icon: keyof typeof Feather.glyphMap; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Feather name={icon} size={14} color={palette.icon} />
      <Text style={styles.detailText}>{value}</Text>
    </View>
  );
}

function formatRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (startDate.getTime() === endDate.getTime()) {
    return startDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'numeric' });
  }
  return `${startDate.getDate()}–${endDate.getDate()}/${startDate.getMonth() + 1}`;
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: palette.background },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: 40,
    gap: space.lg,
    paddingTop: 12,
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
  desktopLayout: { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  desktopSidebarContent: { width: 340, flexShrink: 0, gap: space.lg },
  desktopMainContent: { flex: 1, minWidth: 0, gap: space.lg },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceTint,
  },
  backIcon: {
    fontSize: 22,
    color: palette.primaryText,
    marginTop: -2,
  },
  heroCard: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 0,
    gap: space.md,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 64, height: 64, borderRadius: radius.full },
  heroText: { flex: 1, gap: 4 },
  heroName: { fontSize: 20, fontWeight: '700', color: palette.primaryText },
  heroMeta: { fontSize: 13, fontWeight: '600', color: palette.secondaryText },
  heroStable: { fontSize: 12, color: palette.secondaryText },
  heroActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
  },
  primaryActionLabel: { fontSize: 13, fontWeight: '600', color: palette.inverseText },
  secondaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(45, 108, 246, 0.12)',
  },
  secondaryActionLabel: { fontSize: 13, fontWeight: '600', color: palette.primary },
  sectionCard: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 0,
    gap: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: palette.primaryText },
  sectionHint: { fontSize: 12, color: palette.secondaryText },
  sectionText: { fontSize: 13, color: palette.secondaryText },
  detailList: { gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13, color: palette.primaryText },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  chipContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 12, fontWeight: '600', color: palette.primaryText },
  chipTextActive: { color: palette.primary },
  chipBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: palette.secondaryText,
    backgroundColor: palette.surfaceTint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  ownerChip: {
    backgroundColor: 'rgba(45, 108, 246, 0.08)',
    borderColor: 'rgba(45, 108, 246, 0.25)',
  },
  disabledChip: {
    opacity: 0.7,
  },
  defaultPassGrid: { gap: 12 },
  defaultPassRow: { gap: 8 },
  defaultPassRowLabel: { fontSize: 13, fontWeight: '600', color: palette.secondaryText },
  defaultPassRowChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  defaultPassChip: { paddingHorizontal: 10, paddingVertical: 6 },
  defaultPassChipText: { fontSize: 11, fontWeight: '600', color: palette.secondaryText },
  defaultPassChipTextActive: { color: palette.primary },
  awayList: { gap: 10 },
  awayItem: { gap: 4, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  awayRange: { fontSize: 13, fontWeight: '600', color: palette.primaryText },
  awayNote: { fontSize: 12, color: palette.secondaryText },
  adminActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  adminButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  adminButtonText: { fontSize: 12, fontWeight: '600', color: palette.primaryText },
  adminButtonDisabled: { opacity: 0.5 },
  removeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(249, 95, 95, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(249, 95, 95, 0.22)',
  },
  removeButtonText: { fontSize: 12, fontWeight: '600', color: palette.error },
  emptyState: { paddingHorizontal: 20, paddingTop: 40, gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: palette.primaryText },
  emptyText: { fontSize: 13, color: palette.secondaryText },
});
