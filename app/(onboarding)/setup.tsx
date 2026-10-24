import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { resolveStableSettings, useAppData } from '@/context/AppDataContext';
import { useOnboarding } from '@/context/OnboardingContext';
import { getOwnerOnboardingStep, ONBOARDING_FINISH_ROUTE, OWNER_ONBOARDING_STEPS } from '@/lib/onboarding-flow';

const palette = theme.colors;

export default function OnboardingSetup() {
  const router = useRouter();
  const { state, actions, hydrating } = useAppData();
  const { mode, hasFarm } = useOnboarding();
  const { stables, currentStableId, horses, assignments } = state;
  const returnTo = '/(onboarding)/setup';
  const activeStable = stables.find(stable => stable.id === currentStableId) ?? stables[0];
  const stableSettings = resolveStableSettings(activeStable);
  const stableHorses = horses.filter(horse => horse.stableId === activeStable?.id);
  const stableAssignments = assignments.filter(assignment => assignment.stableId === activeStable?.id);
  const resourcesComplete = Boolean(stableSettings.onboarding?.resourcesComplete);
  const layoutConfirmed = resourcesComplete || Boolean(activeStable?.farmId) || (mode === 'guided' && !hasFarm);
  const currentStep = getOwnerOnboardingStep({
    layoutConfirmed,
    hasStable: Boolean(activeStable),
    resourcesComplete,
    hasHorse: stableHorses.length > 0,
    hasAssignment: stableAssignments.length > 0,
  });
  const [finishError, setFinishError] = React.useState<string | null>(null);
  const routes: Href[] = [
    { pathname: '/(onboarding)/layout', params: { returnTo } },
    { pathname: activeStable ? '/(onboarding)/arena' : '/(onboarding)/create-stable', params: { returnTo } },
    { pathname: '/(onboarding)/horses', params: { returnTo } },
    { pathname: '/calendar', params: { fromOnboarding: '1', returnTo } },
  ];
  const descriptions = [
    activeStable?.farmId ? 'Gård med flera stall' : layoutConfirmed ? 'Ett stall' : 'Ett stall eller en gård med flera stall?',
    resourcesComplete ? `${activeStable?.name} · resurser sparade` : activeStable ? `${activeStable.name} · bekräfta ridhus och volt` : 'Namn, plats och stallets resurser',
    stableHorses.length ? `${stableHorses.length} ${stableHorses.length === 1 ? 'häst tillagd' : 'hästar tillagda'}` : 'Lägg till din första häst',
    stableAssignments.length ? `${stableAssignments.length} ${stableAssignments.length === 1 ? 'pass skapat' : 'pass skapade'}` : 'Skapa ett pass och välj vem som tar det',
  ];
  const done = [layoutConfirmed, Boolean(activeStable) && resourcesComplete, stableHorses.length > 0, stableAssignments.length > 0];
  const nextLabels = ['Välj upplägg', activeStable ? 'Fyll i ditt stall' : 'Skapa ditt stall', 'Lägg till häst', 'Skapa första passet'];
  const nextDescriptions = [
    'Vi börjar med hur din verksamhet ser ut. Ditt redan skapade stall finns kvar.',
    'Bekräfta stallets plats och vilka resurser som finns. Även ett nej räknas som ett svar.',
    'Namn är det enda du måste fylla i. Födelseår och övriga uppgifter kan du lägga till när du vill.',
    'Ett första pass räcker för att komma igång. Återkommande pass och fördelning finns sedan under Schema.',
  ];
  const handleFinish = () => {
    const result = actions.setOnboardingDismissed(true);
    if (!result.success) { setFinishError(result.reason); return; }
    router.replace(ONBOARDING_FINISH_ROUTE);
  };

  return (
    <OnboardingShell
      title={currentStep === 4 ? 'Ditt stall är redo' : 'Välkommen till ditt stall'}
      subtitle={currentStep === 4 ? 'Nu har ni en gemensam plats för hästar, pass och vardagen i stallet.' : 'Fyra enkla steg. Dina sparade uppgifter finns kvar om du pausar.'}
      step={Math.min(currentStep + 1, 4)}
      total={4}
      allowExit
      onNext={currentStep === 4 ? handleFinish : () => router.push(routes[currentStep])}
      nextLabel={currentStep === 4 ? 'Öppna Idag' : nextLabels[currentStep]}
      disableNext={hydrating}
    >
      {stables.length > 1 ? (
        <View style={styles.stack}>
          <Text style={styles.label}>Du gör klart</Text>
          <View style={styles.chipRow}>
            {stables.map(stable => (
              <TouchableOpacity key={stable.id} accessibilityRole="button" accessibilityState={{ selected: stable.id === activeStable?.id }} onPress={() => actions.setCurrentStable(stable.id)} style={[styles.chip, stable.id === activeStable?.id && styles.chipActive]}>
                <Text style={styles.chipText}>{stable.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      {currentStep < 4 ? (
        <Card style={styles.nextCard}>
          <Text style={styles.eyebrow}>Ditt nästa steg</Text>
          <Text style={styles.nextTitle}>{OWNER_ONBOARDING_STEPS[currentStep]}</Text>
          <Text style={styles.description}>{nextDescriptions[currentStep]}</Text>
        </Card>
      ) : null}
      <View style={styles.steps}>
        {OWNER_ONBOARDING_STEPS.map((label, index) => (
          <TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={`${label}, ${done[index] ? 'klart' : 'återstår'}`} onPress={() => router.push(routes[index])} disabled={hydrating || (!activeStable && index > 1)} style={styles.taskRow}>
            <View style={[styles.taskIcon, index === currentStep && styles.taskIconCurrent]}>
              {done[index] ? <Feather name="check" size={17} color={palette.primaryText} /> : <Text style={styles.stepNumber}>{index + 1}</Text>}
            </View>
            <View style={styles.taskText}>
              <Text style={styles.taskTitle}>{label}</Text>
              <Text style={styles.description}>{descriptions[index]}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={palette.secondaryText} />
          </TouchableOpacity>
        ))}
      </View>
      {finishError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{finishError}</Text> : null}
      {activeStable ? <TouchableOpacity accessibilityRole="button" onPress={() => router.push({ pathname: '/(onboarding)/invite-members', params: { returnTo } })} style={styles.optionalAction}>
        <Feather name="users" size={18} color={palette.primaryText} />
        <View style={styles.taskText}><Text style={styles.taskTitle}>Bjud in när du är redo</Text><Text style={styles.description}>Valfritt. Du kan också göra det senare i Mitt stall.</Text></View>
        <Feather name="chevron-right" size={18} color={palette.secondaryText} />
      </TouchableOpacity> : null}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  label: { fontSize: 13, fontFamily: 'Inter-SemiBold', color: palette.primaryText },
  nextCard: { padding: 24, gap: 10, borderRadius: radius.lg },
  eyebrow: { fontSize: 12, fontFamily: 'Inter-Medium', color: palette.secondaryText },
  nextTitle: { fontSize: 24, fontFamily: 'Inter-SemiBold', color: palette.primaryText },
  description: { fontSize: 14, color: palette.secondaryText, lineHeight: 21 },
  steps: { gap: 2 },
  taskRow: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  taskIcon: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceMuted },
  taskIconCurrent: { borderWidth: 1, borderColor: palette.primaryText, backgroundColor: palette.surface },
  stepNumber: { fontSize: 14, fontFamily: 'Inter-SemiBold', color: palette.primaryText },
  taskText: { flex: 1, gap: 3 },
  taskTitle: { fontSize: 15, fontFamily: 'Inter-SemiBold', color: palette.primaryText },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: palette.border, borderRadius: radius.full, justifyContent: 'center' },
  chipActive: { borderColor: palette.primaryText, backgroundColor: palette.surfaceMuted },
  chipText: { fontSize: 14, color: palette.primaryText },
  optionalAction: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 18 },
});
