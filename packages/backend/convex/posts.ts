import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { internal } from "./_generated/api";
import { authQuery, authMutation } from "./functions";
import type { Id, Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { paginatedResultValidator } from "./pagination";
import { rateLimiter, INPUT_LIMITS, validateStringLength, sanitizeText } from "./rateLimit";

export const generateUploadUrl = authMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await rateLimiter.limit(ctx, "postUploadUrl", { key: ctx.user._id });
    return await ctx.storage.generateUploadUrl();
  },
});

async function getMyUserId(ctx: any): Promise<Id<"users"> | null> {
  const authId = ctx.user._id;
  const user = await ctx.db.query("users").withIndex("by_authId", (q: any) => q.eq("authId", authId)).unique();
  return user?._id ?? null;
}

// ── Shared helpers ──────────────────────────────────────────────
type AuthorCache = Map<Id<"users">, Doc<"users"> | null>;
type UrlCache = Map<Id<"_storage">, string | null>;

async function batchGetAuthors(
  ctx: { db: QueryCtx["db"] },
  ids: Array<Id<"users">>,
): Promise<AuthorCache> {
  const unique = [...new Set(ids)];
  const cache: AuthorCache = new Map();
  await Promise.all(
    unique.map(async (id) => {
      cache.set(id, await ctx.db.get(id));
    }),
  );
  return cache;
}

async function batchGetUrls(
  ctx: { storage: QueryCtx["storage"] },
  ids: Array<Id<"_storage"> | undefined>,
): Promise<UrlCache> {
  const unique = [...new Set(ids.filter((id): id is Id<"_storage"> => !!id))];
  const cache: UrlCache = new Map();
  await Promise.all(
    unique.map(async (id) => {
      cache.set(id, await ctx.storage.getUrl(id));
    }),
  );
  return cache;
}

function getAuthorAvatarUrl(author: Doc<"users"> | null | undefined, urlCache: UrlCache): string | undefined {
  if (!author) return undefined;
  if (author.avatarStorageId) return urlCache.get(author.avatarStorageId) ?? undefined;
  return author.avatarUrl;
}

const feedItemValidator = v.object({
  _id: v.id("posts"),
  authorId: v.id("users"),
  authorName: v.string(),
  authorAvatarUrl: v.optional(v.string()),
  type: v.union(v.literal("photo"), v.literal("video")),
  caption: v.optional(v.string()),
  mediaUrl: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
  aspectMode: v.optional(v.union(v.literal("original"), v.literal("cropped"))),
  cropOffsetY: v.optional(v.number()),
  cropOffsetX: v.optional(v.number()),
  cropZoom: v.optional(v.number()),
  mediaAspectRatio: v.optional(v.number()),
  location: v.optional(v.string()),
  likeCount: v.number(),
  commentCount: v.number(),
  isLiked: v.boolean(),
  isSaved: v.boolean(),
  isPinned: v.boolean(),
  isAnnouncement: v.boolean(),
  isOwn: v.boolean(),
  createdAt: v.number(),
});

