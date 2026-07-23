import { v } from "convex/values";
import { authMutation, authQuery } from "./functions";
import type { Id } from "./_generated/dataModel";
import { rateLimiter, INPUT_LIMITS, validateStringLength, sanitizeText } from "./rateLimit";
import { hashBanEmail } from "./banHash";

async function getMyUserId(ctx: any): Promise<Id<"users"> | null> {
  const authId = ctx.user._id;
  const user = await ctx.db.query("users").withIndex("by_authId", (q: any) => q.eq("authId", authId)).unique();
  return user?._id ?? null;
}

export const create = authMutation({
  args: {
    type: v.union(v.literal("user"), v.literal("post"), v.literal("group"), v.literal("partner")),
    targetId: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "submitReport", { key: ctx.user._id });
    const myUserId = await getMyUserId(ctx);
    if (!myUserId) throw new Error("User not found");
    const reason = sanitizeText(args.reason);
    validateStringLength(reason, "Grund", INPUT_LIMITS.reportReason);
    if (!reason) throw new Error("Bitte gib einen Grund an");
    await ctx.db.insert("reports", {
      reporterId: myUserId,
      type: args.type,
      targetId: args.targetId,
      reason,
      status: "pending",
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Safe post-auth ban gate: returns true if the CURRENT authenticated
 * user's email is on the bannedEmails list. Checked client-side in the
 * top-level auth provider to block banned users from using the app.
 */
export const amIBanned = authQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const authId = ctx.user._id;
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();
    if (!user) return false;
    const email = user.email.toLowerCase().trim();
    if (!email) return false;
    // 1) Klartext-Sperre (jüngere Bans, < 6 Monate)
    const banned = await ctx.db
      .query("bannedEmails")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (banned !== null) return true;
    // 2) Pseudonymisierte Sperre (ältere Bans, E-Mail gehasht) – gleicher Hash-Abgleich
    const hashedEmail = await hashBanEmail(email);
    const bannedHashed = await ctx.db
      .query("bannedEmails")
      .withIndex("by_email", (q) => q.eq("email", hashedEmail))
      .unique();
    return bannedHashed !== null;
  },
});
