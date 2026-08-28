const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const FORMAL_ENDPOINTS = {
  'service.html': 'https://script.google.com/macros/s/AKfycbxavwu853Lejoco68BOJ1hEiH6MSrXMe2do171i8uUbGtQxDYBrLqk5U07H6Qas96rAWQ/exec',
  'venue.html': 'https://script.google.com/macros/s/AKfycbxqvS2gLPqkXOgCWV-130JO9cC6Oi9pvCkVf28jRMynqW1mdWyP_00J8HGu0VY3HXDT2A/exec',
  'newcomer.html': 'https://script.google.com/macros/s/AKfycbwAc05-vf-HfZ0VcaPaFeVo3a3nGoyZT4lgkg-7hFFEXa3J09JDHnnGVIty9eXXSaNa/exec'
};
const SANDBOX_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxaavemiVxnKbNLc58NKwvBbO3YX5ilZoD8CLNMh-6mhwuTNJ1i85s08QfV2ZXgrv3-/exec';

function scriptUrl(file) {
  const match = read(file).match(/var SCRIPT_URL\s*=\s*'([^']+)'/);
  assert.ok(match, `${file} 必須宣告 SCRIPT_URL`);
  return match[1];
}

function productionRuntime() {
  const context = {};
  vm.runInNewContext(read('service-runtime-config.js'), context);
  return context.MultiChurchRuntimeConfig;
}

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    snapshot() { return Object.fromEntries(data); }
  };
}

function loadPlatform(search = '') {
  const replacements = [];
  const localStorage = makeStorage({ svcToken: 'token-1', svcWhoami: '{"ok":true}', unrelated: 'keep' });
  const sessionStorage = makeStorage();
  const window = {
    localStorage,
    sessionStorage,
    location: {
      href: `https://daudi-w.github.io/church-web/service.html${search}`,
      origin: 'https://daudi-w.github.io',
      search,
      replace(href) { replacements.push(href); },
      reload() {}
    }
  };
  vm.runInNewContext(read('platform-module.js'), { window, URL, URLSearchParams });
  return { api: window.PlatformModule, localStorage, sessionStorage, replacements };
}

test('正式頁面固定連到各自正式 GAS，沙盒不會混入正式端點', () => {
  const runtime = productionRuntime();
  assert.equal(runtime.endpoint, FORMAL_ENDPOINTS['service.html']);
  assert.equal(runtime.frontend.venueEndpoint, FORMAL_ENDPOINTS['venue.html']);
  assert.equal(runtime.frontend.newcomerEndpoint, FORMAL_ENDPOINTS['newcomer.html']);
  for (const endpoint of Object.values(FORMAL_ENDPOINTS)) assert.notEqual(endpoint, SANDBOX_ENDPOINT);
  assert.match(read('service.html'), /SERVICE_CONFIG\.serviceEndpoint/);
  assert.match(read('venue.html'), /SERVICE_CONFIG\.venueEndpoint/);
  assert.match(read('newcomer.html'), /SERVICE_CONFIG\.newcomerEndpoint/);
  assert.equal(scriptUrl('sandbox.html'), SANDBOX_ENDPOINT);
  assert.ok(!Object.values(FORMAL_ENDPOINTS).includes(SANDBOX_ENDPOINT));
});

