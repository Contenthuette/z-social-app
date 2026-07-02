import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { colors, spacing, radius } from "@/lib/theme";
import { safeBack } from "@/lib/navigation";
import { SymbolView } from "@/components/Icon";
import { ChatInputBar } from "@/components/ChatInputBar";
import type { MediaPickResult, ReplyTarget } from "@/components/ChatInputBar";
import { MessageActionSheet, ReactionBadges, QuotedReply } from "@/components/MessageActions";
import { SharedPostBubble } from "@/components/SharedPostBubble";
import { SharedProfileBubble } from "@/components/SharedProfileBubble";
import { VoiceMessageBubble } from "@/components/VoiceMessageBubble";
import { MediaMessageBubble } from "@/components/MediaMessageBubble";
import { Avatar } from "@/components/Avatar";
import * as Haptics from "expo-haptics";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();
  const isNewChat = !!id && id.startsWith("new-");
  const otherUserId = isNewChat ? id.replace("new-", "") : undefined;
  const conversationId = !isNewChat && id ? (id as Id<"conversations">) : undefined;

  // For new chats, resolve the conversation
  const getOrCreateDM = useMutation(api.messaging.getOrCreateDM);
  const resolvedRef = useRef<Id<"conversations"> | null>(null);

  useEffect(() => {
    if (isNewChat && otherUserId && !resolvedRef.current) {
      getOrCreateDM({ otherUserId: otherUserId as Id<"users"> }).then((convId) => {
        resolvedRef.current = convId;
        router.replace({ pathname: "/(main)/chat" as "/", params: { id: convId } });
      }).catch(console.error);
    }
  }, [isNewChat, otherUserId, getOrCreateDM]);

  const {
    results: messages,
    status: messagesStatus,
    loadMore,
  } = usePaginatedQuery(
    api.messaging.getDirectMessages,
    isAuthenticated && conversationId ? { conversationId } : "skip",
    { initialNumItems: 30 },
  );
  const sendMessage = useMutation(api.messaging.sendDirectMessage);
  const deleteMessage = useMutation(api.messaging.deleteMessage);
  const toggleReaction = useMutation(api.messaging.toggleReaction);
  const generateUploadUrl = useMutation(api.messaging.generateUploadUrl);
  const markAsRead = useMutation(api.messaging.markConversationAsRead);
  const me = useQuery(api.users.me, isAuthenticated ? undefined : "skip");
  const partner = useQuery(api.calls.getConversationPartner, isAuthenticated && conversationId ? { conversationId } : "skip");
  const initiateCall = useMutation(api.calls.initiateCall);

  type Msg = NonNullable<typeof messages>[number];
  const [actionTarget, setActionTarget] = useState<Msg | null>(null);
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);

  const previewFor = (m: Msg): string =>
    m.type === "text" ? (m.text ?? "")
    : m.type === "image" ? "📷 Foto"
    : m.type === "video" ? "🎥 Video"
    : m.type === "voice" ? "🎙 Sprachmemo"
    : m.type === "post_share" ? "Beitrag"
    : m.type === "profile_share" ? "Profil"
    : "Nachricht";

  const handleReact = useCallback((messageId: Id<"messages">, emoji: string) => {
    toggleReaction({ messageId, emoji }).catch((e) => console.error("react failed", e));
  }, [toggleReaction]);

  const handleReply = useCallback((m: Msg) => {
    setReplyingTo({ id: m._id, senderName: m.isMe ? "Dir" : (m.senderName ?? partner?.name ?? "Unbekannt"), preview: previewFor(m) });
  }, [partner?.name]);

  const handleCall = useCallback(async (type: "audio" | "video") => {
    if (!conversationId || !partner) return;
    try {
      const callId = await initiateCall({
        receiverId: partner._id,
        conversationId,
        type,
      });
      router.push({ pathname: "/(main)/call" as "/", params: { id: callId } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Anruf fehlgeschlagen";
      if (Platform.OS !== "web") {
        Alert.alert("Anruf fehlgeschlagen", message);
      }
    }
  }, [conversationId, partner, initiateCall]);

  // Mark conversation as read when opening
  useEffect(() => {
    if (conversationId && isAuthenticated) {
      markAsRead({ conversationId }).catch(() => {});
    }
  }, [conversationId, isAuthenticated, markAsRead]);

  const handleSend = async (msg: string) => {
    if (!conversationId) return;
    const replyToId = replyingTo?.id as Id<"messages"> | undefined;
    setReplyingTo(null);
    await sendMessage({ conversationId, text: msg, type: "text", replyToId });
  };

  const handleDeleteMessage = useCallback(async (messageId: Id<"messages">) => {
    try {
      await deleteMessage({ messageId });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error("Failed to delete message", e);
    }
  }, [deleteMessage]);

  const handleLongPressMessage = useCallback((item: Msg) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setActionTarget(item);
  }, []);

  const handleSendVoice = useCallback(async (uri: string, durationMs: number) => {
    if (!conversationId) return;
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
        conversationId,
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
  }, [conversationId, generateUploadUrl, sendMessage]);

  const handleSendMedia = useCallback(async (media: MediaPickResult) => {
    if (!conversationId) return;
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
        conversationId,
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
  }, [conversationId, generateUploadUrl, sendMessage]);

  const renderMessage = ({ item }: { item: Msg }) => {
    const isMine = item.senderId === me?._id;
    const timeStr = new Date(item.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const reactions = (
      <ReactionBadges reactions={item.reactions} isMine={isMine} onPress={() => handleLongPressMessage(item)} />
    );

    let content: React.ReactNode;
    if (item.type === "post_share" && item.sharedPostId) {
      content = (
        <SharedPostBubble
          postId={item.sharedPostId}
          preview={item.sharedPostPreview ?? undefined}
          isMine={isMine}
          timestamp={timeStr}
        />
      );
    } else if (item.type === "profile_share" && item.sharedProfileId) {
      content = (
        <SharedProfileBubble
          profileUserId={item.sharedProfileId}
          isMine={isMine}
          timestamp={timeStr}
        />
      );
    } else if (item.type === "voice") {
      content = (
        <VoiceMessageBubble
          audioUrl={item.mediaUrl ?? ""}
          durationMs={item.mediaDuration}
          isMine={isMine}
          timestamp={timeStr}
        />
      );
    } else if ((item.type === "image" || item.type === "video") && item.mediaUrl) {
      content = (
        <MediaMessageBubble
          mediaUrl={item.mediaUrl}
          type={item.type}
          isMine={isMine}
          timestamp={timeStr}
        />
      );
    } else {
      content = (
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          <QuotedReply senderName={item.replyToSenderName} text={item.replyToText} isMine={isMine} />
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
          activeOpacity={0.8}
          onLongPress={() => handleLongPressMessage(item)}
          delayLongPress={350}
        >
          <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
            {item.type !== "text" && item.replyToSenderName ? (
              <View style={{ maxWidth: "100%" }}>
                <View style={[isMine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
                  <QuotedReply senderName={item.replyToSenderName} text={item.replyToText} isMine={isMine} />
                </View>
                {content}
              </View>
            ) : content}
          </View>
        </TouchableOpacity>
        {reactions}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack("chat")} style={styles.backBtn}>
          <SymbolView name="chevron.left" size={20} tintColor={colors.black} />
        </TouchableOpacity>
        {partner && (
          <Avatar uri={partner.avatarUrl} name={partner.name} size={32} />
        )}
        <Text style={styles.headerTitle}>{partner?.name ?? "Chat"}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerAction} onPress={() => handleCall("audio")}>
            <SymbolView name="phone" size={20} tintColor={colors.black} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerAction} onPress={() => handleCall("video")}>
            <SymbolView name="video" size={20} tintColor={colors.black} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item._id}
          inverted
          contentContainerStyle={styles.messageList}
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
          bottomInset={insets.bottom}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      </KeyboardAvoidingView>

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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  backBtn: { padding: spacing.xs },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "600", color: colors.black, marginLeft: spacing.sm },
  headerActions: { flexDirection: "row", gap: spacing.sm },
  headerAction: { padding: spacing.sm },
  messageList: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  loadingMoreWrap: { paddingVertical: spacing.md, alignItems: "center" },
  msgRow: { marginBottom: spacing.md, maxWidth: "80%" },
  msgRowMine: { alignSelf: "flex-end" },
  bubble: { padding: spacing.md, borderRadius: radius.lg },
  bubbleOther: { backgroundColor: colors.gray100, borderTopLeftRadius: spacing.xs },
  bubbleMine: { backgroundColor: colors.black, borderTopRightRadius: spacing.xs },
  msgText: { fontSize: 15, color: colors.black, lineHeight: 21 },
  msgTextMine: { color: colors.white },
  timestamp: { fontSize: 11, color: colors.gray400, marginTop: spacing.xs, alignSelf: "flex-end" },
  timestampMine: { color: "rgba(255,255,255,0.6)" },
});
