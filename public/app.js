(function () {
  "use strict";

  var stateLoading = document.getElementById("stateLoading");
  var stateLogin = document.getElementById("stateLogin");
  var stateAuthenticated = document.getElementById("stateAuthenticated");
  var loginMsg = document.getElementById("loginMsg");
  var API = window.location.origin;
  var isPopup =
    new URLSearchParams(window.location.search).get("popup") === "true";

  var ICONS = {
    google:
      '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>',
    github:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>',
    discord:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>',
    facebook:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    microsoft:
      '<svg width="20" height="20" viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>',
    linkedin:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
    spotify:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>',
    twitch:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="#9146FF"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>',
    apple:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
  };

  function show(el) {
    [stateLoading, stateLogin, stateAuthenticated].forEach(function (s) {
      s.classList.add("hidden");
    });
    el.classList.remove("hidden");
  }

  function getProviderIcon(name) {
    return ICONS[name] || "";
  }

  // ==================== Login State ====================

  var LAST_PROVIDER_KEY = "auth_last_provider";

  function getLastProvider() {
    return localStorage.getItem(LAST_PROVIDER_KEY) || "google";
  }

  function setLastProvider(provider) {
    localStorage.setItem(LAST_PROVIDER_KEY, provider);
  }

  function loginWithProvider(providerName) {
    setLastProvider(providerName);
    var url = API + "/auth/" + providerName + (isPopup ? "?popup=true" : "");
    window.location.href = url;
  }

  async function loadProviders() {
    try {
      var res = await fetch(API + "/api/providers");
      var data = await res.json();
      var providers = data.providers || [];

      if (providers.length === 0) {
        loginMsg.textContent = "No login providers configured.";
        loginMsg.classList.remove("hidden");
        return;
      }

      var lastProviderName = getLastProvider();
      var primaryProvider =
        providers.find(function (p) {
          return p.name === lastProviderName;
        }) || providers[0];

      var otherProviders = providers.filter(function (p) {
        return p.name !== primaryProvider.name;
      });

      // Setup primary button
      var primaryBtn = document.getElementById("primaryLoginBtn");
      var primaryIcon = document.getElementById("primaryProviderIcon");
      var primaryName = document.getElementById("primaryProviderName");

      primaryIcon.innerHTML = getProviderIcon(primaryProvider.name);
      primaryName.textContent = primaryProvider.displayName;
      primaryBtn.classList.remove("hidden");

      primaryBtn.addEventListener("click", function () {
        loginWithProvider(primaryProvider.name);
      });

      // Setup other providers dropdown
      if (otherProviders.length > 0) {
        var othersList = document.getElementById("otherProvidersList");
        othersList.innerHTML = "";
        otherProviders.forEach(function (p) {
          var li = document.createElement("li");
          li.className = "list-none";
          var a = document.createElement("a");
          a.className =
            "flex items-center gap-3 rounded-lg hover:bg-base-200 transition-colors";
          a.innerHTML =
            getProviderIcon(p.name) + "<span>" + p.displayName + "</span>";
          a.addEventListener("click", function (e) {
            e.preventDefault();
            // Close the dropdown
            document
              .getElementById("otherProvidersDropdown")
              .removeAttribute("open");
            loginWithProvider(p.name);
          });
          li.appendChild(a);
          othersList.appendChild(li);
        });
        document
          .getElementById("otherProvidersDropdown")
          .classList.remove("hidden");
        document.getElementById("loginDivider").classList.remove("hidden");
      } else {
        // Only one provider - hide divider and dropdown
        document
          .getElementById("otherProvidersDropdown")
          .classList.add("hidden");
        document.getElementById("loginDivider").classList.add("hidden");
      }

      var dropdownSummary = document.querySelector(
        "#otherProvidersDropdown > summary",
      );
      if (dropdownSummary) {
        dropdownSummary.style.listStyle = "none";
      }
    } catch (e) {
      loginMsg.textContent = "Failed to load providers.";
      loginMsg.classList.remove("hidden");
    }
  }

  // ==================== Authenticated State ====================

  var currentRole = "user";

  function showAuthenticated(data) {
    var avatar = document.getElementById("userAvatar");
    var userName = document.getElementById("userName");
    var userEmail = document.getElementById("userEmail");
    var roleBadge = document.getElementById("roleBadge");
    var btnUpgrade = document.getElementById("btnUpgrade");
    var btnLogout = document.getElementById("btnLogout");

    currentRole = data.role;

    if (data.user.avatar_url) {
      avatar.src = data.user.avatar_url;
      avatar.alt = data.user.name || "";
      avatar.parentElement.style.display = "";
    } else {
      avatar.parentElement.parentElement.style.display = "none";
    }

    userName.textContent = data.user.name || "User";
    userEmail.textContent = data.user.email || "";

    roleBadge.textContent = data.role;
    if (data.role === "admin") {
      roleBadge.className = "badge badge-success badge-sm";
    } else {
      roleBadge.className = "badge badge-info badge-sm";
    }

    btnUpgrade.style.display = data.role === "admin" ? "none" : "";
    btnUpgrade.onclick = function () {
      window.location.href = "/verify";
    };

    btnLogout.onclick = async function () {
      await fetch(API + "/api/logout", {
        method: "POST",
        credentials: "include",
      });
      window.location.href = "/login";
    };

    show(stateAuthenticated);
    loadAccounts();
    loadCreditsDisplay(data);
    if (data.role === "admin") {
      setupAdminDashboard();
    }
  }

  // ==================== Linked Accounts ====================

  async function loadAccounts() {
    var linkedEl = document.getElementById("linkedAccounts");
    var availableEl = document.getElementById("availableProviders");
    var linkedCountBadge = document.getElementById("linkedCountBadge");
    linkedEl.innerHTML = "";
    availableEl.innerHTML = "";

    try {
      var res = await fetch(API + "/api/accounts", { credentials: "include" });
      var data = await res.json();
      var accounts = data.accounts || [];
      var available = data.available || [];

      if (linkedCountBadge) {
        linkedCountBadge.textContent = accounts.length + " linked";
      }

      accounts.forEach(function (acct) {
        var row = document.createElement("div");
        row.className =
          "flex items-center justify-between px-3 py-2.5 bg-base-200 border border-base-300 rounded-lg";

        var info = document.createElement("div");
        info.className = "flex items-center gap-2.5";
        info.innerHTML =
          '<span class="flex items-center">' +
          getProviderIcon(acct.provider) +
          "</span>" +
          '<span class="text-sm font-medium">' +
          acct.displayName +
          "</span>";

        row.appendChild(info);

        if (accounts.length > 1) {
          var unlinkBtn = document.createElement("button");
          unlinkBtn.className =
            "btn btn-ghost btn-xs text-base-content/50 hover:text-error";
          unlinkBtn.textContent = "Unlink";
          unlinkBtn.setAttribute("aria-label", "Unlink " + acct.displayName);
          unlinkBtn.addEventListener("click", function () {
            unlinkProvider(acct.provider);
          });
          row.appendChild(unlinkBtn);
        }

        linkedEl.appendChild(row);
      });

      available.forEach(function (p) {
        var btn = document.createElement("button");
        btn.className =
          "btn btn-outline btn-sm btn-dashed justify-start gap-2.5 w-full border-base-300 hover:border-primary/40 hover:bg-base-200";
        btn.innerHTML =
          getProviderIcon(p.name) + "<span>Link " + p.displayName + "</span>";
        btn.addEventListener("click", function () {
          openLinkPopup(p.name);
        });
        availableEl.appendChild(btn);
      });
    } catch (e) {
      linkedEl.innerHTML =
        '<p class="text-sm text-error">Failed to load linked accounts.</p>';
    }
  }

  async function unlinkProvider(provider) {
    try {
      var res = await fetch(API + "/api/accounts/" + provider, {
        method: "DELETE",
        credentials: "include",
      });
      var data = await res.json();
      if (data.success) {
        loadAccounts();
      } else {
        alert(data.error || "Failed to unlink provider");
      }
    } catch (e) {
      alert("Failed to unlink provider");
    }
  }

  function openLinkPopup(provider) {
    var w = 500;
    var h = 700;
    var left = (screen.width - w) / 2;
    var top = (screen.height - h) / 2;
    var url = API + "/auth/" + provider + "?mode=link&popup=true";
    window.open(
      url,
      "authy_link",
      "width=" + w + ",height=" + h + ",left=" + left + ",top=" + top,
    );
  }

  // Listen for postMessage from link popup
  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    if (
      event.data &&
      (event.data.type === "auth-login-success" ||
        event.data.type === "auth-link-success")
    ) {
      loadAccounts();
    }
  });

  // ==================== Credits Display ====================

  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      var d = new Date(dateStr);
      var months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return months[d.getUTCMonth()] + " " + d.getUTCDate();
    } catch (e) {
      return "";
    }
  }

  async function loadCreditsDisplay(authData) {
    var creditsDisplay = document.getElementById("creditsDisplay");
    var creditsBalance = document.getElementById("creditsBalance");
    var creditsLabel = document.getElementById("creditsLabel");
    var creditsReset = document.getElementById("creditsReset");
    if (!creditsDisplay) return;

    // Use credits from auth status if available
    var credits = authData.credits;
    if (!credits) {
      try {
        var res = await fetch(API + "/api/credits", { credentials: "include" });
        credits = await res.json();
      } catch (e) {
        creditsDisplay.classList.add("hidden");
        return;
      }
    }

    if (credits.unlimited || credits.balance === -1) {
      creditsBalance.textContent = "\u221e";
      creditsLabel.textContent = "unlimited (admin)";
      creditsReset.textContent = "";
    } else {
      creditsBalance.textContent = credits.balance;
      creditsLabel.textContent = "credits remaining";
      creditsReset.textContent = credits.periodEnd
        ? "resets " + formatDate(credits.periodEnd)
        : "";
    }
    creditsDisplay.classList.remove("hidden");
  }

  // ==================== Admin Dashboard ====================

  function setupAdminDashboard() {
    var dashboard = document.getElementById("adminDashboard");
    dashboard.classList.remove("hidden");

    loadAdminSummary();

    var refreshBtn = document.getElementById("refreshSummary");
    if (refreshBtn) {
      refreshBtn.onclick = function () {
        refreshBtn.disabled = true;
        loadAdminSummary().then(function () {
          refreshBtn.disabled = false;
        });
      };
    }
  }

  async function loadAdminSummary() {
    try {
      var res = await fetch(API + "/api/admin/summary", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch admin summary");
      }
      var data = await res.json();

      document.getElementById("statLoggedInUsers").textContent =
        data.loggedInUsers;
      document.getElementById("statActiveAdmins").textContent =
        data.activeAdmins;
    } catch (e) {
      document.getElementById("statLoggedInUsers").textContent = "-";
      document.getElementById("statActiveAdmins").textContent = "-";
    }
  }

  // ==================== Toast ====================

  function showToast(id) {
    var toast = document.getElementById(id);
    if (!toast) return;
    toast.classList.remove("hidden");
    setTimeout(function () {
      toast.classList.add("hidden");
    }, 4000);
  }

  // ==================== Init ====================

  async function init() {
    var params = new URLSearchParams(window.location.search);
    var currentPath = window.location.pathname;

    // Show toast if just elevated to admin
    if (params.get("elevated") === "1") {
      showToast("adminToast");
      // Clean up URL
      var newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, "", newUrl);
    }

    if (params.get("error")) {
      loginMsg.textContent = "Authentication failed. Please try again.";
      loginMsg.classList.remove("hidden");
    }

    try {
      var res = await fetch(API + "/api/status", { credentials: "include" });
      var data = await res.json();

      if (data.authenticated) {
        // If on /login and already authenticated, redirect to dashboard
        if (currentPath === "/login" && !isPopup) {
          window.location.href = "/";
          return;
        }
        showAuthenticated(data);
        return;
      } else {
        // Dashboard route requires auth; guests go to /login
        if (currentPath === "/" && !isPopup) {
          window.location.href = "/login";
          return;
        }
      }
    } catch (e) {
      // Continue to login
    }

    await loadProviders();
    show(stateLogin);
  }

  init();
})();
