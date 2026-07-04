import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";
import { authQuery, authMutation } from "./functions";
import type { Id, Doc } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { rateLimiter, INPUT_LIMITS, validateStringLength, sanitizeText } from "./rateLimit";

const MAX_PARTICIPANTS = 2;
// LiveKit group streaming: host + up to 3 co-streamers publish into one room
const MAX_STREAMERS = 4;
const MAX_VIEWERS_PER_STREAM = 50;
const COMMENTS_PAGE_SIZE = 40;
const SIGNAL_FETCH_LIMIT = 100;

// Auto-cleanup thresholds (backend-only stale detection, no client heartbeat).
// A stream with zero viewers and no activity for this long is treated as abandoned.
const STALE_NO_VIEWER_MS = 2 * 60 * 1000; // 2 minutes
// Hard safety cap: end any stream still "live" after this long, regardless of viewers.
const MAX_LIVESTREAM_MS = 3 * 60 * 60 * 1000; // 3 hours

type DbReader = QueryCtx["db"] | MutationCtx["db"];

async function resolveUserId(
  ctx: { db: DbReader; user: { _id: string } },
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", ctx.user._id))
    .unique();
  return user?._id ?? null;
}

async function requireUserId(
  ctx: { db: DbReader; user: { _id: string } },
): Promise<Id<"users">> {
  const userId = await resolveUserId(ctx);
  if (!userId) throw new Error("User not found");
  return userId;
}

/**
 * Whether the given user may see/watch a stream that belongs to a group.
 * Public groups → everyone. Private groups (request/invite_only) → active members only.
 * Streams without a group are always public.
 */
async function canViewGroupStream(
  ctx: { db: DbReader },
  groupId: Id<"groups"> | undefined,
  myUserId: Id<"users"> | null,
): Promise<boolean> {
  if (!groupId) return true;
  const group = await ctx.db.get(groupId);
  if (!group) return false;
  if (group.visibility === "public") return true;
  if (!myUserId) return false;
  const membership = await ctx.db
    .query("groupMembers")
    .withIndex("by_groupId_and_userId", (q) =>
      q.eq("groupId", groupId).eq("userId", myUserId),
    )
    .unique();
  return membership?.status === "active";
}

/** Bump the stream's activity timestamp (keeps it out of the stale-cleanup window). */
async function touchLivestream(
  ctx: { db: MutationCtx["db"] },
  livestreamId: Id<"livestreams">,
): Promise<void> {
  await ctx.db.patch(livestreamId, { lastActivityAt: Date.now() });
}

/** Mark a stream ended and remove its viewers, signals and pending join requests. */
async function finalizeStream(
  ctx: { db: MutationCtx["db"] },
  stream: Doc<"livestreams">,
): Promise<void> {
  if (stream.status !== "ended") {
    await ctx.db.patch(stream._id, {
      status: "ended",
      endedAt: Date.now(),
      coHostId: undefined,
      coHostName: undefined,
      coHostAvatarUrl: undefined,
      streamerIds: undefined,
      participantCount: 0,
    });
  }

  const viewers = await ctx.db
    .query("livestreamViewers")
    .withIndex("by_livestreamId", (q) => q.eq("livestreamId", stream._id))
    .collect();
  for (const viewer of viewers) await ctx.db.delete(viewer._id);

  const signals = await ctx.db
    .query("livestreamSignaling")
    .withIndex("by_livestreamId_and_recipientId", (q) =>
      q.eq("livestreamId", stream._id),
    )
    .collect();
  for (const signal of signals) await ctx.db.delete(signal._id);

  const requests = await ctx.db
    .query("livestreamJoinRequests")
    .withIndex("by_livestreamId_and_status", (q) =>
      q.eq("livestreamId", stream._id).eq("status", "pending"),
    )
    .collect();
  for (const req of requests) await ctx.db.delete(req._id);
}

// ── Queries ──────────────────────────────────────────────────────

