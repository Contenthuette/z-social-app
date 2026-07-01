import { v } from "convex/values";
import { authQuery, authMutation } from "./functions";
import type { Id, Doc } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { getDirectConversationKey } from "./conversationKey";
import { touchConversationActivity } from "./conversationActivity";
import { rateLimiter } from "./rateLimit";

/* ── helpers ───────────────────────────────────────────────────── */
async function getMyUserId(
  ctx: { db: QueryCtx["db"]; user: { _id: string } },
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", ctx.user._id))
    .unique();
  return user?._id ?? null;
}

const targetValidator = v.object({
  id: v.string(),
  type: v.union(v.literal("user"), v.literal("group")),
  name: v.string(),
  avatarUrl: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  messageCount: v.number(),
  section: v.union(
    v.literal("frequent"),
    v.literal("friend"),
    v.literal("group"),
    v.literal("other"),
  ),
});

/* ── getShareTargets ──────────────────────────────────────────── */
export const getShareTargets = authQuery({
  args: { search: v.optional(v.string()) },
  returns: v.array(targetValidator),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return [];

    const searchLower = args.search?.toLowerCase().trim() ?? "";

    /* ── 1. All DM conversations I'm part of ─────────────────── */
    const allConvos = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessageAt")
      .order("desc")
      .take(200);

    // Count messages per conversation for ranking
    type TargetRaw = {
      id: string;
      type: "user" | "group";
      name: string;
      avatarUrl: string | undefined;
      subtitle: string | undefined;
      messageCount: number;
      section: "frequent" | "friend" | "group" | "other";
    };
    const targets: TargetRaw[] = [];
    const seenUserIds = new Set<string>();
    const seenGroupIds = new Set<string>();

    for (const c of allConvos) {
      if (c.type === "direct" && c.participantIds?.includes(myUserId)) {
        const otherId = c.participantIds.find((id) => id !== myUserId);
        if (!otherId || seenUserIds.has(otherId)) continue;
        seenUserIds.add(otherId);

        const other = await ctx.db.get(otherId);
        if (!other) continue;

        // Count messages in this conversation
        const msgs = await ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) =>
            q.eq("conversationId", c._id),
          )
          .take(500);
        const msgCount = msgs.length;

        const avatarUrl = other.avatarStorageId
          ? ((await ctx.storage.getUrl(other.avatarStorageId)) ?? undefined)
          : other.avatarUrl;

        targets.push({
          id: otherId,
          type: "user",
          name: other.name,
          avatarUrl,
          subtitle: other.city ?? other.county ?? undefined,
          messageCount: msgCount,
          section: msgCount >= 5 ? "frequent" : "friend",
        });
      }
    }

    /* ── 2. Groups I'm a member of ───────────────────────────── */
    const myMemberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .take(100);

    for (const m of myMemberships) {
      if (m.status !== "active" || seenGroupIds.has(m.groupId)) continue;
      seenGroupIds.add(m.groupId);

      const group = await ctx.db.get(m.groupId);
      if (!group) continue;

      // Count messages in group chat for ranking
      const groupConv = await ctx.db
        .query("conversations")
        .withIndex("by_groupId", (q) => q.eq("groupId", m.groupId))
        .unique();
      let msgCount = 0;
      if (groupConv) {
        const msgs = await ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) =>
            q.eq("conversationId", groupConv._id),
          )
          .take(500);
        msgCount = msgs.length;
      }

      const thumbUrl = group.thumbnailStorageId
        ? ((await ctx.storage.getUrl(group.thumbnailStorageId)) ?? undefined)
        : group.thumbnailUrl;

      targets.push({
        id: m.groupId,
        type: "group",
        name: group.name,
        avatarUrl: thumbUrl,
        subtitle: `${group.memberCount} Mitglieder`,
        messageCount: msgCount,
        section: msgCount >= 5 ? "frequent" : "group",
      });
    }

    /* ── 3. Search: other users or groups ─────────────────────── */
    if (searchLower.length >= 2) {
      // Search users
      const allUsers = await ctx.db.query("users").take(200);
      for (const u of allUsers) {
        if (seenUserIds.has(u._id) || u._id === myUserId) continue;
        if (!u.name.toLowerCase().includes(searchLower)) continue;

        const avatarUrl = u.avatarStorageId
          ? ((await ctx.storage.getUrl(u.avatarStorageId)) ?? undefined)
          : u.avatarUrl;

        targets.push({
          id: u._id,
          type: "user",
          name: u.name,
          avatarUrl,
          subtitle: u.city ?? u.county ?? undefined,
          messageCount: 0,
          section: "other",
        });
      }

      // Search groups
      const searchGroups = await ctx.db
        .query("groups")
        .withSearchIndex("search_name", (q) =>
          q.search("name", searchLower),
        )
        .take(20);
      for (const g of searchGroups) {
        if (seenGroupIds.has(g._id)) continue;
        const thumbUrl = g.thumbnailStorageId
          ? ((await ctx.storage.getUrl(g.thumbnailStorageId)) ?? undefined)
          : g.thumbnailUrl;
        targets.push({
          id: g._id,
          type: "group",
          name: g.name,
          avatarUrl: thumbUrl,
          subtitle: `${g.memberCount} Mitglieder`,
          messageCount: 0,
          section: "other",
        });
      }
    }

    /* ── 4. Sort: frequent first, then friends, then groups ──── */
    const sectionOrder: Record<string, number> = {
      frequent: 0,
      friend: 1,
      group: 2,
      other: 3,
    };
    targets.sort((a, b) => {
      const secDiff = sectionOrder[a.section] - sectionOrder[b.section];
      if (secDiff !== 0) return secDiff;
      return b.messageCount - a.messageCount;
    });

    // Apply text filter for non-search targets too
    const filtered =
      searchLower.length > 0
        ? targets.filter((t) => t.name.toLowerCase().includes(searchLower))
        : targets;

    return filtered.slice(0, 50);
  },
});

