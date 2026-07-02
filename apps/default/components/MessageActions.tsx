import React from "react";
import { Modal, View, Text, Pressable, StyleSheet, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "@/lib/theme";

export const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🙏"];

export interface MessageReaction {
  userId: string;
  emoji: string;
}

/**
 * WhatsApp-style long-press menu: a row of emoji reactions on top,
 * then "Antworten" and (for own messages) "Löschen".
 */
export function MessageActionSheet({
  visible,
  onClose,
  onReact,
  onReply,
  onDelete,
  canDelete,
}: {
  visible: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}) {
  const handleReact = (emoji: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReact(emoji);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.emojiRow}>
            {REACTION_EMOJIS.map((emoji) => (
              <Pressable key={emoji} onPress={() => handleReact(emoji)} hitSlop={4} style={styles.emojiBtn}>
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            <Pressable
              style={styles.actionRow}
              onPress={() => { onReply(); onClose(); }}
            >
              <Text style={styles.actionText}>Antworten</Text>
            </Pressable>
            {canDelete && onDelete && (
              <>
                <View style={styles.divider} />
                <Pressable
                  style={styles.actionRow}
                  onPress={() => { onDelete(); onClose(); }}
                >
                  <Text style={[styles.actionText, { color: "#FF3B30" }]}>Löschen</Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Small badge row showing reactions under a message bubble. */
export function ReactionBadges({
  reactions,
  isMine,
  onPress,
}: {
  reactions?: MessageReaction[];
  isMine?: boolean;
  onPress?: () => void;
}) {
  if (!reactions || reactions.length === 0) return null;
  // Group by emoji with counts
  const counts = new Map<string, number>();
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  const entries = [...counts.entries()];

  return (
    <Pressable
      onPress={onPress}
      style={[styles.reactionWrap, isMine ? styles.reactionWrapMine : styles.reactionWrapOther]}
    >
      {entries.map(([emoji, count]) => (
        <View key={emoji} style={styles.reactionBadge}>
          <Text style={styles.reactionEmoji}>{emoji}</Text>
          {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
        </View>
      ))}
    </Pressable>
  );
}

/** Quoted "Antwort an X" block rendered inside a message bubble. */
export function QuotedReply({
  senderName,
  text,
  isMine,
}: {
  senderName?: string;
  text?: string;
  isMine?: boolean;
}) {
  if (!senderName) return null;
  return (
    <View style={[styles.quote, isMine ? styles.quoteMine : styles.quoteOther]}>
      <View style={[styles.quoteAccent, { backgroundColor: isMine ? "rgba(255,255,255,0.7)" : colors.black }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.quoteName, isMine && { color: colors.white }]} numberOfLines={1}>
          {senderName}
        </Text>
        <Text style={[styles.quoteText, isMine && { color: "rgba(255,255,255,0.75)" }]} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  sheet: {
    width: "100%",
    maxWidth: 340,
    gap: 12,
  },
  emojiRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 8,
    boxShadow: "0px 4px 16px rgba(0,0,0,0.18)",
  },
  emojiBtn: { padding: 4 },
  emoji: { fontSize: 30 },
  actions: {
    backgroundColor: colors.white,
    borderRadius: 18,
    overflow: "hidden",
    boxShadow: "0px 4px 16px rgba(0,0,0,0.18)",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  actionText: { fontSize: 16, fontWeight: "500", color: colors.black },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.gray200, marginLeft: 18 },

  reactionWrap: {
    flexDirection: "row",
    gap: 4,
    marginTop: -6,
    marginBottom: 2,
  },
  reactionWrapMine: { alignSelf: "flex-end", marginRight: 6 },
  reactionWrapOther: { alignSelf: "flex-start", marginLeft: 6 },
  reactionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.white,
    borderColor: colors.gray200,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    boxShadow: "0px 1px 3px rgba(0,0,0,0.1)",
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, fontWeight: "600", color: colors.gray500 },

  quote: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 5,
  },
  quoteMine: { backgroundColor: "rgba(255,255,255,0.15)" },
  quoteOther: { backgroundColor: "rgba(0,0,0,0.05)" },
  quoteAccent: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  quoteName: { fontSize: 12, fontWeight: "700", color: colors.black },
  quoteText: { fontSize: 12, color: colors.gray500, marginTop: 1 },
});
