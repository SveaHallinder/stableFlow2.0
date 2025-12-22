import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { HeaderIconButton, Card } from '@/components/Primitives';
import { color, radius, space } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import type { Paddock, PaddockImage, UpsertPaddockInput } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { createPaddocksPrintHtml } from '@/lib/paddocksPrint';

const palette = theme.colors;

type PaddockDraft = {
  id?: string;
  name: string;
  horsesText: string;
  image: PaddockImage | null;
  season: NonNullable<Paddock['season']>;
};

const draftFromPaddock = (paddock?: Paddock): PaddockDraft => ({
  id: paddock?.id,
  name: paddock?.name ?? '',
  horsesText: paddock?.horseNames?.join('\n') ?? '',
  image: paddock?.image ?? null,
  season: paddock?.season ?? 'yearRound',
});

function parseHorseNames(input: string) {
  return input
    .split(/[\n,;]+/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function formatPaddockCaption(paddock: Paddock) {
  if (paddock.horseNames.length === 0) {
    return 'Inga hästar angivna';
  }
  if (paddock.horseNames.length <= 2) {
    return paddock.horseNames.join(', ');
  }
  return `${paddock.horseNames.slice(0, 2).join(', ')} +${paddock.horseNames.length - 2}`;
}

async function openPrintDialog(html: string) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') {
      return;
    }
    const win = window.open('', '_blank');
    if (!win) {
      throw new Error('Kunde inte öppna nytt fönster för utskrift.');
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 150);
    return;
  }

  const Print = await import('expo-print');
  await Print.printAsync({ html });
}

