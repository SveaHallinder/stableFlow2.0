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
import { type AccountDeletionPlan, type AccountDeletionStatus, persistAccountDeletionPlan, readAccountDeletionPlan, readOwnAccountDeletionStatus, reserveAccountDeletionAttempt } from '@/lib/accountDeletionResume';

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
  const [deletionOwner, setDeletionOwner] = React.useState({ userId: user?.id, ownerId: '' });
  React.useEffect(() => {
    setDeletionOwner({ userId: user?.id, ownerId: '' });
    setConfirmingDelete(false);
  }, [user?.id]);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const deletingRef = React.useRef(false);
  const deletedAccountRef = React.useRef<string | null>(pendingAccountDeletionId === user?.id ? pendingAccountDeletionId : null);
  const [needsSessionCleanup, setNeedsSessionCleanup] = React.useState(Boolean(deletedAccountRef.current));
  const deletionPlanRef = React.useRef<AccountDeletionPlan | null>(null);
  const [deletionResume, setDeletionResume] = React.useState<{
    userId: string | undefined;
    status: 'loading' | 'ready' | 'pending' | 'unknown';
    plan: AccountDeletionPlan | null;
    receipt: AccountDeletionStatus | null;
  }>({ userId: user?.id, status: 'loading', plan: null, receipt: null });
  const replacementOwners = deletionResume.userId === user?.id
    ? deletionResume.receipt?.replacement_owners.map(candidate => ({ id: candidate.user_id, name: candidate.display_name })) ?? []
    : [];
  const selectedOwner = deletionOwner.userId === user?.id
    ? replacementOwners.find(candidate => candidate.id === deletionOwner.ownerId)
    : undefined;
  const requiresOwner = deletionResume.userId === user?.id && deletionResume.receipt?.requires_owner === true;
  const lockedPlan = deletionResume.userId === user?.id ? deletionResume.plan : null;
  const displayedOwnerId = lockedPlan ? lockedPlan.ownerId : selectedOwner?.id;
  const ownerChoiceLocked = deleting || Boolean(lockedPlan) || deletionResume.userId !== user?.id || deletionResume.status !== 'ready';
  const ownerSelectionBlocked = requiresOwner && ((!lockedPlan && replacementOwners.length === 0) || lockedPlan?.ownerId === null);

  const refreshDeletionReceipt = React.useCallback(async (account: { userId: string | undefined }, signal?: AbortSignal) => {
    if (!account.userId) throw new Error('Account deletion identity is unavailable.');
    let plan = await readAccountDeletionPlan(account.userId);
    if (signal?.aborted || securityAccountRef.current !== account) return null;
    deletionPlanRef.current = plan;
    const receipt = await readOwnAccountDeletionStatus(account.userId, signal);
    if (signal?.aborted || securityAccountRef.current !== account) return null;
    if (receipt.status === 'pending') {
      plan = await persistAccountDeletionPlan(account.userId, receipt.replacement_user_id);
      if (signal?.aborted || securityAccountRef.current !== account) return null;
      deletionPlanRef.current = plan;
    }
    if (receipt.status === 'deleted') {
      deletedAccountRef.current = account.userId;
      setNeedsSessionCleanup(true);
    }
    // Even not_started cannot cancel an earlier request that has not committed.
    setDeletionResume({ userId: account.userId, status: plan ? 'pending' : 'ready', plan, receipt });
    return receipt;
  }, []);

  const handleCheckDeletionStatus = React.useCallback(async () => {
    const account = securityAccountRef.current;
    if (!account.userId || account.userId !== user?.id || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([refreshDeletionReceipt(account, controller.signal), new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error('Account deletion status timed out.')); }, 15_000);
      })]);
    } catch (error) {
      console.warn('[account delete] Status kunde inte bekräftas', { name: error instanceof Error ? error.name : 'unknown' });
      if (securityAccountRef.current !== account) return;
      setDeletionResume(previous => ({ userId: account.userId, status: 'unknown', plan: deletionPlanRef.current, receipt: previous.userId === account.userId ? previous.receipt : null }));
      toast.showToast('Status kunde inte verifieras. Ägarvalet är låst och ingen session har rensats. Kontrollera igen.', 'error');
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (securityAccountRef.current === account) { deletingRef.current = false; setDeleting(false); }
    }
  }, [refreshDeletionReceipt, toast, user?.id]);

  React.useEffect(() => {
    const account = securityAccountRef.current;
    deletionPlanRef.current = null;
    deletingRef.current = false;
    setDeleting(false);
    setDeletionResume({ userId: user?.id, status: 'loading', plan: null, receipt: null });
    if (!account.userId) return;
    const controller = new AbortController();
    let expired = false;
    const timeout = setTimeout(() => {
      expired = true;
      controller.abort();
      if (securityAccountRef.current === account) setDeletionResume(previous => ({ userId: account.userId, status: 'unknown', plan: deletionPlanRef.current, receipt: previous.userId === account.userId ? previous.receipt : null }));
    }, 15_000);
    void refreshDeletionReceipt(account, controller.signal).catch(error => {
      console.warn('[account delete] Tidigare avslut kunde inte återläsas', { name: error instanceof Error ? error.name : 'unknown' });
      if (!expired && securityAccountRef.current === account) setDeletionResume(previous => ({ userId: account.userId, status: 'unknown', plan: deletionPlanRef.current, receipt: previous.userId === account.userId ? previous.receipt : null }));
    }).finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [refreshDeletionReceipt, user?.id]);


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
    const account = securityAccountRef.current;
    if (!account.userId || account.userId !== user?.id) return;
    if (!deletedAccountRef.current && !deletionPlanRef.current && requiresOwner && !selectedOwner) {
      toast.showToast('Välj en ny ägare som redan är ägare i alla dina stall. Ändra medlemsroller först om ingen kan väljas.', 'error');
      return;
    }
    if (!deletedAccountRef.current && (deletionResume.userId !== account.userId || !['ready', 'pending'].includes(deletionResume.status))) {
      toast.showToast('Kontrollera raderingsstatus innan ett nytt försök. Inget ägarval eller konto har ändrats.', 'error');
      return;
    }
    if (!deletedAccountRef.current && deletionPlanRef.current?.attempts === 3) {
      toast.showToast('Gränsen på tre raderingsförsök på denna enhet är nådd. Kontrollera status; inget nytt raderingsanrop skickas.', 'error');
      return;
    }
    if (!deletedAccountRef.current && !confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    deletingRef.current = true;
    setDeleting(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const unconfirmedMessage = 'Raderingen kunde inte bekräftas. Samma ägarval är låst. Kontrollera status innan du försöker igen; ett tidigare anrop kan fortfarande slutföras.';
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
        const previousPlan = deletionPlanRef.current;
        const chosenOwnerId = selectedOwner?.id ?? null;
        const receipt = await Promise.race([refreshDeletionReceipt(account, controller.signal), deadline]);
        if (securityAccountRef.current !== account || !receipt) return;
        if (receipt.status !== 'deleted') {
          let plan = deletionPlanRef.current;
          if (plan && ((!previousPlan && receipt.status === 'pending') || (previousPlan && previousPlan.ownerId !== plan.ownerId))) {
            toast.showToast('Ett tidigare avslut har återlästs med sitt låsta ägarval. Kontrollera valet och bekräfta samma avslut igen.', 'error');
            return;
          }
          if (!plan) {
            // Recheck the server scope before a new choice becomes immutable.
            if (receipt.requires_owner && chosenOwnerId === null) {
              toast.showToast('Välj en verifierad ny ägare för berörda stall och gårdar. Inget ägarval har sparats.', 'error');
              return;
            }
            if (chosenOwnerId !== null && !receipt.replacement_owners.some(candidate => candidate.user_id === chosenOwnerId)) {
              toast.showToast('Den valda personen är inte längre en aktiv ägare i alla berörda stall. Välj en verifierad ägare; inget ägarval har sparats.', 'error');
              return;
            }
            plan = await Promise.race([persistAccountDeletionPlan(account.userId, chosenOwnerId), deadline]);
            if (securityAccountRef.current !== account) return;
            deletionPlanRef.current = plan;
          }
          if (receipt.requires_owner && plan.ownerId === null) {
            toast.showToast('Ett äldre avslut saknar vald ny ägare, men överlåtelse krävs nu. Avslutet är stoppat för granskning; ägarvalet kan inte återställas medan ett äldre anrop kan slutföras.', 'error');
            return;
          }
          plan = await Promise.race([reserveAccountDeletionAttempt(plan), deadline]);
          if (securityAccountRef.current !== account) return;
          deletionPlanRef.current = plan;
          setDeletionResume({ userId: account.userId, status: 'pending', plan, receipt });
          const { data, error } = await Promise.race([
            supabase.functions.invoke('delete-account', {
              method: 'POST', signal: controller.signal, body: { expected_user_id: plan.userId, replacement_user_id: plan.ownerId },
            }), deadline,
          ]);
          if (securityAccountRef.current !== account) return;
          if (error) {
            let reason = unconfirmedMessage;
            const ctx = (error as { context?: { json?: () => Promise<{ error?: unknown }> } }).context;
            if (typeof ctx?.json === 'function') {
              const body = await Promise.race([ctx.json(), deadline]);
              if (securityAccountRef.current !== account) return;
              if (body?.error === 'sole_owner') {
                reason = 'Du är ensam ägare av ett stall. Utse en ny ägare först.';
              } else if (body?.error === 'owner_required') {
                reason = 'Välj en ny ägare för dina stall och gårdar innan kontot raderas.';
              } else if (body?.error === 'owner_invalid') {
                reason = 'Den låsta nya ägaren måste åter ha ett aktivt konto och vara ägare i alla berörda stall. Ägarvalet kan inte ändras medan ett äldre anrop kan slutföras.';
              } else if (body?.error === 'storage_blocked') {
                reason = 'Raderingen är stoppad eftersom dina filer behöver en säker raderings- eller överlåtelseplan. Kontot har inte raderats.';
              } else if (body?.error === 'deletion_in_progress') {
                reason = 'Ett avslut är redan förberett med en annan vald ägare. Kontrollera avslutet innan du ändrar ägarval.';
              } else if (body?.error === 'account_changed') {
                reason = changedAccountMessage;
              }
            }
            const refreshed = await Promise.race([refreshDeletionReceipt(account, controller.signal), deadline]);
            if (securityAccountRef.current !== account) return;
            if (refreshed?.status !== 'deleted') { toast.showToast(reason, 'error'); return; }
          } else if (data?.deleted !== true || data?.user_id !== account.userId) {
            toast.showToast(unconfirmedMessage, 'error');
            return;
          }
          deletedAccountRef.current = account.userId;
        }
      }
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = undefined;
      const cleanupDeadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Local account session cleanup timed out.')), 10_000);
      });
      if (deletedAccountRef.current !== account.userId) throw new Error('Account deletion receipt UID is unverified.');
      const cleared = await Promise.race([finishAccountDeletion(account.userId), cleanupDeadline]);
      if (securityAccountRef.current !== account) return;
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
      if (securityAccountRef.current !== account) return;
      setNeedsSessionCleanup(Boolean(deletedAccountRef.current));
      if (!deletedAccountRef.current) setDeletionResume(previous => ({ userId: account.userId, status: 'unknown', plan: deletionPlanRef.current, receipt: previous.userId === account.userId ? previous.receipt : null }));
      toast.showToast(deletedAccountRef.current ? cleanupMessage : unconfirmedMessage, 'error');
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (securityAccountRef.current === account) {
        deletingRef.current = false;
        setDeleting(false);
        setConfirmingDelete(false);
      }
    }
  }, [deleting, confirmingDelete, toast, finishAccountDeletion, user?.id, router, requiresOwner, selectedOwner, deletionResume, refreshDeletionReceipt]);

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
              Ditt inloggningskonto och din profil raderas permanent. Din egen text i flödesinlägg,
              kommentarer och chattar tas bort. Tomma inläggstrådar, andras svar och stallhistorik
              bevaras. Dina stall och gårdar överlåts till den nya ägare du väljer. Personen måste
              redan vara ägare i alla berörda stall. Raderingen går inte att ångra.
            </Text>
            <Text style={styles.sectionHint}>
              Filer behöver först en säker raderings- eller överlåtelseplan. Kontoradering med
              egna eller okänt tillskrivna filer är därför stoppad tills filhanteringen är klar.
            </Text>
            {!needsSessionCleanup ? (
              <View>
                <Text style={styles.sectionTitle}>Ny ägare för stall och gård</Text>
                {replacementOwners.length === 0 ? (
                  <Text accessibilityRole="alert" style={styles.sectionHint}>
                    {deletionResume.userId !== user?.id || !deletionResume.receipt || deletionResume.status === 'loading' || deletionResume.status === 'unknown'
                      ? deletionResume.status === 'unknown' ? 'Ägarscope är okänt. Kontrollera raderingsstatus.' : 'Ägarscope är ännu inte verifierat. Kontrollera raderingsstatus.'
                      : requiresOwner && deletionResume.receipt.affected_stable_count === 0
                      ? 'Gården saknar kopplat stall. En ny ägare kan inte verifieras i detta flöde. Kontoradering är stoppad tills överlåtelsen har granskats.'
                      : requiresOwner ? 'Ingen aktiv ny ägare kan väljas. Ge först en annan medlem ägarrollen i alla berörda stall och kontrollera status igen.'
                      : 'Ingen överlåtelse krävs enligt den senast verifierade statusen.'}
                  </Text>
                ) : replacementOwners.map(candidate => (
                  <TouchableOpacity
                    key={candidate.id}
                    disabled={ownerChoiceLocked}
                    onPress={() => { if (ownerChoiceLocked) return; setDeletionOwner({ userId: user?.id, ownerId: candidate.id }); setConfirmingDelete(false); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: displayedOwnerId === candidate.id, disabled: ownerChoiceLocked }}
                    aria-checked={displayedOwnerId === candidate.id}
                    aria-disabled={ownerChoiceLocked}
                    accessibilityLabel={`Välj ${candidate.name} som ny ägare`}
                  >
                    <Text style={styles.sectionHint}>{displayedOwnerId === candidate.id ? '✓ ' : '○ '}{candidate.name}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.sectionHint}>
                  {lockedPlan ? `Låst ny ägare: ${lockedPlan.ownerId ? replacementOwners.find(candidate => candidate.id === lockedPlan.ownerId)?.name ?? state.users[lockedPlan.ownerId]?.name ?? 'tidigare vald person' : 'ingen ny ägare vald'}. Valet ändras inte vid återförsök.` : selectedOwner ? `Vald ny ägare: ${selectedOwner.name}.` : requiresOwner ? 'Välj en verifierad aktiv ägare. Servern kontrollerar samma ägarval igen före radering.' : 'Servern kontrollerar ägarscope igen före första raderingsanropet.'}
                </Text>
              </View>
            ) : null}
            {!needsSessionCleanup ? (
              <View>
                <Text accessibilityRole="alert" style={styles.sectionHint}>
                  {deletionResume.status === 'loading' ? 'Kontrollerar tidigare radering...' :
                    deletionResume.status === 'unknown' ? 'Status är okänd. Ägarvalet är låst tills samma avslut kan verifieras. Ingen lokal session har rensats.' :
                    lockedPlan && ownerSelectionBlocked ? 'Det låsta avslutet saknar en ny ägare för berörda stall eller gårdar. Ingen ny begäran skickas; samma avslut måste granskas.' :
                    lockedPlan ? `Raderingsförsök: ${lockedPlan.attempts} av 3 på denna enhet. Andras innehåll bevaras. Ett tidigare anrop kan fortfarande slutföras.` :
                    'Inget tidigare avslut har verifierats. Ägarvalet sparas före första raderingsanropet.'}
                </Text>
                <TouchableOpacity onPress={handleCheckDeletionStatus} disabled={deleting} accessibilityRole="button" accessibilityLabel="Kontrollera raderingsstatus">
                  <Text style={styles.sectionHint}>Kontrollera raderingsstatus</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {needsSessionCleanup ? (
              <Text accessibilityRole="alert" style={styles.sectionHint}>
                Kontot har raderats. Den lokala sessionen behöver rensas. Försök igen med knappen nedan.
              </Text>
            ) : null}
            <TouchableOpacity
              style={[styles.dangerButton, (deleting || (!needsSessionCleanup && (deletionResume.status === 'loading' || deletionResume.status === 'unknown' || ownerSelectionBlocked || lockedPlan?.attempts === 3))) && styles.saveButtonDisabled]}
              onPress={handleDeleteAccount}
              activeOpacity={0.85}
              disabled={deleting || (!needsSessionCleanup && (deletionResume.status === 'loading' || deletionResume.status === 'unknown' || ownerSelectionBlocked || lockedPlan?.attempts === 3))}
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
            {confirmingDelete && !deleting && !lockedPlan ? (
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
