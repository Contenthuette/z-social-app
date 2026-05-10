import React from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { signalIntentionalLogout } from "@/lib/ConvexAuthProvider";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, spacing, radius } from "@/lib/theme";
import { safeBack } from "@/lib/navigation";
import { SymbolView } from "@/components/Icon";
import * as Haptics from "expo-haptics";

const sections = [
  {
    title: "Konto",
    items: [
      { icon: "bookmark" as const, label: "Gespeicherte Beiträge", route: "/(main)/saved-posts" },
      { icon: "pencil.circle" as const, label: "Profil bearbeiten", route: "/(main)/edit-profile" },
      { icon: "key" as const, label: "Passwort ändern", route: "/(main)/change-password" },
      { icon: "bell.badge" as const, label: "Benachrichtigungen", route: "/(main)/notification-settings" },
    ],
  },
  {
    title: "Privatsphäre & Sicherheit",
    items: [
      { icon: "hand.raised" as const, label: "Blockierte Nutzer", route: "/(main)/blocked-users" },
    ],
  },
  // DISABLED: Subscription section — kept for re-enabling later
  // {
  //   title: "Abonnement",
  //   items: [
  //     { icon: "creditcard" as const, label: "Abonnement verwalten", route: "/(main)/subscription" },
  //   ],
  // },
  {
    title: "Rechtliches",
    items: [
      { icon: "shield.lefthalf.filled" as const, label: "Privacy Center", route: "/(main)/privacy-center" },
    ],
  },
];

const FEEDBACK_EMAIL = "leif@z-social.com";
const FEEDBACK_SUBJECT = "Z App – Feedback / Bug-Meldung";
const FEEDBACK_BODY = "Hallo Z-Team,\n\nich möchte folgendes melden:\n\n";

export default function SettingsScreen() {
  const { isAuthenticated } = useConvexAuth();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const me = useQuery(api.users.me, isAuthenticated && !isSigningOut ? {} : "skip");
  const isAdmin = me?.role === "admin" || me?.email === "leif@z-social.com";

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      signalIntentionalLogout();
      router.replace("/(auth)/welcome");
      await authClient.signOut();
    } catch (e) {
      setIsSigningOut(false);
      console.error("Sign out error:", e);
    }
  };

  const handleFeedback = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent(FEEDBACK_BODY)}`;
    try {
      await Linking.openURL(url);
    } catch {
      // fallback – just open mailto
      await Linking.openURL(`mailto:${FEEDBACK_EMAIL}`);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack("settings")} style={styles.backBtn} hitSlop={12}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>Einstellungen</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {sections.map((section, si) => (
          <View key={si} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, ii) => (
                <TouchableOpacity
                  key={ii}
                  style={[styles.row, ii < section.items.length - 1 && styles.rowBorder]}
                  onPress={() => router.navigate(item.route as "/")}
                  activeOpacity={0.6}
                >
                  <View style={styles.rowIcon}>
                    <SymbolView name={item.icon} size={17} tintColor={colors.gray500} />
                  </View>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <SymbolView name="chevron.right" size={13} tintColor={colors.gray300} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Admin Panel */}
        {isAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Admin</Text>
            <View style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.navigate("/(main)/admin-login" as "/")}
                activeOpacity={0.6}
              >
                <View style={[styles.rowIcon, { backgroundColor: "rgba(0,0,0,0.06)" }]}>
                  <SymbolView name="gearshape.2" size={17} tintColor={colors.black} />
                </View>
                <Text style={styles.rowLabel}>Admin-Panel</Text>
                <SymbolView name="chevron.right" size={13} tintColor={colors.gray300} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Logout */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <TouchableOpacity style={styles.logoutRow} onPress={handleSignOut} activeOpacity={0.6}>
              <View style={[styles.rowIcon, styles.logoutIcon]}>
                <SymbolView name="rectangle.portrait.and.arrow.right" size={17} tintColor={colors.danger} />
              </View>
              <Text style={styles.logoutText}>Abmelden</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Feedback / Bug Report */}
        <View style={styles.feedbackSection}>
          <View style={styles.betaBadge}>
            <Text style={styles.betaBadgeText}>BETA</Text>
          </View>
          <Text style={styles.feedbackTitle}>Hilf uns, Z besser zu machen</Text>
          <Text style={styles.feedbackDesc}>
            Z ist noch in der Beta-Phase – Bugs können leider vorkommen und dafür entschuldigen wir uns! {"\n"}
            Dein Feedback hilft uns, die App für alle zu verbessern.
          </Text>
          <TouchableOpacity style={styles.feedbackBtn} onPress={handleFeedback} activeOpacity={0.7}>
            <SymbolView name="envelope" size={16} tintColor={colors.white} />
            <Text style={styles.feedbackBtnText}>Bug melden oder Feedback geben</Text>
          </TouchableOpacity>
          <Text style={styles.feedbackEmail}>{FEEDBACK_EMAIL}</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.brand}>built by Leif Dunkelmann | CONTENTHÜTTE</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.gray50 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.gray50,
  },
  backBtn: { width: 36, height: 36, justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "600", color: colors.black },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 60 },

  section: { marginTop: spacing.xl },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray400,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    overflow: "hidden",
    borderCurve: "continuous",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray100,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.gray50,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontSize: 16, color: colors.black, letterSpacing: -0.1 },

  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  logoutIcon: {
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  logoutText: { flex: 1, fontSize: 16, fontWeight: "500", color: colors.danger },

  feedbackSection: {
    marginTop: spacing.xxl,
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  betaBadge: {
    backgroundColor: colors.black,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: spacing.md,
  },
  betaBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: 2,
  },
  feedbackTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.black,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  feedbackDesc: {
    fontSize: 14,
    color: colors.gray500,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  feedbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.black,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderCurve: "continuous",
  },
  feedbackBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.white,
  },
  feedbackEmail: {
    fontSize: 12,
    color: colors.gray400,
    marginTop: spacing.sm,
  },

  footer: {
    alignItems: "center",
    paddingTop: spacing.xxl * 2,
    paddingBottom: 40,
  },
  brand: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.gray300,
    textAlign: "center",
    letterSpacing: 2,
  },

  version: {
    fontSize: 12,
    color: colors.gray400,
    textAlign: "center",
    marginTop: spacing.xxl,
    marginBottom: spacing.xs,
  },
});