/** List all currently-live streams */
export const listActive = authQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("livestreams"),
      groupId: v.optional(v.id("groups")),
      groupName: v.optional(v.string()),
      hostId: v.id("users"),
      hostName: v.string(),
      hostAvatarUrl: v.optional(v.string()),
      coHostId: v.optional(v.id("users")),
      coHostName: v.optional(v.string()),
      coHostAvatarUrl: v.optional(v.string()),
      title: v.string(),
      participantCount: v.number(),
      viewerCount: v.number(),
      startedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const myUserId = await resolveUserId(ctx);
    const allStreams = await ctx.db
      .query("livestreams")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .order("desc")
      .take(20);

    // Hide private-group streams from non-members
    const visibility = await Promise.all(
      allStreams.map((s) => canViewGroupStream(ctx, s.groupId, myUserId)),
    );
    const streams = allStreams.filter((_, i) => visibility[i]);

    return streams.map((s) => ({
      _id: s._id,
      groupId: s.groupId,
      groupName: s.groupName,
      hostId: s.hostId,
      hostName: s.hostName,
      hostAvatarUrl: s.hostAvatarUrl,
      coHostId: s.coHostId,
      coHostName: s.coHostName,
      coHostAvatarUrl: s.coHostAvatarUrl,
      title: s.title,
      participantCount: s.participantCount,
      viewerCount: s.viewerCount,
      startedAt: s.startedAt,
    }));
  },
});

/** Return Set of group IDs that currently have a live stream */
export const liveGroupIds = authQuery({
  args: {},
  returns: v.array(v.id("groups")),
  handler: async (ctx) => {
    const myUserId = await resolveUserId(ctx);
    const streams = await ctx.db
      .query("livestreams")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .take(50);
    const groupStreams = streams.filter(
      (s): s is Doc<"livestreams"> & { groupId: Id<"groups"> } => s.groupId !== undefined,
    );
    const visibility = await Promise.all(
      groupStreams.map((s) => canViewGroupStream(ctx, s.groupId, myUserId)),
    );
    const ids = new Set(
      groupStreams.filter((_, i) => visibility[i]).map((s) => s.groupId),
    );
    return [...ids];
  },
});

