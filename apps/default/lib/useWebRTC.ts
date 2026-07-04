import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import type { ComponentType } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

let RTC: {
  RTCPeerConnection: new (config: unknown) => RTCPeerConnectionLike;
  RTCSessionDescription: new (description: unknown) => RTCSessionDescriptionLike;
  RTCIceCandidate: new (candidate: unknown) => RTCIceCandidateLike;
  mediaDevices: {
    getUserMedia: (constraints: unknown) => Promise<MediaStreamLike>;
  };
  RTCView: unknown;
} | null = null;

interface RTCPeerConnectionLike {
  addTrack: (track: MediaTrackLike, stream: MediaStreamLike) => void;
  close: () => void;
  createAnswer: () => Promise<unknown>;
  createOffer: (options?: unknown) => Promise<unknown>;
  setLocalDescription: (description: unknown) => Promise<void>;
  setRemoteDescription: (description: unknown) => Promise<void>;
  addIceCandidate: (candidate: unknown) => Promise<void>;
  localDescription?: unknown;
  remoteDescription?: unknown;
  currentTime?: number;
  duration?: number;
  connectionState?: string;
  iceConnectionState?: string;
  signalingState?: string;
  ontrack: ((event: { streams?: Array<MediaStreamLike> }) => void) | null;
  onicecandidate: ((event: { candidate?: unknown }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
}

interface RTCSessionDescriptionLike {}
interface RTCIceCandidateLike {}

interface MediaTrackLike {
  enabled: boolean;
  stop: () => void;
  _switchCamera?: () => void;
}

interface MediaStreamLike {
  getTracks: () => Array<MediaTrackLike>;
  getAudioTracks: () => Array<MediaTrackLike>;
  getVideoTracks: () => Array<MediaTrackLike>;
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

if (Platform.OS !== "web") {
  try {
    RTC = require("@livekit/react-native-webrtc") as typeof RTC;
  } catch {
    // react-native-webrtc not available
  }
}

const DEFAULT_ICE_SERVERS: Array<IceServerConfig> = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const HEARTBEAT_INTERVAL_MS = 10_000;
const SIGNAL_ACK_DEBOUNCE_MS = 500;

interface IceServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

interface UseWebRTCOptions {
  callId: Id<"calls"> | null;
  isInitiator: boolean;
  isVideo: boolean;
  enabled: boolean;
}

export function useWebRTC({
  callId,
  isInitiator,
  isVideo,
  enabled,
}: UseWebRTCOptions) {
  const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState("new");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideo);
  const [setupComplete, setSetupComplete] = useState(false);
  const [iceServers, setIceServers] = useState<Array<IceServerConfig>>(DEFAULT_ICE_SERVERS);
  const [iceServersLoaded, setIceServersLoaded] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  const peerConnectionRef = useRef<RTCPeerConnectionLike | null>(null);
  const localStreamRef = useRef<MediaStreamLike | null>(null);
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const hasHandledOfferRef = useRef(false);
  const pendingCandidatesRef = useRef<Array<unknown>>([]);
  const setupDoneRef = useRef(false);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAckIdsRef = useRef<Array<Id<"callSignaling">>>([]);

  const sendSignal = useMutation(api.calls.sendSignal);
  const heartbeat = useMutation(api.calls.heartbeat);
  const ackSignals = useMutation(api.calls.ackSignals);
  const getIceServers = useAction(api.callActions.getIceServers);
  const signals = useQuery(
    api.calls.getSignals,
    callId && enabled ? { callId } : "skip",
  );

  // Fetch TURN/STUN config from server on mount
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    getIceServers({})
      .then((servers) => {
        if (cancelled) return;
        // Filter out servers with invalid URLs (e.g. placeholder env vars)
        const valid = servers.filter(
          (s: IceServerConfig) =>
            s.urls.startsWith("stun:") ||
            s.urls.startsWith("turn:") ||
            s.urls.startsWith("turns:"),
        );

        const hasTurn = valid.some(
          (s: IceServerConfig) => s.urls.startsWith("turn:") || s.urls.startsWith("turns:"),
        );

        if (valid.length > 0) {
          console.log(
            `[WebRTC] Loaded ${valid.length} ICE servers (${hasTurn ? "with" : "WITHOUT"} TURN)`,
          );
          if (!hasTurn) {
            console.warn(
              "[WebRTC] ⚠️ No TURN servers available! Calls will fail on cellular/NAT networks.",
            );
          }
          setIceServers(valid);
        } else {
          console.warn("[WebRTC] No valid ICE servers from backend, using STUN-only defaults");
        }
        setIceServersLoaded(true);
      })
      .catch((error) => {
        console.warn("[WebRTC] Failed to fetch ICE servers, using STUN-only defaults:", error);
        if (!cancelled) setIceServersLoaded(true);
      });

    return () => { cancelled = true; };
  }, [enabled, getIceServers]);

