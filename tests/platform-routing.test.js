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
  for (const [file, endpoint] of Object.entries(FORMAL_ENDPOINTS)) {
    assert.equal(scriptUrl(file), endpoint);
    assert.notEqual(scriptUrl(file), SANDBOX_ENDPOINT);
  }
  assert.equal(scriptUrl('sandbox.html'), SANDBOX_ENDPOINT);
  assert.ok(!Object.values(FORMAL_ENDPOINTS).includes(scriptUrl('sandbox.html')));
});

test('平台首頁只以同源頁面開啟場地與新人模組', () => {
  const service = read('service.html');
  assert.match(service, /name:\s*'場地申請'[\s\S]*?url:\s*'venue\.html'/);
  assert.match(service, /name:\s*'新人跟進'[\s\S]*?url:\s*'newcomer\.html'/);
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
