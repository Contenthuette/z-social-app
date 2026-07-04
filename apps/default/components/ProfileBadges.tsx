import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { colors, radius } from "@/lib/theme";
import { SymbolView } from "@/components/Icon";
import { ZLogo } from "@/components/ZLogo";
import type { Id } from "@/convex/_generated/dataModel";

/* ── Z Admin Badge ─────────────────────────────── */
export function ZAdminBadge({ centered = false }: { centered?: boolean }) {
  return (
    <View style={[styles.zBadge, centered && styles.zBadgeCentered]}>
      <ZLogo size={18} />
      <Text style={styles.zText}>Admin</Text>
    </View>
  );
}

/* ── Group Info type ───────────────────────────── */
interface GroupInfo {
  groupId: Id<"groups">;
  groupName: string;
  role: "admin" | "member";
}

/* ── Group Admin Link ──────────────────────────── */
// Shows "Gruppenadmin: GroupName" as a tappable link
export function GroupAdminLinks({ groups }: { groups: GroupInfo[] }) {
  const adminGroups = groups.filter((g) => g.role === "admin");
  if (adminGroups.length === 0) return null;

  return (
    <View style={styles.adminLinksContainer}>
      {adminGroups.map((g) => (
        <TouchableOpacity
          key={g.groupId}
          style={styles.adminLinkRow}
          activeOpacity={0.6}
          onPress={() => router.navigate(`/(main)/group-detail?id=${g.groupId}` as "/")}
        >
          <SymbolView name="crown.fill" size={11} tintColor={colors.gray500} />
          <Text style={styles.adminLinkLabel}>Gruppenadmin: </Text>
          <Text style={styles.adminLinkName} numberOfLines={1}>{g.groupName}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/* ── Member In Button + Sheet ─────────────────── */
// Small pill button "Mitglied in..." → opens a list sheet
export function MemberInButton({ groups }: { groups: GroupInfo[] }) {
  const memberGroups = groups.filter((g) => g.role === "member");
  const [open, setOpen] = useState(false);

  if (memberGroups.length === 0) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.memberBtn}
        activeOpacity={0.6}
        onPress={() => setOpen(true)}
      >
        <SymbolView name="person.2" size={11} tintColor={colors.gray500} />
        <Text style={styles.memberBtnText}>
          Mitglied in...
        </Text>
        <SymbolView name="chevron.right" size={9} tintColor={colors.gray400} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Mitglied in</Text>
            <FlatList
              data={memberGroups}
              keyExtractor={(item) => item.groupId}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.groupRow}
                  activeOpacity={0.6}
                  onPress={() => {
                    setOpen(false);
                    router.navigate(`/(main)/group-detail?id=${item.groupId}` as "/");
                  }}
                >
                  <View style={styles.groupIcon}>
                    <SymbolView name="person.3.fill" size={14} tintColor={colors.gray500} />
                  </View>
                  <Text style={styles.groupRowName} numberOfLines={1}>{item.groupName}</Text>
                  <SymbolView name="chevron.right" size={12} tintColor={colors.gray300} />
                </TouchableOpacity>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/* ── Location Badge ────────────────────────────── */
export function LocationBadge({ city, county }: { city?: string; county?: string }) {
  const text = [city, county].filter(Boolean).join(", ");
  if (!text) return null;

  return (
    <View style={styles.locationChip}>
      <SymbolView name="mappin" size={11} tintColor={colors.gray500} />
      <Text style={styles.locationText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Z Admin */
  zBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 4,
  },
  zBadgeCentered: {
    alignSelf: "center",
  },
  zText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray500,
    letterSpacing: -0.2,
  },

  /* Group Admin Links */
  adminLinksContainer: {
    marginTop: 6,
    gap: 4,
  },
  adminLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
  },
  adminLinkLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.gray500,
  },
  adminLinkName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.black,
    maxWidth: 200,
    textDecorationLine: "underline",
    textDecorationColor: colors.gray300,
  },

  /* Member In Button */
  memberBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    backgroundColor: colors.gray50,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  memberBtnText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.gray600,
  },

  /* Sheet */
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: "50%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray200,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.black,
    marginBottom: 14,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  groupIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    backgroundColor: colors.gray50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  groupRowName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.black,
  },

  /* Location chip */
  locationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 34,
    backgroundColor: colors.gray50,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.gray200,
  },
  locationText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.gray600,
    maxWidth: 160,
  },
});
