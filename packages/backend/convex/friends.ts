import { v } from "convex/values";
import { authQuery, authMutation } from "./functions";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { rateLimiter } from "./rateLimit";

type AuthCtx = {
  db: QueryCtx["db"];
  storage: QueryCtx["storage"];
  user: { _id: string };
};

type UserCache = Map<Id<"users">, Doc<"users"> | null>;
type UrlCache = Map<Id<"_storage">, string | null>;

async function getMyUserId(ctx: { db: QueryCtx["db"]; user: { _id: string } }): Promise<Id<"users"> | null> {
  const authId = ctx.user._id;
  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", authId))
    .unique();
  return user?._id ?? null;
}

async function batchGetUsers(
  ctx: { db: QueryCtx["db"] },
  userIds: Array<Id<"users">>,
): Promise<UserCache> {
  const uniqueUserIds = [...new Set(userIds)];
  const cache: UserCache = new Map();

  await Promise.all(
    uniqueUserIds.map(async (userId) => {
      cache.set(userId, await ctx.db.get(userId));
    }),
  );

  return cache;
}

async function batchGetAvatarUrls(
  ctx: { storage: QueryCtx["storage"] },
  storageIds: Array<Id<"_storage"> | undefined>,
): Promise<UrlCache> {
  const uniqueStorageIds = [
    ...new Set(storageIds.filter((storageId): storageId is Id<"_storage"> => storageId !== undefined)),
  ];
  const cache: UrlCache = new Map();

  await Promise.all(
    uniqueStorageIds.map(async (storageId) => {
      cache.set(storageId, await ctx.storage.getUrl(storageId));
    }),
  );

  return cache;
}

function getAvatarUrl(user: Doc<"users"> | null | undefined, avatarUrls: UrlCache): string | undefined {
  if (!user) return undefined;
  if (user.avatarStorageId) return avatarUrls.get(user.avatarStorageId) ?? undefined;
  return user.avatarUrl;
}

// Get friendship status between me and another user
export const getStatus = authQuery({
  args: { otherUserId: v.id("users") },
  returns: v.object({
    status: v.union(
      v.literal("none"),
      v.literal("pending_sent"),
      v.literal("pending_received"),
      v.literal("friends"),
    ),
    requestId: v.optional(v.id("friendRequests")),
  }),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return { status: "none" as const };
    if (myUserId === args.otherUserId) return { status: "none" as const };

    // Use .order("desc") to get the most recent request (in case of re-sends after decline)
    const sent = await ctx.db
      .query("friendRequests")
      .withIndex("by_senderId_and_receiverId", (q) =>
        q.eq("senderId", myUserId).eq("receiverId", args.otherUserId),
      )
      .order("desc")
      .first();
    if (sent?.status === "accepted") return { status: "friends" as const, requestId: sent._id };
    if (sent?.status === "pending") return { status: "pending_sent" as const, requestId: sent._id };

    const received = await ctx.db
      .query("friendRequests")
      .withIndex("by_senderId_and_receiverId", (q) =>
        q.eq("senderId", args.otherUserId).eq("receiverId", myUserId),
      )
      .order("desc")
      .first();
    if (received?.status === "accepted") return { status: "friends" as const, requestId: received._id };
    if (received?.status === "pending") return { status: "pending_received" as const, requestId: received._id };

    return { status: "none" as const };
  },
});

