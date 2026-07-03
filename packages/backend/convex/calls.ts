import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { authQuery, authMutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { rateLimiter } from "./rateLimit";
import { isBlockedBetween } from "./users";

const MAX_GROUP_CALL_PARTICIPANTS = 8;
const CALL_RING_TIMEOUT_MS = 45_000;
const CALL_HEARTBEAT_STALE_MS = 35_000;
const CALL_CLEANUP_BATCH_SIZE = 50;
const SIGNAL_FETCH_LIMIT = 150;

type DbReader = QueryCtx["db"] | MutationCtx["db"];

type CallReaderCtx = {
  db: DbReader;
  user: { _id: string };
};

type CallParticipantDoc = Doc<"callParticipants">;
type CallDoc = Doc<"calls">;

async function resolveUserId(
  ctx: CallReaderCtx,
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", ctx.user._id))
    .unique();

  return user?._id ?? null;
}

async function getParticipantByCallAndUser(
  ctx: { db: DbReader },
  callId: Id<"calls">,
  userId: Id<"users">,
): Promise<CallParticipantDoc | null> {
  return await ctx.db
    .query("callParticipants")
    .withIndex("by_callId_and_userId", (q) =>
      q.eq("callId", callId).eq("userId", userId),
    )
    .unique();
}

async function getParticipantsForCall(
  ctx: { db: DbReader },
  callId: Id<"calls">,
): Promise<Array<CallParticipantDoc>> {
  return await ctx.db
    .query("callParticipants")
    .withIndex("by_callId", (q) => q.eq("callId", callId))
    .collect();
}

async function assertUserAvailableForCall(
  ctx: { db: MutationCtx["db"] },
  userId: Id<"users">,
  currentCallId?: Id<"calls">,
): Promise<void> {
  const [ringingParticipants, connectedParticipants] = await Promise.all([
    ctx.db
      .query("callParticipants")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", userId).eq("status", "ringing"),
      )
      .take(5),
    ctx.db
      .query("callParticipants")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", userId).eq("status", "connected"),
      )
      .take(5),
  ]);

  for (const participant of [...ringingParticipants, ...connectedParticipants]) {
    if (currentCallId && participant.callId === currentCallId) continue;

    // Check if the call is actually still active
    const call = await ctx.db.get(participant.callId);
    if (!call || call.status === "ended" || call.status === "declined" || call.status === "missed") {
      // Auto-clean stale participant so it doesn't block future calls
      await ctx.db.patch(participant._id, { status: "left", leftAt: Date.now() });
      continue;
    }

    throw new Error("User is already in another call");
  }
}

function getParticipantLastSeenAt(
  participant: CallParticipantDoc,
  call: CallDoc,
): number {
  return (
    participant.lastSeenAt ??
    participant.joinedAt ??
    call.answeredAt ??
    call.startedAt
  );
}

async function cleanupSignalsForCall(
  ctx: { db: MutationCtx["db"] },
  callId: Id<"calls">,
): Promise<void> {
  const signals = await ctx.db
    .query("callSignaling")
    .withIndex("by_callId", (q) => q.eq("callId", callId))
    .collect();

  await Promise.all(signals.map((signal) => ctx.db.delete(signal._id)));
}

async function finalizeCall(
  ctx: { db: MutationCtx["db"] },
  callId: Id<"calls">,
  status: "ended" | "declined" | "missed",
  endedAt: number,
): Promise<void> {
  const call = await ctx.db.get(callId);
  if (!call) return;
  if (call.status === "ended" || call.status === "declined" || call.status === "missed") {
    await cleanupSignalsForCall(ctx, callId);
    return;
  }

  await ctx.db.patch(callId, {
    status,
    endedAt,
  });

  const participants = await getParticipantsForCall(ctx, callId);
  await Promise.all(
    participants.map(async (participant) => {
      if (participant.status === "left") return;
      await ctx.db.patch(participant._id, {
        status: "left",
        leftAt: endedAt,
      });
    }),
  );

  await cleanupSignalsForCall(ctx, callId);
}

