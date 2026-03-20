/**
 * Authy Client SDK — Drop-in auth + credits for dhanur.me subdomains.
 *
 * Usage:
 *   <script src="https://auth.dhanur.me/auth-client.js"></script>
 *   <script>
 *     AUTH.onReady(function (auth) {
 *       console.log(auth.status);    // { authenticated, role, user, credits }
 *       console.log(auth.credits);   // { balance: 75, periodEnd: "..." } or { unlimited: true }
 *     });
 *     AUTH.login();                  // opens popup
 *     AUTH.logout();                 // clears session
 *     AUTH.upgrade();               // opens TOTP popup
 *     AUTH.useCredits("svc", 1);    // deduct credits (client shorthand)
 *   </script>
 *
 * For secure server-side deduction (recommended):
 *   Your backend reads `authy_session` cookie and POSTs to:
 *     POST https://auth.dhanur.me/api/credits/use
 *     { token: "<authy_session>", service: "myapp", amount: 1 }
 */
(function () {
  "use strict";

  var AUTH_ORIGIN =
    (window.AUTHY_CONFIG && window.AUTHY_CONFIG.origin) ||
    "https://auth.dhanur.me";
  var STATUS_URL = AUTH_ORIGIN + "/api/status";
  var LOGOUT_URL = AUTH_ORIGIN + "/api/logout";
  var CREDITS_USE_URL = AUTH_ORIGIN + "/api/credits/use";
  var POPUP_W = 500;
  var POPUP_H = 700;

  var _status = { authenticated: false, role: "guest", user: null, credits: null };
  var _ready = false;
  var _callbacks = [];

  function openPopup(url) {
    var left = (screen.width - POPUP_W) / 2;
    var top = (screen.height - POPUP_H) / 2;
    return window.open(
      url,
      "authy_popup",
      "width=" +
        POPUP_W +
        ",height=" +
        POPUP_H +
        ",left=" +
        left +
        ",top=" +
        top +
        ",toolbar=no,menubar=no",
    );
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== AUTH_ORIGIN) return;

    var type = event.data && event.data.type;
    if (type === "auth-login-success" || type === "auth-upgrade-success") {
      refreshStatus().then(function () {
        document.dispatchEvent(
          new CustomEvent("authChanged", { detail: _status }),
        );
      });
    }
  });

  async function refreshStatus() {
    try {
      var res = await fetch(STATUS_URL, {
        credentials: "include",
        mode: "cors",
      });
      if (!res.ok) throw new Error("Status check failed");
      var data = await res.json();
      _status = {
        authenticated: data.authenticated,
        role: data.role || "guest",
        user: data.user || null,
        credits: data.credits || null,
      };
    } catch (e) {
      _status = { authenticated: false, role: "guest", user: null, credits: null };
    }
  }

  async function init() {
    await refreshStatus();
    _ready = true;

    _callbacks.forEach(function (cb) {
      try {
        cb(AUTH);
      } catch (e) {
        console.error("[authy]", e);
      }
    });
    _callbacks.length = 0;

    document.dispatchEvent(new CustomEvent("authReady", { detail: _status }));
  }

  var AUTH = {
    get status() {
      return _status;
    },
    get ready() {
      return _ready;
    },
    get credits() {
      return _status.credits;
    },

    login: function () {
      openPopup(AUTH_ORIGIN + "/login?popup=true");
    },

    logout: async function () {
      try {
        await fetch(LOGOUT_URL, {
          method: "POST",
          credentials: "include",
          mode: "cors",
        });
      } catch (e) {
        /* ignore */
      }
      _status = { authenticated: false, role: "guest", user: null, credits: null };
      document.dispatchEvent(
        new CustomEvent("authChanged", { detail: _status }),
      );
    },

    upgrade: function () {
      openPopup(AUTH_ORIGIN + "/verify?popup=true");
    },

    /**
     * Client-side credit deduction shorthand.
     * For secure server-side deduction, have your backend call POST /api/credits/use.
     */
    useCredits: async function (service, amount) {
      try {
        var res = await fetch(CREDITS_USE_URL, {
          method: "POST",
          credentials: "include",
          mode: "cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service: service, amount: amount || 1 }),
        });
        var data = await res.json();
        if (data.balance !== undefined) {
          _status.credits = _status.credits || {};
          _status.credits.balance = data.balance;
          if (data.unlimited) _status.credits.unlimited = true;
          document.dispatchEvent(
            new CustomEvent("creditsChanged", { detail: _status.credits }),
          );
        }
        return data;
      } catch (e) {
        return { success: false, error: "Network error" };
      }
    },

    onReady: function (callback) {
      if (_ready) {
        callback(AUTH);
      } else {
        _callbacks.push(callback);
      }
    },

    refresh: refreshStatus,

    isAuthenticated: function () {
      return !!_status.authenticated;
    },

    isAdmin: function () {
      return _status.role === "admin";
    },

    hasCredits: function (amount) {
      if (!_status.credits) return false;
      if (_status.credits.unlimited) return true;
      return _status.credits.balance >= (amount || 1);
    },

    requireAuth: function () {
      if (_status.authenticated) return true;
      AUTH.login();
      return false;
    },

    requireAdmin: function () {
      if (_status.role === "admin") return true;
      if (!_status.authenticated) {
        AUTH.login();
        return false;
      }
      AUTH.upgrade();
      return false;
    },
  };

  window.AUTH = AUTH;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