// Send friend request
export const sendRequest = authMutation({
  args: { receiverId: v.id("users") },
  returns: v.id("friendRequests"),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "friendRequest", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    if (myUserId === args.receiverId) throw new Error("Cannot send request to yourself");

    const existing = await ctx.db
      .query("friendRequests")
      .withIndex("by_senderId_and_receiverId", (q) =>
        q.eq("senderId", myUserId).eq("receiverId", args.receiverId),
      )
      .order("desc")
      .first();
    if (existing?.status === "pending") throw new Error("Request already sent");
    if (existing?.status === "accepted") throw new Error("Already friends");

    const reverse = await ctx.db
      .query("friendRequests")
      .withIndex("by_senderId_and_receiverId", (q) =>
        q.eq("senderId", args.receiverId).eq("receiverId", myUserId),
      )
      .order("desc")
      .first();
    if (reverse?.status === "accepted") throw new Error("Already friends");
    if (reverse?.status === "pending") {
      await ctx.db.patch(reverse._id, {
        status: "accepted",
        respondedAt: Date.now(),
      });
      const myUser = await ctx.db.get(myUserId);
      await ctx.db.insert("notifications", {
        userId: args.receiverId,
        type: "friend_accepted",
        title: "Freundschaft bestätigt",
        body: `${myUser?.name ?? "Jemand"} hat deine Freundschaftsanfrage angenommen`,
        referenceId: myUserId,
        isRead: false,
        createdAt: Date.now(),
      });
      return reverse._id;
    }

    const requestId = await ctx.db.insert("friendRequests", {
      senderId: myUserId,
      receiverId: args.receiverId,
      status: "pending",
      createdAt: Date.now(),
    });

    const myUser = await ctx.db.get(myUserId);
    await ctx.db.insert("notifications", {
      userId: args.receiverId,
      type: "friend_request",
      title: "Neue Freundschaftsanfrage",
      body: `${myUser?.name ?? "Jemand"} möchte mit dir befreundet sein`,
      referenceId: requestId,
      isRead: false,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.pushNotifications.sendToUser, {
      userId: args.receiverId,
      title: "Neue Freundschaftsanfrage",
      body: `${myUser?.name ?? "Jemand"} möchte mit dir befreundet sein`,
      category: "announcements",
    });

    return requestId;
  },
});

// Accept friend request
export const acceptRequest = authMutation({
  args: { requestId: v.id("friendRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "friendRequest", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.receiverId !== myUserId) throw new Error("Not your request");
    if (request.status === "accepted") return null; // idempotent: already accepted (e.g. double-tap) — no error dialog
    if (request.status !== "pending") throw new Error("Request already handled");

    await ctx.db.patch(args.requestId, {
      status: "accepted",
      respondedAt: Date.now(),
    });

    // Mark the actionable friend-request notification as handled so it shows
    // "angenommen" (no buttons) and persists across reopen.
    const acceptSender = await ctx.db.get(request.senderId);
    const acceptNotifs = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .collect();
    for (const n of acceptNotifs) {
      if (n.type === "friend_request" && n.referenceId && String(n.referenceId) === String(args.requestId)) {
        await ctx.db.patch(n._id, {
          type: "friend_request_accepted",
          body: `Freundschaftsanfrage von ${acceptSender?.name ?? "jemandem"} angenommen`,
          isRead: true,
        });
      }
    }

    const myUser = await ctx.db.get(myUserId);
    await ctx.db.insert("notifications", {
      userId: request.senderId,
      type: "friend_accepted",
      title: "Freundschaft bestätigt",
      body: `${myUser?.name ?? "Jemand"} hat deine Freundschaftsanfrage angenommen`,
      referenceId: myUserId,
      isRead: false,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.pushNotifications.sendToUser, {
      userId: request.senderId,
      title: "Freundschaft bestätigt",
      body: `${myUser?.name ?? "Jemand"} hat deine Freundschaftsanfrage angenommen`,
      category: "announcements",
    });
    return null;
  },
});

// Decline friend request
export const declineRequest = authMutation({
  args: { requestId: v.id("friendRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "friendRequest", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.receiverId !== myUserId) throw new Error("Not your request");
    if (request.status === "declined") return null; // idempotent: already declined (e.g. double-tap) — no error dialog
    if (request.status !== "pending") throw new Error("Request already handled");

    await ctx.db.patch(args.requestId, {
      status: "declined",
      respondedAt: Date.now(),
    });

    // Mark the friend-request notification as handled (declined) so buttons vanish.
    const declineSender = await ctx.db.get(request.senderId);
    const declineNotifs = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .collect();
    for (const n of declineNotifs) {
      if (n.type === "friend_request" && n.referenceId && String(n.referenceId) === String(args.requestId)) {
        await ctx.db.patch(n._id, {
          type: "friend_request_declined",
          body: `Freundschaftsanfrage von ${declineSender?.name ?? "jemandem"} abgelehnt`,
          isRead: true,
        });
      }
    }
    return null;
  },
});

// Get my pending friend requests (received)
export const getMyRequests = authQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("friendRequests"),
      senderId: v.id("users"),
      senderName: v.string(),
      senderAvatarUrl: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return [];

    const requests = await ctx.db
      .query("friendRequests")
      .withIndex("by_receiverId_and_status", (q) =>
        q.eq("receiverId", myUserId).eq("status", "pending"),
      )
      .order("desc")
      .take(50);

    const senderIds = requests.map((request) => request.senderId);
    const senderCache = await batchGetUsers(ctx, senderIds);
    const avatarUrls = await batchGetAvatarUrls(
      ctx,
      [...senderCache.values()].map((user) => user?.avatarStorageId),
    );

    return requests.flatMap((request) => {
      const sender = senderCache.get(request.senderId);
      if (!sender) return [];
      return [{
        _id: request._id,
        senderId: request.senderId,
        senderName: sender.name,
        senderAvatarUrl: getAvatarUrl(sender, avatarUrls),
        createdAt: request.createdAt,
      }];
    });
  },
});

