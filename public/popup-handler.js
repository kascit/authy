// Popup callback handler — externalized from inline script
(function () {
  // Setup close button listener FIRST (before any early returns)
  var btnClose = document.getElementById("btnClose");
  if (btnClose) {
    btnClose.addEventListener("click", function () {
      window.close();
    });
  }

  var params = new URLSearchParams(window.location.search);
  if (params.get("error")) {
    document.getElementById("stateLoading").classList.add("hidden");
    document.getElementById("stateError").classList.remove("hidden");

    // Auto-close countdown
    var countdownEl = document.getElementById("closeCountdown");
    var seconds = 3;
    var interval = setInterval(function () {
      seconds--;
      if (countdownEl) countdownEl.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(interval);
        window.close();
      }
    }, 1000);

    if (window.opener) {
      window.opener.postMessage(
        { type: "auth-error", error: params.get("error") },
        "*",
      );
    }
    return;
  }

  if (window.opener) {
    window.opener.postMessage({ type: "auth-login-success" }, "*");
    setTimeout(function () {
      window.close();
    }, 300);
  } else {
    window.location.href = "/";
  }
})();
