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
  const loginInstruction = confirmation.email
    ? `Logga in med ${confirmation.email}.`
    : 'Logga in med samma e-postadress som inbjudan skapades för.';
  const signupInstruction = 'Vid nytt konto: välj Skapa konto → Har inbjudan och använd samma e-postadress.';
  const codeInstruction = 'Den personliga koden kan användas när du skapar konto. I Gå med använder du en stallkod.';
  const instructions = [loginInstruction, signupInstruction, codeInstruction,
    ...confirmation.codes.map(({ stableId, code }) => `${state.stables.find(stable => stable.id === stableId)?.name ?? 'Stall'}: ${code}`),
  ].join('\n');
  return (
    <View style={styles.receipt} accessibilityLiveRegion="polite">
      <Text style={styles.title}>Inbjudan skapad</Text>
      <Text style={styles.description}>Mejlleverans är inte bekräftad. Dela koden och instruktionerna direkt med mottagaren.</Text>
      <Text selectable style={styles.description}>{loginInstruction}</Text>
      <Text selectable style={styles.description}>{signupInstruction}</Text>
      <Text selectable style={styles.description}>{codeInstruction}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Kopiera inbjudan med instruktioner"
        style={styles.copy} onPress={async () => {
          try {
            if (!(await Clipboard.setStringAsync(instructions))) throw new Error('Klippbordet bekräftade inte kopieringen.');
            toast.showToast('Inbjudan med instruktioner är kopierad.', 'success');
          }
          catch (error) { console.warn('[invite copy] Kunde inte kopiera instruktioner', error); toast.showToast('Instruktionerna kunde inte kopieras. Markera och kopiera dem manuellt.', 'error'); }
        }}>
        <Text style={styles.title}>Kopiera inbjudan med instruktioner</Text>
      </TouchableOpacity>
      {confirmation.codes.map(({ stableId, code }) => (
        <View key={stableId} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.description}>{state.stables.find(stable => stable.id === stableId)?.name ?? 'Stall'}</Text>
            <Text selectable style={styles.code}>{code}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Kopiera inbjudningskod ${code}`}
            style={styles.copy} onPress={async () => {
              try {
                if (!(await Clipboard.setStringAsync(code))) throw new Error('Klippbordet bekräftade inte kopieringen.');
                toast.showToast('Inbjudningskoden är kopierad.', 'success');
              }
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