// Get my friends list
export const getMyFriends = authQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.string(),
      avatarUrl: v.optional(v.string()),
      city: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return [];

    const [sentAccepted, receivedAccepted] = await Promise.all([
      ctx.db
        .query("friendRequests")
        .withIndex("by_senderId_and_status", (q) =>
          q.eq("senderId", myUserId).eq("status", "accepted"),
        )
        .collect(),
      ctx.db
        .query("friendRequests")
        .withIndex("by_receiverId_and_status", (q) =>
          q.eq("receiverId", myUserId).eq("status", "accepted"),
        )
        .collect(),
    ]);

    const friendIds = [
      ...sentAccepted.map((request) => request.receiverId),
      ...receivedAccepted.map((request) => request.senderId),
    ];
    if (friendIds.length === 0) return [];

    const userCache = await batchGetUsers(ctx, friendIds);
    const avatarUrls = await batchGetAvatarUrls(
      ctx,
      [...userCache.values()].map((user) => user?.avatarStorageId),
    );

    return friendIds.flatMap((friendId) => {
      const user = userCache.get(friendId);
      if (!user) return [];
      return [{
        _id: user._id,
        name: user.name,
        avatarUrl: getAvatarUrl(user, avatarUrls),
        city: user.city,
      }];
    });
  },
});

// Public: Get friends of any user
export const getFriendsOfUser = query({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.string(),
      avatarUrl: v.optional(v.string()),
      city: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const [sentAccepted, receivedAccepted] = await Promise.all([
      ctx.db
        .query("friendRequests")
        .withIndex("by_senderId_and_status", (q) =>
          q.eq("senderId", args.userId).eq("status", "accepted"),
        )
        .collect(),
      ctx.db
        .query("friendRequests")
        .withIndex("by_receiverId_and_status", (q) =>
          q.eq("receiverId", args.userId).eq("status", "accepted"),
        )
        .collect(),
    ]);

    const friendIds = [
      ...sentAccepted.map((r) => r.receiverId),
      ...receivedAccepted.map((r) => r.senderId),
    ];
    if (friendIds.length === 0) return [];

    const userCache = await batchGetUsers(ctx, friendIds);
    const avatarUrls = await batchGetAvatarUrls(
      ctx,
      [...userCache.values()].map((u) => u?.avatarStorageId),
    );

    return friendIds.flatMap((friendId) => {
      const user = userCache.get(friendId);
      if (!user) return [];
      return [{
        _id: user._id,
        name: user.name,
        avatarUrl: getAvatarUrl(user, avatarUrls),
        city: user.city,
      }];
    });
  },
});