// ── initiate a 1:1 call ──────────────────────────────────────────────────────
export const initiateCall = authMutation({
  args: {
    receiverId: v.id("users"),
    conversationId: v.id("conversations"),
    type: v.union(v.literal("audio"), v.literal("video")),
  },
  returns: v.id("calls"),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "initiateCall", { key: ctx.user._id });

    const myId = await resolveUserId(ctx);
    if (!myId) throw new Error("User not found");
    if (myId === args.receiverId) throw new Error("You cannot call yourself");

    // Block check
    if (await isBlockedBetween(ctx, myId, args.receiverId)) {
      throw new Error("Anruf nicht möglich");
    }

    await Promise.all([
      assertUserAvailableForCall(ctx, myId),
      assertUserAvailableForCall(ctx, args.receiverId),
    ]);

    const [me, receiver] = await Promise.all([
      ctx.db.get(myId),
      ctx.db.get(args.receiverId),
    ]);
    if (!me) throw new Error("User not found");
    if (!receiver) throw new Error("Receiver not found");

    const [avatarUrl, receiverAvatarUrl] = await Promise.all([
      me.avatarStorageId ? ctx.storage.getUrl(me.avatarStorageId) : Promise.resolve(me.avatarUrl),
      receiver.avatarStorageId
        ? ctx.storage.getUrl(receiver.avatarStorageId)
        : Promise.resolve(receiver.avatarUrl),
    ]);

    const now = Date.now();
    const callId = await ctx.db.insert("calls", {
      type: args.type,
      status: "ringing",
      callerId: myId,
      callerName: me.name,
      callerAvatarUrl: avatarUrl ?? undefined,
      conversationId: args.conversationId,
      receiverId: args.receiverId,
      startedAt: now,
    });

    await Promise.all([
      ctx.db.insert("callParticipants", {
        callId,
        userId: myId,
        userName: me.name,
        userAvatarUrl: avatarUrl ?? undefined,
        status: "connected",
        isMuted: false,
        isVideoOff: args.type === "audio",
        joinedAt: now,
        lastSeenAt: now,
      }),
      ctx.db.insert("callParticipants", {
        callId,
        userId: args.receiverId,
        userName: receiver.name,
        userAvatarUrl: receiverAvatarUrl ?? undefined,
        status: "ringing",
        isMuted: false,
        isVideoOff: args.type === "audio",
        lastSeenAt: now,
      }),
      ctx.db.insert("notifications", {
        userId: args.receiverId,
        type: "call",
        title: args.type === "video" ? "Videoanruf" : "Anruf",
        body: `${me.name} ruft dich an`,
        referenceId: callId,
        isRead: false,
        createdAt: now,
      }),
    ]);

    // Push notification for incoming call
    await ctx.scheduler.runAfter(0, internal.pushNotifications.sendToUser, {
      userId: args.receiverId,
      title: args.type === "video" ? "Videoanruf" : "Eingehender Anruf",
      body: `${me.name} ruft dich an`,
      data: { type: "call", callId: String(callId) },
      category: "calls",
    });

    return callId;
  },
});

