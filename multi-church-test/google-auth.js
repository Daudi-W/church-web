(function (root) {
  'use strict';

  var scriptPromise;

  function loadGoogleIdentity() {
    if (root.google && root.google.accounts && root.google.accounts.id) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Google 登入元件載入失敗，請檢查網路後重試')); };
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  function tokenIsFresh(token) {
    try {
      var payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return Number(payload.exp || 0) > Math.floor(Date.now() / 1000) + 60;
    } catch (error) {
      return false;
    }
  }

  function createProvider(options) {
    if (!options || !options.clientId) throw new Error('缺少 Google OAuth Client ID');
    var token = '';
    var waitingResolve;
    var waitingReject;
    var initialized = false;
    var gate = document.getElementById('login-gate');
    var button = document.getElementById('google-login-button');
    var message = document.getElementById('login-message');
    var shell = document.querySelector('.app-shell');

    function showGate(text, isError) {
      if (gate) gate.hidden = false;
      if (shell) shell.hidden = true;
      if (message) {
        message.textContent = text || '請使用已列入白名單的 Google 帳號登入。';
        message.classList.toggle('error-text', !!isError);
      }
    }

    function hideGate() {
      if (gate) gate.hidden = true;
      if (shell) shell.hidden = false;
    }

    function initialize() {
      return loadGoogleIdentity().then(function () {
        if (initialized) return;
        root.google.accounts.id.initialize({
          client_id: options.clientId,
          callback: function (response) {
            if (!response || !response.credential) {
              if (waitingReject) waitingReject(new Error('Google 登入沒有回傳憑證'));
              return;
            }
            token = response.credential;
            hideGate();
            if (waitingResolve) waitingResolve(token);
            waitingResolve = null;
            waitingReject = null;
          },
          auto_select: false,
          cancel_on_tap_outside: false
        });
        root.google.accounts.id.renderButton(button, {
          type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 280
        });
        initialized = true;
      });
    }

    function getIdToken() {
      if (tokenIsFresh(token)) return Promise.resolve(token);
      token = '';
      showGate();
      if (root.location && /^(localhost|127\.0\.0\.1)$/.test(root.location.hostname)) {
        if (message) message.textContent = 'Google OAuth 不接受這個本機網址，請改用已核准的線上測試入口。';
        if (button && !button.querySelector('a')) {
          var link = document.createElement('a');
          link.className = 'oauth-link';
          link.href = 'https://daudi-w.github.io/church-web/multi-church-test/';
          link.textContent = '開啟線上測試入口';
          button.replaceChildren(link);
        }
        return new Promise(function () {});
      }
      return initialize().then(function () {
        return new Promise(function (resolve, reject) {
          waitingResolve = resolve;
          waitingReject = reject;
        });
      }).catch(function (error) {
        showGate(error.message, true);
        throw error;
      });
    }

    return { getIdToken: getIdToken };
  }

  root.MultiChurchGoogleAuth = { createProvider: createProvider };
})(typeof self !== 'undefined' ? self : this);
