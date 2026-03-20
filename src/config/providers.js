import GoogleStrategy from "passport-google-oauth20";
import GitHubStrategy from "passport-github2";
import { Strategy as DiscordStrategy } from "passport-discord-auth";
import FacebookStrategy from "passport-facebook";
import OAuth2Strategy from "passport-oauth2";
import { Strategy as SpotifyStrategy } from "passport-spotify";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import AppleStrategy from "passport-apple";
import { Strategy as TwitchStrategy } from "passport-twitch-new";

// LinkedIn OIDC — passport-linkedin-oauth2 is broken with LinkedIn's new API,
// so we use the generic OAuth2Strategy with a custom userProfile method.
class LinkedInOIDCStrategy extends OAuth2Strategy {
  constructor(options, verify) {
    super(
      {
        authorizationURL: "https://www.linkedin.com/oauth/v2/authorization",
        tokenURL: "https://www.linkedin.com/oauth/v2/accessToken",
        ...options,
      },
      verify,
    );
    this.name = "linkedin";
  }

  userProfile(accessToken, done) {
    this._oauth2.useAuthorizationHeaderforGET(true);
    this._oauth2.get(
      "https://api.linkedin.com/v2/userinfo",
      accessToken,
      (err, body) => {
        if (err) return done(err);
        try {
          const json = JSON.parse(body);
          done(null, {
            provider: "linkedin",
            id: json.sub,
            displayName: json.name,
            email: json.email,
            picture: json.picture,
            _json: json,
          });
        } catch (e) {
          done(e);
        }
      },
    );
  }
}

const ALL_PROVIDERS = [
  {
    name: "google",
    displayName: "Google",
    strategy: GoogleStrategy,
    requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    scope: ["profile", "email"],
    strategyOptions: (callbackURL) => ({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
    }),
    extractProfile: (profile) => ({
      providerAccountId: profile.id,
      email: profile.emails?.[0]?.value || null,
      name: profile.displayName || null,
      avatarUrl: profile.photos?.[0]?.value || null,
    }),
  },
  {
    name: "github",
    displayName: "GitHub",
    strategy: GitHubStrategy,
    requiredEnv: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    scope: ["user:email"],
    strategyOptions: (callbackURL) => ({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL,
    }),
    extractProfile: (profile) => ({
      providerAccountId: profile.id,
      email: profile.emails?.[0]?.value || null,
      name: profile.displayName || profile.username || null,
      avatarUrl: profile.photos?.[0]?.value || null,
    }),
  },
  {
    name: "discord",
    displayName: "Discord",
    strategy: DiscordStrategy,
    requiredEnv: ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
    scope: ["identify", "email"],
    // discord-auth uses camelCase options
    strategyOptions: (callbackURL) => ({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      callbackUrl: callbackURL,
      scope: ["identify", "email"],
    }),
    extractProfile: (profile) => ({
      providerAccountId: profile.id,
      email: profile.email || null,
      name: profile.global_name || profile.username || null,
      avatarUrl: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
        : null,
    }),
  },
  {
    name: "facebook",
    displayName: "Facebook",
    strategy: FacebookStrategy,
    requiredEnv: ["FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"],
    scope: ["email"],
    strategyOptions: (callbackURL) => ({
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL,
      profileFields: ["id", "displayName", "email", "photos"],
    }),
    extractProfile: (profile) => ({
      providerAccountId: profile.id,
      email: profile.emails?.[0]?.value || null,
      name: profile.displayName || null,
      avatarUrl: profile.photos?.[0]?.value || null,
    }),
  },
  {
    name: "microsoft",
    displayName: "Microsoft",
    strategy: MicrosoftStrategy,
    requiredEnv: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    scope: ["user.read"],
    strategyOptions: (callbackURL) => ({
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL,
      scope: ["user.read"],
    }),
    extractProfile: (profile) => ({
      providerAccountId: profile.id,
      email: profile.emails?.[0]?.value || null,
      name: profile.displayName || null,
      avatarUrl: null, // Microsoft Graph API doesn't return photo URL in profile
    }),
  },
  {
    name: "linkedin",
    displayName: "LinkedIn",
    strategy: LinkedInOIDCStrategy,
    requiredEnv: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    scope: ["openid", "profile", "email"],
    strategyOptions: (callbackURL) => ({
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL,
      scope: ["openid", "profile", "email"],
    }),
    extractProfile: (profile) => ({
      providerAccountId: profile.id,
      email: profile.email || null,
      name: profile.displayName || null,
      avatarUrl: profile.picture || null,
    }),
  },
  {
    name: "spotify",
    displayName: "Spotify",
    strategy: SpotifyStrategy,
    requiredEnv: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
    scope: ["user-read-email"],
    strategyOptions: (callbackURL) => ({
      clientID: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      callbackURL,
    }),
    extractProfile: (profile) => ({
      providerAccountId: profile.id,
      email: profile.emails?.[0]?.value || null,
      name: profile.displayName || null,
      avatarUrl: profile.photos?.[0]?.value || null,
    }),
  },
  {
    name: "twitch",
    displayName: "Twitch",
    strategy: TwitchStrategy,
    requiredEnv: ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"],
    scope: ["user:read:email"],
    strategyOptions: (callbackURL) => ({
      clientID: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
      callbackURL,
      scope: "user:read:email",
    }),
    extractProfile: (profile) => ({
      providerAccountId: profile.id,
      email: profile.email || null,
      name: profile.display_name || profile.login || null,
      avatarUrl: profile.profile_image_url || null,
    }),
  },
  {
    name: "apple",
    displayName: "Apple",
    strategy: AppleStrategy,
    requiredEnv: [
      "APPLE_CLIENT_ID",
      "APPLE_TEAM_ID",
      "APPLE_KEY_ID",
      "APPLE_PRIVATE_KEY",
    ],
    scope: ["name", "email"],
    // Apple has a unique constructor — needs passReqToCallback
    strategyOptions: (callbackURL) => ({
      clientID: process.env.APPLE_CLIENT_ID,
      teamID: process.env.APPLE_TEAM_ID,
      keyID: process.env.APPLE_KEY_ID,
      privateKeyString: process.env.APPLE_PRIVATE_KEY,
      callbackURL,
      passReqToCallback: true,
      scope: ["name", "email"],
    }),
    // Apple's verify callback is different: (req, accessToken, refreshToken, idToken, profile, cb)
    isApple: true,
    extractProfile: (_profile, idToken) => ({
      providerAccountId: idToken?.sub || null,
      email: idToken?.email || null,
      name: null, // Apple only returns name on first login, via req.body
      avatarUrl: null,
    }),
  },
];

export function getEnabledProviders() {
  return ALL_PROVIDERS.filter((p) =>
    p.requiredEnv.every((env) => process.env[env]),
  );
}

export function getProviderByName(name) {
  return getEnabledProviders().find((p) => p.name === name) || null;
}
