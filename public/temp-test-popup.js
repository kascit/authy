// Switch to localhost if testing locally
window.AUTHY_CONFIG = {
  origin:
    window.location.hostname === "localhost"
      ? "http://localhost:3000"
      : "https://auth.dhanur.me",
};

document.addEventListener("DOMContentLoaded", () => {
  const log = [];

  function addLog(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const icon =
      {
        info: "ℹ️",
        success: "✅",
        error: "❌",
        event: "📡",
      }[type] || "ℹ️";

    log.push(`[${timestamp}] ${icon} ${message}`);
    document.getElementById("eventLog").textContent = log
      .slice(-20)
      .join("\n");
  }

  // Initialize
  addLog("Initializing auth SDK...");

  AUTH.onReady(function (auth) {
    addLog("✅ Auth SDK ready", "success");
    updateUI(auth.status);
  });

  // Listen for auth changes
  document.addEventListener("authReady", function (event) {
    addLog("📡 authReady event fired", "event");
    addLog(`Auth state: ${JSON.stringify(event.detail)}`, "info");
  });

  document.addEventListener("authChanged", function (event) {
    addLog("📡 authChanged event fired", "event");
    addLog(`New auth state: ${JSON.stringify(event.detail)}`, "info");
    updateUI(event.detail);
  });

  // Listen for postMessage events (to debug popup communication)
  window.addEventListener("message", function (event) {
    addLog(
      `📬 Message received from ${event.origin}: ${JSON.stringify(event.data)}`,
      "event",
    );
  });

  function updateUI(status) {
    const { authenticated, role, user } = status;

    // Update status display
    const statusAlert = document.getElementById("statusAlert");
    const authInfo = document.getElementById("authInfo");

    statusAlert.className = authenticated
      ? "alert alert-success"
      : "alert alert-warning";
    statusAlert.innerHTML = authenticated
      ? "<span>🎉 Authenticated!</span>"
      : "<span>👋 Not logged in (guest)</span>";

    authInfo.classList.remove("hidden");
    document.getElementById("authStatus").textContent = authenticated
      ? "Authenticated"
      : "Guest";
    document.getElementById("authRole").textContent = role;

    // Show user card if authenticated
    const userCard = document.getElementById("userCard");
    if (authenticated && user) {
      userCard.classList.remove("hidden");
      document.getElementById("userAvatar").src = user.avatar_url;
      document.getElementById("userName").textContent = user.name;
      document.getElementById("userEmail").textContent = user.email;
    } else {
      userCard.classList.add("hidden");
    }

    // Update buttons
    const btnLogin = document.getElementById("btnLogin");
    if (btnLogin) btnLogin.classList.toggle("hidden", authenticated);
    
    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) btnLogout.classList.toggle("hidden", !authenticated);
    
    const btnUpgrade = document.getElementById("btnUpgrade");
    if (btnUpgrade) btnUpgrade.classList.toggle("hidden", !authenticated || role === "admin");
  }

  const btnLogin = document.getElementById("btnLogin");
  if (btnLogin) {
    btnLogin.addEventListener("click", function() {
      addLog("🔓 Opening login popup...", "info");
      AUTH.login();
    });
  }

  const btnUpgrade = document.getElementById("btnUpgrade");
  if (btnUpgrade) {
    btnUpgrade.addEventListener("click", function() {
      addLog("🔐 Opening admin upgrade popup...", "info");
      AUTH.upgrade();
    });
  }

  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async function() {
      addLog("🚪 Logging out...", "info");
      await AUTH.logout();
      addLog("✅ Logged out successfully", "success");
    });
  }

  const btnRefresh = document.getElementById("btnRefresh");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", async function() {
      addLog("🔄 Refreshing auth status...", "info");
      await AUTH.refresh();
      addLog("✅ Status refreshed", "success");
    });
  }
});
