import crypto from "crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import QRCode from "qrcode";
import {
  validateSession,
  elevateToAdmin,
  destroySession,
  getCookieOptions,
} from "../lib/session.js";
import { verifyCodeForUpgrade, generateTOTPSecret } from "../lib/totp.js";
import {
  getRecentActivity,
  logActivity,
  getUserAccounts,
  unlinkAccount,
  getActiveSessionSummary,
  getCredits,
  getGuestCredits,
  useCredits,
  useGuestCredits,
  refundCredits,
  getAllCredits,
  grantCredits,
  getAllUsers,
} from "../db.js";
import { getEnabledProviders } from "../config/providers.js";
import {
  issueServiceToken,
  serviceTokensEnabled,
  verifyServiceToken,
} from "../lib/service-token.js";

const router = Router();

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
}

function getUserAgent(req) {
  return req.headers["user-agent"] || "unknown";
}

const GUEST_COOKIE_NAME = "authy_guest";

function getBearerToken(req) {
  const header = req.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

function getOrCreateGuestId(req, res) {
  const existing = req.cookies?.[GUEST_COOKIE_NAME];
  if (existing) return existing;

  const generated = crypto.randomBytes(24).toString("hex");
  const options = getCookieOptions();
  res.cookie(GUEST_COOKIE_NAME, generated, {
    ...options,
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return generated;
}

async function resolveAuthContext(req, res, { allowGuest = true } = {}) {
  const bodyToken = req.body?.token;
  const cookieToken = req.cookies?.authy_session;
  const bearerToken = getBearerToken(req);

  const tokenCandidates = [bodyToken, cookieToken].filter(Boolean);
  for (const token of tokenCandidates) {
    const session = await validateSession(token);
    if (session) {
      return { type: "session", session };
    }
  }

  if (bearerToken) {
    const servicePayload = verifyServiceToken(bearerToken);
    if (servicePayload) {
      return { type: "service", service: servicePayload };
    }

    const sessionFromBearer = await validateSession(bearerToken);
    if (sessionFromBearer) {
      return { type: "session", session: sessionFromBearer };
    }
  }

  if (!allowGuest) return null;

  const guestId = getOrCreateGuestId(req, res);
  return { type: "guest", guestId };
}

function requireAdminSession(session) {
  return !!session && session.role === "admin";
}

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

// GET /api/health
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /api/providers — list enabled OAuth providers
router.get("/providers", (_req, res) => {
  const providers = getEnabledProviders().map((p) => ({
    name: p.name,
    displayName: p.displayName,
  }));
  res.json({ providers });
});

// GET /api/status — auth status + user info + credits
router.get("/status", async (req, res) => {
  try {
    const context = await resolveAuthContext(req, res, { allowGuest: true });

    if (!context || context.type === "guest") {
      const guestCredits = await getGuestCredits(context?.guestId || getOrCreateGuestId(req, res));
      return res.json({
        authenticated: false,
        role: "guest",
        user: null,
        credits: guestCredits,
      });
    }

    if (context.type === "service") {
      return res.json({
        authenticated: true,
        role: "service",
        user: null,
        service: {
          id: context.service.sub,
          scope: context.service.scope || [],
        },
        credits: null,
      });
    }

    const session = context.session;
    let credits = null;
    if (session.role === "admin") {
      credits = { balance: -1, unlimited: true };
    } else {
      credits = await getCredits(session.userId);
    }

    return res.json({
      authenticated: true,
      role: session.role,
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        avatar_url: session.avatarUrl,
      },
      credits,
    });
  } catch (err) {
    console.error("Status check error:", err.message);
    return res.json({
      authenticated: false,
      role: "guest",
      user: null,
      credits: null,
    });
  }
});

// POST /api/logout
router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.authy_session;
    if (token) {
      await destroySession(token);
    }
    const { maxAge, ...clearOptions } = getCookieOptions();
    res.clearCookie("authy_session", clearOptions);
    res.json({ success: true });
  } catch (err) {
    console.error("Logout error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/verify — TOTP to elevate to admin
router.post("/verify", verifyLimiter, async (req, res) => {
  const { code } = req.body;
  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  if (!code || !/^\d{6}$/.test(code)) {
    return res
      .status(400)
      .json({ error: "Invalid code format. Must be 6 digits." });
  }

  try {
    const token = req.cookies?.authy_session;
    const session = await validateSession(token);
    if (!session) {
      return res.status(401).json({ error: "Must be logged in to verify" });
    }

    const result = await verifyCodeForUpgrade(code, ip, ua, session.userId);
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    await elevateToAdmin(token);
    res.json({ success: true, role: "admin" });
  } catch (err) {
    console.error("Verify error:", err.message);
    try {
      await logActivity(
        "totp_verify",
        ip,
        ua,
        false,
        `Server error: ${err.message}`,
      );
    } catch (_) {}
    res.status(500).json({ error: "Server error" });
  }
});

function renderSetupHtml({ secret_base32, otpauth_url, qr_code }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TOTP Setup — auth.dhanur.me</title>
  <script src="/site-nav-config.js"></script>
  <script type="module" src="https://dhanur.me/js/shell.js"></script>
</head>
<body>
  <main id="app" class="w-full max-w-7xl mx-auto p-4 lg:p-8 flex items-center justify-center min-h-[calc(100vh-6rem)]">
    <div class="project-card w-full md:max-w-md">
      <div class="p-6 md:p-8">
        <div class="flex items-center justify-between gap-3 mb-4">
          <h1 class="text-2xl font-bold tracking-tight">TOTP Setup</h1>
          <span class="badge badge-outline badge-sm border-base-content/30 font-bold">ADMIN</span>
        </div>

        <div class="flex items-start gap-3 bg-base-200/40 border border-base-content/10 p-4 rounded-xl mb-6">
          <i class="fa-solid fa-circle-info text-base-content mt-0.5 text-lg"></i>
          <p class="text-sm text-base-content/85 font-medium leading-relaxed">
            Scan the QR code with your authenticator app, then set <code class="bg-base-300 px-1.5 py-0.5 rounded text-xs font-mono">TOTP_SECRET</code> as an environment variable.
          </p>
        </div>

        <div class="bg-white rounded-xl p-4 mb-6 flex items-center justify-center">
          <img src="${qr_code}" alt="TOTP QR code" class="w-48 h-48 rounded-lg" />
        </div>

        <div class="bg-base-200/40 border border-base-content/10 rounded-xl p-4 mb-6">
          <div class="text-xs text-base-content/60 font-semibold uppercase mb-2">Secret Key</div>
          <code class="block text-sm font-mono text-base-content break-all">${secret_base32}</code>
        </div>

        <a href="${otpauth_url}" target="_blank" rel="noreferrer" class="btn btn-primary btn-sm w-full font-bold mb-4">
          <i class="fa-solid fa-external-link mr-2"></i>Open in Authenticator App
        </a>

        <p class="text-xs text-base-content/60 text-center">
          Refresh to regenerate a new secret. Keep this key secure and don't share it.
        </p>
      </div>
    </div>
  </main>
</body>
</html>`;
}

// GET /api/setup — first-time TOTP QR code
router.get("/setup", async (req, res) => {
  const wantsJson =
    req.query?.json === "1" ||
    req.accepts(["json", "html"]) === "json" ||
    req.get("Accept")?.includes("application/json");

  if (process.env.TOTP_SECRET) {
    const payload = {
      error: "Setup already complete. TOTP_SECRET is configured.",
    };

    if (wantsJson) {
      return res.status(403).json(payload);
    }

    return res
      .status(403)
      .send(`<p>Setup already complete. TOTP_SECRET is configured.</p>`);
  }

  try {
    const secret = generateTOTPSecret();
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    try {
      await logActivity("setup", ip, ua, true, "TOTP secret generated");
    } catch (_) {}

    const payload = {
      message:
        "Scan the QR code with your authenticator app, then set TOTP_SECRET as an environment variable.",
      secret_base32: secret.base32,
      otpauth_url: secret.otpauth_url,
      qr_code: qrDataUrl,
    };

    if (wantsJson) {
      return res.json(payload);
    }

    res.send(renderSetupHtml(payload));
  } catch (err) {
    console.error("Setup error:", err.message);
    if (wantsJson) {
      return res.status(500).json({ error: "Failed to generate TOTP secret" });
    }
    res.status(500).send("Failed to generate TOTP secret");
  }
});

// GET /api/accounts — linked + available providers for current user
router.get("/accounts", async (req, res) => {
  try {
    const token = req.cookies?.authy_session;
    const session = await validateSession(token);
    if (!session) {
      return res.status(401).json({ error: "Must be logged in" });
    }

    const userAccounts = await getUserAccounts(session.userId);
    const allProviders = getEnabledProviders();
    const linkedNames = new Set(userAccounts.map((a) => a.provider));

    const accounts = userAccounts.map((a) => {
      const provider = allProviders.find((p) => p.name === a.provider);
      return {
        provider: a.provider,
        displayName: provider?.displayName || a.provider,
        provider_account_id: a.provider_account_id,
        created_at: a.created_at,
      };
    });

    const available = allProviders
      .filter((p) => !linkedNames.has(p.name))
      .map((p) => ({ name: p.name, displayName: p.displayName }));

    res.json({ accounts, available });
  } catch (err) {
    console.error("Accounts fetch error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/accounts/:provider — unlink a provider
router.delete("/accounts/:provider", async (req, res) => {
  try {
    const token = req.cookies?.authy_session;
    const session = await validateSession(token);
    if (!session) {
      return res.status(401).json({ error: "Must be logged in" });
    }

    const userAccounts = await getUserAccounts(session.userId);
    if (userAccounts.length <= 1) {
      return res
        .status(400)
        .json({ error: "Cannot unlink your only login provider" });
    }

    const provider = req.params.provider;
    const hasProvider = userAccounts.some((a) => a.provider === provider);
    if (!hasProvider) {
      return res.status(404).json({ error: "Provider not linked" });
    }

    await unlinkAccount(session.userId, provider);
    res.json({ success: true });
  } catch (err) {
    console.error("Unlink error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/activity — admin only
router.get("/activity", async (req, res) => {
  try {
    const token = req.cookies?.authy_session;
    const session = await validateSession(token);

    if (!requireAdminSession(session)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const activity = await getRecentActivity(limit);
    res.json({ activity });
  } catch (err) {
    console.error("Activity fetch error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/admin/summary — admin only live counters
router.get("/admin/summary", async (req, res) => {
  try {
    const token = req.cookies?.authy_session;
    const session = await validateSession(token);

    if (!requireAdminSession(session)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const summary = await getActiveSessionSummary();
    res.json(summary);
  } catch (err) {
    console.error("Admin summary error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/service/token — issue RS256 service token (admin only)
router.post("/service/token", async (req, res) => {
  try {
    if (!serviceTokensEnabled()) {
      return res.status(503).json({ error: "Service tokens are not configured" });
    }

    const session = await validateSession(req.cookies?.authy_session);
    if (!requireAdminSession(session)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { service, scope, expiresIn } = req.body || {};
    if (!service || typeof service !== "string") {
      return res.status(400).json({ error: "Missing 'service' field" });
    }

    const token = issueServiceToken({
      service: service.trim(),
      scope,
      expiresIn,
    });

    return res.json({ token, tokenType: "Bearer", algorithm: "RS256" });
  } catch (err) {
    console.error("Service token issue error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /api/admin/credits — list all user wallets
router.get("/admin/credits", async (req, res) => {
  try {
    const session = await validateSession(req.cookies?.authy_session);
    if (!requireAdminSession(session)) {
      return res.status(403).json({ error: "Admin only" });
    }

    const wallets = await getAllCredits();
    return res.json({ wallets });
  } catch (err) {
    console.error("Admin credits list error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/admin/credits/grant — top up a user wallet
router.post("/admin/credits/grant", async (req, res) => {
  try {
    const session = await validateSession(req.cookies?.authy_session);
    if (!requireAdminSession(session)) {
      return res.status(403).json({ error: "Admin only" });
    }

    const userId = Number(req.body?.userId || 0);
    const amount = Math.floor(Number(req.body?.amount || 0));
    if (userId <= 0 || amount < 1) {
      return res.status(400).json({ error: "Invalid userId or amount" });
    }

    const wallet = await grantCredits(userId, amount);
    return res.json(wallet);
  } catch (err) {
    console.error("Admin grant credits error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /api/admin/users — list users with linked providers
router.get("/admin/users", async (req, res) => {
  try {
    const session = await validateSession(req.cookies?.authy_session);
    if (!requireAdminSession(session)) {
      return res.status(403).json({ error: "Admin only" });
    }

    const users = await getAllUsers();
    return res.json({ users });
  } catch (err) {
    console.error("Admin users list error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// ==================== Credits ====================

const creditsUseLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: "Too many credit requests. Slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

// GET /api/credits — get current credit balance
router.get("/credits", async (req, res) => {
  try {
    const context = await resolveAuthContext(req, res, { allowGuest: true });
    if (!context) {
      return res.status(401).json({ error: "Invalid session" });
    }

    if (context.type === "guest") {
      const credits = await getGuestCredits(context.guestId);
      return res.json(credits);
    }

    if (context.type === "service") {
      return res.status(400).json({ error: "Service token cannot query wallet directly" });
    }

    if (context.session.role === "admin") {
      return res.json({ balance: -1, unlimited: true });
    }

    const credits = await getCredits(context.session.userId);
    return res.json(credits);
  } catch (err) {
    console.error("Credits fetch error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/credits/use — deduct credits (server-side, cross-service)
// Accepts either a cookie-based session OR a forwarded token in the body.
router.post("/credits/use", creditsUseLimiter, async (req, res) => {
  try {
    const { service, amount = 1, description } = req.body;

    if (!service || typeof service !== "string") {
      return res.status(400).json({ error: "Missing 'service' field" });
    }
    const creditAmount = Math.max(1, Math.floor(Number(amount) || 1));

    const context = await resolveAuthContext(req, res, { allowGuest: true });
    if (!context) {
      return res.status(401).json({ error: "Invalid auth context" });
    }

    if (context.type === "service") {
      const scopes = new Set(context.service.scope || []);
      if (!scopes.has("credits:write")) {
        return res.status(403).json({ error: "Token scope does not allow credit operations" });
      }

      const targetUserId = Number(req.body?.userId || 0);
      const targetGuestId = String(req.body?.guestId || "").trim();
      if (targetUserId > 0) {
        const result = await useCredits(targetUserId, service, creditAmount, description);
        if (!result.success) {
          return res.status(402).json(result);
        }
        return res.json(result);
      }
      if (targetGuestId) {
        const result = await useGuestCredits(targetGuestId, service, creditAmount, description);
        if (!result.success) {
          return res.status(402).json(result);
        }
        return res.json(result);
      }

      return res.status(400).json({ error: "Provide userId or guestId for service token requests" });
    }

    if (context.type === "guest") {
      const result = await useGuestCredits(context.guestId, service, creditAmount, description);
      if (!result.success) {
        return res.status(402).json(result);
      }
      return res.json(result);
    }

    if (context.session.role === "admin") {
      return res.json({ success: true, balance: -1, unlimited: true });
    }

    const result = await useCredits(
      context.session.userId,
      service,
      creditAmount,
      description,
    );
    if (!result.success) {
      return res.status(402).json(result); // 402 Payment Required
    }

    res.json(result);
  } catch (err) {
    console.error("Credit use error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/credits/refund — refund credits (for failed operations)
router.post("/credits/refund", async (req, res) => {
  try {
    const { service, amount = 1 } = req.body;

    if (!service || typeof service !== "string") {
      return res.status(400).json({ error: "Missing 'service' field" });
    }
    const creditAmount = Math.max(1, Math.floor(Number(amount) || 1));

    const context = await resolveAuthContext(req, res, { allowGuest: false });
    if (!context) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    if (context.type === "service") {
      const scopes = new Set(context.service.scope || []);
      if (!scopes.has("credits:write")) {
        return res.status(403).json({ error: "Token scope does not allow credit operations" });
      }

      const targetUserId = Number(req.body?.userId || 0);
      if (targetUserId <= 0) {
        return res.status(400).json({ error: "Provide userId for service token refunds" });
      }
      const result = await refundCredits(targetUserId, service, creditAmount);
      return res.json(result);
    }

    if (context.type === "guest") {
      return res.status(403).json({ error: "Guest refunds are not supported" });
    }

    if (context.session.role === "admin") {
      return res.json({ success: true, balance: -1, unlimited: true });
    }

    const result = await refundCredits(context.session.userId, service, creditAmount);
    return res.json(result);
  } catch (err) {
    console.error("Credit refund error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
