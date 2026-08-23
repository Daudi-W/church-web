const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', 'multi-church-test');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('多教會測試頁使用完整的登入與四模組程式', () => {
  const html = read('index.html');
  for (const file of [
    'runtime-config.js', 'google-auth.js', 'domain.js', 'modules.js', 'storage.js',
    'data-adapter.js', 'apps-script-transport.js', 'app.js'
  ]) {
    assert.ok(html.includes(`src="${file}"`), `index.html 缺少 ${file}`);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `部署缺少 ${file}`);
  }
  assert.match(html, /id="login-gate"/);
  assert.match(html, /id="google-login-button"/);
});

test('多教會測試設定只包含公開座標且固定教會', () => {
  const window = {};
  vm.runInNewContext(read('runtime-config.js'), { window, self: window });
  const config = window.MultiChurchRuntimeConfig;
  assert.equal(config.mode, 'apps-script');
  assert.equal(config.churchId, 'church_google_demo');
  assert.match(config.googleClientId, /\.apps\.googleusercontent\.com$/);
  assert.match(config.endpoint, /^https:\/\/script\.google\.com\/macros\/s\//);
  assert.equal('clientSecret' in config, false);
  assert.equal('spreadsheetId' in config, false);
});

test('登入憑證不寫入瀏覽器儲存空間', () => {
  const auth = read('google-auth.js');
  assert.doesNotMatch(auth, /localStorage|sessionStorage|indexedDB/);
  assert.match(auth, /token = response\.credential/);
});

test('本機網址不再啟動不可能成功的 OAuth 流程', () => {
  const auth = read('google-auth.js');
  assert.match(auth, /\^\(localhost\|127\\\.0\\\.0\\\.1\)\$/);
  assert.match(auth, /https:\/\/daudi-w\.github\.io\/church-web\/multi-church-test\//);
  assert.match(auth, /開啟線上測試入口/);
});

test('登入選單只提示 Google Workspace 工作帳號', () => {
  const auth = read('google-auth.js');
  assert.match(auth, /hd:\s*'\*'/);
  assert.match(auth, /auto_select:\s*false/);
});
