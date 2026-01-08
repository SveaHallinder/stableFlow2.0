import React from 'react';
import {
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import { PostCard, PostData } from '@/components/Post';
import { theme } from '@/components/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, Pill } from '@/components/Primitives';
import { StableSwitcher } from '@/components/StableSwitcher';
import { space } from '@/design/tokens';
import { useAppData } from '@/context/AppDataContext';
import { useToast } from '@/components/ToastProvider';
import { formatTimeAgo } from '@/lib/time';

const palette = theme.colors;
const gradients = theme.gradients;

type GroupFilter = 'all' | 'stable' | 'horse' | 'farm';

const stableGroupId = (stableId: string) => `stable:${stableId}`;
const farmGroupId = (farmId: string) => `farm:${farmId}`;
const horseGroupId = (horseId: string) => `horse:${horseId}`;
const MAX_POST_IMAGES = 1;
const IMAGE_QUALITY = 0.7;
const IMAGE_ASPECT: [number, number] = [1, 1];

export default function FeedScreen() {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const stickyPanelStyle = isDesktopWeb ? ({ position: 'sticky', top: 20 } as any) : undefined;
  const toast = useToast();
  const scrollRef = React.useRef<ScrollView>(null);
  const composerInputRef = React.useRef<TextInput>(null);
  const {
    state: { posts, currentStableId, stables, horses, users, currentUserId, groups },
    derived,
    actions,
  } = useAppData();
  const [groupFilter, setGroupFilter] = React.useState<GroupFilter>('all');
  const [customFilterId, setCustomFilterId] = React.useState<string>('');
  const [postContent, setPostContent] = React.useState('');
  const [selectedGroups, setSelectedGroups] = React.useState<string[]>([]);
  const [postImage, setPostImage] = React.useState<string | null>(null);
  const [newGroupName, setNewGroupName] = React.useState('');
  const [focusComposerTick, setFocusComposerTick] = React.useState(0);

  const currentStable = stables.find((stable) => stable.id === currentStableId);
  const currentFarmId = currentStable?.farmId;
  const currentUser = users[currentUserId];
  const { permissions } = derived;
  const canPublishPost = permissions.canCreatePost;
  const canEditGroups = permissions.canManageGroups;
  const canInteract = permissions.canLikePost && permissions.canCommentPost;

  const groupsById = React.useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );
  const stableGroup = React.useMemo(
    () =>
      groups.find((group) => group.type === 'stable' && group.stableId === currentStableId) ??
      null,
    [currentStableId, groups],
  );
  const farmGroup = React.useMemo(
    () =>
      currentFarmId
        ? groups.find((group) => group.type === 'farm' && group.farmId === currentFarmId) ?? null
        : null,
    [currentFarmId, groups],
  );
  const horseGroups = React.useMemo(
    () =>
      groups.filter((group) => group.type === 'horse' && group.stableId === currentStableId),
    [currentStableId, groups],
  );
  const customGroups = React.useMemo(
    () =>
      groups.filter((group) => group.type === 'custom' && group.stableId === currentStableId),
    [currentStableId, groups],
  );
  const stableGroupIdValue = stableGroup?.id ?? stableGroupId(currentStableId);

  React.useEffect(() => {
    setSelectedGroups([stableGroupIdValue]);
  }, [stableGroupIdValue]);

  React.useEffect(() => {
    setCustomFilterId('');
    setNewGroupName('');
  }, [currentStableId]);

  const horseIdsForUser = React.useMemo(() => {
    const membershipHorseIds =
      currentUser?.membership.find((entry) => entry.stableId === currentStableId)?.horseIds ?? [];
    const ownedHorseIds = horses
      .filter((horse) => horse.ownerUserId === currentUserId && horse.stableId === currentStableId)
      .map((horse) => horse.id);
    return Array.from(new Set([...membershipHorseIds, ...ownedHorseIds]));
  }, [currentStableId, currentUser?.membership, currentUserId, horses]);

  const horseGroupIds = React.useMemo(
    () => horseIdsForUser.map((horseId) => horseGroupId(horseId)),
    [horseIdsForUser],
  );

  const getPostGroups = React.useCallback(
    (post: { groupIds?: string[]; stableId?: string }) => {
      if (post.groupIds?.length) {
        return post.groupIds;
      }
      if (post.stableId) {
        return [stableGroupId(post.stableId)];
      }
      return [];
    },
    [],
  );

  const accessiblePosts = React.useMemo(() => {
    const accessibleGroups = new Set<string>([
      ...groups
        .filter((group) => {
          if (group.type === 'stable') {
            return group.stableId === currentStableId;
          }
          if (group.type === 'farm') {
            return group.farmId === currentFarmId;
          }
          if (group.type === 'horse' || group.type === 'custom') {
            return group.stableId === currentStableId;
          }
          return false;
        })
        .map((group) => group.id),
      stableGroupIdValue,
    ]);
    return posts.filter((post) => {
      const groups = getPostGroups(post);
      if (!groups.length) {
        return !post.stableId || post.stableId === currentStableId;
      }
      return groups.some((groupId) => accessibleGroups.has(groupId));
    });
  }, [currentFarmId, currentStableId, getPostGroups, groups, posts, stableGroupIdValue]);

  const filteredPosts = React.useMemo(() => {
    if (groupFilter === 'all') {
      return customFilterId
        ? accessiblePosts.filter((post) => getPostGroups(post).includes(customFilterId))
        : accessiblePosts;
    }
    const base = accessiblePosts.filter((post) => {
      const groups = getPostGroups(post);
      if (groupFilter === 'stable') {
        return groups.includes(stableGroupIdValue);
      }
      if (groupFilter === 'horse') {
        return groups.some((groupId) => horseGroupIds.includes(groupId));
      }
      if (groupFilter === 'farm') {
        return currentFarmId ? groups.includes(farmGroupId(currentFarmId)) : false;
      }
      return true;
    });
    return customFilterId
      ? base.filter((post) => getPostGroups(post).includes(customFilterId))
      : base;
  }, [
    accessiblePosts,
    currentFarmId,
    customFilterId,
    getPostGroups,
    groupFilter,
    horseGroupIds,
    stableGroupIdValue,
  ]);

  const postCards = React.useMemo<PostData[]>(() => {
    return filteredPosts.map((post) => {
      const groupIds = getPostGroups(post);
      const labels = groupIds
        .map((groupId) => {
          if (groupId === stableGroupIdValue) {
            return 'Mitt stall';
          }
          return groupsById.get(groupId)?.name;
        })
        .filter((label): label is string => Boolean(label));
      const groupLabels = Array.from(new Set(labels));
      const timeAgo = post.createdAt ? formatTimeAgo(post.createdAt) : post.timeAgo;
      return { ...post, groupLabels, timeAgo };
    });
  }, [filteredPosts, getPostGroups, groupsById, stableGroupIdValue]);

  const filterOptions: { id: GroupFilter; label: string }[] = [
    { id: 'all', label: 'Alla' },
    { id: 'stable', label: 'Mitt stall' },
    { id: 'horse', label: 'Min häst' },
    { id: 'farm', label: 'Gården' },
  ];

  const handleToggleGroup = React.useCallback(
    (groupId: string, locked?: boolean) => {
      if (locked || groupId === stableGroupIdValue) {
        return;
      }
      setSelectedGroups((prev) =>
        prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
      );
    },
    [stableGroupIdValue],
  );

  const handlePublish = React.useCallback(() => {
    if (!canPublishPost) {
      toast.showToast('Du saknar behörighet att publicera i det här stallet.', 'error');
      return;
    }
    const trimmed = postContent.trim();
    if (!trimmed) {
      toast.showToast('Skriv en kort uppdatering först.', 'error');
      return;
    }
    const result = actions.addPost({
      content: trimmed,
      stableId: currentStableId,
      groupIds: selectedGroups.length ? selectedGroups : [stableGroupIdValue],
      image: postImage ?? undefined,
    });
    if (!result.success) {
      toast.showToast(result.reason, 'error');
      return;
    }
    setPostContent('');
    setSelectedGroups([stableGroupIdValue]);
    setPostImage(null);
    toast.showToast('Inlägget är publicerat.', 'success');
  }, [
    actions,
    canPublishPost,
    currentStableId,
    postContent,
    postImage,
    selectedGroups,
    stableGroupIdValue,
    toast,
  ]);

  const openImagePicker = React.useCallback(
    async (source: 'library' | 'camera') => {
      if (source === 'camera' && Platform.OS === 'web') {
        toast.showToast('Kamera stöds inte i webbläsaren.', 'error');
        return;
      }
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.showToast(
          source === 'camera'
            ? 'Ge appen tillgång till kameran för att ta en bild.'
            : 'Ge appen tillgång till bilder för att lägga till en bild.',
          'error',
        );
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: IMAGE_ASPECT,
              quality: IMAGE_QUALITY,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: IMAGE_ASPECT,
              quality: IMAGE_QUALITY,
            });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      setPostImage(result.assets[0].uri);
    },
    [toast],
  );

  const handlePickImage = React.useCallback(() => {
    void openImagePicker('library');
  }, [openImagePicker]);

  const handleTakePhoto = React.useCallback(() => {
    void openImagePicker('camera');
  }, [openImagePicker]);

  const handleClearImage = React.useCallback(() => {
    setPostImage(null);
  }, []);

  const handleFocusComposer = React.useCallback(() => {
    setFocusComposerTick((prev) => prev + 1);
  }, []);

  React.useEffect(() => {
    if (!focusComposerTick) {
      return;
    }
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }, [focusComposerTick]);

  const handleResetFilters = React.useCallback(() => {
    setGroupFilter('all');
    setCustomFilterId('');
  }, []);

  const handleCreateGroup = React.useCallback(() => {
    if (!canEditGroups) {
      toast.showToast('Du saknar behörighet att skapa grupper.', 'error');
      return;
    }
    const name = newGroupName.trim();
    if (!name) {
      toast.showToast('Skriv ett gruppnamn.', 'error');
      return;
    }
    const result = actions.createGroup({ name, stableId: currentStableId });
    if (!result.success) {
      toast.showToast(result.reason, 'error');
      return;
    }
    setNewGroupName('');
    if (result.data?.id) {
      setSelectedGroups((prev) => [...prev, result.data!.id]);
      setCustomFilterId(result.data.id);
    }
    toast.showToast('Gruppen är skapad.', 'success');
  }, [actions, canEditGroups, currentStableId, newGroupName, toast]);

  const handleDeleteGroup = React.useCallback(
    (groupId: string) => {
      if (!canEditGroups) {
        toast.showToast('Du saknar behörighet att ta bort grupper.', 'error');
        return;
      }
      const result = actions.deleteGroup(groupId);
      if (!result.success) {
        toast.showToast(result.reason, 'error');
        return;
      }
      if (customFilterId === groupId) {
        setCustomFilterId('');
      }
      setSelectedGroups((prev) => prev.filter((id) => id !== groupId));
      toast.showToast('Gruppen är borttagen.', 'success');
    },
    [actions, canEditGroups, customFilterId, toast],
  );

  const handleToggleLike = React.useCallback(
    (postId: string) => {
      const result = actions.togglePostLike(postId);
      if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const handleAddComment = React.useCallback(
    (postId: string, text: string) => {
      const result = actions.addPostComment(postId, text);
      if (!result.success) {
        toast.showToast(result.reason, 'error');
      }
    },
    [actions, toast],
  );

  const groupSections = React.useMemo(() => {
    const sections: {
      title: string;
      options: { id: string; label: string; locked?: boolean }[];
    }[] = [
      {
        title: 'Stall',
        options: [{ id: stableGroupIdValue, label: 'Mitt stall', locked: true }],
      },
    ];
    if (farmGroup) {
      sections.push({
        title: 'Gård',
        options: [{ id: farmGroup.id, label: farmGroup.name }],
      });
    }
    if (horseGroups.length) {
      sections.push({
        title: 'Hästar',
        options: horseGroups.map((group) => ({
          id: group.id,
          label: group.name,
        })),
      });
    }
    if (customGroups.length) {
      sections.push({
        title: 'Grupper',
        options: customGroups.map((group) => ({
          id: group.id,
          label: group.name,
        })),
      });
    }
    return sections;
  }, [customGroups, farmGroup, horseGroups, stableGroupIdValue]);

  const canPublish = postContent.trim().length > 0;
  const canUseCamera = Platform.OS !== 'web';
  const composerCard = canPublishPost ? (
    <Card tone="muted" style={styles.composerCard}>
      <View style={styles.composerHeader}>
        <Image
          source={currentUser?.avatar ?? require('@/assets/images/dummy-avatar.png')}
          style={styles.composerAvatar}
        />
        <View style={styles.composerHeaderText}>
          <Text style={styles.composerTitle}>Dela en uppdatering</Text>
          <Text style={styles.composerSubtitle}>{currentStable?.name ?? 'Valt stall'}</Text>
        </View>
      </View>
      <TextInput
        ref={composerInputRef}
        value={postContent}
        onChangeText={setPostContent}
        placeholder="Vad behöver alla veta idag?"
        placeholderTextColor={palette.mutedText}
        multiline
        style={styles.composerInput}
      />
      <View style={styles.composerActions}>
        <View style={styles.composerActionRow}>
          <TouchableOpacity
            style={styles.composerActionButton}
            onPress={handlePickImage}
            activeOpacity={0.85}
          >
            <Text style={styles.composerActionText}>
              {postImage ? 'Byt bild' : 'Välj bild'}
            </Text>
          </TouchableOpacity>
          {canUseCamera ? (
            <TouchableOpacity
              style={styles.composerActionButton}
              onPress={handleTakePhoto}
              activeOpacity={0.85}
            >
              <Text style={styles.composerActionText}>Ta bild</Text>
            </TouchableOpacity>
          ) : null}
          {postImage ? (
            <TouchableOpacity
              style={styles.composerActionButton}
              onPress={handleClearImage}
              activeOpacity={0.85}
            >
              <Text style={styles.composerActionText}>Ta bort</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.composerMeta}>Max {MAX_POST_IMAGES} bild</Text>
      </View>
      {postImage ? (
        <Image source={{ uri: postImage }} style={styles.composerImage} />
      ) : null}
      <View style={styles.groupPicker}>
        {groupSections.map((section) => (
          <View key={section.title} style={styles.groupSection}>
            <Text style={styles.groupLabel}>{section.title}</Text>
            <View style={styles.groupChips}>
              {section.options.map((option) => {
                const isSelected = selectedGroups.includes(option.id) || option.locked;
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => handleToggleGroup(option.id, option.locked)}
                    activeOpacity={0.85}
                    disabled={option.locked}
                  >
                    <Pill
                      active={isSelected}
                      style={[
                        styles.groupChip,
                        option.locked && styles.groupChipLocked,
                      ]}
                    >
                      <Text
                        style={[
                          styles.groupChipText,
                          isSelected && styles.groupChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pill>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </View>
      {canEditGroups ? (
        <View style={styles.groupManager}>
          <View style={styles.groupManagerHeader}>
            <Text style={styles.groupManagerTitle}>Egna grupper</Text>
            <Text style={styles.groupManagerHint}>Skapa för flöden och målgrupper.</Text>
          </View>
          <View style={styles.groupCreateRow}>
            <TextInput
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="Nytt gruppnamn"
              placeholderTextColor={palette.mutedText}
              style={styles.groupNameInput}
            />
            <TouchableOpacity
              style={[
                styles.createGroupButton,
                !newGroupName.trim() && styles.createGroupButtonDisabled,
              ]}
              onPress={handleCreateGroup}
              activeOpacity={0.85}
              disabled={!newGroupName.trim()}
            >
              <Text style={styles.createGroupButtonText}>Skapa</Text>
            </TouchableOpacity>
          </View>
          {customGroups.length ? (
            <View style={styles.groupList}>
              {customGroups.map((group) => (
                <View key={group.id} style={styles.groupRow}>
                  <Text style={styles.groupRowText}>{group.name}</Text>
                  <TouchableOpacity
                    onPress={() => handleDeleteGroup(group.id)}
                    activeOpacity={0.85}
                    style={styles.groupRowAction}
                  >
                    <Text style={styles.groupRowActionText}>Ta bort</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.groupEmpty}>Inga egna grupper ännu.</Text>
          )}
        </View>
      ) : null}
      <View style={styles.composerFooter}>
        <Text style={styles.composerHint}>Synlig för valda grupper</Text>
        <TouchableOpacity
          style={[styles.publishButton, !canPublish && styles.publishButtonDisabled]}
          onPress={handlePublish}
          activeOpacity={0.85}
          disabled={!canPublish}
        >
          <Text style={styles.publishButtonText}>Publicera</Text>
        </TouchableOpacity>
      </View>
    </Card>
  ) : null;

  const readOnlyCard = !canPublishPost ? (
    <Card tone="muted" style={styles.readOnlyCard}>
      <Text style={styles.readOnlyTitle}>Läsbehörighet</Text>
      <Text style={styles.readOnlyText}>
        Du kan läsa flödet men inte publicera i det här stallet.
      </Text>
    </Card>
  ) : null;

  const hasActiveFilter = groupFilter !== 'all' || Boolean(customFilterId);
  type EmptyStateAction = {
    label: string;
    onPress: () => void;
    variant: 'primary' | 'secondary';
  };

  const emptyStateActions: EmptyStateAction[] = [];
  if (canPublishPost) {
    emptyStateActions.push({
      label: 'Skriv uppdatering',
      onPress: handleFocusComposer,
      variant: 'primary',
    });
  }
  if (hasActiveFilter) {
    emptyStateActions.push({
      label: 'Rensa filter',
      onPress: handleResetFilters,
      variant: canPublishPost ? 'secondary' : 'primary',
    });
  }
  const emptyState = (
    <Card tone="muted" style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>
        {hasActiveFilter ? 'Inga inlägg för valt filter' : 'Inga inlägg ännu'}
      </Text>
      <Text style={styles.emptyText}>
        {canPublishPost
          ? hasActiveFilter
            ? 'Rensa filter eller skriv första uppdateringen.'
            : 'Skriv första uppdateringen till stallet.'
          : hasActiveFilter
            ? 'Rensa filter eller vänta på nya inlägg.'
            : 'Det finns inga inlägg ännu i det här stallet.'}
      </Text>
      {emptyStateActions.length ? (
        <View style={styles.emptyActions}>
          {emptyStateActions.map((action) => {
            const isPrimary = action.variant === 'primary';
            return (
              <TouchableOpacity
                key={action.label}
                style={[
                  styles.emptyAction,
                  isPrimary ? styles.emptyActionPrimary : styles.emptyActionSecondary,
                ]}
                onPress={action.onPress}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.emptyActionText,
                    isPrimary ? styles.emptyActionPrimaryText : styles.emptyActionSecondaryText,
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </Card>
  );

  const renderFilterChips = (variant: 'panel' | 'inline') => (
    <View
      style={[
        styles.filterRow,
        variant === 'panel' ? styles.filterRowPanel : styles.filterRowInline,
      ]}
    >
      {filterOptions.map((option) => (
        <TouchableOpacity
          key={option.id}
          onPress={() => setGroupFilter(option.id)}
          activeOpacity={0.85}
        >
          <Pill
            active={groupFilter === option.id}
            style={[styles.filterChip, variant === 'panel' && styles.filterChipPanel]}
          >
            <Text
              style={[
                styles.filterChipText,
                groupFilter === option.id && styles.filterChipTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pill>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderCustomGroupFilters = (variant: 'panel' | 'inline') => {
    if (!customGroups.length) {
      return null;
    }
    return (
      <View
        style={[
          styles.customFilterBlock,
          variant === 'panel' ? styles.customFilterPanel : styles.customFilterInline,
        ]}
      >
        {variant === 'panel' ? (
          <Text style={styles.customFilterLabel}>Grupper</Text>
        ) : null}
        <View style={styles.customFilterRow}>
          <TouchableOpacity onPress={() => setCustomFilterId('')} activeOpacity={0.85}>
            <Pill
              active={!customFilterId}
              style={[styles.filterChip, styles.customFilterChip]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  !customFilterId && styles.filterChipTextActive,
                ]}
              >
                Alla grupper
              </Text>
            </Pill>
          </TouchableOpacity>
          {customGroups.map((group) => (
            <TouchableOpacity
              key={group.id}
              onPress={() => setCustomFilterId(group.id)}
              activeOpacity={0.85}
            >
              <Pill
                active={customFilterId === group.id}
                style={[styles.filterChip, styles.customFilterChip]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    customFilterId === group.id && styles.filterChipTextActive,
                  ]}
                >
                  {group.name}
                </Text>
              </Pill>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={gradients.background} style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          style={[styles.pageHeader, isDesktopWeb && styles.pageHeaderDesktop]}
          title="Feed"
        />
        {!isDesktopWeb ? <StableSwitcher /> : null}
        {!isDesktopWeb ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {renderFilterChips('inline')}
          </ScrollView>
        ) : null}
        {!isDesktopWeb && customGroups.length ? (
          <View style={styles.customFilterWrap}>{renderCustomGroupFilters('inline')}</View>
        ) : null}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}
          showsVerticalScrollIndicator={false}
        >
          {isDesktopWeb ? (
            <View style={styles.desktopLayout}>
              <View style={[styles.desktopPanel, stickyPanelStyle]}>
                <Card tone="muted" style={styles.panelCard}>
                  <Text style={styles.panelTitle}>Snabbfilter</Text>
                  {renderFilterChips('panel')}
                  {renderCustomGroupFilters('panel')}
                </Card>
                <Card tone="muted" style={styles.panelCard}>
                  <Text style={styles.panelTitle}>Tips</Text>
                  <Text style={styles.panelText}>
                    Tagga inlägg med stall eller häst så det blir lättare att hitta senare.
                  </Text>
                </Card>
              </View>
              <View style={styles.desktopFeed}>
                <View style={[styles.postList, styles.postListDesktop]}>
                  {readOnlyCard}
                  {composerCard}
                  {postCards.length === 0 ? (
                    emptyState
                  ) : (
                    postCards.map((post) => (
                      <PostCard
                        key={post.id}
                        data={post}
                        currentUserId={currentUserId}
                        onToggleLike={() => handleToggleLike(post.id)}
                        onAddComment={(text) => handleAddComment(post.id, text)}
                        canInteract={canInteract}
                      />
                    ))
                  )}
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.postList}>
              {readOnlyCard}
              {composerCard}
              {postCards.length === 0 ? (
                emptyState
              ) : (
                postCards.map((post) => (
                  <PostCard
                    key={post.id}
                    data={post}
                    currentUserId={currentUserId}
                    onToggleLike={() => handleToggleLike(post.id)}
                    onAddComment={(text) => handleAddComment(post.id, text)}
                    canInteract={canInteract}
                  />
                ))
              )}
            </View>
          )}
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
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: 50,
    gap: space.xl,
    paddingTop: 24,
  },
  contentDesktop: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 28,
  },
  desktopLayout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
  },
  desktopPanel: {
    width: 300,
    flexShrink: 0,
    gap: space.lg,
  },
  desktopFeed: {
    flex: 1,
    minWidth: 0,
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
  postList: {
    gap: space.xl,
  },
  postListDesktop: {
    gap: space.xl,
  },
  composerCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 0,
    gap: 14,
  },
  composerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  composerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
  },
  composerHeaderText: {
    flex: 1,
    gap: 2,
  },
  composerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.primaryText,
  },
  composerSubtitle: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  composerInput: {
    minHeight: 88,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.primaryText,
    textAlignVertical: 'top',
  },
  composerActions: {
    gap: 6,
  },
  composerActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  composerMeta: {
    fontSize: 11,
    color: palette.secondaryText,
  },
  composerActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  composerActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryText,
  },
  composerImage: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'flex-start',
    aspectRatio: 1,
    borderRadius: 16,
  },
  readOnlyCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 0,
    gap: 6,
  },
  readOnlyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.primaryText,
  },
  readOnlyText: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  groupPicker: {
    gap: 12,
  },
  groupSection: {
    gap: 8,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  groupChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupChip: {
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  groupChipLocked: {
    backgroundColor: 'rgba(45, 108, 246, 0.12)',
    borderColor: 'rgba(45, 108, 246, 0.3)',
  },
  groupChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryText,
  },
  groupChipTextActive: {
    color: palette.primary,
  },
  groupManager: {
    gap: 10,
    paddingTop: 4,
  },
  groupManagerHeader: {
    gap: 2,
  },
  groupManagerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.primaryText,
  },
  groupManagerHint: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  groupCreateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupNameInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: palette.primaryText,
  },
  createGroupButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: palette.primary,
  },
  createGroupButtonDisabled: {
    opacity: 0.5,
  },
  createGroupButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.inverseText,
  },
  groupList: {
    gap: 8,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  groupRowText: {
    fontSize: 13,
    color: palette.primaryText,
    fontWeight: '600',
  },
  groupRowAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(249, 95, 95, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(249, 95, 95, 0.22)',
  },
  groupRowActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.error,
  },
  groupEmpty: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  composerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  composerHint: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  publishButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: palette.primary,
  },
  publishButtonDisabled: {
    opacity: 0.5,
  },
  publishButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.inverseText,
  },
  filterScroll: {
    paddingHorizontal: space.lg,
    paddingTop: 8,
    paddingBottom: 4,
  },
  customFilterWrap: {
    paddingHorizontal: space.lg,
    paddingTop: 4,
    paddingBottom: 4,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterRowInline: {
    paddingRight: 8,
  },
  filterRowPanel: {
    marginTop: 4,
  },
  customFilterBlock: {
    gap: 8,
  },
  customFilterPanel: {
    marginTop: 10,
  },
  customFilterInline: {
    paddingRight: 8,
  },
  customFilterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.secondaryText,
  },
  customFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  customFilterChip: {
    backgroundColor: palette.surfaceTint,
  },
  filterChip: {
    backgroundColor: palette.surfaceTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  filterChipPanel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.primaryText,
  },
  filterChipTextActive: {
    color: palette.primary,
  },
  panelCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 0,
    gap: 10,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.primaryText,
  },
  panelText: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.secondaryText,
  },
  emptyCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 0,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primaryText,
  },
  emptyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  emptyAction: {
    flexGrow: 1,
    minWidth: 140,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyActionPrimary: {
    backgroundColor: palette.primary,
  },
  emptyActionPrimaryText: {
    color: palette.inverseText,
    fontWeight: '700',
  },
  emptyActionSecondary: {
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  emptyActionSecondaryText: {
    color: palette.primaryText,
  },
  emptyText: {
    fontSize: 13,
    color: palette.secondaryText,
    lineHeight: 18,
  },
});
