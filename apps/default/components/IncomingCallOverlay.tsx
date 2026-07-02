import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { SymbolView } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { useSound } from "@/lib/sounds";
import { startRingtone, stopRingtone } from "@/lib/callRingtone";

interface IncomingCallOverlayProps {
  callerName: string;
  callerAvatarUrl?: string;
  callType: "audio" | "video";
  groupName?: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallOverlay({
  callerName,
  callerAvatarUrl,
  callType,
  groupName,
  onAccept,
  onDecline,
}: IncomingCallOverlayProps) {
  const ring1 = useSharedValue(1);
  const ring2 = useSharedValue(1);
  const ring3 = useSharedValue(1);
  const ringOpacity1 = useSharedValue(0.4);
  const ringOpacity2 = useSharedValue(0.3);
  const ringOpacity3 = useSharedValue(0.2);
  const hapticInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const { playSound, stopSound } = useSound();

  useEffect(() => {
    // Start ringtone (native — plays even in silent mode)
    startRingtone();

    // Pulsing ring animations
    ring1.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 1200 }),
        withTiming(1, { duration: 0 })
      ),
      -1
    );
    ringOpacity1.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1200 }),
        withTiming(0.4, { duration: 0 })
      ),
      -1
    );

    ring2.value = withRepeat(
      withDelay(
        400,
        withSequence(
          withTiming(1.5, { duration: 1200 }),
          withTiming(1, { duration: 0 })
        )
      ),
      -1
    );
    ringOpacity2.value = withRepeat(
      withDelay(
        400,
        withSequence(
          withTiming(0, { duration: 1200 }),
          withTiming(0.3, { duration: 0 })
        )
      ),
      -1
    );

    ring3.value = withRepeat(
      withDelay(
        800,
        withSequence(
          withTiming(1.5, { duration: 1200 }),
          withTiming(1, { duration: 0 })
        )
      ),
      -1
    );
    ringOpacity3.value = withRepeat(
      withDelay(
        800,
        withSequence(
          withTiming(0, { duration: 1200 }),
          withTiming(0.2, { duration: 0 })
        )
      ),
      -1
    );

    // Haptic feedback for ringing
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      hapticInterval.current = setInterval(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, 2000);
    }

    return () => {
      if (hapticInterval.current) clearInterval(hapticInterval.current);
      stopRingtone();
    };
  }, [ring1, ring2, ring3, ringOpacity1, ringOpacity2, ringOpacity3, playSound, stopSound]);

  const ringStyle1 = useAnimatedStyle(() => ({
    transform: [{ scale: ring1.value }],
    opacity: ringOpacity1.value,
  }));
  const ringStyle2 = useAnimatedStyle(() => ({
    transform: [{ scale: ring2.value }],
    opacity: ringOpacity2.value,
  }));
  const ringStyle3 = useAnimatedStyle(() => ({
    transform: [{ scale: ring3.value }],
    opacity: ringOpacity3.value,
  }));

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <Animated.View
        style={styles.overlay}
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
      >
        {/* Top label */}
        <View style={styles.topSection}>
          <Text style={styles.callLabel}>
            {groupName
              ? `Gruppenanruf • ${groupName}`
              : callType === "video"
                ? "Z Videoanruf"
                : "Z Audioanruf"}
          </Text>
        </View>

        {/* Center: Avatar with rings */}
        <View style={styles.centerSection}>
          <View style={styles.avatarContainer}>
            <Animated.View style={[styles.ring, ringStyle3]} />
            <Animated.View style={[styles.ring, ringStyle2]} />
            <Animated.View style={[styles.ring, ringStyle1]} />
            <Avatar uri={callerAvatarUrl} name={callerName} size={110} />
          </View>
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.statusText}>klingelt…</Text>
        </View>

        {/* Bottom: Accept / Decline */}
        <View style={styles.bottomSection}>
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.declineBtn,
                pressed && { opacity: 0.8, transform: [{ scale: 0.92 }] },
              ]}
              onPress={() => {
                if (Platform.OS !== "web")
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                stopRingtone();
                onDecline();
              }}
            >
              <SymbolView name="phone.down.fill" size={28} tintColor="#FFF" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                styles.acceptBtn,
                pressed && { opacity: 0.8, transform: [{ scale: 0.92 }] },
              ]}
              onPress={() => {
                if (Platform.OS !== "web")
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                stopRingtone();
                playSound("success");
                onAccept();
              }}
            >
              <SymbolView
                name={callType === "video" ? "video.fill" : "phone.fill"}
                size={28}
                tintColor="#FFF"
              />
            </Pressable>
          </View>
          <View style={styles.labelRow}>
            <Text style={styles.actionLabel}>Ablehnen</Text>
            <Text style={styles.actionLabel}>Annehmen</Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const AVATAR_SIZE = 110;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1A1A1A",
    zIndex: 9999,
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 80,
    paddingBottom: 60,
  },
  topSection: {
    alignItems: "center",
  },
  callLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.5,
  },
  centerSection: {
    alignItems: "center",
    gap: 16,
  },
  avatarContainer: {
    width: AVATAR_SIZE * 1.6,
    height: AVATAR_SIZE * 1.6,
    justifyContent: "center",
    alignItems: "center",
  },
  ring: {
    position: "absolute",
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  callerName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  statusText: {
    fontSize: 16,
    color: "rgba(255,255,255,0.5)",
  },
  bottomSection: {
    alignItems: "center",
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 70,
  },
  actionBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: "center",
    alignItems: "center",
  },
  declineBtn: {
    backgroundColor: "#EF4444",
  },
  acceptBtn: {
    backgroundColor: "#22C55E",
  },
  labelRow: {
    flexDirection: "row",
    gap: 42,
  },
  actionLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    width: 68,
  },
});
