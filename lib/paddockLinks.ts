import type { Horse, Paddock } from '@/context/AppDataContext';

export function getPaddockHorses(paddock: Paddock, horses: readonly Horse[]): Horse[] {
  if (paddock.linksReady !== true || !Array.isArray(paddock.horseIds)) return [];
  const horseIds = new Set(paddock.horseIds);
  return horses.filter((horse) => horse.stableId === paddock.stableId && horseIds.has(horse.id));
}

export function getPaddockHorseNames(paddock: Paddock, horses: readonly Horse[]): string[] {
  if (paddock.linksReady !== true) {
    return Array.isArray(paddock.horseNames)
      ? paddock.horseNames.map((name) => typeof name === 'string' && name.trim() ? name : 'Tom äldre post')
      : [];
  }
  return getPaddockHorses(paddock, horses).map((horse) => horse.name);
}

export function getHorsePaddocks(horse: Horse, paddocks: readonly Paddock[]): Paddock[] {
  return paddocks.filter((paddock) =>
    paddock.stableId === horse.stableId && paddock.linksReady === true &&
    Array.isArray(paddock.horseIds) && paddock.horseIds.includes(horse.id),
  );
}

export function hasUnconfirmedPaddockLinks(
  paddocks: readonly Paddock[],
  horses: readonly Horse[],
): boolean {
  return paddocks.some((paddock) => {
    if (paddock.linksReady !== true || !Array.isArray(paddock.horseIds)) return true;
    const knownIds = new Set(getPaddockHorses(paddock, horses).map((horse) => horse.id));
    return paddock.horseIds.some((horseId) => !knownIds.has(horseId));
  });
}
