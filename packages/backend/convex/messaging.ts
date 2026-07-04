import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { authQuery, authMutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { getConversationKeyFromParticipants, getDirectConversationKey } from "./conversationKey";
import { paginatedResultValidator } from "./pagination";
import { touchConversationActivity } from "./conversationActivity";
import { rateLimiter, INPUT_LIMITS, validateStringLength, sanitizeText } from "./rateLimit";
import { isBlockedBetween } from "./users";
import { internal } from "./_generated/api";

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

function previewForMessage(message: Doc<"messages">): string {
  switch (message.type) {
    case "text": return (message.text ?? "").slice(0, 120);
    case "image": return "📷 Foto";
    case "video": return "🎥 Video";
    case "voice": return "🎙 Sprachmemo";
    case "post_share": return "Beitrag";
    case "profile_share": return "Profil";
    // A zetti's caption is secret — never leak it into previews
    case "zetti": return "Zetti";
    default: return "Nachricht";
  }
}

// Resolve reply metadata (quoted text + sender name) from a replyToId,
// verifying the target message belongs to the same conversation.
async function resolveReplyTo(
  ctx: { db: QueryCtx["db"] },
  replyToId: Id<"messages"> | undefined,
  conversationId: Id<"conversations">,
): Promise<{ replyToId?: Id<"messages">; replyToText?: string; replyToSenderName?: string }> {
  if (!replyToId) return {};
  const target = await ctx.db.get(replyToId);
  if (!target || target.conversationId !== conversationId) return {};
  const sender = await ctx.db.get(target.senderId);
  return {
    replyToId,
    replyToText: previewForMessage(target),
    replyToSenderName: sender?.name ?? "Unbekannt",
  };
}

const sharedPostPreviewValidator = v.optional(
  v.object({
    thumbnailUrl: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    postType: v.union(v.literal("photo"), v.literal("video")),
    authorName: v.string(),
    caption: v.optional(v.string()),
    deleted: v.optional(v.boolean()),
  }),
);

const messageReturnValidator = v.object({
  _id: v.id("messages"),
  senderId: v.id("users"),
  senderName: v.string(),
  senderAvatarUrl: v.optional(v.string()),
  type: v.union(
    v.literal("text"),
    v.literal("image"),
    v.literal("video"),
    v.literal("voice"),
    v.literal("post_share"),
    v.literal("profile_share"),
    v.literal("zetti"),
  ),
  text: v.optional(v.string()),
  mediaUrl: v.optional(v.string()),
  mediaDuration: v.optional(v.number()),
  zettiTextY: v.optional(v.number()),
  zettiViewedByMe: v.optional(v.boolean()),
  sharedPostId: v.optional(v.id("posts")),
  sharedPostPreview: sharedPostPreviewValidator,
  sharedProfileId: v.optional(v.id("users")),
  reactions: v.optional(v.array(v.object({ userId: v.id("users"), emoji: v.string() }))),
  replyToId: v.optional(v.id("messages")),
  replyToText: v.optional(v.string()),
  replyToSenderName: v.optional(v.string()),
  isMe: v.boolean(),
  createdAt: v.number(),
});

async function enrichPostPreview(
  ctx: { db: QueryCtx["db"]; storage: QueryCtx["storage"] },
  message: { type: string; sharedPostId?: Id<"posts"> },
) {
  if (message.type !== "post_share" || !message.sharedPostId) return undefined;

  const post = await ctx.db.get(message.sharedPostId);
  if (!post) {
    return {
      deleted: true as const,
      postType: "photo" as const,
      authorName: "",
    };
  }

  const author = await ctx.db.get(post.authorId);
  const thumbnailUrl = post.thumbnailStorageId
    ? ((await ctx.storage.getUrl(post.thumbnailStorageId)) ?? undefined)
    : post.thumbnailUrl;
  const mediaUrl = post.mediaStorageId
    ? ((await ctx.storage.getUrl(post.mediaStorageId)) ?? undefined)
    : post.mediaUrl;

  return {
    thumbnailUrl: thumbnailUrl ?? (post.type === "photo" ? mediaUrl : undefined),
    mediaUrl: mediaUrl ?? undefined,
    postType: post.type,
    authorName: author?.name ?? "Unbekannt",
    caption: post.caption?.slice(0, 80) ?? undefined,
  };
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

async function batchGetStorageUrls(
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

function getUserAvatarUrl(user: Doc<"users"> | null | undefined, urlCache: UrlCache): string | undefined {
  if (!user) return undefined;
  if (user.avatarStorageId) return urlCache.get(user.avatarStorageId) ?? undefined;
  return user.avatarUrl;
}

async function enrichMessagesOptimized(
  ctx: { db: QueryCtx["db"]; storage: QueryCtx["storage"] },
  messages: Array<Doc<"messages">>,
  myUserId: Id<"users"> | null,
) {
  if (messages.length === 0) return [];

  const senderCache = await batchGetUsers(
    ctx,
    messages.map((message) => message.senderId),
  );
  const urlCache = await batchGetStorageUrls(ctx, [
    ...messages.map((message) => message.mediaStorageId),
    ...[...senderCache.values()].map((sender) => sender?.avatarStorageId),
  ]);

  const sharedMessages = messages.filter(
    (message) => message.type === "post_share" && message.sharedPostId,
  );
  const previewMap = new Map<string, Awaited<ReturnType<typeof enrichPostPreview>>>();
  if (sharedMessages.length > 0) {
    const previews = await Promise.all(
      sharedMessages.map((message) => enrichPostPreview(ctx, message)),
    );
    sharedMessages.forEach((message, index) => {
      previewMap.set(message._id, previews[index]);
    });
  }

  // View-once tracking: has *this* user already viewed each zetti?
  const zettiMessages = messages.filter((message) => message.type === "zetti");
  const viewedZettiIds = new Set<string>();
  if (zettiMessages.length > 0 && myUserId !== null) {
    const viewerId = myUserId;
    await Promise.all(
      zettiMessages.map(async (message) => {
        const view = await ctx.db
          .query("zettiViews")
          .withIndex("by_message_and_user", (q) =>
            q.eq("messageId", message._id).eq("userId", viewerId),
          )
          .unique();
        if (view) viewedZettiIds.add(message._id);
      }),
    );
  }

  return messages.map((message) => {
    const sender = senderCache.get(message.senderId);
    return {
      _id: message._id,
      senderId: message.senderId,
      senderName: sender?.name ?? "Unknown",
      senderAvatarUrl: getUserAvatarUrl(sender, urlCache),
      type: message.type,
      text: message.text,
      mediaUrl: message.mediaStorageId
        ? (urlCache.get(message.mediaStorageId) ?? undefined)
        : message.mediaUrl,
      mediaDuration: message.mediaDuration,
      zettiTextY: message.zettiTextY,
      zettiViewedByMe:
        message.type === "zetti" ? viewedZettiIds.has(message._id) : undefined,
      sharedPostId: message.sharedPostId,
      sharedPostPreview: previewMap.get(message._id),
      sharedProfileId: message.sharedProfileId,
      reactions: message.reactions,
      replyToId: message.replyToId,
      replyToText: message.replyToText,
      replyToSenderName: message.replyToSenderName,
      isMe: message.senderId === myUserId,
      createdAt: message.createdAt,
    };
  });
}

// Get conversations list (DMs)
export const listConversations = authQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("conversations"),
      type: v.union(v.literal("direct"), v.literal("group")),
      otherUserId: v.optional(v.id("users")),
      otherUserName: v.optional(v.string()),
      otherUserAvatarUrl: v.optional(v.string()),
      groupId: v.optional(v.id("groups")),
      groupName: v.optional(v.string()),
      lastMessage: v.optional(v.string()),
      lastMessageAt: v.optional(v.number()),
      unreadCount: v.number(),
      isPinned: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return [];

    const allConversations = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessageAt")
      .order("desc")
      .take(100);
    const myConversations = allConversations.filter(
      (conversation) =>
        conversation.type === "direct" &&
        conversation.participantIds?.includes(myUserId),
    );

    // Fetch per-user conversation settings (pin/delete)
    const settings = await ctx.db
      .query("conversationSettings")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .collect();
    const settingsMap = new Map(settings.map((s) => [s.conversationId as string, s]));

    // Filter out deleted conversations
    const activeConversations = myConversations.filter((c) => {
      const s = settingsMap.get(c._id as string);
      return !s?.isDeleted;
    });

    const otherUserIds = activeConversations.flatMap((conversation) => {
      const otherUserId = conversation.participantIds?.find(
        (participantId) => participantId !== myUserId,
      );
      return otherUserId ? [otherUserId] : [];
    });

    // Fetch read statuses for all conversations
    const readStatuses = await Promise.all(
      activeConversations.map((conversation) =>
        ctx.db
          .query("conversationReadStatus")
          .withIndex("by_conversationId_and_userId", (q) =>
            q.eq("conversationId", conversation._id).eq("userId", myUserId),
          )
          .unique(),
      ),
    );

    const [userCache, lastMessages, unreadCounts] = await Promise.all([
      batchGetUsers(ctx, otherUserIds),
      Promise.all(
        activeConversations.map((conversation) =>
          ctx.db
            .query("messages")
            .withIndex("by_conversationId", (q) =>
              q.eq("conversationId", conversation._id),
            )
            .order("desc")
            .first(),
        ),
      ),
      Promise.all(
        activeConversations.map(async (conversation, index) => {
          const readStatus = readStatuses[index];
          const lastReadAt = readStatus?.lastReadAt ?? 0;
          // Count messages after lastReadAt that are NOT from me
          const unreadMessages = await ctx.db
            .query("messages")
            .withIndex("by_conversationId_and_createdAt", (q) =>
              q.eq("conversationId", conversation._id).gt("createdAt", lastReadAt),
            )
            .take(100);
          return unreadMessages.filter((m) => m.senderId !== myUserId).length;
        }),
      ),
    ]);

    const avatarUrls = await batchGetStorageUrls(
      ctx,
      [...userCache.values()].map((user) => user?.avatarStorageId),
    );

    const result = activeConversations.map((conversation, index) => {
      const otherUserId = conversation.participantIds?.find(
        (participantId) => participantId !== myUserId,
      );
      const otherUser = otherUserId ? userCache.get(otherUserId) : null;
      const lastMessage = lastMessages[index];
      const s = settingsMap.get(conversation._id as string);
      return {
        _id: conversation._id,
        type: conversation.type,
        otherUserId,
        otherUserName: otherUser?.name,
        otherUserAvatarUrl: getUserAvatarUrl(otherUser, avatarUrls),
        lastMessage:
          lastMessage?.type === "zetti"
            ? "Zetti"
            : (lastMessage?.text ??
              (lastMessage?.type === "image"
                ? "\uD83D\uDDBC Foto"
                : lastMessage?.type === "voice"
                  ? "\uD83C\uDF99 Sprachmemo"
                  : undefined)),
        lastMessageAt: conversation.lastMessageAt,
        unreadCount: unreadCounts[index],
        isPinned: s?.isPinned === true,
      };
    });

    // Sort: pinned first (by pinnedAt desc), then by lastMessageAt (already sorted)
    result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });

    return result;
  },
});

