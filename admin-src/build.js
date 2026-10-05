// 產生 admin-app.js（正式 admin.html 與沙盒 sandbox-admin.html 共用）。改程式請改 admin-src/ 裡的檔案，再跑：node admin-src/build.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const parts = ['admin-data.js', 'admin-diff.js', 'admin-screens.js', 'admin-shell.js'];
const out = '/* 由 admin-src/build.js 產生，請勿直接修改。來源：' + parts.join('、') + ' */\n' +
  parts.map(f => '/* ===== ' + f + ' ===== */\n' + fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
fs.writeFileSync(path.join(dir, '..', 'admin-app.js'), out);
console.log('admin-app.js', out.length, 'bytes');
