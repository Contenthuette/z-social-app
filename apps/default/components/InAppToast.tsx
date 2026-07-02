import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { router } from "expo-router";
import { SymbolView } from "@/components/Icon";
import { colors, spacing, radius } from "@/lib/theme";
import { useSound } from "@/lib/sounds";
import * as Haptics from "expo-haptics";

const AUTO_DISMISS_MS = 3000;
const HIDDEN_Y = -220;

/**
 * WhatsApp-style in-app banner. Watches the newest notification and slides a
 * toast in from the top when a fresh one arrives. Auto-dismisses after 3s, or
 * tap the X to close. Tapping the banner opens the notifications screen.
 */
export function InAppToast() {
  const { isAuthenticated } = useConvexAuth();
  const latest = useQuery(api.notifications.getLatest, isAuthenticated ? {} : "skip");
  const insets = useSafeAreaInsets();
  const { playSound } = useSound();

  const [current, setCurrent] = useState<{ title: string; body: string } | null>(null);
  const baselineRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(HIDDEN_Y);

  const hide = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    translateY.value = withTiming(HIDDEN_Y, { duration: 250 }, (finished) => {
      if (finished) runOnJS(setCurrent)(null);
    });
  }, [translateY]);

  useEffect(() => {
    if (!latest) return;
    // First value we ever see is the baseline — it's an existing/old notification.
    if (!initializedRef.current) {
      initializedRef.current = true;
      baselineRef.current = latest._id;
      return;
    }
    if (latest._id === baselineRef.current) return;
    baselineRef.current = latest._id;
    if (latest.isRead) return;
    // Guard against showing stale notifications after a reconnect.
    if (Date.now() - latest.createdAt > 15000) return;

    setCurrent({ title: latest.title, body: latest.body });
    playSound("receive");
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => hide(), AUTO_DISMISS_MS);
  }, [latest, playSound, translateY, hide]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!current) return null;

  return (
    <Animated.View
      style={[styles.wrap, { paddingTop: Math.max(insets.top, 12) + 6 }, animStyle]}
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.toast}
        onPress={() => { hide(); router.navigate("/(main)/notifications"); }}
      >
        <View style={styles.iconWrap}>
          <SymbolView name="bell.fill" size={16} tintColor={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{current.body}</Text>
        </View>
        <Pressable hitSlop={10} onPress={hide} style={styles.closeBtn}>
          <SymbolView name="xmark" size={13} tintColor={colors.gray400} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: spacing.md,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    boxShadow: "0px 6px 24px rgba(0,0,0,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.gray200,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 14, fontWeight: "700", color: colors.black },
  body: { fontSize: 13, color: colors.gray600, marginTop: 1 },
  closeBtn: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
});
