import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initDb } from "./db.js";
import { passport, initPassport } from "./lib/passport.js";
import { runCleanup } from "./lib/session.js";
import apiRoutes from "./routes/api.js";
import authRoutes from "./routes/auth.js";

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // needed for Apple Sign-In POST callback
app.use(cookieParser());
app.use(passport.initialize());

// CORS — allow configured origins with credentials
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (/^https?:\/\/([a-z0-9-]+\.)*dhanur\.me$/.test(origin)) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (
        process.env.NODE_ENV !== "production" &&
        /^http:\/\/localhost/.test(origin)
      ) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
  }),
);

// --- Routes ---

app.use("/api", apiRoutes);
app.use("/auth", authRoutes);

// --- Static Files ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "..", "public");

app.use(express.static(publicDir));

// Page routes — serve specific HTML files
app.get("/.well-known/web-app-origin-association", (_req, res) => {
  res.json({
    web_apps: [{
      manifest: "https://dhanur.me/icons/site.webmanifest",
      details: { paths: ["/*"] }
    }]
  });
});

app.get("/login", (_req, res) => {
  res.sendFile(join(publicDir, "index.html"));
});
app.get("/verify", (_req, res) => {
  res.sendFile(join(publicDir, "verify.html"));
});
app.get("/admin", (_req, res) => {
  res.sendFile(join(publicDir, "verify.html"));
});

// Root route — serve dashboard (index.html handles state routing)
app.get("/", (_req, res) => {
  res.sendFile(join(publicDir, "index.html"));
});

// Fallback — 404 for unknown routes
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.status(404).sendFile(join(publicDir, "index.html"));
});

// --- Startup ---

async function start() {
  let dbReady = false;

  try {
    await initDb();
    console.log("✓ Database connected");
    dbReady = true;

    await runCleanup();
    setInterval(runCleanup, 60 * 60 * 1000);
  } catch (err) {
    console.warn("⚠ Database connection failed:", err.message);
    console.warn("  Server will start but API endpoints will not work.");
    console.warn("  Set valid TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env");
  }

  try {
    initPassport();
  } catch (err) {
    console.warn("⚠ Passport initialization warning:", err.message);
  }

  app.listen(PORT, () => {
    console.log(`Authy server running on port ${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`  Database: ${dbReady ? "connected" : "not connected"}`);
    console.log(`  TOTP configured: ${!!process.env.TOTP_SECRET}`);
  });
}

start();
