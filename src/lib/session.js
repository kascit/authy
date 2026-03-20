import crypto from "crypto";
import {
  createSession as dbCreateSession,
  findSessionWithUser,
  setAdminUntil as dbSetAdminUntil,
  destroySession as dbDestroySession,
  deleteExpiredSessions,
  cleanupUsedCodes,
} from "../db.js";

function hashToken(token) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(token)
    .digest("hex");
}

export async function createSession(userId, ip, userAgent) {
  const token = crypto.randomBytes(48).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "");

  await dbCreateSession(tokenHash, userId, ip, userAgent, expiresAt);
  return token; // raw token for the cookie
}

export async function validateSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await findSessionWithUser(tokenHash);
  if (!session) return null;

  // Determine role based on admin_until timestamp
  let role = "user";
  if (session.admin_until) {
    const adminExpiry = new Date(session.admin_until + "Z");
    if (adminExpiry > new Date()) {
      role = "admin";
    }
  }

  return {
    sessionId: session.id,
    userId: session.uid,
    email: session.email,
    name: session.name,
    avatarUrl: session.avatar_url,
    role,
    tokenHash,
  };
}

export async function elevateToAdmin(token) {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const hours = parseInt(process.env.ADMIN_DURATION_HOURS) || 24;
  const adminUntil = new Date(Date.now() + hours * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "");
  await dbSetAdminUntil(tokenHash, adminUntil);
  return true;
}

export async function destroySession(token) {
  if (!token) return false;
  const tokenHash = hashToken(token);
  await dbDestroySession(tokenHash);
  return true;
}

export function getCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    domain: process.env.COOKIE_DOMAIN || undefined,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/",
  };
}

export async function runCleanup() {
  try {
    const deleted = await deleteExpiredSessions();
    await cleanupUsedCodes();
    if (deleted > 0) {
      console.log(`Cleaned up ${deleted} expired session(s)`);
    }
  } catch (err) {
    console.error("Cleanup error:", err.message);
  }
}
