import { AuthFunctions, createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { components, internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { anonymous } from "better-auth/plugins";
import authConfig from "./auth.config";
import { buildUserSearchText } from "./searchText";
import { deleteUserPersonalData } from "./retention";

const authFunctions: AuthFunctions = internal.auth;

function isAdminEmail(email: string): boolean {
    const normalizedEmail = email.toLowerCase();
    return normalizedEmail === "live@z-social.com" || normalizedEmail === "leif@z-social.com";
}

function isAllowedPreviewOrigin(origin: string): boolean {
    return /^https:\/\/[a-z0-9-]+\.preview\.bl\.run$/i.test(origin);
}

/* ─── Helper: Send email via Resend ────────────────────── */
async function sendEmailViaResend(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set – skipping email to", opts.to);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Z Social <leif@z-social.com>",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Resend email failed:", res.status, text);
  }
}

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth, {
    authFunctions,
    triggers: {
        user: {
            onCreate: async (ctx, doc) => {
                const existingUser = await ctx.db
                    .query("users")
                    .withIndex("by_authId", (q) => q.eq("authId", doc._id))
                    .unique();
                if (existingUser) {
                    return;
                }

                await ctx.db.insert("users", {
                    authId: doc._id,
                    email: doc.email,
                    name: doc.name,
                    searchText: buildUserSearchText({ name: doc.name }),
                    role: isAdminEmail(doc.email) ? "admin" : "user",
                    onboardingComplete: false,
                    subscriptionStatus: "none",
                    createdAt: typeof doc.createdAt === "number" ? doc.createdAt : new Date(doc.createdAt).getTime(),
                });
            },
            onUpdate: async (ctx, newDoc) => {
                const existingUser = await ctx.db
                    .query("users")
                    .withIndex("by_authId", (q) => q.eq("authId", newDoc._id))
                    .unique();
                if (!existingUser) {
                    return;
                }

                await ctx.db.patch(existingUser._id, {
                    email: newDoc.email,
                    name: newDoc.name,
                    searchText: buildUserSearchText({
                        name: newDoc.name,
                        bio: existingUser.bio,
                        county: existingUser.county,
                        city: existingUser.city,
                        interests: existingUser.interests,
                    }),
                    role: isAdminEmail(newDoc.email) ? "admin" : existingUser.role,
                });
            },
            onDelete: async (ctx, doc) => {
                const existingUser = await ctx.db
                    .query("users")
                    .withIndex("by_authId", (q) => q.eq("authId", doc._id))
                    .unique();
                if (!existingUser) {
                    return;
                }
                await deleteUserPersonalData(ctx, existingUser, "self_service");
            },
        },
    },
});

// export the trigger API functions so that triggers work
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

const siteUrl = process.env.SITE_URL!;
const defaultTrustedOrigins = [
    siteUrl,
    "myapp://",
    "exp://",
    "http://localhost:*",
    "http://127.0.0.1:*",
];

async function trustedOrigins(request?: Request): Promise<string[]> {
    const requestOrigin = request?.headers.get("origin");
    if (requestOrigin && isAllowedPreviewOrigin(requestOrigin)) {
        return [...defaultTrustedOrigins, requestOrigin];
    }
    return [...defaultTrustedOrigins, "https://*.preview.bl.run"];
}

export const createAuth = (
    ctx: GenericCtx<DataModel>,
    { optionsOnly } = { optionsOnly: false }
) => {
    return betterAuth({
        baseURL: process.env.CONVEX_SITE_URL,
        socialProviders: {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID as string,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            },
        },
        logger: {
            disabled: optionsOnly,
        },
        trustedOrigins,
        database: authComponent.adapter(ctx),
        user: {
            deleteUser: {
                enabled: true,
            },
        },
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: false,
            sendResetPassword: async ({ user, url }) => {
                const html = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
                    <div style="text-align: center; margin-bottom: 32px;">
                      <span style="font-size: 48px; font-weight: 900; letter-spacing: -2px;">Z</span>
                    </div>
                    <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px; color: #000;">Passwort zur\u00fccksetzen</h2>
                    <p style="font-size: 15px; color: #333; line-height: 1.6; margin-bottom: 16px;">
                      Hallo ${user.name || "Mitglied"},
                    </p>
                    <p style="font-size: 15px; color: #333; line-height: 1.6; margin-bottom: 24px;">
                      du hast angefordert, dein Passwort bei Z zur\u00fcckzusetzen. Klicke auf den Button unten, um ein neues Passwort festzulegen.
                    </p>
                    <div style="text-align: center; margin-bottom: 24px;">
                      <a href="${url}" style="display: inline-block; background-color: #000; color: #fff; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 15px;">
                        Neues Passwort setzen
                      </a>
                    </div>
                    <p style="font-size: 13px; color: #999; line-height: 1.5;">
                      Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren. Der Link ist 1 Stunde g\u00fcltig.
                    </p>
                    <div style="border-top: 1px solid #eee; margin-top: 32px; padding-top: 16px;">
                      <p style="font-size: 12px; color: #999;">Z Social \u00b7 Mecklenburg-Vorpommern</p>
                    </div>
                  </div>
                `;
                await sendEmailViaResend({
                  to: user.email,
                  subject: "Dein Z-Passwort zur\u00fccksetzen",
                  html,
                });
            },
        },
        plugins: [
            anonymous(),
            expo(),
            convex({ authConfig }),
            crossDomain({ siteUrl }),
        ],
    });
};
