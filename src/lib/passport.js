import passport from "passport";
import { getEnabledProviders } from "../config/providers.js";

const AUTH_BASE_URL = process.env.AUTH_BASE_URL || "https://auth.dhanur.me";

export function initPassport() {
  const providers = getEnabledProviders();

  for (const provider of providers) {
    const callbackURL = `${AUTH_BASE_URL}/auth/${provider.name}/callback`;
    const options = provider.strategyOptions(callbackURL);

    let verify;

    if (provider.isApple) {
      // Apple has a unique callback: (req, accessToken, refreshToken, idToken, profile, cb)
      verify = (req, accessToken, refreshToken, idToken, profile, done) => {
        const extracted = provider.extractProfile(profile, idToken);
        // Apple only sends name on first auth, via POST body
        if (!extracted.name && req.body) {
          const firstName = req.body.user?.name?.firstName || "";
          const lastName = req.body.user?.name?.lastName || "";
          extracted.name =
            [firstName, lastName].filter(Boolean).join(" ") || null;
        }
        done(null, {
          provider: provider.name,
          ...extracted,
          accessToken,
          refreshToken,
        });
      };
    } else {
      verify = (accessToken, refreshToken, profile, done) => {
        const extracted = provider.extractProfile(profile);
        done(null, {
          provider: provider.name,
          ...extracted,
          accessToken,
          refreshToken,
        });
      };
    }

    passport.use(provider.name, new provider.strategy(options, verify));
  }

  const names = providers.map((p) => p.name).join(", ");
  console.log(
    `✓ Passport initialized with ${providers.length} provider(s)${names ? `: ${names}` : ""}`,
  );
}

export { passport };
