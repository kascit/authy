/**
 * Authy Client — Drop-in auth checker for dhanur.me subdomains.
 *
 * Usage:
 *   <script src="https://auth.dhanur.me/auth-client.js"></script>
 *   <script>
 *     document.addEventListener('authReady', (e) => {
 *       if (e.detail.role === 'admin') { ... }
 *     });
 *   </script>
 *
 * Or:
 *   window.AUTH.onReady((auth) => {
 *     console.log(auth.role); // 'guest' or 'admin'
 *   });
 */
(function () {
  'use strict';

  const AUTH_ORIGIN = 'https://auth.dhanur.me';
  const STATUS_ENDPOINT = AUTH_ORIGIN + '/api/status';

  // --- Public API ---
  const AUTH = {
    role: 'guest',
    ready: false,

    /**
     * Redirect to auth page to upgrade session.
     * Pass current URL as referrer so user gets redirected back.
     */
    upgrade: function () {
      window.location.href = AUTH_ORIGIN;
    },

    /**
     * Register a callback for when auth state is resolved.
     * If already ready, fires immediately.
     */
    onReady: function (callback) {
      if (AUTH.ready) {
        callback(AUTH);
      } else {
        _callbacks.push(callback);
      }
    },
  };

  const _callbacks = [];

  // --- Check Session ---
  async function checkAuth() {
    try {
      const res = await fetch(STATUS_ENDPOINT, {
        credentials: 'include',
        mode: 'cors',
      });

      if (!res.ok) throw new Error('Status check failed');

      const data = await res.json();
      AUTH.role = data.role || 'guest';
    } catch (err) {
      AUTH.role = 'guest';
    }

    AUTH.ready = true;

    // Fire callbacks
    _callbacks.forEach(function (cb) {
      try { cb(AUTH); } catch (e) { console.error('[authy]', e); }
    });
    _callbacks.length = 0;

    // Dispatch custom event
    document.dispatchEvent(
      new CustomEvent('authReady', { detail: { role: AUTH.role } })
    );
  }

  // Expose globally
  window.AUTH = AUTH;

  // Auto-check on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAuth);
  } else {
    checkAuth();
  }
})();
