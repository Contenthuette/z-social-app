import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Platform } from "react-native";
import { ConvexReactClient } from "convex/react";
import { registerGlobals } from "@livekit/react-native";
import { ConvexAuthProvider } from "@/lib/ConvexAuthProvider";
import { SoundProvider } from "@/lib/sounds";

// Register LiveKit's WebRTC globals once at startup, before anything uses WebRTC.
// (Native only — the browser already provides WebRTC globals on web.)
if (Platform.OS !== "web") {
  registerGlobals();
}

const convexUrl =
  process.env.EXPO_PUBLIC_CONVEX_URL ?? "https://cheery-panther-475.convex.cloud";

const convex = new ConvexReactClient(convexUrl, {
  unsavedChangesWarning: false,
});

export default function RootLayout() {
  return (
    <ConvexAuthProvider client={convex}>
      <SoundProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
        </Stack>
      </SoundProvider>
    </ConvexAuthProvider>
  );
}
