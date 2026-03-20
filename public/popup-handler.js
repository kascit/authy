// Popup callback handler — externalized from inline script
(function () {
  var params = new URLSearchParams(window.location.search);
  if (params.get("error")) {
    document.getElementById("stateLoading").classList.add("hidden");
    document.getElementById("stateError").classList.remove("hidden");
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

  var btnClose = document.getElementById("btnClose");
  if (btnClose) {
    btnClose.addEventListener("click", function() {
      window.close();
    });
  }
})();
