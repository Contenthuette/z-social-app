import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  Modal, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { colors, spacing, radius } from "@/lib/theme";
import { SymbolView } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { useLivestreamHost } from "@/lib/useLivestreamHost";
import { safeBack } from "@/lib/navigation";
import * as Haptics from "expo-haptics";
import { setSpeakerOn, forceSpeakerWithRetries } from "@/lib/audioRouting";
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  Easing, FadeIn, FadeInUp,
} from "react-native-reanimated";

export default function GoLiveScreen() {
  const { groupId, livestreamId: existingId, mode } = useLocalSearchParams<{
    groupId?: string;
    livestreamId?: string;
    mode?: string;
  }>();
  const [title, setTitle] = useState("");
  const [livestreamId, setLivestreamId] = useState<Id<"livestreams"> | null>(
    existingId ? (existingId as Id<"livestreams">) : null,
  );
  const [isStarting, setIsStarting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [showViewers, setShowViewers] = useState(false);
  const commentsRef = useRef<FlatList>(null);
  const isCoHost = mode === "cohost";

  const goLive = useMutation(api.livestreams.goLive);
  const endStreamMut = useMutation(api.livestreams.endStream);
  const joinAsParticipant = useMutation(api.livestreams.joinAsParticipant);
  const leaveAsParticipant = useMutation(api.livestreams.leaveAsParticipant);
  const sendComment = useMutation(api.livestreams.sendComment);
  const respondToJoinRequest = useMutation(api.livestreams.respondToJoinRequest);

  const stream = useQuery(
    api.livestreams.getById,
    livestreamId ? { livestreamId } : "skip",
  );
  const comments = useQuery(
    api.livestreams.getComments,
    livestreamId ? { livestreamId } : "skip",
  );
  const joinRequests = useQuery(
    api.livestreams.getJoinRequests,
    livestreamId && !isCoHost ? { livestreamId } : "skip",
  );
  const viewers = useQuery(
    api.livestreams.getViewers,
    livestreamId && showViewers ? { livestreamId } : "skip",
  );

  const {
    localStreamUrl, remoteStreamUrl,
    isMuted, isVideoOff, isFrontCamera, isSwitchingCamera,
    toggleMute, toggleVideo, flipCamera, cleanup, isSupported, RTCView,
  } = useLivestreamHost({ livestreamId, enabled: !!livestreamId, enablePreview: true, isCoHost });

  const isLive = !!livestreamId;

  // Auto-join as participant if entering as cohost
  useEffect(() => {
    if (isCoHost && livestreamId && !isJoining) {
      setIsJoining(true);
      joinAsParticipant({ livestreamId }).then((result) => {
        if (result === "full") {
          if (Platform.OS !== "web") {
            Alert.alert(
              "Livestream voll",
              "Mehr als 2 Personen live sind derzeit nicht möglich. Warte bis jemand den Call verlässt.",
              [{ text: "OK", onPress: () => { cleanup(); safeBack("go-live"); } }],
            );
          } else {
            cleanup();
            safeBack("go-live");
          }
        }
      }).catch(() => {
        cleanup();
        safeBack("go-live");
      });
    }
  }, [isCoHost, livestreamId, isJoining, joinAsParticipant, cleanup]);

  // Pulsing LIVE dot
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    if (isLive) {
      pulseOpacity.value = withRepeat(
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }
  }, [isLive, pulseOpacity]);
  const pulseDotStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  // Force audio to loudspeaker for livestream
  useEffect(() => {
    if (!isLive) return;
    const cancelRetries = forceSpeakerWithRetries();
    return () => { cancelRetries(); setSpeakerOn(false); };
  }, [isLive]);

  // Re-force speaker when remote peer connects (WebRTC resets audio session)
  useEffect(() => {
    if (!remoteStreamUrl || !isLive) return;
    const cancelRetries = forceSpeakerWithRetries();
    return () => cancelRetries();
  }, [remoteStreamUrl, isLive]);

  // Reversed comments for inverted FlatList (newest at bottom)
  const reversedComments = useMemo(
    () => [...(comments ?? [])].reverse(),
    [comments],
  );

  const handleGoLive = useCallback(async () => {
    if (!title.trim()) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsStarting(true);
    try {
      const id = await goLive({
        groupId: groupId ? (groupId as Id<"groups">) : undefined,
        title: title.trim(),
      });
      setLivestreamId(id);
    } catch (e) {
      console.error("Go live failed:", e);
    } finally {
      setIsStarting(false);
    }
  }, [groupId, title, goLive]);

  const handleEndStream = useCallback(async () => {
    if (!livestreamId) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (isCoHost) {
        await leaveAsParticipant({ livestreamId });
      } else {
        await endStreamMut({ livestreamId });
      }
    } catch { /* already ended */ }
    cleanup();
    safeBack("go-live");
  }, [livestreamId, endStreamMut, leaveAsParticipant, cleanup, isCoHost]);

  const handleSendComment = useCallback(async () => {
    if (!livestreamId || !commentText.trim()) return;
    try {
      await sendComment({ livestreamId, text: commentText.trim() });
      setCommentText("");
    } catch { /* rate limited */ }
  }, [livestreamId, commentText, sendComment]);

  if (!isSupported) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.unsupported}>
          <SymbolView name="video.slash" size={48} tintColor={colors.gray400} />
          <Text style={styles.unsupportedText}>Livestreaming ist nur in der App verfügbar.</Text>
          <TouchableOpacity style={styles.backPill} onPress={() => safeBack("go-live")}>
            <Text style={styles.backPillText}>Zurück</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  /* ---- Pre-Live Setup (host only) ---- */
  if (!isLive) {
    return (
      <View style={styles.fullScreen}>
        {localStreamUrl && RTCView && !isSwitchingCamera ? (
          <RTCView
            streamURL={localStreamUrl}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            mirror={isFrontCamera}
            zOrder={0}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.cameraPlaceholder]}>
            {!isSwitchingCamera && (
              <>
                <ActivityIndicator color={colors.white} size="large" />
                <Text style={styles.cameraPlaceholderText}>Kamera & Mikro werden aktiviert</Text>
              </>
            )}
          </View>
        )}

        <View style={styles.gradientOverlay} />

        <SafeAreaView style={styles.overlay}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          >
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { cleanup(); safeBack("go-live"); }}>
                <SymbolView name="xmark" size={18} tintColor={colors.white} />
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }} />

            <Animated.View entering={FadeInUp.duration(400)} style={styles.setupArea}>
              <Text style={styles.setupTitle}>Go Live</Text>
              <Text style={styles.setupSubtitle}>Gib deinem Livestream einen Titel</Text>
              <TextInput
                style={styles.titleInput}
                placeholder="Welches Thema hat dein Stream?"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={title}
                onChangeText={setTitle}
                maxLength={80}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.goLiveBtn, (!title.trim() || isStarting) && styles.goLiveBtnDisabled]}
                onPress={handleGoLive}
                disabled={!title.trim() || isStarting}
                activeOpacity={0.8}
              >
                {isStarting ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <>
                    <View style={styles.liveDot} />
                    <Text style={styles.goLiveBtnText}>Live gehen</Text>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  /* ---- Live Mode ---- */
  const hasRemotePeer = !!remoteStreamUrl;

  return (
    <View style={styles.fullScreen}>
      {/* Video area: 50/50 split or solo */}
      {hasRemotePeer ? (
        <View style={styles.splitContainer}>
          {/* Top half: local camera (yourself) */}
          <View style={styles.splitHalf}>
            {localStreamUrl && RTCView && !isVideoOff && !isSwitchingCamera ? (
              <RTCView
                streamURL={localStreamUrl}
                style={StyleSheet.absoluteFill}
                objectFit="cover"
                mirror={isFrontCamera}
                zOrder={0}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.videoOffBg]}>
                {!isSwitchingCamera && (
                  <SymbolView name="video.slash" size={32} tintColor={colors.gray500} />
                )}
              </View>
            )}
            <View style={styles.splitLabel}>
              <Text style={styles.splitLabelText}>Du</Text>
            </View>
          </View>
          {/* Divider */}
          <View style={styles.splitDivider} />
          {/* Bottom half: remote camera (the other person) */}
          <View style={styles.splitHalf}>
            {RTCView && remoteStreamUrl ? (
              <RTCView
                streamURL={remoteStreamUrl}
                style={StyleSheet.absoluteFill}
                objectFit="cover"
                zOrder={0}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.videoOffBg]}>
                <ActivityIndicator color={colors.white} size="small" />
              </View>
            )}
            <View style={styles.splitLabel}>
              <Text style={styles.splitLabelText}>
                {isCoHost ? stream?.hostName ?? "Host" : stream?.coHostName ?? "Gast"}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        /* Solo: local camera fullscreen */
        <>
          {localStreamUrl && RTCView && !isVideoOff && !isSwitchingCamera ? (
            <RTCView
              streamURL={localStreamUrl}
              style={StyleSheet.absoluteFill}
              objectFit="cover"
              mirror={isFrontCamera}
              zOrder={0}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.videoOffBg]}>
              {!isSwitchingCamera && (
                <SymbolView name="video.slash" size={48} tintColor={colors.gray500} />
              )}
            </View>
          )}
        </>
      )}

      <View style={styles.gradientOverlay} />

      <SafeAreaView style={styles.overlay}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {/* Top bar */}
          <View style={styles.topBar}>
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
              <Text style={styles.viewerBadgeText}>{stream?.viewerCount ?? 0}</Text>
            </TouchableOpacity>
            {stream && stream.participantCount > 0 && (
              <View style={styles.participantBadge}>
                <SymbolView name="person.fill" size={12} tintColor={colors.white} />
                <Text style={styles.viewerBadgeText}>{stream.participantCount}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.endBtn} onPress={handleEndStream} activeOpacity={0.8}>
              <Text style={styles.endBtnText}>{isCoHost ? "Verlassen" : "Beenden"}</Text>
            </TouchableOpacity>
          </View>

          {/* Stream info */}
          <Animated.View entering={FadeIn.duration(300)} style={styles.streamInfo}>
            <Text style={styles.streamTitle} numberOfLines={1}>
              {stream?.title ?? title}
            </Text>
            {hasRemotePeer && stream?.coHostName && (
              <View style={styles.coHostRow}>
                <Avatar uri={stream.coHostAvatarUrl} name={stream.coHostName} size={20} />
                <Text style={styles.coHostLabel}>{stream.coHostName} ist live dabei</Text>
              </View>
            )}
          </Animated.View>

          {/* Join Requests (host only) */}
          {!isCoHost && joinRequests && joinRequests.length > 0 && (
            <Animated.View entering={FadeInUp.duration(300)} style={styles.joinRequestsContainer}>
              {joinRequests.map((req: { _id: Id<"livestreamJoinRequests">; userName: string; userAvatarUrl?: string }) => (
                <View key={req._id} style={styles.joinRequestCard}>
                  <Avatar uri={req.userAvatarUrl} name={req.userName} size={28} />
                  <Text style={styles.joinRequestText} numberOfLines={1}>
                    {req.userName} möchte beitreten
                  </Text>
                  <TouchableOpacity
                    style={styles.joinRequestAccept}
                    onPress={async () => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      try { await respondToJoinRequest({ requestId: req._id, accept: true }); } catch {}
                    }}
                  >
                    <SymbolView name="checkmark" size={14} tintColor={colors.white} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.joinRequestReject}
                    onPress={async () => {
                      try { await respondToJoinRequest({ requestId: req._id, accept: false }); } catch {}
                    }}
                  >
                    <SymbolView name="xmark" size={14} tintColor={colors.white} />
                  </TouchableOpacity>
                </View>
              ))}
            </Animated.View>
          )}

          {/* Comments */}
          <View style={{ flex: 1 }} />
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

          {/* Controls */}
          <View style={styles.controlRow}>
            <TouchableOpacity style={styles.controlBtn} onPress={toggleMute}>
              <SymbolView
                name={isMuted ? "mic.slash.fill" : "mic.fill"}
                size={20}
                tintColor={colors.white}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn} onPress={toggleVideo}>
              <SymbolView
                name={isVideoOff ? "video.slash.fill" : "video.fill"}
                size={20}
                tintColor={colors.white}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn} onPress={flipCamera}>
              <SymbolView name="camera.rotate" size={20} tintColor={colors.white} />
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
              Zuschauer ({stream?.viewerCount ?? 0})
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
  safe: { flex: 1, backgroundColor: colors.black },
  fullScreen: { flex: 1, backgroundColor: colors.black },
  overlay: { flex: 1 },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  cameraPlaceholder: {
    backgroundColor: colors.gray900,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  cameraPlaceholderText: { color: colors.gray400, fontSize: 14 },
  videoOffBg: {
    backgroundColor: colors.gray900,
    alignItems: "center",
    justifyContent: "center",
  },
  unsupported: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: 16,
  },
  unsupportedText: { color: colors.gray400, fontSize: 16, textAlign: "center" },
  backPill: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.full,
    backgroundColor: colors.gray800,
  },
  backPillText: { color: colors.white, fontSize: 15, fontWeight: "600" },

  /* PiP (picture-in-picture for split view) */
  pipContainer: {
    position: "absolute",
    top: 60,
    right: 16,
    width: 120,
    height: 160,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
    zIndex: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
  },
  pipVideo: {
    width: "100%",
    height: "100%",
  },

  /* 50/50 split */
  splitContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
  },
  splitHalf: {
    flex: 1,
    backgroundColor: colors.gray900,
    overflow: "hidden",
  },
  splitDivider: {
    height: 2,
    backgroundColor: colors.black,
    zIndex: 2,
  },
  splitLabel: {
    position: "absolute",
    bottom: 10,
    left: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  splitLabelText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
  },

  /* Top bar */
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
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
  endBtn: {
    backgroundColor: colors.danger,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderCurve: "continuous",
  },
  endBtnText: { color: colors.white, fontSize: 14, fontWeight: "700" },

  /* Stream info */
  streamInfo: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: 6,
  },
  streamTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  coHostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  coHostLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "500",
  },

  /* Join Requests */
  joinRequestsContainer: {
    paddingHorizontal: spacing.lg,
    gap: 8,
    marginBottom: spacing.sm,
  },
  joinRequestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radius.full,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 6,
    borderCurve: "continuous",
  },
  joinRequestText: {
    flex: 1,
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
  joinRequestAccept: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#34C759",
    alignItems: "center",
    justifyContent: "center",
  },
  joinRequestReject: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Setup area */
  setupArea: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: 14,
  },
  setupTitle: {
    color: colors.white,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  setupSubtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
  },
  titleInput: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.md,
    borderCurve: "continuous",
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.white,
    letterSpacing: -0.2,
  },
  goLiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.danger,
    paddingVertical: 16,
    borderRadius: radius.full,
    borderCurve: "continuous",
  },
  goLiveBtnDisabled: { opacity: 0.4 },
  goLiveBtnText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.white,
  },

  /* Comments */
  commentsList: {
    maxHeight: 120,
    marginHorizontal: spacing.lg,
    flexGrow: 0,
  },
  commentsContent: {
    paddingBottom: spacing.sm,
    gap: 6,
  },
  commentBubble: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderCurve: "continuous",
    gap: 6,
    flexWrap: "wrap",
  },
  commentAuthor: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  commentText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    flex: 1,
  },

  /* Comment input */
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
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

  /* Controls */
  controlRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingBottom: spacing.md,
  },
  controlBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
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
