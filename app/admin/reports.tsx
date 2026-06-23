import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
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
import { DesktopNav } from '@/components/DesktopNav';
import { radius } from '@/design/tokens';
import { useAppData, type ContentReport } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';

const palette = theme.colors;

export default function ModerationReportsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { state, actions, derived } = useAppData();
  const isDesktopWeb = useIsDesktopWeb();
  const canManage = derived.canManageOnboardingAny;

  const [reports, setReports] = React.useState<ContentReport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await actions.fetchContentReports();
    if (result.success && result.data) {
      setReports(result.data);
    } else if (!result.success) {
      toast.showToast(result.reason, 'error');
    }
    setLoading(false);
  }, [actions, toast]);

  React.useEffect(() => {
    if (canManage) {
      void load();
    } else {
      setLoading(false);
    }
  }, [canManage, load]);

  const handleResolve = React.useCallback(
    async (reportId: string) => {
      setBusyId(reportId);
      const result = await actions.resolveContentReport(reportId);
      setBusyId(null);
      if (result.success) {
        toast.showToast('Rapporten är löst.', 'success');
        setReports((prev) => prev.filter((r) => r.id !== reportId));
      } else {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const handleRemovePost = React.useCallback(
    async (report: ContentReport) => {
      setBusyId(report.id);
      const del = await actions.deletePost(report.targetId);
      if (!del.success) {
        setBusyId(null);
        toast.showToast(del.reason ?? 'Kunde inte ta bort inlägget.', 'error');
        return;
      }
      await actions.resolveContentReport(report.id);
      setBusyId(null);
      toast.showToast('Inlägget togs bort och rapporten löstes.', 'success');
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    },
    [actions, toast],
  );

  const wrapDesktop = (content: React.ReactNode) => {
    if (!isDesktopWeb) {
      return content;
    }
    return (
      <View style={styles.desktopShell}>
        <View style={styles.desktopSidebar}>
          <DesktopNav variant="sidebar" />
        </View>
        <View style={styles.desktopMain}>{content}</View>
      </View>
    );
  };

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        {wrapDesktop(
          <>
            <ScreenHeader
              style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
              title="Rapporter"
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
          {!canManage ? (
            <Card tone="muted" style={styles.card}>
              <Text style={styles.emptyText}>Du saknar behörighet att se rapporter.</Text>
            </Card>
          ) : loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.emptyText}>Hämtar rapporter...</Text>
            </View>
          ) : reports.length === 0 ? (
            <Card tone="muted" style={styles.card}>
              <Text style={styles.emptyText}>Inga öppna rapporter. 🎉</Text>
            </Card>
          ) : (
            reports.map((report) => {
              const reporter = report.reporterUserId
                ? state.users[report.reporterUserId]?.name ?? 'Okänd'
                : 'Okänd';
              const date = new Date(report.createdAt).toLocaleDateString('sv-SE');
              const typeLabel = report.targetType === 'post' ? 'Inlägg' : 'Kommentar';
              const busy = busyId === report.id;
              return (
                <Card key={report.id} tone="muted" style={styles.card}>
                  <View style={styles.reportHeader}>
                    <Text style={styles.reportType}>{typeLabel}</Text>
                    <Text style={styles.reportMeta}>{date}</Text>
                  </View>
                  <Text style={styles.reportReason}>
                    {report.reason?.trim() ? report.reason : 'Ingen angiven anledning.'}
                  </Text>
                  <Text style={styles.reportMeta}>Rapporterad av {reporter}</Text>
                  <View style={styles.actionRow}>
                    {report.targetType === 'post' ? (
                      <TouchableOpacity
                        style={[styles.dangerButton, busy && styles.buttonDisabled]}
                        onPress={() => handleRemovePost(report)}
                        disabled={busy}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Ta bort inlägget"
                      >
                        <Text style={styles.dangerText}>Ta bort inlägg</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.resolveButton, busy && styles.buttonDisabled]}
                      onPress={() => handleResolve(report.id)}
                      disabled={busy}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel="Markera som löst"
                    >
                      <Text style={styles.resolveText}>{busy ? 'Jobbar...' : 'Lös'}</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })
          )}
            </ScrollView>
          </>,
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  desktopShell: { flex: 1, flexDirection: 'row' },
  desktopSidebar: { width: 280, paddingHorizontal: 24, paddingTop: 24 },
  desktopMain: { flex: 1, paddingRight: 24 },
  pageHeader: { marginBottom: 0 },
  pageHeaderDesktop: {
    maxWidth: 920,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  scrollContentDesktop: {
    maxWidth: 920,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
  },
  card: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: radius.lg,
    borderWidth: 0,
    backgroundColor: palette.surfaceTint,
    gap: 8,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reportType: { fontSize: 14, fontWeight: '700', color: palette.primaryText },
  reportReason: { fontSize: 14, color: palette.primaryText, lineHeight: 19 },
  reportMeta: { fontSize: 12, color: palette.secondaryText },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  resolveButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
  },
  resolveText: { fontSize: 13, fontWeight: '700', color: palette.inverseText },
  dangerButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.error,
  },
  dangerText: { fontSize: 13, fontWeight: '700', color: palette.error },
  buttonDisabled: { opacity: 0.6 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
  emptyText: { fontSize: 14, color: palette.secondaryText },
});
