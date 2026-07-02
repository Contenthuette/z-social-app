import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Schema for Z Social Platform
export default defineSchema({
  // ── User Profiles ──────────────────────────────────────────────
  users: defineTable({
    authId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarStorageId: v.optional(v.id("_storage")),
    avatarUrl: v.optional(v.string()),
    bannerStorageId: v.optional(v.id("_storage")),
    bannerUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    county: v.optional(v.string()),
    city: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"), v.literal("prefer_not_to_say"))),
    birthDate: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    searchText: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin")),
    onboardingComplete: v.boolean(),
    subscriptionStatus: v.union(v.literal("none"), v.literal("active"), v.literal("canceled"), v.literal("expired")),
    subscriptionPlan: v.optional(v.string()),
    subscriptionExpiresAt: v.optional(v.number()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    lastActiveAt: v.optional(v.number()),
    notificationPreferences: v.optional(v.object({
      calls: v.boolean(),
      groupCalls: v.boolean(),
      directMessages: v.boolean(),
      groupMessages: v.boolean(),
      announcements: v.boolean(),
    })),
    createdAt: v.number(),
  })
    .index("by_authId", ["authId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_subscriptionStatus", ["subscriptionStatus"])
    .index("by_county_and_city", ["county", "city"])
    .index("by_lastActiveAt", ["lastActiveAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .searchIndex("search_text", { searchField: "searchText" }),

  // ── Pending Subscriptions (pre-signup Stripe payments) ─────────
  pendingSubscriptions: defineTable({
    sessionToken: v.string(),
    plan: v.string(),
    status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")),
    stripeSessionId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    claimedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_sessionToken", ["sessionToken"])
    .index("by_stripeSessionId", ["stripeSessionId"])
    .index("by_status", ["status"]),

  // ── Groups ─────────────────────────────────────────────────────
  groups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
    thumbnailUrl: v.optional(v.string()),
    county: v.optional(v.string()),
    city: v.optional(v.string()),
    topic: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    searchText: v.optional(v.string()),
    visibility: v.union(v.literal("public"), v.literal("invite_only"), v.literal("request")),
    creatorId: v.id("users"),
    memberCount: v.number(),
    createdAt: v.number(),
    // If true, this group is an auto-created event group (hidden from Community tab)
    isMemberEventGroup: v.optional(v.boolean()),
    // Link back to the member event that owns this group
    memberEventId: v.optional(v.id("memberEvents")),
  })
    .index("by_creatorId", ["creatorId"])
    .index("by_county_and_city", ["county", "city"])
    .index("by_topic", ["topic"])
    .index("by_createdAt", ["createdAt"])
    .index("by_memberEventId", ["memberEventId"])
    .searchIndex("search_name", { searchField: "name" })
    .searchIndex("search_text", { searchField: "searchText" }),

  groupMembers: defineTable({
    groupId: v.id("groups"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
    status: v.union(v.literal("active"), v.literal("pending")),
    joinedAt: v.number(),
  })
    .index("by_groupId", ["groupId"])
    .index("by_userId", ["userId"])
    .index("by_groupId_and_userId", ["groupId", "userId"])
    .index("by_groupId_and_status_and_role", ["groupId", "status", "role"]),

  // ── Messages (group + DM) ──────────────────────────────────────
  conversations: defineTable({
    type: v.union(v.literal("direct"), v.literal("group")),
    groupId: v.optional(v.id("groups")),
    participantIds: v.optional(v.array(v.id("users"))),
    conversationKey: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_groupId", ["groupId"])
    .index("by_conversationKey", ["conversationKey"])
    .index("by_lastMessageAt", ["lastMessageAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    type: v.union(v.literal("text"), v.literal("image"), v.literal("video"), v.literal("voice"), v.literal("post_share"), v.literal("profile_share")),
    text: v.optional(v.string()),
    mediaStorageId: v.optional(v.id("_storage")),
    mediaUrl: v.optional(v.string()),
    mediaDuration: v.optional(v.number()),
    sharedPostId: v.optional(v.id("posts")),
    sharedProfileId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_conversationId", ["conversationId"])
    .index("by_conversationId_and_createdAt", ["conversationId", "createdAt"])
    .index("by_senderId", ["senderId"]),

  // ── Conversation Read Status ───────────────────────────────────
  conversationReadStatus: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    lastReadAt: v.number(),
  })
    .index("by_conversationId_and_userId", ["conversationId", "userId"])
    .index("by_userId", ["userId"]),

  // ── Conversation Settings (per-user pin/delete) ────────────────
  conversationSettings: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    isPinned: v.optional(v.boolean()),
    isDeleted: v.optional(v.boolean()),
    pinnedAt: v.optional(v.number()),
  })
    .index("by_userId_and_conversationId", ["userId", "conversationId"])
    .index("by_userId", ["userId"]),

  // ── Posts / Feed ───────────────────────────────────────────────
  posts: defineTable({
    authorId: v.id("users"),
    type: v.union(v.literal("photo"), v.literal("video")),
    caption: v.optional(v.string()),
    mediaStorageId: v.optional(v.id("_storage")),
    mediaUrl: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
    thumbnailUrl: v.optional(v.string()),
    aspectMode: v.optional(v.union(v.literal("original"), v.literal("cropped"))),
    cropOffsetY: v.optional(v.number()),
    cropOffsetX: v.optional(v.number()),
    cropZoom: v.optional(v.number()),
    mediaAspectRatio: v.optional(v.number()),
    location: v.optional(v.string()),
    likeCount: v.number(),
    commentCount: v.number(),
    isPinned: v.boolean(),
    isAnnouncement: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_authorId", ["authorId"])
    .index("by_isPinned", ["isPinned"])
    .index("by_createdAt", ["createdAt"]),

  likes: defineTable({
    postId: v.id("posts"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_postId", ["postId"])
    .index("by_postId_and_userId", ["postId", "userId"])
    .index("by_userId", ["userId"]),

  comments: defineTable({
    postId: v.id("posts"),
    authorId: v.id("users"),
    text: v.string(),
    likeCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_postId", ["postId"])
    .index("by_authorId", ["authorId"]),

  commentLikes: defineTable({
    commentId: v.id("comments"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_commentId", ["commentId"])
    .index("by_commentId_and_userId", ["commentId", "userId"])
    .index("by_userId", ["userId"]),

  savedPosts: defineTable({
    postId: v.id("posts"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_postId_and_userId", ["postId", "userId"]),

  // ── Events ─────────────────────────────────────────────────────
  events: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
    thumbnailUrl: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    videoThumbnailStorageId: v.optional(v.id("_storage")),
    ticketUrl: v.optional(v.string()),
    venue: v.string(),
    city: v.string(),
    county: v.optional(v.string()),
    date: v.string(),
    startTime: v.string(),
    durationMinutes: v.number(),
    totalTickets: v.number(),
    soldTickets: v.number(),
    ticketPrice: v.number(),
    currency: v.string(),
    status: v.union(v.literal("upcoming"), v.literal("ongoing"), v.literal("completed"), v.literal("canceled")),
    creatorId: v.id("users"),
    createdAt: v.number(),
    // Blur fields – when true the corresponding datum is hidden on the public event page
    blurDate: v.optional(v.boolean()),
    blurTime: v.optional(v.boolean()),
    blurVenue: v.optional(v.boolean()),
    blurCity: v.optional(v.boolean()),
    blurPrice: v.optional(v.boolean()),
    blurDescription: v.optional(v.boolean()),
  })
    .index("by_city", ["city"])
    .index("by_status", ["status"])
    .index("by_date", ["date"])
    .index("by_creatorId", ["creatorId"]),

  tickets: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    buyerName: v.optional(v.string()),
    buyerEmail: v.optional(v.string()),
    qrCode: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("scanned"), v.literal("canceled"), v.literal("expired")),
    paid: v.optional(v.boolean()),
    checkedIn: v.optional(v.boolean()),
    checkedInAt: v.optional(v.number()),
    purchasedAt: v.number(),
    scannedAt: v.optional(v.number()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_and_purchasedAt", ["eventId", "purchasedAt"])
    .index("by_eventId_and_checkedIn", ["eventId", "checkedIn"])
    .index("by_userId", ["userId"])
    .index("by_qrCode", ["qrCode"])
    .index("by_purchasedAt", ["purchasedAt"]),

  // ── Event Admins (Einlass-Helfer) ────────────────────────────
  eventAdmins: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    invitedBy: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined")),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_userId", ["userId"])
    .index("by_eventId_and_userId", ["eventId", "userId"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_invitedBy", ["invitedBy"]),

  // ── Member Events (community events by users) ───────────────
  memberEvents: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
    thumbnailUrl: v.optional(v.string()),
    videoStorageId: v.optional(v.id("_storage")),
    videoThumbnailStorageId: v.optional(v.id("_storage")),
    venue: v.string(),
    city: v.string(),
    county: v.optional(v.string()),
    date: v.string(),          // "2026-05-15"
    startTime: v.string(),     // "19:00"
    durationMinutes: v.number(),
    maxAttendees: v.optional(v.number()),  // optional cap
    attendeeCount: v.number(),
    creatorId: v.id("users"),
    groupId: v.id("groups"),   // auto-created event group
    status: v.union(v.literal("upcoming"), v.literal("ongoing"), v.literal("completed"), v.literal("canceled")),
    createdAt: v.number(),
  })
    .index("by_creatorId", ["creatorId"])
    .index("by_city", ["city"])
    .index("by_status", ["status"])
    .index("by_date", ["date"])
    .index("by_groupId", ["groupId"])
    .index("by_createdAt", ["createdAt"]),

  // ── Partners ───────────────────────────────────────────────────
  partners: defineTable({
    businessName: v.string(),
    shortText: v.string(),
    description: v.optional(v.string()),
    thumbnailStorageId: v.optional(v.id("_storage")),
    thumbnailUrl: v.optional(v.string()),
    mediaStorageId: v.optional(v.id("_storage")),
    mediaUrl: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_isActive", ["isActive"]),

  // ── Friend Requests ────────────────────────────────────────────
  friendRequests: defineTable({
    senderId: v.id("users"),
    receiverId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined")),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_senderId", ["senderId"])
    .index("by_receiverId", ["receiverId"])
    .index("by_senderId_and_receiverId", ["senderId", "receiverId"])
    .index("by_senderId_and_status", ["senderId", "status"])
    .index("by_receiverId_and_status", ["receiverId", "status"]),

  // ── Notifications ──────────────────────────────────────────────
  notifications: defineTable({
    userId: v.id("users"),
    type: v.union(
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
      v.literal("friend_request_declined")
    ),
    title: v.string(),
    body: v.string(),
    referenceId: v.optional(v.string()),
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_isRead", ["userId", "isRead"])
    .index("by_createdAt", ["createdAt"]),

  // ── Reports / Moderation ───────────────────────────────────────
  reports: defineTable({
    reporterId: v.id("users"),
    type: v.union(v.literal("user"), v.literal("post"), v.literal("group"), v.literal("partner")),
    targetId: v.string(),
    reason: v.string(),
    status: v.union(v.literal("pending"), v.literal("reviewed"), v.literal("resolved")),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_type_and_status", ["type", "status"])
    .index("by_reporterId_and_targetId", ["reporterId", "targetId"])
    .index("by_reporterId", ["reporterId"])
    .index("by_createdAt", ["createdAt"]),

  blockedUsers: defineTable({
    blockerId: v.id("users"),
    blockedId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_blockerId", ["blockerId"])
    .index("by_blockerId_and_blockedId", ["blockerId", "blockedId"])
    .index("by_blockedId_and_blockerId", ["blockedId", "blockerId"]),

  // ── Analytics snapshots ────────────────────────────────────────
  analyticsSnapshots: defineTable({
    date: v.string(),
    totalUsers: v.number(),
    activeUsersToday: v.number(),
    activeUsers7d: v.number(),
    activeUsers30d: v.number(),
    newRegistrations: v.number(),
    activeSubscriptions: v.number(),
    canceledSubscriptions: v.optional(v.number()),
    newSubscriptions: v.number(),
    cancellations: v.number(),
    totalPosts: v.number(),
    totalMessages: v.number(),
    totalGroups: v.number(),
    totalEvents: v.number(),
    photosCreated: v.optional(v.number()),
    videosCreated: v.optional(v.number()),
    ticketRevenue: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_date", ["date"]),

  // ── Calls ──────────────────────────────────────────────────────
  calls: defineTable({
    type: v.union(v.literal("audio"), v.literal("video")),
    status: v.union(
      v.literal("ringing"),
      v.literal("active"),
      v.literal("ended"),
      v.literal("declined"),
      v.literal("missed")
    ),
    callerId: v.id("users"),
    callerName: v.string(),
    callerAvatarUrl: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
    receiverId: v.optional(v.id("users")),
    groupId: v.optional(v.id("groups")),
    groupName: v.optional(v.string()),
    startedAt: v.number(),
    answeredAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  })
    .index("by_receiverId_and_status", ["receiverId", "status"])
    .index("by_groupId_and_status", ["groupId", "status"])
    .index("by_callerId_and_status", ["callerId", "status"])
    .index("by_status_and_startedAt", ["status", "startedAt"]),

  callParticipants: defineTable({
    callId: v.id("calls"),
    userId: v.id("users"),
    userName: v.string(),
    userAvatarUrl: v.optional(v.string()),
    status: v.union(
      v.literal("ringing"),
      v.literal("connected"),
      v.literal("declined"),
      v.literal("left")
    ),
    isMuted: v.boolean(),
    isVideoOff: v.boolean(),
    joinedAt: v.optional(v.number()),
    leftAt: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_callId", ["callId"])
    .index("by_userId_and_status", ["userId", "status"])
    .index("by_callId_and_userId", ["callId", "userId"]),

  callSignaling: defineTable({
    callId: v.id("calls"),
    senderId: v.id("users"),
    recipientId: v.optional(v.id("users")),
    type: v.union(
      v.literal("offer"),
      v.literal("answer"),
      v.literal("ice-candidate")
    ),
    payload: v.string(),
  })
    .index("by_callId", ["callId"])
    .index("by_callId_and_recipientId", ["callId", "recipientId"]),

  // ── Livestreams ────────────────────────────────────────────────
  livestreams: defineTable({
    groupId: v.optional(v.id("groups")),
    groupName: v.optional(v.string()),
    hostId: v.id("users"),
    hostName: v.string(),
    hostAvatarUrl: v.optional(v.string()),
    coHostId: v.optional(v.id("users")),
    coHostName: v.optional(v.string()),
    coHostAvatarUrl: v.optional(v.string()),
    title: v.string(),
    status: v.union(v.literal("live"), v.literal("ended")),
    participantCount: v.number(),
    viewerCount: v.number(),
    peakViewerCount: v.number(),
    startedAt: v.number(),
    lastActivityAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_groupId_and_status", ["groupId", "status"])
    .index("by_hostId", ["hostId"])
    .index("by_hostId_and_status", ["hostId", "status"])
    .index("by_coHostId", ["coHostId"]),

  livestreamViewers: defineTable({
    livestreamId: v.id("livestreams"),
    userId: v.id("users"),
    userName: v.string(),
    userAvatarUrl: v.optional(v.string()),
    joinedAt: v.number(),
  })
    .index("by_livestreamId", ["livestreamId"])
    .index("by_livestreamId_and_userId", ["livestreamId", "userId"])
    .index("by_userId", ["userId"]),

  livestreamComments: defineTable({
    livestreamId: v.id("livestreams"),
    userId: v.id("users"),
    userName: v.string(),
    userAvatarUrl: v.optional(v.string()),
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_livestreamId_and_createdAt", ["livestreamId", "createdAt"])
    .index("by_userId", ["userId"]),

  livestreamSignaling: defineTable({
    livestreamId: v.id("livestreams"),
    senderId: v.id("users"),
    recipientId: v.id("users"),
    type: v.union(
      v.literal("offer"),
      v.literal("answer"),
      v.literal("ice-candidate")
    ),
    payload: v.string(),
  })
    .index("by_livestreamId_and_recipientId", ["livestreamId", "recipientId"])
    .index("by_livestreamId", ["livestreamId"])
    .index("by_senderId", ["senderId"])
    .index("by_recipientId", ["recipientId"]),

  communityInterests: defineTable({
    name: v.string(),
    createdByUserId: v.id("users"),
    usageCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .searchIndex("search_name", { searchField: "name" }),

  livestreamJoinRequests: defineTable({
    livestreamId: v.id("livestreams"),
    userId: v.id("users"),
    userName: v.string(),
    userAvatarUrl: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
    createdAt: v.number(),
  })
    .index("by_livestreamId_and_status", ["livestreamId", "status"])
    .index("by_livestreamId_and_userId", ["livestreamId", "userId"])
    .index("by_userId", ["userId"]),

  // ── Announcements ──────────────────────────────────────────────
  announcements: defineTable({
    text: v.string(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_isActive", ["isActive"]),

  // ── Polls / Umfragen ──────────────────────────────────────────
  polls: defineTable({
    question: v.string(),
    options: v.array(v.string()),
    creatorId: v.id("users"),
    target: v.union(v.literal("community"), v.literal("group")),
    groupId: v.optional(v.id("groups")),
    totalVotes: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_target_and_createdAt", ["target", "createdAt"])
    .index("by_groupId_and_createdAt", ["groupId", "createdAt"])
    .index("by_creatorId", ["creatorId"]),

  pollVotes: defineTable({
    pollId: v.id("polls"),
    userId: v.id("users"),
    optionIndex: v.number(),
    createdAt: v.number(),
  })
    .index("by_pollId", ["pollId"])
    .index("by_pollId_and_userId", ["pollId", "userId"])
    .index("by_userId", ["userId"]),
});
