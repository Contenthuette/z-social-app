import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createAuth } from "./auth";

/**
 * One-off admin tool: fully remove a user by email so the address becomes
 * free to register again. Deletes the Better Auth records (user / account /
 * session / verification) AND any app-side `users` row.
 *
 * Run with:
 *   npx convex run adminTools:purgeUserByEmail '{"email":"someone@example.com"}'
 */
export const purgeUserByEmail = internalAction({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const raw = email.trim();
    const lower = raw.toLowerCase();
    const results: Record<string, unknown> = { email: raw };

    const auth = createAuth(ctx);
    const context = await auth.$context;
    const adapter = context.adapter;

    // Find the Better Auth user (try exact, then lowercased)
    let user =
      (await adapter.findOne({
        model: "user",
        where: [{ field: "email", value: raw }],
      })) ??
      (await adapter.findOne({
        model: "user",
        where: [{ field: "email", value: lower }],
      }));

    results.authUserFound = !!user;

    if (user) {
      const userId = (user as { id: string }).id;
      results.userId = userId;

      try {
        await adapter.deleteMany({
          model: "session",
          where: [{ field: "userId", value: userId }],
        });
        results.sessionsDeleted = true;
      } catch (e) {
        results.sessionErr = String(e);
      }

      try {
        await adapter.deleteMany({
          model: "account",
          where: [{ field: "userId", value: userId }],
        });
        results.accountsDeleted = true;
      } catch (e) {
        results.accountErr = String(e);
      }

      try {
        await adapter.deleteMany({
          model: "verification",
          where: [{ field: "identifier", value: raw }],
        });
        await adapter.deleteMany({
          model: "verification",
          where: [{ field: "identifier", value: lower }],
        });
        results.verificationsDeleted = true;
      } catch (e) {
        results.verificationErr = String(e);
      }

      try {
        await adapter.deleteMany({
          model: "user",
          where: [{ field: "id", value: userId }],
        });
        results.authUserDeleted = true;
      } catch (e) {
        results.userErr = String(e);
      }
    }

    // Clean up the app-side users table as well (best effort)
    const appDeleted = await ctx.runMutation(
      internal.adminTools.purgeAppUserByEmail,
      { email: raw },
    );
    results.appUsersDeleted = appDeleted;

    return results;
  },
});

export const purgeAppUserByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const lower = email.trim().toLowerCase();
    let deleted = 0;
    for (const candidate of [email.trim(), lower]) {
      const rows = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", candidate))
        .collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }
    return deleted;
  },
});
