import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, Platform } from "react-native";
import { Image } from "expo-image";

// "Inter" with graceful fallback: on native, an unregistered font family
// silently falls back to the system font; on web we chain sans-serif.
const INTER_FONT = Platform.select({ web: "Inter, sans-serif", default: "Inter" });

interface ZettiViewerProps {
  visible: boolean;
  mediaUrl?: string;
  caption?: string;
  textY?: number;
  onClose: () => void;
}

export function ZettiViewer({ visible, mediaUrl, caption, textY, onClose }: ZettiViewerProps) {
  const [containerHeight, setContainerHeight] = useState(0);
  const y = Math.min(0.88, Math.max(0.08, textY ?? 0.5));

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Tapping anywhere closes the Zetti (and burns the single view) */}
      <Pressable
        style={styles.container}
        onPress={onClose}
        onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
      >
        {mediaUrl ? (
          <Image
            source={{ uri: mediaUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : null}
        {caption ? (
          <View
            pointerEvents="none"
            style={[styles.captionWrap, { top: y * containerHeight }]}
          >
            <Text style={styles.caption}>{caption}</Text>
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  captionWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 24,
    transform: [{ translateY: -24 }],
  },
  caption: {
    width: "100%",
    color: "#FFFFFF",
    fontFamily: INTER_FONT,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});

export default ZettiViewer;
