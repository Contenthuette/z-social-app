import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LivestreamPipContext } from "@/lib/livestream-pip-context";
import { MinimizedLivestreamWindow } from "./MinimizedLivestreamWindow";

/**
 * Global provider for the livestream Picture-in-Picture window.
 * Mirrors CallProvider: holds the minimized livestream id and renders the
 * draggable floating window above the whole app while it is set.
 */
export function LivestreamPipProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const [minimizedLivestreamId, setMinimizedLivestreamId] =
    useState<Id<"livestreams"> | null>(null);

  const minimizeLivestream = useCallback((livestreamId: Id<"livestreams">) => {
    setMinimizedLivestreamId(livestreamId);
  }, []);

  const closeLivestreamPip = useCallback(() => {
    setMinimizedLivestreamId(null);
  }, []);

  // Clear the PiP when the user logs out
  useEffect(() => {
    if (isAuthenticated) return;
    setMinimizedLivestreamId(null);
  }, [isAuthenticated]);

  // Auto-close the PiP when the minimized stream no longer exists or ended
  const minimizedStream = useQuery(
    api.livestreams.getById,
    isAuthenticated && minimizedLivestreamId
      ? { livestreamId: minimizedLivestreamId }
      : "skip",
  );

  useEffect(() => {
    if (!minimizedLivestreamId) return;
    if (minimizedStream === null || minimizedStream?.status === "ended") {
      setMinimizedLivestreamId(null);
    }
  }, [minimizedLivestreamId, minimizedStream]);

  return (
    <LivestreamPipContext.Provider
      value={{ minimizedLivestreamId, minimizeLivestream, closeLivestreamPip }}
    >
      <View style={styles.root}>
        {children}
        {minimizedLivestreamId && (
          <MinimizedLivestreamWindow livestreamId={minimizedLivestreamId} />
        )}
      </View>
    </LivestreamPipContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