// Newest incoming message across all my DM + group conversations.
// Drives the in-app top banner while the app is open.
export const getLatestIncomingMessage = authQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("messages"),
      routeType: v.union(v.literal("direct"), v.literal("group")),
      conversationId: v.id("conversations"),
      groupId: v.optional(v.id("groups")),
      title: v.string(),
      body: v.string(),
      avatarUrl: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return null;

    // Direct conversations I'm part of
    const recentConversations = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessageAt")
      .order("desc")
      .take(60);
    const directConvs = recentConversations.filter(
      (c) => c.type === "direct" && c.participantIds?.includes(myUserId),
    );

    // Group conversations via my active memberships
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .take(100);
    const activeGroupIds = memberships
      .filter((m) => m.status === "active")
      .map((m) => m.groupId);
    const groupConvs = (
      await Promise.all(
        activeGroupIds.map((gid) =>
          ctx.db
            .query("conversations")
            .withIndex("by_groupId", (q) => q.eq("groupId", gid))
            .unique(),
        ),
      )
    ).filter((c): c is Doc<"conversations"> => !!c);

    // Drop DMs the user deleted from their inbox
    const settings = await ctx.db
      .query("conversationSettings")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .collect();
    const deleted = new Set(
      settings.filter((s) => s.isDeleted).map((s) => s.conversationId as string),
    );

    const allConvs = [...directConvs, ...groupConvs].filter(
      (c) => !deleted.has(c._id as string),
    );

    const lasts = await Promise.all(
      allConvs.map((c) =>
        ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) => q.eq("conversationId", c._id))
          .order("desc")
          .first(),
      ),
    );

    let best: { conv: Doc<"conversations">; msg: Doc<"messages"> } | null = null;
    allConvs.forEach((c, i) => {
      const m = lasts[i];
      if (!m || m.senderId === myUserId) return;
      if (!best || m.createdAt > best.msg.createdAt) best = { conv: c, msg: m };
    });
    if (!best) return null;

    const chosen: { conv: Doc<"conversations">; msg: Doc<"messages"> } = best;
    const sender = await ctx.db.get(chosen.msg.senderId);
    const preview = previewForMessage(chosen.msg);

    if (chosen.conv.type === "group") {
      const group = chosen.conv.groupId ? await ctx.db.get(chosen.conv.groupId) : null;
      return {
        _id: chosen.msg._id,
        routeType: "group" as const,
        conversationId: chosen.conv._id,
        groupId: chosen.conv.groupId,
        title: group?.name ?? "Gruppe",
        body: `${sender?.name ?? "Jemand"}: ${preview}`,
        avatarUrl: undefined,
        createdAt: chosen.msg.createdAt,
      };
    }

    const avatarUrl = sender
      ? sender.avatarStorageId
        ? ((await ctx.storage.getUrl(sender.avatarStorageId)) ?? undefined)
        : sender.avatarUrl
      : undefined;
    return {
      _id: chosen.msg._id,
      routeType: "direct" as const,
      conversationId: chosen.conv._id,
      groupId: undefined,
      title: sender?.name ?? "Neue Nachricht",
      body: preview,
      avatarUrl,
      createdAt: chosen.msg.createdAt,
    };
  },
});

