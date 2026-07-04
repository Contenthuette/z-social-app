import React, { useState, Component, type ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { SymbolView } from "@/components/Icon";
import { useSound } from "@/lib/sounds";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { ZettiEditor, type ZettiMedia } from "@/components/ZettiEditor";
import { ZettiCamera } from "@/components/ZettiCamera";

// Error boundary to catch native module crashes
interface ErrorBoundaryState {
  hasError: boolean;
}

class VoiceRecorderErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("VoiceRecorder crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.errorBar}>
          <Pressable
            onPress={() => {
              this.setState({ hasError: false });
              this.props.onReset();
            }}
            style={ebStyles.closeBtn}
          >
            <SymbolView name="xmark" size={14} tintColor="#9CA3AF" />
          </Pressable>
          <Text style={ebStyles.errorText}>
            Sprachaufnahme nicht verfügbar
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const ebStyles = StyleSheet.create({
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 24,
    height: 48,
    paddingHorizontal: 14,
    gap: 10,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
});

export interface MediaPickResult {
  uri: string;
  type: "image" | "video";
  mimeType: string;
}

export interface ReplyTarget {
  id: string;
  senderName: string;
  preview: string;
}

interface ChatInputBarProps {
  onSend: (text: string) => void;
  onSendVoice?: (uri: string, durationMs: number) => void;
  onSendMedia?: (media: MediaPickResult) => Promise<void> | void;
  onSendZetti?: (
    media: ZettiMedia,
    caption: string,
    textY: number,
  ) => Promise<void> | void;
  onPlusPress?: () => void;
  placeholder?: string;
  bottomInset?: number;
  replyingTo?: ReplyTarget | null;
  onCancelReply?: () => void;
}

export function ChatInputBar({
  onSend,
  onSendVoice,
  onSendMedia,
  onSendZetti,
  onPlusPress,
  placeholder = "Nachricht...",
  bottomInset = 0,
  replyingTo,
  onCancelReply,
}: ChatInputBarProps) {
  const [text, setText] = useState("");
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [isPickingMedia, setIsPickingMedia] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<MediaPickResult | null>(null);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [zettiMedia, setZettiMedia] = useState<ZettiMedia | null>(null);
  const [zettiCameraVisible, setZettiCameraVisible] = useState(false);
  const { playSound } = useSound();
  const { width: screenWidth } = useWindowDimensions();

  // Video player for preview modal
  const previewPlayer = useVideoPlayer(
    mediaPreview?.type === "video" ? mediaPreview.uri : null,
    (p) => {
      p.loop = true;
      p.muted = false;
      p.play();
    },
  );

  const dismissPreview = () => {
    setMediaPreview(null);
    try {
      previewPlayer?.pause();
    } catch {
      // ignore
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    playSound("send");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleMicPress = () => {
    setShowVoiceRecorder(true);
    playSound("tap");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const handleGalleryPress = async () => {
    if (isPickingMedia || !onSendMedia) return;
    playSound("tap");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsPickingMedia(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const isVideo = asset.mimeType?.startsWith("video") ?? false;
        setMediaPreview({
          uri: asset.uri,
          type: isVideo ? "video" : "image",
          mimeType: asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg"),
        });
      }
    } catch (err) {
      console.error("Media picker error:", err);
    } finally {
      setIsPickingMedia(false);
    }
  };

  const handleConfirmSend = async () => {
    if (!mediaPreview || !onSendMedia || isSendingMedia) return;
    setIsSendingMedia(true);
    try {
      await onSendMedia(mediaPreview);
      playSound("send");
    } catch (err) {
      console.error("Failed to send media:", err);
    } finally {
      setIsSendingMedia(false);
      dismissPreview();
    }
  };

  const handleZettiPress = () => {
    if (!onSendZetti) return;
    playSound("tap");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setZettiMedia(null);
    setZettiCameraVisible(true);
  };

  // Camera captured a photo/video → move to the caption editor
  const handleZettiCaptured = (media: ZettiMedia) => {
    setZettiCameraVisible(false);
    setZettiMedia(media);
  };

  // "Nochmal" in the editor → discard and reopen the camera
  const handleZettiRetake = () => {
    setZettiMedia(null);
    setZettiCameraVisible(true);
  };

  const handleZettiSend = async (caption: string, textY: number) => {
    if (!zettiMedia || !onSendZetti) return;
    await onSendZetti(zettiMedia, caption, textY);
    playSound("send");
    setZettiMedia(null);
  };

  const handleVoiceSend = (uri: string, durationMs: number) => {
    setShowVoiceRecorder(false);
    onSendVoice?.(uri, durationMs);
  };

  const handleVoiceCancel = () => {
    setShowVoiceRecorder(false);
  };

  const hasText = text.trim().length > 0;

  return (
    <View style={[styles.wrapper, bottomInset > 0 && { paddingBottom: bottomInset }]}>
      {replyingTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyAccent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replyTitle} numberOfLines={1}>
              Antwort an {replyingTo.senderName}
            </Text>
            <Text style={styles.replyPreview} numberOfLines={1}>
              {replyingTo.preview}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8} style={styles.replyClose}>
            <SymbolView name="xmark" size={13} tintColor="#8E8E93" />
          </Pressable>
        </View>
      )}
      {showVoiceRecorder ? (
        <VoiceRecorderErrorBoundary onReset={handleVoiceCancel}>
          <VoiceRecorder
            onSend={handleVoiceSend}
            onCancel={handleVoiceCancel}
          />
        </VoiceRecorderErrorBoundary>
      ) : (
        <View style={styles.bar}>
          {/* Gallery button */}
          {onSendMedia && (
            <Pressable
              onPress={handleGalleryPress}
              style={({ pressed }) => [
                styles.iconBtn,
                pressed && styles.btnPressed,
              ]}
              hitSlop={6}
              disabled={isPickingMedia}
            >
              {isPickingMedia ? (
                <ActivityIndicator size="small" color="#8E8E93" />
              ) : (
                <SymbolView name="photo.on.rectangle" size={19} tintColor="#8E8E93" />
              )}
            </Pressable>
          )}

          {/* Plus button */}
          {onPlusPress && (
            <Pressable
              onPress={onPlusPress}
              style={({ pressed }) => [
                styles.iconBtn,
                pressed && styles.btnPressed,
              ]}
              hitSlop={6}
            >
              <SymbolView name="plus" size={20} tintColor="#8E8E93" />
            </Pressable>
          )}

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={placeholder}
              placeholderTextColor="#C7C7CC"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
          </View>

          {hasText ? (
            <Pressable
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendBtn,
                pressed && styles.btnPressed,
              ]}
              hitSlop={6}
            >
              <SymbolView name="arrow.up" size={16} tintColor="#FFF" />
            </Pressable>
          ) : (
            onSendVoice && (
              <Pressable
                onPress={handleMicPress}
                style={({ pressed }) => [
                  styles.iconBtn,
                  pressed && styles.btnPressed,
                ]}
                hitSlop={6}
              >
                <SymbolView name="mic.fill" size={18} tintColor="#8E8E93" />
              </Pressable>
            )
          )}

          {/* Zetti button (view-once selfie), right of the mic button */}
          {onSendZetti && (
            <Pressable
              onPress={handleZettiPress}
              style={({ pressed }) => [
                styles.iconBtn,
                pressed && styles.btnPressed,
              ]}
              hitSlop={6}
            >
              <SymbolView name="camera.fill" size={18} tintColor="#8E8E93" />
            </Pressable>
          )}
        </View>
      )}

      {/* Zetti camera (photo + video capture) */}
      {onSendZetti && (
        <ZettiCamera
          visible={zettiCameraVisible}
          onClose={() => setZettiCameraVisible(false)}
          onCapture={handleZettiCaptured}
        />
      )}

      {/* Zetti editor (media + draggable caption) */}
      {onSendZetti && (
        <ZettiEditor
          visible={!!zettiMedia}
          media={zettiMedia}
          onCancel={() => setZettiMedia(null)}
          onRetake={handleZettiRetake}
          onSend={handleZettiSend}
        />
      )}

      {/* Media preview modal */}
      <Modal
        visible={!!mediaPreview}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismissPreview}
      >
        <View style={styles.previewBg}>
          <View style={styles.previewContent}>
            {mediaPreview?.type === "video" && previewPlayer ? (
              <VideoView
                player={previewPlayer}
                style={{
                  width: screenWidth * 0.85,
                  height: screenWidth * 0.85 * (16 / 9),
                  borderRadius: 16,
                  overflow: "hidden" as const,
                }}
                nativeControls
                contentFit="contain"
              />
            ) : mediaPreview ? (
              <Image
                source={{ uri: mediaPreview.uri }}
                style={{
                  width: screenWidth * 0.85,
                  height: screenWidth * 0.85,
                  borderRadius: 16,
                }}
                contentFit="contain"
              />
            ) : null}
          </View>
          <View style={styles.previewActions}>
            <Pressable
              style={styles.previewCancel}
              onPress={dismissPreview}
              disabled={isSendingMedia}
            >
              <SymbolView name="xmark" size={20} tintColor="#FFF" />
            </Pressable>
            <Pressable
              style={[styles.previewSend, isSendingMedia && { opacity: 0.5 }]}
              disabled={isSendingMedia}
              onPress={handleConfirmSend}
            >
              {isSendingMedia ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <SymbolView name="arrow.up" size={20} tintColor="#FFF" />
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    gap: 10,
  },
  replyAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: "#000000",
  },
  replyTitle: { fontSize: 13, fontWeight: "700", color: "#000000" },
  replyPreview: { fontSize: 13, color: "#8E8E93", marginTop: 1 },
  replyClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 4,
    minHeight: 48,
    gap: 4,
    boxShadow: "0px 1px 8px rgba(0,0,0,0.08)",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  inputContainer: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    borderRadius: 18,
    minHeight: 36,
    justifyContent: "center",
  },
  input: {
    fontSize: 15,
    color: "#000000",
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  previewBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewContent: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 16,
  },
  previewActions: {
    flexDirection: "row",
    gap: 32,
    marginTop: 32,
  },
  previewCancel: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewSend: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
});
