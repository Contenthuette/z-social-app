import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  Platform,
  PanResponder,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { SymbolView } from "@/components/Icon";

// "Inter" with graceful fallback: on native, an unregistered font family
// silently falls back to the system font; on web we chain sans-serif.
const INTER_FONT = Platform.select({ web: "Inter, sans-serif", default: "Inter" });

export interface ZettiMedia {
  uri: string;
  mimeType: string;
  isVideo?: boolean;
  durationMs?: number;
}

interface ZettiEditorProps {
  visible: boolean;
  media: ZettiMedia | null;
  onCancel: () => void;
  onRetake?: () => void;
  onSend: (caption: string, textY: number) => Promise<void> | void;
}

const MIN_Y = 0.08;
const MAX_Y = 0.88;

export function ZettiEditor({ visible, media, onCancel, onRetake, onSend }: ZettiEditorProps) {
  const [caption, setCaption] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [textY, setTextY] = useState(0.5);
  const [containerHeight, setContainerHeight] = useState(0);

  const textYRef = useRef(0.5);
  const dragStartYRef = useRef(0.5);
  const containerHeightRef = useRef(0);

  const isVideo = !!media?.isVideo;

  // Loop the video muted in the compose screen (audio plays for the recipient).
  const player = useVideoPlayer(isVideo && media ? media.uri : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // Fresh state every time the editor opens
  useEffect(() => {
    if (visible) {
      setCaption("");
      setIsSending(false);
      setIsFocused(false);
      setTextY(0.5);
      textYRef.current = 0.5;
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      // Let taps through to the TextInput; only claim clear vertical drags
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        dragStartYRef.current = textYRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const height = containerHeightRef.current || 1;
        const next = Math.min(
          MAX_Y,
          Math.max(MIN_Y, dragStartYRef.current + gesture.dy / height),
        );
        textYRef.current = next;
        setTextY(next);
      },
    }),
  ).current;

  const handleSend = async () => {
    if (isSending) return;
    Keyboard.dismiss();
    setIsSending(true);
    try {
      await onSend(caption.trim(), textYRef.current);
    } catch (err) {
      console.error("Failed to send Zetti", err);
    } finally {
      setIsSending(false);
    }
  };

  const showTextBg = isFocused || caption.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View
        style={styles.container}
        onLayout={(e) => {
          containerHeightRef.current = e.nativeEvent.layout.height;
          setContainerHeight(e.nativeEvent.layout.height);
        }}
      >
        {/* Background media. Tapping it (outside the text) closes the keyboard.
            It sits BELOW the caption so dragging the caption still works. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()}>
          {media && isVideo ? (
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
          ) : media ? (
            <Image
              source={{ uri: media.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : null}
        </Pressable>

        {/* Draggable caption input */}
        <View
          {...panResponder.panHandlers}
          style={[
            styles.captionWrap,
            { top: textY * (containerHeight || 0) },
          ]}
        >
          <View style={[styles.captionBg, showTextBg && styles.captionBgVisible]}>
            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Schreib was…"
              placeholderTextColor="rgba(255,255,255,0.7)"
              multiline
              maxLength={200}
              textAlign="center"
            />
          </View>
        </View>

        {/* Cancel */}
        <Pressable
          onPress={onCancel}
          disabled={isSending}
          hitSlop={8}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
        >
          <SymbolView name="xmark" size={20} tintColor="#FFFFFF" />
        </Pressable>

        {/* Retake ("Nochmal") */}
        {onRetake && (
          <Pressable
            onPress={() => { Keyboard.dismiss(); onRetake(); }}
            disabled={isSending}
            style={({ pressed }) => [styles.retakeBtn, pressed && styles.pressed]}
          >
            <SymbolView name="arrow.counterclockwise" size={16} tintColor="#FFFFFF" />
            <Text style={styles.retakeText}>Nochmal</Text>
          </Pressable>
        )}

        {/* Send */}
        <Pressable
          onPress={handleSend}
          disabled={isSending}
          style={({ pressed }) => [
            styles.sendBtn,
            pressed && styles.pressed,
            isSending && { opacity: 0.6 },
          ]}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <>
              <Text style={styles.sendText}>Senden</Text>
              <SymbolView name="arrow.up" size={16} tintColor="#000000" />
            </>
          )}
        </Pressable>
      </View>
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
  captionBg: {
    maxWidth: "100%",
    borderRadius: 14,
    paddingHorizontal: 4,
  },
  captionBgVisible: {
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  captionInput: {
    minWidth: 60,
    color: "#FFFFFF",
    fontFamily: INTER_FONT,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  closeBtn: {
    position: "absolute",
    top: 56,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  retakeBtn: {
    position: "absolute",
    bottom: 48,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 24,
    paddingHorizontal: 18,
    height: 48,
    justifyContent: "center",
  },
  retakeText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sendBtn: {
    position: "absolute",
    bottom: 48,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 20,
    height: 48,
    minWidth: 110,
    justifyContent: "center",
  },
  sendText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000000",
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
});

export default ZettiEditor;
