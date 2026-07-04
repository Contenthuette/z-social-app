import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { authQuery, authMutation } from "./functions";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { buildGroupSearchText, normalizeSearchQuery } from "./searchText";
import { paginatedResultValidator } from "./pagination";
import { rateLimiter, INPUT_LIMITS, validateStringLength, validateArrayLength, sanitizeText } from "./rateLimit";

// Helper to get userId from authId
async function getMyUserId(ctx: { db: QueryCtx["db"]; user: { _id: string } }): Promise<Id<"users"> | null> {
  const authId = ctx.user._id;
  const user = await ctx.db.query("users").withIndex("by_authId", (q) => q.eq("authId", authId)).unique();
  return user?._id ?? null;
}

export const list = authQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    county: v.optional(v.string()),
    city: v.optional(v.string()),
    topic: v.optional(v.string()),
    searchQuery: v.optional(v.string()),
  },
  returns: paginatedResultValidator(
    v.object({
      _id: v.id("groups"),
      name: v.string(),
      description: v.optional(v.string()),
      thumbnailUrl: v.optional(v.string()),
      county: v.optional(v.string()),
      city: v.optional(v.string()),
      topic: v.optional(v.string()),
      interests: v.optional(v.array(v.string())),
      visibility: v.union(v.literal("public"), v.literal("invite_only"), v.literal("request")),
      memberCount: v.number(),
      isMember: v.boolean(),
      isBanned: v.boolean(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    const normalizedQuery = normalizeSearchQuery(args.searchQuery ?? "");

    const results = normalizedQuery
      ? await ctx.db
          .query("groups")
          .withSearchIndex("search_text", (q) =>
            q.search("searchText", normalizedQuery),
          )
          .paginate(args.paginationOpts)
      : args.county && args.city
        ? await ctx.db
            .query("groups")
            .withIndex("by_county_and_city", (q) =>
              q.eq("county", args.county).eq("city", args.city),
            )
            .paginate(args.paginationOpts)
        : args.county
          ? await ctx.db
              .query("groups")
              .withIndex("by_county_and_city", (q) => q.eq("county", args.county))
              .paginate(args.paginationOpts)
          : await ctx.db.query("groups").order("desc").paginate(args.paginationOpts);

    return {
      ...results,
      page: await Promise.all(
        results.page
          .filter((group) => !group.isMemberEventGroup)
          .map(async (group) => {
            const membership = myUserId
              ? await ctx.db
                  .query("groupMembers")
                  .withIndex("by_groupId_and_userId", (q) =>
                    q.eq("groupId", group._id).eq("userId", myUserId),
                  )
                  .unique()
              : null;
            return {
              _id: group._id,
              name: group.name,
              description: group.description,
              thumbnailUrl: group.thumbnailStorageId
                ? ((await ctx.storage.getUrl(group.thumbnailStorageId)) ?? undefined)
                : group.thumbnailUrl,
              county: group.county,
              city: group.city,
              topic: group.topic,
              interests: group.interests,
              visibility: group.visibility,
              memberCount: group.memberCount,
              isMember: membership?.status === "active",
              isBanned: membership?.status === "banned",
              createdAt: group.createdAt,
            };
          }),
      ),
    };
  },
});

/** Up to 3 admin-pinned groups, shown at the top of the Groups list. */
export const listPinned = authQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("groups"),
      name: v.string(),
      description: v.optional(v.string()),
      thumbnailUrl: v.optional(v.string()),
      county: v.optional(v.string()),
      city: v.optional(v.string()),
      topic: v.optional(v.string()),
      visibility: v.union(v.literal("public"), v.literal("invite_only"), v.literal("request")),
      memberCount: v.number(),
      isMember: v.boolean(),
      isBanned: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    const pinned = await ctx.db
      .query("groups")
      .withIndex("by_pinnedAt", (q) => q.gt("pinnedAt", 0))
      .order("asc")
      .take(3);

    return await Promise.all(
      pinned
        .filter((group) => !group.isMemberEventGroup)
        .map(async (group) => {
          const membership = myUserId
            ? await ctx.db
                .query("groupMembers")
                .withIndex("by_groupId_and_userId", (q) =>
                  q.eq("groupId", group._id).eq("userId", myUserId),
                )
                .unique()
            : null;
          return {
            _id: group._id,
            name: group.name,
            description: group.description,
            thumbnailUrl: group.thumbnailStorageId
              ? ((await ctx.storage.getUrl(group.thumbnailStorageId)) ?? undefined)
              : group.thumbnailUrl,
            county: group.county,
            city: group.city,
            topic: group.topic,
            visibility: group.visibility,
            memberCount: group.memberCount,
            isMember: membership?.status === "active",
            isBanned: membership?.status === "banned",
          };
        }),
    );
  },
});

