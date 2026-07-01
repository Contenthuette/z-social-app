import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, spacing, radius } from "@/lib/theme";
import { Avatar } from "@/components/Avatar";
import { SymbolView } from "@/components/Icon";
import { Image } from "expo-image";
import { ZAdminBadge, GroupAdminLinks, LocationBadge } from "@/components/ProfileBadges";
import { VideoGridThumbnail } from "@/components/VideoGridThumbnail";
import { useThumbnailRepair } from "@/lib/useThumbnailRepair";
import { ShareSheet } from "@/components/ShareSheet";

interface UserPost {
  _id: string;
  type: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  cropOffsetX?: number;
  cropOffsetY?: number;
  cropZoom?: number;
}

const { width: screenWidth } = Dimensions.get("window");
const GRID_GAP = 2;
const GRID_COL = 3;
const GRID_SIZE = (screenWidth - GRID_GAP * (GRID_COL - 1)) / GRID_COL;
const GRID_HEIGHT = Math.round(GRID_SIZE * (4 / 3)); // 3:4 portrait ratio

export default function ProfileScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const myPosts = useQuery(api.posts.getUserPosts, me ? { userId: me._id } : "skip");
  const userGroups = useQuery(api.users.getUserGroups, me ? { userId: me._id } : "skip");
  const myFriends = useQuery(api.friends.getMyFriends, isAuthenticated && me ? {} : "skip");
  const [shareOpen, setShareOpen] = useState(false);

  // Repair missing thumbnails in background
  useThumbnailRepair(myPosts as Array<{ _id: string; type: "photo" | "video"; mediaUrl?: string; thumbnailUrl?: string }> | undefined);

  if (isLoading || me === undefined) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}><ActivityIndicator color={colors.gray300} /></View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated || !me) return null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Banner */}
        <View style={styles.banner}>
          {me.bannerUrl ? (
            <Image source={{ uri: me.bannerUrl }} style={styles.bannerImage} contentFit="cover" cachePolicy="memory-disk" priority="high" transition={0} />
          ) : (
            <View style={styles.bannerGradient} />
          )}
          <TouchableOpacity style={styles.settingsBtn} onPress={() => router.navigate("/(main)/settings")}>
            <SymbolView name="gearshape" size={20} tintColor={colors.black} />
          </TouchableOpacity>
        </View>

        {/* Profile header */}
        <View style={styles.profileSection}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarBorder}>
              <Avatar uri={me.avatarUrl} name={me.name} size={84} />
            </View>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{myPosts?.length ?? 0}</Text>
                <Text style={styles.statLabel}>Beiträge</Text>
              </View>
              <TouchableOpacity
                style={styles.stat}
                activeOpacity={0.6}
                onPress={() => router.navigate({ pathname: "/(main)/friends-list", params: { userId: me._id, title: "Meine Freunde" } })}
              >
                <Text style={styles.statValue}>{myFriends?.length ?? 0}</Text>
                <Text style={styles.statLabel}>Freunde</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stat}
                activeOpacity={0.6}
                onPress={() => router.navigate({ pathname: "/(main)/groups-list", params: { userId: me._id, title: "Meine Gruppen" } })}
              >
                <Text style={styles.statValue}>{userGroups?.length ?? 0}</Text>
                <Text style={styles.statLabel}>Gruppen</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.name}>{me.name}</Text>
          {me.role === "admin" && <ZAdminBadge />}
          {userGroups && userGroups.length > 0 && <GroupAdminLinks groups={userGroups} />}
          <View style={styles.widgetRow}>
            <LocationBadge city={me.city} county={me.county} />
          </View>
          {me.bio ? <Text style={styles.bio}>{me.bio}</Text> : null}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.editBtn} onPress={() => router.navigate("/(main)/edit-profile")} activeOpacity={0.7}>
              <Text style={styles.editBtnText}>Profil bearbeiten</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} activeOpacity={0.7} onPress={() => setShareOpen(true)}>
              <SymbolView name="square.and.arrow.up" size={16} tintColor={colors.black} />
            </TouchableOpacity>
          </View>

          {/* Interests */}
          {me.interests && me.interests.length > 0 && (
            <View style={styles.interestsWrap}>
              {me.interests.slice(0, 8).map((interest: string) => (
                <View key={interest} style={styles.chip}>
                  <Text style={styles.chipText}>{interest}</Text>
                </View>
              ))}
              {me.interests.length > 8 && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>+{me.interests.length - 8}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Posts grid */}
        <View style={styles.gridHeader}>
          <View style={styles.gridTab}>
            <SymbolView name="square.grid.3x3" size={20} tintColor={colors.black} />
          </View>
        </View>

        {myPosts && myPosts.length > 0 ? (
          <View style={styles.grid}>
            {myPosts.map((post: UserPost) => (
              <TouchableOpacity
                key={post._id}
                style={styles.gridItem}
                onPress={() => router.navigate({ pathname: "/(main)/post-detail", params: { id: post._id } })}
                activeOpacity={0.85}
              >
                {post.type === "video" ? (
                  <VideoGridThumbnail
                    thumbnailUrl={post.thumbnailUrl}
                    videoUrl={post.mediaUrl}
                    style={styles.gridImage}
                    recyclingKey={post._id + "-grid"}
                  />
                ) : (post.thumbnailUrl || post.mediaUrl) ? (
                  <Image
                    source={{ uri: post.thumbnailUrl ?? post.mediaUrl }}
                    style={styles.gridImage}
                    contentFit="cover"
                    contentPosition={{ top: `${(post.cropOffsetY ?? 0.5) * 100}%`, left: `${(post.cropOffsetX ?? 0.5) * 100}%` }}
                    cachePolicy="memory-disk"
                    priority="high"
                    transition={0}
                    recyclingKey={post._id + "-grid"}
                  />
                ) : (
                  <View style={styles.gridPlaceholder}>
                    <SymbolView name="text.quote" size={18} tintColor={colors.gray300} />
                  </View>
                )}
                {post.type === "video" && (
                  <View style={styles.videoPlayBadge}>
                    <SymbolView name="play.fill" size={10} tintColor="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyGrid}>
            <SymbolView name="camera" size={32} tintColor={colors.gray300} />
            <Text style={styles.emptyGridText}>Noch keine Beiträge</Text>
          </View>
        )}

        {/* Admin shortcut */}
        {me.role === "admin" && (
          <View style={styles.adminSection}>
            <TouchableOpacity
              style={styles.adminBtn}
              onPress={() => router.navigate("/(main)/admin-login" as "/")}
              activeOpacity={0.7}
            >
              <SymbolView name="shield.checkered" size={18} tintColor={colors.white} />
              <Text style={styles.adminBtnText}>Admin Dashboard</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <ShareSheet
        visible={shareOpen}
        profileUserId={me?._id ?? null}
        onClose={() => setShareOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  banner: { height: 150, backgroundColor: colors.gray100, position: "relative" },
  bannerImage: { width: "100%", height: "100%" },
  bannerGradient: { flex: 1, backgroundColor: colors.gray200 },
  settingsBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 2px 8px rgba(0,0,0,0.08)",
  },

  profileSection: { paddingHorizontal: spacing.xl, marginTop: -32 },
  avatarRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.lg },
  avatarBorder: {
    padding: 3,
    borderRadius: 48,
    backgroundColor: colors.white,
  },
  statsRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: 6,
  },
  stat: { alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.black, fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 12, color: colors.gray500, marginTop: 1 },

  name: { fontSize: 20, fontWeight: "700", color: colors.black, marginTop: spacing.md, letterSpacing: -0.3 },
  widgetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 8,
    flexWrap: "wrap",
  },
  bio: { fontSize: 15, color: colors.gray700, marginTop: spacing.sm, lineHeight: 22, letterSpacing: -0.1 },

  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  editBtn: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  editBtnText: { fontSize: 14, fontWeight: "600", color: colors.black },
  shareBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },

  interestsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
  },
  chipText: { fontSize: 13, color: colors.gray700, fontWeight: "500" },

  gridHeader: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray200,
  },
  gridTab: {
    paddingVertical: spacing.md,
    borderTopWidth: 1.5,
    borderTopColor: colors.black,
    marginTop: -StyleSheet.hairlineWidth,
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  gridItem: { width: GRID_SIZE, height: GRID_HEIGHT },
  gridImage: { width: "100%", height: "100%" },
  gridPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyGrid: {
    alignItems: "center",
    paddingVertical: 48,
    gap: spacing.md,
  },
  emptyGridText: { fontSize: 14, color: colors.gray400 },

  adminBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.black,
    borderRadius: radius.md,
  },
  adminBtnText: { fontSize: 15, fontWeight: "600", color: colors.white },
  adminSection: {
    flexDirection: "row",
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xxl,
  },

  videoCell: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlayBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});
