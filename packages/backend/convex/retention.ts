import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { hashBanEmail, isHashedBanEmail } from "./banHash";

const DAY_MS = 86_400_000;
const ACCOUNT_RETENTION_MS = 30 * DAY_MS;
const OPERATIONAL_RETENTION_MS = 14 * DAY_MS;
const NOTIFICATION_RETENTION_MS = 30 * DAY_MS;
const MODERATION_RETENTION_MS = 180 * DAY_MS;
const DELETED_USER_AUTH_ID = "system:deleted-user-placeholder";
const DELETED_USER_EMAIL = "deleted-user@z.local";
const DELETED_USER_NAME = "Gelöschtes Konto";
const MESSAGE_REMOVED_TEXT = "Nachricht von gelöschtem Konto entfernt";
const BATCH_SIZE = 50;

type DeleteReason = "self_service" | "admin" | "inactive_retention";

interface PersonalDataDeletionResult {
  email: string;
  name: string;
  stripeSubscriptionId?: string;
}

type WriteCtx = {
  db: MutationCtx["db"];
  storage: MutationCtx["storage"];
};

function inactiveCutoff(now: number): number {
  return now - ACCOUNT_RETENTION_MS;
}

async function getOrCreateDeletedUser(ctx: WriteCtx): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", DELETED_USER_AUTH_ID))
    .unique();
  if (existing) return existing._id;

  return await ctx.db.insert("users", {
    authId: DELETED_USER_AUTH_ID,
    email: DELETED_USER_EMAIL,
    name: DELETED_USER_NAME,
    searchText: DELETED_USER_NAME.toLowerCase(),
    role: "user",
    onboardingComplete: false,
    subscriptionStatus: "none",
    createdAt: Date.now(),
  });
}

async function deletePostCascade(ctx: WriteCtx, post: Doc<"posts">): Promise<void> {
  const [likes, comments, savedPosts] = await Promise.all([
    ctx.db
      .query("likes")
      .withIndex("by_postId", (q) => q.eq("postId", post._id))
      .collect(),
    ctx.db
      .query("comments")
      .withIndex("by_postId", (q) => q.eq("postId", post._id))
      .collect(),
    ctx.db
      .query("savedPosts")
      .withIndex("by_postId_and_userId", (q) => q.eq("postId", post._id))
      .collect(),
  ]);

  for (const like of likes) await ctx.db.delete(like._id);
  for (const comment of comments) {
    const commentLikes = await ctx.db
      .query("commentLikes")
      .withIndex("by_commentId", (q) => q.eq("commentId", comment._id))
      .collect();
    for (const commentLike of commentLikes) await ctx.db.delete(commentLike._id);
    await ctx.db.delete(comment._id);
  }
  for (const savedPost of savedPosts) await ctx.db.delete(savedPost._id);
  if (post.mediaStorageId) await ctx.storage.delete(post.mediaStorageId);
  if (post.thumbnailStorageId) await ctx.storage.delete(post.thumbnailStorageId);
  await ctx.db.delete(post._id);
}

async function deleteMessagesInConversation(ctx: WriteCtx, conversationId: Id<"conversations">): Promise<void> {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
    .collect();
  for (const message of messages) {
    if (message.mediaStorageId) await ctx.storage.delete(message.mediaStorageId);
    await ctx.db.delete(message._id);
  }
}

async function deleteMemberEventCascade(ctx: WriteCtx, event: Doc<"memberEvents">): Promise<void> {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_groupId", (q) => q.eq("groupId", event.groupId))
    .collect();
  for (const conversation of conversations) {
    await deleteMessagesInConversation(ctx, conversation._id);
    await ctx.db.delete(conversation._id);
  }

  const memberships = await ctx.db
    .query("groupMembers")
    .withIndex("by_groupId", (q) => q.eq("groupId", event.groupId))
    .collect();
  for (const membership of memberships) await ctx.db.delete(membership._id);

  const group = await ctx.db.get(event.groupId);
  if (group) {
    if (group.thumbnailStorageId) await ctx.storage.delete(group.thumbnailStorageId);
    await ctx.db.delete(group._id);
  }
  if (event.thumbnailStorageId) await ctx.storage.delete(event.thumbnailStorageId);
  if (event.videoStorageId) await ctx.storage.delete(event.videoStorageId);
  if (event.videoThumbnailStorageId) await ctx.storage.delete(event.videoThumbnailStorageId);
  await ctx.db.delete(event._id);
}

