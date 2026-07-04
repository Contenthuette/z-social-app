import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useAction } from "convex/react";
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useTracks,
} from "@livekit/react-native";
import { Track } from "livekit-client";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { colors } from "@/lib/theme";
import { forceSpeakerWithRetries, setSpeakerOn } from "@/lib/audioRouting";

interface LiveStreamStageProps {
  livestreamId: Id<"livestreams">;
  /** true = publish camera + mic (host / co-streamer), false = watch only */
  isStreamer: boolean;
}

/**
 * LiveKit (SFU) stage for group livestreams: up to 4 simultaneous publishers,
 * many subscribe-only viewers, adaptive split-screen grid.
 *
 * Fetches a room token from the Convex `livekit.getStreamToken` node action.
 * The token is re-fetched whenever `isStreamer` flips, so a viewer who joins
 * as co-streamer gets a fresh token carrying the publish grant.
 */
export function LiveStreamStage({ livestreamId, isStreamer }: LiveStreamStageProps) {
  const getStreamToken = useAction(api.livekit.getStreamToken);
  const [connection, setConnection] = useState<{ url: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch (and re-fetch on role change) the LiveKit token
  useEffect(() => {
    let cancelled = false;
    setConnection(null);
    setError(null);
    getStreamToken({ livestreamId })
      .then((res) => {
        if (!cancelled) setConnection({ url: res.url, token: res.token });
      })
      .catch((err) => {
        console.error("[LiveStreamStage] Token fetch failed:", err);
        if (!cancelled) setError("Verbindung zum Stream fehlgeschlagen.");
      });
    return () => {
      cancelled = true;
    };
  }, [livestreamId, isStreamer, getStreamToken]);

  // Audio session + force loudspeaker while the stage is mounted
  useEffect(() => {
    if (Platform.OS === "web") return;
    let stopped = false;
    let cancelRetries: (() => void) | null = null;
    AudioSession.startAudioSession()
      .then(() => {
        if (!stopped) cancelRetries = forceSpeakerWithRetries();
      })
      .catch(() => {});
    return () => {
      stopped = true;
      cancelRetries?.();
      setSpeakerOn(false);
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, []);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.infoText}>Livestreams sind nur in der App verfügbar.</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.infoText}>{error}</Text>
      </View>
    );
  }

  if (!connection) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.white} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LiveKitRoom
        serverUrl={connection.url}
        token={connection.token}
        connect
        audio={isStreamer}
        video={isStreamer}
        options={{ adaptiveStream: { pixelDensity: "screen" } }}
      >
        <Stage />
      </LiveKitRoom>
    </View>
  );
}

/**
 * Adaptive split-screen grid, keyed off the number of published camera tracks:
 * 1 → fullscreen, 2 → two stacked halves, 3 → one big on top + two side-by-side
 * below, 4 → 2x2 grid.
 */
function Stage() {
  const tracks = useTracks([Track.Source.Camera]);
  const shown = tracks.slice(0, 4);

  const renderTile = (item: unknown, index: number) => {
    if (isTrackReference(item)) {
      const ref = item as {
        participant?: { identity?: string };
        publication?: { trackSid?: string };
      };
      const key = ref.publication?.trackSid ?? ref.participant?.identity ?? `track-${index}`;
      return (
        <View key={key} style={styles.tile}>
          <VideoTrack trackRef={item} style={styles.video} objectFit="cover" />
        </View>
      );
    }
    return <View key={`placeholder-${index}`} style={[styles.tile, styles.tileEmpty]} />;
  };

  if (shown.length === 0) {
    return (
      <View style={[styles.stage, styles.center]}>
        <ActivityIndicator color={colors.white} />
        <Text style={styles.infoText}>Warte auf Video…</Text>
      </View>
    );
  }

  if (shown.length <= 2) {
    // 1 → fullscreen, 2 → two equal stacked halves
    return <View style={styles.stage}>{shown.map(renderTile)}</View>;
  }

  if (shown.length === 3) {
    // One big tile on top, two side-by-side below
    return (
      <View style={styles.stage}>
        {renderTile(shown[0], 0)}
        <View style={styles.row}>
          {renderTile(shown[1], 1)}
          {renderTile(shown[2], 2)}
        </View>
      </View>
    );
  }

  // 4 → 2x2 grid
  return (
    <View style={styles.stage}>
      <View style={styles.row}>
        {renderTile(shown[0], 0)}
        {renderTile(shown[1], 1)}
      </View>
      <View style={styles.row}>
        {renderTile(shown[2], 2)}
        {renderTile(shown[3], 3)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.black,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  stage: {
    flex: 1,
    flexDirection: "column",
  },
  row: {
    flex: 1,
    flexDirection: "row",
  },
  tile: {
    flex: 1,
    margin: 1,
    overflow: "hidden",
    backgroundColor: colors.gray900,
  },
  tileEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  video: {
    flex: 1,
  },
  infoText: {
    color: colors.gray400,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});

export default LiveStreamStage;