// Feed - get posts with real pagination
export const feed = authQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginatedResultValidator(feedItemValidator),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);

    const results = await ctx.db
      .query("posts")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(args.paginationOpts);

    const posts = results.page;
    const authorCache = await batchGetAuthors(
      ctx,
      posts.map((post) => post.authorId),
    );

    const storageIds: Array<Id<"_storage"> | undefined> = [];
    for (const post of posts) {
      storageIds.push(post.mediaStorageId, post.thumbnailStorageId);
    }
    for (const author of authorCache.values()) {
      storageIds.push(author?.avatarStorageId);
    }
    const urlCache = await batchGetUrls(ctx, storageIds);

    const [likeChecks, saveChecks] = await Promise.all([
      myUserId
        ? Promise.all(
            posts.map((post) =>
              ctx.db
                .query("likes")
                .withIndex("by_postId_and_userId", (q) =>
                  q.eq("postId", post._id).eq("userId", myUserId),
                )
                .unique(),
            ),
          )
        : Promise.resolve(posts.map(() => null)),
      myUserId
        ? Promise.all(
            posts.map((post) =>
              ctx.db
                .query("savedPosts")
                .withIndex("by_postId_and_userId", (q) =>
                  q.eq("postId", post._id).eq("userId", myUserId),
                )
                .unique(),
            ),
          )
        : Promise.resolve(posts.map(() => null)),
    ]);

    return {
      ...results,
      page: posts.map((post, index) => {
        const author = authorCache.get(post.authorId);
        return {
          _id: post._id,
          authorId: post.authorId,
          authorName: author?.name ?? "Unknown",
          authorAvatarUrl: getAuthorAvatarUrl(author, urlCache),
          type: post.type,
          caption: post.caption,
          mediaUrl: post.mediaStorageId
            ? (urlCache.get(post.mediaStorageId) ?? undefined)
            : post.mediaUrl,
          thumbnailUrl: post.thumbnailStorageId
            ? (urlCache.get(post.thumbnailStorageId) ?? undefined)
            : post.thumbnailUrl,
          aspectMode: post.aspectMode,
          cropOffsetY: post.cropOffsetY,
          cropOffsetX: post.cropOffsetX,
          cropZoom: post.cropZoom,
          mediaAspectRatio: post.mediaAspectRatio,
          location: post.location,
          likeCount: post.likeCount,
          commentCount: post.commentCount,
          isLiked: !!likeChecks[index],
          isSaved: !!saveChecks[index],
          isPinned: post.isPinned,
          isAnnouncement: post.isAnnouncement,
          isOwn: myUserId === post.authorId,
          createdAt: post.createdAt,
        };
      }),
    };
  },
});