// Total unread messages count across all conversations
export const getUnreadConversationsCount = authQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return 0;

    // Conversations the user deleted from their inbox — mirror listConversations,
    // otherwise the badge counts messages the DM list never shows (phantom unread).
    const settings = await ctx.db
      .query("conversationSettings")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .collect();
    const deletedIds = new Set(
      settings.filter((s) => s.isDeleted).map((s) => s.conversationId as string),
    );

    // Use readStatus index to find user's conversations directly
    const readStatuses = await ctx.db
      .query("conversationReadStatus")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .take(100);

    let total = 0;
    for (const rs of readStatuses) {
      if (deletedIds.has(rs.conversationId as string)) continue;
      const conversation = await ctx.db.get(rs.conversationId);
      // Only 1:1 direct chats the user is still part of (groups have their own badge)
      if (!conversation || conversation.type !== "direct") continue;
      if (!conversation.participantIds?.includes(myUserId)) continue;

      const unread = await ctx.db
        .query("messages")
        .withIndex("by_conversationId_and_createdAt", (q) =>
          q.eq("conversationId", rs.conversationId).gt("createdAt", rs.lastReadAt),
        )
        .take(50);
      total += unread.filter((m) => m.senderId !== myUserId).length;
      if (total > 99) return total; // cap for badge display
    }
    return total;
  },
});