  // Debounced signal acknowledgment — batches deletes to reduce mutations
  const flushAcks = useCallback(() => {
    if (pendingAckIdsRef.current.length === 0) return;
    const ids = [...pendingAckIdsRef.current];
    pendingAckIdsRef.current = [];
    ackSignals({ signalIds: ids }).catch(() => {});
  }, [ackSignals]);

  const scheduleAck = useCallback(
    (signalId: Id<"callSignaling">) => {
      pendingAckIdsRef.current.push(signalId);
      if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
      ackTimerRef.current = setTimeout(flushAcks, SIGNAL_ACK_DEBOUNCE_MS);
    },
    [flushAcks],
  );

  // Heartbeat
  useEffect(() => {
    if (!enabled || !callId) return;

    heartbeat({ callId }).catch(() => {});
    const interval = setInterval(() => {
      heartbeat({ callId }).catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [callId, enabled, heartbeat]);

  // Reset setup state when callId changes so a new call can initialize
  useEffect(() => {
    setupDoneRef.current = false;
    hasHandledOfferRef.current = false;
    processedSignalIdsRef.current.clear();
    pendingCandidatesRef.current = [];
  }, [callId]);

  // Setup peer connection — wait for ICE servers to be ready
  useEffect(() => {
    if (!enabled || !callId || !RTC || setupDoneRef.current || !iceServersLoaded) return;
    setupDoneRef.current = true;

    let cancelled = false;
    const rtc = RTC; // capture for closure

    (async () => {
      try {
        // ── Request media permissions and get stream ──
        console.log(
          `[WebRTC] Requesting media: audio=true, video=${isVideo}, role=${isInitiator ? "initiator" : "receiver"}`,
        );
        let stream: MediaStreamLike | null = null;
        try {
          // Keep constraints minimal — fixed high-res constraints make getUserMedia
          // hard-fail on some devices. Let WebRTC negotiate the resolution.
          stream = await rtc.mediaDevices.getUserMedia({
            audio: true,
            video: isVideo ? { facingMode: "user" } : false,
          });
        } catch (mediaError: unknown) {
          const msg = mediaError instanceof Error ? mediaError.message : String(mediaError);
          console.error("[WebRTC] getUserMedia failed:", msg);
          // Fallback: retry with the simplest possible video request before giving up
          if (isVideo) {
            try {
              stream = await rtc.mediaDevices.getUserMedia({ audio: true, video: true });
              console.log("[WebRTC] getUserMedia succeeded on video fallback");
            } catch (retryError) {
              console.error("[WebRTC] getUserMedia video fallback failed:", retryError);
            }
          }
        }

        if (!stream) {
          // Show a user-friendly alert on native
          if (Platform.OS !== "web") {
            Alert.alert(
              "Berechtigung benötigt",
              isVideo
                ? "Bitte erlaube Zugriff auf Kamera und Mikrofon in den Einstellungen, um Videoanrufe zu nutzen."
                : "Bitte erlaube Zugriff auf das Mikrofon in den Einstellungen, um Anrufe zu nutzen.",
            );
          }
          setConnectionState("failed");
          return;
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStreamUrl(stream.toURL());
        console.log(
          `[WebRTC] Local stream acquired: ${stream.getAudioTracks().length} audio, ${stream.getVideoTracks().length} video tracks`,
        );

        // ── Create PeerConnection ──
        console.log(
          `[WebRTC] Creating PeerConnection with ${iceServers.length} ICE servers`,
        );
        const peerConnection = new rtc.RTCPeerConnection({
          iceServers,
        });
        peerConnectionRef.current = peerConnection;

        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });

        peerConnection.ontrack = (event) => {
          console.log("[WebRTC] 🎧 Remote track received");
          if (event.streams?.[0]) {
            setRemoteStreamUrl(event.streams[0].toURL());
          }
        };

        peerConnection.onicecandidate = (event) => {
          if (!event.candidate || !callId) return;

          sendSignal({
            callId,
            type: "ice-candidate",
            payload: JSON.stringify(event.candidate),
          }).catch((err) => {
            console.warn("[WebRTC] Failed to send ICE candidate:", err);
          });
        };

        peerConnection.onconnectionstatechange = () => {
          const state = peerConnection.connectionState ?? "new";
          console.log("[WebRTC] connectionState:", state);
          setConnectionState(state);
        };

        peerConnection.oniceconnectionstatechange = () => {
          const iceState = peerConnection.iceConnectionState;
          console.log(
            `[WebRTC] iceConnectionState: ${iceState}, signalingState: ${peerConnection.signalingState ?? "unknown"}`,
          );
          if (
            iceState === "connected" ||
            iceState === "completed"
          ) {
            setConnectionState("connected");
          } else if (iceState === "failed") {
            console.error(
              "[WebRTC] ❌ ICE connection failed — TURN servers may be unreachable or missing",
            );
            setConnectionState("failed");
          } else if (iceState === "disconnected") {
            console.warn(
              "[WebRTC] ICE disconnected — peer may have lost network temporarily",
            );
          }
        };

        // ── Initiator creates Offer ──
        if (isInitiator) {
          console.log("[WebRTC] Creating offer (initiator)");
          const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: isVideo,
          });
          await peerConnection.setLocalDescription(offer);
          console.log("[WebRTC] Offer set as localDescription, sending via signaling");
          await sendSignal({
            callId,
            type: "offer",
            payload: JSON.stringify(offer),
          });
        } else {
          console.log("[WebRTC] Waiting for offer (receiver)");
        }

        if (!cancelled) {
          setSetupComplete(true);
        }
      } catch (error) {
        console.error("[WebRTC] Setup error:", error);
        setConnectionState("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [callId, enabled, isInitiator, isVideo, sendSignal, iceServers, iceServersLoaded]);

  // Process incoming signals & acknowledge them
  useEffect(() => {
    if (!signals || !peerConnectionRef.current || !setupComplete || !RTC) return;

    const peerConnection = peerConnectionRef.current;
    const rtc = RTC;

    (async () => {
      for (const signal of signals) {
        if (processedSignalIdsRef.current.has(signal._id)) continue;
        processedSignalIdsRef.current.add(signal._id);

        try {
          if (signal.type === "offer" && !isInitiator && !hasHandledOfferRef.current) {
            hasHandledOfferRef.current = true;
            const offer = JSON.parse(signal.payload);
            console.log("[WebRTC] ⬇️ Received offer, setting remoteDescription");
            await peerConnection.setRemoteDescription(
              new rtc.RTCSessionDescription(offer),
            );

            // Drain pending ICE candidates now that remote description is set
            if (pendingCandidatesRef.current.length > 0) {
              console.log(
                `[WebRTC] Adding ${pendingCandidatesRef.current.length} queued ICE candidates`,
              );
              for (const candidate of pendingCandidatesRef.current) {
                await peerConnection.addIceCandidate(new rtc.RTCIceCandidate(candidate));
              }
              pendingCandidatesRef.current = [];
            }

            console.log("[WebRTC] Creating answer");
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            console.log("[WebRTC] ⬆️ Sending answer via signaling");
            if (callId) {
              await sendSignal({
                callId,
                type: "answer",
                payload: JSON.stringify(answer),
              });
            }
          }

          if (signal.type === "answer" && isInitiator) {
            const answer = JSON.parse(signal.payload);
            console.log("[WebRTC] ⬇️ Received answer, setting remoteDescription");
            await peerConnection.setRemoteDescription(
              new rtc.RTCSessionDescription(answer),
            );

            // Drain pending ICE candidates
            if (pendingCandidatesRef.current.length > 0) {
              console.log(
                `[WebRTC] Adding ${pendingCandidatesRef.current.length} queued ICE candidates`,
              );
              for (const candidate of pendingCandidatesRef.current) {
                await peerConnection.addIceCandidate(new rtc.RTCIceCandidate(candidate));
              }
              pendingCandidatesRef.current = [];
            }
          }

          if (signal.type === "ice-candidate") {
            const candidate = JSON.parse(signal.payload);
            if (peerConnection.remoteDescription) {
              await peerConnection.addIceCandidate(new rtc.RTCIceCandidate(candidate));
            } else {
              pendingCandidatesRef.current.push(candidate);
              console.log(
                `[WebRTC] Queued ICE candidate (no remoteDescription yet), total queued: ${pendingCandidatesRef.current.length}`,
              );
            }
          }

          // Acknowledge this signal for deletion from the DB
          scheduleAck(signal._id);
        } catch (error) {
          console.error("[WebRTC] Signal processing error:", signal.type, error);
          // Still ack failed signals to avoid re-processing them forever
          scheduleAck(signal._id);
        }
      }
    })();
  }, [callId, isInitiator, sendSignal, setupComplete, signals, scheduleAck]);

  const toggleMute = useCallback(() => {
    const audioTrack = localStreamRef.current?.getAudioTracks()?.[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    setIsMuted(!audioTrack.enabled);
  }, []);

  const toggleVideo = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks()?.[0];
    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    setIsVideoOff(!videoTrack.enabled);
  }, []);

  const flipCamera = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks()?.[0];
    videoTrack?._switchCamera?.();
    setIsFrontCamera((prev) => !prev);
  }, []);

  const cleanup = useCallback(() => {
    // Flush any pending signal acks before cleanup
    if (ackTimerRef.current) {
      clearTimeout(ackTimerRef.current);
      ackTimerRef.current = null;
    }
    flushAcks();

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    setLocalStreamUrl(null);
    setRemoteStreamUrl(null);
    setConnectionState("closed");
    processedSignalIdsRef.current.clear();
    hasHandledOfferRef.current = false;
    pendingCandidatesRef.current = [];
    setupDoneRef.current = false;
    setSetupComplete(false);
  }, [flushAcks]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    localStreamUrl,
    remoteStreamUrl,
    connectionState,
    isMuted,
    isVideoOff,
    isFrontCamera,
    toggleMute,
    toggleVideo,
    flipCamera,
    cleanup,
    isSupported: !!RTC,
    RTCView: (RTC?.RTCView as RTCViewComponent | null) ?? null,
  };
}
