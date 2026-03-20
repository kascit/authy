import speakeasy from "speakeasy";
import { isCodeUsed, markCodeUsed, logActivity } from "../db.js";

export function verifyTOTP(code) {
  const secret = process.env.TOTP_SECRET;
  if (!secret) {
    throw new Error("TOTP_SECRET not configured");
  }

  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: code,
    window: 1, // Allow 1 step before/after for clock drift
  });
}

export function generateTOTPSecret() {
  return speakeasy.generateSecret({
    name: "Authy (dhanur.me)",
    issuer: "dhanur.me",
    length: 32,
  });
}

export async function checkAndMarkCode(code) {
  const used = await isCodeUsed(code);
  if (used) return false;
  await markCodeUsed(code);
  return true;
}

export async function verifyCodeForUpgrade(code, ip, userAgent, userId) {
  const isValid = verifyTOTP(code);
  if (!isValid) {
    await logActivity(
      "totp_verify",
      ip,
      userAgent,
      false,
      "Invalid code",
      userId,
    );
    return { success: false, error: "Invalid code" };
  }

  const isUnused = await checkAndMarkCode(code);
  if (!isUnused) {
    await logActivity(
      "totp_verify",
      ip,
      userAgent,
      false,
      "Code already used",
      userId,
    );
    return { success: false, error: "Code already used. Wait for next code." };
  }

  await logActivity(
    "totp_verify",
    ip,
    userAgent,
    true,
    "Admin elevated",
    userId,
  );
  return { success: true };
}