async function anonymizeMessagesForUser(
  ctx: WriteCtx,
  userId: Id<"users">,
  placeholderUserId: Id<"users">,
): Promise<void> {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_senderId", (q) => q.eq("senderId", userId))
    .collect();

  for (const message of messages) {
    if (message.mediaStorageId) await ctx.storage.delete(message.mediaStorageId);
    await ctx.db.patch(message._id, {
      senderId: placeholderUserId,
      type: "text",
      text: MESSAGE_REMOVED_TEXT,
      mediaStorageId: undefined,
      mediaUrl: undefined,
      mediaDuration: undefined,
      sharedPostId: undefined,
    });
  }
}

async function removeUserFromConversations(
  ctx: WriteCtx,
  userId: Id<"users">,
  placeholderUserId: Id<"users">,
): Promise<void> {
  const conversations = await ctx.db.query("conversations").take(5000);
  for (const conversation of conversations) {
    const participantIds = conversation.participantIds;
    if (!participantIds?.includes(userId)) continue;
    const nextParticipantIds = participantIds.map((participantId) =>
      participantId === userId ? placeholderUserId : participantId,
    );
    await ctx.db.patch(conversation._id, { participantIds: [...new Set(nextParticipantIds)] });
  }
}

async function deleteUserActivity(ctx: WriteCtx, userId: Id<"users">): Promise<void> {
  const [likes, savedPosts, comments, commentLikes, pollVotes] = await Promise.all([
    ctx.db.query("likes").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("savedPosts").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("comments").withIndex("by_authorId", (q) => q.eq("authorId", userId)).collect(),
    ctx.db.query("commentLikes").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("pollVotes").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
  ]);

  for (const like of likes) await ctx.db.delete(like._id);
  for (const savedPost of savedPosts) await ctx.db.delete(savedPost._id);
  for (const commentLike of commentLikes) await ctx.db.delete(commentLike._id);
  for (const pollVote of pollVotes) await ctx.db.delete(pollVote._id);
  for (const comment of comments) {
    const relatedLikes = await ctx.db
      .query("commentLikes")
      .withIndex("by_commentId", (q) => q.eq("commentId", comment._id))
      .collect();
    for (const relatedLike of relatedLikes) await ctx.db.delete(relatedLike._id);
    const post = await ctx.db.get(comment.postId);
    if (post && post.commentCount > 0) {
      await ctx.db.patch(post._id, { commentCount: post.commentCount - 1 });
    }
    await ctx.db.delete(comment._id);
  }
}

async function deleteGroupMemberships(ctx: WriteCtx, userId: Id<"users">): Promise<void> {
  const memberships = await ctx.db
    .query("groupMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const membership of memberships) {
    await ctx.db.delete(membership._id);
    const group = await ctx.db.get(membership.groupId);
    if (group && group.memberCount > 0) {
      await ctx.db.patch(group._id, { memberCount: group.memberCount - 1 });
    }
  }
}

async function deleteSocialEdges(ctx: WriteCtx, userId: Id<"users">): Promise<void> {
  const [sentRequests, receivedRequests, blockedByUser, blockingUser] = await Promise.all([
    ctx.db
      .query("friendRequests")
      .withIndex("by_senderId", (q) => q.eq("senderId", userId))
      .collect(),
    ctx.db
      .query("friendRequests")
      .withIndex("by_receiverId", (q) => q.eq("receiverId", userId))
      .collect(),
    ctx.db
      .query("blockedUsers")
      .withIndex("by_blockerId", (q) => q.eq("blockerId", userId))
      .collect(),
    ctx.db
      .query("blockedUsers")
      .withIndex("by_blockedId_and_blockerId", (q) => q.eq("blockedId", userId))
      .collect(),
  ]);

  for (const request of [...sentRequests, ...receivedRequests]) await ctx.db.delete(request._id);
  for (const blocked of [...blockedByUser, ...blockingUser]) await ctx.db.delete(blocked._id);
}

