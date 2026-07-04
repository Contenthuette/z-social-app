import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  MessageCircle,
  UserPlus,
  UserCheck,
  Clock,
  Play,
  MoreHorizontal,
  ShieldBan,
  Share2,
  Flag,
} from "lucide-react-native";
import { VideoGridThumbnail } from "@/components/VideoGridThumbnail";
import { ZAdminBadge, GroupAdminLinks, LocationBadge } from "@/components/ProfileBadges";
import { ShareSheet } from "@/components/ShareSheet";
import { ImageViewerModal } from "@/components/ImageViewerModal";
import type { Id } from "@/convex/_generated/dataModel";

interface UserPostItem { _id: string; type: string; thumbnailUrl?: string; mediaUrl?: string; cropOffsetX?: number; cropOffsetY?: number; cropZoom?: number }

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 2;
const GRID_COL = 3;
const CELL_WIDTH = (SCREEN_WIDTH - GRID_GAP * (GRID_COL - 1)) / GRID_COL;
const CELL_HEIGHT = Math.round(CELL_WIDTH * (4 / 3)); // 3:4 portrait

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [friendLoading, setFriendLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [avatarViewer, setAvatarViewer] = useState(false);

  const userId = id as Id<"users"> | undefined;

  const user = useQuery(api.users.getById, userId ? { userId } : "skip");
  const userGroups = useQuery(api.users.getUserGroups, userId ? { userId } : "skip");
  const friendStatusData = useQuery(
    api.friends.getStatus,
    userId ? { otherUserId: userId } : "skip"
  );
  const friendStatusVal = friendStatusData?.status ?? "none";
  const friendRequestId = friendStatusData?.requestId;

  const sendFriendRequest = useMutation(api.friends.sendRequest);
  const acceptFriendRequest = useMutation(api.friends.acceptRequest);
  const blockUser = useMutation(api.users.blockUser);
  const createReport = useMutation(api.reports.create);

  const handleFriendAction = useCallback(async () => {
    if (!userId || friendLoading) return;
    setFriendLoading(true);
    try {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (friendStatusVal === "none") {
        await sendFriendRequest({ receiverId: userId });
      } else if (friendStatusVal === "pending_received" && friendRequestId) {
        await acceptFriendRequest({ requestId: friendRequestId });
      }
    } catch (e: unknown) {
      console.error("Friend action error:", e);
    } finally {
      setFriendLoading(false);
    }
  }, [userId, friendLoading, friendStatusVal, friendRequestId, sendFriendRequest, acceptFriendRequest]);

  const handleMessage = useCallback(() => {
    if (!id) return;
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.navigate({ pathname: "/(main)/chat", params: { id: `new-${id}` } });
  }, [id]);

  const handleBlock = useCallback(async () => {
    if (!userId || blockLoading) return;
    setMenuOpen(false);
    if (Platform.OS === "web") {
      setBlockLoading(true);
      try {
        await blockUser({ blockedUserId: userId });
        router.back();
      } catch (e: unknown) {
        console.error("Block error:", e);
      } finally {
        setBlockLoading(false);
      }
      return;
    }
    Alert.alert(
      "Nutzer blockieren",
      `${user?.name ?? "Diesen Nutzer"} blockieren? Die Person kann dir keine Nachrichten mehr senden oder dich anrufen.`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Blockieren",
          style: "destructive",
          onPress: async () => {
            setBlockLoading(true);
            try {
              if (Platform.OS !== "web")
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await blockUser({ blockedUserId: userId });
              router.back();
            } catch (e: unknown) {
              console.error("Block error:", e);
            } finally {
              setBlockLoading(false);
            }
          },
        },
      ],
    );
  }, [userId, blockLoading, user?.name, blockUser]);

  const handleReport = useCallback(async () => {
    if (!userId || reportLoading) return;
    setMenuOpen(false);

    const submitReport = async () => {
      setReportLoading(true);
      try {
        if (Platform.OS !== "web")
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await createReport({
          type: "user",
          targetId: userId,
          reason: "Unangemessenes Profil",
        });
        if (Platform.OS === "web") return;
        Alert.alert(
          "Danke, wir prüfen das.",
          "Möchtest du die Person auch blockieren?",
          [
            { text: "Nein", style: "cancel" },
            { text: "Blockieren", style: "destructive", onPress: handleBlock },
          ],
        );
      } catch (e: unknown) {
        console.error("Report error:", e);
        if (Platform.OS !== "web")
          Alert.alert("Fehler", "Meldung konnte nicht gesendet werden.");
      } finally {
        setReportLoading(false);
      }
    };

    if (Platform.OS === "web") {
      await submitReport();
      return;
    }
    Alert.alert(
      "Profil melden",
      `${user?.name ?? "Dieses Profil"} melden? Unser Team prüft die Meldung.`,
      [
        { text: "Abbrechen", style: "cancel" },
        { text: "Melden", style: "destructive", onPress: () => void submitReport() },
      ],
    );
  }, [userId, reportLoading, user?.name, createReport, handleBlock]);

  if (user === undefined) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Benutzer nicht gefunden</Text>
      </View>
    );
  }

  const getFriendButtonConfig = () => {
    switch (friendStatusVal) {
      case "friends":
        return {
          label: "Befreundet",
          icon: UserCheck,
          style: styles.friendBtnAccepted,
          textStyle: styles.friendBtnAcceptedText,
          iconColor: "#34C759",
          disabled: true,
        };
      case "pending_sent":
        return {
          label: "Gesendet",
          icon: Clock,
          style: styles.friendBtnPending,
          textStyle: styles.friendBtnPendingText,
          iconColor: "#888",
          disabled: true,
        };
      case "pending_received":
        return {
          label: "Akzeptieren",
          icon: UserCheck,
          style: styles.friendBtnDefault,
          textStyle: styles.friendBtnDefaultText,
          iconColor: "#fff",
          disabled: false,
        };
      default:
        return {
          label: "Hinzufügen",
          icon: UserPlus,
          style: styles.friendBtnDefault,
          textStyle: styles.friendBtnDefaultText,
          iconColor: "#fff",
          disabled: false,
        };
    }
  };

  const friendConfig = getFriendButtonConfig();
  const FriendIcon = friendConfig.icon;
  const posts = user.posts ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {user.name || "Profil"}
        </Text>
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => {
            if (Platform.OS !== "web")
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setMenuOpen(true);
          }}
          hitSlop={12}
        >
          <MoreHorizontal size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Block menu modal */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuOpen(false); setShareOpen(true); }}
              activeOpacity={0.6}
            >
              <Share2 size={20} color="#111" />
              <Text style={styles.menuItemText}>Profil teilen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleBlock}
              activeOpacity={0.6}
            >
              <ShieldBan size={20} color="#EF4444" />
              <Text style={styles.menuItemTextDanger}>Blockieren</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleReport}
              activeOpacity={0.6}
            >
              <Flag size={20} color="#EF4444" />
              <Text style={styles.menuItemTextDanger}>Melden</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuCancel}
              onPress={() => setMenuOpen(false)}
              activeOpacity={0.6}
            >
              <Text style={styles.menuCancelText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {userId && (
        <ShareSheet
          visible={shareOpen}
          profileUserId={userId}
          onClose={() => setShareOpen(false)}
        />
      )}

      <ImageViewerModal
        uri={user.avatarUrl}
        visible={avatarViewer}
        onClose={() => setAvatarViewer(false)}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner */}
        <View style={styles.bannerContainer}>
          {user.bannerUrl ? (
            <Image
              source={{ uri: user.bannerUrl }}
              style={styles.bannerImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              transition={0}
            />
          ) : (
            <View style={styles.bannerPlaceholder} />
          )}
          <Pressable
            style={styles.avatarWrapper}
            onPress={() => { if (user.avatarUrl) setAvatarViewer(true); }}
            disabled={!user.avatarUrl}
          >
            {user.avatarUrl ? (
              <Image
                source={{ uri: user.avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                transition={0}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {(user.name || "?")[0].toUpperCase()}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* User Info */}
        <View style={styles.infoSection}>
          <Text style={styles.displayName}>{user.name || "Unbekannt"}</Text>
          {user.role === "admin" && <ZAdminBadge centered />}
          {userGroups && userGroups.length > 0 && <GroupAdminLinks groups={userGroups} />}
          <View style={styles.locationAndMemberContainer}>
            <LocationBadge city={user.city} county={user.county} />
          </View>
          {user.bio && <Text style={styles.bio}>{user.bio}</Text>}

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{posts.length}</Text>
              <Text style={styles.statLabel}>Beiträge</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.6}
              onPress={() => router.navigate({ pathname: "/(main)/friends-list", params: { userId: id!, title: `${user.name} – Freunde` } })}
            >
              <Text style={styles.statNumber}>{user.friendCount ?? 0}</Text>
              <Text style={styles.statLabel}>Freunde</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.6}
              onPress={() => router.navigate({ pathname: "/(main)/groups-list", params: { userId: id!, title: `${user.name} – Gruppen` } })}
            >
              <Text style={styles.statNumber}>{userGroups?.length ?? 0}</Text>
              <Text style={styles.statLabel}>Gruppen</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionBtn, friendConfig.style]}
            onPress={handleFriendAction}
            disabled={friendConfig.disabled || friendLoading}
            activeOpacity={0.7}
          >
            {friendLoading ? (
              <ActivityIndicator size="small" color={friendConfig.iconColor} />
            ) : (
              <>
                <FriendIcon size={16} color={friendConfig.iconColor} />
                <Text
                  style={[styles.actionBtnText, friendConfig.textStyle]}
                  numberOfLines={1}
                >
                  {friendConfig.label}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.messageBtn]}
            onPress={handleMessage}
            activeOpacity={0.7}
          >
            <MessageCircle size={16} color="#000" />
            <Text
              style={[styles.actionBtnText, styles.messageBtnText]}
              numberOfLines={1}
            >
              Nachricht
            </Text>
          </TouchableOpacity>
        </View>

        {/* Posts Grid */}
        <View style={styles.postsSection}>
          <Text style={styles.sectionTitle}>Beiträge</Text>
          {posts.length === 0 ? (
            <View style={styles.emptyPosts}>
              <Text style={styles.emptyText}>Noch keine Beiträge</Text>
            </View>
          ) : (
            <View style={styles.postsGrid}>
              {posts.map((post: UserPostItem, index: number) => {
                const isVideo = post.type === "video";

                return (
                  <TouchableOpacity
                    key={post._id}
                    style={[
                      styles.postTile,
                      {
                        marginRight:
                          (index + 1) % GRID_COL === 0 ? 0 : GRID_GAP,
                        marginBottom: GRID_GAP,
                      },
                    ]}
                    activeOpacity={0.85}
                    onPress={() =>
                      router.navigate({
                        pathname: "/(main)/post-detail",
                        params: { id: post._id },
                      })
                    }
                  >
                    {isVideo ? (
                      <VideoGridThumbnail
                        thumbnailUrl={post.thumbnailUrl}
                        videoUrl={post.mediaUrl}
                        style={styles.postImage}
                        recyclingKey={post._id + "-ugrid"}
                      />
                    ) : (post.thumbnailUrl || post.mediaUrl) ? (
                      <Image
                        source={{ uri: post.thumbnailUrl ?? post.mediaUrl }}
                        style={styles.postImage}
                        contentFit="cover"
                        contentPosition={{ top: `${(post.cropOffsetY ?? 0.5) * 100}%`, left: `${(post.cropOffsetX ?? 0.5) * 100}%` }}
                        cachePolicy="memory-disk"
                        priority="high"
                        transition={0}
                        recyclingKey={post._id + "-ugrid"}
                      />
                    ) : (
                      <View
                        style={[styles.postImage, styles.postVideoFallback]}
                      >
                        <Play size={28} color="#fff" fill="#fff" />
                      </View>
                    )}
                    {isVideo && (
                      <View style={styles.videoOverlay}>
                        <Play size={12} color="#fff" fill="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#999",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  headerSpacer: {
    width: 36,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Banner
  bannerContainer: {
    height: 180,
    position: "relative",
    marginBottom: 50,
  },
  bannerImage: {
    width: "100%",
    height: 180,
  },
  bannerPlaceholder: {
    width: "100%",
    height: 180,
    backgroundColor: "#e8e8e8",
  },
  avatarWrapper: {
    position: "absolute",
    bottom: -40,
    left: SCREEN_WIDTH / 2 - 45,
    borderRadius: 45,
    borderWidth: 4,
    borderColor: "#fff",
    backgroundColor: "#fff",
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  avatarPlaceholder: {
    backgroundColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: "700",
    color: "#888",
  },

  // Info
  infoSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  locationAndMemberContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  displayName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#000",
    marginBottom: 2,
  },
  bio: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 12,
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  statItem: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#e0e0e0",
  },

  // Action Buttons
  actionButtons: {
    flexDirection: "row",
    paddingHorizontal: 24,
    gap: 10,
    marginBottom: 24,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 22,
    gap: 7,
    paddingHorizontal: 14,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Friend button states
  friendBtnDefault: {
    backgroundColor: "#000",
  },
  friendBtnDefaultText: {
    color: "#fff",
  },
  friendBtnPending: {
    backgroundColor: "#f2f2f2",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  friendBtnPendingText: {
    color: "#888",
  },
  friendBtnAccepted: {
    backgroundColor: "#f0faf0",
    borderWidth: 1,
    borderColor: "#c8e6c8",
  },
  friendBtnAcceptedText: {
    color: "#34C759",
  },
  friendBtnReceived: {
    backgroundColor: "#f2f2f2",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  friendBtnReceivedText: {
    color: "#888",
  },

  // Message button
  messageBtn: {
    backgroundColor: "#f2f2f2",
  },
  messageBtnText: {
    color: "#000",
  },

  // Posts
  postsSection: {
    paddingHorizontal: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  emptyPosts: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: "#bbb",
  },
  postsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  postTile: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    backgroundColor: "#f0f0f0",
    position: "relative",
    overflow: "hidden",
  },
  postImage: {
    width: "100%",
    height: "100%",
  },
  postVideoFallback: {
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  videoOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  // More / block menu
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 6,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
  },
  menuItemTextDanger: {
    fontSize: 16,
    fontWeight: "600",
    color: "#EF4444",
  },
  menuCancel: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f2f2f2",
    marginTop: 4,
  },
  menuCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
});
