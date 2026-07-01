import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { resetPasswordPage } from "./resetPasswordPage";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

http.route({
  path: "/healthz",
  method: "GET",
  handler: httpAction(async () => {
    return new Response("ok", { status: 200 });
  }),
});

// ── Stripe: Checkout success redirect ──────────────────────────
http.route({
  path: "/stripe/success",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    const token = url.searchParams.get("token");

    if (!sessionId) {
      return new Response(errorPage("Ungültige Sitzung"), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Verify the Stripe session and update pending subscription
    try {
      const result: string = await ctx.runAction(internal.stripeActions.verifyCheckoutSession, {
        stripeSessionId: sessionId,
      });

      if (result === "success") {
        return new Response(successPage(), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } else {
        return new Response(errorPage("Zahlung konnte nicht bestätigt werden"), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    } catch (e) {
      console.error("Stripe success handler error:", e);
      return new Response(errorPage("Ein Fehler ist aufgetreten"), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }),
});

// ── Stripe: Checkout cancel redirect ───────────────────────────
http.route({
  path: "/stripe/cancel",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(cancelPage(), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }),
});

// ── Stripe: Webhook endpoint ───────────────────────────────────
http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // If no webhook secret, accept events without verification (dev mode)
    let event: Record<string, unknown>;
    if (webhookSecret && sig) {
      // Verify Stripe signature using HMAC
      const verified = await verifyStripeSignature(body, sig, webhookSecret);
      if (!verified) {
        console.error("Stripe webhook signature verification failed");
        return new Response("Invalid signature", { status: 400 });
      }
      event = JSON.parse(body) as Record<string, unknown>;
    } else {
      event = JSON.parse(body) as Record<string, unknown>;
    }

    const eventType = event.type as string;
    const dataObj = event.data as Record<string, unknown> | undefined;
    const obj = dataObj?.object as Record<string, unknown> | undefined;

    if (!obj) {
      return new Response("No object in event", { status: 400 });
    }

    const customerId = typeof obj.customer === "string" ? obj.customer : undefined;
    const subscriptionId = typeof obj.id === "string" ? obj.id : undefined;
    const subscriptionStatus = typeof obj.status === "string" ? obj.status : undefined;

    try {
      await ctx.runAction(internal.stripeActions.handleWebhookEvent, {
        eventType,
        customerId,
        subscriptionId,
        subscriptionStatus,
      });
    } catch (e) {
      console.error("Webhook handler error:", e);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/reset-password",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(resetPasswordPage(), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }),
});

export default http;

// ── HTML Templates ─────────────────────────────────────────────

function pageShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Z</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro', 'Helvetica Neue', sans-serif;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
      color: #000;
    }
    .card {
      text-align: center;
      max-width: 360px;
    }
    .logo {
      font-size: 56px;
      font-weight: 900;
      letter-spacing: -2px;
      margin-bottom: 24px;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    p { font-size: 16px; color: #666; line-height: 1.5; }
    .hint { margin-top: 20px; font-size: 14px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Z</div>
    ${content}
  </div>
</body>
</html>`;
}

function successPage(): string {
  return pageShell(`
    <div class="icon">✅</div>
    <h1>Zahlung erfolgreich!</h1>
    <p>Dein Z-Abo ist bereit. Gehe zurück zur App, um dein Konto zu erstellen.</p>
    <p class="hint">Du kannst dieses Fenster jetzt schließen.</p>
  `);
}

function cancelPage(): string {
  return pageShell(`
    <div class="icon">❌</div>
    <h1>Zahlung abgebrochen</h1>
    <p>Kein Problem! Gehe zurück zur App, um es erneut zu versuchen.</p>
    <p class="hint">Du kannst dieses Fenster jetzt schließen.</p>
  `);
}

function errorPage(message: string): string {
  return pageShell(`
    <div class="icon">⚠️</div>
    <h1>${message}</h1>
    <p>Bitte versuche es erneut oder kontaktiere den Support.</p>
    <p class="hint">Du kannst dieses Fenster jetzt schließen.</p>
  `);
}

// ── Stripe webhook signature verification ──────────────────────
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts = sigHeader.split(",");
    let timestamp = "";
    let signature = "";
    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key === "t") timestamp = value ?? "";
      if (key === "v1") signature = value ?? "";
    }
    if (!timestamp || !signature) return false;

    // Check timestamp is within 5 minutes
    const ts = parseInt(timestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const expected = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return expected === signature;
  } catch {
    return false;
  }
}