// Get single post by ID
export const getById = authQuery({
  args: { postId: v.id("posts") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("posts"),
      authorId: v.id("users"),
      authorName: v.string(),
      authorAvatarUrl: v.optional(v.string()),
      type: v.union(v.literal("photo"), v.literal("video")),
      caption: v.optional(v.string()),
      mediaUrl: v.optional(v.string()),
      thumbnailUrl: v.optional(v.string()),
      aspectMode: v.optional(v.union(v.literal("original"), v.literal("cropped"))),
      cropOffsetY: v.optional(v.number()),
      cropOffsetX: v.optional(v.number()),
      cropZoom: v.optional(v.number()),
      mediaAspectRatio: v.optional(v.number()),
      location: v.optional(v.string()),
      likeCount: v.number(),
      commentCount: v.number(),
      isLiked: v.boolean(),
      isSaved: v.boolean(),
      isPinned: v.boolean(),
      isAnnouncement: v.boolean(),
      isOwn: v.boolean(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;

    const myUserId = await getMyUserId(ctx);
    
    // Parallel: author + like + save + URLs
    const [author, like, saved, mediaUrl, thumbnailUrl] = await Promise.all([
      ctx.db.get(post.authorId),
      myUserId
        ? ctx.db.query("likes")
            .withIndex("by_postId_and_userId", q => q.eq("postId", post._id).eq("userId", myUserId))
            .unique()
        : null,
      myUserId
        ? ctx.db.query("savedPosts")
            .withIndex("by_postId_and_userId", q => q.eq("postId", post._id).eq("userId", myUserId))
            .unique()
        : null,
      post.mediaStorageId ? ctx.storage.getUrl(post.mediaStorageId) : null,
      post.thumbnailStorageId ? ctx.storage.getUrl(post.thumbnailStorageId) : null,
    ]);
    
    const avatarUrl = author?.avatarStorageId
      ? await ctx.storage.getUrl(author.avatarStorageId)
      : null;

    return {
      _id: post._id,
      authorId: post.authorId,
      authorName: author?.name ?? "Unknown",
      authorAvatarUrl: avatarUrl ?? author?.avatarUrl,
      type: post.type,
      caption: post.caption,
      mediaUrl: mediaUrl ?? post.mediaUrl,
      thumbnailUrl: thumbnailUrl ?? post.thumbnailUrl,
      aspectMode: post.aspectMode,
      cropOffsetY: post.cropOffsetY,
      cropOffsetX: post.cropOffsetX,
      cropZoom: post.cropZoom,
      mediaAspectRatio: post.mediaAspectRatio,
      location: post.location,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      isLiked: !!like,
      isSaved: !!saved,
      isPinned: post.isPinned,
      isAnnouncement: post.isAnnouncement,
      isOwn: myUserId === post.authorId,
      createdAt: post.createdAt,
    };
  },
});

// Create post
export const create = authMutation({
  args: {
    type: v.union(v.literal("photo"), v.literal("video")),
    caption: v.optional(v.string()),
    mediaStorageId: v.optional(v.id("_storage")),
    thumbnailStorageId: v.optional(v.id("_storage")),
    aspectMode: v.optional(v.union(v.literal("original"), v.literal("cropped"))),
    cropOffsetY: v.optional(v.number()),
    cropOffsetX: v.optional(v.number()),
    cropZoom: v.optional(v.number()),
    mediaAspectRatio: v.optional(v.number()),
    location: v.optional(v.string()),
    isAnnouncement: v.optional(v.boolean()),
  },
  returns: v.id("posts"),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "createPost", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    if (!args.mediaStorageId) throw new Error("Media upload is required");
    if (args.caption && args.caption.length > 2_000) {
      throw new Error("Caption is too long");
    }
    const user = await ctx.db.get(myUserId);
    const isAdmin = user?.role === "admin";
    const isAnnouncement = args.isAnnouncement && isAdmin;
    return await ctx.db.insert("posts", {
      authorId: myUserId,
      type: args.type,
      caption: args.caption,
      mediaStorageId: args.mediaStorageId,
      thumbnailStorageId: args.thumbnailStorageId,
      aspectMode: args.aspectMode,
      cropOffsetY: args.cropOffsetY,
      cropOffsetX: args.cropOffsetX,
      cropZoom: args.cropZoom,
      mediaAspectRatio: args.mediaAspectRatio,
      location: args.location,
      likeCount: 0,
      commentCount: 0,
      isPinned: isAnnouncement ?? false,
      isAnnouncement: isAnnouncement ?? false,
      createdAt: Date.now(),
    });
  },
});

// Delete post (owner or admin, cleans up all related data)
export const deletePost = authMutation({
  args: { postId: v.id("posts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Beitrag nicht gefunden");

    // Allow owner or admin
    const me = await ctx.db.get(myUserId);
    if (post.authorId !== myUserId && me?.role !== "admin") {
      throw new Error("Nur der Autor oder ein Admin kann diesen Beitrag löschen");
    }

    const [likes, comments, savedPosts] = await Promise.all([
      ctx.db
        .query("likes")
        .withIndex("by_postId", (q) => q.eq("postId", args.postId))
        .collect(),
      ctx.db
        .query("comments")
        .withIndex("by_postId", (q) => q.eq("postId", args.postId))
        .collect(),
      ctx.db
        .query("savedPosts")
        .withIndex("by_postId_and_userId", (q) => q.eq("postId", args.postId))
        .collect(),
    ]);

    const commentLikeGroups = await Promise.all(
      comments.map((comment) =>
        ctx.db
          .query("commentLikes")
          .withIndex("by_commentId", (q) => q.eq("commentId", comment._id))
          .collect(),
      ),
    );

    await Promise.all([
      ...likes.map((like) => ctx.db.delete(like._id)),
      ...savedPosts.map((savedPost) => ctx.db.delete(savedPost._id)),
      ...commentLikeGroups.flat().map((commentLike) => ctx.db.delete(commentLike._id)),
      ...comments.map((comment) => ctx.db.delete(comment._id)),
    ]);

    if (post.mediaStorageId) {
      await ctx.storage.delete(post.mediaStorageId);
    }
    if (post.thumbnailStorageId) {
      await ctx.storage.delete(post.thumbnailStorageId);
    }

    await ctx.db.delete(args.postId);
    return null;
  },
});

