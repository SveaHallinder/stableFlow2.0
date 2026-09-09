import type {
  AppDataState,
  Horse,
  HorseResponsibility,
  StableMembership,
  UserProfile,
} from '@/context/AppDataContext';

export type HorseListFilter = 'all' | 'mine' | 'responsible';

function getMembershipForStable(user: UserProfile | undefined, stableId: string) {
  return user?.membership.find((entry) => entry.stableId === stableId);
}

function userHasHorseName(user: UserProfile | undefined, horse: Horse | undefined) {
  if (!user || !horse) {
    return false;
  }
  return user.horses.some((name) => name.trim().toLowerCase() === horse.name.trim().toLowerCase());
}

export function isHorseOwner(state: AppDataState, horseId: string, userId: string) {
  return state.horses.some((horse) => horse.id === horseId && horse.ownerUserId === userId);
}

export function isHorseResponsible(
  state: AppDataState,
  horseId: string,
  userId: string,
  membership?: StableMembership,
) {
  const horse = state.horses.find((item) => item.id === horseId);
  const user = state.users[userId];
  const stableMembership = membership ?? getMembershipForStable(user, horse?.stableId ?? '');

  return (
    state.horseResponsibilities.some((item) => item.horseId === horseId && item.userId === userId) ||
    Boolean(stableMembership?.horseIds?.includes(horseId)) ||
    userHasHorseName(user, horse)
  );
}

export function getHorseResponsibility(
  state: AppDataState,
  horseId: string,
  userId: string,
): HorseResponsibility | undefined {
  return state.horseResponsibilities.find(
    (item) => item.horseId === horseId && item.userId === userId,
  );
}

export function getResponsibleUsersForHorse(state: AppDataState, horseId: string) {
  const horse = state.horses.find((item) => item.id === horseId);
  if (!horse) {
    return [];
  }

  return Object.values(state.users).filter((user) => {
    if (user.id === horse.ownerUserId) {
      return false;
    }
    return isHorseResponsible(state, horseId, user.id);
  });
}

export function getVisibleHorsesForUser(
  state: AppDataState,
  stableId: string,
  userId: string,
  filter: HorseListFilter,
) {
  const horses = state.horses.filter((horse) => horse.stableId === stableId);
  const membership = getMembershipForStable(state.users[userId], stableId);

  if (filter === 'mine') {
    return horses.filter(
      (horse) =>
        isHorseOwner(state, horse.id, userId) ||
        isHorseResponsible(state, horse.id, userId, membership),
    );
  }

  if (filter === 'responsible') {
    return horses.filter((horse) => isHorseResponsible(state, horse.id, userId, membership));
  }

  return [...horses].sort((a, b) => {
    const aMine =
      isHorseOwner(state, a.id, userId) || isHorseResponsible(state, a.id, userId, membership);
    const bMine =
      isHorseOwner(state, b.id, userId) || isHorseResponsible(state, b.id, userId, membership);
    if (aMine !== bMine) {
      return aMine ? -1 : 1;
    }
    return a.name.localeCompare(b.name, 'sv-SE');
  });
}
