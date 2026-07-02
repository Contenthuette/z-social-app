import React from "react";
import { Modal, View, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { SymbolView } from "@/components/Icon";
import { colors } from "@/lib/theme";

/**
 * Square pop-up that shows a picture (e.g. a profile picture) enlarged.
 * Tap the backdrop or the X (top-right) to close.
 */
export function ImageViewerModal({
  uri,
  visible,
  onClose,
}: {
  uri?: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible && !!uri}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Image
            source={{ uri: uri ?? undefined }}
            style={styles.image}
            contentFit="cover"
            transition={150}
          />
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <SymbolView name="xmark" size={16} tintColor={colors.white} />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    aspectRatio: 1,
    maxWidth: 400,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: colors.gray900,
  },
  image: { width: "100%", height: "100%" },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});
