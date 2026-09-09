import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAppData, type InviteConfirmation } from '@/context/AppDataContext';
import { useToast } from './ToastProvider';
import { theme } from './theme';

export function InviteReceipt({ confirmation }: { confirmation: InviteConfirmation | null }) {
  const { state } = useAppData();
  const toast = useToast();
  if (!confirmation) return null;
  return (
    <View style={styles.receipt} accessibilityLiveRegion="polite">
      <Text style={styles.title}>Inbjudan skapad</Text>
      <Text style={styles.description}>Du kan dela koden direkt med mottagaren.</Text>
      {confirmation.codes.map(({ stableId, code }) => (
        <View key={stableId} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.description}>{state.stables.find(stable => stable.id === stableId)?.name ?? 'Stall'}</Text>
            <Text selectable style={styles.code}>{code}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Kopiera inbjudningskod ${code}`}
            style={styles.copy} onPress={async () => {
              try { await Clipboard.setStringAsync(code); toast.showToast('Inbjudningskoden är kopierad.', 'success'); }
              catch (error) { console.warn('[invite copy] Kunde inte kopiera kod', error); toast.showToast('Koden kunde inte kopieras. Markera och kopiera den manuellt.', 'error'); }
            }}>
            <Text style={styles.title}>Kopiera</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  receipt: { padding: 16, gap: 8, borderRadius: 16, backgroundColor: theme.colors.surfaceTint },
  title: { fontSize: 14, fontWeight: '600', color: theme.colors.primaryText },
  description: { fontSize: 14, lineHeight: 20, color: theme.colors.secondaryText },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  code: { fontSize: 18, fontWeight: '700', color: theme.colors.primaryText, letterSpacing: 1 },
  copy: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
});
