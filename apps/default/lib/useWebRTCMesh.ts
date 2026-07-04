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

interface UseWebRTCMeshOptions {
  callId: Id<"calls"> | null;
  myUserId: Id<"users"> | null;
  isVideo: boolean;
  enabled: boolean;
  /** The OTHER connected participants (exclude self), from getCallDetails */
  peerUserIds: Array<Id<"users">>;
}

export function useWebRTCMesh({
  callId,
  myUserId,
  isVideo,
  enabled,
  peerUserIds,
}: UseWebRTCMeshOptions) {
  const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, string>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideo);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [iceServers, setIceServers] = useState<Array<IceServerConfig>>(DEFAULT_ICE_SERVERS);
  const [iceServersLoaded, setIceServersLoaded] = useState(false);
  const [localMediaReady, setLocalMediaReady] = useState(false);

  const localStreamRef = useRef<MediaStreamLike | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnectionLike>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, Array<unknown>>>(new Map());
  const offeredPeersRef = useRef<Set<string>>(new Set());
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const mediaSetupDoneRef = useRef(false);
  const iceServersRef = useRef<Array<IceServerConfig>>(DEFAULT_ICE_SERVERS);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAckIdsRef = useRef<Array<Id<"callSignaling">>>([]);

  const sendSignal = useMutation(api.calls.sendSignal);
  const heartbeat = useMutation(api.calls.heartbeat);
  const ackSignals = useMutation(api.calls.ackSignals);
  const toggleMuteMutation = useMutation(api.calls.toggleMute);
  const toggleVideoMutation = useMutation(api.calls.toggleVideo);
  const getIceServers = useAction(api.callActions.getIceServers);
  const signals = useQuery(
    api.calls.getSignals,
    callId && enabled ? { callId } : "skip",
  );

  useEffect(() => {
    iceServersRef.current = iceServers;
  }, [iceServers]);

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
            `[WebRTC-Mesh] Loaded ${valid.length} ICE servers (${hasTurn ? "with" : "WITHOUT"} TURN)`,
          );
          if (!hasTurn) {
            console.warn(
              "[WebRTC-Mesh] ⚠️ No TURN servers available! Calls will fail on cellular/NAT networks.",
            );
          }
          setIceServers(valid);
        } else {
          console.warn("[WebRTC-Mesh] No valid ICE servers from backend, using STUN-only defaults");
        }
        setIceServersLoaded(true);
      })
      .catch((error) => {
        console.warn("[WebRTC-Mesh] Failed to fetch ICE servers, using STUN-only defaults:", error);
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

  const closePeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch {
        // ignore
      }
      peersRef.current.delete(peerId);
    }
    pendingCandidatesRef.current.delete(peerId);
    offeredPeersRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const closeAllPeers = useCallback(() => {
    for (const peerId of [...peersRef.current.keys()]) {
      closePeer(peerId);
    }
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    offeredPeersRef.current.clear();
    setRemoteStreams({});
  }, [closePeer]);

  // Reset per-call state when callId changes so a new call can initialize
  useEffect(() => {
    processedSignalIdsRef.current.clear();
    pendingCandidatesRef.current.clear();
    offeredPeersRef.current.clear();
    closeAllPeers();
  }, [callId, closeAllPeers]);

  // Acquire local media ONCE
  useEffect(() => {
    if (!enabled || !callId || !RTC || mediaSetupDoneRef.current) return;
    mediaSetupDoneRef.current = true;

    let cancelled = false;
    const rtc = RTC; // capture for closure

    (async () => {
      try {
        console.log(`[WebRTC-Mesh] Requesting media: audio=true, video=${isVideo}`);
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
          console.error("[WebRTC-Mesh] getUserMedia failed:", msg);
          // Fallback: retry with the simplest possible video request before giving up
          if (isVideo) {
            try {
              stream = await rtc.mediaDevices.getUserMedia({ audio: true, video: true });
              console.log("[WebRTC-Mesh] getUserMedia succeeded on video fallback");
            } catch (retryError) {
              console.error("[WebRTC-Mesh] getUserMedia video fallback failed:", retryError);
            }
          }
        }

        if (!stream) {
          if (Platform.OS !== "web") {
            Alert.alert(
              "Berechtigung benötigt",
              isVideo
                ? "Bitte erlaube Zugriff auf Kamera und Mikrofon in den Einstellungen, um Videoanrufe zu nutzen."
                : "Bitte erlaube Zugriff auf das Mikrofon in den Einstellungen, um Anrufe zu nutzen.",
            );
          }
          return;
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStreamUrl(stream.toURL());
        setLocalMediaReady(true);
        console.log(
          `[WebRTC-Mesh] Local stream acquired: ${stream.getAudioTracks().length} audio, ${stream.getVideoTracks().length} video tracks`,
        );
      } catch (error) {
        console.error("[WebRTC-Mesh] Media setup error:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [callId, enabled, isVideo]);

  // Get-or-create the peer connection for a given peer user id
  const ensurePeer = useCallback(
    (peerId: string): RTCPeerConnectionLike | null => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;
      if (!RTC || !callId) return null;

      const rtc = RTC;
      console.log(`[WebRTC-Mesh] Creating PeerConnection for ${peerId}`);
      const peerConnection = new rtc.RTCPeerConnection({
        iceServers: iceServersRef.current,
      });

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });
      }

      peerConnection.ontrack = (event) => {
        console.log(`[WebRTC-Mesh] 🎧 Remote track received from ${peerId}`);
        const remote = event.streams?.[0];
        if (remote) {
          const url = remote.toURL();
          setRemoteStreams((prev) => ({ ...prev, [peerId]: url }));
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate || !callId) return;

        sendSignal({
          callId,
          type: "ice-candidate",
          payload: JSON.stringify(event.candidate),
          toUserId: peerId as Id<"users">,
        }).catch((err) => {
          console.warn(`[WebRTC-Mesh] Failed to send ICE candidate to ${peerId}:`, err);
        });
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log(
          `[WebRTC-Mesh] [${peerId}] iceConnectionState: ${peerConnection.iceConnectionState ?? "unknown"}`,
        );
      };

      peersRef.current.set(peerId, peerConnection);
      return peerConnection;
    },
    [callId, sendSignal],
  );

  // Reconcile peer connections with the current participant list
  const peersKey = peerUserIds.join(",");
  useEffect(() => {
    if (!enabled || !callId || !RTC || !myUserId) return;
    if (!localMediaReady || !iceServersLoaded) return;

    const currentIds = new Set(peerUserIds.map((peerId) => String(peerId)));

    // Remove peers that left the call
    for (const existingId of [...peersRef.current.keys()]) {
      if (!currentIds.has(existingId)) {
        console.log(`[WebRTC-Mesh] Peer ${existingId} left, closing connection`);
        closePeer(existingId);
      }
    }

    // Connect to new peers. Deterministic offerer (glare avoidance): the side
    // whose userId string compares LESS creates the offer; the other answers.
    for (const peerId of peerUserIds) {
      const peerKey = String(peerId);
      const alreadyExists = peersRef.current.has(peerKey);
      const pc = ensurePeer(peerKey);
      if (!pc) continue;

      const iAmOfferer = String(myUserId) < peerKey;
      if (!iAmOfferer) continue; // wait for their offer
      if (alreadyExists && offeredPeersRef.current.has(peerKey)) continue;
      offeredPeersRef.current.add(peerKey);

      (async () => {
        try {
          console.log(`[WebRTC-Mesh] Creating offer for ${peerKey}`);
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: isVideo,
          });
          await pc.setLocalDescription(offer);
          await sendSignal({
            callId,
            type: "offer",
            payload: JSON.stringify(offer),
            toUserId: peerId,
          });
        } catch (error) {
          console.error(`[WebRTC-Mesh] Failed to create/send offer for ${peerKey}:`, error);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    peersKey,
    enabled,
    callId,
    myUserId,
    localMediaReady,
    iceServersLoaded,
    isVideo,
    ensurePeer,
    closePeer,
    sendSignal,
  ]);

  // Process incoming signals & acknowledge them
  useEffect(() => {
    if (!signals || !enabled || !callId || !RTC || !localMediaReady) return;

    const rtc = RTC;

    (async () => {
      for (const signal of signals) {
        if (processedSignalIdsRef.current.has(signal._id)) continue;
        processedSignalIdsRef.current.add(signal._id);

        const senderKey = String(signal.senderId);

        try {
          if (signal.type === "offer") {
            const pc = ensurePeer(senderKey);
            if (pc) {
              const offer = JSON.parse(signal.payload);
              console.log(`[WebRTC-Mesh] ⬇️ Received offer from ${senderKey}`);
              await pc.setRemoteDescription(new rtc.RTCSessionDescription(offer));

              // Drain pending ICE candidates now that remote description is set
              const queued = pendingCandidatesRef.current.get(senderKey) ?? [];
              if (queued.length > 0) {
                console.log(
                  `[WebRTC-Mesh] Adding ${queued.length} queued ICE candidates for ${senderKey}`,
                );
                for (const candidate of queued) {
                  await pc.addIceCandidate(new rtc.RTCIceCandidate(candidate));
                }
                pendingCandidatesRef.current.delete(senderKey);
              }

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              console.log(`[WebRTC-Mesh] ⬆️ Sending answer to ${senderKey}`);
              await sendSignal({
                callId,
                type: "answer",
                payload: JSON.stringify(answer),
                toUserId: signal.senderId,
              });
            }
          }

          if (signal.type === "answer") {
            const pc = peersRef.current.get(senderKey);
            if (pc) {
              const answer = JSON.parse(signal.payload);
              console.log(`[WebRTC-Mesh] ⬇️ Received answer from ${senderKey}`);
              await pc.setRemoteDescription(new rtc.RTCSessionDescription(answer));

              // Drain pending ICE candidates
              const queued = pendingCandidatesRef.current.get(senderKey) ?? [];
              if (queued.length > 0) {
                console.log(
                  `[WebRTC-Mesh] Adding ${queued.length} queued ICE candidates for ${senderKey}`,
                );
                for (const candidate of queued) {
                  await pc.addIceCandidate(new rtc.RTCIceCandidate(candidate));
                }
                pendingCandidatesRef.current.delete(senderKey);
              }
            }
          }

          if (signal.type === "ice-candidate") {
            const pc = peersRef.current.get(senderKey) ?? ensurePeer(senderKey);
            const candidate = JSON.parse(signal.payload);
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(new rtc.RTCIceCandidate(candidate));
            } else {
              const queue = pendingCandidatesRef.current.get(senderKey) ?? [];
              queue.push(candidate);
              pendingCandidatesRef.current.set(senderKey, queue);
              console.log(
                `[WebRTC-Mesh] Queued ICE candidate from ${senderKey} (no remoteDescription yet), total queued: ${queue.length}`,
              );
            }
          }

          // Acknowledge this signal for deletion from the DB
          scheduleAck(signal._id);
        } catch (error) {
          console.error("[WebRTC-Mesh] Signal processing error:", signal.type, error);
          // Still ack failed signals to avoid re-processing them forever
          scheduleAck(signal._id);
        }
      }
    })();
  }, [callId, enabled, ensurePeer, localMediaReady, scheduleAck, sendSignal, signals]);

  const toggleMute = useCallback(() => {
    const audioTrack = localStreamRef.current?.getAudioTracks()?.[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    setIsMuted(!audioTrack.enabled);
    if (callId) toggleMuteMutation({ callId }).catch(() => {});
  }, [callId, toggleMuteMutation]);

  const toggleVideo = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks()?.[0];
    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    setIsVideoOff(!videoTrack.enabled);
    if (callId) toggleVideoMutation({ callId }).catch(() => {});
  }, [callId, toggleVideoMutation]);

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
    closeAllPeers();
    setLocalStreamUrl(null);
    setLocalMediaReady(false);
    processedSignalIdsRef.current.clear();
    mediaSetupDoneRef.current = false;
  }, [closeAllPeers, flushAcks]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    localStreamUrl,
    remoteStreams,
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
