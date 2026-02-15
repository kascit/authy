import crypto from 'crypto';
import speakeasy from 'speakeasy';
import {
  createSession as dbCreateSession,
  findSession,
  logActivity,
  isCodeUsed,
  markCodeUsed,
  deleteExpiredSessions,
  cleanupUsedCodes,
} from './db.js';

// --- TOTP ---

export function verifyTOTP(code) {
  const secret = process.env.TOTP_SECRET;
  if (!secret) {
    throw new Error('TOTP_SECRET not configured');
  }

  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: code,
    window: 1, // Allow 1 step before/after for clock drift
  });
}

export function generateTOTPSecret() {
  const secret = speakeasy.generateSecret({
    name: 'Authy (dhanur.me)',
    issuer: 'dhanur.me',
    length: 32,
  });
  return secret;
}

// --- Sessions ---

function hashToken(token) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET)
    .update(token)
    .digest('hex');
}

export async function createSession(ip, userAgent) {
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '');

  await dbCreateSession(tokenHash, ip, userAgent, expiresAt);
  return token; // Return raw token for the cookie
}

export async function validateSession(token) {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const session = await findSession(tokenHash);
  return !!session;
}

// --- Code Reuse Guard ---

export async function checkAndMarkCode(code) {
  const used = await isCodeUsed(code);
  if (used) return false;
  await markCodeUsed(code);
  return true;
}

// --- Full Verify Flow ---

export async function verifyAndCreateSession(code, ip, userAgent) {
  // 1. Verify TOTP
  const isValid = verifyTOTP(code);
  if (!isValid) {
    await logActivity('totp_verify', ip, userAgent, false, 'Invalid code');
    return { success: false, error: 'Invalid code' };
  }

  // 2. Check code reuse
  const isUnused = await checkAndMarkCode(code);
  if (!isUnused) {
    await logActivity('totp_verify', ip, userAgent, false, 'Code already used');
    return { success: false, error: 'Code already used. Wait for next code.' };
  }

  // 3. Create session
  const token = await createSession(ip, userAgent);
  await logActivity('totp_verify', ip, userAgent, true, 'Session created');

  return { success: true, token };
}

// --- Cleanup ---

export async function runCleanup() {
  try {
    const deleted = await deleteExpiredSessions();
    await cleanupUsedCodes();
    if (deleted > 0) {
      console.log(`🧹 Cleaned up ${deleted} expired session(s)`);
    }
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}
