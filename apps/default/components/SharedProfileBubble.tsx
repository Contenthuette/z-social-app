import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SymbolView } from "@/components/Icon";
import type { Id } from "@/convex/_generated/dataModel";

interface SharedProfileBubbleProps {
  profileUserId: Id<"users">;
  isMine: boolean;
  timestamp?: string;
}

export function SharedProfileBubble({ profileUserId, isMine, timestamp }: SharedProfileBubbleProps) {
  const router = useRouter();
  const user = useQuery(api.users.getById, { userId: profileUserId });

  const open = () =>
    router.navigate({ pathname: "/(main)/user-profile", params: { id: profileUserId } });

  // Deleted / not found
  if (user === null) {
    return (
      <View style={[styles.container, isMine ? styles.meContainer : styles.otherContainer]}>
        <View style={styles.fallback}>
          <SymbolView name="person.crop.circle.badge.xmark" size={26} tintColor="#bbb" />
          <Text style={styles.fallbackText}>Profil nicht verfügbar</Text>
        </View>
        {timestamp ? <Text style={styles.time}>{timestamp}</Text> : null}
      </View>
    );
  }

  const subtitle = [user?.city, user?.county].filter(Boolean).join(", ");

  return (
    <TouchableOpacity
      style={[styles.container, isMine ? styles.meContainer : styles.otherContainer]}
      onPress={open}
      activeOpacity={0.8}
    >
      <View style={styles.row}>
        {user?.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <SymbolView name="person.fill" size={22} tintColor="#bbb" />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{user?.name ?? "…"}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.bottomRow}>
        <View style={styles.openRow}>
          <Text style={styles.openLabel}>Profil ansehen</Text>
          <SymbolView name="chevron.right" size={10} tintColor="#999" />
        </View>
        {timestamp ? <Text style={styles.time}>{timestamp}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 220,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 12,
    gap: 10,
  },
  meContainer: { backgroundColor: "#f0f0f0" },
  otherContainer: { backgroundColor: "#f5f5f5" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#e8e8e8" },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: "700", color: "#000" },
  subtitle: { fontSize: 12, color: "#666" },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  openRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  openLabel: { fontSize: 12, color: "#666", fontWeight: "500" },
  fallback: { alignItems: "center", gap: 6, paddingVertical: 8 },
  fallbackText: { fontSize: 13, color: "#999" },
  time: { fontSize: 10, color: "#aaa" },
});