/** Get a single livestream by ID */
export const getById = query({
  args: { livestreamId: v.id("livestreams") },
  returns: v.union(
    v.object({
      _id: v.id("livestreams"),
      groupId: v.optional(v.id("groups")),
      groupName: v.optional(v.string()),
      hostId: v.id("users"),
      hostName: v.string(),
      hostAvatarUrl: v.optional(v.string()),
      coHostId: v.optional(v.id("users")),
      coHostName: v.optional(v.string()),
      coHostAvatarUrl: v.optional(v.string()),
      streamerIds: v.optional(v.array(v.id("users"))),
      streamerCount: v.number(),
      title: v.string(),
      status: v.union(v.literal("live"), v.literal("ended")),
      participantCount: v.number(),
      viewerCount: v.number(),
      peakViewerCount: v.number(),
      startedAt: v.number(),
      endedAt: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const stream = await ctx.db.get(args.livestreamId);
    if (!stream) return null;
    return {
      _id: stream._id,
      groupId: stream.groupId,
      groupName: stream.groupName,
      hostId: stream.hostId,
      hostName: stream.hostName,
      hostAvatarUrl: stream.hostAvatarUrl,
      coHostId: stream.coHostId,
      coHostName: stream.coHostName,
      coHostAvatarUrl: stream.coHostAvatarUrl,
      streamerIds: stream.streamerIds,
      streamerCount: (stream.streamerIds ?? [stream.hostId]).length,
      title: stream.title,
      status: stream.status,
      participantCount: stream.participantCount,
      viewerCount: stream.viewerCount,
      peakViewerCount: stream.peakViewerCount,
      startedAt: stream.startedAt,
      endedAt: stream.endedAt,
    };
  },
});

/** Get active livestream for a specific group */
export const getActiveForGroup = query({
  args: { groupId: v.id("groups") },
  returns: v.union(
    v.object({
      _id: v.id("livestreams"),
      hostId: v.id("users"),
      hostName: v.string(),
      hostAvatarUrl: v.optional(v.string()),
      coHostId: v.optional(v.id("users")),
      coHostName: v.optional(v.string()),
      coHostAvatarUrl: v.optional(v.string()),
      streamerIds: v.optional(v.array(v.id("users"))),
      streamerCount: v.number(),
      title: v.string(),
      participantCount: v.number(),
      viewerCount: v.number(),
      startedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const stream = await ctx.db
      .query("livestreams")
      .withIndex("by_groupId_and_status", (q) =>
        q.eq("groupId", args.groupId).eq("status", "live"),
      )
      .first();
    if (!stream) return null;
    return {
      _id: stream._id,
      hostId: stream.hostId,
      hostName: stream.hostName,
      hostAvatarUrl: stream.hostAvatarUrl,
      coHostId: stream.coHostId,
      coHostName: stream.coHostName,
      coHostAvatarUrl: stream.coHostAvatarUrl,
      streamerIds: stream.streamerIds,
      streamerCount: (stream.streamerIds ?? [stream.hostId]).length,
      title: stream.title,
      participantCount: stream.participantCount,
      viewerCount: stream.viewerCount,
      startedAt: stream.startedAt,
    };
  },
});

/**
 * LiveKit access grant for a livestream room (called from the livekit node action).
 * Returns null when the stream isn't live or the user may not view it.
 */
export const streamGrant = internalQuery({
  args: {
    authId: v.string(),
    livestreamId: v.id("livestreams"),
  },
  returns: v.union(
    v.object({
      identity: v.string(),
      name: v.string(),
      roomName: v.string(),
      canPublish: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    // auth subject may be "authId|sessionId" — keep only the authId part
    const authId = args.authId.split("|")[0]?.trim();
    if (!authId) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();
    if (!user) return null;

    const stream = await ctx.db.get(args.livestreamId);
    if (!stream || stream.status !== "live") return null;

    // Private-group streams: only active members may join the room
    if (!(await canViewGroupStream(ctx, stream.groupId, user._id))) return null;

    const canPublish =
      stream.hostId === user._id ||
      (stream.streamerIds ?? []).includes(user._id);

    return {
      identity: String(user._id),
      name: user.name,
      roomName: String(args.livestreamId),
      canPublish,
    };
  },
});

/** Get viewers for a livestream */
export const getViewers = authQuery({
  args: { livestreamId: v.id("livestreams") },
  returns: v.array(
    v.object({
      _id: v.id("livestreamViewers"),
      userId: v.id("users"),
      userName: v.string(),
      userAvatarUrl: v.optional(v.string()),
      joinedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const viewers = await ctx.db
      .query("livestreamViewers")
      .withIndex("by_livestreamId", (q) => q.eq("livestreamId", args.livestreamId))
      .take(MAX_VIEWERS_PER_STREAM);

    return viewers.map((v_) => ({
      _id: v_._id,
      userId: v_.userId,
      userName: v_.userName,
      userAvatarUrl: v_.userAvatarUrl,
      joinedAt: v_.joinedAt,
    }));
  },
});

/** Get recent comments for a livestream */
export const getComments = query({
  args: { livestreamId: v.id("livestreams") },
  returns: v.array(
    v.object({
      _id: v.id("livestreamComments"),
      userId: v.id("users"),
      userName: v.string(),
      userAvatarUrl: v.optional(v.string()),
      text: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("livestreamComments")
      .withIndex("by_livestreamId_and_createdAt", (q) =>
        q.eq("livestreamId", args.livestreamId),
      )
      .order("desc")
      .take(COMMENTS_PAGE_SIZE);

    return comments.reverse().map((c) => ({
      _id: c._id,
      userId: c.userId,
      userName: c.userName,
      userAvatarUrl: c.userAvatarUrl,
      text: c.text,
      createdAt: c.createdAt,
    }));
  },
});

/** Get signaling messages for the current user in a livestream */
export const getSignals = authQuery({
  args: { livestreamId: v.id("livestreams") },
  returns: v.array(
    v.object({
      _id: v.id("livestreamSignaling"),
      senderId: v.id("users"),
      type: v.union(
        v.literal("offer"),
        v.literal("answer"),
        v.literal("ice-candidate"),
      ),
      payload: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx);
    if (!userId) return [];

    const signals = await ctx.db
      .query("livestreamSignaling")
      .withIndex("by_livestreamId_and_recipientId", (q) =>
        q.eq("livestreamId", args.livestreamId).eq("recipientId", userId),
      )
      .take(SIGNAL_FETCH_LIMIT);

    return signals.map((s) => ({
      _id: s._id,
      senderId: s.senderId,
      type: s.type,
      payload: s.payload,
    }));
  },
});

// ── Mutations ────────────────────────────────────────────────────

/** Start a livestream */
export const goLive = authMutation({
  args: {
    groupId: v.optional(v.id("groups")),
    title: v.string(),
  },
  returns: v.id("livestreams"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await rateLimiter.limit(ctx, "goLive", { key: userId });

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    let groupName: string | undefined;
    if (args.groupId) {
      const group = await ctx.db.get(args.groupId);
      groupName = group?.name;
    }

    // A host can only have one live stream at a time. Auto-end any leftover
    // streams they never explicitly closed (prevents duplicate/zombie streams).
    const existing = await ctx.db
      .query("livestreams")
      .withIndex("by_hostId_and_status", (q) =>
        q.eq("hostId", userId).eq("status", "live"),
      )
      .collect();
    for (const old of existing) await finalizeStream(ctx, old);

    const now = Date.now();
    return await ctx.db.insert("livestreams", {
      groupId: args.groupId,
      groupName,
      hostId: userId,
      hostName: user.name,
      hostAvatarUrl: user.avatarUrl,
      streamerIds: [userId],
      title: args.title,
      status: "live",
      participantCount: 1,
      viewerCount: 0,
      peakViewerCount: 0,
      startedAt: now,
      lastActivityAt: now,
    });
  },
});

/** Join a livestream as a live participant (max 2) */
export const joinAsParticipant = authMutation({
  args: { livestreamId: v.id("livestreams") },
  returns: v.union(v.literal("joined"), v.literal("full")),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const stream = await ctx.db.get(args.livestreamId);
    if (!stream) throw new Error("Livestream not found");
    if (stream.status !== "live") throw new Error("Dieser Livestream ist beendet.");

    // Already a participant?
    if (stream.hostId === userId || stream.coHostId === userId) {
      return "joined" as const;
    }

    // Check if slot is free
    if (stream.participantCount >= MAX_PARTICIPANTS) {
      return "full" as const;
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(args.livestreamId, {
      coHostId: userId,
      coHostName: user.name,
      coHostAvatarUrl: user.avatarUrl,
      participantCount: 2,
    });

    // Remove from viewers if they were watching
    const viewerDoc = await ctx.db
      .query("livestreamViewers")
      .withIndex("by_livestreamId_and_userId", (q) =>
        q.eq("livestreamId", args.livestreamId).eq("userId", userId),
      )
      .unique();
    if (viewerDoc) {
      await ctx.db.delete(viewerDoc._id);
      await ctx.db.patch(args.livestreamId, {
        viewerCount: Math.max(0, stream.viewerCount - 1),
      });
    }

    return "joined" as const;
  },
});

/** Leave the livestream as a participant (coHost leaves, stream continues) */
export const leaveAsParticipant = authMutation({
  args: { livestreamId: v.id("livestreams") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const stream = await ctx.db.get(args.livestreamId);
    if (!stream || stream.status !== "live") return null;

    if (stream.coHostId === userId) {
      // CoHost leaves -> clear coHost slot
      await ctx.db.patch(args.livestreamId, {
        coHostId: undefined,
        coHostName: undefined,
        coHostAvatarUrl: undefined,
        participantCount: 1,
      });

      // Clean up their signals
      const sigs = await ctx.db
        .query("livestreamSignaling")
        .withIndex("by_livestreamId_and_recipientId", (q) =>
          q.eq("livestreamId", args.livestreamId).eq("recipientId", userId),
        )
        .collect();
      for (const s of sigs) await ctx.db.delete(s._id);
    }

    return null;
  },
});

/** Join a group livestream as a co-streamer (LiveKit, max 4 publishers) */
export const joinAsStreamer = authMutation({
  args: { livestreamId: v.id("livestreams") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const stream = await ctx.db.get(args.livestreamId);
    if (!stream) throw new Error("Livestream not found");
    if (stream.status !== "live") throw new Error("Dieser Livestream ist beendet.");

    // Private-group streams: only active members may stream along
    if (!(await canViewGroupStream(ctx, stream.groupId, userId))) {
      throw new Error("Dieser Livestream ist nur für Gruppenmitglieder sichtbar.");
    }

    const streamers = stream.streamerIds ?? [stream.hostId];
    if (streamers.includes(userId)) return null;
    if (streamers.length >= MAX_STREAMERS) throw new Error("Maximal 4 Streamer");

    await ctx.db.patch(args.livestreamId, {
      streamerIds: [...streamers, userId],
      participantCount: stream.participantCount + 1,
      lastActivityAt: Date.now(),
    });
    return null;
  },
});

/** Stop co-streaming (back to viewer). The host cannot leave — they end the stream. */
export const leaveAsStreamer = authMutation({
  args: { livestreamId: v.id("livestreams") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const stream = await ctx.db.get(args.livestreamId);
    if (!stream || stream.status !== "live") return null;
    if (stream.hostId === userId) return null; // host ends the stream instead

    const streamers = stream.streamerIds ?? [stream.hostId];
    if (!streamers.includes(userId)) return null;

    await ctx.db.patch(args.livestreamId, {
      streamerIds: streamers.filter((id) => id !== userId),
      participantCount: Math.max(1, stream.participantCount - 1),
      lastActivityAt: Date.now(),
    });
    return null;
  },
});

/** End a livestream (only host can end) */
export const endStream = authMutation({
  args: { livestreamId: v.id("livestreams") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const stream = await ctx.db.get(args.livestreamId);
    if (!stream) throw new Error("Livestream not found");
    if (stream.hostId !== userId) throw new Error("Nur der Host kann den Stream beenden.");
    if (stream.status === "ended") return null;

    await finalizeStream(ctx, stream);
    return null;
  },
});

/** Join a livestream as a viewer (watch only) */
export const joinStream = authMutation({
  args: { livestreamId: v.id("livestreams") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const stream = await ctx.db.get(args.livestreamId);
    if (!stream) throw new Error("Livestream not found");
    if (stream.status !== "live") throw new Error("Dieser Livestream ist beendet.");

    // Private-group streams: only active members may watch
    if (!(await canViewGroupStream(ctx, stream.groupId, userId))) {
      throw new Error("Dieser Livestream ist nur für Gruppenmitglieder sichtbar.");
    }

    // Don't add participants as viewers
    if (stream.hostId === userId || stream.coHostId === userId) return null;

    const existing = await ctx.db
      .query("livestreamViewers")
      .withIndex("by_livestreamId_and_userId", (q) =>
        q.eq("livestreamId", args.livestreamId).eq("userId", userId),
      )
      .unique();
    if (existing) return null;

    if (stream.viewerCount >= MAX_VIEWERS_PER_STREAM) {
      throw new Error("Der Livestream ist voll.");
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    await ctx.db.insert("livestreamViewers", {
      livestreamId: args.livestreamId,
      userId,
      userName: user.name,
      userAvatarUrl: user.avatarUrl,
      joinedAt: Date.now(),
    });

    const newCount = stream.viewerCount + 1;
    await ctx.db.patch(args.livestreamId, {
      viewerCount: newCount,
      peakViewerCount: Math.max(stream.peakViewerCount, newCount),
      lastActivityAt: Date.now(),
    });

    return null;
  },
});

/** Leave a livestream (viewer) */
export const leaveStream = authMutation({
  args: { livestreamId: v.id("livestreams") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const stream = await ctx.db.get(args.livestreamId);

    const viewer = await ctx.db
      .query("livestreamViewers")
      .withIndex("by_livestreamId_and_userId", (q) =>
        q.eq("livestreamId", args.livestreamId).eq("userId", userId),
      )
      .unique();
    if (viewer) await ctx.db.delete(viewer._id);

    if (stream && stream.status === "live" && viewer) {
      await ctx.db.patch(args.livestreamId, {
        viewerCount: Math.max(0, stream.viewerCount - 1),
      });
    }

    // Clean up user's signals
    const sigs = await ctx.db
      .query("livestreamSignaling")
      .withIndex("by_livestreamId_and_recipientId", (q) =>
        q.eq("livestreamId", args.livestreamId).eq("recipientId", userId),
      )
      .collect();
    for (const s of sigs) await ctx.db.delete(s._id);

    return null;
  },
});

/** Send a comment */
export const sendComment = authMutation({
  args: {
    livestreamId: v.id("livestreams"),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await rateLimiter.limit(ctx, "livestreamComment", { key: userId });

    const stream = await ctx.db.get(args.livestreamId);
    if (!stream || stream.status !== "live") {
      throw new Error("Livestream ist nicht aktiv.");
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const trimmed = sanitizeText(args.text).slice(0, INPUT_LIMITS.livestreamComment);
    if (trimmed.length === 0) return null;

    await ctx.db.insert("livestreamComments", {
      livestreamId: args.livestreamId,
      userId,
      userName: user.name,
      userAvatarUrl: user.avatarUrl,
      text: trimmed,
      createdAt: Date.now(),
    });

    await touchLivestream(ctx, args.livestreamId);
    return null;
  },
});

/** Send a WebRTC signaling message */
export const sendSignal = authMutation({
  args: {
    livestreamId: v.id("livestreams"),
    recipientId: v.id("users"),
    type: v.union(v.literal("offer"), v.literal("answer"), v.literal("ice-candidate")),
    payload: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    // No rate limiting on WebRTC signaling – ICE candidates arrive in rapid
    // bursts during connection setup and rate-limiter writes cause OCC conflicts.

    await ctx.db.insert("livestreamSignaling", {
      livestreamId: args.livestreamId,
      senderId: userId,
      recipientId: args.recipientId,
      type: args.type,
      payload: args.payload,
    });

    return null;
  },
});

/** Acknowledge / delete processed signals */
export const ackSignals = authMutation({
  args: { signalIds: v.array(v.id("livestreamSignaling")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.signalIds.length > 100) throw new Error("Maximal 100 Signals gleichzeitig");
    for (const id of args.signalIds) {
      const doc = await ctx.db.get(id);
      if (doc) await ctx.db.delete(id);
    }
    return null;
  },
});

// ── Join Requests ──────────────────────────────────────────────────

/** Request to join a livestream as participant */
export const requestJoin = authMutation({
  args: { livestreamId: v.id("livestreams") },
  returns: v.union(v.literal("requested"), v.literal("already_requested"), v.literal("full")),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const stream = await ctx.db.get(args.livestreamId);
    if (!stream || stream.status !== "live") throw new Error("Livestream ist nicht aktiv.");
    if (stream.participantCount >= MAX_PARTICIPANTS) return "full" as const;

    const existing = await ctx.db
      .query("livestreamJoinRequests")
      .withIndex("by_livestreamId_and_userId", (q) =>
        q.eq("livestreamId", args.livestreamId).eq("userId", userId),
      )
      .first();
    if (existing && existing.status === "pending") return "already_requested" as const;
    if (existing) await ctx.db.delete(existing._id);

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    await ctx.db.insert("livestreamJoinRequests", {
      livestreamId: args.livestreamId,
      userId,
      userName: user.name,
      userAvatarUrl: user.avatarUrl,
      status: "pending",
      createdAt: Date.now(),
    });
    return "requested" as const;
  },
});

/** Get pending join requests (host only) */
export const getJoinRequests = authQuery({
  args: { livestreamId: v.id("livestreams") },
  returns: v.array(
    v.object({
      _id: v.id("livestreamJoinRequests"),
      userId: v.id("users"),
      userName: v.string(),
      userAvatarUrl: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx);
    if (!userId) return [];
    const stream = await ctx.db.get(args.livestreamId);
    if (!stream || stream.hostId !== userId) return [];

    const requests = await ctx.db
      .query("livestreamJoinRequests")
      .withIndex("by_livestreamId_and_status", (q) =>
        q.eq("livestreamId", args.livestreamId).eq("status", "pending"),
      )
      .take(10);

    return requests.map((r) => ({
      _id: r._id,
      userId: r.userId,
      userName: r.userName,
      userAvatarUrl: r.userAvatarUrl,
      createdAt: r.createdAt,
    }));
  },
});

/** Accept or reject a join request (host only) */
export const respondToJoinRequest = authMutation({
  args: {
    requestId: v.id("livestreamJoinRequests"),
    accept: v.boolean(),
  },
  returns: v.union(v.literal("accepted"), v.literal("rejected"), v.literal("full")),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Anfrage nicht gefunden.");

    const stream = await ctx.db.get(request.livestreamId);
    if (!stream || stream.hostId !== userId) throw new Error("Nur der Host kann Anfragen beantworten.");

    if (!args.accept) {
      await ctx.db.patch(args.requestId, { status: "rejected" });
      return "rejected" as const;
    }

    if (stream.participantCount >= MAX_PARTICIPANTS) {
      await ctx.db.patch(args.requestId, { status: "rejected" });
      return "full" as const;
    }

    const requester = await ctx.db.get(request.userId);
    if (!requester) throw new Error("User nicht gefunden.");

    await ctx.db.patch(args.requestId, { status: "accepted" });
    await ctx.db.patch(request.livestreamId, {
      coHostId: request.userId,
      coHostName: requester.name,
      coHostAvatarUrl: requester.avatarUrl,
      participantCount: 2,
    });

    // Remove from viewers if they were watching
    const viewerDoc = await ctx.db
      .query("livestreamViewers")
      .withIndex("by_livestreamId_and_userId", (q) =>
        q.eq("livestreamId", request.livestreamId).eq("userId", request.userId),
      )
      .unique();
    if (viewerDoc) {
      await ctx.db.delete(viewerDoc._id);
      await ctx.db.patch(request.livestreamId, {
        viewerCount: Math.max(0, stream.viewerCount - 1),
      });
    }

    return "accepted" as const;
  },
});

/** Check my join request status */
export const getMyJoinRequestStatus = authQuery({
  args: { livestreamId: v.id("livestreams") },
  returns: v.union(v.literal("none"), v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx);
    if (!userId) return "none";
    const request = await ctx.db
      .query("livestreamJoinRequests")
      .withIndex("by_livestreamId_and_userId", (q) =>
        q.eq("livestreamId", args.livestreamId).eq("userId", userId),
      )
      .first();
    return request?.status ?? "none";
  },
});

// ── Maintenance ────────────────────────────────────────────────────

/**
 * Cron: end stale / abandoned livestreams (backend-only stale detection).
 * - Ends streams with zero viewers and no activity for STALE_NO_VIEWER_MS.
 * - Ends any stream still "live" past MAX_LIVESTREAM_MS (hard safety cap).
 * Streams that currently have viewers are never ended here.
 */
export const cleanupStaleLivestreams = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const live = await ctx.db
      .query("livestreams")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .take(200);

    for (const s of live) {
      const lastActive = s.lastActivityAt ?? s.startedAt;
      const noViewerStale = s.viewerCount <= 0 && now - lastActive > STALE_NO_VIEWER_MS;
      const hardExpired = now - s.startedAt > MAX_LIVESTREAM_MS;
      if (noViewerStale || hardExpired) {
        await finalizeStream(ctx, s);
      }
    }
    return null;
  },
});
