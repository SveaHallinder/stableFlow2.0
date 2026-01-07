import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { resolveStableSettings } from '@/context/AppDataContext';
import { useAppData } from '@/context/AppDataContext';

const palette = theme.colors;

type TaskRowProps = {
  title: string;
  description: string;
  onPress: () => void;
  done?: boolean;
};

function TaskRow({ title, description, onPress, done }: TaskRowProps) {
  return (
    <TouchableOpacity style={styles.taskRow} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.taskLeft}>
        <View style={[styles.taskIcon, done && styles.taskIconDone]}>
          <Feather
            name={done ? 'check' : 'circle'}
            size={14}
            color={done ? palette.inverseText : palette.secondaryText}
          />
        </View>
        <View style={styles.taskText}>
          <Text style={styles.taskTitle}>{title}</Text>
          <Text style={styles.taskDescription}>{description}</Text>
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={palette.secondaryText} />
    </TouchableOpacity>
  );
}

export default function OnboardingSetup() {
  const router = useRouter();
  const { state, actions, derived } = useAppData();
  const { stables, currentStableId, horses, paddocks, users } = state;
  const [showMore, setShowMore] = React.useState(false);
  const returnTo = '/(onboarding)/setup';

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [activeStableId, setActiveStableId] = React.useState(fallbackStableId);
  const activeStable = React.useMemo(
    () => stables.find((stable) => stable.id === activeStableId),
    [activeStableId, stables],
  );

  React.useEffect(() => {
    if (!stables.length) {
      router.replace('/(onboarding)/stables');
      return;
    }
    if (!activeStableId && fallbackStableId) {
      setActiveStableId(fallbackStableId);
    }
    if (activeStableId && !stables.some((stable) => stable.id === activeStableId)) {
      setActiveStableId(fallbackStableId);
    }
  }, [activeStableId, fallbackStableId, router, stables]);

  const handleSelectStable = React.useCallback(
    (stableId: string) => {
      setActiveStableId(stableId);
      actions.setCurrentStable(stableId);
    },
    [actions],
  );

  const stableHorses = React.useMemo(
    () => horses.filter((horse) => horse.stableId === activeStableId),
    [activeStableId, horses],
  );
  const stablePaddocks = React.useMemo(
    () => paddocks.filter((paddock) => paddock.stableId === activeStableId),
    [activeStableId, paddocks],
  );

  const memberCount = React.useMemo(() => {
    const memberIds = new Set<string>();
    Object.values(users).forEach((user) => {
      if (user.membership.some((entry) => entry.stableId === activeStableId)) {
        memberIds.add(user.id);
      }
    });
    return memberIds.size;
  }, [activeStableId, users]);

  const settings = resolveStableSettings(activeStable);
  const hasDetails = Boolean(activeStable?.description || activeStable?.location);
  const rideTypes = activeStable?.rideTypes ?? [];
  const visibleEvents = Object.values(settings.eventVisibility).filter(Boolean).length;
  const dayLogicLabel = settings.dayLogic === 'box' ? 'Box' : 'Lösdrift';
  const arenaLabel = settings.arena.hasArena
    ? settings.arena.hasSchedule
      ? 'Ridhus: bokning på'
      : 'Ridhus: ja'
    : 'Ridhus: ej valt';
  const exitRoute =
    derived.canManageOnboardingAny && Platform.OS === 'web' ? '/admin' : '/(tabs)';

  const handleFinish = React.useCallback(() => {
    actions.setOnboardingDismissed(true);
    router.replace(exitRoute);
  }, [actions, exitRoute, router]);

  return (
    <OnboardingShell
      title="Klart att börja"
      subtitle="Stallet är skapat. Välj vad ni vill lägga in nu eller gå direkt till appen."
      step={1}
      total={1}
      onBack={() => router.replace('/(onboarding)/stables')}
      showProgress={false}
    >
      {stables.length > 1 ? (
        <Card tone="muted" style={styles.card}>
          <Text style={styles.sectionTitle}>Välj stall</Text>
          <View style={styles.chipRow}>
            {stables.map((stable) => {
              const active = stable.id === activeStableId;
              return (
                <TouchableOpacity
                  key={stable.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => handleSelectStable(stable.id)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{stable.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Du kan börja nu</Text>
        <Text style={styles.sectionHint}>
          Du kan fylla i detaljer senare i Admin. Det viktigaste är att stallet finns.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleFinish} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>Gå till appen</Text>
        </TouchableOpacity>
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Lägg in det viktigaste</Text>
        <TaskRow
          title="Hästar"
          description={stableHorses.length ? `${stableHorses.length} hästar` : 'Lägg till hästar'}
          onPress={() => router.push({ pathname: '/(onboarding)/horses', params: { returnTo } })}
          done={stableHorses.length > 0}
        />
        <TaskRow
          title="Medlemmar"
          description={memberCount > 1 ? `${memberCount} medlemmar` : 'Bara du än så länge'}
          onPress={() => router.push({ pathname: '/(onboarding)/members', params: { returnTo } })}
          done={memberCount > 1}
        />
        <TaskRow
          title="Stalluppgifter"
          description={hasDetails ? 'Info ifylld' : 'Lägg till plats och beskrivning'}
          onPress={() => router.push({ pathname: '/(onboarding)/stable-details', params: { returnTo } })}
          done={hasDetails}
        />
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>Mer inställningar</Text>
        {!showMore ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowMore(true)} activeOpacity={0.85}>
            <Text style={styles.secondaryLabel}>Visa fler inställningar</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.taskList}>
            <TaskRow
              title="Box eller lösdrift"
              description={`Nu: ${dayLogicLabel}`}
              onPress={() => router.push({ pathname: '/(onboarding)/day-logic', params: { returnTo } })}
            />
            <TaskRow
              title="Ridhus"
              description={arenaLabel}
              onPress={() => router.push({ pathname: '/(onboarding)/arena', params: { returnTo } })}
            />
            <TaskRow
              title="Hagar"
              description={stablePaddocks.length ? `${stablePaddocks.length} hagar` : 'Valfritt'}
              onPress={() => router.push({ pathname: '/(onboarding)/paddocks', params: { returnTo } })}
              done={stablePaddocks.length > 0}
            />
            <TaskRow
              title="Ridpass-typer"
              description={rideTypes.length ? `${rideTypes.length} typer` : 'Valfritt'}
              onPress={() => router.push({ pathname: '/(onboarding)/ride-types', params: { returnTo } })}
              done={rideTypes.length > 0}
            />
            <TaskRow
              title="Händelser i schema"
              description={`${visibleEvents} aktiva`}
              onPress={() => router.push({ pathname: '/(onboarding)/events', params: { returnTo } })}
            />
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowMore(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryLabel}>Visa färre inställningar</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: radius.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  sectionHint: { fontSize: 12, color: palette.secondaryText },
  primaryButton: {
    backgroundColor: palette.primary,
    paddingVertical: 12,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  primaryLabel: { color: palette.inverseText, fontWeight: '600' },
  secondaryButton: {
    paddingVertical: 10,
    borderRadius: radius.full,
    alignItems: 'center',
    backgroundColor: palette.surfaceTint,
  },
  secondaryLabel: { color: palette.primaryText, fontWeight: '600' },
  taskList: { gap: 12 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  taskLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  taskIcon: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  taskIconDone: {
    borderColor: palette.primary,
    backgroundColor: palette.primary,
  },
  taskText: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '600', color: palette.primaryText },
  taskDescription: { fontSize: 12, color: palette.secondaryText, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 12, color: palette.primaryText },
  chipTextActive: { color: palette.inverseText, fontWeight: '600' },
});
