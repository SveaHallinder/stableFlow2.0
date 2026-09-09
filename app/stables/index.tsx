import { DataSyncStatus } from '@/components/DataSyncStatus';
import { InviteReceipt } from '@/components/InviteReceipt';
import type { ActionResult, InviteConfirmation } from '@/context/AppDataContext';
import React from 'react';
import { generateId } from '@/lib/ids';
import { confirmAction } from '@/lib/confirm';
import {
  Image,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DesktopNav } from '@/components/DesktopNav';
import { Card } from '@/components/Primitives';
import { color, radius } from '@/design/tokens';
import { useAppData, resolveStableSettings } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { useIsDesktopWeb, webStickyStyle } from '@/hooks/useIsDesktopWeb';
import { roleLabels as sharedRoleLabels, roleOrder as sharedRoleOrder } from '@/lib/roleLabels';
import type { UserRole, Horse, PaddockImage, StableEventVisibility, StableSettings } from '@/context/AppDataContext';

const palette = theme.colors;

const dayLogicOptions = [
  {
    id: 'box',
    title: 'Boxhästar',
    description: 'Inne/ute dag & natt per häst.',
  },
  {
    id: 'loose',
    title: 'Lösdrift',
    description: 'Kollad + vatten/hö per häst.',
  },
] as const;

const eventVisibilityOptions = [
  { id: 'feeding', label: 'Fodring saknas' },
  { id: 'cleaning', label: 'Städning/Mockning' },
  { id: 'riderAway', label: 'Ryttare bortrest' },
  { id: 'farrierAway', label: 'Hovslagare bortrest' },
  { id: 'vetAway', label: 'Veterinär bortrest' },
  { id: 'evening', label: 'Kvällspass' },
] as const;