// Mark conversation as read
export const markConversationAsRead = authMutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return null;

    const existing = await ctx.db
      .query("conversationReadStatus")
      .withIndex("by_conversationId_and_userId", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", myUserId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { lastReadAt: Date.now() });
    } else {
      await ctx.db.insert("conversationReadStatus", {
        conversationId: args.conversationId,
        userId: myUserId,
        lastReadAt: Date.now(),
      });
    }
    return null;
  },
});

// Mark ALL conversations as read (when user opens conversations list)
export const markAllConversationsAsRead = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return null;

    const readStatuses = await ctx.db
      .query("conversationReadStatus")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .take(100);

    const now = Date.now();
    for (const rs of readStatuses) {
      await ctx.db.patch(rs._id, { lastReadAt: now });
    }
    return null;
  },
});

// Get or create DM conversation
export const getOrCreateDM = authMutation({
  args: { otherUserId: v.id("users") },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    // Block check
    if (await isBlockedBetween(ctx, myUserId, args.otherUserId)) {
      throw new Error("Diese Unterhaltung ist nicht verfügbar");
    }

    const conversationKey = getDirectConversationKey(myUserId, args.otherUserId);
    const indexedConversation = await ctx.db
      .query("conversations")
      .withIndex("by_conversationKey", (q) => q.eq("conversationKey", conversationKey))
      .unique();
    if (indexedConversation) return indexedConversation._id;

    const recentConversations = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessageAt")
      .order("desc")
      .take(200);
    for (const conversation of recentConversations) {
      const existingKey = getConversationKeyFromParticipants(conversation.participantIds);
      if (conversation.type !== "direct" || existingKey !== conversationKey) continue;
      if (conversation.conversationKey !== conversationKey) {
        await ctx.db.patch(conversation._id, { conversationKey });
      }
      return conversation._id;
    }

    return await ctx.db.insert("conversations", {
      type: "direct",
      participantIds: [myUserId, args.otherUserId],
      conversationKey,
      createdAt: Date.now(),
    });
  },
});