export const getById = query({
  args: { groupId: v.id("groups") },
  returns: v.union(v.null(), v.object({
    _id: v.id("groups"),
    name: v.string(),
    description: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    county: v.optional(v.string()),
    city: v.optional(v.string()),
    topic: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    visibility: v.union(v.literal("public"), v.literal("invite_only"), v.literal("request")),
    memberCount: v.number(),
    creatorId: v.id("users"),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const g = await ctx.db.get(args.groupId);
    if (!g) return null;
    return {
      _id: g._id,
      name: g.name,
      description: g.description,
      thumbnailUrl: g.thumbnailStorageId ? await ctx.storage.getUrl(g.thumbnailStorageId) ?? undefined : g.thumbnailUrl,
      county: g.county,
      city: g.city,
      topic: g.topic,
      interests: g.interests,
      visibility: g.visibility,
      memberCount: g.memberCount,
      creatorId: g.creatorId,
      createdAt: g.createdAt,
    };
  },
});

export const create = authMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    county: v.optional(v.string()),
    city: v.optional(v.string()),
    topic: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    visibility: v.union(v.literal("public"), v.literal("invite_only"), v.literal("request")),
    thumbnailStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("groups"),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "createGroup", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    validateStringLength(args.name, "Gruppenname", INPUT_LIMITS.groupName);
    validateStringLength(args.description, "Beschreibung", INPUT_LIMITS.groupDescription);
    validateStringLength(args.county, "Landkreis", INPUT_LIMITS.county);
    validateStringLength(args.city, "Stadt", INPUT_LIMITS.city);
    validateArrayLength(args.interests, "Interessen", 20);
    const groupId = await ctx.db.insert("groups", {
      ...args,
      searchText: buildGroupSearchText({
        name: args.name,
        description: args.description,
        county: args.county,
        city: args.city,
        topic: args.topic,
        interests: args.interests,
      }),
      creatorId: myUserId,
      memberCount: 1,
      createdAt: Date.now(),
    });
    // Create conversation for group
    await ctx.db.insert("conversations", {
      type: "group",
      groupId,
      createdAt: Date.now(),
    });
    // Creator is admin member
    await ctx.db.insert("groupMembers", {
      groupId,
      userId: myUserId,
      role: "admin",
      status: "active",
      joinedAt: Date.now(),
    });
    return groupId;
  },
});

export const join = authMutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "joinGroup", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    const existing = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", myUserId))
      .unique();
    if (existing?.status === "banned") {
      throw new Error("Du wurdest aus dieser Gruppe gebannt und kannst nicht mehr beitreten.");
    }
    if (existing) return null;
    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");
    const needsApproval = group.visibility === "invite_only" || group.visibility === "request";
    const status = needsApproval ? "pending" as const : "active" as const;
    await ctx.db.insert("groupMembers", {
      groupId: args.groupId,
      userId: myUserId,
      role: "member",
      status,
      joinedAt: Date.now(),
    });
    if (status === "active") {
      await ctx.db.patch(args.groupId, { memberCount: group.memberCount + 1 });
    } else {
      const me = await ctx.db.get(myUserId);
      const adminMembers = await ctx.db.query("groupMembers")
        .withIndex("by_groupId_and_status_and_role", (q) =>
          q.eq("groupId", args.groupId).eq("status", "active").eq("role", "admin"),
        )
        .collect();
      await Promise.all(
        adminMembers.map((admin) =>
          ctx.db.insert("notifications", {
            userId: admin.userId,
            type: "join_request",
            title: "Beitrittsanfrage",
            body: `${me?.name ?? "Jemand"} möchte der Gruppe "${group.name}" beitreten.`,
            referenceId: args.groupId,
            isRead: false,
            createdAt: Date.now(),
          }),
        ),
      );
    }
    return null;
  },
});