export default function StablesScreen() {
  const router = useRouter();
  const { q, section } = useLocalSearchParams<{ q?: string | string[]; section?: string }>();
  const horsesOnly = section === 'horses';
  const toast = useToast();
  const { state, actions, derived } = useAppData();
  const { stables, currentStableId, users, horses, currentUserId, farms } = state;
  const isDesktopWeb = useIsDesktopWeb();
  const stickyPanelStyle = isDesktopWeb ? webStickyStyle : undefined;
  const currentUser = users[currentUserId];
  const { permissions } = derived;
  const showFarmSection = stables.length > 1;

  const creatingStableRef = React.useRef(false);
  const newStableIdRef = React.useRef<string | null>(null);
  const [creatingStable, setCreatingStable] = React.useState(false);
  const [stableCreateError, setStableCreateError] = React.useState<string | null>(null);
  const [stableDraft, setStableDraft] = React.useState<{ id?: string; name: string; location: string; farmId?: string }>({
    id: undefined,
    name: '',
    location: '',
    farmId: undefined,
  });
  const [savingInvite, setSavingInvite] = React.useState(false);
  const savingInviteRef = React.useRef(false);
  const [memberReceipt, setMemberReceipt] = React.useState<InviteConfirmation | null>(null);
  const [delegateReceipt, setDelegateReceipt] = React.useState<InviteConfirmation | null>(null);
  const [memberInviteError, setMemberInviteError] = React.useState<string | null>(null);
  const [memberSaving, setMemberSaving] = React.useState(false);
  const memberSavingRef = React.useRef(false);
  const [memberError, setMemberError] = React.useState<string | null>(null);
  const runMemberChange = React.useCallback(async (operation: () => Promise<ActionResult<unknown>>) => {
    if (memberSavingRef.current) return false;
    memberSavingRef.current = true;
    setMemberSaving(true);
    setMemberError(null);
    try {
      const result = await operation();
      if (!result.success) setMemberError(result.reason);
      return result.success;
    } catch {
      setMemberError('Medlemsändringen kunde inte sparas. Försök igen.');
      return false;
    } finally {
      memberSavingRef.current = false;
      setMemberSaving(false);
    }
  }, []);
  const [delegateInviteError, setDelegateInviteError] = React.useState<string | null>(null);
  const [savingHorse, setSavingHorse] = React.useState(false);
  const [horseSaveError, setHorseSaveError] = React.useState<string | null>(null);
  const savingHorseRef = React.useRef(false);
  const [deletingHorseId, setDeletingHorseId] = React.useState<string | null>(null);
  const [horseDeleteError, setHorseDeleteError] = React.useState<{ id: string; reason: string } | null>(null);
  const newHorseIdRef = React.useRef<string | null>(null);
  const [horseDraft, setHorseDraft] = React.useState<{
    id?: string;
    name: string;
    stableId: string;
    ownerUserId?: string;
    gender: Horse['gender'];
    age: string;
    note: string;
    image: Horse['image'] | null;
  }>({
    id: undefined,
    name: '',
    stableId: currentStableId,
    ownerUserId: undefined,
    gender: 'unknown',
    age: '',
    note: '',
    image: null,
  });
  const [inviteDraft, setInviteDraft] = React.useState<{
    name: string;
    email: string;
    phone: string;
    stableIds: string[];
    role: UserRole;
    customRole: string;
    access: 'owner' | 'edit' | 'view';
    riderRole: 'owner' | 'medryttare' | 'other';
    horseIds: string[];
  }>({
    name: '',
    email: '',
    phone: '',
    stableIds: currentStableId ? [currentStableId] : [],
    role: 'rider',
    customRole: '',
    access: 'view',
    riderRole: 'medryttare',
    horseIds: [],
  });
  const [delegateDraft, setDelegateDraft] = React.useState<{
    name: string;
    email: string;
    phone: string;
  }>({
    name: '',
    email: '',
    phone: '',
  });
  const savingFarmRef = React.useRef(false);
  const newFarmIdRef = React.useRef<string | null>(null);
  const [savingFarm, setSavingFarm] = React.useState(false);
  const [farmSaveError, setFarmSaveError] = React.useState<string | null>(null);
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
  const savingPaddockRef = React.useRef(false);
  const newPaddockIdRef = React.useRef<string | null>(null);
  const [paddockPending, setPaddockPending] = React.useState<'save' | 'delete' | null>(null);
  const [paddockError, setPaddockError] = React.useState<string | null>(null);
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
  const initialQuery = React.useMemo(() => (Array.isArray(q) ? q[0] : q) ?? '', [q]);
  const [horseSearch, setHorseSearch] = React.useState(initialQuery);
  const newRideTypeIdRef = React.useRef<string | null>(null);
  const rideTypeOriginalRef = React.useRef<{ id: string; code: string; label: string; description?: string } | null>(null);
  const [rideTypeDraft, setRideTypeDraft] = React.useState<{
    id?: string;
    code: string;
    label: string;
    description: string;
  }>({
    id: undefined,
    code: '',
    label: '',
    description: '',
  });
  const [savingSettings, setSavingSettings] = React.useState(false);
  const savingSettingsRef = React.useRef(false);
  const [settingsSaveError, setSettingsSaveError] = React.useState<string | null>(null);
  const settingsDraftStableRef = React.useRef('');
  const dirtySettingsRef = React.useRef(new Set<string>());
  const [settingsDraft, setSettingsDraft] = React.useState<StableSettings>(() => resolveStableSettings());

  const roleOptions: { id: UserRole; label: string }[] = sharedRoleOrder.map((role) => ({
    id: role,
    label: sharedRoleLabels[role],
  }));
  const roleAccessDefaults: Record<UserRole, { access: 'owner' | 'edit' | 'view' }> = {
    admin: { access: 'owner' },
    staff: { access: 'edit' },
    rider: { access: 'view' },
    farrier: { access: 'view' },
    vet: { access: 'view' },
    trainer: { access: 'view' },
    therapist: { access: 'view' },
    guest: { access: 'view' },
  };

  React.useEffect(() => {
    setStableDraft((prev) => {
      if (!showFarmSection) {
        return prev.farmId ? { ...prev, farmId: undefined } : prev;
      }
      if (prev.farmId && !farms.some((farm) => farm.id === prev.farmId)) {
        return { ...prev, farmId: undefined };
      }
      return prev;
    });
  }, [farms, showFarmSection]);

  React.useEffect(() => {
    if (initialQuery) {
      setHorseSearch(initialQuery);
    }
  }, [initialQuery]);

  const activeHorses = React.useMemo(
    () => horses.filter((horse) => horse.stableId === currentStableId),
    [horses, currentStableId],
  );
  const currentStable = React.useMemo(
    () => stables.find((stable) => stable.id === currentStableId),
    [currentStableId, stables],
  );
  React.useEffect(() => {
    if (settingsDraftStableRef.current !== currentStableId) {
      settingsDraftStableRef.current = currentStableId;
      dirtySettingsRef.current.clear();
    }
    if (!dirtySettingsRef.current.size) setSettingsDraft(resolveStableSettings(currentStable));
  }, [currentStable, currentStableId]);
  const currentRideTypes = React.useMemo(
    () => currentStable?.rideTypes ?? [],
    [currentStable],
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
  const userNameById = React.useMemo(
    () =>
      Object.values(users).reduce<Record<string, string>>((acc, user) => {
        acc[user.id] = user.name;
        return acc;
      }, {}),
    [users],
  );
  const filteredHorses = React.useMemo(() => {
    const query = horseSearch.trim().toLowerCase();
    if (!query) {
      return activeHorses;
    }
    return activeHorses.filter((horse) => {
      const ownerName = horse.ownerUserId ? userNameById[horse.ownerUserId] : '';
      return (
        horse.name.toLowerCase().includes(query) ||
        ownerName.toLowerCase().includes(query)
      );
    });
  }, [activeHorses, horseSearch, userNameById]);
  const isFirstTimeOnboarding = derived.isFirstTimeOnboarding;
  const isAdmin = permissions.canManageOnboarding || isFirstTimeOnboarding;
  const isAdminAny = derived.canManageOnboardingAny;
  const isOwner = isAdmin;
  const canManageMembers = permissions.canManageMembers;
  const canManagePaddocks = permissions.canManagePaddocks;
  const canManageHorses = permissions.canManageHorses;
  const canSaveStable = isAdmin && !creatingStable;
  const canDelegate = !savingInvite && canManageMembers && stables.length > 0;
  const canEditPaddocks = canManagePaddocks && !paddockPending;
  const canEditHorses = canManageHorses && !savingHorse;
  const canEditMembers = canManageMembers && !savingInvite;
  const joinCode = currentStable?.joinCode?.trim() ?? '';
  const canRevealJoinCode = canManageMembers && Boolean(joinCode);
  const canShareJoinCode = Platform.OS !== 'web';

  const paddocks = React.useMemo(
    () => state.paddocks.filter((p) => p.stableId === currentStableId),
    [state.paddocks, currentStableId],
  );
  const horseStableId = horseDraft.stableId || currentStableId;
  const horseGroups = React.useMemo(
    () => {
      const all = activeHorses.map((horse) => horse.name);
      const mine = activeHorses
        .filter((horse) => horse.ownerUserId === currentUserId)
        .map((horse) => horse.name);
      const unassigned = activeHorses
        .filter((horse) => !horse.ownerUserId)
        .map((horse) => horse.name);
      return [
        { id: 'all', label: 'Alla', horseNames: all },
        { id: 'mine', label: 'Mina', horseNames: mine },
        { id: 'unassigned', label: 'Utan ansvarig', horseNames: unassigned },
      ];
    },
    [activeHorses, currentUserId],
  );
  const horseStableMembers = React.useMemo(
    () =>
      Object.values(users).filter((user) =>
        user.membership.some((entry) => entry.stableId === horseStableId),
      ),
    [horseStableId, users],
  );

  const parseHorses = React.useCallback((value: string) => {
    return value
      .split(/[\n,;]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }, []);

  const paddockHorseNames = React.useMemo(
    () => parseHorses(paddockDraft.horsesText),
    [paddockDraft.horsesText, parseHorses],
  );
  const paddockHorseSet = React.useMemo(
    () => new Set(paddockHorseNames.map((name) => name.toLowerCase())),
    [paddockHorseNames],
  );

  const togglePaddockHorse = React.useCallback(
    (name: string) => {
      setPaddockDraft((prev) => {
        const current = parseHorses(prev.horsesText);
        const normalized = name.toLowerCase();
        const exists = current.some((item) => item.toLowerCase() === normalized);
        const next = exists
          ? current.filter((item) => item.toLowerCase() !== normalized)
          : [...current, name];
        return { ...prev, horsesText: next.join('\n') };
      });
    },
    [parseHorses],
  );

  const togglePaddockHorseGroup = React.useCallback(
    (names: string[]) => {
      if (names.length === 0) {
        return;
      }
      setPaddockDraft((prev) => {
        const current = parseHorses(prev.horsesText);
        const currentSet = new Set(current.map((item) => item.toLowerCase()));
        const groupSet = new Set(names.map((name) => name.toLowerCase()));
        const allSelected = Array.from(groupSet).every((name) => currentSet.has(name));
        const next = allSelected
          ? current.filter((item) => !groupSet.has(item.toLowerCase()))
          : [
              ...current,
              ...names.filter((name) => !currentSet.has(name.toLowerCase())),
            ];
        return { ...prev, horsesText: next.join('\n') };
      });
    },
    [parseHorses],
  );

  const fillPaddockHorses = React.useCallback(() => {
    setPaddockDraft((prev) => ({
      ...prev,
      horsesText: activeHorses.map((horse) => horse.name).join('\n'),
    }));
  }, [activeHorses]);

  const clearPaddockHorses = React.useCallback(() => {
    setPaddockDraft((prev) => ({ ...prev, horsesText: '' }));
  }, []);

  const formStableRef = React.useRef('');
  React.useEffect(() => {
    if (formStableRef.current === currentStableId) return;
    formStableRef.current = currentStableId;
    setHorseDraft((prev) => {
      const ownerStillValid = prev.ownerUserId
        ? users[prev.ownerUserId]?.membership?.some((entry) => entry.stableId === currentStableId)
        : false;
      return {
        ...prev,
        stableId: currentStableId,
        ownerUserId: ownerStillValid ? prev.ownerUserId : undefined,
      };
    });
    newPaddockIdRef.current = null;
    setPaddockError(null);
    setPaddockDraft((prev) => ({
      ...prev,
      name: '',
      horsesText: '',
      image: null,
      season: 'yearRound',
      id: undefined,
    }));
    setHorseSearch('');
    setInviteDraft((prev) => {
      const nextStableIds = prev.stableIds.includes(currentStableId)
        ? prev.stableIds
        : [currentStableId, ...prev.stableIds];
      const validHorseIds = prev.horseIds.filter((id) =>
        horses.some((horse) => horse.id === id && horse.stableId === currentStableId),
      );
      if (nextStableIds === prev.stableIds && validHorseIds.length === prev.horseIds.length) {
        return prev;
      }
      return { ...prev, stableIds: nextStableIds, horseIds: validHorseIds };
    });
  }, [currentStableId, horses, users]);
  const genderLabel: Record<NonNullable<Horse['gender']>, string> = {
    mare: 'Sto',
    gelding: 'Valack',
    stallion: 'Hingst',
    unknown: 'Okänt',
  };

  const handleCreateStable = React.useCallback(async () => {
    if (creatingStableRef.current) return;
    if (!stableDraft.name.trim()) {
      toast.showToast('Namn krävs.', 'error');
      return;
    }
    creatingStableRef.current = true;
    setCreatingStable(true);
    setStableCreateError(null);
    newStableIdRef.current ??= generateId();
    const result = await actions.upsertStable({
      id: stableDraft.id,
      requestId: newStableIdRef.current,
      name: stableDraft.name,
      location: stableDraft.location,
      farmId: stableDraft.farmId,
    });
    creatingStableRef.current = false;
    setCreatingStable(false);
    if (result.success) {
      newStableIdRef.current = null;
      toast.showToast(stableDraft.id ? 'Stall uppdaterat.' : 'Stall skapat.', 'success');
      setStableDraft({
        id: undefined,
        name: '',
        location: '',
        farmId: showFarmSection ? stableDraft.farmId : undefined,
      });
    } else {
      setStableCreateError(result.reason);
    }
  }, [
    actions,
    stableDraft.farmId,
    stableDraft.id,
    stableDraft.location,
    stableDraft.name,
    showFarmSection,
    toast,
  ]);

  const handleCreateFarm = React.useCallback(async () => {
    if (savingFarmRef.current) return;
    if (!farmDraft.name.trim()) {
      toast.showToast('Gårdsnamn krävs.', 'error');
      return;
    }
    savingFarmRef.current = true;
    setSavingFarm(true);
    setFarmSaveError(null);
    newFarmIdRef.current ??= generateId();
    const result = await actions.upsertFarm({
      id: farmDraft.id,
      requestId: newFarmIdRef.current,
      name: farmDraft.name,
      location: farmDraft.location,
      hasIndoorArena: farmDraft.hasIndoorArena,
      arenaNote: farmDraft.arenaNote,
    });
    savingFarmRef.current = false;
    setSavingFarm(false);
    if (result.success) {
      newFarmIdRef.current = null;
      toast.showToast(farmDraft.id ? 'Gård uppdaterad.' : 'Gård skapad.', 'success');
      setFarmDraft({ id: undefined, name: '', location: '', hasIndoorArena: false, arenaNote: '' });
      if (result.data && showFarmSection) {
        setStableDraft((prev) => ({ ...prev, farmId: result.data?.id ?? prev.farmId }));
      }
    } else {
      setFarmSaveError(result.reason);
    }
  }, [
    actions,
    farmDraft.arenaNote,
    farmDraft.hasIndoorArena,
    farmDraft.id,
    farmDraft.location,
    farmDraft.name,
    showFarmSection,
    toast,
  ]);

  const handleSaveHorse = React.useCallback(async () => {
    if (savingHorseRef.current) return;
    if (!horseDraft.name.trim()) {
      toast.showToast('Hästens namn krävs.', 'error');
      return;
    }
    const parsedAge = horseDraft.age ? Number(horseDraft.age) : undefined;
    if (horseDraft.age && Number.isNaN(parsedAge)) {
      toast.showToast('Ålder måste vara ett nummer.', 'error');
      return;
    }
    savingHorseRef.current = true;
    setSavingHorse(true);
    setHorseSaveError(null);
    newHorseIdRef.current ??= generateId();
    const result = await actions.upsertHorse({
      id: horseDraft.id ?? newHorseIdRef.current,
      name: horseDraft.name,
      stableId: horseDraft.stableId || currentStableId,
      ownerUserId: horseDraft.ownerUserId,
      image: horseDraft.image,
      gender: horseDraft.gender,
      age: parsedAge,
      note: horseDraft.note,
    });
    savingHorseRef.current = false;
    setSavingHorse(false);
    if (result.success) {
      newHorseIdRef.current = null;
      toast.showToast(horseDraft.id ? 'Häst uppdaterad.' : 'Häst tillagd.', 'success');
      setHorseDraft({
        id: undefined,
        name: '',
        stableId: currentStableId,
        ownerUserId: undefined,
        gender: 'unknown',
        age: '',
        note: '',
        image: null,
      });
    } else {
      setHorseSaveError(result.reason);
      toast.showToast(result.reason, 'error');
    }
  }, [
    actions,
    currentStableId,
    horseDraft.age,
    horseDraft.gender,
    horseDraft.id,
    horseDraft.image,
    horseDraft.name,
    horseDraft.note,
    horseDraft.ownerUserId,
    horseDraft.stableId,
    toast,
  ]);

  const handlePickHorseImage = React.useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.showToast('Ge appen tillgång till bilder för att välja hästfoto.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const asset = result.assets[0];
    setHorseDraft((prev) => ({
      ...prev,
      image: { uri: asset.uri },
    }));
  }, [toast]);

  const handleEditHorse = React.useCallback(
    (horseId: string) => {
      const target = horses.find((horse) => horse.id === horseId);
      if (!target) return;
      setHorseDraft({
        id: target.id,
        name: target.name,
        stableId: target.stableId,
        ownerUserId: target.ownerUserId,
        gender: target.gender ?? 'unknown',
        age: target.age ? `${target.age}` : '',
        note: target.note ?? '',
        image: target.image ?? null,
      });
    },
    [horses],
  );

  const handleDeleteHorse = React.useCallback(
    async (horseId: string) => {
      if (savingHorseRef.current) return;
      const horse = horses.find((entry) => entry.id === horseId);
      if (!horse) return;
      savingHorseRef.current = true;
      try {
        const confirmed = await confirmAction({
          title: `Ta bort ${horse.name}?`,
          message: 'Hästen och tillhörande historik tas bort permanent. Det går inte att ångra.',
          confirmLabel: 'Ta bort häst',
          destructive: true,
        });
        if (!confirmed) return;
        setSavingHorse(true);
        setDeletingHorseId(horseId);
        setHorseDeleteError(null);
        const result = await actions.deleteHorse(horseId);
        if (result.success) {
          toast.showToast('Häst borttagen.', 'success');
          if (horseDraft.id === horseId) {
            setHorseDraft({ id: undefined, name: '', stableId: currentStableId, ownerUserId: undefined,
              gender: 'unknown', age: '', note: '', image: null });
          }
        } else {
          setHorseDeleteError({ id: horseId, reason: result.reason });
        }
      } catch (error) {
        console.warn('[horse delete form] Kunde inte ta bort häst', error);
        setHorseDeleteError({ id: horseId, reason: 'Hästen kunde inte tas bort. Försök igen.' });
      } finally {
        savingHorseRef.current = false;
        setSavingHorse(false);
        setDeletingHorseId(null);
      }
    },
    [actions, currentStableId, horseDraft.id, horses, toast],
  );

  const handleDelegateAdmin = React.useCallback(async () => {
    if (savingInviteRef.current) return;
    if (!delegateDraft.name.trim() || !delegateDraft.email.trim()) {
      toast.showToast('Namn och e-post krävs.', 'error');
      return;
    }
    if (!currentStableId) {
      toast.showToast('Välj ett stall först.', 'error');
      return;
    }
    savingInviteRef.current = true;
    setSavingInvite(true);
    setDelegateInviteError(null);
    const result = await actions.addMember({
      name: delegateDraft.name,
      email: delegateDraft.email,
      phone: delegateDraft.phone.trim() ? delegateDraft.phone.trim() : undefined,
      stableId: currentStableId,
      role: 'admin',
      customRole: 'Stallansvarig',
      access: 'owner',
    });
    savingInviteRef.current = false;
    setSavingInvite(false);
    if (result.success) {
      setDelegateReceipt(result.data ?? null);
      toast.showToast('Inbjudan skapad.', 'success');
      setDelegateDraft({ name: '', email: '', phone: '' });
    } else {
      setDelegateInviteError(result.reason);
      toast.showToast(result.reason, 'error');
    }
  }, [actions, currentStableId, delegateDraft.email, delegateDraft.name, delegateDraft.phone, toast]);

  const handleCopyJoinCode = React.useCallback(async () => {
    if (!joinCode) {
      return;
    }
    try {
      await Clipboard.setStringAsync(joinCode);
      toast.showToast('Inbjudningskoden är kopierad.', 'success');
    } catch (error) {
      console.warn('Kunde inte kopiera inbjudningskod', error);
      toast.showToast('Kunde inte kopiera koden.', 'error');
    }
  }, [joinCode, toast]);

  const handleShareJoinCode = React.useCallback(async () => {
    if (!joinCode || !currentStable) {
      return;
    }
    try {
      await Share.share({
        message: `Gå med i ${currentStable.name} med inbjudningskod: ${joinCode}`,
      });
    } catch (error) {
      console.warn('Kunde inte dela inbjudningskod', error);
      toast.showToast('Kunde inte dela koden.', 'error');
    }
  }, [currentStable, joinCode, toast]);

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

  const handleSavePaddock = React.useCallback(async () => {
    if (savingPaddockRef.current) return;
    if (!paddockDraft.name.trim()) {
      toast.showToast('Hagen behöver ett namn/nummer.', 'error');
      return;
    }
    savingPaddockRef.current = true;
    setPaddockPending('save');
    setPaddockError(null);
    newPaddockIdRef.current ??= generateId();
    const payload = {
      id: paddockDraft.id ?? newPaddockIdRef.current,
      name: paddockDraft.name,
      horseNames: parseHorses(paddockDraft.horsesText),
      stableId: currentStableId,
      image: paddockDraft.image,
      season: paddockDraft.season,
    };
    const result = await actions.upsertPaddock(payload);
    savingPaddockRef.current = false;
    setPaddockPending(null);
    if (result.success) {
      newPaddockIdRef.current = null;
      toast.showToast(paddockDraft.id ? 'Hage uppdaterad.' : 'Hage sparad.', 'success');
      setPaddockDraft({ id: undefined, name: '', horsesText: '', image: null, season: 'yearRound' });
    } else {
      setPaddockError(result.reason);
    }
  }, [actions, currentStableId, paddockDraft, parseHorses, toast]);

  const handleEditPaddock = React.useCallback(
    (id: string) => {
      if (savingPaddockRef.current) return;
      setPaddockError(null);
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

  const handleDeletePaddock = React.useCallback(async (id: string) => {
    if (savingPaddockRef.current) return;
    savingPaddockRef.current = true;
    try {
      const confirmed = await confirmAction({ title: 'Ta bort hage?', message: 'Detta går inte att ångra.', confirmLabel: 'Ta bort', destructive: true });
      if (!confirmed) return;
      setPaddockPending('delete');
      setPaddockError(null);
      const result = await actions.deletePaddock(id);
      if (result.success) {
        toast.showToast('Hage borttagen.', 'success');
        if (paddockDraft.id === id) {
          newPaddockIdRef.current = null;
          setPaddockDraft({ id: undefined, name: '', horsesText: '', image: null, season: 'yearRound' });
        }
      } else {
        setPaddockError(result.reason);
      }
    } finally {
      savingPaddockRef.current = false;
      setPaddockPending(null);
    }
  }, [actions, paddockDraft.id, toast]);

  const resetRideTypeDraft = React.useCallback(() => {
    newRideTypeIdRef.current = null;
    rideTypeOriginalRef.current = null;
    setRideTypeDraft({ id: undefined, code: '', label: '', description: '' });
  }, []);

  React.useEffect(() => {
    resetRideTypeDraft();
  }, [currentStableId, resetRideTypeDraft]);

  const handleSaveRideType = React.useCallback(async () => {
    if (savingSettingsRef.current) return false;
    savingSettingsRef.current = true;
    setSavingSettings(true);
    setSettingsSaveError(null);
    try {
      if (!currentStable) {
        toast.showToast('Välj ett stall först.', 'error');
        return;
      }
      const code = rideTypeDraft.code.trim();
      const label = rideTypeDraft.label.trim();
      if (!code || !label) {
        toast.showToast('Ange både kod och namn.', 'error');
        return;
      }
      newRideTypeIdRef.current ??= generateId();
      const draftId = rideTypeDraft.id ?? newRideTypeIdRef.current;
      const existingIndex = currentRideTypes.findIndex((type) => type.id === draftId);
      const latest = currentRideTypes[existingIndex];
      const original = rideTypeOriginalRef.current;
      if (rideTypeDraft.id && !latest) {
        const reason = 'Ridpass-typen har tagits bort. Ditt utkast finns kvar; avbryt redigeringen för att lägga till en ny.';
        setSettingsSaveError(reason);
        toast.showToast(reason, 'error');
        return;
      }
      const nextType = {
        id: draftId,
        code: original && latest && code === original.code ? latest.code : code,
        label: original && latest && label === original.label ? latest.label : label,
        description: original && latest && rideTypeDraft.description.trim() === (original.description ?? '')
          ? latest.description : rideTypeDraft.description.trim() || undefined,
      };
      const nextRideTypes =
        existingIndex >= 0
          ? currentRideTypes.map((type) => (type.id === draftId ? nextType : type))
          : [...currentRideTypes, nextType];

      const result = await actions.updateStable({
        id: currentStable.id,
        updates: { rideTypes: nextRideTypes },
      });
      if (result.success) {
        toast.showToast(rideTypeDraft.id ? 'Ridpass-typ uppdaterad.' : 'Ridpass-typ sparad.', 'success');
        resetRideTypeDraft();
      } else {
        setSettingsSaveError(result.reason);
        toast.showToast(result.reason, 'error');
      }
    } finally { savingSettingsRef.current = false; setSavingSettings(false); }
  }, [actions, currentRideTypes, currentStable, resetRideTypeDraft, rideTypeDraft, toast]);

  const handleEditRideType = React.useCallback(
    (id: string) => {
      if (savingSettingsRef.current) return;
      const target = currentRideTypes.find((type) => type.id === id);
      if (!target) return;
      rideTypeOriginalRef.current = { ...target };
      setRideTypeDraft({
        id: target.id,
        code: target.code,
        label: target.label,
        description: target.description ?? '',
      });
    },
    [currentRideTypes],
  );

  const handleDeleteRideType = React.useCallback(
    async (id: string) => {
      if (savingSettingsRef.current) return false;
      savingSettingsRef.current = true;
      setSavingSettings(true);
      setSettingsSaveError(null);
      try {
          if (!currentStable) {
            toast.showToast('Välj ett stall först.', 'error');
            return;
          }
          const nextRideTypes = currentRideTypes.filter((type) => type.id !== id);
          const result = await actions.updateStable({
            id: currentStable.id,
            updates: { rideTypes: nextRideTypes },
          });
          if (result.success) {
            toast.showToast('Ridpass-typ borttagen.', 'success');
            if (rideTypeDraft.id === id) {
              resetRideTypeDraft();
            }
          } else {
            setSettingsSaveError(result.reason);
            toast.showToast(result.reason, 'error');
          }
      } finally { savingSettingsRef.current = false; setSavingSettings(false); }
    },
    [actions, currentRideTypes, currentStable, resetRideTypeDraft, rideTypeDraft.id, toast],
  );

  const handleToggleEventVisibility = React.useCallback((key: keyof StableEventVisibility) => {
    dirtySettingsRef.current.add(key);
    setSettingsDraft((prev) => ({
      ...prev,
      eventVisibility: {
        ...prev.eventVisibility,
        [key]: !prev.eventVisibility[key],
      },
    }));
  }, []);

  const handleSetDayLogic = React.useCallback((value: StableSettings['dayLogic']) => {
    dirtySettingsRef.current.add('dayLogic');
    setSettingsDraft((prev) => ({ ...prev, dayLogic: value }));
  }, []);

  const handleSaveSettings = React.useCallback(async () => {
    if (savingSettingsRef.current) return false;
    savingSettingsRef.current = true;
    setSavingSettings(true);
    setSettingsSaveError(null);
    try {
      if (!currentStable) {
        toast.showToast('Välj ett stall först.', 'error');
        return;
      }
      const result = await actions.updateStable({
        id: currentStable.id,
        updates: { settings: {
          ...(dirtySettingsRef.current.has('dayLogic') ? { dayLogic: settingsDraft.dayLogic } : {}),
          eventVisibility: Object.fromEntries(Object.entries(settingsDraft.eventVisibility).filter(([key]) => dirtySettingsRef.current.has(key))),
        } },
      });
      if (result.success) {
        dirtySettingsRef.current.clear();
        toast.showToast('Stallinställningar sparade.', 'success');
      } else {
        setSettingsSaveError(result.reason);
        toast.showToast(result.reason, 'error');
      }
    } finally { savingSettingsRef.current = false; setSavingSettings(false); }
  }, [actions, currentStable, settingsDraft, toast]);

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

  if (!isAdminAny) {
    const restrictedContent = (
      <>
        <ScreenHeader
          title={horsesOnly ? 'Hantera hästar' : 'Stall och hästar'}
          style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
          left={
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Text style={styles.backIcon}>‹</Text>
            </TouchableOpacity>
          }
          showLogo={false}
          showSearch={false}
        />
        <View style={[styles.restrictedWrap, isDesktopWeb && styles.restrictedWrapDesktop]}>
          <Card tone="muted" style={[styles.card, isDesktopWeb && styles.cardDesktop, styles.restrictedCard]}>
            <Text style={styles.sectionTitle}>Admin krävs</Text>
            <Text style={styles.restrictedText}>
              Endast gårds- eller stalladmin kan se och redigera inställningar här.
            </Text>
          </Card>
        </View>
      </>
    );

    return (
      <LinearGradient colors={theme.gradients.background} style={styles.background}>
        <SafeAreaView style={styles.safeArea}>
          {wrapDesktop(restrictedContent)}
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={theme.gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        {wrapDesktop(
          <>
            <ScreenHeader
              title={horsesOnly ? 'Hantera hästar' : 'Stall och hästar'}
              style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
              left={
                <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                  <Text style={styles.backIcon}>‹</Text>
                </TouchableOpacity>
              }
              showLogo={false}
              showSearch={false}
            />
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.desktopLayout, isDesktopWeb && styles.desktopLayoutDesktop]}>
                {!horsesOnly && <View style={[styles.stepHeader, isDesktopWeb && styles.stepHeaderDesktop, stickyPanelStyle]}>
                  <Text style={styles.sectionTitle}>Snabbstart</Text>
                  <Card
                    tone="muted"
                    style={[
                      styles.card,
                      isDesktopWeb && styles.cardDesktop,
                      styles.stepCard,
                      isDesktopWeb && styles.stepCardDesktop,
                      styles.branchCard,
                    ]}
                  >
                    <Text style={styles.branchTitle}>Grunderna först</Text>
                    <Text style={styles.branchText}>
                      Skapa ett stall och bjud in medlemmar. Ridpass-typer, hagar och inställningar kan fixas senare.
                    </Text>
                    {showFarmSection ? (
                      <Text style={styles.branchHint}>
                        Gård är valfritt och visas nu eftersom du har flera stall.
                      </Text>
                    ) : null}
                  </Card>
                  {!isAdmin ? (
                    <Card tone="muted" style={[styles.card, isDesktopWeb && styles.cardDesktop, styles.restrictedCard]}>
                      <Text style={styles.sectionTitle}>Behörighet saknas</Text>
                      <Text style={styles.restrictedText}>
                        Du är inte admin för valt stall. Byt stall för att fortsätta här.
                      </Text>
                    </Card>
                  ) : null}
                </View>}

                <View style={[styles.stepBody, isDesktopWeb && styles.stepBodyDesktop]}>
          {!horsesOnly && <>
          {showFarmSection ? (
            <Card tone="muted" style={[styles.card, isDesktopWeb && styles.cardDesktop, styles.stepCard, isDesktopWeb && styles.stepCardDesktop]}>
              <Text style={styles.sectionTitle}>Gårdar (valfritt)</Text>
              <View style={[styles.splitRow, isDesktopWeb && styles.splitRowDesktop]}>
                <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnNarrow]}>
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
                </View>
                <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnWide]}>
                  <View style={styles.stableForm}>
                    <Text style={styles.formLabel}>Lägg till gård</Text>
                    {farmSaveError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{farmSaveError}</Text> : null}
                    {savingFarm ? <Text accessibilityLiveRegion="polite">Sparar gården…</Text> : null}
                    <TextInput
                      placeholder="Namn"
                      placeholderTextColor={palette.mutedText}
                      value={farmDraft.name}
                      onChangeText={(text) => setFarmDraft((prev) => ({ ...prev, name: text }))}
                      style={styles.input}
                      editable={isOwner && !savingFarm}
                    />
                    <TextInput
                      placeholder="Plats (valfritt)"
                      placeholderTextColor={palette.mutedText}
                      value={farmDraft.location}
                      onChangeText={(text) => setFarmDraft((prev) => ({ ...prev, location: text }))}
                      style={styles.input}
                      editable={isOwner && !savingFarm}
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
                            disabled={!isOwner || savingFarm}
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
                      editable={isOwner && !savingFarm}
                    />
                    <TouchableOpacity
                      style={[styles.primaryButton, !isOwner && styles.primaryButtonDisabled]}
                      onPress={handleCreateFarm}
                      activeOpacity={0.9}
                      disabled={!isOwner || savingFarm}
                    >
                      <Text style={styles.primaryButtonText}>Spara gård</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Card>
          ) : null}

          <Card tone="muted" style={[styles.card, isDesktopWeb && styles.cardDesktop, styles.stepCard, isDesktopWeb && styles.stepCardDesktop]}>
            <Text style={styles.sectionTitle}>Dina stall</Text>
              <View style={[styles.splitRow, isDesktopWeb && styles.splitRowDesktop]}>
                <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnNarrow]}>
                  <View style={styles.stableList}>
                    {stables.map((stable) => {
                      const active = stable.id === currentStableId;
                      const role = currentUser.membership.find((m) => m.stableId === stable.id)?.role;
                      const roleLabel = role ? sharedRoleLabels[role] : undefined;
                      const locationLabel = [farmNameById[stable.farmId ?? ''], stable.location].filter(Boolean).join(' · ');
                      return (
                        <TouchableOpacity
                          key={stable.id}
                          style={[styles.stableRow, active && styles.stableRowActive]}
                          disabled={Boolean(paddockPending)}
                          onPress={() => actions.setCurrentStable(stable.id)}
                          activeOpacity={0.85}
                        >
                          <View>
                            <Text style={styles.stableName}>{stable.name}</Text>
                            {locationLabel ? <Text style={styles.stableLocation}>{locationLabel}</Text> : null}
                          </View>
                          <View style={styles.stableMeta}>
                            {roleLabel ? <Text style={styles.rolePill}>{roleLabel}</Text> : null}
                            {active ? <Text style={styles.activePill}>Aktiv</Text> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                    {stables.length === 0 ? <Text style={styles.emptyText}>Inga stall ännu.</Text> : null}
                  </View>
                </View>
                <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnWide]}>
                  <View style={styles.formStack}>
                    <View style={styles.stableForm}>
                      <Text style={styles.formLabel}>Nytt stall</Text>
                      {stableCreateError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{stableCreateError}</Text> : null}
                      {creatingStable ? <Text accessibilityLiveRegion="polite">Skapar stallet…</Text> : null}
                      <TextInput
                        placeholder="Namn"
                        placeholderTextColor={palette.mutedText}
                        value={stableDraft.name}
                        onChangeText={(text) => setStableDraft((prev) => ({ ...prev, name: text }))}
                        style={styles.input}
                        editable={isOwner && !creatingStable}
                      />
                      <TextInput
                        placeholder="Plats (valfritt)"
                        placeholderTextColor={palette.mutedText}
                        value={stableDraft.location}
                        onChangeText={(text) => setStableDraft((prev) => ({ ...prev, location: text }))}
                        style={styles.input}
                        editable={isOwner && !creatingStable}
                      />
                      {showFarmSection ? (
                        <>
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
                                  disabled={!isOwner || creatingStable}
                                >
                                  <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>{farm.name}</Text>
                                </TouchableOpacity>
                              );
                            })}
                            {farms.length === 0 ? (
                              <Text style={styles.emptyText}>Lägg till en gård om du vill koppla stallen.</Text>
                            ) : null}
                          </View>
                        </>
                      ) : null}
                      <TouchableOpacity
                        style={[styles.primaryButton, !canSaveStable && styles.primaryButtonDisabled]}
                        onPress={handleCreateStable}
                        activeOpacity={0.9}
                        disabled={!canSaveStable}
                      >
                        <Text style={styles.primaryButtonText}>Spara stall</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.stableForm}>
                      <Text style={styles.formLabel}>Delegiera stallansvarig</Text>
                      <Text style={styles.formHint}>
                        Bjud in en admin som kan hjälpa till med inställningarna för {currentStable?.name ?? 'valt stall'}.
                      </Text>
                      <InviteReceipt confirmation={delegateReceipt} />
                      {delegateInviteError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{delegateInviteError}</Text>}
                      {stables.length === 0 ? <Text style={styles.emptyText}>Skapa ett stall först.</Text> : null}
                      <TextInput
                        placeholder="Namn"
                        placeholderTextColor={palette.mutedText}
                        value={delegateDraft.name}
                        onChangeText={(text) => setDelegateDraft((prev) => ({ ...prev, name: text }))}
                        style={styles.input}
                        editable={canDelegate}
                      />
                      <TextInput
                        placeholder="E-post"
                        placeholderTextColor={palette.mutedText}
                        value={delegateDraft.email}
                        onChangeText={(text) => setDelegateDraft((prev) => ({ ...prev, email: text }))}
                        style={styles.input}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        editable={canDelegate}
                      />
                      <TextInput
                        placeholder="Telefon (valfritt)"
                        placeholderTextColor={palette.mutedText}
                        value={delegateDraft.phone}
                        onChangeText={(text) => setDelegateDraft((prev) => ({ ...prev, phone: text }))}
                        style={styles.input}
                        keyboardType="phone-pad"
                        editable={canDelegate}
                      />
                      <TouchableOpacity
                        style={[styles.primaryButton, !canDelegate && styles.primaryButtonDisabled]}
                        onPress={handleDelegateAdmin}
                        activeOpacity={0.9}
                        disabled={!canDelegate}
                      >
                        <Text style={styles.primaryButtonText}>{savingInvite ? 'Skapar inbjudan…' : 'Bjud in ansvarig admin'}</Text>
                      </TouchableOpacity>
                    </View>
                    {canRevealJoinCode ? (
                      <>
                        <View style={styles.divider} />
                        <View style={styles.stableForm}>
                          <Text style={styles.formLabel}>Inbjudningskod</Text>
                          <Text style={styles.formHint}>Dela koden med nya medlemmar för att gå med.</Text>
                          <View style={styles.joinCodeRow}>
                            <TextInput
                              value={joinCode}
                              editable={false}
                              selectTextOnFocus
                              style={[styles.input, styles.joinCodeInput]}
                            />
                            <TouchableOpacity
                              style={styles.inlineActionButton}
                              onPress={handleCopyJoinCode}
                              activeOpacity={0.85}
                            >
                              <Text style={styles.inlineActionText}>Kopiera</Text>
                            </TouchableOpacity>
                            {canShareJoinCode ? (
                              <TouchableOpacity
                                style={styles.inlineActionButton}
                                onPress={handleShareJoinCode}
                                activeOpacity={0.85}
                              >
                                <Text style={styles.inlineActionText}>Dela</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      </>
                    ) : null}
                  </View>
                </View>
              </View>
          </Card>

          <Card tone="muted" style={[styles.card, isDesktopWeb && styles.cardDesktop, styles.stepCard, isDesktopWeb && styles.stepCardDesktop]}>
            <Text style={styles.sectionTitle}>Stallinställningar (valfritt)</Text>
            <DataSyncStatus />
            {settingsSaveError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{settingsSaveError}</Text>}
              <Text style={styles.formHint}>
                Styr vilka händelser som syns i schemat och hur dygnslogiken ser ut.
              </Text>

              <View style={styles.settingsSection}>
                <Text style={styles.formLabel}>Dygnslogik</Text>
                <View style={[styles.settingsOptionRow, isDesktopWeb && styles.settingsOptionRowDesktop]}>
                  {dayLogicOptions.map((option) => {
                    const active = settingsDraft.dayLogic === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.settingsOptionCard,
                          active && styles.settingsOptionCardActive,
                          !isOwner && styles.settingsOptionCardDisabled,
                        ]}
                        onPress={() => isOwner && handleSetDayLogic(option.id)}
                        activeOpacity={0.85}
                        disabled={!isOwner || savingSettings}
                      >
                        <Text style={[styles.settingsOptionTitle, active && styles.settingsOptionTitleActive]}>
                          {option.title}
                        </Text>
                        <Text style={styles.settingsOptionDesc}>{option.description}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.formLabel}>Händelser i schema</Text>
                <Text style={styles.formHint}>
                  Aktivera det som ska synas för personal och medryttare.
                </Text>
                <View style={styles.chipRow}>
                  {eventVisibilityOptions.map((option) => {
                    const active = settingsDraft.eventVisibility[option.id];
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.accessChip,
                          active && styles.accessChipActive,
                          !isOwner && styles.accessChipDisabled,
                        ]}
                        onPress={() => isOwner && handleToggleEventVisibility(option.id)}
                        activeOpacity={0.85}
                        disabled={!isOwner || savingSettings}
                      >
                        <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, !isOwner && styles.primaryButtonDisabled]}
                onPress={handleSaveSettings}
                activeOpacity={0.9}
                disabled={!isOwner || savingSettings}
              >
                <Text style={styles.primaryButtonText}>{savingSettings ? 'Sparar…' : 'Spara inställningar'}</Text>
              </TouchableOpacity>
          </Card>

          <Card tone="muted" style={[styles.card, isDesktopWeb && styles.cardDesktop, styles.stepCard, isDesktopWeb && styles.stepCardDesktop]}>
            <Text style={styles.sectionTitle}>Ridpass-typer (valfritt)</Text>
              <Text style={styles.formHint}>
                Ange de koder/benämningar som används i stallet (t.ex. K, K+, M, Dressyr).
              </Text>
              <View style={[styles.splitRow, isDesktopWeb && styles.splitRowDesktop]}>
                <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnNarrow]}>
                  <View style={styles.rideTypeList}>
                    {currentRideTypes.map((type) => (
                      <View key={type.id} style={styles.rideTypeRow}>
                        <View style={styles.rideTypeInfo}>
                          <View style={styles.rideTypeCodePill}>
                            <Text style={styles.rideTypeCodeText}>{type.code}</Text>
                          </View>
                          <View>
                            <Text style={styles.rideTypeLabel}>{type.label}</Text>
                            {type.description ? (
                              <Text style={styles.rideTypeMeta}>{type.description}</Text>
                            ) : null}
                          </View>
                        </View>
                        <View style={styles.rideTypeActions}>
                          <TouchableOpacity
                            style={styles.rideTypeButton}
                            onPress={() => handleEditRideType(type.id)}
                            activeOpacity={0.85}
                          >
                            <Feather name="edit-3" size={14} color={palette.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rideTypeButton}
                            onPress={() => handleDeleteRideType(type.id)}
                            activeOpacity={0.85}
                          >
                            <Feather name="x" size={14} color={palette.secondaryText} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                    {currentRideTypes.length === 0 ? (
                      <Text style={styles.emptyText}>Lägg till en ridpass-typ när du är redo.</Text>
                    ) : null}
                  </View>
                </View>
                <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnWide]}>
                  <View style={styles.stableForm}>
                    <Text style={styles.formLabel}>Ny ridpass-typ</Text>
                    <View style={styles.rideTypeInputRow}>
                      <TextInput
                        placeholder="Kod (K, K+, M...)"
                        placeholderTextColor={palette.mutedText}
                        value={rideTypeDraft.code}
                        onChangeText={(text) => setRideTypeDraft((prev) => ({ ...prev, code: text }))}
                        style={[styles.input, styles.rideTypeInputShort]}
                        editable={isOwner && !savingSettings}
                      />
                      <TextInput
                        placeholder="Namn"
                        placeholderTextColor={palette.mutedText}
                        value={rideTypeDraft.label}
                        onChangeText={(text) => setRideTypeDraft((prev) => ({ ...prev, label: text }))}
                        style={[styles.input, styles.rideTypeInputLong]}
                        editable={isOwner && !savingSettings}
                      />
                    </View>
                    <TextInput
                      placeholder="Beskrivning (valfritt)"
                      placeholderTextColor={palette.mutedText}
                      value={rideTypeDraft.description}
                      onChangeText={(text) => setRideTypeDraft((prev) => ({ ...prev, description: text }))}
                      style={styles.input}
                      editable={isOwner && !savingSettings}
                    />
                    <View style={styles.rideTypeFooter}>
                      {rideTypeDraft.id ? (
                        <TouchableOpacity
                          style={[styles.secondaryButton, styles.secondaryButtonCompact]}
                          onPress={resetRideTypeDraft}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.secondaryButtonLabel}>Avbryt</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        style={[styles.primaryButton, !isOwner && styles.primaryButtonDisabled]}
                        onPress={handleSaveRideType}
                        activeOpacity={0.9}
                        disabled={!isOwner || savingSettings}
                      >
                        <Text style={styles.primaryButtonText}>
                          {savingSettings ? 'Sparar…' : rideTypeDraft.id ? 'Spara ändring' : 'Lägg till'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
          </Card>

          <Card tone="muted" style={[styles.card, isDesktopWeb && styles.cardDesktop, styles.stepCard, isDesktopWeb && styles.stepCardDesktop]}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>
                Hagar i {currentStable?.name ?? 'valt stall'} (valfritt)
              </Text>
                <Text style={styles.countText}>{paddocks.length}</Text>
              </View>
              <View style={[styles.splitRow, isDesktopWeb && styles.splitRowDesktop]}>
                <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnNarrow]}>
                  <View style={styles.paddockList}>
                    {paddocks.map((paddock) => (
                      <View key={paddock.id} style={styles.paddockRow}>
                        <TouchableOpacity
                          style={styles.paddockMain}
                          activeOpacity={0.85}
                          onPress={() => handleEditPaddock(paddock.id)}
                          disabled={!canEditPaddocks}
                        >
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
                        {canManagePaddocks ? (
                          <TouchableOpacity
                            style={styles.removeButton}
                            disabled={!canEditPaddocks}
                            accessibilityRole="button"
                            accessibilityLabel={`Ta bort ${paddock.name}`}
                            onPress={() => handleDeletePaddock(paddock.id)}
                          >
                            <Feather name="trash-2" size={14} color={palette.error} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))}
                    {paddocks.length === 0 ? <Text style={styles.emptyText}>Inga hagar ännu.</Text> : null}
                  </View>
                </View>
                <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnWide]}>
                  <View style={styles.stableForm}>
                    <Text style={styles.formLabel}>{paddockDraft.id ? 'Redigera hage' : 'Ny hage/karta'}</Text>
                    {paddockError ? <Text accessibilityRole="alert" style={{ color: palette.error }}>{paddockError}</Text> : null}
                    {paddockPending ? <Text accessibilityLiveRegion="polite">{paddockPending === 'delete' ? 'Tar bort hagen…' : 'Sparar hagen…'}</Text> : null}
                    <TextInput
                      placeholder="Namn eller nummer"
                      placeholderTextColor={palette.mutedText}
                      value={paddockDraft.name}
                      onChangeText={(text) => setPaddockDraft((prev) => ({ ...prev, name: text }))}
                      style={styles.input}
                      editable={canEditPaddocks}
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
                            onPress={() =>
                              canEditPaddocks && setPaddockDraft((prev) => ({ ...prev, season: option.id }))
                            }
                            activeOpacity={0.85}
                            disabled={!canEditPaddocks}
                          >
                            <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>{option.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={styles.rowBetween}>
                      <Text style={styles.formLabel}>Hästar</Text>
                      <View style={styles.inlineActionRow}>
                        <TouchableOpacity
                          style={[
                            styles.inlineActionButton,
                            (!canEditPaddocks || activeHorses.length === 0) && styles.inlineActionButtonDisabled,
                          ]}
                          onPress={fillPaddockHorses}
                          activeOpacity={0.85}
                          disabled={!canEditPaddocks || activeHorses.length === 0}
                        >
                          <Text style={styles.inlineActionText}>Fyll alla</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.inlineActionButton,
                            (!canEditPaddocks || paddockDraft.horsesText.trim().length === 0) &&
                              styles.inlineActionButtonDisabled,
                          ]}
                          onPress={clearPaddockHorses}
                          activeOpacity={0.85}
                          disabled={!canEditPaddocks || paddockDraft.horsesText.trim().length === 0}
                        >
                          <Text style={styles.inlineActionText}>Rensa</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {horseGroups.some((group) => group.horseNames.length > 0) ? (
                      <>
                        <Text style={styles.formHint}>Grupper</Text>
                        <View style={styles.chipRow}>
                          {horseGroups.map((group) => {
                            const allSelected =
                              group.horseNames.length > 0 &&
                              group.horseNames.every((name) =>
                                paddockHorseSet.has(name.toLowerCase()),
                              );
                            const disabled = group.horseNames.length === 0 || !canEditPaddocks;
                            return (
                              <TouchableOpacity
                                key={group.id}
                                style={[
                                  styles.accessChip,
                                  allSelected && styles.accessChipActive,
                                  disabled && styles.accessChipDisabled,
                                ]}
                                onPress={() => canEditPaddocks && togglePaddockHorseGroup(group.horseNames)}
                                activeOpacity={0.85}
                                disabled={disabled}
                              >
                                <Text
                                  style={[
                                    styles.accessChipText,
                                    allSelected && styles.accessChipTextActive,
                                  ]}
                                >
                                  {group.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </>
                    ) : null}
                    {activeHorses.length > 0 ? (
                      <View style={styles.chipRow}>
                        {activeHorses.map((horse) => {
                          const active = paddockHorseSet.has(horse.name.toLowerCase());
                          return (
                            <TouchableOpacity
                              key={horse.id}
                              style={[styles.accessChip, active && styles.accessChipActive]}
                              onPress={() => canEditPaddocks && togglePaddockHorse(horse.name)}
                              activeOpacity={0.85}
                              disabled={!canEditPaddocks}
                            >
                              <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>
                                {horse.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={styles.emptyText}>Inga hästar att välja ännu.</Text>
                    )}
                    <TextInput
                      placeholder={'En per rad eller komma-separerat\nEx.\nCinder\nAtlas'}
                      placeholderTextColor={palette.mutedText}
                      value={paddockDraft.horsesText}
                      onChangeText={(text) => setPaddockDraft((prev) => ({ ...prev, horsesText: text }))}
                      style={[styles.input, { minHeight: 70 }]}
                      editable={canEditPaddocks}
                      multiline
                    />
                    <Text style={styles.formLabel}>Bild/karta</Text>
                    {paddockDraft.image?.uri ? (
                      <Image source={{ uri: paddockDraft.image.uri }} style={styles.paddockPreview} />
                    ) : (
                      <View style={styles.paddockPreviewPlaceholder}>
                        <Feather name="map" size={16} color={palette.mutedText} />
                        <Text style={[styles.formHint, styles.formHintCentered]}>
                          Ladda upp en bild på hagkarta/skylt
                        </Text>
                      </View>
                    )}
                    <View style={styles.imageRow}>
                      <TouchableOpacity
                        style={[styles.imageButton, !canEditPaddocks && styles.primaryButtonDisabled]}
                        onPress={handlePickPaddockImage}
                        activeOpacity={0.85}
                        disabled={!canEditPaddocks}
                      >
                        <Feather name="upload" size={14} color={palette.primaryText} />
                        <Text style={styles.imageButtonText}>Välj bild</Text>
                      </TouchableOpacity>
                      {paddockDraft.image ? (
                        <TouchableOpacity
                          style={styles.imageButtonDanger}
                          onPress={() => setPaddockDraft((prev) => ({ ...prev, image: null }))}
                          activeOpacity={0.85}
                          disabled={!canEditPaddocks}
                        >
                          <Feather name="x" size={14} color={palette.error} />
                          <Text style={styles.imageButtonDangerText}>Ta bort</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={[styles.primaryButton, !canEditPaddocks && styles.primaryButtonDisabled]}
                      onPress={handleSavePaddock}
                      activeOpacity={0.9}
                      disabled={!canEditPaddocks}
                    >
                      <Text style={styles.primaryButtonText}>{paddockDraft.id ? 'Uppdatera hage' : 'Spara hage'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
          </Card>
          </>}

          <>
            <Card tone="muted" style={[styles.card, isDesktopWeb && styles.cardDesktop, styles.stepCard, isDesktopWeb && styles.stepCardDesktop]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionTitle}>Hästar i {currentStable?.name ?? 'valt stall'}</Text>
                  <Text style={styles.countText}>
                    {filteredHorses.length}
                    {horseSearch.trim() ? ` / ${activeHorses.length}` : ''}
                  </Text>
                </View>
                <View style={[styles.splitRow, isDesktopWeb && styles.splitRowDesktop]}>
                  <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnNarrow]}>
                    <TextInput
                      placeholder="Sök häst eller ansvarig"
                      placeholderTextColor={palette.mutedText}
                      value={horseSearch}
                      onChangeText={setHorseSearch}
                      style={[styles.input, styles.searchInput]}
                      editable={canEditHorses}
                    />
                    <View style={styles.horseList}>
                      {filteredHorses.map((horse) => {
                        const meta = [
                          horse.gender ? genderLabel[horse.gender] : null,
                          horse.age ? `${horse.age} år` : null,
                        ]
                          .filter(Boolean)
                          .join(' • ');
                        const ownerName = horse.ownerUserId ? userNameById[horse.ownerUserId] : undefined;
                        return (
                          <View key={horse.id} style={styles.horseRow}>
                            <TouchableOpacity
                              style={styles.horseRowMain}
                              onPress={() => handleEditHorse(horse.id)}
                              activeOpacity={0.85}
                              disabled={!canEditHorses}
                            >
                              {horse.image ? (
                                <Image source={horse.image} style={styles.horseAvatar} />
                              ) : (
                                <View style={styles.horseAvatarPlaceholder}>
                                  <Feather name="image" size={14} color={palette.mutedText} />
                                </View>
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={styles.horseName}>{horse.name}</Text>
                                {meta ? <Text style={styles.horseMeta}>{meta}</Text> : null}
                                {ownerName ? <Text style={styles.horseMeta}>Ansvarig: {ownerName}</Text> : null}
                                {horse.note ? <Text style={styles.horseNote}>{horse.note}</Text> : null}
                                {deletingHorseId === horse.id ? <Text>Tar bort hästen…</Text> : null}
                                {horseDeleteError?.id === horse.id ? (
                                  <Text accessibilityRole="alert" style={{ color: palette.error }}>{horseDeleteError.reason}</Text>
                                ) : null}
                              </View>
                            </TouchableOpacity>
                            {canManageHorses ? (
                              <TouchableOpacity style={[styles.removeButton, { minWidth: 44, minHeight: 44 }]}
                                disabled={!canEditHorses} accessibilityRole="button" accessibilityLabel={`Ta bort ${horse.name}`}
                                onPress={() => handleDeleteHorse(horse.id)}>
                                <Feather name="trash-2" size={14} color={palette.error} />
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        );
                      })}
                      {filteredHorses.length === 0 ? (
                        <Text style={styles.emptyText}>
                          {horseSearch.trim() ? 'Inga träffar på din sökning.' : 'Inga hästar ännu.'}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnWide]}>
                    <View style={styles.stableForm}>
                      <Text style={styles.formLabel}>{horseDraft.id ? 'Redigera häst' : 'Lägg till häst'}</Text>
                      <Text style={styles.formLabel}>Stall</Text>
                      <View style={styles.chipRow}>
                        {stables.map((stable) => {
                          const active = horseDraft.stableId === stable.id;
                          return (
                            <TouchableOpacity
                              key={stable.id}
                              style={[styles.accessChip, active && styles.accessChipActive]}
                              onPress={() => canEditHorses && setHorseDraft((prev) => ({ ...prev, stableId: stable.id }))}
                              activeOpacity={0.85}
                              disabled={!canEditHorses}
                            >
                              <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>{stable.name}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <Text style={styles.formLabel}>Ägare/ansvarig</Text>
                      {horseStableMembers.length === 0 ? (
                        <Text style={styles.emptyText}>Bjud in en medlem först.</Text>
                      ) : (
                        <View style={styles.chipRow}>
                          <TouchableOpacity
                            style={[styles.accessChip, !horseDraft.ownerUserId && styles.accessChipActive]}
                            onPress={() =>
                              canEditHorses && setHorseDraft((prev) => ({ ...prev, ownerUserId: undefined }))
                            }
                            activeOpacity={0.85}
                            disabled={!canEditHorses}
                          >
                            <Text
                              style={[
                                styles.accessChipText,
                                !horseDraft.ownerUserId && styles.accessChipTextActive,
                              ]}
                            >
                              Ingen
                            </Text>
                          </TouchableOpacity>
                          {horseStableMembers.map((member) => {
                            const active = horseDraft.ownerUserId === member.id;
                            return (
                              <TouchableOpacity
                                key={member.id}
                                style={[styles.accessChip, active && styles.accessChipActive]}
                                onPress={() =>
                                  canEditHorses && setHorseDraft((prev) => ({ ...prev, ownerUserId: member.id }))
                                }
                                activeOpacity={0.85}
                                disabled={!canEditHorses}
                              >
                                <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>
                                  {member.name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                      <TextInput
                        placeholder="Namn"
                        placeholderTextColor={palette.mutedText}
                        value={horseDraft.name}
                        onChangeText={(text) => setHorseDraft((prev) => ({ ...prev, name: text }))}
                        style={styles.input}
                        editable={canEditHorses}
                      />
                      <Text style={styles.formLabel}>Kön</Text>
                      <View style={styles.chipRow}>
                        {(['mare', 'gelding', 'stallion', 'unknown'] as const).map((gender) => {
                          const active = horseDraft.gender === gender;
                          return (
                            <TouchableOpacity
                              key={gender}
                              style={[styles.accessChip, active && styles.accessChipActive]}
                              onPress={() => canEditHorses && setHorseDraft((prev) => ({ ...prev, gender }))}
                              activeOpacity={0.85}
                              disabled={!canEditHorses}
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
                        editable={canEditHorses}
                        keyboardType="numeric"
                      />
                      <TextInput
                        placeholder="Anteckning (t.ex. temperament, viktiga behov)"
                        placeholderTextColor={palette.mutedText}
                        value={horseDraft.note}
                        onChangeText={(text) => setHorseDraft((prev) => ({ ...prev, note: text }))}
                        style={[styles.input, { minHeight: 46 }]}
                        editable={canEditHorses}
                        multiline
                      />
                      <Text style={styles.formLabel}>Bild</Text>
                      {horseDraft.image ? (
                        <Image source={horseDraft.image} style={styles.horsePreview} />
                      ) : (
                        <View style={styles.horsePreviewPlaceholder}>
                          <Feather name="camera" size={16} color={palette.mutedText} />
                          <Text style={[styles.formHint, styles.formHintCentered]}>Lägg till ett foto</Text>
                        </View>
                      )}
                      <View style={styles.imageRow}>
                        <TouchableOpacity
                          style={[styles.imageButton, !canEditHorses && styles.primaryButtonDisabled]}
                          onPress={handlePickHorseImage}
                          activeOpacity={0.85}
                          disabled={!canEditHorses}
                        >
                          <Feather name="upload" size={14} color={palette.primaryText} />
                          <Text style={styles.imageButtonText}>Välj bild</Text>
                        </TouchableOpacity>
                        {horseDraft.image ? (
                          <TouchableOpacity
                            style={styles.imageButtonDanger}
                            onPress={() => setHorseDraft((prev) => ({ ...prev, image: null }))}
                            activeOpacity={0.85}
                            disabled={!canEditHorses}
                          >
                            <Feather name="x" size={14} color={palette.error} />
                            <Text style={styles.imageButtonDangerText}>Ta bort</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      {horseSaveError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{horseSaveError}</Text>}
                      <TouchableOpacity
                        accessibilityRole="button"
                        style={[styles.primaryButton, !canEditHorses && styles.primaryButtonDisabled]}
                        onPress={handleSaveHorse}
                        activeOpacity={0.9}
                        disabled={!canEditHorses}
                      >
                        <Text style={styles.primaryButtonText}>
                          {savingHorse ? 'Sparar…' : horseDraft.id ? 'Uppdatera häst' : 'Spara häst'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Card>

            {!horsesOnly && <Card tone="muted" style={[styles.card, isDesktopWeb && styles.cardDesktop, styles.stepCard, isDesktopWeb && styles.stepCardDesktop]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionTitle}>Medlemmar i {currentStable?.name ?? 'valt stall'}</Text>
                  <Text style={styles.countText}>
                    {Object.values(users).filter((u) => u.membership.some((m) => m.stableId === currentStableId)).length}
                  </Text>
                </View>
                <View style={[styles.splitRow, isDesktopWeb && styles.splitRowDesktop]}>
                  <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnNarrow]}>
                    <View style={styles.memberList}>
                      {memberSaving && <Text accessibilityLiveRegion="polite" style={styles.memberMeta}>Sparar medlemsändring…</Text>}
                      {memberError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{memberError}</Text>}
                      {Object.values(users)
                        .filter((user) => user.membership.some((m) => m.stableId === currentStableId))
                        .map((user) => {
                          const membership = user.membership.find((m) => m.stableId === currentStableId);
                          const role = membership?.role ?? 'guest';
                          const roleLabel = sharedRoleLabels[role] ?? role;
                          const customRoleLabel = membership?.customRole?.trim() || undefined;
                          const riderRoleLabel =
                            role === 'rider'
                              ? membership?.riderRole === 'owner'
                                ? 'Hästägare'
                                : membership?.riderRole === 'medryttare'
                                  ? 'Medryttare'
                                  : membership?.riderRole === 'other'
                                    ? 'Annat'
                                    : undefined
                              : undefined;
                          const horseNames =
                            membership?.horseIds?.map((id) => horseNameById[id]).filter(Boolean).join(', ') || undefined;
                          const accessLabel =
                            membership?.access === 'owner'
                              ? 'Ägare'
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
                                  {[customRoleLabel ?? roleLabel, riderRoleLabel, accessLabel]
                                    .filter(Boolean)
                                    .join(' • ') || 'Ingen roll satt'}
                                </Text>
                                {horseNames ? <Text style={styles.memberMeta}>Hästar: {horseNames}</Text> : null}
                              </View>
                              <View style={styles.memberActions}>
                                <TouchableOpacity
                                  style={styles.roleButton}
                                  onPress={() => {
                                    const index = sharedRoleOrder.indexOf(role);
                                    const nextRole = sharedRoleOrder[(index + 1) % sharedRoleOrder.length];
                                    void runMemberChange(() => actions.updateMemberRole({ userId: user.id, stableId: currentStableId, role: nextRole }));
                                  }}
                                  disabled={!canEditMembers || memberSaving}
                                  accessibilityRole="button"
                                  accessibilityState={{ disabled: !canEditMembers || memberSaving }}
                                >
                                  <Text style={styles.roleButtonText}>{sharedRoleLabels[role] ?? role}</Text>
                                </TouchableOpacity>
                                {user.id !== currentUserId ? (
                                  <TouchableOpacity
                                    style={styles.removeButton}
                                    onPress={() => { void runMemberChange(() => actions.removeMemberFromStable(user.id, currentStableId)); }}
                                    disabled={!canEditMembers || memberSaving}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Ta bort ${user.name} från stallet`}
                                    accessibilityState={{ disabled: !canEditMembers || memberSaving }}
                                  >
                                    <Feather name="x" size={14} color={palette.error} />
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                    </View>
                  </View>
                  <View style={[styles.splitColumn, isDesktopWeb && styles.splitColumnWide]}>
                    <View style={styles.stableForm}>
                      <Text style={styles.formLabel}>Bjud in medlem</Text>
                      <InviteReceipt confirmation={memberReceipt} />
                      {memberInviteError && <Text accessibilityRole="alert" style={{ color: palette.error }}>{memberInviteError}</Text>}
                      <TextInput
                        placeholder="Namn"
                        placeholderTextColor={palette.mutedText}
                        value={inviteDraft.name}
                        onChangeText={(text) => setInviteDraft((prev) => ({ ...prev, name: text }))}
                        style={styles.input}
                        editable={canEditMembers}
                      />
                      <TextInput
                        placeholder="E-post"
                        placeholderTextColor={palette.mutedText}
                        value={inviteDraft.email}
                        onChangeText={(text) => setInviteDraft((prev) => ({ ...prev, email: text }))}
                        style={styles.input}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        editable={canEditMembers}
                      />
                      <TextInput
                        placeholder="Telefon (valfritt)"
                        placeholderTextColor={palette.mutedText}
                        value={inviteDraft.phone}
                        onChangeText={(text) => setInviteDraft((prev) => ({ ...prev, phone: text }))}
                        style={styles.input}
                        keyboardType="phone-pad"
                        editable={canEditMembers}
                      />
                      <Text style={styles.formLabel}>Stall</Text>
                      <View style={styles.chipRow}>
                        {stables.map((stable) => {
                          const active = inviteDraft.stableIds.includes(stable.id);
                          return (
                            <TouchableOpacity
                              key={stable.id}
                              style={[styles.accessChip, active && styles.accessChipActive]}
                              onPress={() =>
                                canEditMembers &&
                                setInviteDraft((prev) => {
                                  const exists = prev.stableIds.includes(stable.id);
                                  if (exists && prev.stableIds.length === 1) {
                                    return prev;
                                  }
                                  return {
                                    ...prev,
                                    stableIds: exists
                                      ? prev.stableIds.filter((id) => id !== stable.id)
                                      : [...prev.stableIds, stable.id],
                                  };
                                })
                              }
                              activeOpacity={0.85}
                              disabled={!canEditMembers}
                            >
                              <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>
                                {stable.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
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
                              onPress={() =>
                                canEditMembers &&
                                setInviteDraft((prev) => ({
                                  ...prev,
                                  role: option.id,
                                  access: roleAccessDefaults[option.id].access,
                                }))
                              }
                              activeOpacity={0.85}
                              disabled={!canEditMembers}
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
                        editable={canEditMembers}
                      />
                      <Text style={styles.formLabel}>Åtkomst</Text>
                      <View style={styles.chipRow}>
                        {(['owner', 'edit', 'view'] as const).map((level) => {
                          const active = inviteDraft.access === level;
                          const labels: Record<typeof level, string> = { owner: 'Ägare', edit: 'Redigera', view: 'Läsa' };
                          return (
                            <TouchableOpacity
                              key={level}
                              style={[styles.accessChip, active && styles.accessChipActive]}
                              onPress={() => canEditMembers && setInviteDraft((prev) => ({ ...prev, access: level }))}
                              activeOpacity={0.85}
                              disabled={!canEditMembers}
                            >
                              <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>{labels[level]}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {inviteDraft.role === 'rider' ? (
                        <>
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
                                    canEditMembers &&
                                    setInviteDraft((prev) => ({ ...prev, riderRole: option.id as typeof prev.riderRole }))
                                  }
                                  activeOpacity={0.85}
                                  disabled={!canEditMembers}
                                >
                                  <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>{option.label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </>
                      ) : null}
                      <Text style={styles.formLabel}>Koppla till hästar</Text>
                      {horses.filter(horse => inviteDraft.stableIds.includes(horse.stableId)).length === 0 ? (
                        <Text style={styles.emptyText}>Lägg till hästar först.</Text>
                      ) : (
                        <View style={styles.chipRow}>
                          {horses.filter(horse => inviteDraft.stableIds.includes(horse.stableId)).map((horse) => {
                            const active = inviteDraft.horseIds.includes(horse.id);
                            return (
                              <TouchableOpacity
                                key={horse.id}
                                style={[styles.accessChip, active && styles.accessChipActive]}
                                onPress={() =>
                                  canEditMembers &&
                                  setInviteDraft((prev) => ({
                                    ...prev,
                                    horseIds: active
                                      ? prev.horseIds.filter((id) => id !== horse.id)
                                      : [...prev.horseIds, horse.id],
                                  }))
                                }
                                activeOpacity={0.85}
                                disabled={!canEditMembers}
                              >
                                <Text style={[styles.accessChipText, active && styles.accessChipTextActive]}>{horse.name}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                      <TouchableOpacity
                        style={[styles.primaryButton, !canEditMembers && styles.primaryButtonDisabled]}
                        onPress={async () => {
                          if (savingInviteRef.current) return;
                          if (!inviteDraft.name.trim() || !inviteDraft.email.trim()) {
                            toast.showToast('Namn och e-post krävs.', 'error');
                            return;
                          }
                          if (inviteDraft.stableIds.length === 0) {
                            toast.showToast('Välj minst ett stall.', 'error');
                            return;
                          }
                          savingInviteRef.current = true;
                          setSavingInvite(true);
                          setMemberInviteError(null);
                          const result = await actions.addMember({
                            name: inviteDraft.name,
                            email: inviteDraft.email,
                            phone: inviteDraft.phone.trim() ? inviteDraft.phone.trim() : undefined,
                            stableId: inviteDraft.stableIds[0],
                            stableIds: inviteDraft.stableIds,
                            role: inviteDraft.role,
                            customRole: inviteDraft.customRole || undefined,
                            access: inviteDraft.access,
                            horseIds: inviteDraft.horseIds.filter(id => horses.some(horse => horse.id === id && inviteDraft.stableIds.includes(horse.stableId))),
                            riderRole: inviteDraft.role === 'rider' ? inviteDraft.riderRole : undefined,
                          });
                          savingInviteRef.current = false;
                          setSavingInvite(false);
                          if (result.success) {
                            setMemberReceipt(result.data ?? null);
                            toast.showToast('Inbjudan skapad.', 'success');
                            setInviteDraft({
                              name: '',
                              email: '',
                              phone: '',
                              stableIds: currentStableId ? [currentStableId] : [],
                              role: 'rider',
                              customRole: '',
                              access: 'view',
                              riderRole: 'medryttare',
                              horseIds: [],
                            });
                          } else {
                            setMemberInviteError(result.reason);
                            toast.showToast(result.reason, 'error');
                          }
                        }}
                        activeOpacity={0.9}
                        disabled={!canEditMembers}
                      >
                        <Text style={styles.primaryButtonText}>{savingInvite ? 'Skapar inbjudan…' : 'Skapa inbjudan'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
            </Card>}
          </>

            </View>
          </View>
        </ScrollView>
          </>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: color.bg },
  pageHeader: { marginBottom: 8 },
  pageHeaderDesktop: {
    maxWidth: 1400,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 48,
    marginBottom: 12,
  },
  backButton: {
    borderRadius: radius.full,
    backgroundColor: theme.colors.surfaceTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backIcon: { fontSize: 20, color: theme.colors.icon },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 16, width: '100%', maxWidth: 1400, alignSelf: 'center' },
  contentDesktop: { paddingHorizontal: 48, gap: 22 },
  desktopShell: { flex: 1, flexDirection: 'row' },
  desktopSidebar: {
    width: 260,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: palette.border,
    backgroundColor: palette.surfaceTint,
    shadowColor: palette.overlay,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 8, height: 0 },
    elevation: 2,
  },
  desktopMain: { flex: 1, minWidth: 0 },
  desktopLayout: { width: '100%', gap: 16 },
  desktopLayoutDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  stepHeaderDesktop: {
    width: 320,
    flexShrink: 0,
    padding: 16,
    borderRadius: radius.xl,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 12,
  },
  stepBody: { width: '100%', gap: 16 },
  stepBodyDesktop: { flex: 1, minWidth: 0 },
  splitRow: { gap: 16 },
  splitRowDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  splitColumn: { minWidth: 0 },
  splitColumnNarrow: { flex: 0.9 },
  splitColumnWide: { flex: 1.1 },
  formStack: { gap: 12 },
  card: { padding: 14, gap: 12, borderWidth: 0, width: '100%' },
  cardDesktop: { padding: 18, gap: 16, borderRadius: radius.xl },
  stepCard: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  stepCardDesktop: { borderRadius: radius.xl },
  branchCard: { gap: 8 },
  branchTitle: { fontSize: 15, fontWeight: '700', color: palette.primaryText },
  branchText: { fontSize: 12, color: palette.secondaryText },
  branchHint: { fontSize: 12, color: palette.secondaryText },
  branchRow: { gap: 8 },
  branchRowDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  branchOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  branchOptionDesktop: { flex: 1, minWidth: 160 },
  branchOptionTitle: { fontSize: 14, fontWeight: '700', color: palette.primaryText },
  branchOptionCaption: { fontSize: 12, color: palette.secondaryText, marginTop: 2 },
  branchSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  branchSummaryText: { fontSize: 12, color: palette.secondaryText },
  branchChange: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  branchChangeText: { fontSize: 12, fontWeight: '600', color: palette.primaryText },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: palette.primaryText },
  stableList: { gap: 10 },
  farmList: { gap: 8 },
  rideTypeList: { gap: 10, marginTop: 6 },
  rideTypeRow: {
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
  rideTypeInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rideTypeCodePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(62,155,95,0.12)',
  },
  rideTypeCodeText: { fontSize: 12, fontWeight: '700', color: palette.primary },
  rideTypeLabel: { fontSize: 14, fontWeight: '600', color: palette.primaryText },
  rideTypeMeta: { fontSize: 12, color: palette.secondaryText },
  rideTypeActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rideTypeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  rideTypeInputRow: { flexDirection: 'row', gap: 10 },
  rideTypeInputShort: { flex: 0.6 },
  rideTypeInputLong: { flex: 1 },
  rideTypeFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
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
    borderColor: 'rgba(62,155,95,0.3)',
    backgroundColor: 'rgba(62,155,95,0.08)',
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
    backgroundColor: 'rgba(62,155,95,0.14)',
    color: palette.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  stableForm: { gap: 8, marginTop: 6 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: 6 },
  formLabel: { fontSize: 13, fontWeight: '600', color: palette.primaryText },
  formHint: { fontSize: 12, color: palette.secondaryText },
  formHintCentered: { textAlign: 'center' },
  settingsSection: { gap: 8, marginTop: 12 },
  settingsOptionRow: { gap: 10 },
  settingsOptionRowDesktop: { flexDirection: 'row' },
  settingsOptionCard: {
    flex: 1,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 6,
  },
  settingsOptionCardActive: {
    borderColor: 'rgba(62,155,95,0.35)',
    backgroundColor: 'rgba(62,155,95,0.08)',
  },
  settingsOptionCardDisabled: { opacity: 0.6 },
  settingsOptionTitle: { fontSize: 14, fontWeight: '700', color: palette.primaryText },
  settingsOptionTitleActive: { color: palette.primary },
  settingsOptionDesc: { fontSize: 12, color: palette.secondaryText },
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
  joinCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  joinCodeInput: {
    flex: 1,
    minWidth: 140,
    textAlign: 'center',
    letterSpacing: 1,
    fontWeight: '700',
  },
  searchInput: {
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: palette.primary,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: palette.inverseText, fontWeight: '700', paddingHorizontal: 18 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inlineActionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineActionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  inlineActionButtonDisabled: { opacity: 0.5 },
  inlineActionText: { fontSize: 11, fontWeight: '600', color: palette.primaryText },
  countText: { fontSize: 12, color: palette.secondaryText },
  horseList: { gap: 8 },
  horseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 4 },
  horseRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  horseAvatar: { width: 42, height: 42, borderRadius: radius.full, backgroundColor: palette.surfaceMuted },
  horseAvatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  horseName: { fontSize: 14, fontWeight: '600', color: palette.primaryText },
  horseMeta: { fontSize: 12, color: palette.secondaryText },
  horseNote: { fontSize: 12, color: palette.secondaryText, marginTop: 2 },
  horsePreview: { width: '100%', height: 120, borderRadius: radius.lg, backgroundColor: palette.surfaceMuted },
  horsePreviewPlaceholder: {
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
    backgroundColor: 'rgba(62,155,95,0.14)',
    borderColor: 'rgba(62,155,95,0.3)',
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
  accessChipDisabled: { opacity: 0.5 },
  accessChipActive: {
    backgroundColor: 'rgba(62,155,95,0.1)',
    borderColor: 'rgba(62,155,95,0.26)',
  },
  accessChipText: { fontSize: 12, fontWeight: '600', color: palette.primaryText },
  accessChipTextActive: { color: palette.primary },
  restrictedWrap: { paddingHorizontal: 20, paddingTop: 8 },
  restrictedWrapDesktop: {
    paddingHorizontal: 48,
    width: '100%',
    maxWidth: 1400,
    alignSelf: 'center',
  },
  restrictedCard: { gap: 8 },
  restrictedText: { fontSize: 13, color: palette.secondaryText },
  stepHeader: { gap: 6, width: '100%' },
  stepHint: { fontSize: 13, color: palette.secondaryText },
  stepper: { gap: 8, width: '100%' },
  stepperDesktop: { gap: 10 },
  stepItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceTint,
    width: '100%',
  },
  stepItemDesktop: { paddingVertical: 14, paddingHorizontal: 14 },
  stepItemActive: {
    backgroundColor: 'rgba(62,155,95,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(62,155,95,0.3)',
  },
  stepItemDisabled: { opacity: 0.5 },
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
  footerNavDesktop: { justifyContent: 'flex-end', gap: 12, marginTop: 18 },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
  },
  secondaryButtonCompact: { flex: 0, paddingHorizontal: 16 },
  secondaryButtonDesktop: { flex: 0, minWidth: 150 },
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
  primaryButtonDesktop: { flex: 0, minWidth: 180 },
});
