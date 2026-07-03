import React, { useCallback, useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { router } from "expo-router";
import { IncomingCallOverlay } from "./IncomingCallOverlay";
import { MinimizedCallBanner } from "./MinimizedCallBanner";
import { CallContext } from "@/lib/call-context";
import type { WebRTCState } from "@/lib/call-context";
import { useWebRTC } from "@/lib/useWebRTC";

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const incomingCall = useQuery(
    api.calls.getIncomingCall,
    isAuthenticated ? {} : "skip"
  );
  const answerCall = useMutation(api.calls.answerCall);
  const declineCall = useMutation(api.calls.declineCall);

  const [minimizedCallId, setMinimizedCallId] = useState<Id<"calls"> | null>(null);

  // WebRTC session state - persists across screen navigation
  const [activeCallId, setActiveCallId] = useState<Id<"calls"> | null>(null);
  const [rtcConfig, setRtcConfig] = useState<{
    callId: Id<"calls">;
    isInitiator: boolean;
    isVideo: boolean;
  } | null>(null);

  const webrtc = useWebRTC({
    callId: rtcConfig?.callId ?? null,
    isInitiator: rtcConfig?.isInitiator ?? false,
    isVideo: rtcConfig?.isVideo ?? false,
    enabled: rtcConfig !== null,
  });

  const startWebRTC = useCallback((callId: Id<"calls">, isInitiator: boolean, isVideo: boolean) => {
    // Only start if not already running for this call
    if (rtcConfig?.callId === callId) return;
    setActiveCallId(callId);
    setRtcConfig({ callId, isInitiator, isVideo });
  }, [rtcConfig?.callId]);

  const stopWebRTC = useCallback(() => {
    webrtc.cleanup();
    setActiveCallId(null);
    setRtcConfig(null);
  }, [webrtc]);

  const minimizeCall = useCallback((callId: Id<"calls">) => {
    setMinimizedCallId(callId);
  }, []);

  const expandCall = useCallback(() => {
    setMinimizedCallId(null);
  }, []);

  // Clear minimized state when the call we're tracking ends
  const minimizedCall = useQuery(
    api.calls.getCallDetails,
    isAuthenticated && minimizedCallId ? { callId: minimizedCallId } : "skip"
  );

  useEffect(() => {
    if (isAuthenticated) return;
    setMinimizedCallId(null);
    stopWebRTC();
  }, [isAuthenticated, stopWebRTC]);

  useEffect(() => {
    if (
      minimizedCallId &&
      minimizedCall &&
      (minimizedCall.status === "ended" ||
        minimizedCall.status === "declined" ||
        minimizedCall.status === "missed")
    ) {
      setMinimizedCallId(null);
      // Also stop WebRTC if it was running for this call
      if (activeCallId === minimizedCallId) {
        stopWebRTC();
      }
    }
  }, [minimizedCallId, minimizedCall, activeCallId, stopWebRTC]);

  // Also monitor active call state to auto-cleanup ended calls
  const activeCallDetails = useQuery(
    api.calls.getCallDetails,
    isAuthenticated && activeCallId && activeCallId !== minimizedCallId
      ? { callId: activeCallId }
      : "skip"
  );

  useEffect(() => {
    if (
      activeCallId &&
      activeCallDetails &&
      (activeCallDetails.status === "ended" ||
        activeCallDetails.status === "declined" ||
        activeCallDetails.status === "missed")
    ) {
      stopWebRTC();
    }
  }, [activeCallId, activeCallDetails, stopWebRTC]);

  const handleAccept = useCallback(async () => {
    if (!incomingCall) return;
    try {
      await answerCall({ callId: incomingCall._id });
      setMinimizedCallId(null);
      if (incomingCall.groupId) {
        // Group calls use the mesh-based group call screen
        router.push({
          pathname: "/(main)/group-call" as "/",
          params: { id: incomingCall._id },
        });
      } else {
        router.push({
          pathname: "/(main)/call" as "/",
          params: { id: incomingCall._id },
        });
      }
    } catch (e) {
      console.error("Failed to answer call", e);
    }
  }, [incomingCall, answerCall]);

  const handleDecline = useCallback(async () => {
    if (!incomingCall) return;
    try {
      await declineCall({ callId: incomingCall._id });
    } catch (e) {
      console.error("Failed to decline call", e);
    }
  }, [incomingCall, declineCall]);

  const webrtcState: WebRTCState | null = rtcConfig ? webrtc : null;

  return (
    <CallContext.Provider value={{
      minimizedCallId,
      minimizeCall,
      expandCall,
      activeCallId,
      webrtc: webrtcState,
      startWebRTC,
      stopWebRTC,
    }}>
      <View style={styles.root}>
        {children}
        {minimizedCallId && (
          <MinimizedCallBanner callId={minimizedCallId} />
        )}
        {incomingCall && (
          <IncomingCallOverlay
            callerName={incomingCall.callerName}
            callerAvatarUrl={incomingCall.callerAvatarUrl}
            callType={incomingCall.type}
            groupName={incomingCall.groupName}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        )}
      </View>
    </CallContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
