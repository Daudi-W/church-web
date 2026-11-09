(function (global) {
  'use strict';

  var MODULES = {
    venue: 'venue.html',
    newcomer: 'newcomer.html',
    files: 'files.html'
  };
  var TOKEN_KEY = 'svcToken';
  var WHOAMI_KEY = 'svcWhoami';
  var RETRY_PREFIX = 'svcModuleReauth:';

  function storageGet(storage, key) {
    try { return storage.getItem(key); }
    catch (e) { return null; }
  }

  function storageSet(storage, key, value) {
    try { storage.setItem(key, value); }
    catch (e) { }
  }

  function storageRemove(storage, key) {
    try { storage.removeItem(key); }
    catch (e) { }
  }

  function getToken() {
    return storageGet(global.localStorage, TOKEN_KEY);
  }

  function clearPlatformSession() {
    storageRemove(global.localStorage, TOKEN_KEY);
    storageRemove(global.localStorage, WHOAMI_KEY);
  }

  function moduleHref(moduleName) {
    return MODULES[moduleName] || '';
  }

  function isModuleHref(href) {
    try {
      var parsed = new URL(String(href || ''), global.location.href);
      if (parsed.origin !== global.location.origin) return false;
      var filename = parsed.pathname.split('/').pop();
      return Object.keys(MODULES).some(function (key) { return MODULES[key] === filename; });
    } catch (e) {
      return false;
    }
  }

  function getRequestedModule() {
    try {
      var requested = new URLSearchParams(global.location.search).get('next');
      return MODULES[requested] ? requested : '';
    } catch (e) {
      return '';
    }
  }

  function folderId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_!-]{10,200}$/.test(value) ? value : '';
  }

  function resumeRequestedModule() {
    var requested = getRequestedModule();
    if (!requested) return false;
    var destination = MODULES[requested];
    if (requested === 'files') {
      var folder = folderId(new URLSearchParams(global.location.search).get('folder'));
      if (folder) destination += '#folder=' + encodeURIComponent(folder);
    }
    global.location.replace(destination);
    return true;
  }

  function loginHref(moduleName, reason) {
    if (!MODULES[moduleName]) return '';
    var href = 'service.html?next=' + encodeURIComponent(moduleName);
    if (moduleName === 'files') {
      try {
        var current = new URL(global.location.href);
        var folder = folderId(new URLSearchParams(current.hash.slice(1)).get('folder'));
        if (folder) href += '&folder=' + encodeURIComponent(folder);
      } catch (e) { }
    }
    if (reason) href += '&reason=' + encodeURIComponent(reason);
    return href;
  }

  function requirePlatformLogin(moduleName, options) {
    options = options || {};
    if (!MODULES[moduleName]) return false;

    var retryKey = RETRY_PREFIX + moduleName;
    var alreadyRetried = storageGet(global.sessionStorage, retryKey) === '1';
    if (options.afterRejectedToken && alreadyRetried) return false;

    if (options.afterRejectedToken) {
      storageSet(global.sessionStorage, retryKey, '1');
      clearPlatformSession();
    }
    global.location.replace(loginHref(moduleName, options.reason || ''));
    return true;
  }

  function markModuleAuthenticated(moduleName) {
    storageRemove(global.sessionStorage, RETRY_PREFIX + moduleName);
  }

  function showGateError(title, message) {
    var gate = document.getElementById('moduleGate');
    var card = document.getElementById('moduleState');
    var titleEl = document.getElementById('moduleStateTitle');
    var messageEl = document.getElementById('moduleStateMessage');
    var actions = document.getElementById('moduleStateActions');
    if (gate) gate.hidden = false;
    if (card) card.classList.add('is-error');
    if (titleEl) titleEl.textContent = title || '目前無法開啟';
    if (messageEl) {
      messageEl.textContent = message || '請稍後再試，或先回平台。';
      messageEl.hidden = false;
    }
    if (actions) actions.hidden = false;
  }

  function retryCurrentPage() {
    global.location.reload();
  }

  global.PlatformModule = {
    clearPlatformSession: clearPlatformSession,
    getRequestedModule: getRequestedModule,
    getToken: getToken,
    isModuleHref: isModuleHref,
    markModuleAuthenticated: markModuleAuthenticated,
    loginHref: loginHref,
    moduleHref: moduleHref,
    requirePlatformLogin: requirePlatformLogin,
    resumeRequestedModule: resumeRequestedModule,
    retryCurrentPage: retryCurrentPage,
    showGateError: showGateError
  };
})(window);
