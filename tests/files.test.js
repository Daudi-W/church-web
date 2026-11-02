const test = require('node:test');
const assert = require('node:assert/strict');
const { formatBytes, chunkRange, apiBase, folderLink } = require('../files.js');

test('大型影片區段不重疊、不漏位元組，最後一段可不滿區塊', () => {
  const total = 2 * 1024 ** 3 + 17, limit = 8 * 1024 ** 2;
  let offset = 0, parts = 0;
  while (offset < total) {
    const range = chunkRange(offset, total, limit);
    assert.equal(range.start, offset);
    assert.ok(range.end > offset && range.end <= total);
    assert.equal(range.header, `bytes ${offset}-${range.end - 1}/${total}`);
    offset = range.end; parts++;
  }
  assert.equal(offset, total); assert.equal(parts, 257);
  assert.throws(() => chunkRange(total, total, limit));
  assert.throws(() => chunkRange(-1, total, limit));
});
test('檔案大小以 KB、MB、GB 顯示，不產生 NaN', () => {
  assert.equal(formatBytes(2048), '2 KB'); assert.equal(formatBytes(2 * 1024 ** 3), '2.0 GB');
  assert.equal(formatBytes(undefined), ''); assert.equal(formatBytes(-1), '');
});
test('API 網址禁止主動內容、憑證、參數及一般 HTTP，只允許本機開發 HTTP', () => {
  assert.equal(apiBase('https://files.example.invalid/'), 'https://files.example.invalid');
  for (const value of ['javascript:alert(1)', 'http://evil.example', 'https://user:pass@files.example', 'https://files.example?token=anything', 'https://files.example#anything', '']) assert.equal(apiBase(value), '');
  assert.equal(apiBase('http://127.0.0.1:8080/'), 'http://127.0.0.1:8080');
});

test('分享連結只帶資料夾位置，不帶登入或預覽參數', () => {
  assert.equal(folderLink('https://example.invalid/church-web/files.html?token=secret&preview=1#anything', 'child_folder_12345'), 'https://example.invalid/church-web/files.html#folder=child_folder_12345');
  assert.throws(() => folderLink('https://example.invalid/files.html', '../private'));
});
