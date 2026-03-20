(function () {
  "use strict";

  var stateLoading = document.getElementById("stateLoading");
  var stateNotLoggedIn = document.getElementById("stateNotLoggedIn");
  var stateAlreadyAdmin = document.getElementById("stateAlreadyAdmin");
  var stateInput = document.getElementById("stateInput");
  var stateSuccess = document.getElementById("stateSuccess");
  var otpInputs = Array.from(document.querySelectorAll(".otp"));
  var msg = document.getElementById("msg");
  var API = window.location.origin;
  var isPopup = window.opener != null;

  function show(el) {
    [
      stateLoading,
      stateNotLoggedIn,
      stateAlreadyAdmin,
      stateInput,
      stateSuccess,
    ].forEach(function (s) {
      s.classList.add("hidden");
    });
    el.classList.remove("hidden");
  }

  function showMsg(text) {
    msg.textContent = text;
    msg.classList.remove("hidden");
  }

  function hideMsg() {
    msg.classList.add("hidden");
  }

  function getCode() {
    return otpInputs
      .map(function (i) {
        return i.value;
      })
      .join("");
  }

  function setError() {
    otpInputs.forEach(function (i) {
      i.classList.remove("input-success");
      i.classList.add("input-error");
      i.value = "";
    });
    setTimeout(function () {
      otpInputs.forEach(function (i) {
        return i.classList.remove("input-error");
      });
      otpInputs[0].focus();
    }, 400);
  }

  function setSuccess() {
    otpInputs.forEach(function (i) {
      i.classList.remove("input-error");
      i.classList.add("input-success");
      i.disabled = true;
    });
  }

  function setLoading(on) {
    otpInputs.forEach(function (i) {
      i.classList.toggle("opacity-60", on);
      i.disabled = on;
    });
  }

  // --- Input Handling ---

  otpInputs.forEach(function (input, idx) {
    input.addEventListener("input", function (e) {
      var val = e.target.value.replace(/\D/g, "");
      input.value = val ? val[0] : "";
      hideMsg();

      if (val && idx < 5) {
        otpInputs[idx + 1].focus();
      }

      var code = getCode();
      if (code.length === 6) {
        submit(code);
      }
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Backspace" && !input.value && idx > 0) {
        otpInputs[idx - 1].focus();
        otpInputs[idx - 1].value = "";
      }
    });

    input.addEventListener("paste", function (e) {
      e.preventDefault();
      var pasted = (e.clipboardData || window.clipboardData)
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, 6);
      if (!pasted) return;
      pasted.split("").forEach(function (ch, i) {
        if (otpInputs[i]) {
          otpInputs[i].value = ch;
        }
      });
      var focusIdx = Math.min(pasted.length, 5);
      otpInputs[focusIdx].focus();
      if (pasted.length === 6) submit(pasted);
    });

    input.addEventListener("focus", function () {
      input.select();
    });
  });

  // --- Submit ---

  async function submit(code) {
    if (!/^\d{6}$/.test(code)) return;
    hideMsg();
    setLoading(true);

    try {
      var res = await fetch(API + "/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: code }),
      });
      var data = await res.json();

      if (data.success) {
        setSuccess();
        setTimeout(function () {
          if (isPopup) {
            window.opener.postMessage(
              { type: "auth-upgrade-success", role: "admin" },
              "*",
            );
            window.close();
          } else {
            show(stateSuccess);
            setTimeout(function () {
              window.location.href = "/";
            }, 900);
          }
        }, 300);
      } else {
        setLoading(false);
        showMsg(data.error || "Invalid code");
        setError();
      }
    } catch (e) {
      setLoading(false);
      showMsg("Connection error");
      setError();
    }
  }

  // --- Init ---

  async function init() {
    try {
      var res = await fetch(API + "/api/status", { credentials: "include" });
      var data = await res.json();

      if (!data.authenticated) {
        show(stateNotLoggedIn);
        if (!isPopup) {
          setTimeout(function () {
            window.location.href = "/login";
          }, 1200);
        }
        return;
      }

      if (data.role === "admin") {
        show(stateAlreadyAdmin);
        if (isPopup) {
          window.opener.postMessage(
            { type: "auth-upgrade-success", role: "admin" },
            "*",
          );
          setTimeout(function () {
            window.close();
          }, 700);
        } else {
          setTimeout(function () {
            window.location.href = "/";
          }, 1200);
        }
        return;
      }
    } catch (e) {
      show(stateNotLoggedIn);
      return;
    }

    show(stateInput);
    otpInputs[0].focus();
  }

  init();
})();
