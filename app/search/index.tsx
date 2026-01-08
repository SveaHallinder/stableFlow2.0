import React from 'react';
import {
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
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, HeaderIconButton, SearchBar } from '@/components/Primitives';
import { DesktopNav } from '@/components/DesktopNav';
import { useAppData } from '@/context/AppDataContext';
import { radius } from '@/design/tokens';
import type { UserRole } from '@/context/AppDataContext';

const palette = theme.colors;
const MAX_RESULTS = 5;
type AccessLevel = 'view' | 'edit' | 'owner';

const accessRank: Record<AccessLevel, number> = {
  view: 0,
  edit: 1,
  owner: 2,
};

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

type MemberResult = {
  id: string;
  name: string;
  stableId: string;
  stableName: string;
  roleLabel: string;
};

type HorseResult = {
  id: string;
  name: string;
  stableId: string;
  stableName: string;
  ownerName?: string;
};

type PaddockResult = {
  id: string;
  name: string;
  stableId: string;
  stableName: string;
  horseCount: number;
};

type StableResult = {
  id: string;
  name: string;
  location?: string;
  farmName?: string;
};

type FarmResult = {
  id: string;
  name: string;
  location?: string;
};

type RideTypeResult = {
  id: string;
  label: string;
  code: string;
  stableId: string;
  stableName: string;
};

type AssignmentResult = {
  id: string;
  label: string;
  date: string;
  time: string;
  stableId: string;
  stableName: string;
};

type DayEventResult = {
  id: string;
  label: string;
  date: string;
  stableId: string;
  stableName: string;
};

type PostResult = {
  id: string;
  author: string;
  preview: string;
  stableId?: string;
  stableName?: string;
  timeAgo?: string;
};

type RideLogResult = {
  id: string;
  stableId: string;
  stableName: string;
  date: string;
  horseName: string;
  rideTypeLabel: string;
  length?: string;
  note?: string;
};

type ArenaBookingResult = {
  id: string;
  stableId: string;
  stableName: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose: string;
  note?: string;
};

type ArenaStatusResult = {
  id: string;
  stableId: string;
  stableName: string;
  date: string;
  label: string;
};

type AlertResult = {
  id: string;
  stableId: string;
  stableName: string;
  message: string;
  type: 'critical' | 'info';
  createdAt: string;
};

type MessageResult = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  timeAgo: string;
  stableId?: string;
  group?: boolean;
};

function formatShortDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
  });
}