// ── initiate a group call ────────────────────────────────────────────────────
export const initiateGroupCall = authMutation({
  args: {
    groupId: v.id("groups"),
    type: v.union(v.literal("audio"), v.literal("video")),
  },
  returns: v.id("calls"),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "initiateCall", { key: `${ctx.user._id}:${args.groupId}` });

    const myId = await resolveUserId(ctx);
    if (!myId) throw new Error("User not found");

    await assertUserAvailableForCall(ctx, myId);

    const [me, group] = await Promise.all([
      ctx.db.get(myId),
      ctx.db.get(args.groupId),
    ]);
    if (!me) throw new Error("User not found");
    if (!group) throw new Error("Group not found");

    const membershipSample = await ctx.db
      .query("groupMembers")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .take(MAX_GROUP_CALL_PARTICIPANTS + 2);

    const activeMemberIds = membershipSample
      .filter((member) => member.status === "active")
      .map((member) => member.userId);

    if (!activeMemberIds.includes(myId)) {
      throw new Error("Only group members can start a group call");
    }
    if (activeMemberIds.length <= 1) {
      throw new Error("At least one other active member is required");
    }
    if (activeMemberIds.length > MAX_GROUP_CALL_PARTICIPANTS) {
      throw new Error(`Group calls are limited to ${MAX_GROUP_CALL_PARTICIPANTS} participants`);
    }

    // Filter out busy members instead of blocking the whole call
    const potentialRecipients = activeMemberIds.filter((userId) => userId !== myId);
    const availableRecipientIds: Array<Id<"users">> = [];
    for (const userId of potentialRecipients) {
      try {
        await assertUserAvailableForCall(ctx, userId);
        availableRecipientIds.push(userId);
      } catch {
        // User is busy, skip them
      }
    }

    if (availableRecipientIds.length === 0) {
      throw new Error("Kein Gruppenmitglied ist gerade erreichbar");
    }

    const avatarUrl = me.avatarStorageId
      ? await ctx.storage.getUrl(me.avatarStorageId)
      : me.avatarUrl;

    const recipientUsers = await Promise.all(
      availableRecipientIds.map((userId) => ctx.db.get(userId)),
    );
    const recipientAvatars = await Promise.all(
      recipientUsers.map((user) =>
        user?.avatarStorageId
          ? ctx.storage.getUrl(user.avatarStorageId)
          : Promise.resolve(user?.avatarUrl),
      ),
    );

    const now = Date.now();
    const callId = await ctx.db.insert("calls", {
      type: args.type,
      status: "ringing",
      callerId: myId,
      callerName: me.name,
      callerAvatarUrl: avatarUrl ?? undefined,
      groupId: args.groupId,
      groupName: group.name,
      startedAt: now,
    });

    await ctx.db.insert("callParticipants", {
      callId,
      userId: myId,
      userName: me.name,
      userAvatarUrl: avatarUrl ?? undefined,
      status: "connected",
      isMuted: false,
      isVideoOff: args.type === "audio",
      joinedAt: now,
      lastSeenAt: now,
    });

    await Promise.all(
      availableRecipientIds.map(async (recipientId, index) => {
        const recipient = recipientUsers[index];
        const recipientAvatarUrl = recipientAvatars[index];

        await Promise.all([
          ctx.db.insert("callParticipants", {
            callId,
            userId: recipientId,
            userName: recipient?.name ?? "Unbekannt",
            userAvatarUrl: recipientAvatarUrl ?? undefined,
            status: "ringing",
            isMuted: false,
            isVideoOff: args.type === "audio",
            lastSeenAt: now,
          }),
          ctx.db.insert("notifications", {
            userId: recipientId,
            type: "call",
            title: args.type === "video" ? "Gruppen-Videoanruf" : "Gruppenanruf",
            body: `${me.name} ruft in ${group.name} an`,
            referenceId: callId,
            isRead: false,
            createdAt: now,
          }),
          // Push notification for each group member
          ctx.scheduler.runAfter(0, internal.pushNotifications.sendToUser, {
            userId: recipientId,
            title: args.type === "video" ? "Gruppen-Videoanruf" : "Gruppenanruf",
            body: `${me.name} ruft in ${group.name} an`,
            data: { type: "call", callId: String(callId) },
            category: "groupCalls",
          }),
        ]);
      }),
    );

    return callId;
  },
});

