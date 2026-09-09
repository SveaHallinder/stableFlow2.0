import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppData } from '@/context/AppDataContext';
import { isQaDemoMode } from '@/lib/qaDemo';
import { theme } from '@/components/theme';

const palette = theme.colors;

export function DataSyncStatus() {
  const { actions, hydrating, refreshing, refreshError, lastRefreshedAt } = useAppData();
  const [actionError, setActionError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setActionError(null);
  }, [lastRefreshedAt]);
  if (isQaDemoMode) return null;
  const busy = hydrating || refreshing;
  const time = lastRefreshedAt
    ? new Date(lastRefreshedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.caption}>
          {busy ? 'Hämtar senaste…' : time ? `Uppdaterat ${time} · varje minut` : 'Hämta senaste stalldata'}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Uppdatera stalldata"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          style={styles.button}
          onPress={async () => {
            setActionError(null);
            const result = await actions.refreshData();
            if (!result.success) setActionError(result.reason);
          }}
        >
          <Feather name="refresh-cw" size={16} color={palette.primary} />
          <Text style={styles.buttonText}>{busy ? 'Uppdaterar' : 'Uppdatera'}</Text>
        </TouchableOpacity>
      </View>
      {refreshError || actionError ? (
        <Text accessibilityRole="alert" style={styles.error}>{refreshError || actionError}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  caption: { flex: 1, fontSize: 12, color: palette.secondaryText },
  button: { minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', gap: 6, alignItems: 'center' },
  buttonText: { color: palette.primary, fontSize: 13, fontWeight: '600' },
  error: { color: palette.error, fontSize: 13, lineHeight: 19 },
});
