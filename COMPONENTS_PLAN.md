# Components.js Integration Plan

## 🎯 Updated Architecture (Smart Routing + Admin Dashboard)

### **Routing Strategy**

```
auth.dhanur.me routing:
- /              → Dashboard (shows login if guest, dashboard if authenticated)
- /login         → Login page (redirects to / if already authenticated)
- /verify        → TOTP admin verification page
- /admin         → Alias for /verify

Popup mode (via ?popup=true):
- Disables all redirects
- Works from any *.dhanur.me subdomain
- Closes automatically after auth
```

### **State Machine**

```
Guest → auth.dhanur.me/
  ├── Shows login UI
  └── After login → Dashboard with account management

User → auth.dhanur.me/
  ├── Shows dashboard
  ├── Account linking/unlinking
  └── Can upgrade to admin via /verify

Admin → auth.dhanur.me/
  ├── Shows full dashboard
  ├── Account management
  └── Admin stats + activity log
```

## 📊 Admin Dashboard (NEW)

The admin dashboard now shows:

1. **Stats Cards** (2-column grid):
   - Total Logins (last 100 events)
   - Admin Actions (TOTP verifications)

2. **Activity Table** (compact, auto-loading):
   - Last 10 entries shown
   - Max height with scroll
   - Refresh button
   - Hover effects on rows

No more collapsible accordion - everything loads immediately for admins.

## 📋 Implementation Strategy

### 1. **Navbar HTML Enhancement**

Add to the navbar-end section:

```html
<div class="navbar-end gap-2">
  <!-- Existing nav items -->

  <!-- Auth Section -->
  <div id="auth-ui">
    <!-- Guest State -->
    <button id="auth-login-btn" class="btn btn-primary btn-sm gap-2">
      <svg
        class="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
        />
      </svg>
      Login
    </button>

    <!-- Authenticated State (hidden by default) -->
    <div id="auth-profile" class="dropdown dropdown-end hidden">
      <label tabindex="0" class="btn btn-ghost btn-circle avatar">
        <div
          class="w-10 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2"
        >
          <img id="auth-avatar" src="" alt="Profile" />
        </div>
      </label>
      <ul
        tabindex="0"
        class="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-box w-64 mt-3 border border-base-300"
      >
        <!-- User Info Header -->
        <li class="menu-title px-4 py-3 border-b border-base-300">
          <div class="flex items-center gap-2 w-full">
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate" id="auth-name"></div>
              <div class="text-xs opacity-70 truncate" id="auth-email"></div>
            </div>
            <span id="auth-role-badge" class="badge badge-sm"></span>
          </div>
        </li>

        <!-- Actions -->
        <li>
          <a href="https://auth.dhanur.me" target="_blank">
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Manage Account
          </a>
        </li>

        <li id="auth-upgrade-item">
          <a id="auth-upgrade-btn">
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Admin Verify
          </a>
        </li>

        <li class="border-t border-base-300 mt-1">
          <a id="auth-logout-btn">
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Logout
          </a>
        </li>
      </ul>
    </div>
  </div>
</div>
```

### 2. **Auth Integration Script**

Add after navbar rendering in components.js:

```javascript
// ============================================
// Auth Integration (if auth-client.js loaded)
// ============================================
(function initAuthUI() {
  // Only run if AUTH SDK is available
  if (typeof AUTH === "undefined") return;

  // Store last used provider for smart defaults
  const STORAGE_KEY = "auth_last_provider";

  // Initialize when auth is ready
  AUTH.onReady(function (auth) {
    updateAuthUI(auth.status);
  });

  // Listen for auth changes
  document.addEventListener("authChanged", function (event) {
    updateAuthUI(event.detail);
  });

  function updateAuthUI(status) {
    const { authenticated, role, user } = status;

    const loginBtn = document.getElementById("auth-login-btn");
    const profile = document.getElementById("auth-profile");

    if (!loginBtn || !profile) return; // Navbar not loaded yet

    if (authenticated && user) {
      // Show profile, hide login
      loginBtn.classList.add("hidden");
      profile.classList.remove("hidden");

      // Update profile info
      const avatar = document.getElementById("auth-avatar");
      const name = document.getElementById("auth-name");
      const email = document.getElementById("auth-email");
      const roleBadge = document.getElementById("auth-role-badge");

      if (avatar) avatar.src = user.avatar_url || "";
      if (name) name.textContent = user.name || "User";
      if (email) email.textContent = user.email || "";

      if (roleBadge) {
        roleBadge.textContent = role.toUpperCase();
        roleBadge.className =
          role === "admin"
            ? "badge badge-sm badge-error"
            : "badge badge-sm badge-success";
      }

      // Show/hide upgrade button
      const upgradeItem = document.getElementById("auth-upgrade-item");
      if (upgradeItem) {
        upgradeItem.classList.toggle("hidden", role === "admin");
      }
    } else {
      // Show login, hide profile
      loginBtn.classList.remove("hidden");
      profile.classList.add("hidden");
    }
  }

  // Wire up event handlers (run once)
  document
    .getElementById("auth-login-btn")
    ?.addEventListener("click", function (e) {
      e.preventDefault();
      AUTH.login();
    });

  document
    .getElementById("auth-logout-btn")
    ?.addEventListener("click", function (e) {
      e.preventDefault();
      AUTH.logout().then(function () {
        // Optionally reload or redirect
        window.location.reload();
      });
    });

  document
    .getElementById("auth-upgrade-btn")
    ?.addEventListener("click", function (e) {
      e.preventDefault();
      AUTH.upgrade();
    });
})();
```

