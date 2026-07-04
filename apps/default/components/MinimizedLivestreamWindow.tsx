import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  FadeOut,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "@/components/Icon";
import { LiveStreamStage } from "@/components/LiveStreamStage";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLivestreamPip } from "@/lib/livestream-pip-context";

interface MinimizedLivestreamWindowProps {
  livestreamId: Id<"livestreams">;
}

const SPRING_CONFIG = { damping: 20, stiffness: 200 };
const SNAP_EDGE_PADDING = 12;

// Small portrait PiP window
const PIP_WIDTH = 150;
const PIP_HEIGHT = 200;
// Tap region (top-right corner) treated as the close button
const CLOSE_HIT_SIZE = 44;

/**
 * Draggable Picture-in-Picture window for a minimized livestream.
 * Mirrors the MinimizedCallBanner drag/snap behavior. Hidden while the
 * watch-stream screen for the same livestream is in the foreground, so
 * only one LiveKit connection is ever active at a time.
 */
export function MinimizedLivestreamWindow({
  livestreamId,
}: MinimizedLivestreamWindowProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ id?: string }>();
  const { closeLivestreamPip } = useLivestreamPip();
  const leaveStream = useMutation(api.livestreams.leaveStream);

  // Draggable position (start top-right, like the call banner)
  const translateX = useSharedValue(screenWidth - PIP_WIDTH - SNAP_EDGE_PADDING);
  const translateY = useSharedValue(insets.top + 8);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const scale = useSharedValue(1);

  function handleExpand() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // Keep minimizedLivestreamId set — the window auto-hides because the
    // route now matches, and reappears if the user navigates away again.
    router.navigate({
      pathname: "/(main)/watch-stream" as "/",
      params: { id: livestreamId },
    });
  }

  function handleClose() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    // Actually stop watching: remove the viewer record, then close the PiP.
    leaveStream({ livestreamId }).catch(() => {});
    closeLivestreamPip();
  }

  function handleTapAt(x: number, y: number) {
    if (x >= PIP_WIDTH - CLOSE_HIT_SIZE && y <= CLOSE_HIT_SIZE) {
      handleClose();
    } else {
      handleExpand();
    }
  }

  const panGesture = Gesture.Pan()
    .onStart(() => {
      "worklet";
      offsetX.value = translateX.value;
      offsetY.value = translateY.value;
      scale.value = withSpring(1.05, SPRING_CONFIG);
    })
    .onUpdate((event) => {
      "worklet";
      translateX.value = offsetX.value + event.translationX;
      translateY.value = offsetY.value + event.translationY;
    })
    .onEnd(() => {
      "worklet";
      // Snap to nearest horizontal edge
      const center = translateX.value + PIP_WIDTH / 2;
      const snapX =
        center < screenWidth / 2
          ? SNAP_EDGE_PADDING
          : screenWidth - PIP_WIDTH - SNAP_EDGE_PADDING;

      // Clamp Y
      const minY = insets.top + 4;
      const maxY = screenHeight - PIP_HEIGHT - insets.bottom - 80;
      const clampedY = Math.max(minY, Math.min(maxY, translateY.value));

      translateX.value = withSpring(snapX, SPRING_CONFIG);
      translateY.value = withSpring(clampedY, SPRING_CONFIG);
      scale.value = withSpring(1, SPRING_CONFIG);
    });

  const tapGesture = Gesture.Tap().onEnd((event) => {
    "worklet";
    runOnJS(handleTapAt)(event.x, event.y);
  });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Single-connection rule: while the watch-stream screen for this exact
  // livestream is in the foreground, do not mount a second LiveKit stage.
  const isOnWatchScreen =
    pathname.endsWith("/watch-stream") && params.id === livestreamId;
  if (isOnWatchScreen) {
    return null;
  }

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={[styles.container, animatedStyle]}
      >
        <View style={styles.card}>
          {/* Viewer-only LiveKit stage (fills the card) */}
          <LiveStreamStage livestreamId={livestreamId} isStreamer={false} />

          {/* LIVE badge (top-left) */}
          <View style={styles.liveBadge} pointerEvents="none">
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>

          {/* Close button visual (top-right; taps handled by the gesture) */}
          <View style={styles.closeBtn} pointerEvents="none">
            <SymbolView name="xmark" size={11} tintColor="#FFF" />
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    zIndex: 9999,
  },
  card: {
    flex: 1,
    backgroundColor: "#1c1c1e",
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
    boxShadow: "0px 4px 20px rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF3B30",
  },
  liveText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  closeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});
