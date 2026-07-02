import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { authQuery, authMutation } from "./functions";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { paginatedResultValidator } from "./pagination";
import { rateLimiter } from "./rateLimit";

type AuthCtx = {
  db: QueryCtx["db"];
  user: { _id: string };
};

const notificationTypeValidator = v.union(
  v.literal("message"),
  v.literal("like"),
  v.literal("comment"),
  v.literal("group_invite"),
  v.literal("event_reminder"),
  v.literal("ticket_confirmed"),
  v.literal("announcement"),
  v.literal("call"),
  v.literal("join_request"),
  v.literal("join_accepted"),
  v.literal("join_rejected"),
  v.literal("post_share"),
  v.literal("friend_request"),
  v.literal("friend_accepted"),
  v.literal("event_join"),
  v.literal("event_kicked"),
  v.literal("event_invite"),
  v.literal("event_canceled"),
  v.literal("group_deleted"),
  v.literal("event_deleted"),
  v.literal("post_removed"),
  v.literal("friend_request_accepted"),
  v.literal("friend_request_declined"),
  v.literal("group_kicked"),
);

const notificationValidator = v.object({
  _id: v.id("notifications"),
  type: notificationTypeValidator,
  title: v.string(),
  body: v.string(),
  referenceId: v.optional(v.string()),
  isRead: v.boolean(),
  createdAt: v.number(),
});

async function getMyUserId(ctx: AuthCtx): Promise<Id<"users"> | null> {
  const authId = ctx.user._id;
  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", authId))
    .unique();
  return user?._id ?? null;
}

// Newest notification for the current user — drives the in-app toast banner.
export const getLatest = authQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("notifications"),
      type: notificationTypeValidator,
      title: v.string(),
      body: v.string(),
      isRead: v.boolean(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return null;
    const latest = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .order("desc")
      .first();
    if (!latest) return null;
    return {
      _id: latest._id,
      type: latest.type,
      title: latest.title,
      body: latest.body,
      isRead: latest.isRead,
      createdAt: latest.createdAt,
    };
  },
});

export const list = authQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginatedResultValidator(notificationValidator),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) {
      return {
        page: [],
        isDone: true,
        continueCursor: args.paginationOpts.cursor ?? "",
      };
    }

    const results = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...results,
      page: results.page.map((notification) => ({
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        referenceId: notification.referenceId,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      })),
    };
  },
});

export const markRead = authMutation({
  args: { notificationIds: v.array(v.id("notifications")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "markNotificationsRead", { key: ctx.user._id });
    if (args.notificationIds.length > 100)
      throw new Error("Maximal 100 Benachrichtigungen gleichzeitig");
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    for (const nId of args.notificationIds) {
      const notification = await ctx.db.get(nId);
      if (!notification) continue;
      if (notification.userId !== myUserId) {
        throw new Error("Nur der Empfänger kann Benachrichtigungen als gelesen markieren");
      }
      await ctx.db.patch(nId, { isRead: true });
    }
    return null;
  },
});

export const markAllRead = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await rateLimiter.limit(ctx, "markNotificationsRead", { key: ctx.user._id });
    const authId = ctx.user._id;
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return null;

    const unreadNotifications = ctx.db
      .query("notifications")
      .withIndex("by_userId_and_isRead", (q) =>
        q.eq("userId", myUserId).eq("isRead", false),
      );

    for await (const notification of unreadNotifications) {
      await ctx.db.patch(notification._id, { isRead: true });
    }

    return null;
  },
});

export const getUnreadCount = authQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return 0;

    let unreadCount = 0;
    const unreadNotifications = ctx.db
      .query("notifications")
      .withIndex("by_userId_and_isRead", (q) =>
        q.eq("userId", myUserId).eq("isRead", false),
      );

    for await (const _notification of unreadNotifications) {
      unreadCount += 1;
    }

    return unreadCount;
  },
});
