import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraType,
} from "expo-camera";
import { X, RefreshCcw } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import type { ZettiMedia } from "@/components/ZettiEditor";

interface ZettiCameraProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (media: ZettiMedia) => void;
}

const MAX_VIDEO_SECONDS = 30;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ZettiCamera({ visible, onClose, onCapture }: ZettiCameraProps) {
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("front");
  const [mode, setMode] = useState<"picture" | "video">("picture");
  const [isBusy, setIsBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecondsRef = useRef(0);

  // Ask for permissions when the camera opens
  useEffect(() => {
    if (!visible) return;
    if (!camPerm?.granted) requestCamPerm();
    if (!micPerm?.granted) requestMicPerm();
  }, [visible, camPerm?.granted, micPerm?.granted, requestCamPerm, requestMicPerm]);

  // Reset transient state each time it opens
  useEffect(() => {
    if (visible) {
      setMode("picture");
      setIsBusy(false);
      setIsRecording(false);
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [visible]);

  const flip = () => {
    if (isRecording) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing((f) => (f === "front" ? "back" : "front"));
  };

  const takePhoto = async () => {
    if (!cameraRef.current || isBusy) return;
    setIsBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onCapture({ uri: photo.uri, mimeType: "image/jpeg", isVideo: false });
      }
    } catch (err) {
      console.error("Zetti photo error:", err);
    } finally {
      setIsBusy(false);
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    setRecordSeconds(0);
    recordSecondsRef.current = 0;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    timerRef.current = setInterval(() => {
      recordSecondsRef.current += 1;
      setRecordSeconds(recordSecondsRef.current);
    }, 1000);
    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_VIDEO_SECONDS,
      });
      if (video?.uri) {
        onCapture({
          uri: video.uri,
          mimeType: "video/mp4",
          isVideo: true,
          durationMs: recordSecondsRef.current * 1000,
        });
      }
    } catch (err) {
      console.error("Zetti video error:", err);
    } finally {
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const stopRecording = () => {
    cameraRef.current?.stopRecording();
  };

  const onShutter = () => {
    if (mode === "picture") takePhoto();
    else if (isRecording) stopRecording();
    else startRecording();
  };

  const needsPermission = !camPerm?.granted;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.container}>
        {needsPermission ? (
          <SafeAreaView style={styles.permWrap}>
            <Text style={styles.permText}>
              Z braucht Zugriff auf Kamera und Mikrofon für Zettis.
            </Text>
            <Pressable style={styles.permBtn} onPress={() => { requestCamPerm(); requestMicPerm(); }}>
              <Text style={styles.permBtnText}>Zugriff erlauben</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8} style={styles.permCancel}>
              <Text style={styles.permCancelText}>Abbrechen</Text>
            </Pressable>
          </SafeAreaView>
        ) : (
          <>
            {visible && (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                mode={mode}
              />
            )}

            {/* Top bar */}
            <SafeAreaView style={styles.topBar} pointerEvents="box-none">
              <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn}>
                <X size={24} color="#FFFFFF" />
              </Pressable>
              {isRecording ? (
                <View style={styles.recPill}>
                  <View style={styles.recDot} />
                  <Text style={styles.recText}>{fmt(recordSeconds)}</Text>
                </View>
              ) : (
                <View />
              )}
              <Pressable onPress={flip} hitSlop={10} style={styles.iconBtn} disabled={isRecording}>
                <RefreshCcw size={24} color={isRecording ? "rgba(255,255,255,0.4)" : "#FFFFFF"} />
              </Pressable>
            </SafeAreaView>

            {/* Bottom controls */}
            <SafeAreaView style={styles.bottomBar} pointerEvents="box-none">
              {/* Foto / Video toggle */}
              {!isRecording && (
                <View style={styles.modeToggle}>
                  <Pressable onPress={() => setMode("picture")} style={styles.modeBtn}>
                    <Text style={[styles.modeText, mode === "picture" && styles.modeTextActive]}>
                      Foto
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setMode("video")} style={styles.modeBtn}>
                    <Text style={[styles.modeText, mode === "video" && styles.modeTextActive]}>
                      Video
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Shutter */}
              <Pressable onPress={onShutter} disabled={isBusy} style={styles.shutterOuter}>
                {isBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : mode === "video" ? (
                  isRecording ? (
                    <View style={styles.shutterStop} />
                  ) : (
                    <View style={styles.shutterInnerVideo} />
                  )
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </Pressable>
              <Text style={styles.hint}>
                {mode === "video"
                  ? isRecording
                    ? "Zum Stoppen tippen"
                    : "Zum Aufnehmen tippen"
                  : "Zum Fotografieren tippen"}
              </Text>
            </SafeAreaView>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  permWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 20,
  },
  permText: { color: "#FFFFFF", fontSize: 16, textAlign: "center", lineHeight: 22 },
  permBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 28,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  permBtnText: { color: "#000000", fontSize: 16, fontWeight: "700" },
  permCancel: { padding: 8 },
  permCancelText: { color: "rgba(255,255,255,0.7)", fontSize: 15 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  recPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 32,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B30" },
  recText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 24,
    gap: 14,
  },
  modeToggle: { flexDirection: "row", gap: 24, marginBottom: 4 },
  modeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  modeText: { color: "rgba(255,255,255,0.6)", fontSize: 15, fontWeight: "700" },
  modeTextActive: { color: "#FFFFFF" },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FFFFFF",
  },
  shutterInnerVideo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FF3B30",
  },
  shutterStop: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: "#FF3B30",
  },
  hint: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
});

export default ZettiCamera;
