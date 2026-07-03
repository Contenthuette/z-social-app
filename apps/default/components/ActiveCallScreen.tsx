import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ComponentType } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Avatar } from "@/components/Avatar";
import { SymbolView } from "@/components/Icon";
import { router } from "expo-router";
import { useCallContext } from "@/lib/call-context";
import { useSound } from "@/lib/sounds";
import { startRingtone, stopRingtone } from "@/lib/callRingtone";
import { setSpeakerOn, forceSpeakerWithRetries } from "@/lib/audioRouting";
import { BlurView } from "expo-blur";

interface CallParticipant {
  _id: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string;
  isVideoOff?: boolean;
  isMuted?: boolean;
}

interface RTCViewProps {
  streamURL: string;
  style?: unknown;
  objectFit?: "contain" | "cover";
  mirror?: boolean;
  zOrder?: number;
}

interface ActiveCallScreenProps {
  callId: Id<"calls">;
}

export function ActiveCallScreen({ callId }: ActiveCallScreenProps) {
  const { isAuthenticated } = useConvexAuth();
  const call = useQuery(
    api.calls.getCallDetails,
    isAuthenticated ? { callId } : "skip",
  );
  const endCallMutation = useMutation(api.calls.endCall);
  const toggleVideoMutation = useMutation(api.calls.toggleVideo);
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const { minimizeCall, startWebRTC, stopWebRTC, webrtc } = useCallContext();
  const { playSound, stopSound } = useSound();

  const hangingUpRef = useRef(false);
  const [callDuration, setCallDuration] = useState(0);
  // Calls default to loudspeaker (loud). 1:1 audio calls can be toggled quiet.
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  const isVideoCall = call?.type === "video";
  const isInitiator = !!(call && me && call.callerId === me._id);

  // Start WebRTC via the provider (persists across minimize/expand)
  const webrtcEnabled = !!(
    call &&
    me &&
    (call.status === "ringing" || call.status === "active")
  );

  useEffect(() => {
    if (webrtcEnabled && call) {
      startWebRTC(callId, isInitiator, isVideoCall ?? false);
    }
  }, [webrtcEnabled, callId, isInitiator, isVideoCall, startWebRTC, call]);

  // Use the provider's WebRTC state
  const localStreamUrl = webrtc?.localStreamUrl ?? null;
  const remoteStreamUrl = webrtc?.remoteStreamUrl ?? null;
  const connectionState = webrtc?.connectionState ?? "new";
  const isMuted = webrtc?.isMuted ?? false;
  const isVideoOff = webrtc?.isVideoOff ?? false;
  const isFrontCamera = webrtc?.isFrontCamera ?? true;
  const isSupported = webrtc?.isSupported ?? false;
  const RTCViewComponent = webrtc?.RTCView as ComponentType<RTCViewProps> | null;

  // Derive phase from call status + WebRTC state
  const phase = useMemo(() => {
    if (!call) return "loading" as const;
    if (
      call.status === "ended" ||
      call.status === "declined" ||
      call.status === "missed"
    )
      return "ended" as const;
    if (!isSupported && call.status === "active") return "error" as const;
    if (connectionState === "failed") return "error" as const;
    if (connectionState === "connected") return "live" as const;
    if (call.status === "active") return "connecting" as const;
    return "ringing" as const;
  }, [call, connectionState, isSupported]);

  useEffect(() => {
    if (!isInitiator || phase !== "ringing") {
      stopRingtone();
      return;
    }

    startRingtone();
    return () => stopRingtone();
  }, [isInitiator, phase, playSound, stopSound]);

  // Call duration timer
  useEffect(() => {
    if (phase !== "live") return;
    const interval = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Apply audio routing: speaker (loud) is the default; WebRTC resets the
  // audio session on connect, so force it with retries while speaker is on.
  useEffect(() => {
    if (phase !== "live" && phase !== "connecting") return;
    if (isSpeakerOn) {
      const cancel = forceSpeakerWithRetries();
      return cancel;
    }
    setSpeakerOn(false);
  }, [phase, isSpeakerOn]);

  // Auto-dismiss when call ends
  useEffect(() => {
    if (phase === "ended") {
      stopRingtone();
      stopWebRTC();
      setSpeakerOn(false);
      const timeout = setTimeout(() => {
        if (router.canGoBack()) router.back();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [phase, stopWebRTC, stopSound]);

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // ─── Handlers ───

  const handleHangUp = useCallback(() => {
    if (hangingUpRef.current) return;
    hangingUpRef.current = true;
    stopRingtone();
    playSound("hangup");
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    stopWebRTC();
    setSpeakerOn(false);
    endCallMutation({ callId }).catch(() => {});
    setTimeout(() => {
      if (router.canGoBack()) router.back();
    }, 400);
  }, [callId, endCallMutation, playSound, stopWebRTC, stopSound]);

  const handleToggleMute = useCallback(() => {
    playSound("tap");
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    webrtc?.toggleMute();
  }, [playSound, webrtc]);

  const handleToggleVideo = useCallback(() => {
    playSound("tap");
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    webrtc?.toggleVideo();
    toggleVideoMutation({ callId }).catch(() => {});
  }, [playSound, webrtc, toggleVideoMutation, callId]);

  const handleFlipCamera = useCallback(() => {
    playSound("tap");
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    webrtc?.flipCamera();
  }, [playSound, webrtc]);

  const handleToggleSpeaker = useCallback(() => {
    playSound("tap");
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    setSpeakerOn(next);
  }, [playSound, isSpeakerOn]);

  const handleMinimize = useCallback(() => {
    playSound("tap");
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    minimizeCall(callId);
    if (router.canGoBack()) router.back();
  }, [callId, minimizeCall, playSound]);

  // ─── Loading ───
  if (!call || phase === "loading") {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#FFF" size="large" />
        <Text style={styles.statusText}>Verbinde\u2026</Text>
      </View>
    );
  }

  const otherParticipants =
    call.participants.filter((p: CallParticipant) => p.userId !== me?._id) ?? [];
  const mainOther = otherParticipants[0];
  const displayName = mainOther?.userName ?? call.groupName ?? "Anruf";

  // Check if the remote participant has their video paused
  const remoteVideoOff = mainOther?.isVideoOff ?? false;

  // ─── Ringing / Connecting ───
  if (phase === "ringing" || phase === "connecting") {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.ringingContent} edges={["top", "bottom"]}>
          <View style={styles.ringingTop}>
            <Text style={styles.ringingLabel}>
              {isVideoCall ? "Videoanruf" : "Anruf"}
            </Text>
            <Text style={styles.ringingName}>{displayName}</Text>
            <Text style={styles.ringingStatus}>
              {phase === "connecting" ? "Verbinde\u2026" : "Klingelt\u2026"}
            </Text>
          </View>

          <View style={styles.ringingCenter}>
            {call.groupId && otherParticipants.length > 1 ? (
              <View style={styles.avatarRow}>
                {otherParticipants.slice(0, 4).map((p: CallParticipant) => (
                  <Avatar
                    key={p._id}
                    uri={p.userAvatarUrl}
                    name={p.userName}
                    size={72}
                  />
                ))}
              </View>
            ) : (
              <Avatar
                uri={mainOther?.userAvatarUrl}
                name={mainOther?.userName ?? displayName}
                size={140}
              />
            )}
            {phase === "connecting" && (
              <ActivityIndicator
                color="rgba(255,255,255,0.4)"
                style={{ marginTop: 24 }}
              />
            )}
          </View>

          <View style={styles.ringingBottom}>
            <Pressable
              style={({ pressed }) => [
                styles.endCallBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={handleHangUp}
            >
              <SymbolView name="phone.down.fill" size={28} tintColor="#FFF" />
            </Pressable>
            <Text style={styles.controlLabel}>Auflegen</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Error ───
  if (phase === "error") {
    const errorMessage = !isSupported
      ? "Anrufe sind nur in der mobilen App verf\u00FCgbar"
      : "Verbindungsfehler";
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.ringingContent} edges={["top", "bottom"]}>
          <View style={styles.ringingCenter}>
            <SymbolView
              name="exclamationmark.triangle.fill"
              size={48}
              tintColor="#EF4444"
            />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
          <View style={styles.ringingBottom}>
            <Pressable
              style={({ pressed }) => [
                styles.backBtn,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                stopRingtone();
                stopWebRTC();
                endCallMutation({ callId }).catch(() => {});
                if (router.canGoBack()) router.back();
              }}
            >
              <Text style={styles.backBtnText}>Zur\u00FCck</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Ended ───
  if (phase === "ended") {
    return (
      <View style={styles.container}>
        <View style={styles.ringingCenter}>
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

  // ─── Live Call ───
  return (
    <View style={styles.container}>
      {/* Remote video (full screen) or audio avatar */}
      {isVideoCall && RTCViewComponent && remoteStreamUrl ? (
        <View style={styles.remoteVideoWrapper}>
          <RTCViewComponent
            streamURL={remoteStreamUrl}
            style={styles.remoteVideo}
            objectFit="cover"
            zOrder={0}
          />
          {/* Video paused overlay */}
          {remoteVideoOff && (
            <View style={styles.videoPausedOverlay}>
              <BlurView
                intensity={60}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.videoPausedContent}>
                <Avatar
                  uri={mainOther?.userAvatarUrl}
                  name={mainOther?.userName ?? displayName}
                  size={80}
                />
                <View style={styles.videoPausedBadge}>
                  <SymbolView
                    name="video.slash.fill"
                    size={16}
                    tintColor="rgba(255,255,255,0.7)"
                  />
                  <Text style={styles.videoPausedText}>
                    {mainOther?.userName ?? "Z Member"} hat Video angehalten
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>
      ) : isVideoCall && remoteVideoOff ? (
        <View style={styles.videoPausedFullScreen}>
          <View style={styles.videoPausedContent}>
            <Avatar
              uri={mainOther?.userAvatarUrl}
              name={mainOther?.userName ?? displayName}
              size={80}
            />
            <View style={styles.videoPausedBadge}>
              <SymbolView
                name="video.slash.fill"
                size={16}
                tintColor="rgba(255,255,255,0.7)"
              />
              <Text style={styles.videoPausedText}>
                {mainOther?.userName ?? "Z Member"} hat Video angehalten
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.audioCallCenter}>
          <Avatar
            uri={mainOther?.userAvatarUrl}
            name={mainOther?.userName ?? displayName}
            size={120}
          />
          <Text style={styles.audioCallName}>{displayName}</Text>
          <Text style={styles.audioCallTimer}>{formatTime(callDuration)}</Text>
        </View>
      )}

      {/* Local video PiP */}
      {isVideoCall && RTCViewComponent && localStreamUrl && (
        <View style={styles.localVideoContainer}>
          {isVideoOff ? (
            <View style={styles.localVideoOffContainer}>
              <SymbolView
                name="video.slash.fill"
                size={20}
                tintColor="rgba(255,255,255,0.5)"
              />
            </View>
          ) : (
            <RTCViewComponent
              streamURL={localStreamUrl}
              style={styles.localVideo}
              objectFit="cover"
              mirror={isFrontCamera}
              zOrder={1}
            />
          )}
        </View>
      )}

      {/* Native control overlay */}
      <SafeAreaView
        style={styles.nativeOverlay}
        edges={["top", "bottom"]}
        pointerEvents="box-none"
      >
        {/* Top row */}
        <View style={styles.topRow} pointerEvents="box-none">
          <Pressable
            onPress={handleMinimize}
            style={({ pressed }) => [
              styles.minimizeBtn,
              pressed && { opacity: 0.6 },
            ]}
            hitSlop={12}
          >
            <SymbolView
              name="chevron.down"
              size={18}
              tintColor="rgba(255,255,255,0.9)"
            />
          </Pressable>

          {/* Timer badge */}
          <View style={styles.timerBadge}>
            <Text style={styles.timerText}>{formatTime(callDuration)}</Text>
          </View>
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomControls} pointerEvents="box-none">
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

          {/* Speaker toggle */}
          <View style={styles.controlGroup}>
            <Pressable
              style={({ pressed }) => [
                styles.controlBtn,
                isSpeakerOn && styles.controlBtnActive,
                pressed && styles.btnPressed,
              ]}
              onPress={handleToggleSpeaker}
              hitSlop={8}
            >
              <SymbolView
                name={isSpeakerOn ? "speaker.wave.2.fill" : "speaker.slash.fill"}
                size={24}
                tintColor={isSpeakerOn ? "#111" : "#FFF"}
              />
            </Pressable>
            <Text style={styles.controlLabel}>
              {isSpeakerOn ? "Laut" : "Leise"}
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
                  name="camera.rotate.fill"
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
  statusText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 17,
    marginTop: 16,
  },

  // Ringing
  ringingContent: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  ringingTop: { alignItems: "center", paddingTop: 40 },
  ringingLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ringingName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFF",
    marginTop: 8,
  },
  ringingStatus: {
    fontSize: 15,
    color: "rgba(255,255,255,0.5)",
    marginTop: 6,
  },
  ringingCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  avatarRow: { flexDirection: "row", gap: 12 },
  ringingBottom: { alignItems: "center", paddingBottom: 40, gap: 8 },
  endCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
  },

  // Error
  errorText: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    paddingHorizontal: 32,
  },
  backBtn: {
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
  },
  backBtnText: { fontSize: 16, fontWeight: "600", color: "#FFF" },

  // Ended
  endedText: {
    fontSize: 20,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    marginTop: 12,
  },

  // ─── Live call ───
  remoteVideoWrapper: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  remoteVideo: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },
  localVideoContainer: {
    position: "absolute",
    top: 60,
    right: 16,
    width: 110,
    height: 150,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    zIndex: 10,
  },
  localVideo: { flex: 1, backgroundColor: "#222" },
  localVideoOffContainer: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },

  // Video paused overlay
  videoPausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  videoPausedFullScreen: {
    flex: 1,
    width: "100%",
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPausedContent: {
    alignItems: "center",
    gap: 16,
    zIndex: 1,
  },
  videoPausedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  videoPausedText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
  },

  // Audio call live view
  audioCallCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  audioCallName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFF",
    marginTop: 8,
  },
  audioCallTimer: {
    fontSize: 17,
    color: "rgba(255,255,255,0.5)",
    fontVariant: ["tabular-nums"],
  },

  // Native overlay
  nativeOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    zIndex: 50,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  minimizeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  timerBadge: {
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  timerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFF",
    fontVariant: ["tabular-nums"],
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
