// CSP-safe bindings for authy
(function(){
  document.addEventListener('click', function(e){
    var copyBtn = e.target.closest('[data-action="copy-short-url"]');
    if(copyBtn){
      e.preventDefault();
      var payload = copyBtn.getAttribute('data-copy');
      if(payload){
        navigator.clipboard?.writeText(payload).then(function(){
          var orig = copyBtn.textContent; copyBtn.textContent = 'COPIED!'; setTimeout(function(){ copyBtn.textContent = orig; },1500);
        }).catch(()=>{});
      }
      return;
    }

    var btn = e.target.closest('[data-action]');
    if(btn){
      var action = btn.getAttribute('data-action');
      if(action === 'request-admin' && window.__authy?.requestAdmin){
        e.preventDefault();
        window.__authy.requestAdmin();
        return;
      }
      if(action === 'logout' && window.__authy?.logout){
        e.preventDefault();
        window.__authy.logout();
        return;
      }
      if(action === 'refresh-summary' && window.__authy?.refreshAdminSummary){
        e.preventDefault();
        window.__authy.refreshAdminSummary();
        return;
      }
    }

    var toggle = e.target.closest('#shell-mobile-toggle');
    if(toggle){
      var panel = document.querySelector('[data-shell-mobile-panel]');
      var drawer = document.querySelector('[data-shell-mobile-drawer]');
      var backdrop = document.querySelector('[data-shell-mobile-backdrop]');
      if(panel && drawer){
        var isOpen = !panel.classList.contains('hidden');
        if(isOpen){
          panel.classList.add('hidden');
          drawer.classList.add('-translate-x-full');
        } else {
          panel.classList.remove('hidden');
          drawer.classList.remove('-translate-x-full');
        }
        if(backdrop) backdrop.classList.toggle('opacity-0');
      }
    }
  }, false);
})();
