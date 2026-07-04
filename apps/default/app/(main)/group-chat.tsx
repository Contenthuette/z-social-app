import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { colors, spacing, radius } from "@/lib/theme";
import { safeBack } from "@/lib/navigation";
import { Avatar } from "@/components/Avatar";
import { SymbolView } from "@/components/Icon";
import { ChatInputBar } from "@/components/ChatInputBar";
import type { MediaPickResult, ReplyTarget } from "@/components/ChatInputBar";
import { MessageActionSheet, ReactionBadges, QuotedReply } from "@/components/MessageActions";
import { SharedPostBubble } from "@/components/SharedPostBubble";
import { VoiceMessageBubble } from "@/components/VoiceMessageBubble";
import { MediaMessageBubble } from "@/components/MediaMessageBubble";
import { ZettiViewer } from "@/components/ZettiViewer";

export default function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();
  const groupConversationId = useQuery(
    api.messaging.getGroupConversation,
    isAuthenticated && id ? { groupId: id as Id<"groups"> } : "skip",
  );
  const markAsRead = useMutation(api.messaging.markConversationAsRead);

  useEffect(() => {
    if (groupConversationId && isAuthenticated) {
      markAsRead({ conversationId: groupConversationId }).catch(() => {});
    }
  }, [groupConversationId, isAuthenticated, markAsRead]);

  const {
    results: messages,
    status: messagesStatus,
    loadMore,
  } = usePaginatedQuery(
    api.messaging.getGroupMessages,
    isAuthenticated && id ? { groupId: id as Id<"groups"> } : "skip",
    { initialNumItems: 30 },
  );
  const sendMessage = useMutation(api.messaging.sendGroupMessage);
  const generateUploadUrl = useMutation(api.messaging.generateUploadUrl);
  const markZettiViewed = useMutation(api.messaging.markZettiViewed);
  const toggleReaction = useMutation(api.messaging.toggleReaction);
  const deleteMessage = useMutation(api.messaging.deleteMessage);
  const me = useQuery(api.users.me, isAuthenticated ? undefined : "skip");
  const group = useQuery(api.groups.getById, isAuthenticated && id ? { groupId: id as Id<"groups"> } : "skip");

  type Msg = NonNullable<typeof messages>[number];
  const [actionTarget, setActionTarget] = useState<Msg | null>(null);
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const [viewingZetti, setViewingZetti] = useState<Msg | null>(null);

  const previewFor = (m: Msg): string =>
    m.type === "text" ? (m.text ?? "")
    : m.type === "image" ? "📷 Foto"
    : m.type === "video" ? "🎥 Video"
    : m.type === "voice" ? "🎙 Sprachmemo"
    : m.type === "post_share" ? "Beitrag"
    : m.type === "zetti" ? "Zetti"
    : "Nachricht";

  const handleLongPressMessage = useCallback((item: Msg) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionTarget(item);
  }, []);

  const handleReact = useCallback((messageId: Id<"messages">, emoji: string) => {
    toggleReaction({ messageId, emoji }).catch((e) => console.error("react failed", e));
  }, [toggleReaction]);

  const handleReply = useCallback((m: Msg) => {
    setReplyingTo({ id: m._id, senderName: m.isMe ? "Dir" : (m.senderName ?? "Unbekannt"), preview: previewFor(m) });
  }, []);

  const handleDeleteMessage = useCallback((messageId: Id<"messages">) => {
    deleteMessage({ messageId }).catch((e) => console.error("delete failed", e));
  }, [deleteMessage]);

  const handleSend = async (msg: string) => {
    if (!id) return;
    const replyToId = replyingTo?.id as Id<"messages"> | undefined;
    setReplyingTo(null);
    await sendMessage({ groupId: id as Id<"groups">, text: msg, type: "text", replyToId });
  };

  const handleSendVoice = useCallback(async (uri: string, durationMs: number) => {
    if (!id) return;
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uri);
      const blob = await response.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "audio/mp4" },
        body: blob,
      });
      const { storageId } = await uploadResponse.json() as { storageId: Id<"_storage"> };
      await sendMessage({
        groupId: id as Id<"groups">,
        type: "voice",
        mediaStorageId: storageId,
        mediaDuration: durationMs,
        text: `\ud83c\udfa4 ${Math.round(durationMs / 1000)}s`,
      });
    } catch (err) {
      console.error("Failed to send voice message", err);
      if (Platform.OS !== "web") {
        Alert.alert("Fehler", "Sprachnachricht konnte nicht gesendet werden.");
      }
    }
  }, [id, generateUploadUrl, sendMessage]);

  const handleSendMedia = useCallback(async (media: MediaPickResult) => {
    if (!id) return;
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(media.uri);
      const blob = await response.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": media.mimeType },
        body: blob,
      });
      const { storageId } = await uploadResponse.json() as { storageId: Id<"_storage"> };
      await sendMessage({
        groupId: id as Id<"groups">,
        type: media.type,
        mediaStorageId: storageId,
        text: media.type === "video" ? "\ud83c\udfa5 Video" : "\ud83d\uddbc\ufe0f Foto",
      });
    } catch (err) {
      console.error("Failed to send media", err);
      if (Platform.OS !== "web") {
        Alert.alert("Fehler", "Medium konnte nicht gesendet werden.");
      }
    }
  }, [id, generateUploadUrl, sendMessage]);

  const handleSendZetti = useCallback(async (
    media: { uri: string; mimeType: string; isVideo?: boolean; durationMs?: number },
    caption: string,
    textY: number,
  ) => {
    if (!id) return;
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(media.uri);
      const blob = await response.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": media.mimeType },
        body: blob,
      });
      const { storageId } = await uploadResponse.json() as { storageId: Id<"_storage"> };
      await sendMessage({
        groupId: id as Id<"groups">,
        type: "zetti",
        mediaStorageId: storageId,
        text: caption.trim() || undefined,
        zettiTextY: textY,
        // Video Zettis carry a duration; the viewer uses it to play with sound.
        mediaDuration: media.isVideo ? Math.max(1, media.durationMs ?? 0) : undefined,
      });
    } catch (err) {
      console.error("Failed to send Zetti", err);
      if (Platform.OS !== "web") {
        Alert.alert("Fehler", "Zetti konnte nicht gesendet werden.");
      }
    }
  }, [id, generateUploadUrl, sendMessage]);

  // Closing the viewer burns the one and only view (per user, incl. sender)
  const handleCloseZettiViewer = useCallback(() => {
    const target = viewingZetti;
    setViewingZetti(null);
    if (target) {
      markZettiViewed({ messageId: target._id }).catch((e) =>
        console.error("Failed to mark Zetti viewed", e),
      );
    }
  }, [viewingZetti, markZettiViewed]);

  const renderMessage = ({ item }: { item: Msg }) => {
    const isMine = item.senderId === me?._id;
    const timeStr = new Date(item.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

    const avatar = !isMine && (
      <Pressable
        onPress={() => router.navigate({ pathname: "/(main)/user-profile", params: { id: item.senderId } })}
        hitSlop={6}
      >
        <Avatar uri={item.senderAvatarUrl} name={item.senderName} size={30} />
      </Pressable>
    );

    const quoted = item.replyToSenderName ? (
      <QuotedReply senderName={item.replyToSenderName} text={item.replyToText} isMine={isMine} />
    ) : null;

    let inner: React.ReactNode;
    if (item.type === "zetti") {
      inner = item.zettiViewedByMe ? (
        <View style={[styles.zettiPill, styles.zettiPillViewed]}>
          <SymbolView name="eye" size={13} tintColor={colors.gray400} />
          <Text style={styles.zettiPillTextViewed}>
            Zetti von {item.senderName} angesehen
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={() => setViewingZetti(item)}
          style={({ pressed }) => [styles.zettiPill, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.zettiPillText}>
            Z Member {item.senderName} hat ein Zetti gesendet
          </Text>
        </Pressable>
      );
    } else if (item.type === "post_share" && item.sharedPostId) {
      inner = (
        <SharedPostBubble
          postId={item.sharedPostId}
          preview={item.sharedPostPreview ?? undefined}
          isMine={isMine}
          timestamp={timeStr}
        />
      );
    } else if (item.type === "voice") {
      inner = (
        <VoiceMessageBubble
          audioUrl={item.mediaUrl ?? ""}
          durationMs={item.mediaDuration}
          isMine={isMine}
          timestamp={timeStr}
        />
      );
    } else if ((item.type === "image" || item.type === "video") && item.mediaUrl) {
      inner = (
        <MediaMessageBubble
          mediaUrl={item.mediaUrl}
          type={item.type}
          isMine={isMine}
          timestamp={timeStr}
        />
      );
    } else {
      inner = (
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          {quoted}
          <Text style={[styles.msgText, isMine && styles.msgTextMine]}>{item.text}</Text>
          <Text style={[styles.timestamp, isMine && styles.timestampMine]}>
            {timeStr}
          </Text>
        </View>
      );
    }

    return (
      <View>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => handleLongPressMessage(item)}
          delayLongPress={350}
        >
          <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
            {avatar}
            <View>
              {!isMine && <Text style={styles.senderName}>{item.senderName}</Text>}
              {item.type !== "text" && quoted}
              {inner}
            </View>
          </View>
        </TouchableOpacity>
        <ReactionBadges reactions={item.reactions} isMine={isMine} onPress={() => handleLongPressMessage(item)} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack("group-chat")} style={styles.headerBack} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.black} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {group?.name ?? "Gruppenchat"}
          </Text>
          <Text style={styles.headerSub}>
            {group?.memberCount ?? 0} Mitglieder
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item._id}
          inverted
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (messagesStatus === "CanLoadMore") loadMore(30);
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            messagesStatus === "LoadingMore" ? (
              <View style={styles.loadingMoreWrap}>
                <ActivityIndicator color={colors.gray300} />
              </View>
            ) : null
          }
        />

        <ChatInputBar
          onSend={handleSend}
          onSendVoice={handleSendVoice}
          onSendMedia={handleSendMedia}
          onSendZetti={handleSendZetti}
          bottomInset={insets.bottom}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      </KeyboardAvoidingView>

      <ZettiViewer
        visible={!!viewingZetti}
        mediaUrl={viewingZetti?.mediaUrl}
        isVideo={(viewingZetti?.mediaDuration ?? 0) > 0}
        caption={viewingZetti?.text}
        textY={viewingZetti?.zettiTextY}
        onClose={handleCloseZettiViewer}
      />

      <MessageActionSheet
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onReact={(emoji) => { if (actionTarget) handleReact(actionTarget._id, emoji); }}
        onReply={() => { if (actionTarget) handleReply(actionTarget); }}
        onDelete={() => { if (actionTarget) handleDeleteMessage(actionTarget._id); }}
        canDelete={actionTarget?.senderId === me?._id}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray200,
    gap: spacing.sm,
  },
  headerBack: { padding: spacing.xs },
  headerCenter: { flex: 1, marginLeft: 4 },
  headerTitle: { fontSize: 16, fontWeight: "600", color: colors.black },
  headerSub: { fontSize: 12, color: colors.gray400 },
  headerIcon: { padding: spacing.sm },

  messageList: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  loadingMoreWrap: { paddingVertical: spacing.md, alignItems: "center" },
  msgRow: {
    flexDirection: "row",
    marginBottom: spacing.sm,
    gap: spacing.sm,
    maxWidth: "80%",
    alignItems: "flex-end",
  },
  msgRowMine: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    maxWidth: "100%",
  },
  bubbleOther: { backgroundColor: colors.gray100, borderBottomLeftRadius: 6 },
  bubbleMine: { backgroundColor: colors.black, borderBottomRightRadius: 6 },
  senderName: { fontSize: 12, fontWeight: "600", color: colors.gray500, marginBottom: 2 },
  msgText: { fontSize: 15, color: colors.black, lineHeight: 21 },
  msgTextMine: { color: colors.white },
  timestamp: { fontSize: 10, color: colors.gray400, marginTop: 4, alignSelf: "flex-end" },
  timestampMine: { color: "rgba(255,255,255,0.5)" },
  zettiPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.gray100,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  zettiPillViewed: { backgroundColor: colors.gray50 },
  zettiPillText: { fontSize: 13, fontWeight: "600", color: colors.gray700 },
  zettiPillTextViewed: { fontSize: 13, color: colors.gray400 },
});
