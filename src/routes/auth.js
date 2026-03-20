import { Router } from "express";
import { passport } from "../lib/passport.js";
import { getProviderByName } from "../config/providers.js";
import { findOrCreateUser } from "../lib/users.js";
import {
  createSession,
  validateSession,
  getCookieOptions,
} from "../lib/session.js";
import { logActivity, findAccountByProvider, linkAccount } from "../db.js";

const router = Router();

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
}

function getUserAgent(req) {
  return req.headers["user-agent"] || "unknown";
}

// GET /auth/:provider — initiate OAuth
router.get("/:provider", (req, res, next) => {
  const provider = getProviderByName(req.params.provider);
  if (!provider) {
    return res
      .status(404)
      .json({ error: `Provider '${req.params.provider}' not available` });
  }

  // Encode mode + popup in state so callback knows what to do
  const isPopup = req.query.popup === "true";
  const isLink = req.query.mode === "link";
  let state = "redirect";
  if (isLink && isPopup) state = "link-popup";
  else if (isLink) state = "link";
  else if (isPopup) state = "popup";

  passport.authenticate(provider.name, {
    session: false,
    scope: provider.scope,
    state,
  })(req, res, next);
});

// /auth/:provider/callback — OAuth callback (GET for most, POST for Apple)
function handleCallback(req, res, next) {
  const providerConfig = getProviderByName(req.params.provider);
  if (!providerConfig) {
    return res.status(404).json({ error: "Provider not available" });
  }

  passport.authenticate(
    providerConfig.name,
    { session: false },
    async (err, oauthProfile) => {
      const ip = getClientIp(req);
      const ua = getUserAgent(req);
      const state = req.query.state || req.body?.state || "redirect";
      const isLinkMode = state.startsWith("link");
      const isPopup = state === "popup" || state === "link-popup";

      if (err || !oauthProfile) {
        console.error("OAuth error:", err?.message || "No profile returned");
        try {
          await logActivity(
            "oauth_login",
            ip,
            ua,
            false,
            `Provider: ${providerConfig.name}, Error: ${err?.message || "No profile"}`,
          );
        } catch (_) {}

        if (isPopup) {
          return res.redirect("/popup-callback.html?error=auth_failed");
        }
        return res.redirect("/login?error=auth_failed");
      }

      try {
        // Link mode: attach provider to existing logged-in user
        if (isLinkMode) {
          const token = req.cookies?.authy_session;
          const session = await validateSession(token);
          if (!session) {
            if (isPopup) {
              return res.redirect("/popup-callback.html?error=not_logged_in");
            }
            return res.redirect("/login?error=not_logged_in");
          }

          const providerAccountId = String(oauthProfile.providerAccountId);

          // Check if this provider account is already linked to another user
          const existing = await findAccountByProvider(
            oauthProfile.provider,
            providerAccountId,
          );
          if (existing && existing.user_id !== session.userId) {
            if (isPopup) {
              return res.redirect(
                "/popup-callback.html?error=account_linked_to_other_user",
              );
            }
            return res.redirect("/login?error=account_linked_to_other_user");
          }

          // Link the account to current user
          await linkAccount(
            session.userId,
            oauthProfile.provider,
            providerAccountId,
            oauthProfile.accessToken || null,
            oauthProfile.refreshToken || null,
          );

          await logActivity(
            "account_link",
            ip,
            ua,
            true,
            `Provider: ${providerConfig.name}`,
            session.userId,
          );

          if (isPopup) {
            return res.redirect("/popup-callback.html");
          }
          return res.redirect("/");
        }

        // Normal login mode: find or create user + create session
        const user = await findOrCreateUser(oauthProfile);
        const token = await createSession(user.id, ip, ua);
        res.cookie("authy_session", token, getCookieOptions());

        await logActivity(
          "oauth_login",
          ip,
          ua,
          true,
          `Provider: ${providerConfig.name}`,
          user.id,
        );

        if (isPopup) {
          return res.redirect("/popup-callback.html");
        }
        res.redirect("/");
      } catch (err) {
        console.error("OAuth callback error:", err);
        try {
          await logActivity(
            "oauth_login",
            ip,
            ua,
            false,
            `Provider: ${providerConfig.name}, Error: ${err.message}`,
          );
        } catch (_) {}

        if (isPopup) {
          return res.redirect("/popup-callback.html?error=server_error");
        }
        res.redirect("/login?error=server_error");
      }
    },
  )(req, res, next);
}

router.get("/:provider/callback", handleCallback);
router.post("/:provider/callback", handleCallback); // Apple Sign-In sends POST

export default router;