// Get group conversation
export const getGroupConversation = query({
  args: { groupId: v.id("groups") },
  returns: v.union(v.null(), v.id("conversations")),
  handler: async (ctx, args) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .unique();
    return conversation?._id ?? null;
  },
});

// Get messages for conversation
export const getMessages = authQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.array(messageReturnValidator),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .take(50);
    return enrichMessagesOptimized(ctx, messages, myUserId);
  },
});

// Send message
export const sendMessage = authMutation({
  args: {
    conversationId: v.id("conversations"),
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("video"),
      v.literal("voice"),
      v.literal("post_share"),
    ),
    text: v.optional(v.string()),
    mediaStorageId: v.optional(v.id("_storage")),
    mediaDuration: v.optional(v.number()),
    sharedPostId: v.optional(v.id("posts")),
    replyToId: v.optional(v.id("messages")),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "sendDirectMessage", { key: `${ctx.user._id}:${args.conversationId}` });
    validateStringLength(args.text, "Nachricht", INPUT_LIMITS.messageText);
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    // Block check for DMs
    const conversation = await ctx.db.get(args.conversationId);
    if (conversation?.type === "direct") {
      const otherUserId = conversation.participantIds?.find((id: Id<"users">) => id !== myUserId);
      if (otherUserId && await isBlockedBetween(ctx, myUserId, otherUserId)) {
        throw new Error("Nachricht kann nicht gesendet werden");
      }
    }

    const reply = await resolveReplyTo(ctx, args.replyToId, args.conversationId);

    const createdAt = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: myUserId,
      type: args.type,
      text: args.text,
      mediaStorageId: args.mediaStorageId,
      mediaDuration: args.mediaDuration,
      sharedPostId: args.sharedPostId,
      ...reply,
      createdAt,
    });
    await touchConversationActivity(ctx, args.conversationId, createdAt);

    // Push the recipient so they're notified even with the app closed
    if (conversation?.type === "direct") {
      const otherUserId = conversation.participantIds?.find((id: Id<"users">) => id !== myUserId);
      if (otherUserId) {
        const me = await ctx.db.get(myUserId);
        const preview =
          args.type === "text" ? (args.text ?? "")
          : args.type === "image" ? "📷 Foto"
          : args.type === "voice" ? "🎙 Sprachmemo"
          : args.type === "video" ? "🎥 Video"
          : args.type === "post_share" ? "Hat einen Beitrag geteilt"
          : "Neue Nachricht";
        await ctx.scheduler.runAfter(0, internal.pushNotifications.sendToUser, {
          userId: otherUserId,
          title: me?.name ?? "Neue Nachricht",
          body: preview.slice(0, 140),
          data: { type: "message", conversationId: String(args.conversationId) },
          category: "directMessages",
        });
      }
    }
    return messageId;
  },
});

// Group messages
export const getGroupMessages = authQuery({
  args: {
    groupId: v.id("groups"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginatedResultValidator(messageReturnValidator),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .unique();
    if (!conversation) {
      return {
        page: [],
        isDone: true,
        continueCursor: args.paginationOpts.cursor ?? "",
      };
    }

    const results = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...results,
      page: await enrichMessagesOptimized(ctx, results.page, myUserId),
    };
  },
});

