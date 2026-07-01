import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Platform,
  Animated as RNAnimated,
} from "react-native";
import { Image } from "expo-image";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { colors } from "@/lib/theme";
import { SymbolView } from "@/components/Icon";
import * as Haptics from "expo-haptics";

interface ShareSheetProps {
  visible: boolean;
  postId?: Id<"posts"> | null;
  /** When set, the sheet shares a user profile instead of a post (DM only). */
  profileUserId?: Id<"users"> | null;
  onClose: () => void;
}

type ShareTarget = {
  id: string;
  type: "user" | "group";
  name: string;
  avatarUrl?: string;
  subtitle?: string;
  messageCount: number;
  section: "frequent" | "friend" | "group" | "other";
};

const SECTION_LABELS: Record<string, string> = {
  frequent: "Häufig kontaktiert",
  friend: "Freunde",
  group: "Deine Gruppen",
  other: "Weitere",
};

export function ShareSheet({ visible, postId, profileUserId, onClose }: ShareSheetProps) {
  const [search, setSearch] = useState("");
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const slideAnim = useRef(new RNAnimated.Value(0)).current;
  const isProfileShare = !!profileUserId;

  const targets = useQuery(
    api.sharing.getShareTargets,
    visible ? { search: search.length >= 2 ? search : undefined } : "skip",
  );
  const sharePost = useMutation(api.sharing.sharePost);
  const shareProfile = useMutation(api.sharing.shareProfile);

  useEffect(() => {
    if (visible) {
      setSentTo(new Set());
      setSearch("");
      RNAnimated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible, slideAnim]);

  const handleShare = useCallback(
    async (target: ShareTarget) => {
      if (sentTo.has(target.id)) return;
      if (!postId && !profileUserId) return;
      setSending(target.id);
      try {
        if (profileUserId) {
          await shareProfile({
            profileUserId,
            targetId: target.id,
            targetType: target.type,
          });
        } else if (postId) {
          await sharePost({
            postId,
            targetId: target.id,
            targetType: target.type,
          });
        }
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setSentTo((prev) => new Set(prev).add(target.id));
      } catch (e) {
        console.error("Share error:", e);
      } finally {
        setSending(null);
      }
    },
    [postId, profileUserId, sentTo, sharePost, shareProfile],
  );

  /* ── Sectioned data ──────────────────────────────────────── */
  type ListItem =
    | { kind: "header"; section: string }
    | { kind: "target"; data: ShareTarget };

  const listData: ListItem[] = [];
  if (targets) {
    // Profile sharing is DM-only → hide group targets.
    const visibleTargets = targets.filter((t) => !isProfileShare || t.type === "user");
    let lastSection = "";
    for (const t of visibleTargets) {
      if (t.section !== lastSection) {
        listData.push({ kind: "header", section: t.section });
        lastSection = t.section;
      }
      listData.push({ kind: "target", data: t });
    }
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === "header") {
      return (
        <Text style={styles.sectionHeader}>
          {SECTION_LABELS[item.section] ?? item.section}
        </Text>
      );
    }

    const t = item.data;
    const isSent = sentTo.has(t.id);
    const isSending = sending === t.id;

    return (
      <TouchableOpacity
        style={styles.targetRow}
        activeOpacity={0.6}
        onPress={() => handleShare(t)}
        disabled={isSent || isSending}
      >
        {/* Avatar */}
        {t.avatarUrl ? (
          <Image source={{ uri: t.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <SymbolView
              name={t.type === "group" ? "person.3.fill" : "person.fill"}
              size={18}
              tintColor={colors.gray400}
            />
          </View>
        )}

        {/* Info */}
        <View style={styles.targetInfo}>
          <Text style={styles.targetName} numberOfLines={1}>
            {t.name}
          </Text>
          {t.subtitle ? (
            <Text style={styles.targetSub} numberOfLines={1}>
              {t.type === "group" ? "👥" : "📍"} {t.subtitle}
            </Text>
          ) : null}
        </View>

        {/* Send button */}
        {isSending ? (
          <ActivityIndicator size="small" color={colors.black} />
        ) : isSent ? (
          <View style={styles.sentBadge}>
            <SymbolView name="checkmark" size={18} tintColor={colors.white} />
          </View>
        ) : (
          <View style={styles.sendBtn}>
            <SymbolView name="paperplane.fill" size={18} tintColor={colors.white} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item: ListItem, _index: number) =>
    item.kind === "header" ? `h-${item.section}` : `t-${item.data.id}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Grabber */}
        <View style={styles.grabber} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Teilen</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <View style={styles.closeBtn}>
              <SymbolView name="xmark" size={14} tintColor={colors.gray500} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <SymbolView name="magnifyingglass" size={16} tintColor={colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Suche nach Personen oder Gruppen…"
            placeholderTextColor={colors.gray400}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <SymbolView name="xmark.circle.fill" size={16} tintColor={colors.gray400} />
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        {targets === undefined ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.black} />
          </View>
        ) : listData.length === 0 ? (
          <View style={styles.emptyWrap}>
            <SymbolView name="person.2.slash" size={40} tintColor={colors.gray300} />
            <Text style={styles.emptyText}>
              {search.length >= 2
                ? "Keine Ergebnisse"
                : "Noch keine Kontakte"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={listData}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.gray200,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.black,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Search */
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.gray100,
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.black,
    paddingVertical: 0,
  },

  /* List */
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
  },

  /* Target row */
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.gray100,
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  targetInfo: {
    flex: 1,
    gap: 2,
  },
  targetName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.black,
  },
  targetSub: {
    fontSize: 13,
    color: colors.gray500,
  },

  /* Send / Sent */
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  sentBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#34C759",
    alignItems: "center",
    justifyContent: "center",
  },

  /* States */
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: colors.gray400,
  },
});
