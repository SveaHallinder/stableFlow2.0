import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
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
import { radius } from '@/design/tokens';

const palette = theme.colors;

export default function AccountSettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { signOut, user } = useAuth();
  const { state, actions } = useAppData();
  const currentUser = state.users[state.currentUserId];
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
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
            <Text style={styles.sectionHint}>E-post ändras i inloggningskontot.</Text>
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
});
