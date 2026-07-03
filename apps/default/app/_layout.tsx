import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@/lib/ConvexAuthProvider";
import { SoundProvider } from "@/lib/sounds";

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
