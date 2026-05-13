(function () {
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
        "*"
      );
    }
    return;
  }

  // Handle successful authorization loop
  if (window.opener) {
    // 1. Listen for dynamic refresh completion acknowledgment from opener
    window.addEventListener("message", function (event) {
      if (event.data && event.data.type === "auth-ack-close") {
        window.close();
      }
    });

    // 2. Dispatch success state to trigger opener data fetch
    window.opener.postMessage({ type: "auth-login-success" }, "*");

    // 3. Fallback automated termination to catch unacknowledged messages
    setTimeout(function () {
      window.close();
    }, 1500);
  } else {
    // COOP policy stripped window.opener reference during multi-hop redirect.
    // Fall back to top-level navigation.
    window.location.href = "/";
  }
})();