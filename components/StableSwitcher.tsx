import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/components/theme';
import { useAppData, type UserRole } from '@/context/AppDataContext';
import { radius } from '@/design/tokens';

const palette = theme.colors;

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  staff: 'Personal',
  rider: 'Ryttare',
  farrier: 'Hovslagare',
  vet: 'Veterinär',
  trainer: 'Tränare',
  therapist: 'Terapeut',
  guest: 'Gäst',
};

type StableSwitcherProps = {
  style?: StyleProp<ViewStyle>;
  variant?: 'block' | 'inline';
  showLocation?: boolean;
  showAccess?: boolean;
};

export function StableSwitcher({
  style,
  variant = 'block',
  showLocation = true,
  showAccess = false,
}: StableSwitcherProps) {
  const { state, actions } = useAppData();
  const { stables, currentStableId, users, currentUserId } = state;
  const currentUser = users[currentUserId];
  const memberStableIds = currentUser?.membership.map((entry) => entry.stableId) ?? [];
  const visibleStables = stables.filter((stable) => memberStableIds.includes(stable.id));
  const stablesToShow = visibleStables.length ? visibleStables : stables;
  if (stablesToShow.length === 0) {
    return null;
  }
  const currentStable =
    stablesToShow.find((stable) => stable.id === currentStableId) ??
    stables.find((stable) => stable.id === currentStableId);
  const membership = currentUser?.membership.find((entry) => entry.stableId === currentStableId);
  const rolePillLabel =
    membership?.access === 'owner'
      ? 'Ägare'
      : membership?.customRole?.trim() || roleLabels[membership?.role ?? 'guest'];

  return (
    <View style={[styles.wrap, variant === 'inline' && styles.wrapInline, style]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Stall</Text>
        {showAccess ? (
          <View style={styles.accessPill}>
            <Text style={styles.accessPillText}>{rolePillLabel}</Text>
          </View>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {stablesToShow.map((stable) => {
          const active = stable.id === currentStableId;
          return (
            <TouchableOpacity
              key={stable.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => actions.setCurrentStable(stable.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {stable.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {showLocation && currentStable?.location ? (
        <Text style={styles.location}>{currentStable.location}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 6,
  },
  wrapInline: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  chipActive: {
    backgroundColor: 'rgba(45,108,246,0.12)',
    borderColor: 'rgba(45,108,246,0.3)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  chipTextActive: {
    color: palette.primary,
  },
  location: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  accessPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  accessPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.secondaryText,
  },
});