async function deleteUserTicketsAndNotifications(ctx: WriteCtx, userId: Id<"users">): Promise<void> {
  const [tickets, notifications, readStatuses, conversationSettings, eventAdmins] = await Promise.all([
    ctx.db.query("tickets").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("notifications").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("conversationReadStatus").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("conversationSettings").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("eventAdmins").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
  ]);

  for (const row of [...tickets, ...notifications, ...readStatuses, ...conversationSettings, ...eventAdmins]) {
    await ctx.db.delete(row._id);
  }

  const invitedEventAdmins = await ctx.db
    .query("eventAdmins")
    .withIndex("by_invitedBy", (q) => q.eq("invitedBy", userId))
    .collect();
  for (const invited of invitedEventAdmins) await ctx.db.delete(invited._id);
}

async function deleteUserCreatedContent(
  ctx: WriteCtx,
  userId: Id<"users">,
  placeholderUserId: Id<"users">,
): Promise<void> {
  const posts = await ctx.db
    .query("posts")
    .withIndex("by_authorId", (q) => q.eq("authorId", userId))
    .collect();
  for (const post of posts) await deletePostCascade(ctx, post);

  const memberEvents = await ctx.db
    .query("memberEvents")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", userId))
    .collect();
  for (const event of memberEvents) await deleteMemberEventCascade(ctx, event);

  const groups = await ctx.db
    .query("groups")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", userId))
    .collect();
  for (const group of groups) await ctx.db.patch(group._id, { creatorId: placeholderUserId });

  const events = await ctx.db
    .query("events")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", userId))
    .collect();
  for (const event of events) await ctx.db.patch(event._id, { creatorId: placeholderUserId });

  const polls = await ctx.db
    .query("polls")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", userId))
    .collect();
  for (const poll of polls) await ctx.db.delete(poll._id);
}

async function deleteCallFootprint(ctx: WriteCtx, userId: Id<"users">): Promise<void> {
  const statuses = ["ringing", "active", "ended", "declined", "missed"] as const;
  const callsById = new Map<Id<"calls">, Doc<"calls">>();
  for (const status of statuses) {
    const [callerCalls, receiverCalls] = await Promise.all([
      ctx.db
        .query("calls")
        .withIndex("by_callerId_and_status", (q) => q.eq("callerId", userId).eq("status", status))
        .collect(),
      ctx.db
        .query("calls")
        .withIndex("by_receiverId_and_status", (q) => q.eq("receiverId", userId).eq("status", status))
        .collect(),
    ]);
    for (const call of [...callerCalls, ...receiverCalls]) callsById.set(call._id, call);
  }

  for (const call of callsById.values()) await deleteCallCascade(ctx, call);

  const participantStatuses = ["ringing", "connected", "declined", "left"] as const;
  for (const status of participantStatuses) {
    const participants = await ctx.db
      .query("callParticipants")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", status))
      .collect();
    for (const participant of participants) {
      const call = await ctx.db.get(participant.callId);
      if (call) await deleteCallCascade(ctx, call);
      else await ctx.db.delete(participant._id);
    }
  }
}

async function deleteCallCascade(ctx: WriteCtx, call: Doc<"calls">): Promise<void> {
  const [participants, signals] = await Promise.all([
    ctx.db.query("callParticipants").withIndex("by_callId", (q) => q.eq("callId", call._id)).collect(),
    ctx.db.query("callSignaling").withIndex("by_callId", (q) => q.eq("callId", call._id)).collect(),
  ]);
  for (const participant of participants) await ctx.db.delete(participant._id);
  for (const signal of signals) await ctx.db.delete(signal._id);
  await ctx.db.delete(call._id);
}

