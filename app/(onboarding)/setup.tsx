import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { resolveStableSettings, useAppData } from '@/context/AppDataContext';

const palette = theme.colors;

type TaskRowProps = {
  title: string;
  description: string;
  done?: boolean;
};

function TaskRow({ title, description, done }: TaskRowProps) {
  return (
    <View style={styles.taskRow}>
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
    </View>
  );
}

export default function OnboardingSetup() {
  const router = useRouter();
  const { state, actions, derived } = useAppData();
  const { farms, stables, currentStableId, horses, users, assignments } = state;
  const returnTo = '/(onboarding)/setup';

  const fallbackStableId = currentStableId || stables[0]?.id || '';
  const [activeStableId, setActiveStableId] = React.useState(fallbackStableId);
  const activeStable = React.useMemo(
    () => stables.find((stable) => stable.id === activeStableId),
    [activeStableId, stables],
  );
  const stableSettings = React.useMemo(
    () => resolveStableSettings(activeStable),
    [activeStable],
  );

  React.useEffect(() => {
    if (!stables.length) {
      if (activeStableId) {
        setActiveStableId('');
      }
      return;
    }
    if (!activeStableId && fallbackStableId) {
      setActiveStableId(fallbackStableId);
    }
    if (activeStableId && !stables.some((stable) => stable.id === activeStableId)) {
      setActiveStableId(fallbackStableId);
    }
  }, [activeStableId, fallbackStableId, stables]);

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
  const stableAssignments = React.useMemo(
    () => assignments.filter((assignment) => assignment.stableId === activeStableId),
    [activeStableId, assignments],
  );
  const hasFarm = farms.length > 0;
  const hasStable = stables.length > 0;
  const hasHorse = stableHorses.length > 0;
  const hasAssignment = stableAssignments.length > 0;
  const resourcesComplete = Boolean(stableSettings.onboarding?.resourcesComplete);
  const layoutComplete = hasFarm || hasStable;
  const resourcesLabel = hasFarm ? 'Ridhus och volt på gården' : 'Ridhus och volt';

  const memberCount = React.useMemo(() => {
    const memberIds = new Set<string>();
    Object.values(users).forEach((user) => {
      if (user.membership.some((entry) => entry.stableId === activeStableId)) {
        memberIds.add(user.id);
      }
    });
    return memberIds.size;
  }, [activeStableId, users]);

  const exitRoute =
    derived.canManageOnboardingAny && Platform.OS === 'web' ? '/admin' : '/(tabs)';

  const handleFinish = React.useCallback(() => {
    actions.setOnboardingDismissed(true);
    router.replace(exitRoute);
  }, [actions, exitRoute, router]);

  const nextSectionTitle = derived.onboardingComplete ? 'Klar att börja' : 'Nästa steg';

  const primaryAction = React.useMemo(() => {
    if (!hasStable) {
      if (hasFarm) {
        return {
          label: 'Lägg till stall',
          onPress: () => router.push({ pathname: '/(onboarding)/farm', params: { returnTo } }),
        };
      }
      return {
        label: 'Välj upplägg',
        onPress: () => router.push({ pathname: '/(onboarding)/layout', params: { returnTo } }),
      };
    }
    if (!resourcesComplete) {
      return {
        label: 'Fyll i resurser',
        onPress: () => router.push({ pathname: '/(onboarding)/arena', params: { returnTo } }),
      };
    }
    if (!hasHorse) {
      return {
        label: 'Lägg till häst',
        onPress: () =>
          router.push({ pathname: '/(onboarding)/horses', params: { returnTo } }),
      };
    }
    if (!hasAssignment) {
      return {
        label: 'Skapa första pass',
        onPress: () =>
          router.push({
            pathname: '/calendar',
            params: { fromOnboarding: '1', returnTo },
          }),
      };
    }
    return { label: 'Gå till appen', onPress: handleFinish };
  }, [
    handleFinish,
    hasAssignment,
    hasFarm,
    hasHorse,
    hasStable,
    resourcesComplete,
    returnTo,
    router,
  ]);

  return (
    <OnboardingShell
      title="Kom igång"
      subtitle="Onboarding är klar när du har stall, resurser, en häst och ett pass."
      step={1}
      total={1}
      allowExit={false}
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
        <Text style={styles.sectionTitle}>Status</Text>
        <TaskRow
          title="Upplägg valt"
          description={layoutComplete ? 'Klart' : 'Välj upplägg'}
          done={layoutComplete}
        />
        <TaskRow
          title="Stall skapat"
          description={hasStable ? 'Klart' : 'Skapa stall'}
          done={hasStable}
        />
        <TaskRow
          title="Resurser"
          description={resourcesComplete ? 'Klart' : resourcesLabel}
          done={resourcesComplete}
        />
        <TaskRow
          title="Minst en häst"
          description={hasHorse ? `${stableHorses.length} hästar` : 'Lägg till häst'}
          done={hasHorse}
        />
        <TaskRow
          title="Första passet"
          description={hasAssignment ? `${stableAssignments.length} pass` : 'Skapa första pass'}
          done={hasAssignment}
        />
        <TaskRow
          title="Klar"
          description={derived.onboardingComplete ? 'Redo' : 'Ej klar'}
          done={derived.onboardingComplete}
        />
      </Card>

      <Card tone="muted" style={styles.card}>
        <Text style={styles.sectionTitle}>{nextSectionTitle}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={primaryAction.onPress} activeOpacity={0.9}>
          <Text style={styles.primaryLabel}>{primaryAction.label}</Text>
        </TouchableOpacity>
      </Card>

      {hasStable ? (
        <Card tone="muted" style={styles.card}>
          <Text style={styles.sectionTitle}>Valfritt</Text>
          <Text style={styles.sectionHint}>
            Bjud in fler när du vill. Detta påverkar inte onboarding.
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push({ pathname: '/(onboarding)/members', params: { returnTo } })}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryLabel}>Bjud in medlemmar</Text>
          </TouchableOpacity>
          <Text style={styles.sectionHint}>{memberCount} medlem(ar) kopplade till stallet.</Text>
        </Card>
      ) : null}
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
  primaryButtonDisabled: {
    opacity: 0.5,
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
