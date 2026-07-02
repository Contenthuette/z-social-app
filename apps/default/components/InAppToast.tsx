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
import { router, usePathname, useGlobalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { SymbolView } from "@/components/Icon";
import { colors, spacing, radius } from "@/lib/theme";
import { useSound } from "@/lib/sounds";
import * as Haptics from "expo-haptics";

const AUTO_DISMISS_MS = 3000;
const HIDDEN_Y = -220;

type Banner = {
  title: string;
  body: string;
  avatarUrl?: string;
  icon: "bell" | "message";
  onPress: () => void;
};

/**
 * WhatsApp-style in-app banner. Slides a small toast in from the top when a
 * fresh notification OR a new incoming message arrives while the app is open.
 * Auto-dismisses after 3s, or tap the X to close. Tapping the banner opens the
 * relevant screen (notifications / DM chat / group chat).
 */
export function InAppToast() {
  const { isAuthenticated } = useConvexAuth();
  const latestNotif = useQuery(api.notifications.getLatest, isAuthenticated ? {} : "skip");
  const latestMsg = useQuery(api.messaging.getLatestIncomingMessage, isAuthenticated ? {} : "skip");
  const insets = useSafeAreaInsets();
  const { playSound } = useSound();

  const pathname = usePathname();
  const params = useGlobalSearchParams<{ id?: string }>();

  const [current, setCurrent] = useState<Banner | null>(null);
  const currentRef = useRef<Banner | null>(null);
  const notifBaseline = useRef<string | null>(null);
  const notifInit = useRef(false);
  const msgBaseline = useRef<string | null>(null);
  const msgInit = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useSharedValue(HIDDEN_Y);

  const hide = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    translateY.value = withTiming(HIDDEN_Y, { duration: 250 }, (finished) => {
      if (finished) runOnJS(setCurrent)(null);
    });
  }, [translateY]);

  const show = useCallback((banner: Banner) => {
    currentRef.current = banner;
    setCurrent(banner);
    playSound("receive");
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => hide(), AUTO_DISMISS_MS);
  }, [playSound, translateY, hide]);

  // ── New notification (likes, friend requests, kicks, …) ──────────────
  useEffect(() => {
    if (!latestNotif) return;
    if (!notifInit.current) {
      notifInit.current = true;
      notifBaseline.current = latestNotif._id;
      return;
    }
    if (latestNotif._id === notifBaseline.current) return;
    notifBaseline.current = latestNotif._id;
    if (latestNotif.isRead) return;
    if (Date.now() - latestNotif.createdAt > 15000) return;

    show({
      title: latestNotif.title,
      body: latestNotif.body,
      icon: "bell",
      onPress: () => { hide(); router.navigate("/(main)/notifications"); },
    });
  }, [latestNotif, show, hide]);

  // ── New incoming DM / group message ──────────────────────────────────
  useEffect(() => {
    if (!latestMsg) return;
    if (!msgInit.current) {
      msgInit.current = true;
      msgBaseline.current = latestMsg._id;
      return;
    }
    if (latestMsg._id === msgBaseline.current) return;
    msgBaseline.current = latestMsg._id;
    if (Date.now() - latestMsg.createdAt > 15000) return;

    // Don't interrupt if the user is already in that exact chat.
    const viewingDirect =
      latestMsg.routeType === "direct" &&
      pathname.endsWith("/chat") &&
      params.id === latestMsg.conversationId;
    const viewingGroup =
      latestMsg.routeType === "group" &&
      pathname.endsWith("/group-chat") &&
      params.id === latestMsg.groupId;
    if (viewingDirect || viewingGroup) return;

    show({
      title: latestMsg.title,
      body: latestMsg.body,
      avatarUrl: latestMsg.avatarUrl,
      icon: "message",
      onPress: () => {
        hide();
        if (latestMsg.routeType === "group" && latestMsg.groupId) {
          router.navigate({ pathname: "/(main)/group-chat", params: { id: latestMsg.groupId } });
        } else {
          router.navigate({ pathname: "/(main)/chat", params: { id: latestMsg.conversationId } });
        }
      },
    });
  }, [latestMsg, pathname, params.id, show, hide]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!current) return null;

  return (
    <Animated.View
      style={[styles.wrap, { paddingTop: Math.max(insets.top, 12) + 6 }, animStyle]}
      pointerEvents="box-none"
    >
      <Pressable style={styles.toast} onPress={() => current.onPress()}>
        {current.avatarUrl ? (
          <Image source={{ uri: current.avatarUrl }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.iconWrap}>
            <SymbolView
              name={current.icon === "message" ? "message.fill" : "bell.fill"}
              size={16}
              tintColor={colors.white}
            />
          </View>
        )}
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
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.gray100 },
  title: { fontSize: 14, fontWeight: "700", color: colors.black },
  body: { fontSize: 13, color: colors.gray600, marginTop: 1 },
  closeBtn: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
});
