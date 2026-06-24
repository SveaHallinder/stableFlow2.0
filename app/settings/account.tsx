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
import { supabase } from '@/lib/supabase';
import { radius } from '@/design/tokens';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import { authRedirectUrl } from '@/lib/authRedirect';

const palette = theme.colors;

export default function AccountSettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { signOut, user } = useAuth();
  const { state, actions } = useAppData();
  const currentUser = state.users[state.currentUserId];
  const isDesktopWeb = useIsDesktopWeb();
  const [draft, setDraft] = React.useState({
    name: currentUser?.name ?? '',
    phone: currentUser?.phone ?? '',
    location: currentUser?.location ?? '',
  });

  React.useEffect(() => {
    setDraft({
      name: currentUser?.name ?? '',
      phone: currentUser?.phone ?? '',
      location: currentUser?.location ?? '',
    });
  }, [currentUser?.location, currentUser?.name, currentUser?.phone]);

  const isDirty = Boolean(
    currentUser &&
      (draft.name !== currentUser.name ||
        draft.phone !== (currentUser.phone ?? '') ||
        draft.location !== (currentUser.location ?? '')),
  );
  const canSave = Boolean(currentUser && draft.name.trim().length > 0 && isDirty);

  const handleLogout = React.useCallback(() => {
    signOut()
      .then(() => {
        toast.showToast('Du är utloggad.', 'success');
        router.replace('/(auth)');
      })
      .catch(() => {
        toast.showToast('Kunde inte logga ut.', 'error');
      });
  }, [router, signOut, toast]);

  const [security, setSecurity] = React.useState({
    newPassword: '',
    confirmPassword: '',
    newEmail: '',
  });
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [savingEmail, setSavingEmail] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const handleChangePassword = React.useCallback(async () => {
    if (savingPassword) {
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
    const { error } = await supabase.auth.updateUser({ password: security.newPassword });
    setSavingPassword(false);
    if (error) {
      toast.showToast('Kunde inte byta lösenord. Logga in igen och försök på nytt.', 'error');
      return;
    }
    setSecurity((prev) => ({ ...prev, newPassword: '', confirmPassword: '' }));
    toast.showToast('Lösenordet är uppdaterat.', 'success');
  }, [savingPassword, security.newPassword, security.confirmPassword, toast]);

  const handleChangeEmail = React.useCallback(async () => {
    if (savingEmail) {
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
    const { error } = await supabase.auth.updateUser(
      { email: nextEmail },
      { emailRedirectTo: authRedirectUrl('confirm') },
    );
    setSavingEmail(false);
    if (error) {
      toast.showToast('Kunde inte byta e-post. Försök igen.', 'error');
      return;
    }
    setSecurity((prev) => ({ ...prev, newEmail: '' }));
    toast.showToast('Bekräftelselänk skickad till den nya adressen.', 'success');
  }, [savingEmail, security.newEmail, user?.email, toast]);

  const handleDeleteAccount = React.useCallback(async () => {
    if (deleting) {
      return;
    }
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) {
      let reason = 'Kunde inte radera kontot. Försök igen.';
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const body = await ctx.json().catch(() => null);
        if (body?.error === 'sole_owner') {
          reason = 'Du är ensam ägare av ett stall med fler medlemmar. Överlåt ägarskapet först.';
        }
      }
      setDeleting(false);
      setConfirmingDelete(false);
      toast.showToast(reason, 'error');
      return;
    }
    toast.showToast('Ditt konto har raderats.', 'success');
    await signOut().catch(() => undefined);
    router.replace('/(auth)');
  }, [deleting, confirmingDelete, toast, signOut, router]);

  const handleSave = React.useCallback(() => {
    if (!currentUser) {
      return;
    }
    const result = actions.updateProfile({
      name: draft.name,
      phone: draft.phone,
      location: draft.location,
    });
    if (result.success) {
      toast.showToast('Uppgifter sparade.', 'success');
    } else {
      toast.showToast(result.reason, 'error');
    }
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
                onChangeText={(text) => setDraft((prev) => ({ ...prev, name: text }))}
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
                onChangeText={(text) => setDraft((prev) => ({ ...prev, phone: text }))}
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
                onChangeText={(text) => setDraft((prev) => ({ ...prev, location: text }))}
                style={styles.input}
              />
            </View>
            <TouchableOpacity
              style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
              onPress={handleSave}
              activeOpacity={0.85}
              disabled={!canSave}
            >
              <Text style={[styles.saveButtonText, !canSave && styles.saveButtonTextDisabled]}>
                Spara ändringar
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
              Permanent radering av ditt konto och dina personuppgifter (GDPR). Detta går
              inte att ångra. Är du ensam ägare av ett stall behöver du överlåta ägarskapet först.
            </Text>
            <TouchableOpacity
              style={[styles.dangerButton, deleting && styles.saveButtonDisabled]}
              onPress={handleDeleteAccount}
              activeOpacity={0.85}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel={confirmingDelete ? 'Bekräfta radering av konto' : 'Radera konto'}
            >
              <Text style={styles.dangerText}>
                {deleting
                  ? 'Raderar...'
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
