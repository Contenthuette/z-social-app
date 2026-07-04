"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { AccessToken } from "livekit-server-sdk";

/**
 * Mint a LiveKit access token for a livestream room.
 * - Viewers get subscribe-only tokens.
 * - The host and co-streamers (livestream.streamerIds) get publish tokens.
 * Room name = livestream ID. Requires LIVEKIT_URL / LIVEKIT_API_KEY /
 * LIVEKIT_API_SECRET to be set as Convex environment variables.
 */
export const getStreamToken = action({
  args: { livestreamId: v.id("livestreams") },
  returns: v.object({
    token: v.string(),
    url: v.string(),
    canPublish: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ token: string; url: string; canPublish: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");

    const grant: {
      identity: string;
      name: string;
      roomName: string;
      canPublish: boolean;
    } | null = await ctx.runQuery(internal.livestreams.streamGrant, {
      authId: identity.subject,
      livestreamId: args.livestreamId,
    });
    if (!grant) throw new Error("Kein Zugriff auf diesen Livestream.");

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit ist nicht konfiguriert (LIVEKIT_API_KEY / LIVEKIT_API_SECRET fehlen).");
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: grant.identity,
      name: grant.name,
    });
    at.addGrant({
      roomJoin: true,
      room: grant.roomName,
      canPublish: grant.canPublish,
      canSubscribe: true,
    });
    // Annotate explicitly so the `any` from the (sandbox-uninstalled) livekit
    // module can't leak into this action's public return type and poison the
    // generated api types for the rest of the app.
    const token: string = await at.toJwt();
    const url: string = process.env.LIVEKIT_URL ?? "";
    const canPublish: boolean = Boolean(grant.canPublish);

    return { token, url, canPublish };
  },
});