async function deleteLivestreamFootprint(ctx: WriteCtx, userId: Id<"users">): Promise<void> {
  const [hosted, coHosted, viewers, comments, joinRequests, sentSignals, receivedSignals] = await Promise.all([
    ctx.db.query("livestreams").withIndex("by_hostId", (q) => q.eq("hostId", userId)).collect(),
    ctx.db.query("livestreams").withIndex("by_coHostId", (q) => q.eq("coHostId", userId)).collect(),
    ctx.db.query("livestreamViewers").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("livestreamComments").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("livestreamJoinRequests").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("livestreamSignaling").withIndex("by_senderId", (q) => q.eq("senderId", userId)).collect(),
    ctx.db.query("livestreamSignaling").withIndex("by_recipientId", (q) => q.eq("recipientId", userId)).collect(),
  ]);

  for (const livestream of [...hosted, ...coHosted]) await deleteLivestreamCascade(ctx, livestream);
  for (const row of [...viewers, ...comments, ...joinRequests, ...sentSignals, ...receivedSignals]) {
    await ctx.db.delete(row._id);
  }
}

async function deleteLivestreamCascade(ctx: WriteCtx, livestream: Doc<"livestreams">): Promise<void> {
  const [viewers, comments, joinRequests, signals] = await Promise.all([
    ctx.db
      .query("livestreamViewers")
      .withIndex("by_livestreamId", (q) => q.eq("livestreamId", livestream._id))
      .collect(),
    ctx.db
      .query("livestreamComments")
      .withIndex("by_livestreamId_and_createdAt", (q) => q.eq("livestreamId", livestream._id))
      .collect(),
    ctx.db
      .query("livestreamJoinRequests")
      .withIndex("by_livestreamId_and_status", (q) => q.eq("livestreamId", livestream._id))
      .collect(),
    ctx.db
      .query("livestreamSignaling")
      .withIndex("by_livestreamId", (q) => q.eq("livestreamId", livestream._id))
      .collect(),
  ]);

  for (const row of [...viewers, ...comments, ...joinRequests, ...signals]) await ctx.db.delete(row._id);
  await ctx.db.delete(livestream._id);
}

export async function deleteUserPersonalData(
  ctx: WriteCtx,
  user: Doc<"users">,
  reason: DeleteReason,
): Promise<PersonalDataDeletionResult> {
  if (user.authId === DELETED_USER_AUTH_ID) {
    throw new Error("Das technische Platzhalterkonto kann nicht gelöscht werden");
  }

  const placeholderUserId = await getOrCreateDeletedUser(ctx);
  const result: PersonalDataDeletionResult = {
    email: user.email,
    name: user.name,
    stripeSubscriptionId: user.stripeSubscriptionId,
  };

  await anonymizeMessagesForUser(ctx, user._id, placeholderUserId);
  await removeUserFromConversations(ctx, user._id, placeholderUserId);
  await deleteUserCreatedContent(ctx, user._id, placeholderUserId);
  await deleteUserActivity(ctx, user._id);
  await deleteGroupMemberships(ctx, user._id);
  await deleteSocialEdges(ctx, user._id);
  await deleteUserTicketsAndNotifications(ctx, user._id);
  await deleteCallFootprint(ctx, user._id);
  await deleteLivestreamFootprint(ctx, user._id);

  const reports = await ctx.db
    .query("reports")
    .withIndex("by_reporterId", (q) => q.eq("reporterId", user._id))
    .collect();
  for (const report of reports) {
    await ctx.db.patch(report._id, {
      reporterId: placeholderUserId,
      reason: `${report.reason}\n\n[Reporter nach Kontolöschung anonymisiert: ${reason}]`,
    });
  }

  if (user.avatarStorageId) await ctx.storage.delete(user.avatarStorageId);
  if (user.bannerStorageId) await ctx.storage.delete(user.bannerStorageId);
  await ctx.db.delete(user._id);

  return result;
}

export const cleanupInactiveAccounts = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), cutoff: v.number() }),
  handler: async (ctx) => {
    const cutoff = inactiveCutoff(Date.now());
    const users = await ctx.db
      .query("users")
      .withIndex("by_lastActiveAt", (q) => q.lt("lastActiveAt", cutoff))
      .take(5);

    let deleted = 0;
    for (const user of users) {
      if (user.role === "admin" || user.authId === DELETED_USER_AUTH_ID) continue;
      await deleteUserPersonalData(ctx, user, "inactive_retention");
      deleted += 1;
    }
    return { deleted, cutoff };
  },
});

export const cleanupOldNotifications = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - NOTIFICATION_RETENTION_MS;
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(BATCH_SIZE);
    for (const notification of notifications) await ctx.db.delete(notification._id);
    return notifications.length;
  },
});

