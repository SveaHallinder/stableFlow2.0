import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppData, type InviteConfirmation, type UserRole } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';
import { isQaDemoMode } from '@/lib/qaDemo';
import { roleLabels } from '@/lib/roleLabels';
import { demoStableInvites, fetchStableInvites, MAX_STABLE_INVITES, stableInviteStatus, type StableInviteListResult } from '@/lib/stableInvites';
import { Card } from './Primitives';
import { theme } from './theme';

type InviteScope = { authUserId: string | undefined; viewerId: string; stableId: string; canRead: boolean };
type ListState = { scope: InviteScope; status: 'loading' | 'ready' | 'error'; result?: StableInviteListResult };

function formatDate(value: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString('sv-SE') : 'Datum saknas';
}

export function StableInviteList({ confirmation }: { confirmation: InviteConfirmation | null }) {
  const { state } = useAppData();
  const { user, loading: authLoading, pendingAccountDeletionId } = useAuth();
  const stableId = state.currentStableId;
  const viewerId = state.currentUserId;
  const stable = state.stables.find((entry) => entry.id === stableId);
  const membership = state.users[viewerId]?.membership.find((entry) => entry.stableId === stableId);
  const canRead = Boolean(stable && !authLoading && !pendingAccountDeletionId && user?.id === viewerId
    && state.sessionUserId === viewerId && membership?.role === 'admin' && membership.access === 'owner');
  const authUserId = user?.id;
  const scope = React.useMemo(() => ({ authUserId, viewerId, stableId, canRead }), [authUserId, viewerId, stableId, canRead]);
  const refreshCode = confirmation?.codes.find((entry) => entry.stableId === stableId)?.code;
  const [attempt, setAttempt] = React.useState(0);
  const [list, setList] = React.useState<ListState>({ scope, status: 'loading' });

  React.useEffect(() => {
    if (!canRead) return;
    let active = true;
    const controller = new AbortController();
    setList({ scope, status: 'loading' });
    void (async () => {
      try {
        const result = isQaDemoMode ? demoStableInvites(stableId) : await fetchStableInvites(stableId, controller.signal);
        if (active) setList({ scope, status: 'ready', result });
      } catch {
        if (!active) return;
        console.warn('[stable invites] Kunde inte läsa inbjudningslistan.');
        setList({ scope, status: 'error' });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [canRead, scope, stableId, refreshCode, attempt]);

  const visibleList = list.scope === scope ? list : { scope, status: 'loading' as const };
  return (
    <Card tone="muted" style={styles.card} testID="stable-invite-list">
      <Text style={styles.title}>Inbjudningar</Text>
      {!stable ? <Text style={styles.hint}>Välj ett stall för att se inbjudningarna.</Text> : !canRead ? (
        <Text style={styles.hint}>Endast ägare i det valda stallet kan se inbjudningslistan.</Text>
      ) : (
        <>
          <Text style={styles.hint}>{stable.name} · Senaste inbjudningarna, högst {MAX_STABLE_INVITES}.</Text>
          <Text style={styles.hint}>Status visar om inbjudan väntar, har accepterats eller har gått ut. Mejlleverans är inte bekräftad.</Text>
          {isQaDemoMode ? <Text style={styles.hint}>Demo: syntetiska exempel. Nya demoinbjudningar visas i kvittensen ovan och sparas inte i den här listan.</Text> : null}
          {visibleList.status === 'loading' ? <Text accessibilityLiveRegion="polite" style={styles.hint}>Läser inbjudningar…</Text> : visibleList.status === 'error' ? (
            <>
              <Text accessibilityRole="alert" style={styles.error}>Inbjudningarna kunde inte läsas. Kontrollera anslutningen och försök igen.</Text>
              <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => setAttempt((value) => value + 1)}>
                <Text style={styles.buttonText}>Försök igen</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {!visibleList.result?.invites.length ? <Text style={styles.hint}>Inga inbjudningar i det här stallet ännu.</Text> : visibleList.result.invites.map((invite) => {
                const status = stableInviteStatus(invite);
                const dateLabel = status === 'Accepterad' ? `Accepterad ${formatDate(invite.accepted_at)}`
                  : invite.expires_at ? `${status === 'Utgången' ? 'Gick ut' : 'Giltig till'} ${formatDate(invite.expires_at)}` : 'Ingen sista giltighetsdag';
                return (
                  <View key={invite.id} style={styles.row} testID="stable-invite-row">
                    <Text selectable style={styles.recipient}>{invite.email}</Text>
                    <Text style={styles.hint}>{invite.custom_role || roleLabels[invite.role as UserRole] || 'Okänd roll'} · {status}</Text>
                    <Text style={styles.hint}>Skapad {formatDate(invite.created_at)} · {dateLabel}</Text>
                  </View>
                );
              })}
              {visibleList.result?.truncated ? <Text style={styles.hint}>Visar de {MAX_STABLE_INVITES} senaste inbjudningarna. Äldre inbjudningar visas inte här.</Text> : null}
              <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => setAttempt((value) => value + 1)}>
                <Text style={styles.buttonText}>Uppdatera inbjudningar</Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: theme.colors.primaryText },
  hint: { fontSize: 14, lineHeight: 20, color: theme.colors.secondaryText },
  recipient: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: theme.colors.primaryText, flexShrink: 1 },
  row: { paddingVertical: 12, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  error: { fontSize: 14, lineHeight: 20, color: theme.colors.error },
  button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', alignSelf: 'flex-start' },
  buttonText: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
});
