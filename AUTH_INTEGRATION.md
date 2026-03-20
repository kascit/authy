# Auth Integration Guide

## 1. Use Auth On Other Pages

Add the SDK script to any `*.dhanur.me` page:

```html
<script src="https://auth.dhanur.me/auth-client.js"></script>
```

Optional for local/dev override:

```html
<script>
  window.AUTHY_CONFIG = { origin: "http://localhost:3000" };
</script>
<script src="http://localhost:3000/auth-client.js"></script>
```

## 2. Authorization Status Model

`AUTH.status` shape:

```js
{
  authenticated: boolean,
  role: "guest" | "user" | "admin",
  user: {
    id,
    email,
    name,
    avatar_url
  } | null
}
```

Useful helpers:

- `AUTH.isAuthenticated()`
- `AUTH.isAdmin()`
- `AUTH.requireAuth()`
- `AUTH.requireAdmin()`
- `AUTH.login()`
- `AUTH.upgrade()`
- `AUTH.logout()`
- `AUTH.refresh()`

## 3. Typical Access Patterns

### A) Show user info if logged in

```html
<div id="authState"></div>
<script src="https://auth.dhanur.me/auth-client.js"></script>
<script>
  const box = document.getElementById("authState");

  AUTH.onReady((auth) => {
    if (auth.isAuthenticated()) {
      box.textContent = `Hi ${auth.status.user?.name || "there"}`;
    } else {
      box.innerHTML = '<button onclick="AUTH.login()">Sign in</button>';
    }
  });

  document.addEventListener("authChanged", () => {
    location.reload();
  });
</script>
```

### B) Protect page content for signed-in users

```js
AUTH.onReady((auth) => {
  if (!auth.requireAuth()) return;
  // Render protected content
});
```

### C) Protect admin actions only

```js
AUTH.onReady((auth) => {
  if (!auth.requireAdmin()) return;
  // Render admin-only controls
});
```

## 4. Backend/API Guards

Current behavior from auth service:

- `GET /api/status`: public, returns current auth state.
- `GET /api/accounts`: requires signed-in user.
- `DELETE /api/accounts/:provider`: requires signed-in user.
- `POST /api/verify`: requires signed-in user, then elevates role to `admin` on valid TOTP.
- `GET /api/activity`: requires role `admin`.
- `POST /api/logout`: clears session.

## 5. Minimal Profile Config

Your current model is enough for now:

- keep OAuth-derived `name`, `email`, `avatar_url`
- no separate profile settings page required yet

Add profile editing later only if you need:

- custom display name independent of OAuth
- user-uploaded avatar
- per-app preferences

## 6. Functionality Testing Checklist

### Automated smoke tests already run locally

- `GET /api/health` -> `200`
- `GET /api/providers` -> `200` with enabled providers
- `GET /api/status` (guest) -> `authenticated: false`
- `GET /api/accounts` (guest) -> `401`
- `GET /api/activity` (guest) -> `401`
- `POST /api/verify` with invalid code format -> `400`
- `POST /api/verify` without login -> `401`
- `POST /api/logout` -> `200`
- `GET /auth/google` -> `302` redirect to provider

### Manual browser checks

1. Login via each enabled provider (Google/GitHub/Discord/LinkedIn).
2. Confirm post-login state shows user info and linked providers.
3. Link one additional provider from account panel.
4. Unlink provider works unless it is the only linked provider.
5. Enter valid TOTP at `/verify` and confirm role becomes `admin`.
6. Confirm activity log is visible only when role is `admin`.
7. Logout and ensure protected endpoints return unauthorized.
