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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DesktopNav } from '@/components/DesktopNav';
import { HeaderIconButton, Card } from '@/components/Primitives';
import { StableSwitcher } from '@/components/StableSwitcher';
import { color, radius, space } from '@/design/tokens';
import { useAppData, resolveStableSettings } from '@/context/AppDataContext';
import type { Paddock, PaddockImage, UpsertPaddockInput } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { createPaddocksPrintHtml } from '@/lib/paddocksPrint';
import { toISODate } from '@/lib/schedule';

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
  const { state, actions, derived } = useAppData();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const stickyPanelStyle = isDesktopWeb ? ({ position: 'sticky', top: 20 } as any) : undefined;
  const { permissions } = derived;
  const canManagePaddocks = permissions.canManagePaddocks;
  const canUpdateHorseStatus = permissions.canUpdateHorseStatus;
  const [statusDate, setStatusDate] = React.useState(() => new Date());
  const statusIso = React.useMemo(() => toISODate(statusDate), [statusDate]);
  const statusLabel = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(statusDate);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) return 'Idag';
    if (diffDays === -1) return 'Igår';
    if (diffDays === 1) return 'Imorgon';
    return target.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
  }, [statusDate]);
  const paddocks = React.useMemo(
    () => state.paddocks.filter((paddock) => paddock.stableId === state.currentStableId),
    [state.paddocks, state.currentStableId],
  );
  const currentStable = React.useMemo(
    () => state.stables.find((stable) => stable.id === state.currentStableId),
    [state.stables, state.currentStableId],
  );
  const stableSettings = React.useMemo(() => resolveStableSettings(currentStable), [currentStable]);
  const isLoose = stableSettings.dayLogic === 'loose';
  const activeHorses = React.useMemo(
    () => state.horses.filter((horse) => horse.stableId === state.currentStableId),
    [state.horses, state.currentStableId],
  );
  const todayStatuses = React.useMemo(
    () =>
      state.horseDayStatuses.filter(
        (status) => status.stableId === state.currentStableId && status.date === statusIso,
      ),
    [state.horseDayStatuses, state.currentStableId, statusIso],
  );
  const statusByHorseId = React.useMemo(() => {
    const map = new Map<string, (typeof todayStatuses)[number]>();
    todayStatuses.forEach((status) => {
      map.set(status.horseId, status);
    });
    return map;
  }, [todayStatuses]);
  const paddockNameByHorse = React.useMemo(() => {
    const map = new Map<string, string>();
    paddocks.forEach((paddock) => {
      paddock.horseNames.forEach((name) => {
        map.set(name.toLowerCase(), paddock.name);
      });
    });
    return map;
  }, [paddocks]);
  const horsesByPaddock = React.useMemo(() => {
    const groups = new Map<string, typeof activeHorses>();
    activeHorses.forEach((horse) => {
      const paddockName = paddockNameByHorse.get(horse.name.toLowerCase()) ?? 'Ingen hage';
      const existing = groups.get(paddockName);
      if (existing) {
        existing.push(horse);
      } else {
        groups.set(paddockName, [horse]);
      }
    });
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'Ingen hage') return 1;
      if (b === 'Ingen hage') return -1;
      return a.localeCompare(b);
    });
  }, [activeHorses, paddockNameByHorse]);

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
    if (!canManagePaddocks) {
      toast.showToast('Behörighet saknas för att skapa hagar.', 'error');
      return;
    }
    setModalState({ visible: true });
  }, [canManagePaddocks, toast]);

  const openEdit = React.useCallback((paddockId: string) => {
    if (!canManagePaddocks) {
      toast.showToast('Behörighet saknas för att redigera hagar.', 'error');
      return;
    }
    setModalState({ visible: true, paddockId });
  }, [canManagePaddocks, toast]);

  const closeModal = React.useCallback(() => {
    setModalState({ visible: false });
  }, []);

  const handleSetInOutStatus = React.useCallback(
    (horseId: string, field: 'dayStatus' | 'nightStatus', value: 'in' | 'out') => {
      const current = statusByHorseId.get(horseId)?.[field];
      const nextValue = current === value ? undefined : value;
      const result = actions.updateHorseDayStatus({
        horseId,
        date: statusIso,
        updates: { [field]: nextValue },
      });
      if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, statusByHorseId, statusIso, toast],
  );

  const handleToggleLooseFlag = React.useCallback(
    (horseId: string, field: 'checked' | 'water' | 'hay') => {
      const current = statusByHorseId.get(horseId)?.[field] ?? false;
      const result = actions.updateHorseDayStatus({
        horseId,
        date: statusIso,
        updates: { [field]: !current },
      });
      if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, statusByHorseId, statusIso, toast],
  );

  const shiftStatusDate = React.useCallback((amount: number) => {
    setStatusDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + amount);
      return next;
    });
  }, []);

  const handleSave = React.useCallback(() => {
    if (!canManagePaddocks) {
      toast.showToast('Behörighet saknas för att spara hagar.', 'error');
      return;
    }
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
    canManagePaddocks,
    closeModal,
    draft.horsesText,
    draft.id,
    draft.image,
    draft.name,
    draft.season,
    state.currentStableId,
    toast,
  ]);

  const handleDelete = React.useCallback(() => {
    if (!canManagePaddocks) {
      toast.showToast('Behörighet saknas för att ta bort hagar.', 'error');
      return;
    }
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
  }, [actions, canManagePaddocks, closeModal, draft.id, toast]);

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
  const canSave = canManagePaddocks && draft.name.trim().length > 0;
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
  const handleBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const fallbackRoute = Platform.OS === 'web' ? '/admin' : '/(tabs)';
    router.replace(fallbackRoute);
  }, [router]);

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        {wrapDesktop(
          <>
            <ScreenHeader
              title="Hagar"
              style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
              left={
                <HeaderIconButton
                  accessibilityRole="button"
                  accessibilityLabel="Tillbaka"
                  onPress={handleBack}
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
            {!isDesktopWeb ? <StableSwitcher /> : null}

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                isDesktopWeb && styles.scrollContentDesktop,
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.desktopLayout, isDesktopWeb && styles.desktopLayoutDesktop]}>
                <View style={[styles.desktopPanel, isDesktopWeb && styles.desktopPanelDesktop, stickyPanelStyle]}>
                  <Card tone="muted" style={styles.infoCard}>
                    <Text style={styles.infoTitle}>Översikt</Text>
                    <Text style={styles.infoText}>
                      Lägg in vilka hästar som går i vilka hagar och koppla en bild (t.ex. hagkarta eller
                      skylt) så kan du skriva ut en tydlig lista.
                    </Text>
                  </Card>

                  {canManagePaddocks ? (
                    <TouchableOpacity style={styles.addButton} onPress={openCreate} activeOpacity={0.9}>
                      <Feather name="plus" size={16} color={palette.inverseText} />
                      <Text style={styles.addButtonLabel}>Lägg till hage</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={[styles.desktopList, isDesktopWeb && styles.desktopListDesktop]}>
                  <Card tone="muted" style={[styles.statusCard, isDesktopWeb && styles.statusCardDesktop]}>
                    <View style={styles.statusHeaderRow}>
                      <View>
                        <Text style={styles.statusTitle}>Hästar per dag</Text>
                        <Text style={styles.statusSubtitle}>
                          {isLoose ? 'Lösdrift · kollad + vatten/hö' : 'Boxhästar · inne/ute dag & natt'}
                        </Text>
                      </View>
                      <View style={styles.statusDateControl}>
                        <TouchableOpacity
                          style={styles.statusDateButton}
                          onPress={() => shiftStatusDate(-1)}
                          activeOpacity={0.85}
                        >
                          <Feather name="chevron-left" size={16} color={palette.secondaryText} />
                        </TouchableOpacity>
                        <View>
                          <Text style={styles.statusDateLabel}>{statusLabel}</Text>
                          <Text style={styles.statusDateMeta}>{statusIso}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.statusDateButton}
                          onPress={() => shiftStatusDate(1)}
                          activeOpacity={0.85}
                        >
                          <Feather name="chevron-right" size={16} color={palette.secondaryText} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {activeHorses.length === 0 ? (
                      <Text style={styles.emptyText}>Inga hästar registrerade i stallet.</Text>
                    ) : (
                      horsesByPaddock.map(([paddockName, group], index) => (
                        <View
                          key={paddockName}
                          style={[styles.statusGroup, index > 0 && styles.statusGroupDivider]}
                        >
                          <Text style={styles.statusGroupTitle}>{paddockName}</Text>
                          {group.map((horse) => {
                            const status = statusByHorseId.get(horse.id);
                            return (
                              <View key={horse.id} style={styles.statusHorseRow}>
                                <Text style={styles.statusHorseName}>{horse.name}</Text>
                                {isLoose ? (
                                  <View style={styles.statusToggleGroup}>
                                    {([
                                      { id: 'checked', label: 'Kollad' },
                                      { id: 'water', label: 'Vatten' },
                                      { id: 'hay', label: 'Hö' },
                                    ] as const).map((option) => {
                                      const active = status?.[option.id];
                                      return (
                                        <TouchableOpacity
                                          key={option.id}
                                          style={[
                                            styles.statusChip,
                                            active && styles.statusChipActive,
                                            !canUpdateHorseStatus && styles.statusChipDisabled,
                                          ]}
                                          onPress={() =>
                                            canUpdateHorseStatus && handleToggleLooseFlag(horse.id, option.id)
                                          }
                                          activeOpacity={0.85}
                                          disabled={!canUpdateHorseStatus}
                                        >
                                          <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                                            {option.label}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                ) : (
                                  <View style={styles.statusToggleGroup}>
                                    <View style={styles.statusToggleBlock}>
                                      <Text style={styles.statusToggleLabel}>Dag</Text>
                                      <View style={styles.statusToggleRow}>
                                        {(['in', 'out'] as const).map((value) => {
                                          const active = status?.dayStatus === value;
                                          return (
                                            <TouchableOpacity
                                              key={`day-${value}`}
                                              style={[
                                                styles.statusChip,
                                                active && styles.statusChipActive,
                                                !canUpdateHorseStatus && styles.statusChipDisabled,
                                              ]}
                                              onPress={() =>
                                                canUpdateHorseStatus &&
                                                handleSetInOutStatus(horse.id, 'dayStatus', value)
                                              }
                                              activeOpacity={0.85}
                                              disabled={!canUpdateHorseStatus}
                                            >
                                              <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                                                {value === 'in' ? 'Inne' : 'Ute'}
                                              </Text>
                                            </TouchableOpacity>
                                          );
                                        })}
                                      </View>
                                    </View>
                                    <View style={styles.statusToggleBlock}>
                                      <Text style={styles.statusToggleLabel}>Natt</Text>
                                      <View style={styles.statusToggleRow}>
                                        {(['in', 'out'] as const).map((value) => {
                                          const active = status?.nightStatus === value;
                                          return (
                                            <TouchableOpacity
                                              key={`night-${value}`}
                                              style={[
                                                styles.statusChip,
                                                active && styles.statusChipActive,
                                                !canUpdateHorseStatus && styles.statusChipDisabled,
                                              ]}
                                              onPress={() =>
                                                canUpdateHorseStatus &&
                                                handleSetInOutStatus(horse.id, 'nightStatus', value)
                                              }
                                              activeOpacity={0.85}
                                              disabled={!canUpdateHorseStatus}
                                            >
                                              <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                                                {value === 'in' ? 'Inne' : 'Ute'}
                                              </Text>
                                            </TouchableOpacity>
                                          );
                                        })}
                                      </View>
                                    </View>
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      ))
                    )}
                  </Card>
                  <View style={[styles.list, isDesktopWeb && styles.listDesktop]}>
                    {paddocks.map((paddock) => (
                      <TouchableOpacity
                        key={paddock.id}
                        activeOpacity={0.9}
                        onPress={canManagePaddocks ? () => openEdit(paddock.id) : undefined}
                        disabled={!canManagePaddocks}
                      >
                        <Card tone="muted" style={[styles.paddockCard, isDesktopWeb && styles.paddockCardDesktop]}>
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
                </View>
              </View>
            </ScrollView>

        <Modal visible={modalState.visible} animationType="slide" transparent onRequestClose={closeModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.modalOverlay, isDesktopWeb && styles.modalOverlayDesktop]}
          >
                <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeModal} />
                <View style={[styles.modalSheet, isDesktopWeb && styles.modalSheetDesktop]}>
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
                      editable={canManagePaddocks}
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
                  editable={canManagePaddocks}
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
                        onPress={
                          canManagePaddocks
                            ? () => setDraft((prev) => ({ ...prev, season: option.id }))
                            : undefined
                        }
                        activeOpacity={0.85}
                        disabled={!canManagePaddocks}
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
                    style={[styles.imageButton, !canManagePaddocks && styles.imageButtonDisabled]}
                    onPress={canManagePaddocks ? handlePickFromLibrary : undefined}
                    activeOpacity={0.85}
                    disabled={!canManagePaddocks}
                  >
                    <Feather name="upload" size={14} color={palette.primaryText} />
                    <Text style={styles.imageButtonLabel}>Välj bild</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.imageButton, !canManagePaddocks && styles.imageButtonDisabled]}
                    onPress={canManagePaddocks ? handleTakePhoto : undefined}
                    activeOpacity={0.85}
                    disabled={!canManagePaddocks}
                  >
                    <Feather name="camera" size={14} color={palette.primaryText} />
                    <Text style={styles.imageButtonLabel}>Ta foto</Text>
                  </TouchableOpacity>
                  {draft.image ? (
                    <TouchableOpacity
                      style={[
                        styles.imageButtonDanger,
                        !canManagePaddocks && styles.imageButtonDisabled,
                      ]}
                      onPress={canManagePaddocks ? handleClearImage : undefined}
                      activeOpacity={0.85}
                      disabled={!canManagePaddocks}
                    >
                      <Feather name="x" size={14} color={palette.error} />
                      <Text style={styles.imageButtonDangerLabel}>Ta bort</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {draft.id && canManagePaddocks ? (
                <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.85}>
                  <Text style={styles.deleteButtonLabel}>Ta bort hage</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={closeModal} activeOpacity={0.85}>
                  <Text style={styles.secondaryButtonLabel}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    !canSave && styles.primaryButtonDisabled,
                  ]}
                  onPress={canManagePaddocks ? handleSave : undefined}
                  disabled={!canSave}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryButtonLabel}>Spara</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
          </>
        )}
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
  pageHeaderDesktop: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    marginBottom: 12,
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
  scrollContentDesktop: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
    paddingTop: 20,
    gap: 16,
  },
  desktopShell: { flex: 1, flexDirection: 'row' },
  desktopSidebar: {
    width: 260,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: palette.border,
    backgroundColor: palette.surfaceTint,
    shadowColor: '#121826',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 8, height: 0 },
    elevation: 2,
  },
  desktopMain: { flex: 1, minWidth: 0 },
  desktopLayout: {
    gap: 12,
  },
  desktopLayoutDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
  },
  desktopPanel: {
    gap: 12,
  },
  desktopPanelDesktop: {
    width: 320,
    flexShrink: 0,
  },
  desktopList: {
    flex: 1,
    minWidth: 0,
  },
  desktopListDesktop: {
    flex: 1,
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
  statusCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  statusCardDesktop: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusTitle: { fontSize: 16, fontWeight: '700', color: palette.primaryText },
  statusSubtitle: { fontSize: 12, color: palette.secondaryText },
  statusDateControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  statusDateButton: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDateLabel: { fontSize: 12, fontWeight: '600', color: palette.primaryText },
  statusDateMeta: { fontSize: 10, color: palette.secondaryText },
  statusGroup: { gap: 10 },
  statusGroupDivider: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  statusGroupTitle: { fontSize: 13, fontWeight: '600', color: palette.primaryText },
  statusHorseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  statusHorseName: { fontSize: 14, fontWeight: '600', color: palette.primaryText, minWidth: 88 },
  statusToggleGroup: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  statusToggleBlock: { gap: 4 },
  statusToggleLabel: { fontSize: 11, color: palette.secondaryText },
  statusToggleRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  statusChipActive: {
    backgroundColor: 'rgba(45,108,246,0.12)',
    borderColor: 'rgba(45,108,246,0.3)',
  },
  statusChipDisabled: { opacity: 0.5 },
  statusChipText: { fontSize: 11, fontWeight: '600', color: palette.primaryText },
  statusChipTextActive: { color: palette.primary },
  list: {
    gap: 10,
  },
  listDesktop: {
    gap: 14,
  },
  paddockCard: {
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  paddockCardDesktop: {
    paddingHorizontal: 18,
    paddingVertical: 16,
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
  modalOverlayDesktop: {
    justifyContent: 'center',
    padding: 24,
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
  modalSheetDesktop: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderRadius: radius.xl,
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
  imageButtonDisabled: {
    opacity: 0.6,
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
