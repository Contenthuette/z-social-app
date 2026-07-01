import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { usePaginatedQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, spacing, radius } from "@/lib/theme";
import { safeBack } from "@/lib/navigation";
import { EmptyState } from "@/components/EmptyState";
import { SymbolView } from "@/components/Icon";
import type { Id } from "@/convex/_generated/dataModel";

const ICON_MAP: Record<string, string> = {
  message: "bubble.right",
  like: "heart.fill",
  comment: "bubble.right",
  group_invite: "person.3.fill",
  event_reminder: "calendar",
  ticket_confirmed: "ticket",
  announcement: "megaphone.fill",
  call: "phone.fill",
  join_request: "person.badge.plus",
  join_accepted: "checkmark.circle.fill",
  join_rejected: "xmark.circle.fill",
  post_share: "square.and.arrow.up",
  friend_request: "person.badge.plus",
  friend_accepted: "checkmark.circle.fill",
  friend_request_accepted: "checkmark.circle.fill",
  friend_request_declined: "xmark.circle.fill",
};

export default function NotificationsScreen() {
  const { isAuthenticated } = useConvexAuth();
  const [handledRequests, setHandledRequests] = useState<Set<string>>(new Set());
  const {
    results: notifications,
    status: notificationsStatus,
    loadMore,
  } = usePaginatedQuery(api.notifications.list, isAuthenticated ? {} : "skip", {
    initialNumItems: 20,
  });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const acceptFriend = useMutation(api.friends.acceptRequest);
  const rejectFriend = useMutation(api.friends.declineRequest);

  // Mark all notifications as read when screen opens
  useEffect(() => {
    if (isAuthenticated) {
      markAllRead().catch(() => {});
    }
  }, [isAuthenticated, markAllRead]);

  const handleAcceptFriend = useCallback(async (requestId: string, notificationId: Id<"notifications">) => {
    try {
      await acceptFriend({ requestId: requestId as Id<"friendRequests"> });
      await markRead({ notificationIds: [notificationId] });
      setHandledRequests((prev) => new Set(prev).add(notificationId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fehler";
      if (Platform.OS !== "web") Alert.alert("Fehler", msg);
    }
  }, [acceptFriend, markRead]);

  const handleRejectFriend = useCallback(async (requestId: string, notificationId: Id<"notifications">) => {
    try {
      await rejectFriend({ requestId: requestId as Id<"friendRequests"> });
      await markRead({ notificationIds: [notificationId] });
      setHandledRequests((prev) => new Set(prev).add(notificationId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fehler";
      if (Platform.OS !== "web") Alert.alert("Fehler", msg);
    }
  }, [rejectFriend, markRead]);

  const handlePress = useCallback((item: NonNullable<typeof notifications>[number]) => {
    markRead({ notificationIds: [item._id] });
    if (item.type === "message" && item.referenceId) {
      router.navigate({ pathname: "/(main)/chat", params: { id: item.referenceId } });
    } else if (item.type === "friend_accepted" && item.referenceId) {
      router.navigate({ pathname: "/(main)/user-profile", params: { id: item.referenceId } });
    }
  }, [markRead]);

  if (notificationsStatus === "LoadingFirstPage") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.white }}>
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => safeBack("notifications")} style={styles.backBtn} hitSlop={12}>
              <SymbolView name="chevron.left" size={18} tintColor={colors.black} />
            </TouchableOpacity>
            <Text style={styles.title}>Benachrichtigungen</Text>
            <View style={{ width: 36 }} />
          </View>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={colors.gray300} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeBack("notifications")} style={styles.backBtn} hitSlop={12}>
            <SymbolView name="chevron.left" size={18} tintColor={colors.black} />
          </TouchableOpacity>
          <Text style={styles.title}>Benachrichtigungen</Text>
          <View style={{ width: 36 }} />
        </View>

        <FlatList
          data={notifications}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (notificationsStatus === "CanLoadMore") loadMore(20);
          }}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, !item.isRead && styles.rowUnread]}
              onPress={() => handlePress(item)}
              activeOpacity={0.6}
            >
              <View style={[styles.iconWrap, !item.isRead && styles.iconWrapActive]}>
                <SymbolView
                  name={(ICON_MAP[item.type] || "bell.fill") as Parameters<typeof SymbolView>[0]["name"]}
                  size={16}
                  tintColor={!item.isRead ? colors.white : colors.gray500}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.time}>{formatTime(item.createdAt)}</Text>

                {/* Friend request actions */}
                {item.type === "friend_request" && item.referenceId && !handledRequests.has(item._id) && (
                  <View style={styles.friendActions}>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleAcceptFriend(item.referenceId!, item._id)}
                    >
                      <Text style={styles.acceptBtnText}>Annehmen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleRejectFriend(item.referenceId!, item._id)}
                    >
                      <Text style={styles.rejectBtnText}>Ablehnen</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              {!item.isRead && item.type !== "friend_request" && <View style={styles.dot} />}
            </TouchableOpacity>
          )}
          ListFooterComponent={
            notificationsStatus === "LoadingMore" ? (
              <View style={styles.loadingWrap}><ActivityIndicator color={colors.gray300} /></View>
            ) : notificationsStatus === "CanLoadMore" ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => loadMore(20)}>
                <Text style={styles.loadMoreText}>Mehr laden</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="bell"
              title="Alles ruhig"
              subtitle="Hier erscheinen deine Benachrichtigungen."
            />
          }
        />
      </SafeAreaView>
    </View>
  );
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `vor ${hrs} Std.`;
  return `vor ${Math.floor(hrs / 24)} T.`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 36, height: 36, justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "600", color: colors.black },
  list: { paddingBottom: 40 },
  loadingWrap: { paddingVertical: 60, alignItems: "center" },
  loadMoreBtn: {
    alignSelf: "center",
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
  },
  loadMoreText: { fontSize: 13, fontWeight: "600", color: colors.black },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    gap: spacing.md,
  },
  rowUnread: { backgroundColor: colors.gray50 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  iconWrapActive: { backgroundColor: colors.black },
  body: { fontSize: 14, color: colors.black, lineHeight: 20, letterSpacing: -0.1 },
  time: { fontSize: 12, color: colors.gray400, marginTop: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.black,
    marginTop: 8,
  },

  friendActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  acceptBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.lg,
    backgroundColor: colors.black,
  },
  acceptBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.white,
  },
  rejectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.lg,
    backgroundColor: colors.gray100,
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray700,
  },
});