// Send group message
export const sendGroupMessage = authMutation({
  args: {
    groupId: v.id("groups"),
    text: v.optional(v.string()),
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("video"),
      v.literal("voice"),
      v.literal("zetti"),
    ),
    mediaStorageId: v.optional(v.id("_storage")),
    mediaDuration: v.optional(v.number()),
    zettiTextY: v.optional(v.number()),
    replyToId: v.optional(v.id("messages")),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "sendGroupMessage", { key: `${ctx.user._id}:${args.groupId}` });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    let conversation = await ctx.db
      .query("conversations")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .unique();
    if (!conversation) {
      const conversationId = await ctx.db.insert("conversations", {
        type: "group",
        groupId: args.groupId,
        createdAt: Date.now(),
      });
      conversation = await ctx.db.get(conversationId);
    }
    if (!conversation) throw new Error("Conversation not found");

    const reply = await resolveReplyTo(ctx, args.replyToId, conversation._id);

    const createdAt = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      senderId: myUserId,
      type: args.type,
      text: args.text,
      mediaStorageId: args.mediaStorageId,
      mediaDuration: args.mediaDuration,
      zettiTextY: args.type === "zetti" ? args.zettiTextY : undefined,
      ...reply,
      createdAt,
    });
    await touchConversationActivity(ctx, conversation._id, createdAt);

    // Push the other active group members (app closed)
    const [me, group] = await Promise.all([
      ctx.db.get(myUserId),
      ctx.db.get(args.groupId),
    ]);
    const members = await ctx.db
      .query("groupMembers")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .take(200);
    const preview =
      args.type === "text" ? (args.text ?? "")
      : args.type === "image" ? "📷 Foto"
      : args.type === "voice" ? "🎙 Sprachmemo"
      : args.type === "video" ? "🎥 Video"
      : args.type === "zetti" ? "hat ein Zetti gesendet" // caption stays secret
      : "Neue Nachricht";
    const senderName = me?.name ?? "Jemand";
    const groupName = group?.name ?? "Gruppe";
    await Promise.all(
      members
        .filter((m) => m.status === "active" && m.userId !== myUserId)
        .map((m) =>
          ctx.scheduler.runAfter(0, internal.pushNotifications.sendToUser, {
            userId: m.userId,
            title: groupName,
            body: `${senderName}: ${preview}`.slice(0, 140),
            data: { type: "group_message", groupId: String(args.groupId) },
            category: "groupMessages",
          }),
        ),
    );
    return messageId;
  },
});

// Toggle an emoji reaction on a message (WhatsApp-style, one emoji per user)
export const toggleReaction = authMutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    // Verify the user is a participant of the conversation
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.type === "direct") {
      if (!conversation.participantIds?.includes(myUserId)) {
        throw new Error("Not allowed");
      }
    } else if (conversation.groupId) {
      const membership = await ctx.db
        .query("groupMembers")
        .withIndex("by_groupId_and_userId", (q) =>
          q.eq("groupId", conversation.groupId!).eq("userId", myUserId),
        )
        .unique();
      if (!membership || membership.status !== "active") {
        throw new Error("Not allowed");
      }
    }

    const reactions = message.reactions ?? [];
    const existing = reactions.find((r) => r.userId === myUserId);
    let next: Array<{ userId: Id<"users">; emoji: string }>;
    if (existing && existing.emoji === args.emoji) {
      // Same emoji tapped again → remove reaction
      next = reactions.filter((r) => r.userId !== myUserId);
    } else {
      // Replace this user's reaction (or add new)
      next = [...reactions.filter((r) => r.userId !== myUserId), { userId: myUserId, emoji: args.emoji }];
    }
    await ctx.db.patch(args.messageId, { reactions: next.length > 0 ? next : undefined });
    return null;
  },
});

// Generate upload URL for voice messages and media
export const generateUploadUrl = authMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await rateLimiter.limit(ctx, "messageUploadUrl", { key: ctx.user._id });
    return await ctx.storage.generateUploadUrl();
  },
});

// Get direct messages
export const getDirectMessages = authQuery({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginatedResultValidator(messageReturnValidator),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    const results = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...results,
      page: await enrichMessagesOptimized(ctx, results.page, myUserId),
    };
  },
});

