(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChurchServiceConfigTools = api;
  root.ChurchServiceConfig = api.resolve(root.MultiChurchRuntimeConfig || {});
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function text(value) { return String(value == null ? '' : value).trim(); }
  function list(value, fallback) { return Array.isArray(value) && value.length ? value.slice() : fallback.slice(); }

  function resolve(runtime) {
    var raw = runtime || {};
    var front = raw.frontend || {};
    var churchName = text(raw.churchName) || '教會';
    var defaultBranch = text(front.defaultBranch) || '本堂';
    return {
      churchId: text(raw.churchId),
      churchName: churchName,
      platformName: text(front.platformName) || churchName + '服事平台',
      timezone: text(raw.timezone) || 'Asia/Taipei',
      serviceEndpoint: text(raw.endpoint),
      venueEndpoint: text(front.venueEndpoint),
      newcomerEndpoint: text(front.newcomerEndpoint),
      googleClientId: text(raw.googleClientId),
      scheduleUrl: text(front.scheduleUrl),
      platformUrl: text(front.platformUrl),
      defaultBranch: defaultBranch,
      branches: list(front.branches, [defaultBranch]),
      fallbackLinks: Array.isArray(front.fallbackLinks) ? front.fallbackLinks.slice() : [],
      webPushEnabled: Boolean(raw.features && raw.features.webPush && text(front.vapidPublicKey)),
      vapidPublicKey: text(front.vapidPublicKey)
    };
  }

  function validate(config) {
    var errors = [];
    if (!config.platformName) errors.push('缺少平台名稱');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(config.serviceEndpoint)) errors.push('服事平台 GAS 網址不正確');
    if (!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId)) errors.push('Google OAuth Client ID 不正確');
    if (!config.defaultBranch) errors.push('缺少預設堂區');
    return { ok: errors.length === 0, errors: errors };
  }

  return { resolve: resolve, validate: validate };
});