export default function PaddocksScreen() {
  const router = useRouter();
  const toast = useToast();
  const { state, actions } = useAppData();
  const paddocks = React.useMemo(
    () => state.paddocks.filter((paddock) => paddock.stableId === state.currentStableId),
    [state.paddocks, state.currentStableId],
  );

  const [modalState, setModalState] = React.useState<{ visible: boolean; paddockId?: string }>({
    visible: false,
  });
  const [draft, setDraft] = React.useState<PaddockDraft>(() => draftFromPaddock());

  const activePaddock = React.useMemo(
    () => paddocks.find((item) => item.id === modalState.paddockId),
    [modalState.paddockId, paddocks],
  );

  React.useEffect(() => {
    if (!modalState.visible) {
      return;
    }
    setDraft(draftFromPaddock(activePaddock));
  }, [modalState.visible, activePaddock]);

  const openCreate = React.useCallback(() => {
    setModalState({ visible: true });
  }, []);

  const openEdit = React.useCallback((paddockId: string) => {
    setModalState({ visible: true, paddockId });
  }, []);

  const closeModal = React.useCallback(() => {
    setModalState({ visible: false });
  }, []);

  const handleSave = React.useCallback(() => {
    const payload: UpsertPaddockInput = {
      id: draft.id,
      name: draft.name,
      horseNames: parseHorseNames(draft.horsesText),
      stableId: state.currentStableId,
      image: draft.image,
      season: draft.season,
    };

    const result = actions.upsertPaddock(payload);
    if (result.success) {
      toast.showToast(draft.id ? 'Hagen uppdaterades.' : 'Ny hage skapades.', 'success');
      closeModal();
    } else if (!result.success) {
      toast.showToast(result.reason, 'error');
    }
  }, [
    actions,
    closeModal,
    draft.horsesText,
    draft.id,
    draft.image,
    draft.name,
    state.currentStableId,
    toast,
  ]);

  const handleDelete = React.useCallback(() => {
    if (!draft.id) {
      return;
    }
    const result = actions.deletePaddock(draft.id);
    if (result.success) {
      toast.showToast('Hagen togs bort.', 'success');
      closeModal();
    } else if (!result.success) {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, closeModal, draft.id, toast]);

  const handlePrint = React.useCallback(async () => {
    if (paddocks.length === 0) {
      toast.showToast('Lägg till minst en hage innan du skriver ut.', 'info');
      return;
    }

    try {
      const html = createPaddocksPrintHtml(paddocks);
      await openPrintDialog(html);
    } catch (error) {
      toast.showToast(
        error instanceof Error ? error.message : 'Kunde inte starta utskrift.',
        'error',
      );
    }
  }, [paddocks, toast]);

  const requestMediaLibraryPermission = React.useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return permission.granted;
  }, []);

  const requestCameraPermission = React.useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    return permission.granted;
  }, []);

  const handlePickFromLibrary = React.useCallback(async () => {
    const granted = await requestMediaLibraryPermission();
    if (!granted) {
      toast.showToast('Ge appen tillgång till bilder för att välja en bild.', 'error');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    setDraft((prev) => ({
      ...prev,
      image: {
        uri: asset.uri,
        base64: asset.base64 ?? prev.image?.base64,
        mimeType: asset.mimeType ?? prev.image?.mimeType,
      },
    }));
  }, [requestMediaLibraryPermission, toast]);

  const handleTakePhoto = React.useCallback(async () => {
    const granted = await requestCameraPermission();
    if (!granted) {
      toast.showToast('Ge appen tillgång till kameran för att ta en bild.', 'error');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    setDraft((prev) => ({
      ...prev,
      image: {
        uri: asset.uri,
        base64: asset.base64 ?? prev.image?.base64,
        mimeType: asset.mimeType ?? prev.image?.mimeType,
      },
    }));
  }, [requestCameraPermission, toast]);

  const handleClearImage = React.useCallback(() => {
    setDraft((prev) => ({ ...prev, image: null }));
  }, []);

  const title = draft.id ? 'Redigera hage' : 'Ny hage';
  const canSave = draft.name.trim().length > 0;

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title="Hagar"
          style={styles.pageHeader}
          left={
            <HeaderIconButton
              accessibilityRole="button"
              accessibilityLabel="Tillbaka"
              onPress={() => router.back()}
              style={styles.headerIconButton}
            >
              <Text style={styles.headerIcon}>‹</Text>
            </HeaderIconButton>
          }
          right={
            <HeaderIconButton
              accessibilityRole="button"
              accessibilityLabel="Skriv ut haglista"
              onPress={handlePrint}
              style={styles.headerIconButton}
            >
              <Feather name="printer" size={18} color={palette.icon} />
            </HeaderIconButton>
          }
          showLogo={false}
          showSearch={false}
          subtitle="Hästar i hagar"
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Card tone="muted" style={styles.infoCard}>
            <Text style={styles.infoTitle}>Översikt</Text>
            <Text style={styles.infoText}>
              Lägg in vilka hästar som går i vilka hagar och koppla en bild (t.ex. hagkarta eller
              skylt) så kan du skriva ut en tydlig lista.
            </Text>
          </Card>

          <TouchableOpacity style={styles.addButton} onPress={openCreate} activeOpacity={0.9}>
            <Feather name="plus" size={16} color={palette.inverseText} />
            <Text style={styles.addButtonLabel}>Lägg till hage</Text>
          </TouchableOpacity>

          <View style={styles.list}>
            {paddocks.map((paddock) => (
              <TouchableOpacity
                key={paddock.id}
                activeOpacity={0.9}
                onPress={() => openEdit(paddock.id)}
              >
                <Card tone="muted" style={styles.paddockCard}>
                  <View style={styles.paddockRow}>
                    {paddock.image?.uri ? (
                      <Image
                        source={{ uri: paddock.image.uri }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.thumbnailPlaceholder}>
                        <Feather name="image" size={16} color={palette.mutedText} />
                      </View>
                    )}
                    <View style={styles.paddockContent}>
                      <View style={styles.paddockHeaderRow}>
                        <Text style={styles.paddockName}>{paddock.name}</Text>
                        <Text style={styles.paddockCount}>{paddock.horseNames.length}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        {paddock.season ? (
                          <View style={styles.seasonPill}>
                            <Text style={styles.seasonText}>
                              {paddock.season === 'summer'
                                ? 'Sommarhage'
                                : paddock.season === 'winter'
                                  ? 'Vinterhage'
                                  : 'Året runt'}
                            </Text>
                          </View>
                        ) : null}
                        <Text style={styles.paddockCaption}>{formatPaddockCaption(paddock)}</Text>
                      </View>
                    </View>
                    <Feather name="chevron-right" size={16} color={palette.mutedText} />
                  </View>
                </Card>
              </TouchableOpacity>
            ))}

            {paddocks.length === 0 ? (
              <Text style={styles.emptyText}>Inga hagar ännu. Skapa en ny hage för att börja.</Text>
            ) : null}
          </View>
        </ScrollView>

        <Modal visible={modalState.visible} animationType="slide" transparent onRequestClose={closeModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeModal} />
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>{title}</Text>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Namn</Text>
                <TextInput
                  value={draft.name}
                  onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
                  placeholder="Ex. Hage 3, Gräshage, Paddock vid ridhuset"
                  placeholderTextColor={palette.mutedText}
                  style={styles.textInput}
                  autoCorrect={false}
                />
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Hästar</Text>
                <TextInput
                  value={draft.horsesText}
                  onChangeText={(value) => setDraft((prev) => ({ ...prev, horsesText: value }))}
                  placeholder={'En häst per rad\nEx.\nCinder\nAtlas'}
                  placeholderTextColor={palette.mutedText}
                  style={[styles.textInput, styles.horsesInput]}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />
                <Text style={styles.formHint}>Tips: Du kan även separera med komma.</Text>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Säsong</Text>
                <View style={styles.chipRow}>
                  {([
                    { id: 'yearRound', label: 'Året runt' },
                    { id: 'summer', label: 'Sommar' },
                    { id: 'winter', label: 'Vinter' },
                  ] as const).map((option) => {
                    const active = draft.season === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setDraft((prev) => ({ ...prev, season: option.id }))}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Bild</Text>
                {draft.image?.uri ? (
                  <Image source={{ uri: draft.image.uri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewPlaceholder}>
                    <Feather name="image" size={18} color={palette.mutedText} />
                    <Text style={styles.previewPlaceholderText}>Ingen bild vald</Text>
                  </View>
                )}

                <View style={styles.imageActions}>
                  <TouchableOpacity
                    style={styles.imageButton}
                    onPress={handlePickFromLibrary}
                    activeOpacity={0.85}
                  >
                    <Feather name="upload" size={14} color={palette.primaryText} />
                    <Text style={styles.imageButtonLabel}>Välj bild</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.imageButton}
                    onPress={handleTakePhoto}
                    activeOpacity={0.85}
                  >
                    <Feather name="camera" size={14} color={palette.primaryText} />
                    <Text style={styles.imageButtonLabel}>Ta foto</Text>
                  </TouchableOpacity>
                  {draft.image ? (
                    <TouchableOpacity
                      style={styles.imageButtonDanger}
                      onPress={handleClearImage}
                      activeOpacity={0.85}
                    >
                      <Feather name="x" size={14} color={palette.error} />
                      <Text style={styles.imageButtonDangerLabel}>Ta bort</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {draft.id ? (
                <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.85}>
                  <Text style={styles.deleteButtonLabel}>Ta bort hage</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={closeModal} activeOpacity={0.85}>
                  <Text style={styles.secondaryButtonLabel}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, !canSave && styles.primaryButtonDisabled]}
                  onPress={handleSave}
                  disabled={!canSave}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryButtonLabel}>Spara</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
    backgroundColor: color.bg,
  },
  pageHeader: {
    marginBottom: 0,
  },
  headerIconButton: {
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.surfaceTint,
  },
  headerIcon: {
    fontSize: 22,
    color: palette.icon,
    marginTop: -1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
  },
  infoCard: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 0,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.primaryText,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.secondaryText,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.full,
    backgroundColor: palette.primary,
  },
  addButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.inverseText,
  },
  list: {
    gap: 10,
  },
  paddockCard: {
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  paddockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
  },
  thumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paddockContent: {
    flex: 1,
    gap: 4,
  },
  paddockHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  paddockName: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primaryText,
    flexShrink: 1,
  },
  paddockCount: {
    minWidth: 24,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    color: palette.primary,
  },
  seasonPill: {
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  seasonText: { fontSize: 11, fontWeight: '600', color: palette.secondaryText },
  paddockCaption: {
    fontSize: 13,
    color: palette.secondaryText,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 13,
    color: palette.secondaryText,
    paddingVertical: 18,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: color.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.primaryText,
  },
  formSection: {
    gap: 8,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  formHint: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  chipActive: {
    backgroundColor: 'rgba(45,108,246,0.1)',
    borderColor: 'rgba(45,108,246,0.26)',
  },
  chipLabel: { fontSize: 12, fontWeight: '600', color: palette.primaryText },
  chipLabelActive: { color: palette.primary },
  textInput: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(15,22,34,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: palette.primaryText,
    backgroundColor: palette.surfaceTint,
  },
  horsesInput: {
    minHeight: 110,
  },
  previewImage: {
    width: '100%',
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceMuted,
  },
  previewPlaceholder: {
    width: '100%',
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceTint,
    borderWidth: 1,
    borderColor: 'rgba(15,22,34,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  previewPlaceholderText: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  imageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  imageButtonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.primaryText,
  },
  imageButtonDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(249, 95, 95, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(249, 95, 95, 0.22)',
  },
  imageButtonDangerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.error,
  },
  deleteButton: {
    paddingVertical: 12,
  },
  deleteButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.error,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  secondaryButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.primary,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  primaryButtonDisabled: {
    backgroundColor: palette.surfaceTint,
    opacity: 0.7,
  },
  primaryButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.inverseText,
  },
});
