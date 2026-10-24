export const ONBOARDING_FINISH_ROUTE = '/(tabs)' as const;
export const OWNER_ONBOARDING_STEPS = ['Upplägg', 'Ditt stall', 'Hästar', 'Första passet'] as const;

type OwnerOnboardingProgress = {
  layoutConfirmed: boolean;
  hasStable: boolean;
  resourcesComplete: boolean;
  hasHorse: boolean;
  hasAssignment: boolean;
};

/** Saved content is the completion receipt; choosing a layout alone never finishes setup. */
export function getOwnerOnboardingStep(progress: OwnerOnboardingProgress): number {
  if (!progress.layoutConfirmed) return 0;
  if (!progress.hasStable || !progress.resourcesComplete) return 1;
  if (!progress.hasHorse) return 2;
  if (!progress.hasAssignment) return 3;
  return 4;
}

export function getOnboardingLayoutRoute(layout: 'single' | 'farm', hasStable: boolean) {
  if (layout === 'farm') return '/(onboarding)/farm' as const;
  return hasStable ? '/(onboarding)/arena' as const : '/(onboarding)/create-stable' as const;
}

export function getReusableOnboardingStables<T extends { id: string; farmId?: string }>(
  stables: T[],
  membership: { stableId: string; role: string; access?: string }[],
): T[] {
  const ownedIds = new Set(membership.filter(entry => entry.role === 'admin' && entry.access === 'owner').map(entry => entry.stableId));
  return stables.filter(stable => !stable.farmId && ownedIds.has(stable.id));
}

export function canOpenOwnerWorkspace(derived: { canManageOnboardingAny: boolean }) {
  return derived.canManageOnboardingAny;
}