// Report post
export const reportPost = authMutation({
  args: {
    postId: v.id("posts"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    if (!args.reason || args.reason.trim().length < 3) {
      throw new Error("Bitte gib einen Grund an");
    }
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_reporterId_and_targetId", (q) =>
        q.eq("reporterId", myUserId).eq("targetId", args.postId as string),
      )
      .first();
    if (existing) throw new Error("Du hast diesen Beitrag bereits gemeldet");
    await ctx.db.insert("reports", {
      reporterId: myUserId,
      type: "post",
      targetId: args.postId as string,
      reason: args.reason.trim(),
      status: "pending",
      createdAt: Date.now(),
    });
    return null;
  },
});

// Admin: list post reports
export const listReports = authQuery({
  args: { status: v.optional(v.union(v.literal("pending"), v.literal("reviewed"), v.literal("resolved"))) },
  returns: v.array(
    v.object({
      _id: v.id("reports"),
      postId: v.string(),
      reporterName: v.string(),
      reason: v.string(),
      status: v.union(v.literal("pending"), v.literal("reviewed"), v.literal("resolved")),
      postCaption: v.optional(v.string()),
      postAuthorName: v.string(),
      postAuthorId: v.optional(v.id("users")),
      postMediaUrl: v.optional(v.string()),
      postType: v.union(v.literal("photo"), v.literal("video")),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const authId = ctx.user._id;
    const me = await ctx.db.query("users").withIndex("by_authId", (q) => q.eq("authId", authId)).unique();
    if (!me || me.role !== "admin") return [];
    const statusFilter = args.status ?? "pending";
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_type_and_status", (q) => q.eq("type", "post").eq("status", statusFilter))
      .order("desc")
      .take(100);
    if (reports.length === 0) return [];
    const results = await Promise.all(
      reports.map(async (r) => {
        const reporter = await ctx.db.get(r.reporterId);
        const postId = r.targetId as Id<"posts">;
        const post = await ctx.db.get(postId);
        const author = post ? await ctx.db.get(post.authorId) : null;
        const mediaUrl = post?.mediaStorageId ? await ctx.storage.getUrl(post.mediaStorageId) : null;
        return {
          _id: r._id,
          postId: r.targetId,
          reporterName: reporter?.name ?? "Unbekannt",
          reason: r.reason,
          status: r.status,
          postCaption: post?.caption,
          postAuthorName: author?.name ?? "Geloescht",
          postAuthorId: post?.authorId,
          postMediaUrl: mediaUrl ?? undefined,
          postType: post?.type ?? ("photo" as const),
          createdAt: r.createdAt,
        };
      }),
    );
    return results;
  },
});

// Admin: resolve a report
export const resolveReport = authMutation({
  args: {
    reportId: v.id("reports"),
    action: v.union(v.literal("dismiss"), v.literal("remove")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const authId = ctx.user._id;
    const me = await ctx.db.query("users").withIndex("by_authId", (q) => q.eq("authId", authId)).unique();
    if (!me || me.role !== "admin") throw new Error("Nur Admins");
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Meldung nicht gefunden");
    const postId = report.targetId as Id<"posts">;
    if (args.action === "remove") {
      const post = await ctx.db.get(postId);
      if (post) {
        const [likes, comments, savedPosts] = await Promise.all([
          ctx.db.query("likes").withIndex("by_postId", (q) => q.eq("postId", postId)).collect(),
          ctx.db.query("comments").withIndex("by_postId", (q) => q.eq("postId", postId)).collect(),
          ctx.db.query("savedPosts").withIndex("by_postId_and_userId", (q) => q.eq("postId", postId)).collect(),
        ]);
        await Promise.all([
          ...likes.map((l) => ctx.db.delete(l._id)),
          ...savedPosts.map((s) => ctx.db.delete(s._id)),
          ...comments.map((c) => ctx.db.delete(c._id)),
        ]);
        if (post.mediaStorageId) await ctx.storage.delete(post.mediaStorageId);
        if (post.thumbnailStorageId) await ctx.storage.delete(post.thumbnailStorageId);
        await ctx.db.delete(postId);
      }
      await ctx.db.patch(args.reportId, { status: "resolved" as const, resolvedAt: Date.now() });
    } else {
      await ctx.db.patch(args.reportId, { status: "reviewed" as const, resolvedAt: Date.now() });
    }
    return null;
  },
});

// Like
export const toggleLike = authMutation({
  args: { postId: v.id("posts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "toggleLike", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    const existing = await ctx.db.query("likes")
      .withIndex("by_postId_and_userId", q => q.eq("postId", args.postId).eq("userId", myUserId))
      .unique();
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(args.postId, { likeCount: Math.max(0, post.likeCount - 1) });
    } else {
      await ctx.db.insert("likes", { postId: args.postId, userId: myUserId, createdAt: Date.now() });
      await ctx.db.patch(args.postId, { likeCount: post.likeCount + 1 });

      // Notify the post author about the new like (skip self-likes)
      if (post.authorId !== myUserId) {
        const liker = await ctx.db.get(myUserId);
        const likerName = liker?.name ?? "Jemand";
        // Avoid duplicate unread like-notifications from the same user for this post
        const recentLikeNotif = await ctx.db
          .query("notifications")
          .withIndex("by_userId", (q) => q.eq("userId", post.authorId))
          .order("desc")
          .take(20);
        const alreadyNotified = recentLikeNotif.some(
          (n) => n.type === "like" && !n.isRead && String(n.referenceId) === String(args.postId) && n.senderId === myUserId,
        );
        if (!alreadyNotified) {
          await ctx.db.insert("notifications", {
            userId: post.authorId,
            senderId: myUserId,
            type: "like",
            title: "Neuer Like",
            body: `${likerName} gefällt dein Beitrag.`,
            referenceId: args.postId,
            isRead: false,
            createdAt: Date.now(),
          });
          await ctx.scheduler.runAfter(0, internal.pushNotifications.sendToUser, {
            userId: post.authorId,
            title: "Neuer Like",
            body: `${likerName} gefällt dein Beitrag.`,
            data: { type: "like", postId: String(args.postId) },
          });
        }
      }
    }
    return null;
  },
});

// Save
export const toggleSave = authMutation({
  args: { postId: v.id("posts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "toggleSave", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    const existing = await ctx.db.query("savedPosts")
      .withIndex("by_postId_and_userId", q => q.eq("postId", args.postId).eq("userId", myUserId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    } else {
      await ctx.db.insert("savedPosts", { postId: args.postId, userId: myUserId, createdAt: Date.now() });
    }
    return null;
  },
});

// Comments (optimized)
export const getComments = query({
  args: { postId: v.id("posts"), currentUserId: v.optional(v.id("users")) },
  returns: v.array(v.object({
    _id: v.id("comments"),
    authorId: v.id("users"),
    authorName: v.string(),
    authorAvatarUrl: v.optional(v.string()),
    text: v.string(),
    likeCount: v.number(),
    isLiked: v.boolean(),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const comments = await ctx.db.query("comments")
      .withIndex("by_postId", q => q.eq("postId", args.postId))
      .order("desc")
      .take(100);
    
    if (comments.length === 0) return [];
    
    // Batch-fetch all authors in parallel
    const authorIds = comments.map(c => c.authorId);
    const authorCache = await batchGetAuthors(ctx, authorIds);
    
    // Batch avatar URLs
    const avatarStorageIds = [...authorCache.values()]
      .filter((a): a is Doc<"users"> => !!a?.avatarStorageId)
      .map(a => a.avatarStorageId!);
    const urlCache = await batchGetUrls(ctx, avatarStorageIds);
    
    // Batch-fetch like checks in parallel
    const currentUserId = args.currentUserId;
    const likeChecks = currentUserId
      ? await Promise.all(
          comments.map(c =>
            ctx.db.query("commentLikes")
              .withIndex("by_commentId_and_userId", q => q.eq("commentId", c._id).eq("userId", currentUserId))
              .first()
          ),
        )
      : comments.map(() => null);
    
    return comments.map((c, i) => {
      const author = authorCache.get(c.authorId);
      return {
        _id: c._id,
        authorId: c.authorId,
        authorName: author?.name ?? "Unknown",
        authorAvatarUrl: getAuthorAvatarUrl(author, urlCache),
        text: c.text,
        likeCount: c.likeCount ?? 0,
        isLiked: !!likeChecks[i],
        createdAt: c.createdAt,
      };
    });
  },
});

export const addComment = authMutation({
  args: { postId: v.id("posts"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "addComment", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    const text = sanitizeText(args.text);
    validateStringLength(text, "Kommentar", INPUT_LIMITS.commentText);
    if (!text) throw new Error("Kommentar darf nicht leer sein");
    await ctx.db.insert("comments", { postId: args.postId, authorId: myUserId, text, likeCount: 0, createdAt: Date.now() });
    const post = await ctx.db.get(args.postId);
    if (post) {
      await ctx.db.patch(args.postId, { commentCount: post.commentCount + 1 });
    }
    return null;
  },
});

export const deleteComment = authMutation({
  args: { commentId: v.id("comments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const authId = ctx.user._id;
    const user = await ctx.db.query("users").withIndex("by_authId", (q) => q.eq("authId", authId)).unique();
    if (!user) throw new Error("User not found");
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");
    if (comment.authorId !== user._id) throw new Error("Not your comment");
    await ctx.db.delete(args.commentId);
    // Decrement comment count on the post
    const post = await ctx.db.get(comment.postId);
    if (post && (post.commentCount ?? 0) > 0) {
      await ctx.db.patch(comment.postId, { commentCount: (post.commentCount ?? 1) - 1 });
    }
    return null;
  },
});

export const toggleCommentLike = authMutation({
  args: { commentId: v.id("comments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "toggleCommentLike", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    const existing = await ctx.db.query("commentLikes")
      .withIndex("by_commentId_and_userId", q => q.eq("commentId", args.commentId).eq("userId", myUserId))
      .first();
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(args.commentId, { likeCount: Math.max(0, (comment.likeCount ?? 0) - 1) });
    } else {
      await ctx.db.insert("commentLikes", { commentId: args.commentId, userId: myUserId, createdAt: Date.now() });
      await ctx.db.patch(args.commentId, { likeCount: (comment.likeCount ?? 0) + 1 });
    }
    return null;
  },
});

export const likeComment = authMutation({
  args: { commentId: v.id("comments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "toggleCommentLike", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    const existing = await ctx.db.query("commentLikes")
      .withIndex("by_commentId_and_userId", q => q.eq("commentId", args.commentId).eq("userId", myUserId))
      .first();
    if (existing) return null;
    await ctx.db.insert("commentLikes", { commentId: args.commentId, userId: myUserId, createdAt: Date.now() });
    const comment = await ctx.db.get(args.commentId);
    if (comment) {
      await ctx.db.patch(args.commentId, { likeCount: (comment.likeCount ?? 0) + 1 });
    }
    return null;
  },
});

export const unlikeComment = authMutation({
  args: { commentId: v.id("comments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "toggleCommentLike", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    const existing = await ctx.db.query("commentLikes")
      .withIndex("by_commentId_and_userId", q => q.eq("commentId", args.commentId).eq("userId", myUserId))
      .first();
    if (!existing) return null;
    await ctx.db.delete(existing._id);
    const comment = await ctx.db.get(args.commentId);
    if (comment) {
      await ctx.db.patch(args.commentId, { likeCount: Math.max(0, (comment.likeCount ?? 0) - 1) });
    }
    return null;
  },
});

// Saved posts
export const getSavedPosts = authQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("posts"),
    type: v.union(v.literal("photo"), v.literal("video")),
    caption: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    authorName: v.string(),
    createdAt: v.number(),
  })),
  handler: async (ctx) => {
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) return [];
    const saved = await ctx.db.query("savedPosts")
      .withIndex("by_userId", q => q.eq("userId", myUserId))
      .order("desc")
      .take(50);
    
    if (saved.length === 0) return [];
    
    // Batch fetch all posts in parallel (not sequential!)
    const posts = await Promise.all(saved.map(s => ctx.db.get(s.postId)));
    
    // Collect valid posts with their indices
    const validEntries: Array<{ saved: typeof saved[number]; post: NonNullable<typeof posts[number]> }> = [];
    for (let i = 0; i < saved.length; i++) {
      const post = posts[i];
      if (post) validEntries.push({ saved: saved[i], post });
    }
    
    // Batch fetch authors + storage URLs
    const authorIds = validEntries.map(e => e.post.authorId);
    const storageIds = validEntries.flatMap(e => [e.post.mediaStorageId, e.post.thumbnailStorageId]);
    const [authorCache, urlCache] = await Promise.all([
      batchGetAuthors(ctx, authorIds),
      batchGetUrls(ctx, storageIds),
    ]);
    
    return validEntries.map(({ post }) => {
      const author = authorCache.get(post.authorId);
      return {
        _id: post._id,
        type: post.type,
        caption: post.caption,
        mediaUrl: post.mediaStorageId ? (urlCache.get(post.mediaStorageId) ?? undefined) : post.mediaUrl,
        thumbnailUrl: post.thumbnailStorageId ? (urlCache.get(post.thumbnailStorageId) ?? undefined) : post.thumbnailUrl,
        authorName: author?.name ?? "Unknown",
        createdAt: post.createdAt,
      };
    });
  },
});

// Get user posts (optimized)
export const getUserPosts = query({
  args: { userId: v.id("users") },
  returns: v.array(v.object({
    _id: v.id("posts"),
    type: v.union(v.literal("photo"), v.literal("video")),
    mediaUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    aspectMode: v.optional(v.union(v.literal("original"), v.literal("cropped"))),
    cropOffsetY: v.optional(v.number()),
    cropOffsetX: v.optional(v.number()),
    cropZoom: v.optional(v.number()),
    mediaAspectRatio: v.optional(v.number()),
    likeCount: v.number(),
    commentCount: v.number(),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const posts = await ctx.db.query("posts")
      .withIndex("by_authorId", q => q.eq("authorId", args.userId))
      .order("desc")
      .take(50);
    
    if (posts.length === 0) return [];
    
    // Batch-fetch all storage URLs in parallel
    const allStorageIds = posts.flatMap(p => [p.mediaStorageId, p.thumbnailStorageId]);
    const urlCache = await batchGetUrls(ctx, allStorageIds);
    
    return posts.map(p => ({
      _id: p._id,
      type: p.type,
      mediaUrl: p.mediaStorageId ? (urlCache.get(p.mediaStorageId) ?? undefined) : p.mediaUrl,
      thumbnailUrl: p.thumbnailStorageId ? (urlCache.get(p.thumbnailStorageId) ?? undefined) : p.thumbnailUrl,
      aspectMode: p.aspectMode,
      cropOffsetY: p.cropOffsetY,
      cropOffsetX: p.cropOffsetX,
      cropZoom: p.cropZoom,
      mediaAspectRatio: p.mediaAspectRatio,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      createdAt: p.createdAt,
    }));
  },
});

// Repair: patch a thumbnail onto a video post that's missing one
export const patchThumbnail = authMutation({
  args: {
    postId: v.id("posts"),
    thumbnailStorageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;
    // Only patch if no thumbnail exists yet
    if (post.thumbnailStorageId) return null;
    await ctx.db.patch(args.postId, { thumbnailStorageId: args.thumbnailStorageId });
    return null;
  },
});
