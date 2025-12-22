import React from 'react';
import { Animated, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card } from '@/components/Primitives';
import { color, radius } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import type { UserRole, Horse, PaddockImage } from '@/context/AppDataContext';

const palette = theme.colors;

export default function StablesScreen() {
  const router = useRouter();
  const toast = useToast();
  const { state, actions } = useAppData();
  const { stables, currentStableId, users, horses, currentUserId, farms } = state;
  const currentUser = users[currentUserId];
  const steps = [
    { id: 'farm', title: '1. Gård', description: 'Skapa gård och ridhusinfo.' },
    { id: 'stable', title: '2. Stall', description: 'Lägg till ett eller flera stall.' },
    { id: 'paddock', title: '3. Hagar', description: 'Numrera hagar och koppla karta.' },
    { id: 'horse', title: '4. Hästar & medlemmar', description: 'Lägg till hästar och bjud in folk.' },
  ] as const;
  const totalSteps = steps.length;

  const [stableDraft, setStableDraft] = React.useState<{ id?: string; name: string; location: string; farmId?: string }>({
    id: undefined,
    name: '',
    location: '',
    farmId: farms[0]?.id,
  });
  const [horseDraft, setHorseDraft] = React.useState<{
    name: string;
    stableId: string;
    owner?: string;
    gender: Horse['gender'];
    age: string;
    note: string;
  }>({
    name: '',
    stableId: currentStableId,
    owner: '',
    gender: 'unknown',
    age: '',
    note: '',
  });
  const [inviteDraft, setInviteDraft] = React.useState<{
    name: string;
    email: string;
    role: UserRole;
    customRole: string;
    access: 'owner' | 'edit' | 'view';
    riderRole: 'owner' | 'medryttare' | 'other';
    horseIds: string[];
  }>({
    name: '',
    email: '',
    role: 'rider',
    customRole: '',
    access: 'view',
    riderRole: 'medryttare',
    horseIds: [],
  });
  const [farmDraft, setFarmDraft] = React.useState<{
    id?: string;
    name: string;
    location: string;
    hasIndoorArena: boolean;
    arenaNote: string;
  }>({
    id: undefined,
    name: '',
    location: '',
    hasIndoorArena: false,
    arenaNote: '',
  });
  const [paddockDraft, setPaddockDraft] = React.useState<{
    id?: string;
    name: string;
    horsesText: string;
    season: 'summer' | 'winter' | 'yearRound';
    image: PaddockImage | null;
  }>({
    id: undefined,
    name: '',
    horsesText: '',
    season: 'yearRound',
    image: null,
  });
  const [currentStep, setCurrentStep] = React.useState(0);
  const [showComplete, setShowComplete] = React.useState(false);
  const celebrate = React.useRef(new Animated.Value(0)).current;

  const roleOptions: { id: UserRole; label: string }[] = [
    { id: 'admin', label: 'Admin' },
    { id: 'staff', label: 'Personal' },
    { id: 'rider', label: 'Ryttare' },
    { id: 'farrier', label: 'Hovslagare' },
    { id: 'vet', label: 'Veterinär' },
    { id: 'trainer', label: 'Tränare' },
    { id: 'guest', label: 'Gäst' },
  ];

  const activeHorses = React.useMemo(
    () => horses.filter((horse) => horse.stableId === currentStableId),
    [horses, currentStableId],
  );
  const farmNameById = React.useMemo(
    () =>
      farms.reduce<Record<string, string>>((acc, farm) => {
        acc[farm.id] = farm.name;
        return acc;
      }, {}),
    [farms],
  );
  const horseNameById = React.useMemo(
    () =>
      horses.reduce<Record<string, string>>((acc, horse) => {
        acc[horse.id] = horse.name;
        return acc;
      }, {}),
    [horses],
  );
  const membership = currentUser.membership.find((m) => m.stableId === currentStableId);
  const access = membership?.access ?? 'view';
  const canEdit = access !== 'view';
  const isOwner = access === 'owner';
  const accessLabel = access === 'owner' ? 'Full' : access === 'edit' ? 'Redigera' : 'Läsa';

  const paddocks = React.useMemo(
    () => state.paddocks.filter((p) => p.stableId === currentStableId),
    [state.paddocks, currentStableId],
  );

  const parseHorses = React.useCallback((value: string) => {
    return value
      .split(/[\n,;]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }, []);

  React.useEffect(() => {
    setHorseDraft((prev) => ({ ...prev, stableId: currentStableId }));
    setPaddockDraft((prev) => ({
      ...prev,
      name: '',
      horsesText: '',
      image: null,
      season: 'yearRound',
      id: undefined,
    }));
  }, [currentStableId]);
  const genderLabel: Record<NonNullable<Horse['gender']>, string> = {
    mare: 'Sto',
    gelding: 'Valack',
    stallion: 'Hingst',
    unknown: 'Okänt',
  };

  const handleCreateStable = React.useCallback(() => {
    if (!stableDraft.name.trim()) {
      toast.showToast('Namn krävs.', 'error');
      return;
    }
    const result = actions.upsertStable({
      id: stableDraft.id,
      name: stableDraft.name,
      location: stableDraft.location,
      farmId: stableDraft.farmId,
    });
    if (result.success) {
      toast.showToast(stableDraft.id ? 'Stall uppdaterat.' : 'Stall skapat.', 'success');
      setStableDraft({ id: undefined, name: '', location: '', farmId: farms[0]?.id });
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, farms, stableDraft.farmId, stableDraft.id, stableDraft.location, stableDraft.name, toast]);

  const handleCreateFarm = React.useCallback(() => {
    if (!farmDraft.name.trim()) {
      toast.showToast('Gårdsnamn krävs.', 'error');
      return;
    }
    const result = actions.upsertFarm({
      id: farmDraft.id,
      name: farmDraft.name,
      location: farmDraft.location,
      hasIndoorArena: farmDraft.hasIndoorArena,
      arenaNote: farmDraft.arenaNote,
    });
    if (result.success) {
      toast.showToast(farmDraft.id ? 'Gård uppdaterad.' : 'Gård skapad.', 'success');
      setFarmDraft({ id: undefined, name: '', location: '', hasIndoorArena: false, arenaNote: '' });
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, farmDraft.arenaNote, farmDraft.hasIndoorArena, farmDraft.id, farmDraft.location, farmDraft.name, toast]);

  const handleCreateHorse = React.useCallback(() => {
    if (!horseDraft.name.trim()) {
      toast.showToast('Hästens namn krävs.', 'error');
      return;
    }
    const parsedAge = horseDraft.age ? Number(horseDraft.age) : undefined;
    if (horseDraft.age && Number.isNaN(parsedAge)) {
      toast.showToast('Ålder måste vara ett nummer.', 'error');
      return;
    }
    const result = actions.upsertHorse({
      name: horseDraft.name,
      stableId: horseDraft.stableId || currentStableId,
      gender: horseDraft.gender,
      age: parsedAge,
      note: horseDraft.note,
    });
    if (result.success) {
      toast.showToast('Häst tillagd.', 'success');
      setHorseDraft({ name: '', stableId: currentStableId, owner: '', gender: 'unknown', age: '', note: '' });
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, horseDraft.age, horseDraft.gender, horseDraft.name, horseDraft.note, horseDraft.stableId, currentStableId, toast]);

  const formatPaddockCaption = React.useCallback((names: string[]) => {
    if (!names.length) return 'Inga hästar angivna';
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }, []);

  const handlePickPaddockImage = React.useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.showToast('Ge appen tillgång till bilder för att välja en karta/bild.', 'error');
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
    setPaddockDraft((prev) => ({
      ...prev,
      image: {
        uri: asset.uri,
        base64: asset.base64 ?? prev.image?.base64,
        mimeType: asset.mimeType ?? prev.image?.mimeType,
      },
    }));
  }, [toast]);

  const handleSavePaddock = React.useCallback(() => {
    if (!paddockDraft.name.trim()) {
      toast.showToast('Hagen behöver ett namn/nummer.', 'error');
      return;
    }
    const payload = {
      id: paddockDraft.id,
      name: paddockDraft.name,
      horseNames: parseHorses(paddockDraft.horsesText),
      stableId: currentStableId,
      image: paddockDraft.image,
      season: paddockDraft.season,
    };
    const result = actions.upsertPaddock(payload);
    if (result.success) {
      toast.showToast(paddockDraft.id ? 'Hage uppdaterad.' : 'Hage sparad.', 'success');
      setPaddockDraft({ id: undefined, name: '', horsesText: '', image: null, season: 'yearRound' });
    } else {
      toast.showToast(result.reason, 'error');
    }
  }, [actions, currentStableId, paddockDraft, parseHorses, toast]);

  const handleEditPaddock = React.useCallback(
    (id: string) => {
      const target = paddocks.find((p) => p.id === id);
      if (!target) return;
      setPaddockDraft({
        id: target.id,
        name: target.name,
        horsesText: target.horseNames.join('\n'),
        image: target.image ?? null,
        season: target.season ?? 'yearRound',
      });
    },
    [paddocks],
  );

  const handleDeletePaddock = React.useCallback(
    (id: string) => {
      const result = actions.deletePaddock(id);
      if (result.success) {
        toast.showToast('Hage borttagen.', 'success');
        if (paddockDraft.id === id) {
          setPaddockDraft({ id: undefined, name: '', horsesText: '', image: null, season: 'yearRound' });
        }
      } else {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, paddockDraft.id, toast],
  );

  const progress = ((currentStep + 1) / totalSteps) * 100;
  const canContinue =
    currentStep === 0
      ? farms.length > 0
      : currentStep === 1
        ? stables.length > 0
        : currentStep === 2
          ? paddocks.length > 0
          : true;

  React.useEffect(() => {
    if (showComplete) {
      celebrate.setValue(0);
      Animated.spring(celebrate, { toValue: 1, useNativeDriver: true, bounciness: 12 }).start();
    }
  }, [celebrate, showComplete]);

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title="Stall och hästar"
          style={styles.pageHeader}
          left={
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backIcon}>‹</Text>
            </TouchableOpacity>
          }
          showLogo={false}
          showSearch={false}
        />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.stepHeader}>
            <Text style={styles.sectionTitle}>Onboarding</Text>
            <Text style={styles.stepHint}>Steg {currentStep + 1} av {totalSteps}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            {!canEdit ? (
              <Card tone="muted" style={styles.accessCard}>
                <Text style={styles.accessTitle}>Begränsad behörighet</Text>
                <Text style={styles.accessText}>
                  Du har åtkomst: {accessLabel}. Be en administratör om full behörighet för att ändra stall, hästar och hagar.
                </Text>
              </Card>
            ) : null}
            <View style={styles.stepper}>
              {steps.map((step, index) => {
                const active = index === currentStep;
                const done = index < currentStep;
                return (
                  <TouchableOpacity key={step.id} style={styles.stepItem} onPress={() => setCurrentStep(index)}>
                    <View style={[styles.stepDot, active && styles.stepDotActive, done && styles.stepDotDone]}>
                      {done ? <Feather name="check" size={12} color={palette.inverseText} /> : null}
                    </View>
                    <View style={styles.stepLabelWrap}>
                      <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{step.title}</Text>
                      <Text style={styles.stepDesc}>{step.description}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {currentStep === 0 ? (
            <Card tone="muted" style={[styles.card, styles.stepCard]}>
              <Text style={styles.sectionTitle}>Gårdar</Text>
              <View style={styles.farmList}>
                {farms.map((farm) => (
                  <View key={farm.id} style={styles.farmRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.farmName}>{farm.name}</Text>
                      <Text style={styles.farmLocation}>{farm.location || 'Ingen plats angiven'}</Text>
                      {farm.hasIndoorArena ? (
                        <Text style={styles.farmMeta}>Ridhus: Ja{farm.arenaNote ? ` · ${farm.arenaNote}` : ''}</Text>
                      ) : (
                        <Text style={styles.farmMeta}>Ridhus: Nej</Text>
                      )}
                    </View>
                    {farm.hasIndoorArena ? <Feather name="check" size={16} color={palette.primary} /> : null}
                  </View>
                ))}
              </View>
              <View style={styles.stableForm}>
                <Text style={styles.formLabel}>Lägg till gård</Text>
                <TextInput
                  placeholder="Namn"
                  placeholderTextColor={palette.mutedText}
                  value={farmDraft.name}
                  onChangeText={(text) => setFarmDraft((prev) => ({ ...prev, name: text }))}
                  style={styles.input}
                  editable={isOwner}
                />
                <TextInput
                  placeholder="Plats (valfritt)"
                  placeholderTextColor={palette.mutedText}
                  value={farmDraft.location}
                  onChangeText={(text) => setFarmDraft((prev) => ({ ...prev, location: text }))}
                  style={styles.input}
                  editable={isOwner}
                />
                <Text style={styles.formLabel}>Ridhus</Text>
                <View style={styles.chipRow}>
                  {[
                    { id: true, label: 'Har ridhus' },
                    { id: false, label: 'Inget ridhus' },
                  ].map((option) => {
                    const active = farmDraft.hasIndoorArena === option.id;
                    return (
                      <TouchableOpacity
                        key={`${option.id}`}
                        style={[styles.accessChip, active && styles.accessChipActive]}
                        onPress={() => isOwner && setFarmDraft((prev) => ({ ...prev, hasIndoorArena: option.id }))}
                        activeOpacity={0.85}
                        disabled={!isOwner}
                      >
                        <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  placeholder="Ridhusinfo (storlek, bokning...)"
                  placeholderTextColor={palette.mutedText}
                  value={farmDraft.arenaNote}
                  onChangeText={(text) => setFarmDraft((prev) => ({ ...prev, arenaNote: text }))}
                  style={styles.input}
                  editable={isOwner}
                />
                <TouchableOpacity
                  style={[styles.primaryButton, !isOwner && styles.primaryButtonDisabled]}
                  onPress={handleCreateFarm}
                  activeOpacity={0.9}
                  disabled={!isOwner}
                >
                  <Text style={styles.primaryButtonText}>Spara gård</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ) : null}

          {currentStep === 1 ? (
            <Card tone="muted" style={[styles.card, styles.stepCard]}>
              <Text style={styles.sectionTitle}>Dina stall</Text>
              <View style={styles.stableList}>
                {stables.map((stable) => {
                  const active = stable.id === currentStableId;
                  const role = currentUser.membership.find((m) => m.stableId === stable.id)?.role;
                  const locationLabel = [farmNameById[stable.farmId ?? ''], stable.location].filter(Boolean).join(' · ');
                  return (
                    <TouchableOpacity
                      key={stable.id}
                      style={[styles.stableRow, active && styles.stableRowActive]}
                      onPress={() => actions.setCurrentStable(stable.id)}
                      activeOpacity={0.85}
                    >
                      <View>
                        <Text style={styles.stableName}>{stable.name}</Text>
                        {locationLabel ? <Text style={styles.stableLocation}>{locationLabel}</Text> : null}
                      </View>
                      <View style={styles.stableMeta}>
                        {role ? <Text style={styles.rolePill}>{role}</Text> : null}
                        {active ? <Text style={styles.activePill}>Aktiv</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <View style={styles.stableForm}>
                  <Text style={styles.formLabel}>Nytt stall</Text>
                  <TextInput
                    placeholder="Namn"
                    placeholderTextColor={palette.mutedText}
                    value={stableDraft.name}
                    onChangeText={(text) => setStableDraft((prev) => ({ ...prev, name: text }))}
                    style={styles.input}
                    editable={isOwner}
                  />
                  <TextInput
                    placeholder="Plats (valfritt)"
                    placeholderTextColor={palette.mutedText}
                    value={stableDraft.location}
                    onChangeText={(text) => setStableDraft((prev) => ({ ...prev, location: text }))}
                    style={styles.input}
                    editable={isOwner}
                  />
                  <Text style={styles.formLabel}>Tillhör gård</Text>
                  <View style={styles.chipRow}>
                    {farms.map((farm) => {
                      const active = stableDraft.farmId === farm.id;
                      return (
                        <TouchableOpacity
                          key={farm.id}
                          style={[styles.roleChip, active && styles.roleChipActive]}
                          onPress={() => setStableDraft((prev) => ({ ...prev, farmId: farm.id }))}
                          activeOpacity={0.85}
                          disabled={!isOwner}
                        >
                          <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>{farm.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {farms.length === 0 ? <Text style={styles.emptyText}>Lägg till en gård först.</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={[styles.primaryButton, !isOwner && styles.primaryButtonDisabled]}
                    onPress={handleCreateStable}
                    activeOpacity={0.9}
                    disabled={!isOwner}
                  >
                    <Text style={styles.primaryButtonText}>Spara stall</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          ) : null}

          {currentStep === 2 ? (
            <Card tone="muted" style={[styles.card, styles.stepCard]}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Hagar i {stables.find((s) => s.id === currentStableId)?.name}</Text>
                <Text style={styles.countText}>{paddocks.length}</Text>
              </View>
              <View style={styles.paddockList}>
                {paddocks.map((paddock) => (
                  <View key={paddock.id} style={styles.paddockRow}>
                    <TouchableOpacity style={styles.paddockMain} activeOpacity={0.85} onPress={() => handleEditPaddock(paddock.id)}>
                      {paddock.image?.uri ? (
                        <Image source={{ uri: paddock.image.uri }} style={styles.paddockThumb} />
                      ) : (
                        <View style={styles.paddockThumbPlaceholder}>
                          <Feather name="image" size={14} color={palette.mutedText} />
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={styles.rowBetween}>
                          <Text style={styles.paddockName}>{paddock.name}</Text>
                          <Text style={styles.paddockCount}>{paddock.horseNames.length}</Text>
                        </View>
                        <View style={styles.metaRow}>
                          <View style={styles.seasonPill}>
                            <Text style={styles.seasonText}>
                              {paddock.season === 'summer'
                                ? 'Sommarhage'
                                : paddock.season === 'winter'
                                  ? 'Vinterhage'
                                  : 'Året runt'}
                            </Text>
                          </View>
                          <Text style={styles.paddockCaption}>{formatPaddockCaption(paddock.horseNames)}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.removeButton} onPress={() => handleDeletePaddock(paddock.id)}>
                      <Feather name="trash-2" size={14} color={palette.error} />
                    </TouchableOpacity>
                  </View>
                ))}
                {paddocks.length === 0 ? <Text style={styles.emptyText}>Inga hagar ännu.</Text> : null}
              </View>

              <View style={styles.stableForm}>
                <Text style={styles.formLabel}>{paddockDraft.id ? 'Redigera hage' : 'Ny hage/karta'}</Text>
                <TextInput
                  placeholder="Namn eller nummer"
                  placeholderTextColor={palette.mutedText}
                  value={paddockDraft.name}
                  onChangeText={(text) => setPaddockDraft((prev) => ({ ...prev, name: text }))}
                  style={styles.input}
                  editable={canEdit}
                />
                <Text style={styles.formLabel}>Säsong</Text>
                <View style={styles.chipRow}>
                  {([
                    { id: 'yearRound', label: 'Året runt' },
                    { id: 'summer', label: 'Sommar' },
                    { id: 'winter', label: 'Vinter' },
                  ] as const).map((option) => {
                    const active = paddockDraft.season === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[styles.accessChip, active && styles.accessChipActive]}
                        onPress={() => canEdit && setPaddockDraft((prev) => ({ ...prev, season: option.id }))}
                        activeOpacity={0.85}
                        disabled={!canEdit}
                      >
                        <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.formLabel}>Hästar</Text>
                <TextInput
                  placeholder={'En per rad eller komma-separerat\nEx.\nCinder\nAtlas'}
                  placeholderTextColor={palette.mutedText}
                  value={paddockDraft.horsesText}
                  onChangeText={(text) => setPaddockDraft((prev) => ({ ...prev, horsesText: text }))}
                  style={[styles.input, { minHeight: 70 }]}
                  editable={canEdit}
                  multiline
                />
                <Text style={styles.formLabel}>Bild/karta</Text>
                {paddockDraft.image?.uri ? (
                  <Image source={{ uri: paddockDraft.image.uri }} style={styles.paddockPreview} />
                ) : (
                  <View style={styles.paddockPreviewPlaceholder}>
                    <Feather name="map" size={16} color={palette.mutedText} />
                    <Text style={styles.formHint}>Ladda upp en bild på hagkarta/skylt</Text>
                  </View>
                )}
                <View style={styles.imageRow}>
                  <TouchableOpacity
                    style={[styles.imageButton, !canEdit && styles.primaryButtonDisabled]}
                    onPress={handlePickPaddockImage}
                    activeOpacity={0.85}
                    disabled={!canEdit}
                  >
                    <Feather name="upload" size={14} color={palette.primaryText} />
                    <Text style={styles.imageButtonText}>Välj bild</Text>
                  </TouchableOpacity>
                  {paddockDraft.image ? (
                    <TouchableOpacity
                      style={styles.imageButtonDanger}
                      onPress={() => setPaddockDraft((prev) => ({ ...prev, image: null }))}
                      activeOpacity={0.85}
                      disabled={!canEdit}
                    >
                      <Feather name="x" size={14} color={palette.error} />
                      <Text style={styles.imageButtonDangerText}>Ta bort</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, !canEdit && styles.primaryButtonDisabled]}
                  onPress={handleSavePaddock}
                  activeOpacity={0.9}
                  disabled={!canEdit}
                >
                  <Text style={styles.primaryButtonText}>{paddockDraft.id ? 'Uppdatera hage' : 'Spara hage'}</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ) : null}

          {currentStep === 3 ? (
            <>
              <Card tone="muted" style={[styles.card, styles.stepCard]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionTitle}>Hästar i {stables.find((s) => s.id === currentStableId)?.name}</Text>
                  <Text style={styles.countText}>{activeHorses.length}</Text>
                </View>
                <View style={styles.horseList}>
                  {activeHorses.map((horse) => {
                    const meta = [
                      horse.gender ? genderLabel[horse.gender] : null,
                      horse.age ? `${horse.age} år` : null,
                    ]
                      .filter(Boolean)
                      .join(' • ');
                    return (
                      <View key={horse.id} style={styles.horseRow}>
                        <Feather name="tag" size={14} color={palette.secondaryText} />
                        <View>
                          <Text style={styles.horseName}>{horse.name}</Text>
                          {meta ? <Text style={styles.horseMeta}>{meta}</Text> : null}
                          {horse.note ? <Text style={styles.horseNote}>{horse.note}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                  {activeHorses.length === 0 ? <Text style={styles.emptyText}>Inga hästar ännu.</Text> : null}
                </View>
                <View style={styles.stableForm}>
                  <Text style={styles.formLabel}>Lägg till häst</Text>
                  <Text style={styles.formLabel}>Stall</Text>
                  <View style={styles.chipRow}>
                    {stables.map((stable) => {
                      const active = horseDraft.stableId === stable.id;
                      return (
                        <TouchableOpacity
                          key={stable.id}
                          style={[styles.accessChip, active && styles.accessChipActive]}
                      onPress={() => canEdit && setHorseDraft((prev) => ({ ...prev, stableId: stable.id }))}
                      activeOpacity={0.85}
                      disabled={!canEdit}
                    >
                      <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>{stable.name}</Text>
                    </TouchableOpacity>
                  );
                })}
                  </View>
                  <TextInput
                    placeholder="Namn"
                    placeholderTextColor={palette.mutedText}
                    value={horseDraft.name}
                    onChangeText={(text) => setHorseDraft((prev) => ({ ...prev, name: text }))}
                    style={styles.input}
                    editable={canEdit}
                  />
                  <Text style={styles.formLabel}>Kön</Text>
                  <View style={styles.chipRow}>
                    {(['mare', 'gelding', 'stallion', 'unknown'] as const).map((gender) => {
                      const active = horseDraft.gender === gender;
                      return (
                        <TouchableOpacity
                          key={gender}
                          style={[styles.accessChip, active && styles.accessChipActive]}
                          onPress={() => canEdit && setHorseDraft((prev) => ({ ...prev, gender }))}
                          activeOpacity={0.85}
                          disabled={!canEdit}
                        >
                          <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>
                            {genderLabel[gender]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    placeholder="Ålder (valfritt)"
                    placeholderTextColor={palette.mutedText}
                    value={horseDraft.age}
                    onChangeText={(text) => setHorseDraft((prev) => ({ ...prev, age: text }))}
                    style={styles.input}
                    editable={canEdit}
                    keyboardType="numeric"
                  />
                  <TextInput
                    placeholder="Anteckning (t.ex. temperament, viktiga behov)"
                    placeholderTextColor={palette.mutedText}
                    value={horseDraft.note}
                    onChangeText={(text) => setHorseDraft((prev) => ({ ...prev, note: text }))}
                    style={[styles.input, { minHeight: 46 }]}
                    editable={canEdit}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.primaryButton, !canEdit && styles.primaryButtonDisabled]}
                    onPress={handleCreateHorse}
                    activeOpacity={0.9}
                    disabled={!canEdit}
                  >
                    <Text style={styles.primaryButtonText}>Spara häst</Text>
                  </TouchableOpacity>
                </View>
              </Card>

              <Card tone="muted" style={[styles.card, styles.stepCard]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionTitle}>Medlemmar i {stables.find((s) => s.id === currentStableId)?.name}</Text>
                  <Text style={styles.countText}>
                    {Object.values(users).filter((u) => u.membership.some((m) => m.stableId === currentStableId)).length}
                  </Text>
                </View>
                <View style={styles.memberList}>
                  {Object.values(users)
                    .filter((user) => user.membership.some((m) => m.stableId === currentStableId))
                    .map((user) => {
                      const membership = user.membership.find((m) => m.stableId === currentStableId);
                      const role = membership?.role ?? 'guest';
                      const riderRoleLabel =
                        membership?.riderRole === 'owner'
                          ? 'Hästägare'
                          : membership?.riderRole === 'medryttare'
                            ? 'Medryttare'
                            : membership?.riderRole === 'other'
                              ? 'Annat'
                              : undefined;
                      const horseNames =
                        membership?.horseIds?.map((id) => horseNameById[id]).filter(Boolean).join(', ') || undefined;
                      const accessLabel =
                        membership?.access === 'owner'
                          ? 'Full'
                          : membership?.access === 'edit'
                            ? 'Redigera'
                            : membership?.access === 'view'
                              ? 'Läsa'
                              : undefined;
                      return (
                        <View key={user.id} style={styles.memberRow}>
                          <View>
                            <Text style={styles.memberName}>{user.name}</Text>
                            <Text style={styles.memberMeta}>
                              {[role, riderRoleLabel, accessLabel].filter(Boolean).join(' • ') || 'Ingen roll satt'}
                            </Text>
                            {horseNames ? <Text style={styles.memberMeta}>Hästar: {horseNames}</Text> : null}
                          </View>
                          <View style={styles.memberActions}>
                            <TouchableOpacity
                              style={styles.roleButton}
                          onPress={() => {
                            const nextRole =
                              role === 'admin'
                                ? 'staff'
                                : role === 'staff'
                                  ? 'rider'
                                  : role === 'rider'
                                    ? 'guest'
                                    : 'admin';
                            actions.updateMemberRole({ userId: user.id, stableId: currentStableId, role: nextRole });
                          }}
                          disabled={!canEdit}
                        >
                          <Text style={styles.roleButtonText}>{role}</Text>
                        </TouchableOpacity>
                        {user.id !== currentUserId ? (
                          <TouchableOpacity
                            style={styles.removeButton}
                            onPress={() => actions.removeMemberFromStable(user.id, currentStableId)}
                            disabled={!isOwner}
                          >
                            <Feather name="x" size={14} color={palette.error} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                        </View>
                      );
                    })}
                </View>
                <View style={styles.stableForm}>
              <Text style={styles.formLabel}>Bjud in medlem</Text>
              <TextInput
                placeholder="Namn"
                placeholderTextColor={palette.mutedText}
                value={inviteDraft.name}
                onChangeText={(text) => setInviteDraft((prev) => ({ ...prev, name: text }))}
                style={styles.input}
                editable={canEdit}
              />
              <TextInput
                placeholder="E-post"
                placeholderTextColor={palette.mutedText}
                value={inviteDraft.email}
                onChangeText={(text) => setInviteDraft((prev) => ({ ...prev, email: text }))}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={canEdit}
              />
                  <View style={styles.rowBetween}>
                    <Text style={styles.formLabel}>Roll</Text>
                  </View>
                  <View style={styles.chipRow}>
                    {roleOptions.map((option) => {
                      const active = option.id === inviteDraft.role;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          style={[styles.roleChip, active && styles.roleChipActive]}
                          onPress={() => setInviteDraft((prev) => ({ ...prev, role: option.id }))}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>{option.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    placeholder="Egen roll (valfritt)"
                    placeholderTextColor={palette.mutedText}
                    value={inviteDraft.customRole}
                    onChangeText={(text) => setInviteDraft((prev) => ({ ...prev, customRole: text }))}
                    style={styles.input}
                  />
                  <Text style={styles.formLabel}>Åtkomst</Text>
                  <View style={styles.chipRow}>
                    {(['owner', 'edit', 'view'] as const).map((level) => {
                      const active = inviteDraft.access === level;
                      const labels: Record<typeof level, string> = { owner: 'Full', edit: 'Redigera', view: 'Läsa' };
                      return (
                        <TouchableOpacity
                          key={level}
                          style={[styles.accessChip, active && styles.accessChipActive]}
                          onPress={() => setInviteDraft((prev) => ({ ...prev, access: level }))}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>{labels[level]}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.formLabel}>Ryttarroll</Text>
                  <View style={styles.chipRow}>
                    {[
                      { id: 'owner', label: 'Hästägare' },
                      { id: 'medryttare', label: 'Medryttare' },
                      { id: 'other', label: 'Annat' },
                    ].map((option) => {
                      const active = inviteDraft.riderRole === option.id;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          style={[styles.roleChip, active && styles.roleChipActive]}
                          onPress={() =>
                            setInviteDraft((prev) => ({ ...prev, riderRole: option.id as typeof prev.riderRole }))
                          }
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>{option.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.formLabel}>Koppla till hästar</Text>
                  {activeHorses.length === 0 ? (
                    <Text style={styles.emptyText}>Lägg till hästar först.</Text>
                  ) : (
                    <View style={styles.chipRow}>
                      {activeHorses.map((horse) => {
                        const active = inviteDraft.horseIds.includes(horse.id);
                        return (
                          <TouchableOpacity
                            key={horse.id}
                            style={[styles.accessChip, active && styles.accessChipActive]}
                            onPress={() =>
                              setInviteDraft((prev) => ({
                                ...prev,
                                horseIds: active
                                  ? prev.horseIds.filter((id) => id !== horse.id)
                                  : [...prev.horseIds, horse.id],
                              }))
                            }
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>{horse.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
              <TouchableOpacity
                style={[styles.primaryButton, !canEdit && styles.primaryButtonDisabled]}
                onPress={() => {
                  if (!inviteDraft.name.trim() || !inviteDraft.email.trim()) {
                    toast.showToast('Namn och e-post krävs.', 'error');
                    return;
                  }
                  const result = actions.addMember({
                        name: inviteDraft.name,
                        email: inviteDraft.email,
                        stableId: currentStableId,
                        role: inviteDraft.role,
                        customRole: inviteDraft.customRole || undefined,
                        access: inviteDraft.access,
                        horseIds: inviteDraft.horseIds,
                        riderRole: inviteDraft.riderRole,
                      });
                      if (result.success) {
                        toast.showToast('Inbjudan skapad (mock).', 'success');
                        setInviteDraft({
                          name: '',
                          email: '',
                          role: 'rider',
                          customRole: '',
                          access: 'view',
                          riderRole: 'medryttare',
                          horseIds: [],
                    });
                  } else {
                    toast.showToast(result.reason, 'error');
                  }
                }}
                activeOpacity={0.9}
                disabled={!canEdit}
              >
                <Text style={styles.primaryButtonText}>Lägg till</Text>
              </TouchableOpacity>
            </View>
          </Card>
            </>
          ) : null}

          <View style={styles.footerNav}>
            <TouchableOpacity
              style={[styles.secondaryButton, currentStep === 0 && styles.secondaryButtonDisabled]}
              onPress={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
              disabled={currentStep === 0}
              activeOpacity={0.85}
            >
              <Text style={[styles.secondaryButtonLabel, currentStep === 0 && styles.secondaryButtonLabelDisabled]}>
                Tillbaka
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
              onPress={() => {
                if (currentStep === totalSteps - 1) {
                  setShowComplete(true);
                  return;
                }
                setCurrentStep((prev) => Math.min(totalSteps - 1, prev + 1));
              }}
              activeOpacity={0.9}
              disabled={!canContinue}
            >
              <Text style={styles.primaryButtonText}>
                {currentStep === totalSteps - 1 ? 'Klart → appen' : 'Nästa steg'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <Modal visible={showComplete} transparent animationType="fade" onRequestClose={() => setShowComplete(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.completeCard}>
              <Animated.View
                style={[
                  styles.celebrateCircle,
                  {
                    transform: [
                      {
                        scale: celebrate.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.3, 1],
                        }),
                      },
                    ],
                    opacity: celebrate,
                  },
                ]}
              >
                <Feather name="check" size={32} color={palette.inverseText} />
              </Animated.View>
              <Text style={styles.completeTitle}>Klart!</Text>
              <Text style={styles.completeText}>Din gård och stall är satta. Vill du ta en snabb rundtur?</Text>
              <View style={styles.completeActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setShowComplete(false);
                    router.push('/');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonLabel}>Hoppa över</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    setShowComplete(false);
                    router.push({ pathname: '/', params: { tour: 'intro' } });
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryButtonText}>Visa guidad tur</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: color.bg },
  pageHeader: { marginBottom: 8 },
  backButton: {
    borderRadius: radius.full,
    backgroundColor: theme.colors.surfaceTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backIcon: { fontSize: 20, color: theme.colors.icon },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 16, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  card: { padding: 14, gap: 12, borderWidth: 0, width: '100%' },
  stepCard: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: palette.primaryText },
  stableList: { gap: 10 },
  farmList: { gap: 8 },
  farmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 10,
  },
  farmName: { fontSize: 15, fontWeight: '700', color: palette.primaryText },
  farmLocation: { fontSize: 12, color: palette.secondaryText },
  farmMeta: { fontSize: 12, color: palette.secondaryText, marginTop: 2 },
  stableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surfaceTint,
  },
  stableRowActive: {
    borderColor: 'rgba(45,108,246,0.3)',
    backgroundColor: 'rgba(45,108,246,0.08)',
  },
  stableName: { fontSize: 15, fontWeight: '700', color: palette.primaryText },
  stableLocation: { fontSize: 12, color: palette.secondaryText },
  stableMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    color: palette.secondaryText,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    textTransform: 'capitalize',
    fontSize: 12,
    fontWeight: '600',
  },
  activePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(45,108,246,0.14)',
    color: palette.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  stableForm: { gap: 8, marginTop: 6 },
  formLabel: { fontSize: 13, fontWeight: '600', color: palette.primaryText },
  input: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.primaryText,
    backgroundColor: palette.surface,
  },
  primaryButton: {
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: palette.inverseText, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  countText: { fontSize: 12, color: palette.secondaryText },
  horseList: { gap: 8 },
  horseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  horseName: { fontSize: 14, fontWeight: '600', color: palette.primaryText },
  horseMeta: { fontSize: 12, color: palette.secondaryText },
  horseNote: { fontSize: 12, color: palette.secondaryText, marginTop: 2 },
  paddockList: { gap: 10, marginTop: 6 },
  paddockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  paddockMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  paddockThumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: palette.surfaceMuted },
  paddockThumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paddockName: { fontSize: 14, fontWeight: '700', color: palette.primaryText },
  paddockCount: { fontSize: 13, fontWeight: '700', color: palette.primary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  seasonPill: {
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  seasonText: { fontSize: 11, fontWeight: '600', color: palette.secondaryText },
  paddockCaption: { fontSize: 12, color: palette.secondaryText },
  paddockPreview: { width: '100%', height: 140, borderRadius: radius.lg, backgroundColor: palette.surfaceMuted },
  paddockPreviewPlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  imageRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  imageButtonText: { fontSize: 13, fontWeight: '600', color: palette.primaryText },
  imageButtonDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(249, 95, 95, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(249, 95, 95, 0.22)',
  },
  imageButtonDangerText: { fontSize: 13, fontWeight: '600', color: palette.error },
  emptyText: { fontSize: 13, color: palette.secondaryText },
  memberList: { gap: 10 },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  memberName: { fontSize: 15, fontWeight: '700', color: palette.primaryText },
  memberMeta: { fontSize: 12, color: palette.secondaryText },
  memberActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  roleButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  roleButtonText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize', color: palette.primaryText },
  removeButton: {
    padding: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(249, 95, 95, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(249, 95, 95, 0.22)',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  roleChipActive: {
    backgroundColor: 'rgba(45,108,246,0.14)',
    borderColor: 'rgba(45,108,246,0.3)',
  },
  roleChipText: { fontSize: 12, fontWeight: '600', color: palette.primaryText },
  roleChipTextActive: { color: palette.primary },
  accessChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  accessChipActive: {
    backgroundColor: 'rgba(45,108,246,0.1)',
    borderColor: 'rgba(45,108,246,0.26)',
  },
  accessChipText: { fontSize: 12, fontWeight: '600', color: palette.primaryText },
  accessChipTextActive: { color: palette.primary },
  accessCard: { padding: 12, borderWidth: 0, gap: 4 },
  accessTitle: { fontSize: 14, fontWeight: '700', color: palette.primaryText },
  accessText: { fontSize: 12, color: palette.secondaryText },
  stepHeader: { gap: 6, width: '100%' },
  stepHint: { fontSize: 13, color: palette.secondaryText },
  stepper: { gap: 8, width: '100%' },
  stepItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceTint,
    width: '100%',
  },
  stepDot: { width: 22, height: 22, borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface },
  stepDotActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  stepDotDone: { backgroundColor: palette.primary, borderColor: palette.primary },
  stepLabelWrap: { flex: 1, gap: 2 },
  stepLabel: { fontSize: 13, fontWeight: '700', color: palette.primaryText },
  stepLabelActive: { color: palette.primary },
  stepDesc: { fontSize: 12, color: palette.secondaryText },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceTint,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    borderRadius: radius.full,
  },
  footerNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    width: '100%',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
  },
  secondaryButtonDisabled: { opacity: 0.5 },
  secondaryButtonLabel: { color: palette.primaryText, fontWeight: '700' },
  secondaryButtonLabelDisabled: { color: palette.secondaryText },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  completeCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: 20,
    gap: 12,
    alignItems: 'center',
  },
  celebrateCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeTitle: { fontSize: 20, fontWeight: '700', color: palette.primaryText },
  completeText: { fontSize: 14, color: palette.secondaryText, textAlign: 'center' },
  completeActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
});