function formatShortDateTime(isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

function ResultRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.resultRow} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.resultIcon}>{icon}</View>
      <View style={styles.resultBody}>
        <Text style={styles.resultTitle}>{title}</Text>
        {subtitle ? <Text style={styles.resultSubtitle}>{subtitle}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string | string[] }>();
  const { state, actions } = useAppData();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;

  const initialQuery = React.useMemo(() => (Array.isArray(q) ? q[0] : q) ?? '', [q]);
  const [query, setQuery] = React.useState(initialQuery);

  React.useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery);
    }
  }, [initialQuery, query]);

  const currentUser = state.users[state.currentUserId];
  const memberStableIds = React.useMemo(
    () => new Set(currentUser?.membership.map((entry) => entry.stableId) ?? []),
    [currentUser?.membership],
  );
  const membershipByStable = React.useMemo(
    () => new Map(currentUser?.membership.map((entry) => [entry.stableId, entry]) ?? []),
    [currentUser?.membership],
  );
  const stableAccessRankById = React.useMemo(() => {
    const map = new Map<string, number>();
    membershipByStable.forEach((membership, stableId) => {
      map.set(stableId, accessRank[membership.access ?? 'view']);
    });
    return map;
  }, [membershipByStable]);
  const hasStableAccess = React.useCallback(
    (stableId: string, minAccess: AccessLevel) => {
      const rank = stableAccessRankById.get(stableId);
      if (rank === undefined) {
        return false;
      }
      return rank >= accessRank[minAccess];
    },
    [stableAccessRankById],
  );
  const hasMembership = memberStableIds.size > 0;
  const stablesInScope = React.useMemo(
    () => state.stables.filter((stable) => memberStableIds.has(stable.id)),
    [memberStableIds, state.stables],
  );
  const farmIdsInScope = React.useMemo(() => {
    return new Set(
      stablesInScope
        .map((stable) => stable.farmId)
        .filter((farmId): farmId is string => Boolean(farmId)),
    );
  }, [stablesInScope]);
  const farmsInScope = React.useMemo(
    () => state.farms.filter((farm) => farmIdsInScope.has(farm.id)),
    [farmIdsInScope, state.farms],
  );
  const farmAccessRankById = React.useMemo(() => {
    const map = new Map<string, number>();
    stablesInScope.forEach((stable) => {
      if (!stable.farmId) {
        return;
      }
      const rank = stableAccessRankById.get(stable.id) ?? -1;
      const current = map.get(stable.farmId) ?? -1;
      if (rank > current) {
        map.set(stable.farmId, rank);
      }
    });
    return map;
  }, [stableAccessRankById, stablesInScope]);
  const hasFarmAccess = React.useCallback(
    (farmId: string, minAccess: AccessLevel) => {
      const rank = farmAccessRankById.get(farmId);
      if (rank === undefined) {
        return false;
      }
      return rank >= accessRank[minAccess];
    },
    [farmAccessRankById],
  );
  const stableNameById = React.useMemo(
    () =>
      state.stables.reduce<Record<string, string>>((acc, stable) => {
        acc[stable.id] = stable.name;
        return acc;
      }, {}),
    [state.stables],
  );
  const farmNameById = React.useMemo(
    () =>
      state.farms.reduce<Record<string, string>>((acc, farm) => {
        acc[farm.id] = farm.name;
        return acc;
      }, {}),
    [state.farms],
  );
  const userNameById = React.useMemo(
    () =>
      Object.values(state.users).reduce<Record<string, string>>((acc, user) => {
        acc[user.id] = user.name;
        return acc;
      }, {}),
    [state.users],
  );
  const horseNamesByUser = React.useMemo(() => {
    return state.horses.reduce<Record<string, string[]>>((acc, horse) => {
      if (horse.ownerUserId) {
        acc[horse.ownerUserId] = [...(acc[horse.ownerUserId] ?? []), horse.name];
      }
      return acc;
    }, {});
  }, [state.horses]);
  const horseNameById = React.useMemo(
    () =>
      state.horses.reduce<Record<string, string>>((acc, horse) => {
        acc[horse.id] = horse.name;
        return acc;
      }, {}),
    [state.horses],
  );
  const rideTypeById = React.useMemo(() => {
    const map = new Map<string, { label: string; code: string }>();
    stablesInScope.forEach((stable) => {
      (stable.rideTypes ?? []).forEach((rideType) => {
        map.set(rideType.id, { label: rideType.label, code: rideType.code });
      });
    });
    return map;
  }, [stablesInScope]);

  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const fallbackStableId = state.currentStableId || stablesInScope[0]?.id;

  const openStableRoute = React.useCallback(
    (stableId: string | undefined, route: string, params?: Record<string, string>) => {
      if (stableId) {
        actions.setCurrentStable(stableId);
      }
      const href = params ? ({ pathname: route, params } as Href) : (route as Href);
      router.push(href);
    },
    [actions, router],
  );

  const openRouteWithFallback = React.useCallback(
    (route: string, params?: Record<string, string>) => {
      if (fallbackStableId) {
        actions.setCurrentStable(fallbackStableId);
      }
      const href = params ? ({ pathname: route, params } as Href) : (route as Href);
      router.push(href);
    },
    [actions, fallbackStableId, router],
  );

  const memberResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as MemberResult[], total: 0 };
    }
    const items: MemberResult[] = [];
    Object.values(state.users).forEach((user) => {
      user.membership.forEach((membership) => {
        if (!memberStableIds.has(membership.stableId)) {
          return;
        }
        if (!hasStableAccess(membership.stableId, 'view')) {
          return;
        }
        const stableName = stableNameById[membership.stableId] ?? 'Stall';
        const roleLabel = membership.customRole?.trim() || roleLabels[membership.role];
        const searchText = [
          user.name,
          user.email,
          user.phone,
          stableName,
          roleLabel,
          ...(horseNamesByUser[user.id] ?? []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchText.includes(normalizedQuery)) {
          return;
        }

        items.push({
          id: user.id,
          name: user.name,
          stableId: membership.stableId,
          stableName,
          roleLabel,
        });
      });
    });

    items.sort((a, b) => a.name.localeCompare(b.name));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [
    hasQuery,
    horseNamesByUser,
    memberStableIds,
    normalizedQuery,
    stableNameById,
    state.users,
    hasStableAccess,
  ]);

  const horseResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as HorseResult[], total: 0 };
    }
    const items = state.horses
      .filter((horse) => memberStableIds.has(horse.stableId))
      .filter((horse) => hasStableAccess(horse.stableId, 'view'))
      .filter((horse) => {
        const ownerName = horse.ownerUserId ? userNameById[horse.ownerUserId] : '';
        const searchText = [horse.name, ownerName, stableNameById[horse.stableId]]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((horse) => ({
        id: horse.id,
        name: horse.name,
        stableId: horse.stableId,
        stableName: stableNameById[horse.stableId] ?? 'Stall',
        ownerName: horse.ownerUserId ? userNameById[horse.ownerUserId] : undefined,
      }));

    items.sort((a, b) => a.name.localeCompare(b.name));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [
    hasQuery,
    memberStableIds,
    normalizedQuery,
    stableNameById,
    state.horses,
    userNameById,
    hasStableAccess,
  ]);

  const paddockResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as PaddockResult[], total: 0 };
    }
    const items = state.paddocks
      .filter((paddock) => memberStableIds.has(paddock.stableId))
      .filter((paddock) => hasStableAccess(paddock.stableId, 'view'))
      .filter((paddock) => {
        const stableName = stableNameById[paddock.stableId];
        const searchText = [paddock.name, stableName, ...(paddock.horseNames ?? [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((paddock) => ({
        id: paddock.id,
        name: paddock.name,
        stableId: paddock.stableId,
        stableName: stableNameById[paddock.stableId] ?? 'Stall',
        horseCount: paddock.horseNames.length,
      }));

    items.sort((a, b) => a.name.localeCompare(b.name));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [
    hasQuery,
    memberStableIds,
    normalizedQuery,
    stableNameById,
    state.paddocks,
    hasStableAccess,
  ]);

  const stableResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as StableResult[], total: 0 };
    }
    const items = stablesInScope
      .filter((stable) => hasStableAccess(stable.id, 'edit'))
      .filter((stable) => {
        const farmName = stable.farmId ? farmNameById[stable.farmId] : '';
        const searchText = [stable.name, stable.location, stable.description, farmName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((stable) => ({
        id: stable.id,
        name: stable.name,
        location: stable.location,
        farmName: stable.farmId ? farmNameById[stable.farmId] : undefined,
      }));

    items.sort((a, b) => a.name.localeCompare(b.name));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [farmNameById, hasQuery, normalizedQuery, stablesInScope, hasStableAccess]);

  const farmResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as FarmResult[], total: 0 };
    }
    const items = farmsInScope
      .filter((farm) => hasFarmAccess(farm.id, 'edit'))
      .filter((farm) => {
        const searchText = [farm.name, farm.location].filter(Boolean).join(' ').toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((farm) => ({
        id: farm.id,
        name: farm.name,
        location: farm.location,
      }));

    items.sort((a, b) => a.name.localeCompare(b.name));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [farmsInScope, hasQuery, normalizedQuery, hasFarmAccess]);

  const rideTypeResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as RideTypeResult[], total: 0 };
    }
    const items: RideTypeResult[] = [];
    stablesInScope.forEach((stable) => {
      if (!hasStableAccess(stable.id, 'edit')) {
        return;
      }
      (stable.rideTypes ?? []).forEach((rideType) => {
        const searchText = [rideType.label, rideType.code, rideType.description, stable.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchText.includes(normalizedQuery)) {
          return;
        }
        items.push({
          id: rideType.id,
          label: rideType.label,
          code: rideType.code,
          stableId: stable.id,
          stableName: stable.name,
        });
      });
    });

    items.sort((a, b) => a.label.localeCompare(b.label));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [hasQuery, normalizedQuery, stablesInScope, hasStableAccess]);

  const assignmentResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as AssignmentResult[], total: 0 };
    }
    const items = state.assignments
      .filter((assignment) => memberStableIds.has(assignment.stableId))
      .filter((assignment) => hasStableAccess(assignment.stableId, 'view'))
      .filter((assignment) => {
        const stableName = stableNameById[assignment.stableId];
        const searchText = [
          assignment.label,
          assignment.note,
          assignment.date,
          assignment.time,
          stableName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((assignment) => ({
        id: assignment.id,
        label: assignment.label,
        date: assignment.date,
        time: assignment.time,
        stableId: assignment.stableId,
        stableName: stableNameById[assignment.stableId] ?? 'Stall',
      }));

    items.sort((a, b) => a.date.localeCompare(b.date));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [
    hasQuery,
    memberStableIds,
    normalizedQuery,
    stableNameById,
    state.assignments,
    hasStableAccess,
  ]);

  const dayEventResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as DayEventResult[], total: 0 };
    }
    const items = state.dayEvents
      .filter((event) => memberStableIds.has(event.stableId))
      .filter((event) => hasStableAccess(event.stableId, 'view'))
      .filter((event) => {
        const stableName = stableNameById[event.stableId];
        const searchText = [event.label, event.date, stableName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((event) => ({
        id: event.id,
        label: event.label,
        date: event.date,
        stableId: event.stableId,
        stableName: stableNameById[event.stableId] ?? 'Stall',
      }));

    items.sort((a, b) => a.date.localeCompare(b.date));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [
    hasQuery,
    memberStableIds,
    normalizedQuery,
    stableNameById,
    state.dayEvents,
    hasStableAccess,
  ]);

  const postResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as PostResult[], total: 0 };
    }
    const items = state.posts
      .filter((post) => {
        if (!post.stableId) {
          return hasMembership;
        }
        return hasStableAccess(post.stableId, 'view');
      })
      .filter((post) => {
        const stableName = post.stableId ? stableNameById[post.stableId] : '';
        const searchText = [post.content, post.author, stableName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((post) => {
        const preview = post.content?.trim() || post.author;
        return {
          id: post.id,
          author: post.author,
          preview,
          stableId: post.stableId,
          stableName: post.stableId ? stableNameById[post.stableId] : undefined,
          timeAgo: post.timeAgo,
        };
      });

    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [
    hasQuery,
    hasMembership,
    normalizedQuery,
    stableNameById,
    state.posts,
    hasStableAccess,
  ]);

  const rideLogResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as RideLogResult[], total: 0 };
    }
    const items = state.rideLogs
      .filter((log) => memberStableIds.has(log.stableId))
      .filter((log) => hasStableAccess(log.stableId, 'view'))
      .filter((log) => {
        const stableName = stableNameById[log.stableId];
        const horseName = horseNameById[log.horseId];
        const rideType = rideTypeById.get(log.rideTypeId);
        const rideLabel = rideType ? `${rideType.code} ${rideType.label}` : '';
        const createdBy = userNameById[log.createdByUserId];
        const searchText = [horseName, rideLabel, log.length, log.note, log.date, stableName, createdBy]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((log) => {
        const rideType = rideTypeById.get(log.rideTypeId);
        const rideTypeLabel = rideType ? `${rideType.code} · ${rideType.label}` : 'Okänd typ';
        return {
          id: log.id,
          stableId: log.stableId,
          stableName: stableNameById[log.stableId] ?? 'Stall',
          date: log.date,
          horseName: horseNameById[log.horseId] ?? 'Okänd häst',
          rideTypeLabel,
          length: log.length,
          note: log.note,
        };
      });

    items.sort((a, b) => b.date.localeCompare(a.date));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [
    hasQuery,
    memberStableIds,
    normalizedQuery,
    rideTypeById,
    horseNameById,
    stableNameById,
    state.rideLogs,
    userNameById,
    hasStableAccess,
  ]);

  const arenaBookingResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as ArenaBookingResult[], total: 0 };
    }
    const items = state.arenaBookings
      .filter((booking) => memberStableIds.has(booking.stableId))
      .filter((booking) => hasStableAccess(booking.stableId, 'view'))
      .filter((booking) => {
        const stableName = stableNameById[booking.stableId];
        const bookedBy = userNameById[booking.bookedByUserId];
        const searchText = [
          booking.purpose,
          booking.note,
          booking.date,
          booking.startTime,
          booking.endTime,
          stableName,
          bookedBy,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((booking) => ({
        id: booking.id,
        stableId: booking.stableId,
        stableName: stableNameById[booking.stableId] ?? 'Stall',
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        purpose: booking.purpose,
        note: booking.note,
      }));

    items.sort((a, b) => b.date.localeCompare(a.date));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [
    hasQuery,
    memberStableIds,
    normalizedQuery,
    stableNameById,
    state.arenaBookings,
    userNameById,
    hasStableAccess,
  ]);

  const arenaStatusResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as ArenaStatusResult[], total: 0 };
    }
    const items = state.arenaStatuses
      .filter((status) => memberStableIds.has(status.stableId))
      .filter((status) => hasStableAccess(status.stableId, 'view'))
      .filter((status) => {
        const stableName = stableNameById[status.stableId];
        const createdBy = userNameById[status.createdByUserId];
        const searchText = [status.label, status.date, stableName, createdBy]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((status) => ({
        id: status.id,
        stableId: status.stableId,
        stableName: stableNameById[status.stableId] ?? 'Stall',
        date: status.date,
        label: status.label,
      }));

    items.sort((a, b) => b.date.localeCompare(a.date));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [
    hasQuery,
    memberStableIds,
    normalizedQuery,
    stableNameById,
    state.arenaStatuses,
    userNameById,
    hasStableAccess,
  ]);

  const alertResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as AlertResult[], total: 0 };
    }
    const typeLabels: Record<AlertResult['type'], string> = {
      critical: 'Kritisk',
      info: 'Info',
    };
    const items = state.alerts
      .filter((alert) => memberStableIds.has(alert.stableId))
      .filter((alert) => hasStableAccess(alert.stableId, 'view'))
      .filter((alert) => {
        const stableName = stableNameById[alert.stableId];
        const searchText = [alert.message, typeLabels[alert.type], alert.createdAt, stableName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((alert) => ({
        id: alert.id,
        stableId: alert.stableId,
        stableName: stableNameById[alert.stableId] ?? 'Stall',
        message: alert.message,
        type: alert.type,
        createdAt: alert.createdAt,
      }));

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [
    hasQuery,
    memberStableIds,
    normalizedQuery,
    stableNameById,
    state.alerts,
    hasStableAccess,
  ]);

  const messageResults = React.useMemo(() => {
    if (!hasQuery) {
      return { items: [] as MessageResult[], total: 0 };
    }
    const items = state.messages
      .filter((message) => {
        if (message.stableId) {
          return hasStableAccess(message.stableId, 'view');
        }
        return hasMembership;
      })
      .filter((message) => {
        const searchText = [message.title, message.subtitle, message.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchText.includes(normalizedQuery);
      })
      .map((message) => ({
        id: message.id,
        title: message.title,
        subtitle: message.subtitle,
        description: message.description,
        timeAgo: message.timeAgo,
        stableId: message.stableId,
        group: message.group,
      }));

    return { items: items.slice(0, MAX_RESULTS), total: items.length };
  }, [hasMembership, hasQuery, normalizedQuery, state.messages, hasStableAccess]);

  const hasAnyResults =
    memberResults.total +
      horseResults.total +
      paddockResults.total +
      stableResults.total +
      farmResults.total +
      rideTypeResults.total +
      assignmentResults.total +
      dayEventResults.total +
      postResults.total +
      rideLogResults.total +
      arenaBookingResults.total +
      arenaStatusResults.total +
      alertResults.total +
      messageResults.total >
    0;

  const handleBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);

  const handleOpenMember = React.useCallback(
    (member: MemberResult) => {
      openStableRoute(member.stableId, '/members/[id]', {
        id: member.id,
        stableId: member.stableId,
      });
    },
    [openStableRoute],
  );

  const handleOpenMembers = React.useCallback(() => {
    if (!hasQuery) {
      openRouteWithFallback('/members');
      return;
    }
    openRouteWithFallback('/members', { q: query.trim() });
  }, [hasQuery, openRouteWithFallback, query]);

  const handleOpenHorse = React.useCallback(
    (horse: HorseResult) => {
      openStableRoute(horse.stableId, '/stables', { q: horse.name });
    },
    [openStableRoute],
  );

  const handleOpenHorses = React.useCallback(() => {
    if (!hasQuery) {
      openRouteWithFallback('/stables');
      return;
    }
    openRouteWithFallback('/stables', { q: query.trim() });
  }, [hasQuery, openRouteWithFallback, query]);

  const handleOpenPaddock = React.useCallback(
    (paddock: PaddockResult) => {
      openStableRoute(paddock.stableId, '/paddocks');
    },
    [openStableRoute],
  );

  const handleOpenPaddocks = React.useCallback(() => {
    openRouteWithFallback('/paddocks');
  }, [openRouteWithFallback]);

  const handleOpenStable = React.useCallback(
    (stable: StableResult) => {
      openStableRoute(stable.id, '/stables');
    },
    [openStableRoute],
  );

  const handleOpenStables = React.useCallback(() => {
    openRouteWithFallback('/stables');
  }, [openRouteWithFallback]);

  const handleOpenFarm = React.useCallback(
    (farm: FarmResult) => {
      const stableForFarm = stablesInScope.find((stable) => stable.farmId === farm.id);
      openStableRoute(stableForFarm?.id, '/stables');
    },
    [openStableRoute, stablesInScope],
  );

  const handleOpenFarms = React.useCallback(() => {
    openRouteWithFallback('/stables');
  }, [openRouteWithFallback]);

  const handleOpenRideType = React.useCallback(
    (rideType: RideTypeResult) => {
      openStableRoute(rideType.stableId, '/stables');
    },
    [openStableRoute],
  );

  const handleOpenRideTypes = React.useCallback(() => {
    openRouteWithFallback('/stables');
  }, [openRouteWithFallback]);

  const handleOpenAssignment = React.useCallback(
    (assignment: AssignmentResult) => {
      openStableRoute(assignment.stableId, '/calendar', { date: assignment.date });
    },
    [openStableRoute],
  );

  const handleOpenAssignments = React.useCallback(() => {
    openRouteWithFallback('/calendar');
  }, [openRouteWithFallback]);

  const handleOpenDayEvent = React.useCallback(
    (event: DayEventResult) => {
      openStableRoute(event.stableId, '/calendar', { date: event.date });
    },
    [openStableRoute],
  );

  const handleOpenDayEvents = React.useCallback(() => {
    openRouteWithFallback('/calendar');
  }, [openRouteWithFallback]);

  const handleOpenPost = React.useCallback(
    (post: PostResult) => {
      openStableRoute(post.stableId, '/feed');
    },
    [openStableRoute],
  );

  const handleOpenPosts = React.useCallback(() => {
    openRouteWithFallback('/feed');
  }, [openRouteWithFallback]);

  const handleOpenRideLog = React.useCallback(
    (log: RideLogResult) => {
      openStableRoute(log.stableId, '/calendar', { date: log.date, section: 'riding' });
    },
    [openStableRoute],
  );

  const handleOpenRideLogs = React.useCallback(() => {
    openRouteWithFallback('/calendar', { section: 'riding' });
  }, [openRouteWithFallback]);

  const handleOpenArenaBooking = React.useCallback(
    (booking: ArenaBookingResult) => {
      openStableRoute(booking.stableId, '/calendar', { date: booking.date, section: 'arena' });
    },
    [openStableRoute],
  );

  const handleOpenArenaBookings = React.useCallback(() => {
    openRouteWithFallback('/calendar', { section: 'arena' });
  }, [openRouteWithFallback]);

  const handleOpenArenaStatus = React.useCallback(
    (status: ArenaStatusResult) => {
      openStableRoute(status.stableId, '/calendar', { date: status.date, section: 'arena' });
    },
    [openStableRoute],
  );

  const handleOpenArenaStatuses = React.useCallback(() => {
    openRouteWithFallback('/calendar', { section: 'arena' });
  }, [openRouteWithFallback]);

  const handleOpenAlert = React.useCallback(
    (alert: AlertResult) => {
      openStableRoute(alert.stableId, '/');
    },
    [openStableRoute],
  );

  const handleOpenAlerts = React.useCallback(() => {
    openRouteWithFallback('/');
  }, [openRouteWithFallback]);

  const handleOpenMessage = React.useCallback(
    (message: MessageResult) => {
      if (message.stableId) {
        actions.setCurrentStable(message.stableId);
      }
      router.push({
        pathname: '/chat/[id]',
        params: { id: message.id, name: message.title },
      });
    },
    [actions, router],
  );

  const handleOpenMessages = React.useCallback(() => {
    openRouteWithFallback('/messages');
  }, [openRouteWithFallback]);

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

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        {wrapDesktop(
          <>
            <ScreenHeader
              title="Sök"
              showLogo={false}
              showSearch={false}
              left={
                <HeaderIconButton
                  accessibilityRole="button"
                  accessibilityLabel="Tillbaka"
                  onPress={handleBack}
                  style={styles.headerIconButton}
                >
                  <Text style={styles.headerIcon}>‹</Text>
                </HeaderIconButton>
              }
            />
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}
              showsVerticalScrollIndicator={false}
            >
              <SearchBar
                placeholder="Sök personer, hästar, pass, loggar..."
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                autoFocus
                style={styles.searchBar}
              />

              {!hasQuery ? (
                <>
                  {!hasMembership ? (
                    <Card tone="muted" style={styles.hintCard}>
                      <Text style={styles.hintTitle}>Inget stall ännu</Text>
                      <Text style={styles.hintText}>
                        Skapa ett stall eller bli inbjuden för att kunna söka i data.
                      </Text>
                    </Card>
                  ) : null}
                  <Card tone="muted" style={styles.hintCard}>
                    <Text style={styles.hintTitle}>Sök överallt</Text>
                    <Text style={styles.hintText}>
                      Vi söker i medlemmar, hästar, hagar, stall, gårdar, pass, ridlogg, ridhus, händelser, notiser, inlägg och meddelanden du har behörighet till.
                    </Text>
                  </Card>
                </>
              ) : !hasAnyResults ? (
                <Card tone="muted" style={styles.hintCard}>
                  <Text style={styles.hintTitle}>Inga träffar</Text>
                  <Text style={styles.hintText}>
                    Prova ett annat ord eller ett kortare sökord.
                  </Text>
                </Card>
              ) : (
                <>
                  {memberResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Medlemmar</Text>
                        <TouchableOpacity onPress={handleOpenMembers}>
                          <Text style={styles.sectionAction}>Visa alla</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {memberResults.items.map((member) => (
                          <ResultRow
                            key={`${member.id}-${member.stableId}`}
                            icon={<Feather name="user" size={16} color={palette.primary} />}
                            title={member.name}
                            subtitle={`${member.roleLabel} · ${member.stableName}`}
                            onPress={() => handleOpenMember(member)}
                          />
                        ))}
                      </View>
                    </Card>
                  ) : null}

                  {horseResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Hästar</Text>
                        <TouchableOpacity onPress={handleOpenHorses}>
                          <Text style={styles.sectionAction}>Visa alla</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {horseResults.items.map((horse) => (
                          <ResultRow
                            key={horse.id}
                            icon={<Feather name="heart" size={16} color={palette.primary} />}
                            title={horse.name}
                            subtitle={[horse.ownerName, horse.stableName].filter(Boolean).join(' · ')}
                            onPress={() => handleOpenHorse(horse)}
                          />
                        ))}
                      </View>
                    </Card>
                  ) : null}

                  {paddockResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Hagar</Text>
                        <TouchableOpacity onPress={handleOpenPaddocks}>
                          <Text style={styles.sectionAction}>Visa alla</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {paddockResults.items.map((paddock) => (
                          <ResultRow
                            key={paddock.id}
                            icon={<Feather name="map" size={16} color={palette.primary} />}
                            title={paddock.name}
                            subtitle={`${paddock.stableName} · ${paddock.horseCount} hästar`}
                            onPress={() => handleOpenPaddock(paddock)}
                          />
                        ))}
                      </View>
                    </Card>
                  ) : null}

                  {stableResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Stall</Text>
                        <TouchableOpacity onPress={handleOpenStables}>
                          <Text style={styles.sectionAction}>Visa alla</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {stableResults.items.map((stable) => (
                          <ResultRow
                            key={stable.id}
                            icon={<Feather name="home" size={16} color={palette.primary} />}
                            title={stable.name}
                            subtitle={[stable.farmName, stable.location].filter(Boolean).join(' · ')}
                            onPress={() => handleOpenStable(stable)}
                          />
                        ))}
                      </View>
                    </Card>
                  ) : null}

                  {farmResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Gårdar</Text>
                        <TouchableOpacity onPress={handleOpenFarms}>
                          <Text style={styles.sectionAction}>Visa alla</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {farmResults.items.map((farm) => (
                          <ResultRow
                            key={farm.id}
                            icon={<Feather name="map-pin" size={16} color={palette.primary} />}
                            title={farm.name}
                            subtitle={farm.location}
                            onPress={() => handleOpenFarm(farm)}
                          />
                        ))}
                      </View>
                    </Card>
                  ) : null}

                  {rideTypeResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Ridpass-typer</Text>
                        <TouchableOpacity onPress={handleOpenRideTypes}>
                          <Text style={styles.sectionAction}>Visa alla</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {rideTypeResults.items.map((rideType) => (
                          <ResultRow
                            key={`${rideType.id}-${rideType.stableId}`}
                            icon={<Feather name="bookmark" size={16} color={palette.primary} />}
                            title={rideType.label}
                            subtitle={`${rideType.code} · ${rideType.stableName}`}
                            onPress={() => handleOpenRideType(rideType)}
                          />
                        ))}
                      </View>
                    </Card>
                  ) : null}

                  {assignmentResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Pass</Text>
                        <TouchableOpacity onPress={handleOpenAssignments}>
                          <Text style={styles.sectionAction}>Öppna schema</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {assignmentResults.items.map((assignment) => (
                          <ResultRow
                            key={assignment.id}
                            icon={<Feather name="clock" size={16} color={palette.primary} />}
                            title={assignment.label}
                            subtitle={`${assignment.stableName} · ${formatShortDate(assignment.date)} · ${assignment.time}`}
                            onPress={() => handleOpenAssignment(assignment)}
                          />
                        ))}
                      </View>
                    </Card>
                  ) : null}

                  {dayEventResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Händelser</Text>
                        <TouchableOpacity onPress={handleOpenDayEvents}>
                          <Text style={styles.sectionAction}>Öppna schema</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {dayEventResults.items.map((event) => (
                          <ResultRow
                            key={event.id}
                            icon={<Feather name="alert-circle" size={16} color={palette.primary} />}
                            title={event.label}
                            subtitle={`${event.stableName} · ${formatShortDate(event.date)}`}
                            onPress={() => handleOpenDayEvent(event)}
                          />
                        ))}
                      </View>
                    </Card>
                  ) : null}

                  {rideLogResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Ridlogg</Text>
                        <TouchableOpacity onPress={handleOpenRideLogs}>
                          <Text style={styles.sectionAction}>Öppna schema</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {rideLogResults.items.map((log) => {
                          const subtitle = [
                            log.rideTypeLabel,
                            log.length,
                            formatShortDate(log.date),
                            log.stableName,
                          ]
                            .filter(Boolean)
                            .join(' · ');
                          return (
                            <ResultRow
                              key={log.id}
                              icon={<Feather name="activity" size={16} color={palette.primary} />}
                              title={log.horseName}
                              subtitle={subtitle}
                              onPress={() => handleOpenRideLog(log)}
                            />
                          );
                        })}
                      </View>
                    </Card>
                  ) : null}

                  {arenaBookingResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Ridhusbokningar</Text>
                        <TouchableOpacity onPress={handleOpenArenaBookings}>
                          <Text style={styles.sectionAction}>Öppna ridhus</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {arenaBookingResults.items.map((booking) => {
                          const timeRange =
                            booking.startTime && booking.endTime
                              ? `${booking.startTime}-${booking.endTime}`
                              : booking.startTime || booking.endTime;
                          const subtitle = [
                            booking.stableName,
                            formatShortDate(booking.date),
                            timeRange,
                          ]
                            .filter(Boolean)
                            .join(' · ');
                          return (
                            <ResultRow
                              key={booking.id}
                              icon={<Feather name="calendar" size={16} color={palette.primary} />}
                              title={booking.purpose}
                              subtitle={subtitle}
                              onPress={() => handleOpenArenaBooking(booking)}
                            />
                          );
                        })}
                      </View>
                    </Card>
                  ) : null}

                  {arenaStatusResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Ridhusstatus</Text>
                        <TouchableOpacity onPress={handleOpenArenaStatuses}>
                          <Text style={styles.sectionAction}>Öppna ridhus</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {arenaStatusResults.items.map((status) => (
                          <ResultRow
                            key={status.id}
                            icon={<Feather name="flag" size={16} color={palette.primary} />}
                            title={status.label}
                            subtitle={`${status.stableName} · ${formatShortDate(status.date)}`}
                            onPress={() => handleOpenArenaStatus(status)}
                          />
                        ))}
                      </View>
                    </Card>
                  ) : null}

                  {postResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Inlägg</Text>
                        <TouchableOpacity onPress={handleOpenPosts}>
                          <Text style={styles.sectionAction}>Öppna flöde</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {postResults.items.map((post) => (
                          <ResultRow
                            key={post.id}
                            icon={<Feather name="message-circle" size={16} color={palette.primary} />}
                            title={post.preview}
                            subtitle={[post.author, post.timeAgo, post.stableName].filter(Boolean).join(' · ')}
                            onPress={() => handleOpenPost(post)}
                          />
                        ))}
                      </View>
                    </Card>
                  ) : null}

                  {messageResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Meddelanden</Text>
                        <TouchableOpacity onPress={handleOpenMessages}>
                          <Text style={styles.sectionAction}>Öppna inkorg</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {messageResults.items.map((message) => {
                          const subtitle = [message.subtitle, message.timeAgo]
                            .filter(Boolean)
                            .join(' · ');
                          return (
                            <ResultRow
                              key={message.id}
                              icon={<Feather name="message-square" size={16} color={palette.primary} />}
                              title={message.title}
                              subtitle={subtitle}
                              onPress={() => handleOpenMessage(message)}
                            />
                          );
                        })}
                      </View>
                    </Card>
                  ) : null}

                  {alertResults.total ? (
                    <Card tone="muted" style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Notiser</Text>
                        <TouchableOpacity onPress={handleOpenAlerts}>
                          <Text style={styles.sectionAction}>Öppna överblick</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.resultList}>
                        {alertResults.items.map((alert) => {
                          const typeLabel = alert.type === 'critical' ? 'Kritisk' : 'Info';
                          const subtitle = [typeLabel, formatShortDateTime(alert.createdAt), alert.stableName]
                            .filter(Boolean)
                            .join(' · ');
                          return (
                            <ResultRow
                              key={alert.id}
                              icon={<Feather name="alert-triangle" size={16} color={palette.primary} />}
                              title={alert.message}
                              subtitle={subtitle}
                              onPress={() => handleOpenAlert(alert)}
                            />
                          );
                        })}
                      </View>
                    </Card>
                  ) : null}
                </>
              )}
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: palette.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
  contentDesktop: { paddingHorizontal: 0, maxWidth: 1120, width: '100%', alignSelf: 'flex-start' },
  searchBar: { marginTop: 4 },
  hintCard: { padding: 16, gap: 8 },
  hintTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  hintText: { fontSize: 13, color: palette.secondaryText, lineHeight: 18 },
  sectionCard: { padding: 16, gap: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  sectionAction: { fontSize: 13, fontWeight: '600', color: palette.primary },
  resultList: { gap: 10 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceTint,
  },
  resultBody: { flex: 1, gap: 2 },
  resultTitle: { fontSize: 14, fontWeight: '700', color: palette.primaryText },
  resultSubtitle: { fontSize: 12, color: palette.secondaryText },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  headerIcon: { fontSize: 18, color: palette.secondaryText },
  desktopShell: { flex: 1, flexDirection: 'row' },
  desktopSidebar: {
    width: 260,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: palette.border,
    backgroundColor: palette.surfaceTint,
  },
  desktopMain: { flex: 1, minWidth: 0 },
});
