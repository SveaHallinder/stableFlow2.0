import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingShell } from '@/components/OnboardingShell';
import { Card } from '@/components/Primitives';
import { theme } from '@/components/theme';
import { radius } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { supabase } from '@/lib/supabase';

const palette = theme.colors;

type PendingInvite = {
  id: string;
  stableId: string;
  stableName?: string;
  role: string;
  customRole?: string | null;
  expiresAt?: string | null;
  createdAt: string;
};

function formatDate(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('sv-SE');
}

export default function JoinStableScreen() {
  const router = useRouter();
  const toast = useToast();
  const { actions, refreshing, state } = useAppData();

  const [code, setCode] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [pendingInvites, setPendingInvites] = React.useState<PendingInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = React.useState(false);
  const [invitesError, setInvitesError] = React.useState<string | null>(null);
  const [acceptingInvites, setAcceptingInvites] = React.useState(false);

  const loadInvites = React.useCallback(async () => {
    setLoadingInvites(true);
    setInvitesError(null);
    try {
      const userResult = await supabase.auth.getUser();
      const email = userResult.data.user?.email ?? '';
      if (!email) {
        setPendingInvites([]);
        return;
      }
      const { data, error: fetchError } = await supabase
        .from('stable_invites')
        .select('id, stable_id, role, custom_role, expires_at, created_at')
        .eq('email', email)
        .is('accepted_at', null);
      if (fetchError) {
        console.warn('Kunde inte hämta inbjudningar', fetchError);
        setInvitesError('Kunde inte hämta inbjudningar.');
        setPendingInvites([]);
        return;
      }
      const now = Date.now();
      const invites =
        data?.filter((row) => {
          if (!row.expires_at) return true;
          const ts = new Date(row.expires_at).getTime();
          return Number.isNaN(ts) ? true : ts > now;
        }) ?? [];

      const stableIds = Array.from(new Set(invites.map((row) => row.stable_id)));
      const stableNameById = new Map<string, string>();
      if (stableIds.length > 0) {
        const { data: stableRows, error: stableError } = await supabase
          .from('stables')
          .select('id, name')
          .in('id', stableIds);
        if (stableError) {
          console.warn('Kunde inte hämta stallnamn', stableError);
        } else {
          stableRows?.forEach((row) => stableNameById.set(row.id, row.name));
        }
      }

      setPendingInvites(
        invites.map((row) => ({
          id: row.id,
          stableId: row.stable_id,
          stableName: stableNameById.get(row.stable_id),
          role: row.role ?? 'rider',
          customRole: row.custom_role ?? null,
          expiresAt: row.expires_at ?? null,
          createdAt: row.created_at,
        })),
      );
    } finally {
      setLoadingInvites(false);
    }
  }, []);

  React.useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const resolveJoinedStableId = React.useCallback(
    async (beforeStableIds: Set<string>): Promise<string> => {
      let userId = state.currentUserId;
      if (!userId) {
        const userResult = await supabase.auth.getUser();
        userId = userResult.data.user?.id ?? '';
      }
      if (!userId) {
        return '';
      }
      const { data, error } = await supabase
        .from('stable_members')
        .select('stable_id, created_at')
        .eq('user_id', userId);
      if (error || !data?.length) {
        if (error) {
          console.warn('Kunde inte hämta medlemskap efter inbjudan', error);
        }
        return '';
      }
      const newStable = data.find((row) => !beforeStableIds.has(row.stable_id));
      if (newStable) {
        return newStable.stable_id;
      }
      const sorted = [...data].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
      return sorted[0]?.stable_id ?? '';
    },
    [state.currentUserId],
  );

  const handleJoin = React.useCallback(async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError('Ange en inbjudningskod.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await actions.joinStableByCode(trimmed);
    if (!result.success || !result.data?.stableId) {
      setError(result.success ? 'Kunde inte gå med i stallet.' : result.reason);
      setSubmitting(false);
      return;
    }
    const refreshResult = await actions.refreshData({ reason: 'join', stableId: result.data.stableId });
    if (!refreshResult.success) {
      setError(refreshResult.reason);
      setSubmitting(false);
      return;
    }
    toast.showToast('Du är nu medlem i stallet.', 'success');
    setSubmitting(false);
    router.replace('/(tabs)');
  }, [actions, code, router, toast]);

  const handleAcceptInvites = React.useCallback(async () => {
    if (!pendingInvites.length) {
      return;
    }
    setAcceptingInvites(true);
    setInvitesError(null);
    const previousStableIds = new Set(state.stables.map((stable) => stable.id));
    const result = await actions.acceptPendingInvites();
    if (!result.success) {
      setInvitesError(result.reason);
      setAcceptingInvites(false);
      await loadInvites();
      return;
    }
    const acceptedCount = result.data?.count ?? 0;
    const joinedStableId = await resolveJoinedStableId(previousStableIds);
    const refreshResult = await actions.refreshData({
      reason: 'join',
      stableId: joinedStableId || undefined,
    });
    if (!refreshResult.success) {
      setInvitesError(refreshResult.reason);
      setAcceptingInvites(false);
      await loadInvites();
      return;
    }
    const countLabel = acceptedCount === 1 ? 'inbjudan' : 'inbjudningar';
    toast.showToast(`Accepterade ${acceptedCount} ${countLabel}.`, 'success');
    setAcceptingInvites(false);
    router.replace('/(tabs)');
  }, [actions, loadInvites, pendingInvites.length, resolveJoinedStableId, router, state.stables, toast]);

  const isBusy = submitting || refreshing;
  const inviteButtonDisabled = acceptingInvites || refreshing;
  const hasPendingInvites = pendingInvites.length > 0;

  return (
    <OnboardingShell
      title="Gå med i stall"
      subtitle="Ange inbjudningskod eller acceptera en väntande inbjudan."
      step={1}
      total={1}
      showProgress={false}
    >
      <Card tone="muted" style={styles.card}>
        <Text style={styles.label}>Inbjudningskod</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Ex: ABC123"
          placeholderTextColor={palette.mutedText}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={24}
          style={styles.input}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.primaryButton, isBusy && styles.primaryButtonDisabled]}
          onPress={handleJoin}
          activeOpacity={0.9}
          disabled={isBusy}
        >
          {isBusy ? <ActivityIndicator color={palette.inverseText} /> : <Text style={styles.primaryButtonText}>Gå med</Text>}
        </TouchableOpacity>
      </Card>

      <Card tone="muted" style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.label}>Väntande inbjudningar</Text>
          <TouchableOpacity
            style={styles.inlineButton}
            onPress={loadInvites}
            activeOpacity={0.85}
            disabled={loadingInvites}
          >
            <Text style={styles.inlineButtonText}>Uppdatera</Text>
          </TouchableOpacity>
        </View>
        {invitesError ? <Text style={styles.errorText}>{invitesError}</Text> : null}
        {hasPendingInvites ? (
          <TouchableOpacity
            style={[styles.acceptAllButton, inviteButtonDisabled && styles.acceptAllButtonDisabled]}
            onPress={handleAcceptInvites}
            activeOpacity={0.9}
            disabled={inviteButtonDisabled}
          >
            {inviteButtonDisabled ? (
              <ActivityIndicator color={palette.inverseText} />
            ) : (
              <Text style={styles.acceptAllText}>Acceptera alla</Text>
            )}
          </TouchableOpacity>
        ) : null}
        {loadingInvites ? (
          <ActivityIndicator color={palette.primary} />
        ) : pendingInvites.length === 0 ? (
          <Text style={styles.helperText}>Inga väntande inbjudningar hittades.</Text>
        ) : (
          <View style={styles.inviteList}>
            {pendingInvites.map((invite) => {
              const roleLabel = invite.customRole?.trim() || invite.role;
              const expiresLabel = formatDate(invite.expiresAt);
              const stableLabel = invite.stableName?.trim() || 'Inbjudan till stall';
              return (
                <View key={invite.id} style={styles.inviteRow}>
                  <View style={styles.inviteInfo}>
                    <Text style={styles.inviteTitle}>{stableLabel}</Text>
                    <Text style={styles.inviteMeta}>Roll: {roleLabel}</Text>
                    {expiresLabel ? <Text style={styles.inviteMeta}>Gäller till {expiresLabel}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        {pendingInvites.length > 0 ? (
          <Text style={styles.helperText}>Accepterar alla väntande inbjudningar för din e-post.</Text>
        ) : null}
      </Card>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 12,
  },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: palette.secondaryText,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.primaryText,
  },
  primaryButton: {
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.inverseText,
  },
  errorText: {
    fontSize: 13,
    color: palette.error,
  },
  helperText: {
    fontSize: 13,
    color: palette.secondaryText,
  },
  acceptAllButton: {
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  acceptAllButtonDisabled: {
    opacity: 0.7,
  },
  acceptAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.inverseText,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inviteList: {
    gap: 12,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inviteInfo: {
    flex: 1,
    gap: 2,
  },
  inviteTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  inviteMeta: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  inlineButton: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: palette.surfaceTint,
  },
  inlineButtonDisabled: {
    opacity: 0.6,
  },
  inlineButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primary,
  },
});
