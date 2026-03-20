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
  useCredits,
  refundCredits,
} from "../db.js";
import { getEnabledProviders } from "../config/providers.js";

const router = Router();

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
}

function getUserAgent(req) {
  return req.headers["user-agent"] || "unknown";
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
    const token = req.cookies?.authy_session;
    const session = await validateSession(token);

    if (!session) {
      return res.json({ authenticated: false, role: "guest", user: null, credits: null });
    }

    // Admin gets unlimited credits, regular users get actual balance
    let credits = null;
    if (session.role === "admin") {
      credits = { balance: -1, unlimited: true };
    } else {
      credits = await getCredits(session.userId);
    }

    res.json({
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
    res.json({ authenticated: false, role: "guest", user: null, credits: null });
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

// GET /api/setup — first-time TOTP QR code
router.get("/setup", async (req, res) => {
  if (process.env.TOTP_SECRET) {
    return res.status(403).json({
      error: "Setup already complete. TOTP_SECRET is configured.",
    });
  }

  try {
    const secret = generateTOTPSecret();
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    try {
      await logActivity("setup", ip, ua, true, "TOTP secret generated");
    } catch (_) {}

    res.json({
      message:
        "Scan the QR code with your authenticator app, then set TOTP_SECRET as an environment variable.",
      secret_base32: secret.base32,
      otpauth_url: secret.otpauth_url,
      qr_code: qrDataUrl,
    });
  } catch (err) {
    console.error("Setup error:", err.message);
    res.status(500).json({ error: "Failed to generate TOTP secret" });
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

    if (!session || session.role !== "admin") {
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

    if (!session || session.role !== "admin") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const summary = await getActiveSessionSummary();
    res.json(summary);
  } catch (err) {
    console.error("Admin summary error:", err.message);
    res.status(500).json({ error: "Server error" });
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
    const token = req.cookies?.authy_session;
    const session = await validateSession(token);
    if (!session) {
      return res.status(401).json({ error: "Must be logged in" });
    }

    if (session.role === "admin") {
      return res.json({ balance: -1, unlimited: true });
    }

    const credits = await getCredits(session.userId);
    res.json(credits);
  } catch (err) {
    console.error("Credits fetch error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/credits/use — deduct credits (server-side, cross-service)
// Accepts either a cookie-based session OR a forwarded token in the body.
router.post("/credits/use", creditsUseLimiter, async (req, res) => {
  try {
    const { service, amount = 1, description, token: bodyToken } = req.body;

    if (!service || typeof service !== "string") {
      return res.status(400).json({ error: "Missing 'service' field" });
    }
    const creditAmount = Math.max(1, Math.floor(Number(amount) || 1));

    // Accept token from body (cross-service) or from cookie (same-origin)
    const sessionToken = bodyToken || req.cookies?.authy_session;
    const session = await validateSession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    // Admin has unlimited credits
    if (session.role === "admin") {
      return res.json({ success: true, balance: -1, unlimited: true });
    }

    const result = await useCredits(session.userId, service, creditAmount, description);
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
    const { service, amount = 1, token: bodyToken } = req.body;

    if (!service || typeof service !== "string") {
      return res.status(400).json({ error: "Missing 'service' field" });
    }
    const creditAmount = Math.max(1, Math.floor(Number(amount) || 1));

    const sessionToken = bodyToken || req.cookies?.authy_session;
    const session = await validateSession(sessionToken);
    if (!session) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    if (session.role === "admin") {
      return res.json({ success: true, balance: -1, unlimited: true });
    }

    const result = await refundCredits(session.userId, service, creditAmount);
    res.json(result);
  } catch (err) {
    console.error("Credit refund error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
