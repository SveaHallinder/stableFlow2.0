import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/components/theme';
import { useAppData } from '@/context/AppDataContext';
import { radius } from '@/design/tokens';
import { roleLabels } from '@/lib/roleLabels';

const palette = theme.colors;

type StableSwitcherProps = {
  style?: StyleProp<ViewStyle>;
  variant?: 'block' | 'inline';
  showLocation?: boolean;
  showAccess?: boolean;
  disabled?: boolean;
};

export function StableSwitcher({
  style,
  variant = 'block',
  showLocation = true,
  showAccess = false,
  disabled = false,
}: StableSwitcherProps) {
  const { state, actions } = useAppData();
  const { stables, currentStableId, users, currentUserId } = state;
  const currentUser = users[currentUserId];
  const memberStableIds = currentUser?.membership?.map((entry) => entry.stableId) ?? [];
  const visibleStables = stables.filter((stable) => memberStableIds.includes(stable.id));
  const stablesToShow = visibleStables.length ? visibleStables : stables;
  if (stablesToShow.length === 0) {
    return null;
  }
  const currentStable =
    stablesToShow.find((stable) => stable.id === currentStableId) ??
    stables.find((stable) => stable.id === currentStableId);
  const membership = currentUser?.membership?.find((entry) => entry.stableId === currentStableId);
  const rolePillLabel =
    membership?.access === 'owner'
      ? 'Ägare'
      : membership?.customRole?.trim() || roleLabels[membership?.role ?? 'guest'];

  return (
    <View style={[styles.wrap, variant === 'inline' && styles.wrapInline, style]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Stall</Text>
        <ScrollView
          horizontal
          style={styles.chipScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {stablesToShow.map((stable) => {
            const active = stable.id === currentStableId;
            return (
              <TouchableOpacity
                key={stable.id}
                style={[styles.chip, active && styles.chipActive]}
                disabled={disabled}
                onPress={() => { if (!disabled) actions.setCurrentStable(stable.id); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Byt till ${stable.name}`}
                accessibilityState={{ selected: active, disabled }}
                aria-pressed={active}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {stable.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {showAccess ? (
          <View style={styles.accessPill}>
            <Text style={styles.accessPillText}>{rolePillLabel}</Text>
          </View>
        ) : null}
      </View>
      {showLocation && currentStable?.location ? (
        <Text style={styles.location}>{currentStable.location}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 4,
  },
  wrapInline: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    fontWeight: '400',
    color: palette.secondaryText,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  chipScroll: {
    flex: 1,
    minWidth: 0,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: 'transparent',
  },
  chipText: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    fontWeight: '400',
    color: palette.primaryText,
  },
  chipTextActive: {
    color: palette.primaryText,
    fontFamily: theme.fonts.medium,
  },
  location: {
    fontFamily: theme.fonts.regular,
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
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    fontWeight: '400',
    color: palette.secondaryText,
  },
});
