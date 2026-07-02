import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { usePaginatedQuery, useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { colors, spacing, radius } from "@/lib/theme";
import { ZLogo } from "@/components/ZLogo";
import { EmptyState } from "@/components/EmptyState";
import { SymbolView } from "@/components/Icon";
import { LivestreamCard } from "@/components/LivestreamCard";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

type Tab = "groups" | "people";

/* ─── Announcement Banner ─── */
function AnnouncementBanner() {
  const announcement = useQuery(api.admin.getActiveAnnouncement);
  if (!announcement) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.announceBanner}
    >
      <SymbolView name="exclamationmark.circle.fill" size={22} tintColor={colors.white} />
      <Text style={styles.announceText} numberOfLines={2}>
        {announcement.text}
      </Text>
    </Animated.View>
  );
}

/* ─── Live Now Section ─── */
function LiveNowSection() {
  const { isAuthenticated } = useConvexAuth();
  const streams = useQuery(api.livestreams.listActive, isAuthenticated ? {} : "skip");
  if (!streams || streams.length === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.liveSection}>
      <View style={styles.liveSectionHeader}>
        <View style={styles.liveSectionDot} />
        <Text style={styles.liveSectionTitle}>Live jetzt</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.liveScroll}
      >
        {streams.map((s: { _id: Id<"livestreams">; title: string; hostName: string; hostAvatarUrl?: string; coHostName?: string; coHostAvatarUrl?: string; groupName?: string; participantCount: number; viewerCount: number }) => (
          <LivestreamCard
            key={s._id}
            _id={s._id}
            title={s.title}
            hostName={s.hostName}
            hostAvatarUrl={s.hostAvatarUrl}
            coHostName={s.coHostName}
            coHostAvatarUrl={s.coHostAvatarUrl}
            groupName={s.groupName}
            participantCount={s.participantCount}
            viewerCount={s.viewerCount}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

export default function GroupsScreen() {
  const { isAuthenticated } = useConvexAuth();
  const [tab, setTab] = useState<Tab>("groups");
  const [searchQuery, setSearchQuery] = useState("");

  // Unread counts for badges
  const unreadMessages = useQuery(
    api.messaging.getUnreadConversationsCount,
    isAuthenticated ? {} : "skip",
  );
  const unreadNotifications = useQuery(
    api.notifications.getUnreadCount,
    isAuthenticated ? {} : "skip",
  );

  // Fetch which groups are currently live
  const liveGroupIds = useQuery(
    api.livestreams.liveGroupIds,
    isAuthenticated ? {} : "skip",
  );
  const liveGroupSet = new Set(liveGroupIds ?? []);

  const pinnedGroups = useQuery(
    api.groups.listPinned,
    isAuthenticated && tab === "groups" ? {} : "skip",
  );
  const groupUnread = useQuery(
    api.groups.myGroupUnread,
    isAuthenticated && tab === "groups" ? {} : "skip",
  );
  const unreadByGroup = new Map(
    (groupUnread ?? []).map((g) => [g.groupId as string, g.count]),
  );

  const {
    results: groups,
    status: groupsStatus,
    loadMore: loadMoreGroups,
  } = usePaginatedQuery(
    api.groups.list,
    isAuthenticated && tab === "groups" ? { searchQuery: searchQuery || undefined } : "skip",
    { initialNumItems: 16 },
  );
  const {
    results: people,
    status: peopleStatus,
    loadMore: loadMorePeople,
  } = usePaginatedQuery(
    api.users.listAll,
    isAuthenticated && tab === "people" ? { searchQuery: searchQuery || undefined } : "skip",
    { initialNumItems: 16 },
  );
  const joinGroup = useMutation(api.groups.join);

  const handleJoin = async (groupId: Id<"groups">) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await joinGroup({ groupId });
    } catch { /* already member */ }
  };

  const switchTab = (t: Tab) => {
    if (t !== tab) {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setTab(t);
      setSearchQuery("");
    }
  };

  const renderGroup = ({ item }: { item: NonNullable<typeof groups>[number] }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.navigate({ pathname: "/(main)/group-detail", params: { id: item._id } })}
      activeOpacity={0.65}
    >
      <View style={styles.cardThumb}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbImage} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <SymbolView name="person.3.fill" size={22} tintColor={colors.gray300} />
          </View>
        )}
        {liveGroupSet.has(item._id) && (
          <View style={styles.liveThumbBadge}>
            <View style={styles.liveThumbDot} />
            <Text style={styles.liveThumbText}>LIVE</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          {liveGroupSet.has(item._id) && (
            <View style={styles.liveInlineBadge}>
              <View style={styles.liveInlineDot} />
            </View>
          )}
          {(unreadByGroup.get(item._id as string) ?? 0) > 0 && (
            <View style={styles.groupUnreadBadge}>
              <Text style={styles.groupUnreadText}>{unreadByGroup.get(item._id as string)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {[item.city || item.county, item.topic].filter(Boolean).join(" · ")}
        </Text>
        <Text style={styles.cardMembers}>
          {item.memberCount} {item.memberCount === 1 ? "Mitglied" : "Mitglieder"}
        </Text>
      </View>
      {item.isMember ? (
        <View style={styles.joinedPill}>
          <SymbolView name="checkmark" size={12} tintColor={colors.gray500} />
          <Text style={styles.joinedText}>Dabei</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.joinPill}
          onPress={() => handleJoin(item._id)}
          activeOpacity={0.7}
        >
          <Text style={styles.joinText}>Beitreten</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderPinnedGroup = (item: NonNullable<typeof pinnedGroups>[number]) => (
    <TouchableOpacity
      key={item._id}
      style={styles.pinnedCard}
      onPress={() => router.navigate({ pathname: "/(main)/group-detail", params: { id: item._id } })}
      activeOpacity={0.75}
    >
      <View style={styles.cardThumb}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbImage} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.thumbPlaceholderDark}>
            <SymbolView name="person.3.fill" size={22} tintColor={colors.gray500} />
          </View>
        )}
        {liveGroupSet.has(item._id) && (
          <View style={styles.liveThumbBadge}>
            <View style={styles.liveThumbDot} />
            <Text style={styles.liveThumbText}>LIVE</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <Text style={[styles.cardName, styles.pinnedName]} numberOfLines={1}>{item.name}</Text>
          {(unreadByGroup.get(item._id as string) ?? 0) > 0 && (
            <View style={styles.groupUnreadBadge}>
              <Text style={styles.groupUnreadText}>{unreadByGroup.get(item._id as string)}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.cardMeta, styles.pinnedMeta]} numberOfLines={1}>
          {[item.city || item.county, item.topic].filter(Boolean).join(" · ")}
        </Text>
        <Text style={[styles.cardMembers, styles.pinnedMembers]}>
          {item.memberCount} {item.memberCount === 1 ? "Mitglied" : "Mitglieder"}
        </Text>
      </View>
      {item.isMember ? (
        <View style={styles.pinnedJoinedPill}>
          <SymbolView name="checkmark" size={12} tintColor={colors.gray400} />
          <Text style={styles.pinnedJoinedText}>Dabei</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.pinnedJoinPill} onPress={() => handleJoin(item._id)} activeOpacity={0.7}>
          <Text style={styles.pinnedJoinText}>Beitreten</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderPerson = ({ item }: { item: NonNullable<typeof people>[number] }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.navigate({ pathname: "/(main)/user-profile", params: { id: item._id } })}
      activeOpacity={0.65}
    >
      <View style={styles.avatarWrap}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatar} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <SymbolView name="person.fill" size={20} tintColor={colors.gray300} />
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        {item.city ? <Text style={styles.cardMeta} numberOfLines={1}>{item.city}</Text> : null}
        {item.interests && item.interests.length > 0 ? (
          <Text style={styles.cardInterests} numberOfLines={1}>
            {item.interests.slice(0, 3).join(" · ")}
          </Text>
        ) : null}
      </View>
      <View style={styles.arrowWrap}>
        <SymbolView name="chevron.right" size={14} tintColor={colors.gray300} />
      </View>
    </TouchableOpacity>
  );

  const pinnedList = tab === "groups" && !searchQuery ? (pinnedGroups ?? []) : [];
  const pinnedIds = new Set(pinnedList.map((g) => g._id));
  const visibleGroups = pinnedIds.size > 0
    ? groups.filter((g) => !pinnedIds.has(g._id))
    : groups;

  const listHeader = (
    <>
      <AnnouncementBanner />
      <LiveNowSection />

      {/* Tab Toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "groups" && styles.tabBtnActive]}
          onPress={() => switchTab("groups")}
          activeOpacity={0.7}
        >
          <SymbolView name="person.3" size={16} tintColor={tab === "groups" ? colors.white : colors.gray500} />
          <Text style={[styles.tabText, tab === "groups" && styles.tabTextActive]}>Gruppen</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "people" && styles.tabBtnActive]}
          onPress={() => switchTab("people")}
          activeOpacity={0.7}
        >
          <SymbolView name="person" size={16} tintColor={tab === "people" ? colors.white : colors.gray500} />
          <Text style={[styles.tabText, tab === "people" && styles.tabTextActive]}>Personen</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <SymbolView name="magnifyingglass" size={16} tintColor={colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder={tab === "groups" ? "Name oder Interesse suchen…" : "Name oder Interesse suchen…"}
            placeholderTextColor={colors.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <SymbolView name="xmark.circle.fill" size={16} tintColor={colors.gray300} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Angepinnte Gruppen (admin) */}
      {pinnedList.length > 0 && (
        <View style={styles.pinnedSection}>
          {pinnedList.map(renderPinnedGroup)}
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <ZLogo size={47} />
        <Text style={styles.headerTitle}>Community</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.navigate("/(main)/conversations")} style={styles.iconBtn}>
          <SymbolView name="bubble.left.and.bubble.right" size={22} tintColor={colors.black} />
          {(unreadMessages ?? 0) > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {(unreadMessages ?? 0) > 99 ? "99+" : unreadMessages}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.navigate("/(main)/notifications")} style={styles.iconBtn}>
          <SymbolView name="bell" size={22} tintColor={colors.black} />
          {(unreadNotifications ?? 0) > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {(unreadNotifications ?? 0) > 99 ? "99+" : unreadNotifications}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Scrollable content */}
      {tab === "groups" ? (
        <FlatList
          data={visibleGroups}
          renderItem={renderGroup}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          onEndReached={() => {
            if (groupsStatus === "CanLoadMore") loadMoreGroups(16);
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            groupsStatus === "LoadingMore" ? (
              <View style={styles.loadingWrap}><ActivityIndicator color={colors.gray300} /></View>
            ) : groupsStatus === "CanLoadMore" ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => loadMoreGroups(16)}>
                <Text style={styles.loadMoreText}>Mehr laden</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            groupsStatus === "LoadingFirstPage" ? (
              <View style={styles.loadingWrap}><ActivityIndicator color={colors.gray300} /></View>
            ) : (
              <EmptyState
                icon="person.3"
                title="Keine Gruppen gefunden"
                subtitle="Erstelle die erste Gruppe und vernetze deine Community in MV."
              />
            )
          }
        />
      ) : (
        <FlatList
          data={people}
          renderItem={renderPerson}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          onEndReached={() => {
            if (peopleStatus === "CanLoadMore") loadMorePeople(16);
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            peopleStatus === "LoadingMore" ? (
              <View style={styles.loadingWrap}><ActivityIndicator color={colors.gray300} /></View>
            ) : peopleStatus === "CanLoadMore" ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => loadMorePeople(16)}>
                <Text style={styles.loadMoreText}>Mehr laden</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            peopleStatus === "LoadingFirstPage" ? (
              <View style={styles.loadingWrap}><ActivityIndicator color={colors.gray300} /></View>
            ) : (
              <EmptyState
                icon="person"
                title="Keine Personen gefunden"
                subtitle="Probiere einen anderen Namen, Ort oder ein anderes Interesse."
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },

  /* Announcement Banner */
  announceBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.black,
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
    borderCurve: "continuous",
  },
  announceIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  announceText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.white,
    letterSpacing: -0.1,
  },

  /* Live Now Section */
  liveSection: {
    marginBottom: spacing.md,
  },
  liveSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    gap: 6,
  },
  liveSectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  liveSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.black,
    letterSpacing: -0.2,
  },
  liveScroll: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.black,
    letterSpacing: -0.5,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Tab Toggle */
  tabRow: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.gray100,
    borderRadius: radius.full,
    padding: 3,
    gap: 0,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: radius.full,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: colors.black,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.gray500,
    letterSpacing: -0.2,
  },
  tabTextActive: {
    color: colors.white,
  },

  /* Search */
  searchWrap: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.gray100,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    height: 42,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.black, letterSpacing: -0.2 },

  /* List */
  list: { paddingBottom: 120 },
  loadingWrap: { paddingVertical: 56, alignItems: "center" },
  loadMoreBtn: {
    alignSelf: "center",
    marginBottom: spacing.lg,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
  },
  loadMoreText: { fontSize: 13, fontWeight: "600", color: colors.black },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray200,
    borderCurve: "continuous",
    gap: spacing.md,
  },
  cardThumb: {
    width: 54,
    height: 54,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.gray100,
  },
  thumbImage: { width: 54, height: 54 },
  thumbPlaceholder: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Live badges on group cards */
  liveThumbBadge: {
    position: "absolute",
    bottom: 3,
    left: 3,
    right: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: colors.danger,
    borderRadius: 4,
    paddingVertical: 2,
  },
  liveThumbDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.white,
  },
  liveThumbText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveInlineBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  liveInlineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.white,
  },

  avatarWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: "hidden",
    backgroundColor: colors.gray100,
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: "600", color: colors.black, letterSpacing: -0.2 },
  cardMeta: { fontSize: 13, color: colors.gray500, letterSpacing: -0.1 },
  cardInterests: { fontSize: 12, color: colors.gray400, marginTop: 1, letterSpacing: -0.1 },
  cardMembers: { fontSize: 12, color: colors.gray400, marginTop: 1 },
  joinedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
  },
  joinedText: { fontSize: 13, fontWeight: "600", color: colors.gray500 },
  joinPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.black,
  },
  joinText: { fontSize: 13, fontWeight: "600", color: colors.white },

  /* Angepinnte Gruppen (schwarzes Widget) */
  pinnedSection: { marginBottom: spacing.sm },
  pinnedCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.black,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  thumbPlaceholderDark: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray800,
  },
  pinnedName: { color: colors.white },
  pinnedMeta: { color: colors.gray300 },
  pinnedMembers: { color: colors.gray400 },
  pinnedJoinPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.white,
  },
  pinnedJoinText: { fontSize: 13, fontWeight: "700", color: colors.black },
  pinnedJoinedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.gray800,
  },
  pinnedJoinedText: { fontSize: 13, fontWeight: "600", color: colors.gray300 },
  groupUnreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  groupUnreadText: { fontSize: 11, fontWeight: "700", color: colors.white, fontVariant: ["tabular-nums"] },

  arrowWrap: {
    width: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.white,
    fontVariant: ["tabular-nums"],
  },
});
