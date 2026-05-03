import crypto from "crypto";
import jwt from "jsonwebtoken";

const SERVICE_ISSUER = process.env.SERVICE_TOKEN_ISSUER || "authy";
const SERVICE_AUDIENCE = process.env.SERVICE_TOKEN_AUDIENCE || "dhanur-services";
const SERVICE_TOKEN_DEFAULT_TTL = process.env.SERVICE_TOKEN_DEFAULT_TTL || "15m";

let privateKeyCache = null;
let publicKeyCache = null;

function normalizePem(value) {
  if (!value) return null;
  return String(value).replace(/\\n/g, "\n").trim();
}

function getPrivateKey() {
  if (privateKeyCache !== null) return privateKeyCache;
  privateKeyCache = normalizePem(process.env.SERVICE_JWT_PRIVATE_KEY);
  return privateKeyCache;
}

function getPublicKey() {
  if (publicKeyCache !== null) return publicKeyCache;
  publicKeyCache = normalizePem(process.env.SERVICE_JWT_PUBLIC_KEY);
  return publicKeyCache;
}

export function serviceTokensEnabled() {
  return !!(getPrivateKey() && getPublicKey());
}

export function issueServiceToken({
  service,
  scope = ["auth:status", "credits:write"],
  role = "service",
  expiresIn = SERVICE_TOKEN_DEFAULT_TTL,
} = {}) {
  const privateKey = getPrivateKey();
  if (!privateKey) {
    throw new Error("SERVICE_JWT_PRIVATE_KEY is not configured");
  }

  const scopes = Array.isArray(scope)
    ? scope.filter(Boolean)
    : String(scope || "")
        .split(/[\s,]+/)
        .filter(Boolean);

  const payload = {
    type: "service",
    role,
    scope: scopes,
    jti: crypto.randomUUID(),
  };

  return jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    issuer: SERVICE_ISSUER,
    audience: SERVICE_AUDIENCE,
    subject: service || "unknown-service",
    expiresIn,
  });
}

export function verifyServiceToken(token) {
  const publicKey = getPublicKey();
  if (!publicKey) {
    return null;
  }

  try {
    const payload = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: SERVICE_ISSUER,
      audience: SERVICE_AUDIENCE,
    });

    if (!payload || payload.type !== "service") {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