/* ── sharePost ────────────────────────────────────────────────── */
export const sharePost = authMutation({
  args: {
    postId: v.id("posts"),
    targetId: v.string(),
    targetType: v.union(v.literal("user"), v.literal("group")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "sharePost", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");

    const me = await ctx.db.get(myUserId);
    const myName = me?.name ?? "Jemand";

    let conversationId: Id<"conversations">;

    if (args.targetType === "user") {
      /* ── Share to DM ───────────────────────────────────────── */
      const targetUserId = args.targetId as Id<"users">;
      const conversationKey = getDirectConversationKey(myUserId, targetUserId);

      const existing = await ctx.db
        .query("conversations")
        .withIndex("by_conversationKey", (q) => q.eq("conversationKey", conversationKey))
        .unique();

      if (existing) {
        conversationId = existing._id;
      } else {
        conversationId = await ctx.db.insert("conversations", {
          type: "direct",
          participantIds: [myUserId, targetUserId],
          conversationKey,
          createdAt: Date.now(),
        });
      }

      // Create notification for the user
      await ctx.db.insert("notifications", {
        userId: targetUserId,
        type: "post_share",
        title: "Beitrag geteilt",
        body: `${myName} hat einen Beitrag mit dir geteilt`,
        referenceId: args.postId,
        isRead: false,
        createdAt: Date.now(),
      });
    } else {
      /* ── Share to Group ─────────────────────────────────────── */
      const groupId = args.targetId as Id<"groups">;

      // Find or create group conversation
      let conv = await ctx.db
        .query("conversations")
        .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
        .unique();

      if (conv) {
        conversationId = conv._id;
      } else {
        conversationId = await ctx.db.insert("conversations", {
          type: "group",
          groupId,
          participantIds: [myUserId],
          createdAt: Date.now(),
        });
      }

      // Notify all group members (except me)
      const members = await ctx.db
        .query("groupMembers")
        .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
        .take(200);
      const group = await ctx.db.get(groupId);
      const groupName = group?.name ?? "Gruppe";

      for (const m of members) {
        if (m.userId === myUserId || m.status !== "active") continue;
        await ctx.db.insert("notifications", {
          userId: m.userId,
          type: "post_share",
          title: "Beitrag geteilt",
          body: `${myName} hat einen Beitrag in ${groupName} geteilt`,
          referenceId: args.postId,
          isRead: false,
          createdAt: Date.now(),
        });
      }
    }

    /* ── Insert the post_share message ─────────────────────────── */
    const postAuthor = await ctx.db.get(post.authorId);
    const caption = post.caption
      ? post.caption.slice(0, 60)
      : post.type === "photo"
        ? "📷 Foto"
        : "🎬 Video";

    await ctx.db.insert("messages", {
      conversationId,
      senderId: myUserId,
      type: "post_share",
      text: `📤 ${postAuthor?.name ?? "Jemand"}: ${caption}`,
      sharedPostId: args.postId,
      createdAt: Date.now(),
    });
    await touchConversationActivity(ctx, conversationId, Date.now());

    return null;
  },
});

/* ── shareProfile ─────────────────────────────────────────────── */
export const shareProfile = authMutation({
  args: {
    profileUserId: v.id("users"),
    targetId: v.string(),
    targetType: v.union(v.literal("user"), v.literal("group")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "sharePost", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const profile = await ctx.db.get(args.profileUserId);
    if (!profile) throw new Error("Profile not found");

    const me = await ctx.db.get(myUserId);
    const myName = me?.name ?? "Jemand";

    let conversationId: Id<"conversations">;

    if (args.targetType === "user") {
      const targetUserId = args.targetId as Id<"users">;
      const conversationKey = getDirectConversationKey(myUserId, targetUserId);
      const existing = await ctx.db
        .query("conversations")
        .withIndex("by_conversationKey", (q) => q.eq("conversationKey", conversationKey))
        .unique();
      if (existing) {
        conversationId = existing._id;
      } else {
        conversationId = await ctx.db.insert("conversations", {
          type: "direct",
          participantIds: [myUserId, targetUserId],
          conversationKey,
          createdAt: Date.now(),
        });
      }
    } else {
      const groupId = args.targetId as Id<"groups">;
      const conv = await ctx.db
        .query("conversations")
        .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
        .unique();
      if (conv) {
        conversationId = conv._id;
      } else {
        conversationId = await ctx.db.insert("conversations", {
          type: "group",
          groupId,
          participantIds: [myUserId],
          createdAt: Date.now(),
        });
      }
    }

    await ctx.db.insert("messages", {
      conversationId,
      senderId: myUserId,
      type: "profile_share",
      text: `👤 ${myName} hat ein Profil geteilt: ${profile.name}`,
      sharedProfileId: args.profileUserId,
      createdAt: Date.now(),
    });
    await touchConversationActivity(ctx, conversationId, Date.now());

    return null;
  },
});
