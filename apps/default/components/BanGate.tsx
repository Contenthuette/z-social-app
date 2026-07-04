import React, { useCallback, useState, type ReactNode } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { signalIntentionalLogout } from "@/lib/ConvexAuthProvider";
import { SymbolView } from "@/components/Icon";

/**
 * Post-auth ban gate: once the user is authenticated, checks whether their
 * email is on the bannedEmails list. If so, a full-screen blocking view is
 * rendered on top of the entire app (the user cannot interact with anything
 * underneath) and the only available action is signing out.
 *
 * This covers both re-login and re-registration with a banned email:
 * the session is created by Better Auth, but the app is immediately blocked.
 */
export function BanGate({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const [signingOut, setSigningOut] = useState(false);
  const amIBanned = useQuery(
    api.reports.amIBanned,
    isAuthenticated && !signingOut ? {} : "skip",
  );
  const banned = amIBanned === true;

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      signalIntentionalLogout();
      router.replace("/(auth)/welcome");
      await authClient.signOut();
    } catch (e: unknown) {
      console.error("Ban sign out error:", e);
    } finally {
      setSigningOut(false);
    }
  }, []);

  return (
    <>
      {children}
      {banned && (
        <View style={styles.overlay} pointerEvents="auto">
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <SymbolView name="nosign" size={34} tintColor="#EF4444" />
            </View>
            <Text style={styles.title}>Zugang gesperrt</Text>
            <Text style={styles.message}>
              Du wurdest aufgrund von Communityverstößen gebannt.
            </Text>
            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={handleSignOut}
              activeOpacity={0.8}
              disabled={signingOut}
            >
              <Text style={styles.signOutText}>Abmelden</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    zIndex: 9999,
    elevation: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 32,
    maxWidth: 420,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  signOutBtn: {
    backgroundColor: "#000",
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 40,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
