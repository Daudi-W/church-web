(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MultiChurchAppsScriptTransport = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createTransport(options) {
    if (!options || !/^https:\/\//.test(options.endpoint || '')) throw new Error('需要 HTTPS Apps Script 部署網址');
    if (typeof options.getIdToken !== 'function') throw new Error('需要 Google ID Token provider');
    return {
      request: async function (action, payload) {
        var idToken = await options.getIdToken();
        if (!idToken) throw new Error('尚未完成 Google 登入');
        var response = await fetch(options.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: action, payload: payload || {}, idToken: idToken }),
          redirect: 'follow'
        });
        if (!response.ok) throw new Error('後端連線失敗（HTTP ' + response.status + '）');
        var result = await response.json();
        if (!result || result.ok !== true) throw new Error(result && result.error ? result.error : '後端回應格式不正確');
        return result;
      }
    };
  }

  return { createTransport: createTransport };
});