// Send direct message
export const sendDirectMessage = authMutation({
  args: {
    conversationId: v.id("conversations"),
    text: v.optional(v.string()),
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("video"),
      v.literal("voice"),
      v.literal("zetti"),
    ),
    mediaStorageId: v.optional(v.id("_storage")),
    mediaDuration: v.optional(v.number()),
    zettiTextY: v.optional(v.number()),
    replyToId: v.optional(v.id("messages")),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "sendDirectMessage", { key: `${ctx.user._id}:${args.conversationId}` });
    validateStringLength(args.text, "Nachricht", INPUT_LIMITS.messageText);
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    // Block check for DMs
    const conversation = await ctx.db.get(args.conversationId);
    let otherUserId: Id<"users"> | undefined;
    if (conversation?.type === "direct") {
      otherUserId = conversation.participantIds?.find((id: Id<"users">) => id !== myUserId);
      if (otherUserId && await isBlockedBetween(ctx, myUserId, otherUserId)) {
        throw new Error("Nachricht kann nicht gesendet werden");
      }
    }

    const reply = await resolveReplyTo(ctx, args.replyToId, args.conversationId);

    const createdAt = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: myUserId,
      type: args.type,
      text: args.text,
      mediaStorageId: args.mediaStorageId,
      mediaDuration: args.mediaDuration,
      zettiTextY: args.type === "zetti" ? args.zettiTextY : undefined,
      ...reply,
      createdAt,
    });
    await touchConversationActivity(ctx, args.conversationId, createdAt);

    // Push the recipient so they're notified even with the app closed
    if (otherUserId) {
      const me = await ctx.db.get(myUserId);
      const preview =
        args.type === "text" ? (args.text ?? "")
        : args.type === "image" ? "📷 Foto"
        : args.type === "voice" ? "🎙 Sprachmemo"
        : args.type === "video" ? "🎥 Video"
        : args.type === "zetti" ? "Hat ein Zetti gesendet" // caption stays secret
        : "Neue Nachricht";
      await ctx.scheduler.runAfter(0, internal.pushNotifications.sendToUser, {
        userId: otherUserId,
        title: me?.name ?? "Neue Nachricht",
        body: preview.slice(0, 140),
        data: { type: "message", conversationId: String(args.conversationId) },
        category: "directMessages",
      });
    }
    return messageId;
  },
});

// Mark a Zetti as viewed by me (idempotent). Every user — including the
// sender — gets exactly one view; once a zettiViews row exists the client
// permanently renders the "angesehen" pill and never shows the media again.
export const markZettiViewed = authMutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const message = await ctx.db.get(args.messageId);
    if (!message || message.type !== "zetti") return null;

    const existing = await ctx.db
      .query("zettiViews")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", myUserId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("zettiViews", {
        messageId: args.messageId,
        userId: myUserId,
        viewedAt: Date.now(),
      });
    }
    return null;
  },
});

// Delete own message
export const deleteMessage = authMutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId !== myUserId) throw new Error("Not your message");

    await ctx.db.delete(args.messageId);
    return null;
  },
});

// Pin a conversation (max 3)
export const pinConversation = authMutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const existingSettings = await ctx.db
      .query("conversationSettings")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .collect();
    const pinnedCount = existingSettings.filter((s) => s.isPinned).length;

    const existing = await ctx.db
      .query("conversationSettings")
      .withIndex("by_userId_and_conversationId", (q) =>
        q.eq("userId", myUserId).eq("conversationId", args.conversationId),
      )
      .unique();

    if (existing?.isPinned) return null; // already pinned
    if (pinnedCount >= 3) throw new Error("Maximal 3 Chats können angepinnt werden");

    if (existing) {
      await ctx.db.patch(existing._id, { isPinned: true, pinnedAt: Date.now() });
    } else {
      await ctx.db.insert("conversationSettings", {
        conversationId: args.conversationId,
        userId: myUserId,
        isPinned: true,
        pinnedAt: Date.now(),
      });
    }
    return null;
  },
});

// Unpin a conversation
export const unpinConversation = authMutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const existing = await ctx.db
      .query("conversationSettings")
      .withIndex("by_userId_and_conversationId", (q) =>
        q.eq("userId", myUserId).eq("conversationId", args.conversationId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { isPinned: false, pinnedAt: undefined });
    }
    return null;
  },
});

// Soft-delete a conversation (only for this user)
export const deleteConversation = authMutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const existing = await ctx.db
      .query("conversationSettings")
      .withIndex("by_userId_and_conversationId", (q) =>
        q.eq("userId", myUserId).eq("conversationId", args.conversationId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { isDeleted: true, isPinned: false });
    } else {
      await ctx.db.insert("conversationSettings", {
        conversationId: args.conversationId,
        userId: myUserId,
        isDeleted: true,
      });
    }
    return null;
  },
});
