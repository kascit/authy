const AUTH_SERVICE = process.env.AUTH_SERVICE_URL || "https://auth.dhanur.me";

function buildForwardHeaders(req = {}) {
  const headers = {
    Cookie: req.headers?.cookie || "",
  };

  if (req.headers?.authorization) {
    headers.Authorization = req.headers.authorization;
  }

  return headers;
}

export async function checkAuth(req, _res, next) {
  try {
    const response = await fetch(`${AUTH_SERVICE}/api/status`, {
      headers: buildForwardHeaders(req),
    });

    req.auth = response.ok
      ? await response.json()
      : { authenticated: false, role: "guest", user: null, credits: null };
  } catch (error) {
    console.error("[auth] Failed to check status:", error.message);
    req.auth = { authenticated: false, role: "guest", user: null, credits: null };
  }

  next();
}

export function requireAuth(req, res, next) {
  if (!req.auth?.authenticated) {
    return res.status(401).json({
      error: "Authentication required",
      loginUrl: `${AUTH_SERVICE}/login`,
    });
  }
  return next();
}

export function requireAdmin(req, res, next) {
  if (req.auth?.role !== "admin") {
    return res.status(403).json({
      error: "Admin access required",
      verifyUrl: `${AUTH_SERVICE}/verify`,
    });
  }
  return next();
}

export async function debitCredits(req, service, amount = 1, extra = {}) {
  const response = await fetch(`${AUTH_SERVICE}/api/credits/use`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildForwardHeaders(req),
    },
    body: JSON.stringify({ service, amount, ...extra }),
  });

  return response.json();
}
