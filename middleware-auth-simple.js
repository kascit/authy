/**
 * ULTRA-SIMPLE AUTH MIDDLEWARE
 *
 * Use this ONLY when backend needs to validate auth.
 * For most cases, just use auth-client.js on frontend!
 *
 * Usage:
 *   const { checkAuth, requireAuth, requireAdmin } = require('./middleware-auth-simple');
 *
 *   // Option 1: Check auth on all routes
 *   app.use(checkAuth);
 *
 *   // Option 2: Protect specific routes
 *   router.get('/api/tasks', checkAuth, requireAuth, (req, res) => {
 *     // req.auth is populated
 *     res.json({ tasks: [] });
 *   });
 */

const AUTH_SERVICE = process.env.AUTH_SERVICE_URL || "https://auth.dhanur.me";

/**
 * Check auth status by calling auth.dhanur.me
 * Adds req.auth = { authenticated, role, user }
 */
async function checkAuth(req, res, next) {
  try {
    const response = await fetch(`${AUTH_SERVICE}/api/status`, {
      headers: {
        Cookie: req.headers.cookie || "",
      },
    });

    if (response.ok) {
      req.auth = await response.json();
    } else {
      req.auth = { authenticated: false, role: "guest", user: null };
    }
  } catch (error) {
    console.error("[auth] Failed to check status:", error.message);
    req.auth = { authenticated: false, role: "guest", user: null };
  }

  next();
}

/**
 * Require user to be authenticated
 * Use after checkAuth middleware
 */
function requireAuth(req, res, next) {
  if (!req.auth || !req.auth.authenticated) {
    return res.status(401).json({
      error: "Authentication required",
      hint: "Visit https://auth.dhanur.me to login",
    });
  }
  next();
}

/**
 * Require user to be admin
 * Use after checkAuth middleware
 */
function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.role !== "admin") {
    return res.status(403).json({
      error: "Admin access required",
      hint: "Complete TOTP verification at https://auth.dhanur.me/verify",
    });
  }
  next();
}

module.exports = {
  checkAuth,
  requireAuth,
  requireAdmin,
};
