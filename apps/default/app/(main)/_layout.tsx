import { Stack, Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useConvexAuth } from "convex/react";
import { colors } from "@/lib/theme";
import { useEffect, useRef, useState } from "react";
import { isIntentionalLogout } from "@/lib/ConvexAuthProvider";
import { CallProvider } from "@/components/CallProvider";

export default function MainLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated) {
      wasAuthenticatedRef.current = true;
      setShouldRedirect(false);
      return;
    }

    // Intentional logout — redirect immediately, no debounce
    if (isIntentionalLogout()) {
      setShouldRedirect(true);
      return;
    }

    // If we were previously authenticated and now we're not loading,
    // wait before redirecting to avoid flicker during token refreshes
    if (wasAuthenticatedRef.current && !isLoading) {
      const timer = setTimeout(() => {
        setShouldRedirect(true);
      }, 2000);
      return () => clearTimeout(timer);
    }

    // Never been authenticated and not loading — redirect immediately
    if (!isLoading && !wasAuthenticatedRef.current) {
      setShouldRedirect(true);
    }
  }, [isAuthenticated, isLoading]);

  // ── HARD GATE: never render children without authentication ──
  if (!isAuthenticated) {
    if (shouldRedirect) {
      return <Redirect href="/(auth)/welcome" />;
    }
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.gray400} />
      </View>
    );
  }

  return (
    <CallProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="group-detail" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="group-chat" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="create-group" options={{ presentation: "modal" }} />
        <Stack.Screen name="edit-group" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="event-detail" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="ticket" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="partner-detail" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="chat" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="conversations" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="notifications" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="notification-settings" options={{ animation: "slide_from_right", headerShown: false }} />
        <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="edit-profile" options={{ presentation: "modal" }} />
        <Stack.Screen name="saved-posts" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="blocked-users" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="subscription" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="user-profile" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="create-post" options={{ presentation: "modal" }} />
        <Stack.Screen name="create-poll" options={{ presentation: "modal" }} />
        <Stack.Screen name="post-comments" options={{
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
          headerShown: false,
        }} />
        <Stack.Screen name="search" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="my-tickets" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="privacy-center" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="admin-login" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="admin" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="admin-event-form" options={{ presentation: "modal" }} />
        <Stack.Screen name="admin-partner-form" options={{ presentation: "modal" }} />
        <Stack.Screen name="friends-list" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="groups-list" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="call" options={{ animation: "fade", headerShown: false }} />
        <Stack.Screen name="create-member-event" options={{ presentation: "modal" }} />
        <Stack.Screen name="edit-member-event" options={{ presentation: "modal" }} />
        <Stack.Screen name="member-event-detail" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="event-paywall" options={{ presentation: "modal" }} />
      </Stack>
    </CallProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
});