// ── answer call ──────────────────────────────────────────────────────────────
export const answerCall = authMutation({
  args: { callId: v.id("calls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myId = await resolveUserId(ctx);
    if (!myId) throw new Error("User not found");

    await assertUserAvailableForCall(ctx, myId, args.callId);

    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    if (call.status === "ended" || call.status === "declined" || call.status === "missed") {
      throw new Error("Call is no longer available");
    }

    const participant = await getParticipantByCallAndUser(ctx, args.callId, myId);
    if (!participant) throw new Error("Call participant not found");

    const now = Date.now();
    await ctx.db.patch(participant._id, {
      status: "connected",
      joinedAt: participant.joinedAt ?? now,
      lastSeenAt: now,
    });

    if (call.status === "ringing") {
      await ctx.db.patch(args.callId, {
        status: "active",
        answeredAt: now,
      });
    }

    return null;
  },
});

// ── decline call ─────────────────────────────────────────────────────────────
export const declineCall = authMutation({
  args: { callId: v.id("calls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myId = await resolveUserId(ctx);
    if (!myId) throw new Error("User not found");

    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    const participant = await getParticipantByCallAndUser(ctx, args.callId, myId);
    if (participant) {
      await ctx.db.patch(participant._id, {
        status: "declined",
        leftAt: Date.now(),
      });
    }

    if (call.receiverId && call.status === "ringing") {
      await finalizeCall(ctx, args.callId, "declined", Date.now());
    }

    return null;
  },
});

// ── end call ─────────────────────────────────────────────────────────────────
export const endCall = authMutation({
  args: { callId: v.id("calls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myId = await resolveUserId(ctx);
    if (!myId) throw new Error("User not found");

    const call = await ctx.db.get(args.callId);
    if (!call) return null;
    if (call.status === "ended" || call.status === "declined" || call.status === "missed") {
      await cleanupSignalsForCall(ctx, args.callId);
      return null;
    }

    const participant = await getParticipantByCallAndUser(ctx, args.callId, myId);
    if (participant && participant.status === "connected") {
      await ctx.db.patch(participant._id, {
        status: "left",
        leftAt: Date.now(),
      });
    }

    const remaining = await getParticipantsForCall(ctx, args.callId);
    const stillConnected = remaining.filter((row) => row.status === "connected");

    if (stillConnected.length <= 1) {
      await finalizeCall(ctx, args.callId, "ended", Date.now());
    }

    return null;
  },
});

// ── keep active calls alive while client is mounted ──────────────────────────
export const heartbeat = authMutation({
  args: { callId: v.id("calls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "callHeartbeat", { key: `${ctx.user._id}:${args.callId}` });

    const myId = await resolveUserId(ctx);
    if (!myId) throw new Error("User not found");

    const call = await ctx.db.get(args.callId);
    if (!call) return null;
    if (call.status === "ended" || call.status === "declined" || call.status === "missed") {
      return null;
    }

    const participant = await getParticipantByCallAndUser(ctx, args.callId, myId);
    if (!participant) return null;

    await ctx.db.patch(participant._id, { lastSeenAt: Date.now() });
    return null;
  },
});

// ── toggle mute ──────────────────────────────────────────────────────────────
export const toggleMute = authMutation({
  args: { callId: v.id("calls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myId = await resolveUserId(ctx);
    if (!myId) throw new Error("User not found");

    const participant = await getParticipantByCallAndUser(ctx, args.callId, myId);
    if (participant) {
      await ctx.db.patch(participant._id, { isMuted: !participant.isMuted });
    }

    return null;
  },
});

// ── toggle video ─────────────────────────────────────────────────────────────
export const toggleVideo = authMutation({
  args: { callId: v.id("calls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myId = await resolveUserId(ctx);
    if (!myId) throw new Error("User not found");

    const participant = await getParticipantByCallAndUser(ctx, args.callId, myId);
    if (participant) {
      await ctx.db.patch(participant._id, { isVideoOff: !participant.isVideoOff });
    }

    return null;
  },
});

// ── get incoming calls for current user ──────────────────────────────────────
export const getIncomingCall = authQuery({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("calls"),
      type: v.union(v.literal("audio"), v.literal("video")),
      callerId: v.id("users"),
      callerName: v.string(),
      callerAvatarUrl: v.optional(v.string()),
      groupName: v.optional(v.string()),
      groupId: v.optional(v.id("groups")),
      startedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const myId = await resolveUserId(ctx);
    if (!myId) return null;

    const ringingParticipant = await ctx.db
      .query("callParticipants")
      .withIndex("by_userId_and_status", (q) =>
        q.eq("userId", myId).eq("status", "ringing"),
      )
      .first();

    if (!ringingParticipant) return null;

    const call = await ctx.db.get(ringingParticipant.callId);
    if (!call || (call.status !== "ringing" && call.status !== "active")) return null;

    return {
      _id: call._id,
      type: call.type,
      callerId: call.callerId,
      callerName: call.callerName,
      callerAvatarUrl: call.callerAvatarUrl,
      groupName: call.groupName,
      groupId: call.groupId,
      startedAt: call.startedAt,
    };
  },
});

// ── get active call details ──────────────────────────────────────────────────
export const getCallDetails = authQuery({
  args: { callId: v.id("calls") },
  returns: v.union(
    v.object({
      _id: v.id("calls"),
      type: v.union(v.literal("audio"), v.literal("video")),
      status: v.union(
        v.literal("ringing"),
        v.literal("active"),
        v.literal("ended"),
        v.literal("declined"),
        v.literal("missed"),
      ),
      callerId: v.id("users"),
      callerName: v.string(),
      callerAvatarUrl: v.optional(v.string()),
      groupName: v.optional(v.string()),
      groupId: v.optional(v.id("groups")),
      receiverId: v.optional(v.id("users")),
      startedAt: v.number(),
      answeredAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      participants: v.array(
        v.object({
          _id: v.id("callParticipants"),
          userId: v.id("users"),
          userName: v.string(),
          userAvatarUrl: v.optional(v.string()),
          status: v.union(
            v.literal("ringing"),
            v.literal("connected"),
            v.literal("declined"),
            v.literal("left"),
          ),
          isMuted: v.boolean(),
          isVideoOff: v.boolean(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;

    const participants = await getParticipantsForCall(ctx, args.callId);

    return {
      _id: call._id,
      type: call.type,
      status: call.status,
      callerId: call.callerId,
      callerName: call.callerName,
      callerAvatarUrl: call.callerAvatarUrl,
      groupName: call.groupName,
      groupId: call.groupId,
      receiverId: call.receiverId,
      startedAt: call.startedAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      participants: participants.map((participant) => ({
        _id: participant._id,
        userId: participant.userId,
        userName: participant.userName,
        userAvatarUrl: participant.userAvatarUrl,
        status: participant.status,
        isMuted: participant.isMuted,
        isVideoOff: participant.isVideoOff,
      })),
    };
  },
});

// ── get other user info for DM call ──────────────────────────────────────────
export const getConversationPartner = authQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      name: v.string(),
      avatarUrl: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const myId = await resolveUserId(ctx);
    if (!myId) return null;

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.type !== "direct" || !conversation.participantIds) {
      return null;
    }

    const otherId = conversation.participantIds.find((participantId) => participantId !== myId);
    if (!otherId) return null;

    const other = await ctx.db.get(otherId);
    if (!other) return null;

    const avatarUrl = other.avatarStorageId
      ? await ctx.storage.getUrl(other.avatarStorageId)
      : other.avatarUrl;

    return {
      _id: other._id,
      name: other.name,
      avatarUrl: avatarUrl ?? undefined,
    };
  },
});

// ── WebRTC signaling ─────────────────────────────────────────────────────────
export const sendSignal = authMutation({
  args: {
    callId: v.id("calls"),
    type: v.union(
      v.literal("offer"),
      v.literal("answer"),
      v.literal("ice-candidate"),
    ),
    payload: v.string(),
    toUserId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "sendSignal", { key: `${ctx.user._id}:${args.callId}` });

    const myId = await resolveUserId(ctx);
    if (!myId) throw new Error("User not found");

    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    if (call.status === "ended" || call.status === "declined" || call.status === "missed") {
      return null;
    }

    const senderParticipant = await getParticipantByCallAndUser(ctx, args.callId, myId);
    if (!senderParticipant) throw new Error("Call participant not found");
    if (senderParticipant.status === "declined" || senderParticipant.status === "left") {
      throw new Error("You are no longer part of this call");
    }

    // Targeted signaling (group/mesh calls): deliver to exactly one participant
    if (args.toUserId) {
      const targetParticipant = await getParticipantByCallAndUser(
        ctx,
        args.callId,
        args.toUserId,
      );
      if (
        !targetParticipant ||
        targetParticipant.userId === myId ||
        (targetParticipant.status !== "ringing" && targetParticipant.status !== "connected")
      ) {
        return null;
      }

      await ctx.db.insert("callSignaling", {
        callId: args.callId,
        senderId: myId,
        recipientId: args.toUserId,
        type: args.type,
        payload: args.payload,
      });

      return null;
    }

    const participants = await getParticipantsForCall(ctx, args.callId);
    const recipients = participants.filter(
      (participant) =>
        participant.userId !== myId &&
        (participant.status === "ringing" || participant.status === "connected"),
    );

    if (recipients.length === 0) return null;

    await Promise.all(
      recipients.map((recipient) =>
        ctx.db.insert("callSignaling", {
          callId: args.callId,
          senderId: myId,
          recipientId: recipient.userId,
          type: args.type,
          payload: args.payload,
        }),
      ),
    );

    return null;
  },
});

export const getSignals = authQuery({
  args: { callId: v.id("calls") },
  returns: v.array(
    v.object({
      _id: v.id("callSignaling"),
      _creationTime: v.number(),
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
    const myId = await resolveUserId(ctx);
    if (!myId) return [];

    const signals = await ctx.db
      .query("callSignaling")
      .withIndex("by_callId_and_recipientId", (q) =>
        q.eq("callId", args.callId).eq("recipientId", myId),
      )
      .order("asc")
      .take(SIGNAL_FETCH_LIMIT);

    return signals.map((signal) => ({
      _id: signal._id,
      _creationTime: signal._creationTime,
      senderId: signal.senderId,
      type: signal.type,
      payload: signal.payload,
    }));
  },
});

// ── acknowledge (delete) processed signals ───────────────────────────────────
export const ackSignals = authMutation({
  args: {
    signalIds: v.array(v.id("callSignaling")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myId = await resolveUserId(ctx);
    if (!myId) return null;

    // Delete each signal if it belongs to this user
    await Promise.all(
      args.signalIds.map(async (signalId) => {
        const signal = await ctx.db.get(signalId);
        if (signal && signal.recipientId === myId) {
          await ctx.db.delete(signalId);
        }
      }),
    );

    return null;
  },
});

// ── stale call cleanup ───────────────────────────────────────────────────────
export const cleanupStaleCalls = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();

    const staleRingingCalls = await ctx.db
      .query("calls")
      .withIndex("by_status_and_startedAt", (q) =>
        q.eq("status", "ringing").lt("startedAt", now - CALL_RING_TIMEOUT_MS),
      )
      .take(CALL_CLEANUP_BATCH_SIZE);

    for (const call of staleRingingCalls) {
      await finalizeCall(ctx, call._id, "missed", now);
    }

    const staleActiveCalls = await ctx.db
      .query("calls")
      .withIndex("by_status_and_startedAt", (q) =>
        q.eq("status", "active").lt("startedAt", now - CALL_HEARTBEAT_STALE_MS),
      )
      .take(CALL_CLEANUP_BATCH_SIZE);

    for (const call of staleActiveCalls) {
      const participants = await getParticipantsForCall(ctx, call._id);
      const staleConnectedParticipants = participants.filter(
        (participant) =>
          participant.status === "connected" &&
          getParticipantLastSeenAt(participant, call) < now - CALL_HEARTBEAT_STALE_MS,
      );

      if (staleConnectedParticipants.length > 0) {
        await Promise.all(
          staleConnectedParticipants.map((participant) =>
            ctx.db.patch(participant._id, {
              status: "left",
              leftAt: now,
            }),
          ),
        );
      }

      const refreshedParticipants = staleConnectedParticipants.length
        ? await getParticipantsForCall(ctx, call._id)
        : participants;

      const liveConnectedParticipants = refreshedParticipants.filter(
        (participant) =>
          participant.status === "connected" &&
          getParticipantLastSeenAt(participant, call) >= now - CALL_HEARTBEAT_STALE_MS,
      );

      if (liveConnectedParticipants.length <= 1) {
        await finalizeCall(ctx, call._id, "ended", now);
      }
    }

    return null;
  },
});

// ── cleanup stale participants (internal tool) ─────────────────────────────
export const cleanupStaleParticipants = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let cleaned = 0;
    for (const status of ["ringing", "connected"] as const) {
      const participants = await ctx.db
        .query("callParticipants")
        .withIndex("by_userId_and_status")
        .filter((q) => q.eq(q.field("status"), status))
        .take(200);
      for (const p of participants) {
        const call = await ctx.db.get(p.callId);
        if (!call || call.status === "ended" || call.status === "declined" || call.status === "missed") {
          await ctx.db.patch(p._id, { status: "left", leftAt: Date.now() });
          cleaned++;
        }
      }
    }
    return cleaned;
  },
});
