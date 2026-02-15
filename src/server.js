import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb, getRecentActivity, logActivity } from './db.js';
import {
  verifyAndCreateSession,
  validateSession,
  generateTOTPSecret,
  runCleanup,
} from './auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---

app.use(express.json());
app.use(cookieParser());

// CORS — allow configured origins with credentials
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow any subdomain of dhanur.me
    if (/^https?:\/\/([a-z0-9-]+\.)*dhanur\.me$/.test(origin)) {
      return callback(null, true);
    }
    // Allow explicitly listed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In dev, allow localhost
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Rate limit on verify endpoint
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

// --- Cookie Config ---

function getCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  };
}

// --- Helpers ---

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
}

function getUserAgent(req) {
  return req.headers['user-agent'] || 'unknown';
}

// --- Routes ---

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Check auth status
app.get('/api/status', async (req, res) => {
  try {
    const token = req.cookies?.authy_session;
    const isValid = await validateSession(token);
    res.json({
      authenticated: isValid,
      role: isValid ? 'admin' : 'guest',
    });
  } catch (err) {
    console.error('Status check error:', err.message);
    res.json({ authenticated: false, role: 'guest' });
  }
});

// Verify TOTP and issue session
app.post('/api/verify', verifyLimiter, async (req, res) => {
  const { code } = req.body;
  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  if (!code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid code format. Must be 6 digits.' });
  }

  try {
    const result = await verifyAndCreateSession(code, ip, ua);

    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }

    res.cookie('authy_session', result.token, getCookieOptions());
    res.json({ success: true, role: 'admin' });
  } catch (err) {
    console.error('Verify error:', err.message);
    try { await logActivity('totp_verify', ip, ua, false, `Server error: ${err.message}`); } catch (_) {}
    res.status(500).json({ error: 'Server error' });
  }
});

// First-time TOTP setup — generate secret + QR code
app.get('/api/setup', async (req, res) => {
  // Disable once TOTP_SECRET is set
  if (process.env.TOTP_SECRET) {
    return res.status(403).json({
      error: 'Setup already complete. TOTP_SECRET is configured.',
    });
  }

  try {
    const secret = generateTOTPSecret();
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    const ip = getClientIp(req);
    const ua = getUserAgent(req);
    try { await logActivity('setup', ip, ua, true, 'TOTP secret generated'); } catch (_) {}

    res.json({
      message: 'Scan the QR code with Authy, then set TOTP_SECRET as an environment variable.',
      secret_base32: secret.base32,
      otpauth_url: secret.otpauth_url,
      qr_code: qrDataUrl,
    });
  } catch (err) {
    console.error('Setup error:', err.message);
    res.status(500).json({ error: 'Failed to generate TOTP secret' });
  }
});

// Recent activity log (admin-only)
app.get('/api/activity', async (req, res) => {
  try {
    const token = req.cookies?.authy_session;
    const isValid = await validateSession(token);

    if (!isValid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const activity = await getRecentActivity(limit);
    res.json({ activity });
  } catch (err) {
    console.error('Activity fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Serve Static Auth Page ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.static(join(__dirname, '..', 'public')));

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// --- Startup ---

async function start() {
  let dbReady = false;

  try {
    await initDb();
    console.log('✓ Database connected');
    dbReady = true;

    // Run initial cleanup
    await runCleanup();

    // Schedule cleanup every hour
    setInterval(runCleanup, 60 * 60 * 1000);
  } catch (err) {
    console.warn('⚠ Database connection failed:', err.message);
    console.warn('  Server will start but API endpoints will not work.');
    console.warn('  Set valid TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env');
  }

  app.listen(PORT, () => {
    console.log(`🔐 Authy server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Database: ${dbReady ? '✓ connected' : '✗ not connected'}`);
    console.log(`   TOTP configured: ${!!process.env.TOTP_SECRET}`);
  });
}

start();
