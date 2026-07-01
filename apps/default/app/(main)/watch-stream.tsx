import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  Modal, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { colors, spacing, radius } from "@/lib/theme";
import { SymbolView } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { useLivestreamViewer } from "@/lib/useLivestreamViewer";
import { safeBack } from "@/lib/navigation";
import * as Haptics from "expo-haptics";
import { setSpeakerOn, forceSpeakerWithRetries } from "@/lib/audioRouting";
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  Easing, FadeIn, FadeInUp,
} from "react-native-reanimated";

// Two-person (co-host) livestreaming is temporarily disabled — solo streaming only.
// Flip to true to re-enable the "join livestream" request once multi-host (SFU) is ready.
const ALLOW_COHOST_JOIN = false;

export default function WatchStreamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const livestreamId = id as Id<"livestreams"> | undefined;
  const [commentText, setCommentText] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [isJoiningCall, setIsJoiningCall] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const commentsRef = useRef<FlatList>(null);

  const joinStream = useMutation(api.livestreams.joinStream);
  const leaveStream = useMutation(api.livestreams.leaveStream);
  const requestJoin = useMutation(api.livestreams.requestJoin);
  const sendComment = useMutation(api.livestreams.sendComment);

  const myJoinStatus = useQuery(
    api.livestreams.getMyJoinRequestStatus,
    livestreamId ? { livestreamId } : "skip",
  );

  const stream = useQuery(
    api.livestreams.getById,
    livestreamId ? { livestreamId } : "skip",
  );
  const comments = useQuery(
    api.livestreams.getComments,
    livestreamId ? { livestreamId } : "skip",
  );
  const viewers = useQuery(
    api.livestreams.getViewers,
    livestreamId && showViewers ? { livestreamId } : "skip",
  );

  const { remoteStreamUrl, connectionState, cleanup, RTCView } =
    useLivestreamViewer({
      livestreamId: livestreamId ?? null,
      hostId: stream?.hostId ?? null,
      enabled: !!livestreamId && !!stream && stream.status === "live",
    });

  // Derived state (must be before any conditional returns for hooks below)
  const canJoinCall = (stream?.participantCount ?? 0) < 2;
  const joinRequested = myJoinStatus === "pending";
  const joinAccepted = myJoinStatus === "accepted";

  // Navigate to go-live when request is accepted
  useEffect(() => {
    if (joinAccepted && livestreamId) {
      leaveStream({ livestreamId }).catch(() => {});
      cleanup();
      router.replace({
        pathname: "/(main)/go-live",
        params: { livestreamId, mode: "cohost" },
      });
    }
  }, [joinAccepted, livestreamId, leaveStream, cleanup]);

  // Pulsing LIVE dot
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulseOpacity]);
  const pulseDotStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  // Join on mount as viewer
  useEffect(() => {
    if (!livestreamId || hasJoined) return;
    setHasJoined(true);
    joinStream({ livestreamId }).catch(() => {});
    // Force audio to loudspeaker for viewer
    const cancelRetries = forceSpeakerWithRetries();
    return () => {
      cancelRetries();
      cleanup();
      setSpeakerOn(false);
    };
  }, [livestreamId, hasJoined, joinStream, cleanup]);

  // Re-force speaker when remote stream actually arrives (WebRTC resets audio session)
  useEffect(() => {
    if (!remoteStreamUrl) return;
    const cancelRetries = forceSpeakerWithRetries();
    return () => cancelRetries();
  }, [remoteStreamUrl]);

  // Reversed comments for inverted FlatList (newest at bottom)
  const reversedComments = useMemo(
    () => [...(comments ?? [])].reverse(),
    [comments],
  );

  const handleClose = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (livestreamId) leaveStream({ livestreamId }).catch(() => {});
    cleanup();
    safeBack("watch-stream");
  }, [livestreamId, leaveStream, cleanup]);

  const handleSendComment = useCallback(async () => {
    if (!livestreamId || !commentText.trim()) return;
    try {
      await sendComment({ livestreamId, text: commentText.trim() });
      setCommentText("");
    } catch { /* rate limited */ }
  }, [livestreamId, commentText, sendComment]);

  const handleJoinCall = useCallback(async () => {
    if (!livestreamId) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsJoiningCall(true);
    try {
      const result = await requestJoin({ livestreamId });
      if (result === "full") {
        if (Platform.OS !== "web") {
          Alert.alert(
            "Livestream voll",
            "Mehr als 2 Personen live sind derzeit nicht möglich.",
          );
        }
        setIsJoiningCall(false);
      } else if (result === "already_requested") {
        setIsJoiningCall(false);
      } else {
        // Request sent! Wait for host to accept
        setIsJoiningCall(false);
      }
    } catch {
      setIsJoiningCall(false);
    }
  }, [livestreamId, requestJoin]);

  if (!livestreamId) return null;

  // Loading
  if (!stream) {
    return (
      <View style={styles.fullScreen}>
        <SafeAreaView style={styles.centerContent}>
          <ActivityIndicator color={colors.white} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  // Stream ended
  if (stream.status === "ended") {
    return (
      <View style={styles.fullScreen}>
        <SafeAreaView style={styles.centerContent}>
          <SymbolView name="video.slash" size={48} tintColor={colors.gray500} />
          <Text style={styles.endedText}>Der Z Livestream wurde beendet</Text>
          <Text style={styles.endedSub}>
            {stream.peakViewerCount} Zuschauer insgesamt
          </Text>
          <TouchableOpacity style={styles.backPill} onPress={() => safeBack("watch-stream")}>
            <Text style={styles.backPillText}>Zurück</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.fullScreen}>
      {/* Remote video */}
      {remoteStreamUrl && RTCView ? (
        <RTCView
          streamURL={remoteStreamUrl}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          mirror={false}
          zOrder={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.waitingBg]}>
          <View style={styles.hostInfo}>
            <Avatar uri={stream.hostAvatarUrl} name={stream.hostName} size={64} />
            <Text style={styles.hostName}>{stream.hostName}</Text>
            {stream.coHostName && (
              <View style={styles.coHostBadge}>
                <Text style={styles.coHostBadgeText}>
                  + {stream.coHostName}
                </Text>
              </View>
            )}
            <Text style={styles.waitingText}>
              {connectionState === "connected" ? "Verbunden" : "Verbinde mit Stream\u2026"}
            </Text>
            {connectionState !== "connected" && (
              <ActivityIndicator color={colors.white} style={{ marginTop: 8 }} />
            )}
          </View>
        </View>
      )}

      {/* Participant overlay when 2 are live */}
      {stream.participantCount === 2 && stream.coHostName && (
        <View style={styles.participantOverlay}>
          <View style={styles.participantAvatarRow}>
            <Avatar uri={stream.hostAvatarUrl} name={stream.hostName} size={28} />
            <Avatar uri={stream.coHostAvatarUrl} name={stream.coHostName} size={28} />
          </View>
          <Text style={styles.participantNames}>
            {stream.hostName} & {stream.coHostName}
          </Text>
        </View>
      )}

      <SafeAreaView style={styles.overlay}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {/* Top bar */}
          <Animated.View entering={FadeIn.duration(300)} style={styles.topBar}>
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveBadgeDot, pulseDotStyle]} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
            <TouchableOpacity
              style={styles.viewerBadge}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowViewers(true);
              }}
              activeOpacity={0.7}
            >
              <SymbolView name="eye" size={12} tintColor={colors.white} />
              <Text style={styles.viewerBadgeText}>{stream.viewerCount}</Text>
            </TouchableOpacity>
            {stream.participantCount > 0 && (
              <View style={styles.participantBadge}>
                <SymbolView name="person.fill" size={12} tintColor={colors.white} />
                <Text style={styles.viewerBadgeText}>{stream.participantCount}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <SymbolView name="xmark" size={18} tintColor={colors.white} />
            </TouchableOpacity>
          </Animated.View>

          {/* Stream title + host */}
          <Animated.View entering={FadeInUp.duration(400).delay(100)} style={styles.streamHeader}>
            <Text style={styles.streamTitle} numberOfLines={1}>{stream.title}</Text>
            <View style={styles.streamHostRow}>
              <Avatar uri={stream.hostAvatarUrl} name={stream.hostName} size={24} />
              <Text style={styles.streamHostName}>{stream.hostName}</Text>
              {stream.coHostName && (
                <Text style={styles.coHostInline}>+ {stream.coHostName}</Text>
              )}
            </View>
          </Animated.View>

          <View style={{ flex: 1 }} />

          {/* Join Call button — co-host feature temporarily disabled (solo streaming only) */}
          {ALLOW_COHOST_JOIN && canJoinCall && (
            <Animated.View entering={FadeInUp.duration(300)} style={styles.joinCallContainer}>
              <TouchableOpacity
                style={[styles.joinCallBtn, joinRequested && styles.joinCallBtnPending]}
                onPress={handleJoinCall}
                disabled={isJoiningCall || joinRequested}
                activeOpacity={0.8}
              >
                {isJoiningCall ? (
                  <ActivityIndicator color={colors.black} size="small" />
                ) : joinRequested ? (
                  <>
                    <SymbolView name="clock" size={16} tintColor={colors.gray500} />
                    <Text style={styles.joinCallTextPending}>Anfrage gesendet</Text>
                  </>
                ) : (
                  <>
                    <SymbolView name="hand.raised.fill" size={16} tintColor={colors.black} />
                    <Text style={styles.joinCallText}>Beitritt anfragen</Text>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Comments */}
          <FlatList
            ref={commentsRef}
            data={reversedComments}
            keyExtractor={(item) => item._id}
            style={styles.commentsList}
            contentContainerStyle={styles.commentsContent}
            showsVerticalScrollIndicator={false}
            inverted
            renderItem={({ item }) => (
              <View style={styles.commentBubble}>
                <Text style={styles.commentAuthor}>{item.userName}</Text>
                <Text style={styles.commentText}>{item.text}</Text>
              </View>
            )}
          />

          {/* Comment input */}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Nachricht schreiben..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={commentText}
              onChangeText={setCommentText}
              returnKeyType="send"
              onSubmitEditing={handleSendComment}
              maxLength={200}
            />
            <TouchableOpacity onPress={handleSendComment} disabled={!commentText.trim()}>
              <SymbolView
                name="paperplane.fill"
                size={20}
                tintColor={commentText.trim() ? colors.white : "rgba(255,255,255,0.3)"}
              />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Viewers Modal */}
      <Modal
        visible={showViewers}
        transparent
        animationType="slide"
        onRequestClose={() => setShowViewers(false)}
      >
        <Pressable style={styles.viewersBackdrop} onPress={() => setShowViewers(false)}>
          <Pressable style={styles.viewersSheet} onPress={() => {}}>
            <View style={styles.viewersHandle} />
            <Text style={styles.viewersTitle}>
              Zuschauer ({stream.viewerCount})
            </Text>
            {!viewers ? (
              <ActivityIndicator color={colors.gray400} style={{ marginTop: 20 }} />
            ) : viewers.length === 0 ? (
              <View style={styles.viewersEmpty}>
                <SymbolView name="eye" size={32} tintColor={colors.gray500} />
                <Text style={styles.viewersEmptyText}>Noch keine Zuschauer</Text>
              </View>
            ) : (
              <FlatList
                data={viewers}
                keyExtractor={(item) => item._id}
                style={styles.viewersList}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item }) => (
                  <View style={styles.viewerRow}>
                    <Avatar uri={item.userAvatarUrl} name={item.userName} size={36} />
                    <Text style={styles.viewerName}>{item.userName}</Text>
                  </View>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: colors.black },
  overlay: { flex: 1 },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: spacing.xl,
  },
  waitingBg: {
    backgroundColor: colors.gray900,
    alignItems: "center",
    justifyContent: "center",
  },
  hostInfo: {
    alignItems: "center",
    gap: 10,
  },
  hostName: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  waitingText: {
    color: colors.gray400,
    fontSize: 14,
  },
  endedText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
  },
  endedSub: {
    color: colors.gray400,
    fontSize: 14,
  },
  backPill: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.full,
    backgroundColor: colors.gray800,
  },
  backPillText: { color: colors.white, fontSize: 15, fontWeight: "600" },

  /* CoHost badge */
  coHostBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  coHostBadgeText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontWeight: "600",
  },
  coHostInline: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: "500",
  },

  /* Top bar */
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: 8,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderCurve: "continuous",
  },
  liveBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.white,
  },
  liveBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  viewerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  participantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  viewerBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Participant overlay */
  participantOverlay: {
    position: "absolute",
    top: 110,
    alignSelf: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderCurve: "continuous",
    zIndex: 10,
    gap: 6,
  },
  participantAvatarRow: {
    flexDirection: "row",
    gap: -8,
  },
  participantNames: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.2,
  },

  /* Stream info */
  streamHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: 6,
  },
  streamTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  streamHostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  streamHostName: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "600",
  },

  /* Join Call */
  joinCallContainer: {
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  joinCallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.full,
    borderCurve: "continuous",
  },
  joinCallText: {
    color: colors.black,
    fontSize: 15,
    fontWeight: "700",
  },
  joinCallBtnPending: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  joinCallTextPending: {
    color: colors.gray500,
    fontSize: 15,
    fontWeight: "600",
  },

  /* Comments */
  commentsList: {
    maxHeight: 76,
    marginHorizontal: spacing.lg,
    flexGrow: 0,
  },
  commentsContent: {
    paddingBottom: spacing.sm,
    gap: 4,
  },
  commentBubble: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.3)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.md,
    borderCurve: "continuous",
    gap: 5,
    flexWrap: "wrap",
  },
  commentAuthor: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "700",
  },
  commentText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    flex: 1,
  },

  /* Comment input */
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  commentInput: {
    flex: 1,
    fontSize: 14,
    color: colors.white,
    letterSpacing: -0.1,
  },

  /* Viewers Modal */
  viewersBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  viewersSheet: {
    backgroundColor: colors.gray900,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 40,
    maxHeight: "60%",
  },
  viewersHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray600,
    alignSelf: "center",
    marginBottom: 16,
  },
  viewersTitle: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginBottom: 16,
  },
  viewersEmpty: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 30,
  },
  viewersEmptyText: {
    color: colors.gray500,
    fontSize: 14,
  },
  viewersList: {
    flexGrow: 0,
  },
  viewerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  viewerName: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "600",
  },
});