test('平台首頁只以同源頁面開啟場地與新人模組', () => {
  const service = read('service.html');
  const links = productionRuntime().frontend.fallbackLinks;
  assert.ok(links.some((link) => link.name === '場地申請' && link.url === 'venue.html'));
  assert.ok(links.some((link) => link.name === '新人跟進' && link.url === 'newcomer.html'));
  assert.match(service, /PlatformModule\.isModuleHref\(href\)\) location\.href = href/);

  for (const file of ['venue.html', 'newcomer.html']) {
    const html = read(file);
    assert.match(html, /<script src="platform-module\.js\?v=3"><\/script>/);
    assert.match(html, /href="service\.html"[^>]*>← 回首頁<\/a>/);
    assert.match(html, /PlatformModule\.requirePlatformLogin\('/);
    assert.match(html, /PlatformModule\.markModuleAuthenticated\('/);
  }
});

test('Service Worker 預快取正式入口、兩個模組與同版共用資源', () => {
  const sw = read('sw.js');
  for (const asset of [
    'service.html',
    'venue.html',
    'newcomer.html',
    'service-runtime-config.js',
    'service-config.js',
    'platform-module.css?v=3',
    'platform-module.js?v=3'
  ]) {
    assert.ok(sw.includes(`'${asset}'`), `sw.js 缺少 ${asset}`);
  }
  assert.match(sw, /if \(req\.method !== 'GET'\) return/);
  assert.match(sw, /origin !== self\.location\.origin\) return/);
});

test('模組路由只接受同源 allowlist', () => {
  const { api } = loadPlatform();
  assert.equal(api.moduleHref('venue'), 'venue.html');
  assert.equal(api.moduleHref('newcomer'), 'newcomer.html');
  assert.equal(api.moduleHref('admin'), '');
  assert.equal(api.isModuleHref('venue.html'), true);
  assert.equal(api.isModuleHref('/church-web/newcomer.html?from=notice'), true);
  assert.equal(api.isModuleHref('https://evil.example/venue.html'), false);
  assert.equal(api.isModuleHref('venue.html.evil'), false);
});

test('登入後只恢復合法模組，未知 next 不導頁', () => {
  const allowed = loadPlatform('?next=venue');
  assert.equal(allowed.api.getRequestedModule(), 'venue');
  assert.equal(allowed.api.resumeRequestedModule(), true);
  assert.deepEqual(allowed.replacements, ['venue.html']);

  const rejected = loadPlatform('?next=https%3A%2F%2Fevil.example');
  assert.equal(rejected.api.getRequestedModule(), '');
  assert.equal(rejected.api.resumeRequestedModule(), false);
  assert.deepEqual(rejected.replacements, []);
});

test('過期 session 最多自動重登一次，且不刪除無關儲存值', () => {
  const ctx = loadPlatform();
  assert.equal(ctx.api.requirePlatformLogin('venue', {
    afterRejectedToken: true,
    reason: 'session_expired'
  }), true);
  assert.deepEqual(ctx.replacements, ['service.html?next=venue&reason=session_expired']);
  assert.deepEqual(ctx.localStorage.snapshot(), { unrelated: 'keep' });
  assert.equal(ctx.sessionStorage.getItem('svcModuleReauth:venue'), '1');

  assert.equal(ctx.api.requirePlatformLogin('venue', { afterRejectedToken: true }), false);
  assert.equal(ctx.replacements.length, 1);
  ctx.api.markModuleAuthenticated('venue');
  assert.equal(ctx.sessionStorage.getItem('svcModuleReauth:venue'), null);
  assert.equal(ctx.api.requirePlatformLogin('unknown'), false);
});

test('外部連結只接受 HTTPS，危險主動內容協定一律拒絕', () => {
  const service = read('service.html');
  const helper = service.match(/(function safeExternalUrl\(raw\) \{[\s\S]*?)\n  function openSafeExternal/);
  assert.ok(helper, 'service.html 必須保留集中式外部網址驗證');
  const context = {
    URL,
    window: { location: { href: 'https://daudi-w.github.io/church-web/service.html' } }
  };
  vm.runInNewContext(helper[1], context);
  assert.equal(context.safeExternalUrl('https://docs.google.com/test'), 'https://docs.google.com/test');
  assert.equal(context.safeExternalUrl('/church-web/venue.html'), 'https://daudi-w.github.io/church-web/venue.html');
  assert.equal(context.safeExternalUrl('javascript:alert(1)'), '');
  assert.equal(context.safeExternalUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.doesNotMatch(service, /window\.open\(LAST_RES\.scheduleUrl/);
  assert.doesNotMatch(service, /href\.indexOf\('http'\)/);
  assert.doesNotMatch(service, /onclick="window\.open\([^\n]*boardUrl/);
  assert.match(service, /boardBtn\.addEventListener\('click',[\s\S]*?openSafeExternal\(res\.boardUrl\)/);
});

test('動態 HTML 不把後端文字拼進 inline JavaScript 或未跳脫錯誤訊息', () => {
  const service = read('service.html');
  const venue = read('venue.html');
  const newcomer = read('newcomer.html');

  assert.match(venue, /escapeHtml\(\(res && res\.message\) \|\| '載入失敗'\)/);
  assert.match(service, /esc\(res\.error \|\| '無法取得小組清單'\)/);
  assert.match(service, /data-branch-value="' \+ esc\(t\)/);
  assert.doesNotMatch(service, /branchTabs\(brs, cur, fn\)/);

  assert.doesNotMatch(newcomer, /JSON\.stringify\(w\)\.replace/);
  assert.match(newcomer, /pills\.querySelectorAll\('\.week-pill'\)[\s\S]*?addEventListener\('click'/);
  assert.match(newcomer, /data-group-key="' \+ esc\(groupKey\)/);
  assert.match(newcomer, /data-group-key="' \+ esc\(districtKey\)/);
  assert.doesNotMatch(newcomer, /toggleFlatGroup\(\\'' \+ (?:groupKey|districtKey)/);
  assert.equal((newcomer.match(/function openAssign\(idx\)/g) || []).length, 1);

  const escSource = newcomer.match(/(function esc\(str\) \{[\s\S]*?)\n\}\n\ndocument\.querySelectorAll/);
  assert.ok(escSource, 'newcomer.html 必須保留集中式 HTML escaping');
  const context = {};
  vm.runInNewContext(escSource[1] + '\n}', context);
  assert.equal(
    context.esc(`<img src=x onerror="alert(1)"> O'Reilly`),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; O&#39;Reilly'
  );
});
