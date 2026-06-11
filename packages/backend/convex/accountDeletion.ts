import { authMutation } from "./functions";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { deleteUserPersonalData } from "./retention";

/* ─── Self-service account deletion ─────────────────────────── */
export const deleteMyAccount = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", ctx.user._id))
      .unique();
    if (!user) throw new Error("Nutzer nicht gefunden");

    const deletionResult = await deleteUserPersonalData(ctx, user, "self_service");

    await ctx.scheduler.runAfter(0, internal.adminActions.processUserDeletion, {
      email: deletionResult.email,
      name: deletionResult.name,
      stripeSubscriptionId: deletionResult.stripeSubscriptionId,
    });
    // Scheduler safe: one-shot, triggered only by user's own account deletion

    return null;
  },
});
