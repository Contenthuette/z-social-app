import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Avatar } from "@/components/Avatar";
import { SymbolView } from "@/components/Icon";
import { useWebRTCMesh } from "@/lib/useWebRTCMesh";
import { forceSpeakerWithRetries } from "@/lib/audioRouting";

interface GroupCallParticipant {
  _id: string;
  userId: Id<"users">;
  userName: string;
  userAvatarUrl?: string;
  status: "ringing" | "connected" | "declined" | "left";
  isMuted: boolean;
  isVideoOff: boolean;
}

export default function GroupCallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const callId = (id ?? null) as Id<"calls"> | null;

  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const call = useQuery(
    api.calls.getCallDetails,
    isAuthenticated && callId ? { callId } : "skip",
  );
  const endCall = useMutation(api.calls.endCall);

  const hangingUpRef = useRef(false);

  const isVideoCall = call?.type === "video";
  const callActive =
    !!call && (call.status === "ringing" || call.status === "active");

  const participants = useMemo(
    () => (call?.participants ?? []) as Array<GroupCallParticipant>,
    [call?.participants],
  );

  const connectedPeers = useMemo(
    () =>
      participants.filter(
        (p) => p.status === "connected" && p.userId !== me?._id,
      ),
    [participants, me?._id],
  );

  const peerUserIds = useMemo(
    () => connectedPeers.map((p) => p.userId),
    [connectedPeers],
  );

  const ringingCount = useMemo(
    () => participants.filter((p) => p.status === "ringing").length,
    [participants],
  );

  const mesh = useWebRTCMesh({
    callId,
    myUserId: me?._id ?? null,
    isVideo: isVideoCall,
    enabled: !!callId && !!me && callActive,
    peerUserIds,
  });

  const {
    localStreamUrl,
    remoteStreams,
    isMuted,
    isVideoOff,
    isFrontCamera,
    toggleMute,
    toggleVideo,
    flipCamera,
    cleanup,
    isSupported,
    RTCView,
  } = mesh;

  // Group calls always play through the loudspeaker at full volume.
  useEffect(() => {
    if (!callActive) return;
    const cancel = forceSpeakerWithRetries();
    return cancel;
  }, [callActive]);

  // Leave when the call is gone or over
  useEffect(() => {
    if (call === undefined) return; // still loading
    const over =
      call === null ||
      call.status === "ended" ||
      call.status === "declined" ||
      call.status === "missed";
    if (!over) return;

    cleanup();
    const timeout = setTimeout(() => {
      if (router.canGoBack()) router.back();
    }, 400);
    return () => clearTimeout(timeout);
  }, [call, cleanup]);

  const handleHangUp = useCallback(() => {
    if (hangingUpRef.current) return;
    hangingUpRef.current = true;
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    cleanup();
    if (callId) endCall({ callId }).catch(() => {});
    setTimeout(() => {
      if (router.canGoBack()) router.back();
    }, 300);
  }, [callId, cleanup, endCall]);

  const handleToggleMute = useCallback(() => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleMute();
  }, [toggleMute]);

  const handleToggleVideo = useCallback(() => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleVideo();
  }, [toggleVideo]);

  const handleFlipCamera = useCallback(() => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flipCamera();
  }, [flipCamera]);

  // ─── Loading ───
  if (!callId || call === undefined || !me) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#FFF" size="large" />
        <Text style={styles.statusText}>Verbinde{"…"}</Text>
      </View>
    );
  }

  // ─── Ended / missing ───
  if (
    call === null ||
    call.status === "ended" ||
    call.status === "declined" ||
    call.status === "missed"
  ) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <SymbolView
            name="phone.down.fill"
            size={48}
            tintColor="rgba(255,255,255,0.4)"
          />
          <Text style={styles.endedText}>Anruf beendet</Text>
        </View>
      </View>
    );
  }

  // ─── Not supported (web / missing native module) ───
  if (!isSupported) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeContent} edges={["top", "bottom"]}>
          <View style={styles.centered}>
            <SymbolView
              name="exclamationmark.triangle.fill"
              size={48}
              tintColor="#EF4444"
            />
            <Text style={styles.errorText}>
              Anrufe sind nur in der mobilen App verf{"ü"}gbar
            </Text>
          </View>
          <View style={styles.bottomSingle}>
            <Pressable
              style={({ pressed }) => [styles.hangupBtn, pressed && styles.btnPressed]}
              onPress={handleHangUp}
            >
              <SymbolView name="phone.down.fill" size={28} tintColor="#FFF" />
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const connectedCount = connectedPeers.length + 1; // + me

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeContent} edges={["top", "bottom"]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.groupName} numberOfLines={1}>
            {call.groupName ?? "Gruppenanruf"}
          </Text>
          <Text style={styles.headerSub}>
            {connectedCount} verbunden
            {ringingCount > 0 ? ` · ${ringingCount} wartet…` : ""}
          </Text>
        </View>

        {/* Tile grid */}
        <ScrollView
          style={styles.gridScroll}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          {/* Local tile */}
          <View style={styles.tile}>
            {isVideoCall && RTCView && localStreamUrl && !isVideoOff ? (
              <RTCView
                streamURL={localStreamUrl}
                style={styles.tileVideo}
                objectFit="cover"
                mirror={isFrontCamera}
                zOrder={0}
              />
            ) : (
              <View style={styles.tileAvatarWrap}>
                <Avatar uri={me.avatarUrl} name={me.name} size={72} />
              </View>
            )}
            <View style={styles.tileFooter}>
              <Text style={styles.tileName} numberOfLines={1}>
                Du
              </Text>
              {isMuted && (
                <View style={styles.muteBadge}>
                  <SymbolView
                    name="mic.slash.fill"
                    size={12}
                    tintColor="#FFF"
                  />
                </View>
              )}
            </View>
          </View>

          {/* Peer tiles */}
          {connectedPeers.map((peer) => {
            const streamUrl = remoteStreams[String(peer.userId)];
            const showVideo =
              isVideoCall && RTCView && streamUrl && !peer.isVideoOff;
            return (
              <View key={peer._id} style={styles.tile}>
                {showVideo ? (
                  <RTCView
                    streamURL={streamUrl}
                    style={styles.tileVideo}
                    objectFit="cover"
                    zOrder={0}
                  />
                ) : (
                  <View style={styles.tileAvatarWrap}>
                    <Avatar
                      uri={peer.userAvatarUrl}
                      name={peer.userName}
                      size={72}
                    />
                  </View>
                )}
                <View style={styles.tileFooter}>
                  <Text style={styles.tileName} numberOfLines={1}>
                    {peer.userName}
                  </Text>
                  {peer.isMuted && (
                    <View style={styles.muteBadge}>
                      <SymbolView
                        name="mic.slash.fill"
                        size={12}
                        tintColor="#FFF"
                      />
                    </View>
                  )}
                </View>
              </View>
            );
          })}

          {connectedPeers.length === 0 && (
            <View style={styles.waitingWrap}>
              <ActivityIndicator color="rgba(255,255,255,0.4)" />
              <Text style={styles.waitingText}>
                Warte auf Teilnehmer{"…"}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom controls */}
        <View style={styles.bottomControls}>
          {/* Mute */}
          <View style={styles.controlGroup}>
            <Pressable
              style={({ pressed }) => [
                styles.controlBtn,
                isMuted && styles.controlBtnActive,
                pressed && styles.btnPressed,
              ]}
              onPress={handleToggleMute}
              hitSlop={8}
            >
              <SymbolView
                name={isMuted ? "mic.slash.fill" : "mic.fill"}
                size={24}
                tintColor={isMuted ? "#111" : "#FFF"}
              />
            </Pressable>
            <Text style={styles.controlLabel}>
              {isMuted ? "Stumm" : "Mikro"}
            </Text>
          </View>

          {/* Video toggle */}
          {isVideoCall && (
            <View style={styles.controlGroup}>
              <Pressable
                style={({ pressed }) => [
                  styles.controlBtn,
                  isVideoOff && styles.controlBtnActive,
                  pressed && styles.btnPressed,
                ]}
                onPress={handleToggleVideo}
                hitSlop={8}
              >
                <SymbolView
                  name={isVideoOff ? "video.slash.fill" : "video.fill"}
                  size={24}
                  tintColor={isVideoOff ? "#111" : "#FFF"}
                />
              </Pressable>
              <Text style={styles.controlLabel}>
                {isVideoOff ? "Kamera aus" : "Kamera"}
              </Text>
            </View>
          )}

          {/* Hang up */}
          <View style={styles.controlGroup}>
            <Pressable
              style={({ pressed }) => [
                styles.hangupBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={handleHangUp}
              hitSlop={8}
            >
              <SymbolView name="phone.down.fill" size={28} tintColor="#FFF" />
            </Pressable>
            <Text style={styles.controlLabel}>Auflegen</Text>
          </View>

          {/* Flip camera */}
          {isVideoCall && (
            <View style={styles.controlGroup}>
              <Pressable
                style={({ pressed }) => [
                  styles.controlBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={handleFlipCamera}
                hitSlop={8}
              >
                <SymbolView
                  name="arrow.triangle.2.circlepath"
                  size={24}
                  tintColor="#FFF"
                />
              </Pressable>
              <Text style={styles.controlLabel}>Wechseln</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
  },
  safeContent: {
    flex: 1,
    width: "100%",
  },
  statusText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 17,
    marginTop: 16,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  endedText: {
    fontSize: 20,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    marginTop: 12,
  },
  errorText: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    paddingHorizontal: 32,
  },
  bottomSingle: {
    alignItems: "center",
    paddingBottom: 32,
  },

  // Header
  header: {
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 24,
    gap: 4,
  },
  groupName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFF",
  },
  headerSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
  },

  // Grid
  gridScroll: {
    flex: 1,
    width: "100%",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  tile: {
    width: "48%",
    aspectRatio: 3 / 4,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#1d1d1d",
    borderCurve: "continuous",
  },
  tileVideo: {
    flex: 1,
    backgroundColor: "#000",
  },
  tileAvatarWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  tileFooter: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tileName: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#FFF",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: "hidden",
  },
  muteBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  waitingWrap: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  waitingText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
  },

  // Bottom controls
  bottomControls: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 20,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  controlGroup: { alignItems: "center", gap: 6, minWidth: 56 },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlBtnActive: { backgroundColor: "#FFF" },
  hangupBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    boxShadow: "0px 4px 20px rgba(239, 68, 68, 0.5)",
  },
  controlLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.92 }] },
});