export const acceptRequest = authMutation({
  args: {
    groupId: v.id("groups"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    // Verify caller is admin
    const myMembership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", myUserId))
      .unique();
    if (!myMembership || myMembership.role !== "admin") {
      throw new Error("Nur Admins können Anfragen bearbeiten");
    }
    // Find pending membership
    const membership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", args.userId))
      .unique();
    if (!membership || membership.status !== "pending") {
      throw new Error("Keine offene Anfrage gefunden");
    }
    await ctx.db.patch(membership._id, { status: "active", joinedAt: Date.now() });
    const group = await ctx.db.get(args.groupId);
    if (group) {
      await ctx.db.patch(args.groupId, { memberCount: group.memberCount + 1 });
    }
    // Notify the user
    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "join_accepted",
      title: "Anfrage angenommen",
      body: `Deine Anfrage für die Gruppe "${group?.name ?? ""}" wurde angenommen!`,
      referenceId: args.groupId,
      isRead: false,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const rejectRequest = authMutation({
  args: {
    groupId: v.id("groups"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    // Verify caller is admin
    const myMembership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", myUserId))
      .unique();
    if (!myMembership || myMembership.role !== "admin") {
      throw new Error("Nur Admins können Anfragen bearbeiten");
    }
    // Find pending membership
    const membership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", args.userId))
      .unique();
    if (!membership || membership.status !== "pending") {
      throw new Error("Keine offene Anfrage gefunden");
    }
    await ctx.db.delete(membership._id);
    // Notify the user
    const group = await ctx.db.get(args.groupId);
    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "join_rejected",
      title: "Anfrage abgelehnt",
      body: `Deine Anfrage für die Gruppe "${group?.name ?? ""}" wurde leider abgelehnt.`,
      referenceId: args.groupId,
      isRead: false,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const getPendingRequests = authQuery({
  args: { groupId: v.id("groups") },
  returns: v.array(v.object({
    _id: v.id("groupMembers"),
    userId: v.id("users"),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    requestedAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return [];
    const myMembership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", myUserId))
      .unique();
    if (!myMembership || myMembership.role !== "admin") return [];

    const pendingMembers = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_status_and_role", (q) =>
        q.eq("groupId", args.groupId).eq("status", "pending"),
      )
      .collect();

    return (await Promise.all(
      pendingMembers.map(async (member) => {
        const user = await ctx.db.get(member.userId);
        if (!user) return null;
        return {
          _id: member._id,
          userId: member.userId,
          name: user.name,
          avatarUrl: user.avatarStorageId
            ? ((await ctx.storage.getUrl(user.avatarStorageId)) ?? undefined)
            : user.avatarUrl,
          requestedAt: member.joinedAt,
        };
      }),
    )).flatMap((member) => (member ? [member] : []));
  },
});

export const leave = authMutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    const membership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", myUserId))
      .unique();
    if (!membership) return null;
    // Banned memberships must persist so the user cannot rejoin.
    if (membership.status === "banned") return null;
    await ctx.db.delete(membership._id);
    const group = await ctx.db.get(args.groupId);
    if (group && group.memberCount > 0) {
      await ctx.db.patch(args.groupId, { memberCount: group.memberCount - 1 });
    }
    return null;
  },
});

// ── Personal group pins (per-user, max 3 — separate from admin pins) ──

/** The current user's personally pinned groupIds, newest pin first. */
export const myPinnedGroupIds = authQuery({
  args: {},
  returns: v.array(v.id("groups")),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return [];
    const pins = await ctx.db
      .query("groupPins")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .collect();
    return pins
      .sort((a, b) => b.pinnedAt - a.pinnedAt)
      .map((p) => p.groupId);
  },
});

/** Pin/unpin a group for the current user only (max 3 pins). */
export const togglePersonalPin = authMutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    const existing = await ctx.db
      .query("groupPins")
      .withIndex("by_userId_and_groupId", (q) =>
        q.eq("userId", myUserId).eq("groupId", args.groupId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return null;
    }
    const myPins = await ctx.db
      .query("groupPins")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .collect();
    if (myPins.length >= 3) {
      throw new Error("Du kannst maximal 3 Gruppen anpinnen.");
    }
    await ctx.db.insert("groupPins", {
      userId: myUserId,
      groupId: args.groupId,
      pinnedAt: Date.now(),
    });
    return null;
  },
});

// Permanently ban a member from the group (group creator or admin only)
export const banMember = authMutation({
  args: { groupId: v.id("groups"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Gruppe nicht gefunden");

    const myMembership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", myUserId))
      .unique();
    const isCreator = group.creatorId === myUserId;
    if (!isCreator && (!myMembership || myMembership.role !== "admin")) {
      throw new Error("Nur Gruppen-Admins können Mitglieder bannen");
    }
    if (args.userId === myUserId) throw new Error("Du kannst dich nicht selbst bannen");
    if (args.userId === group.creatorId) throw new Error("Der Ersteller kann nicht gebannt werden");

    const membership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", args.userId))
      .unique();
    if (membership) {
      if (membership.status === "banned") return null;
      const wasActive = membership.status === "active";
      await ctx.db.patch(membership._id, { status: "banned" as const, role: "member" as const });
      if (wasActive && group.memberCount > 0) {
        await ctx.db.patch(args.groupId, { memberCount: group.memberCount - 1 });
      }
    } else {
      await ctx.db.insert("groupMembers", {
        groupId: args.groupId,
        userId: args.userId,
        role: "member",
        status: "banned",
        joinedAt: Date.now(),
      });
    }
    return null;
  },
});

// Remove a member from the group (group creator or admin only)
export const kickMember = authMutation({
  args: { groupId: v.id("groups"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Gruppe nicht gefunden");

    const myMembership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", myUserId))
      .unique();
    const isCreator = group.creatorId === myUserId;
    if (!isCreator && (!myMembership || myMembership.role !== "admin")) {
      throw new Error("Nur Gruppen-Admins können Mitglieder entfernen");
    }
    if (args.userId === myUserId) throw new Error("Du kannst dich nicht selbst entfernen");
    if (args.userId === group.creatorId) throw new Error("Der Ersteller kann nicht entfernt werden");

    const membership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", args.userId))
      .unique();
    if (!membership) return null;
    // Kicking must not lift a permanent ban.
    if (membership.status === "banned") return null;

    const wasActive = membership.status === "active";
    await ctx.db.delete(membership._id);
    if (wasActive && group.memberCount > 0) {
      await ctx.db.patch(args.groupId, { memberCount: group.memberCount - 1 });
    }

    await ctx.db.insert("notifications", {
      userId: args.userId,
      senderId: myUserId,
      type: "group_kicked",
      title: "Aus Gruppe entfernt",
      body: `Du wurdest aus der Gruppe "${group.name}" entfernt.`,
      referenceId: args.groupId,
      isRead: false,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const getMembers = query({
  args: { groupId: v.id("groups") },
  returns: v.array(v.object({
    _id: v.id("groupMembers"),
    userId: v.id("users"),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("member")),
    status: v.union(v.literal("active"), v.literal("pending"), v.literal("banned")),
  })),
  handler: async (ctx, args) => {
    const members = await ctx.db.query("groupMembers")
      .withIndex("by_groupId", q => q.eq("groupId", args.groupId))
      .collect();
    const results = [];
    for (const m of members) {
      const user = await ctx.db.get(m.userId);
      if (user) {
        results.push({
          _id: m._id,
          userId: m.userId,
          name: user.name,
          avatarUrl: user.avatarStorageId ? await ctx.storage.getUrl(user.avatarStorageId) ?? undefined : user.avatarUrl,
          role: m.role,
          status: m.status,
        });
      }
    }
    return results;
  },
});

/** Unread message counts for the current user's active groups (for badges). */
export const myGroupUnread = authQuery({
  args: {},
  returns: v.array(v.object({ groupId: v.id("groups"), count: v.number() })),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return [];

    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_userId", (q) => q.eq("userId", myUserId))
      .take(200);
    const activeGroupIds = memberships
      .filter((m) => m.status === "active")
      .map((m) => m.groupId);

    const results: Array<{ groupId: Id<"groups">; count: number }> = [];
    for (const groupId of activeGroupIds) {
      const conv = await ctx.db
        .query("conversations")
        .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
        .first();
      if (!conv) continue;
      const rs = await ctx.db
        .query("conversationReadStatus")
        .withIndex("by_conversationId_and_userId", (q) =>
          q.eq("conversationId", conv._id).eq("userId", myUserId),
        )
        .unique();
      const lastReadAt = rs?.lastReadAt ?? 0;
      const unread = await ctx.db
        .query("messages")
        .withIndex("by_conversationId_and_createdAt", (q) =>
          q.eq("conversationId", conv._id).gt("createdAt", lastReadAt),
        )
        .take(50);
      const count = unread.filter((m) => m.senderId !== myUserId).length;
      if (count > 0) results.push({ groupId, count });
    }
    return results;
  },
});

export const getMyMembership = authQuery({
  args: { groupId: v.id("groups") },
  returns: v.union(v.null(), v.object({
    _id: v.id("groupMembers"),
    role: v.union(v.literal("admin"), v.literal("member")),
    status: v.union(v.literal("active"), v.literal("pending"), v.literal("banned")),
  })),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return null;
    const membership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", q => q.eq("groupId", args.groupId).eq("userId", myUserId))
      .unique();
    if (!membership) return null;
    return { _id: membership._id, role: membership.role, status: membership.status };
  },
});

export const update = authMutation({
  args: {
    groupId: v.id("groups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    county: v.optional(v.string()),
    city: v.optional(v.string()),
    topic: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    visibility: v.optional(v.union(v.literal("public"), v.literal("invite_only"), v.literal("request"))),
    thumbnailStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "createGroup", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    validateStringLength(args.name, "Gruppenname", INPUT_LIMITS.groupName);
    validateStringLength(args.description, "Beschreibung", INPUT_LIMITS.groupDescription);
    validateStringLength(args.county, "Landkreis", INPUT_LIMITS.county);
    validateStringLength(args.city, "Stadt", INPUT_LIMITS.city);
    validateArrayLength(args.interests, "Interessen", 20);

    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");

    // Verify user is admin of this group
    const membership = await ctx.db.query("groupMembers")
      .withIndex("by_groupId_and_userId", (q) => q.eq("groupId", args.groupId).eq("userId", myUserId))
      .unique();
    if (!membership || membership.role !== "admin") {
      throw new Error("Only group admins can edit this group");
    }

    const nextName = args.name !== undefined ? args.name : group.name;
    const nextDescription = args.description !== undefined ? args.description : group.description;
    const nextCounty = args.county !== undefined ? args.county : group.county;
    const nextCity = args.city !== undefined ? args.city : group.city;
    const nextTopic = args.topic !== undefined ? args.topic : group.topic;
    const nextInterests = args.interests !== undefined ? args.interests : group.interests;

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.county !== undefined) patch.county = args.county;
    if (args.city !== undefined) patch.city = args.city;
    if (args.topic !== undefined) patch.topic = args.topic;
    if (args.interests !== undefined) patch.interests = args.interests;
    if (args.visibility !== undefined) patch.visibility = args.visibility;
    if (args.thumbnailStorageId !== undefined) patch.thumbnailStorageId = args.thumbnailStorageId;

    if (Object.keys(patch).length > 0) {
      patch.searchText = buildGroupSearchText({
        name: nextName,
        description: nextDescription,
        county: nextCounty,
        city: nextCity,
        topic: nextTopic,
        interests: nextInterests,
      });
      await ctx.db.patch(args.groupId, patch);
    }
    return null;
  },
});

export const generateUploadUrl = authMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// ── Delete group (creator only) ─────────────────────────────────
export const deleteGroup = authMutation({
  args: { groupId: v.id("groups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Gruppe nicht gefunden");
    if (group.creatorId !== myUserId) {
      throw new Error("Nur der Gruppenadmin kann diese Gruppe löschen");
    }

    // Notify all members
    const members = await ctx.db
      .query("groupMembers")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .collect();
    await Promise.all(
      members
        .filter((m) => m.userId !== myUserId && m.status === "active")
        .map((m) =>
          ctx.db.insert("notifications", {
            userId: m.userId,
            type: "group_deleted",
            title: "Gruppe gelöscht",
            body: `Gruppenadmin hat die Gruppe "${group.name}" gelöscht.`,
            isRead: false,
            createdAt: Date.now(),
          }),
        ),
    );

    // Delete all members
    for (const m of members) {
      await ctx.db.delete(m._id);
    }

    // Delete group conversations and messages
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .collect();
    for (const conv of conversations) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversationId", (q) => q.eq("conversationId", conv._id))
        .collect();
      for (const msg of messages) {
        await ctx.db.delete(msg._id);
      }
      await ctx.db.delete(conv._id);
    }

    // Delete thumbnail from storage
    if (group.thumbnailStorageId) {
      await ctx.storage.delete(group.thumbnailStorageId);
    }

    // If linked to member event, also delete it
    if (group.isMemberEventGroup && group.memberEventId) {
      const event = await ctx.db.get(group.memberEventId);
      if (event) {
        if (event.thumbnailStorageId) {
          await ctx.storage.delete(event.thumbnailStorageId);
        }
        await ctx.db.delete(event._id);
      }
    }

    await ctx.db.delete(args.groupId);
    return null;
  },
});
