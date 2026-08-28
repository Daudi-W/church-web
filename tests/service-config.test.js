const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const Config = require(path.join(ROOT, 'service-config.js'));

function loadRuntime(file) {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context);
  return context.MultiChurchRuntimeConfig;
}

test('桃園正式設定抽離後仍保留原本品牌、三個後端與工具入口', () => {
  const config = Config.resolve(loadRuntime('service-runtime-config.js'));
  assert.equal(Config.validate(config).ok, true);
  assert.equal(config.platformName, '桃園教會服事平台');
  assert.equal(config.defaultBranch, '桃園');
  assert.deepEqual(Array.from(config.branches), ['桃園', '林口']);
  assert.match(config.serviceEndpoint, /script\.google\.com\/macros\/s\/.+\/exec/);
  assert.match(config.venueEndpoint, /script\.google\.com\/macros\/s\/.+\/exec/);
  assert.match(config.newcomerEndpoint, /script\.google\.com\/macros\/s\/.+\/exec/);
  assert.ok(config.fallbackLinks.some((link) => link.url === 'venue.html'));
  assert.ok(config.fallbackLinks.some((link) => link.url === 'newcomer.html'));
  assert.equal(config.webPushEnabled, true);
});

test('合作教會只換 runtime 即可改品牌、堂區與模組端點', () => {
  const config = Config.resolve({
    churchId: 'church_test',
    churchName: '合作教會',
    googleClientId: '123456-demo.apps.googleusercontent.com',
    endpoint: 'https://script.google.com/macros/s/SERVICE/exec',
    features: { webPush: false },
    frontend: {
      defaultBranch: '北屯',
      branches: ['北屯'],
      venueEndpoint: 'https://script.google.com/macros/s/VENUE/exec',
      newcomerEndpoint: 'https://script.google.com/macros/s/NEWCOMER/exec',
      fallbackLinks: [{ name: '教會官網', url: 'https://example.test' }]
    }
  });
  assert.equal(config.platformName, '合作教會服事平台');
  assert.equal(config.defaultBranch, '北屯');
  assert.deepEqual(config.branches, ['北屯']);
  assert.equal(config.venueEndpoint, 'https://script.google.com/macros/s/VENUE/exec');
  assert.equal(config.webPushEnabled, false);
  assert.equal(config.fallbackLinks[0].name, '教會官網');
});

test('交付範例不含桃園正式部署座標', () => {
  const example = fs.readFileSync(path.join(ROOT, 'service-runtime-config.example.js'), 'utf8');
  const production = loadRuntime('service-runtime-config.js');
  const forbidden = [
    production.googleClientId,
    production.endpoint,
    production.frontend.scheduleUrl,
    production.frontend.venueEndpoint,
    production.frontend.newcomerEndpoint,
    production.frontend.vapidPublicKey
  ];
  forbidden.forEach((value) => assert.ok(!example.includes(value), `範例不可含正式座標：${value.slice(0, 18)}…`));
});

test('正式頁面不再直接寫死部署座標', () => {
  for (const file of ['service.html', 'venue.html', 'newcomer.html']) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!html.includes('script.google.com/macros/s/'), `${file} 仍寫死 GAS 網址`);
    assert.match(html, /service-runtime-config\.js/);
    assert.match(html, /service-config\.js/);
  }
});
