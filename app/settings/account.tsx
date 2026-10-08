import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, HeaderIconButton } from '@/components/Primitives';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ToastProvider';
import { useAppData } from '@/context/AppDataContext';
import { PRIMARY_SESSION_MUTATION_UNSUPPORTED_MESSAGE, PrimarySessionMutationUnsupportedError, supabase, updateAccountSecurity } from '@/lib/supabase';
import { radius } from '@/design/tokens';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import { authRedirectUrl } from '@/lib/authRedirect';

const palette = theme.colors;

export default function AccountSettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { signOut, finishAccountDeletion, pendingAccountDeletionId, user } = useAuth();
  const { state, actions } = useAppData();
  const currentUser = state.users[state.currentUserId];
  const isDesktopWeb = useIsDesktopWeb();
  const [draft, setDraft] = React.useState({
    name: currentUser?.name ?? '',
    phone: currentUser?.phone ?? '',
    location: currentUser?.location ?? '',
  });
  const savingProfileRef = React.useRef(false);
  const dirtyProfileRef = React.useRef(new Set<'name' | 'phone' | 'location'>());
  const draftUserIdRef = React.useRef(currentUser?.id);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [profileError, setProfileError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (draftUserIdRef.current !== currentUser?.id) {
      draftUserIdRef.current = currentUser?.id;
      dirtyProfileRef.current.clear();
    }
    setDraft(previous => ({
      name: dirtyProfileRef.current.has('name') ? previous.name : currentUser?.name ?? '',
      phone: dirtyProfileRef.current.has('phone') ? previous.phone : currentUser?.phone ?? '',
      location: dirtyProfileRef.current.has('location') ? previous.location : currentUser?.location ?? '',
    }));
  }, [currentUser?.id, currentUser?.location, currentUser?.name, currentUser?.phone]);

  const isDirty = Boolean(
    currentUser &&
      (draft.name !== currentUser.name ||
        draft.phone !== (currentUser.phone ?? '') ||
        draft.location !== (currentUser.location ?? '')),
  );
  const canSave = Boolean(currentUser && draft.name.trim().length > 0 && isDirty && !savingProfile);

  const handleLogout = React.useCallback(() => {
    signOut()
      .then(() => {
        toast.showToast('Du är utloggad.', 'success');
        router.replace('/(auth)');
      })
      .catch((error) => {
        toast.showToast(error instanceof PrimarySessionMutationUnsupportedError
          ? PRIMARY_SESSION_MUTATION_UNSUPPORTED_MESSAGE : 'Kunde inte logga ut.', 'error');
      });
  }, [router, signOut, toast]);

  const [security, setSecurity] = React.useState({
    userId: user?.id,
    newPassword: '',
    confirmPassword: '',
    newEmail: '',
  });
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [savingEmail, setSavingEmail] = React.useState(false);
  const securityAccountRef = React.useRef({ userId: user?.id });
  if (securityAccountRef.current.userId !== user?.id) {
    securityAccountRef.current = { userId: user?.id };
  }
  React.useEffect(() => {
    const account = { userId: user?.id };
    securityAccountRef.current = account;
    setSecurity({ userId: user?.id, newPassword: '', confirmPassword: '', newEmail: '' });
    setSavingPassword(false);
    setSavingEmail(false);
    return () => {
      if (securityAccountRef.current === account) securityAccountRef.current = { userId: undefined };
    };
  }, [user?.id]);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const deletingRef = React.useRef(false);
  const deletedAccountRef = React.useRef<string | null>(pendingAccountDeletionId === user?.id ? pendingAccountDeletionId : null);
  const [needsSessionCleanup, setNeedsSessionCleanup] = React.useState(Boolean(deletedAccountRef.current));

  React.useEffect(() => {
    if (pendingAccountDeletionId && pendingAccountDeletionId === user?.id) {
      deletedAccountRef.current = pendingAccountDeletionId;
      setNeedsSessionCleanup(true);
    } else if (deletedAccountRef.current && deletedAccountRef.current !== user?.id) {
      deletedAccountRef.current = null;
      setNeedsSessionCleanup(false);
    }
  }, [pendingAccountDeletionId, user?.id]);

  const handleChangePassword = React.useCallback(async () => {
    const account = securityAccountRef.current;
    if (savingPassword || !account.userId || account.userId !== user?.id || security.userId !== account.userId) {
      return;
    }
    if (security.newPassword.length < 8) {
      toast.showToast('Lösenordet måste vara minst 8 tecken.', 'error');
      return;
    }
    if (security.newPassword !== security.confirmPassword) {
      toast.showToast('Lösenorden matchar inte.', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      await updateAccountSecurity(account.userId, { password: security.newPassword });
      if (securityAccountRef.current !== account) return;
      setSecurity((prev) => ({ ...prev, newPassword: '', confirmPassword: '' }));
      toast.showToast('Lösenordet är uppdaterat.', 'success');
    } catch (error) {
      console.warn('[account password] Lösenordsändringen kunde inte bekräftas', {
        name: error instanceof Error ? error.name : 'Unknown',
      });
      if (securityAccountRef.current !== account) return;
      toast.showToast('Kunde inte byta lösenord. Logga in igen och försök på nytt.', 'error');
    } finally {
      if (securityAccountRef.current === account) setSavingPassword(false);
    }
  }, [savingPassword, security.newPassword, security.confirmPassword, security.userId, toast, user?.id]);

  const handleChangeEmail = React.useCallback(async () => {
    const account = securityAccountRef.current;
    if (savingEmail || !account.userId || account.userId !== user?.id || security.userId !== account.userId) {
      return;
    }
    const nextEmail = security.newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      toast.showToast('Ange en giltig e-postadress.', 'error');
      return;
    }
    if (nextEmail.toLowerCase() === (user?.email ?? '').toLowerCase()) {
      toast.showToast('Det är redan din e-postadress.', 'error');
      return;
    }
    setSavingEmail(true);
    try {
      await updateAccountSecurity(
        account.userId,
        { email: nextEmail },
        { emailRedirectTo: authRedirectUrl('confirm') },
      );
      if (securityAccountRef.current !== account) return;
      setSecurity((prev) => ({ ...prev, newEmail: '' }));
      toast.showToast('Bekräftelselänk skickad till den nya adressen.', 'success');
    } catch (error) {
      console.warn('[account email] E-poständringen kunde inte bekräftas', {
        name: error instanceof Error ? error.name : 'Unknown',
      });
      if (securityAccountRef.current !== account) return;
      toast.showToast('Kunde inte byta e-post. Försök igen.', 'error');
    } finally {
      if (securityAccountRef.current === account) setSavingEmail(false);
    }
  }, [savingEmail, security.newEmail, security.userId, user?.email, user?.id, toast]);

  const handleDeleteAccount = React.useCallback(async () => {
    if (deletingRef.current || deleting) {
      return;
    }
    if (!deletedAccountRef.current && !confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    deletingRef.current = true;
    setDeleting(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const unconfirmedMessage = 'Raderingen kunde inte bekräftas. Kontrollera kontot innan du försöker igen.';
    const cleanupMessage = 'Kontot har raderats, men den lokala sessionen kunde inte rensas. Tryck på Rensa session och logga ut för att försöka igen.';
    const changedAccountMessage = 'Det inloggade kontot har ändrats. Ingen lokal session har rensats.';
    try {
      if (!deletedAccountRef.current) {
        if (!user?.id) throw new Error('The account could not be identified.');
        const controller = new AbortController();
        const deadline = new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error('Account deletion verification timed out.'));
          }, 15_000);
        });
        const { data, error } = await Promise.race([
          supabase.functions.invoke('delete-account', {
            method: 'POST', signal: controller.signal, body: { expected_user_id: user.id },
          }), deadline,
        ]);
        if (error) {
          let reason = unconfirmedMessage;
          const ctx = (error as { context?: { json?: () => Promise<{ error?: unknown }> } }).context;
          if (typeof ctx?.json === 'function') {
            const body = await Promise.race([ctx.json(), deadline]);
            if (body?.error === 'sole_owner') {
              reason = 'Du är ensam ägare av ett stall. Utse en ny ägare först.';
            } else if (body?.error === 'account_changed') {
              reason = changedAccountMessage;
            }
          }
          toast.showToast(reason, 'error');
          return;
        }
        if (data?.deleted !== true || data?.user_id !== user.id) {
          toast.showToast(unconfirmedMessage, 'error');
          return;
        }
        deletedAccountRef.current = user.id;
      }
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = undefined;
      const cleanupDeadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Local account session cleanup timed out.')), 10_000);
      });
      const cleared = await Promise.race([finishAccountDeletion(deletedAccountRef.current), cleanupDeadline]);
      if (cleared !== true) {
        deletedAccountRef.current = null;
        setNeedsSessionCleanup(false);
        toast.showToast(changedAccountMessage, 'error');
        return;
      }
      setNeedsSessionCleanup(false);
      toast.showToast('Ditt konto har raderats.', 'success');
      router.replace('/(auth)');
    } catch (error) {
      console.warn('[account delete] Avslutet kunde inte bekräftas', {
        stage: deletedAccountRef.current ? 'local session cleanup' : 'deletion verification',
        name: error instanceof Error ? error.name : 'unknown',
      });
      setNeedsSessionCleanup(Boolean(deletedAccountRef.current));
      toast.showToast(deletedAccountRef.current ? cleanupMessage : unconfirmedMessage, 'error');
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      deletingRef.current = false;
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }, [deleting, confirmingDelete, toast, finishAccountDeletion, user?.id, router]);

  const handleSave = React.useCallback(async () => {
    if (!currentUser || savingProfileRef.current) {
      return;
    }
    savingProfileRef.current = true;
    setSavingProfile(true);
    setProfileError(null);
    try {
      const result = await actions.updateProfile({
        ...(dirtyProfileRef.current.has('name') ? { name: draft.name } : {}),
        ...(dirtyProfileRef.current.has('phone') ? { phone: draft.phone } : {}),
        ...(dirtyProfileRef.current.has('location') ? { location: draft.location } : {}),
      });
      if (result.success && result.data) {
        dirtyProfileRef.current.clear();
        setDraft({ name: result.data.name, phone: result.data.phone ?? '', location: result.data.location ?? '' });
        toast.showToast('Uppgifter sparade.', 'success');
      } else if (!result.success) {
        setProfileError(result.reason);
        toast.showToast(result.reason, 'error');
      }
    } catch (error) {
      console.warn('[profile form] Kunde inte spara profil', error);
      setProfileError('Profilen kunde inte sparas. Dina uppgifter finns kvar. Försök igen.');
    } finally { savingProfileRef.current = false; setSavingProfile(false); }
  }, [actions, currentUser, draft.location, draft.name, draft.phone, toast]);

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
          title="Konto"
          showSearch={false}
          left={
            <HeaderIconButton accessibilityLabel="Tillbaka" onPress={() => router.back()}>
              <Feather name="chevron-left" size={18} color={palette.primaryText} />
            </HeaderIconButton>
          }
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, isDesktopWeb && styles.scrollContentDesktop]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Card tone="muted" style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Kontouppgifter</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.infoLabel}>Namn</Text>
              <TextInput
                placeholder="Ditt namn"
                placeholderTextColor={palette.mutedText}
                value={draft.name}
                editable={!savingProfile}
                onChangeText={(text) => { dirtyProfileRef.current.add('name'); setDraft((prev) => ({ ...prev, name: text })); }}
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.infoLabel}>E-post</Text>
              <Text style={styles.infoValue}>{user?.email ?? 'Ej angiven'}</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.infoLabel}>Telefon</Text>
              <TextInput
                placeholder="Telefon"
                placeholderTextColor={palette.mutedText}
                value={draft.phone}
                editable={!savingProfile}
                onChangeText={(text) => { dirtyProfileRef.current.add('phone'); setDraft((prev) => ({ ...prev, phone: text })); }}
                style={styles.input}
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.infoLabel}>Plats</Text>
              <TextInput
                placeholder="Plats"
                placeholderTextColor={palette.mutedText}
                value={draft.location}
                editable={!savingProfile}
                onChangeText={(text) => { dirtyProfileRef.current.add('location'); setDraft((prev) => ({ ...prev, location: text })); }}
                style={styles.input}
              />
            </View>
            {profileError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{profileError}</Text> : null}
            <TouchableOpacity
              style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
              onPress={handleSave}
              activeOpacity={0.85}
              disabled={!canSave}
            >
              <Text style={[styles.saveButtonText, !canSave && styles.saveButtonTextDisabled]}>
                {savingProfile ? 'Sparar profil…' : 'Spara ändringar'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.sectionHint}>E-post och lösenord ändras under Säkerhet nedan.</Text>
          </Card>

          <Card tone="muted" style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Säkerhet</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.infoLabel}>Nytt lösenord</Text>
              <TextInput
                placeholder="Minst 8 tecken"
                placeholderTextColor={palette.mutedText}
                value={security.newPassword}
                onChangeText={(text) => setSecurity((prev) => ({ ...prev, newPassword: text }))}
                style={styles.input}
                secureTextEntry
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.infoLabel}>Bekräfta nytt lösenord</Text>
              <TextInput
                placeholder="Upprepa lösenord"
                placeholderTextColor={palette.mutedText}
                value={security.confirmPassword}
                onChangeText={(text) => setSecurity((prev) => ({ ...prev, confirmPassword: text }))}
                style={styles.input}
                secureTextEntry
              />
            </View>
            <TouchableOpacity
              style={[
                styles.saveButton,
                (savingPassword || !security.newPassword || !security.confirmPassword) &&
                  styles.saveButtonDisabled,
              ]}
              onPress={handleChangePassword}
              activeOpacity={0.85}
              disabled={savingPassword || !security.newPassword || !security.confirmPassword}
              accessibilityRole="button"
              accessibilityLabel="Byt lösenord"
            >
              <Text
                style={[
                  styles.saveButtonText,
                  (savingPassword || !security.newPassword || !security.confirmPassword) &&
                    styles.saveButtonTextDisabled,
                ]}
              >
                {savingPassword ? 'Byter...' : 'Byt lösenord'}
              </Text>
            </TouchableOpacity>

            <View style={styles.field}>
              <Text style={styles.infoLabel}>Ny e-post</Text>
              <TextInput
                placeholder="ny@exempel.se"
                placeholderTextColor={palette.mutedText}
                value={security.newEmail}
                onChangeText={(text) => setSecurity((prev) => ({ ...prev, newEmail: text }))}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            <TouchableOpacity
              style={[styles.saveButton, (savingEmail || !security.newEmail) && styles.saveButtonDisabled]}
              onPress={handleChangeEmail}
              activeOpacity={0.85}
              disabled={savingEmail || !security.newEmail}
              accessibilityRole="button"
              accessibilityLabel="Byt e-post"
            >
              <Text
                style={[
                  styles.saveButtonText,
                  (savingEmail || !security.newEmail) && styles.saveButtonTextDisabled,
                ]}
              >
                {savingEmail ? 'Skickar...' : 'Byt e-post'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.sectionHint}>
              Vid e-postbyte skickas en bekräftelselänk till den nya adressen.
            </Text>
          </Card>

          <Card tone="muted" style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Session</Text>
            </View>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.85}
            >
              <Text style={styles.logoutText}>Logga ut</Text>
            </TouchableOpacity>
            <Text style={styles.sectionHint}>Du kommer tillbaka till inloggningen.</Text>
          </Card>

          <Card tone="muted" style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Radera konto</Text>
            </View>
            <Text style={styles.sectionHint}>
              Ditt inloggningskonto och din profil raderas permanent. Inlägg, meddelanden och
              stallhistorik kan finnas kvar. Raderingen går inte att ångra. Är du ensam ägare
              av ett stall behöver du utse en ny ägare först.
            </Text>
            {needsSessionCleanup ? (
              <Text accessibilityRole="alert" style={styles.sectionHint}>
                Kontot har raderats. Den lokala sessionen behöver rensas. Försök igen med knappen nedan.
              </Text>
            ) : null}
            <TouchableOpacity
              style={[styles.dangerButton, deleting && styles.saveButtonDisabled]}
              onPress={handleDeleteAccount}
              activeOpacity={0.85}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel={needsSessionCleanup ? 'Rensa session och logga ut' : confirmingDelete ? 'Bekräfta radering av konto' : 'Radera konto'}
            >
              <Text style={styles.dangerText}>
                {deleting
                  ? 'Raderar...'
                  : needsSessionCleanup
                    ? 'Rensa session och logga ut'
                    : confirmingDelete
                      ? 'Tryck igen för att bekräfta'
                      : 'Radera mitt konto'}
              </Text>
            </TouchableOpacity>
            {confirmingDelete && !deleting ? (
              <TouchableOpacity
                onPress={() => setConfirmingDelete(false)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Avbryt radering"
              >
                <Text style={styles.sectionHint}>Avbryt</Text>
              </TouchableOpacity>
            ) : null}
          </Card>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  pageHeader: {
    marginBottom: 0,
  },
  pageHeaderDesktop: {
    maxWidth: 920,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16,
  },
  scrollContentDesktop: {
    maxWidth: 920,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
  },
  card: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: radius.lg,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.primaryText,
  },
  sectionHint: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  field: {
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.primaryText,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.primaryText,
    backgroundColor: palette.surface,
  },
  saveButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
  },
  saveButtonDisabled: {
    backgroundColor: palette.border,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.inverseText,
  },
  saveButtonTextDisabled: {
    color: palette.mutedText,
  },
  logoutButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.error,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.error,
  },
  dangerButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.full,
    backgroundColor: palette.error,
  },
  dangerText: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.inverseText,
  },
});
