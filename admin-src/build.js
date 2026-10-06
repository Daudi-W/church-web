// 產生 admin-app.js（正式 admin.html 與沙盒 sandbox-admin.html 共用）。改程式請改 admin-src/ 裡的檔案，再跑：node admin-src/build.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const parts = ['admin-data.js', 'admin-diff.js', 'admin-screens.js', 'admin-shell.js'];
const out = '/* 由 admin-src/build.js 產生，請勿直接修改。來源：' + parts.join('、') + ' */\n' +
  parts.map(f => '/* ===== ' + f + ' ===== */\n' + fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
// node admin-src/build.js          → admin-app.js（正式 admin.html 用）
// node admin-src/build.js sandbox  → admin-app.sandbox.js（沙盒 sandbox-admin.html 先試新版，驗收後再產生正式版）
const target = process.argv[2] === 'sandbox' ? 'admin-app.sandbox.js' : 'admin-app.js';
fs.writeFileSync(path.join(dir, '..', target), out);
console.log(target, out.length, 'bytes');
