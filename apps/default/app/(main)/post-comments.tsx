import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Platform, ActivityIndicator,
  Keyboard, Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { colors, spacing } from "@/lib/theme";
import { Avatar } from "@/components/Avatar";
import { SymbolView } from "@/components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

export default function PostCommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [kbHeight, setKbHeight] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const { isAuthenticated } = useConvexAuth();

  // Manually lift the input bar above the keyboard. Inside an iOS formSheet
  // the native auto-resize is unreliable, so we track the keyboard height.
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKbHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const me = useQuery(api.users.me, isAuthenticated ? undefined : "skip");
  const meId = me?._id;

  const comments = useQuery(
    api.posts.getComments,
    id ? { postId: id as Id<"posts">, currentUserId: meId ?? undefined } : "skip"
  );
  const addComment = useMutation(api.posts.addComment);
  const deleteComment = useMutation(api.posts.deleteComment);
  const toggleCommentLike = useMutation(api.posts.toggleCommentLike);

  const handleSend = useCallback(async () => {
    const msg = text.trim();
    if (!msg || !id) return;
    setText("");
    Keyboard.dismiss();
    try {
      await addComment({ postId: id as Id<"posts">, text: msg });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e) {
      console.error("Failed to add comment", e);
    }
  }, [text, id, addComment]);

  const handleToggleLike = useCallback(async (commentId: Id<"comments">) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      await toggleCommentLike({ commentId });
    } catch (e) {
      console.error("Failed to toggle like", e);
    }
  }, [toggleCommentLike]);

  const handleDeleteComment = useCallback(async (commentId: Id<"comments">) => {
    try {
      await deleteComment({ commentId });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error("Failed to delete comment", e);
    }
  }, [deleteComment]);

  const handleLongPress = useCallback((item: { _id: Id<"comments">; authorId: Id<"users"> }) => {
    if (item.authorId !== meId) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (Platform.OS === "web") {
      if (confirm("Kommentar loeschen?")) {
        handleDeleteComment(item._id);
      }
    } else {
      Alert.alert(
        "Kommentar loeschen",
        "Moechtest du diesen Kommentar loeschen?",
        [
          { text: "Abbrechen", style: "cancel" },
          { text: "Loeschen", style: "destructive", onPress: () => handleDeleteComment(item._id) },
        ]
      );
    }
  }, [meId, handleDeleteComment]);

  return (
    <View style={[styles.container, { paddingBottom: kbHeight }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <SymbolView name="chevron.down" size={20} tintColor={colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>Kommentare</Text>
        <View style={styles.closePlaceholder} />
      </View>

      {/* Comments list */}
        <FlatList
          style={styles.list}
          data={comments ?? []}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              onLongPress={() => handleLongPress(item)}
              delayLongPress={500}
              disabled={item.authorId !== meId}
            >
              <View style={styles.commentRow}>
                <Avatar uri={item.authorAvatarUrl} name={item.authorName} size={34} />
                <View style={styles.commentBody}>
                  <Text style={styles.commentAuthor}>{item.authorName}</Text>
                  <Text style={styles.commentText}>{item.text}</Text>
                  <View style={styles.commentMeta}>
                    <Text style={styles.commentTime}>{formatTime(item.createdAt)}</Text>
                    {item.likeCount > 0 && (
                      <Text style={styles.commentLikeCount}>
                        {item.likeCount} {item.likeCount === 1 ? "Like" : "Likes"}
                      </Text>
                    )}
                    {item.authorId === meId && (
                      <Text style={styles.ownBadge}>Dein Kommentar</Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.likeBtn}
                  onPress={() => handleToggleLike(item._id)}
                  hitSlop={12}
                >
                  <SymbolView
                    name={item.isLiked ? "heart.fill" : "heart"}
                    size={16}
                    tintColor={item.isLiked ? "#FF3B30" : colors.gray400}
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            comments === undefined ? (
              <View style={styles.emptyWrap}>
                <ActivityIndicator color={colors.gray300} />
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Noch keine Kommentare</Text>
                <Text style={styles.emptySub}>Sei der Erste!</Text>
              </View>
            )
          }
        />

        {/* Input bar - send button matches input height */}
        <View style={[styles.inputBar, { paddingBottom: kbHeight > 0 ? 10 : Math.max(insets.bottom, 14) }]}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Kommentar schreiben..."
            placeholderTextColor={colors.gray400}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={text.trim().length === 0}
            activeOpacity={0.7}
            style={[
              styles.sendBtn,
              text.trim().length === 0 && styles.sendBtnDisabled,
            ]}
          >
            <SymbolView name="arrow.up" size={16} tintColor={colors.white} />
          </TouchableOpacity>
        </View>
    </View>
  );
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Gerade eben";
  if (min < 60) return `${min} Min.`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} Std.`;
  return `${Math.floor(hrs / 24)} T.`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray200,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  closePlaceholder: {
    width: 36,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.black,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.gray500,
  },
  emptySub: {
    fontSize: 13,
    color: colors.gray400,
    marginTop: 4,
  },
  commentRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
    alignItems: "flex-start",
  },
  commentBody: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.black,
  },
  commentText: {
    fontSize: 14,
    color: colors.gray700,
    lineHeight: 20,
    marginTop: 2,
  },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
  },
  commentTime: {
    fontSize: 12,
    color: colors.gray400,
  },
  commentLikeCount: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.gray500,
  },
  ownBadge: {
    fontSize: 11,
    color: colors.gray400,
    fontStyle: "italic",
  },
  likeBtn: {
    paddingTop: 4,
    paddingLeft: 8,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray200,
    gap: spacing.sm,
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    backgroundColor: colors.gray100,
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.black,
    maxHeight: 100,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.gray300,
  },
});