export const cleanupOldOperationalData = internalMutation({
  args: {},
  returns: v.object({ calls: v.number(), livestreams: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - OPERATIONAL_RETENTION_MS;
    let callsDeleted = 0;
    let livestreamsCleaned = 0;

    for (const status of ["ended", "declined", "missed"] as const) {
      const calls = await ctx.db
        .query("calls")
        .withIndex("by_status_and_startedAt", (q) => q.eq("status", status).lt("startedAt", cutoff))
        .take(BATCH_SIZE);
      for (const call of calls) {
        await deleteCallCascade(ctx, call);
        callsDeleted += 1;
      }
    }

    const endedLivestreams = await ctx.db
      .query("livestreams")
      .withIndex("by_status", (q) => q.eq("status", "ended"))
      .take(BATCH_SIZE);
    for (const livestream of endedLivestreams) {
      if ((livestream.endedAt ?? livestream.startedAt) >= cutoff) continue;
      const [viewers, joinRequests, signals] = await Promise.all([
        ctx.db
          .query("livestreamViewers")
          .withIndex("by_livestreamId", (q) => q.eq("livestreamId", livestream._id))
          .collect(),
        ctx.db
          .query("livestreamJoinRequests")
          .withIndex("by_livestreamId_and_status", (q) => q.eq("livestreamId", livestream._id))
          .collect(),
        ctx.db
          .query("livestreamSignaling")
          .withIndex("by_livestreamId", (q) => q.eq("livestreamId", livestream._id))
          .collect(),
      ]);
      for (const row of [...viewers, ...joinRequests, ...signals]) await ctx.db.delete(row._id);
      livestreamsCleaned += 1;
    }

    return { calls: callsDeleted, livestreams: livestreamsCleaned };
  },
});

/**
 * DSFA-Auflage (Szenario B): Moderationsdaten werden nach spätestens 6 Monaten
 * technisch erzwungen bereinigt.
 *
 *  - `reports` (Meldungen / Moderationsfälle / Abuse-Logs): HART GELÖSCHT.
 *  - `bannedEmails` (Sperren): die Klartext-E-Mail wird durch einen Einweg-Hash
 *    ersetzt (Pseudonymisierung). Der Bann bleibt wirksam, das Personendatum
 *    "E-Mail" ist danach nicht mehr im Klartext gespeichert. Der Verweis auf den
 *    bannenden Admin (`bannedByUserId`) wird entfernt.
 *
 * `blockedUsers` (private Blockierlisten einzelner Nutzer) sind KEINE
 * Moderations-Logs und werden bewusst nicht angetastet.
 *
 * Läuft batchweise und plant sich selbst neu ein, solange noch alte Reports
 * existieren, damit auch ein größerer Rückstand zuverlässig abgebaut wird.
 */
export const purgeExpiredModerationData = internalMutation({
  args: {},
  returns: v.object({ reportsDeleted: v.number(), bansPseudonymized: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - MODERATION_RETENTION_MS;

    // 1) Reports / Abuse-Logs älter als 6 Monate: hart löschen.
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(BATCH_SIZE);
    for (const report of reports) {
      await ctx.db.delete(report._id);
    }

    // 2) Sperren älter als 6 Monate: E-Mail pseudonymisieren (Hash), sofern noch Klartext.
    //    Die Sperrliste ist klein; ein Scan über die neuesten 500 Einträge genügt und
    //    ist idempotent (bereits gehashte Einträge werden übersprungen).
    const bans = await ctx.db.query("bannedEmails").order("desc").take(500);
    let bansPseudonymized = 0;
    for (const ban of bans) {
      if (ban.bannedAt >= cutoff) continue;
      if (isHashedBanEmail(ban.email)) continue;
      await ctx.db.patch(ban._id, {
        email: await hashBanEmail(ban.email),
        bannedByUserId: undefined,
      });
      bansPseudonymized += 1;
    }

    // Noch mehr alte Reports vorhanden? Direkt erneut einplanen, um den Rückstand abzubauen.
    if (reports.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.retention.purgeExpiredModerationData, {});
    }

    return { reportsDeleted: reports.length, bansPseudonymized };
  },
});