### 3. **Enable in Projects**

Each project just needs to include both scripts:

```html
<!-- Load shared components (navbar) -->
<script src="https://dhanur.me/js/components.js" defer></script>

<!-- Load auth SDK -->
<script src="https://auth.dhanur.me/auth-client.js"></script>

<!-- Configure navbar -->
<script>
  window.SiteNavConfig = {
    siteName: "Tasks",
    nav: [
      { name: "Dashboard", href: "/" },
      { name: "Projects", href: "/projects" },
    ],
  };
</script>
```

That's it! No per-project auth code needed.

## 🎨 Enhanced Login UI (Dropdown with Defaults)

### Update Login Page (index.html)

Replace the provider button row with a smart dropdown:

```html
<!-- Smart Login Dropdown -->
<div class="form-control w-full">
  <label class="label">
    <span class="label-text">Choose login provider</span>
  </label>

  <!-- Primary provider button (Google or last used) -->
  <button
    id="primaryLoginBtn"
    class="btn btn-primary btn-lg w-full gap-3 mb-3"
    onclick="loginWithPrimary()"
  >
    <img id="primaryProviderIcon" src="" class="w-6 h-6" />
    <span>Continue with <span id="primaryProviderName">Google</span></span>
  </button>

  <!-- Other providers dropdown -->
  <div class="divider text-xs opacity-50">OR</div>

  <div class="dropdown dropdown-hover w-full">
    <label tabindex="0" class="btn btn-outline w-full">
      <svg
        class="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
      Other Providers
    </label>
    <ul
      tabindex="0"
      class="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-box w-full mt-2 border border-base-300"
    >
      <div id="otherProvidersList"></div>
    </ul>
  </div>
</div>

<script>
  const LAST_PROVIDER_KEY = "auth_last_provider";

  function getLastProvider() {
    return localStorage.getItem(LAST_PROVIDER_KEY) || "google";
  }

  function setLastProvider(provider) {
    localStorage.setItem(LAST_PROVIDER_KEY, provider);
  }

  function loginWithPrimary() {
    const primary = getLastProvider();
    loginWith(primary);
  }

  function loginWith(provider) {
    setLastProvider(provider);
    window.location.href = `/auth/${provider}`;
  }

  // Initialize UI
  async function initLoginUI() {
    const res = await fetch("/api/providers");
    const data = await res.json();
    const providers = data.providers || [];

    const lastProvider = getLastProvider();
    const primary =
      providers.find((p) => p.id === lastProvider) || providers[0];
    const others = providers.filter((p) => p.id !== primary.id);

    // Set primary button
    document.getElementById("primaryProviderIcon").src = getProviderIcon(
      primary.id,
    );
    document.getElementById("primaryProviderName").textContent = primary.name;

    // Render other providers
    const othersList = document.getElementById("otherProvidersList");
    othersList.innerHTML = others
      .map(
        (p) => `
    <li>
      <a onclick="loginWith('${p.id}')" class="flex items-center gap-3">
        <img src="${getProviderIcon(p.id)}" class="w-5 h-5" />
        ${p.name}
      </a>
    </li>
  `,
      )
      .join("");
  }

  initLoginUI();
</script>
```

## ✅ Testing Checklist

1. **Open temp-test-popup.html** in browser
2. Click "Test Login Popup" - should open auth.dhanur.me in popup
3. Complete OAuth flow - popup should close and status update
4. User info should appear in test page
5. Click "Test Admin Upgrade" - verify popup opens
6. Click "Logout" - status should reset to guest
7. Check event log shows all postMessage events

## 🚀 Deployment Order

1. ✅ Test popup flow with temp-test-popup.html
2. ⏳ Add dropdown login UI to index.html
3. ⏳ Update components.js with auth section
4. ⏳ Test on one subdomain (e.g., tasks.dhanur.me)
5. ⏳ Deploy to all subdomains

## 💡 Key Benefits

- **Zero boilerplate**: Projects just load 2 scripts
- **Automatic UI**: Navbar shows user when logged in
- **Smart defaults**: Remembers last provider
- **Simple backend**: Only validate when truly needed
- **Consistent UX**: Same auth UI everywhere
