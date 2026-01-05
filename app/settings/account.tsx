import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
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
  const { state } = useAppData();
  const currentUser = state.users[state.currentUserId];
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;

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
            <View style={styles.infoGrid}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Namn</Text>
                <Text style={styles.infoValue}>{currentUser?.name ?? 'Ej angivet'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>E-post</Text>
                <Text style={styles.infoValue}>{user?.email ?? 'Ej angiven'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Telefon</Text>
                <Text style={styles.infoValue}>{currentUser?.phone || 'Ej angiven'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Plats</Text>
                <Text style={styles.infoValue}>{currentUser?.location || 'Ej angiven'}</Text>
              </View>
            </View>
            <Text style={styles.sectionHint}>Redigering kommer i nästa steg.</Text>
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
  infoGrid: {
    gap: 10,
  },
  infoRow: {
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
