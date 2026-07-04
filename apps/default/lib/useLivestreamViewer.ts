import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { ComponentType } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/* ---- Conditional RTC import (native only) ---- */
interface RTCPeerConnectionLike {
  close: () => void;
  createOffer: (opts?: unknown) => Promise<unknown>;
  createAnswer: () => Promise<unknown>;
  setLocalDescription: (d: unknown) => Promise<void>;
  setRemoteDescription: (d: unknown) => Promise<void>;
  addIceCandidate: (c: unknown) => Promise<void>;
  remoteDescription?: unknown;
  connectionState?: string;
  iceConnectionState?: string;
  ontrack: ((e: { streams?: Array<MediaStreamLike> }) => void) | null;
  onicecandidate: ((e: { candidate?: unknown }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
}

interface MediaTrackLike { enabled: boolean; stop: () => void; }
interface MediaStreamLike {
  getTracks: () => Array<MediaTrackLike>;
  toURL: () => string;
}

interface RTCViewProps {
  streamURL: string;
  style?: unknown;
  objectFit?: "contain" | "cover";
  mirror?: boolean;
  zOrder?: number;
}

type RTCViewComponent = ComponentType<RTCViewProps>;

interface IceServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

let RTC: {
  RTCPeerConnection: new (cfg: unknown) => RTCPeerConnectionLike;
  RTCSessionDescription: new (d: unknown) => unknown;
  RTCIceCandidate: new (c: unknown) => unknown;
  RTCView: unknown;
} | null = null;

if (Platform.OS !== "web") {
  try {
    RTC = require("react-native-webrtc") as typeof RTC;
  } catch { /* not available */ }
}

const DEFAULT_ICE: Array<IceServerConfig> = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const SIGNAL_ACK_DEBOUNCE_MS = 400;

interface UseLivestreamViewerOptions {
  livestreamId: Id<"livestreams"> | null;
  hostId: Id<"users"> | null;
  enabled: boolean;
}

/**
 * Viewer hook: watches the livestream (receive-only, no local media).
 * The viewer initiates the connection by sending an offer to the host.
 * The host responds with an answer and streams media back.
 */
export function useLivestreamViewer({ livestreamId, hostId, enabled }: UseLivestreamViewerOptions) {
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState("new");
  const [iceServers, setIceServers] = useState<Array<IceServerConfig>>(DEFAULT_ICE);
  const [iceReady, setIceReady] = useState(false);

  const pcRef = useRef<RTCPeerConnectionLike | null>(null);
  const processedIds = useRef<Set<string>>(new Set());
  const pendingCandidates = useRef<Array<unknown>>([]);
  const hasCreatedOffer = useRef(false);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAckIds = useRef<Array<Id<"livestreamSignaling">>>([]);

  const sendSignal = useMutation(api.livestreams.sendSignal);
  const ackSignals = useMutation(api.livestreams.ackSignals);
  const getIceServers = useAction(api.callActions.getIceServers);

  const signals = useQuery(
    api.livestreams.getSignals,
    livestreamId && enabled ? { livestreamId } : "skip",
  );

  /* -- Debounced ack -- */
  const flushAcks = useCallback(() => {
    if (pendingAckIds.current.length === 0) return;
    const ids = [...pendingAckIds.current];
    pendingAckIds.current = [];
    ackSignals({ signalIds: ids }).catch(() => {});
  }, [ackSignals]);

  const scheduleAck = useCallback(
    (id: Id<"livestreamSignaling">) => {
      pendingAckIds.current.push(id);
      if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
      ackTimerRef.current = setTimeout(flushAcks, SIGNAL_ACK_DEBOUNCE_MS);
    },
    [flushAcks],
  );

  /* -- Load ICE servers -- */
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getIceServers({}).then((servers) => {
      if (cancelled) return;
      const valid = servers.filter(
        (s: IceServerConfig) =>
          s.urls.startsWith("stun:") || s.urls.startsWith("turn:") || s.urls.startsWith("turns:"),
      );
      if (valid.length > 0) setIceServers(valid);
      setIceReady(true);
    }).catch(() => { if (!cancelled) setIceReady(true); });
    return () => { cancelled = true; };
  }, [enabled, getIceServers]);

  /* -- Reset state on new stream -- */
  useEffect(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    hasCreatedOffer.current = false;
    processedIds.current.clear();
    pendingCandidates.current = [];
    setRemoteStreamUrl(null);
    setConnectionState("new");
  }, [livestreamId]);

  /* -- Create PC and send offer to host -- */
  useEffect(() => {
    if (!RTC || !iceReady || !livestreamId || !hostId || !enabled || hasCreatedOffer.current) return;
    const rtc = RTC;
    const lsId = livestreamId;
    const hId = hostId;

    hasCreatedOffer.current = true;

    const pc = new rtc.RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.ontrack = (e) => {
      if (e.streams?.[0]) setRemoteStreamUrl(e.streams[0].toURL());
    };

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      sendSignal({
        livestreamId: lsId,
        recipientId: hId,
        type: "ice-candidate",
        payload: JSON.stringify(e.candidate),
      }).catch(() => {});
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState ?? "new";
      if (state === "connected" || state === "completed") setConnectionState("connected");
      else if (state === "failed") setConnectionState("failed");
      else if (state === "disconnected") setConnectionState("disconnected");
    };

    // Create a receive-only offer and send to host
    (async () => {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        await sendSignal({
          livestreamId: lsId,
          recipientId: hId,
          type: "offer",
          payload: JSON.stringify(offer),
        });
      } catch (err) {
        console.error("[LiveViewer] Offer creation failed:", err);
        hasCreatedOffer.current = false;
      }
    })();
  }, [iceReady, livestreamId, hostId, enabled, iceServers, sendSignal]);

  /* -- Process incoming signals from host (answer + ICE candidates) -- */
  useEffect(() => {
    if (!signals || !RTC) return;
    const rtc = RTC;

    (async () => {
      for (const signal of signals) {
        if (processedIds.current.has(signal._id)) continue;
        processedIds.current.add(signal._id);

        const pc = pcRef.current;
        if (!pc) { scheduleAck(signal._id); continue; }

        try {
          if (signal.type === "answer") {
            await pc.setRemoteDescription(
              new rtc.RTCSessionDescription(JSON.parse(signal.payload)),
            );
            // Flush pending ICE candidates
            for (const c of pendingCandidates.current) {
              await pc.addIceCandidate(new rtc.RTCIceCandidate(c));
            }
            pendingCandidates.current = [];
          }

          if (signal.type === "ice-candidate") {
            const candidate = JSON.parse(signal.payload);
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new rtc.RTCIceCandidate(candidate));
            } else {
              pendingCandidates.current.push(candidate);
            }
          }
        } catch (err) {
          console.error("[LiveViewer] Signal error:", signal.type, err);
        }

        scheduleAck(signal._id);
      }
    })();
  }, [signals, scheduleAck]);

  /* -- Cleanup -- */
  const cleanup = useCallback(() => {
    if (ackTimerRef.current) { clearTimeout(ackTimerRef.current); ackTimerRef.current = null; }
    flushAcks();
    pcRef.current?.close();
    pcRef.current = null;
    processedIds.current.clear();
    pendingCandidates.current = [];
    hasCreatedOffer.current = false;
    pendingAckIds.current = [];
    setRemoteStreamUrl(null);
    setConnectionState("closed");
  }, [flushAcks]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    remoteStreamUrl,
    connectionState,
    cleanup,
    isSupported: !!RTC,
    RTCView: (RTC?.RTCView as RTCViewComponent | null) ?? null,
  };
}
