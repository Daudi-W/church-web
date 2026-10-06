/* ---------- 登入與連線：沿用服事平台的 Google 登入與平台 session ---------- */
// ADMIN_ENV 由頁面提供：正式 admin.html 讀 service-runtime-config；沙盒 sandbox-admin.html 直接寫沙盒網址
const ENV = window.ADMIN_ENV || {};
let TOKEN = null, ID_TOKEN = null, MY_EMAIL = '';
try { TOKEN = localStorage.getItem(ENV.tokenKey); } catch (e) { }

/* 每種請求平常要多久（毫秒），給進度條推算用；儲存類比較久 */
const API_EXPECT = {adminData:8000, adminApply:15000, adminUndo:15000, whoami:3000};
function api(action, args, popts){
  const long = action === 'adminApply' || action === 'adminUndo';
  const h = window.ChurchProgress ? ChurchProgress.begin(Object.assign({
    expected:API_EXPECT[action] || 3000, write:long, slowAfter:long ? 30000 : 25000,
    button:ChurchProgress.pressedButton()
  }, popts || {})) : {end(){}};
  return apiRaw(action, args).then(v => { h.end(); return v; }, e => { h.end(); throw e; });
}
function apiRaw(action, args){
  return fetch(ENV.endpoint, {
    method:'POST', redirect:'follow',
    body:JSON.stringify({action, idToken:ID_TOKEN, sessionToken:TOKEN, args:args || {}})
  }).then(r => r.json()).then(res => {
    if (res.ok) return res;
    const msg = String(res.error || '發生錯誤');
    if (/SESSION_EXPIRED/.test(msg)) { forgetToken(); showLogin('登入已過期，請重新登入'); }
    throw new Error(msg);
  }, () => { const e = new Error('連不上伺服器，請檢查網路後再試一次'); e.network = true; throw e; });
}
function forgetToken(){ TOKEN = null; try { localStorage.removeItem(ENV.tokenKey); } catch (e) { } }

function showLogin(msg){
  document.getElementById('app').hidden = true;
  document.getElementById('nav').hidden = true;
  const box = document.getElementById('login');
  box.hidden = false;
  document.getElementById('login-msg').textContent = msg || '請用 Google 登入，只有管理者可以使用。';
  initGoogle();
}
function initGoogle(){
  if (initGoogle.done) return;
  if (!(window.google && google.accounts && google.accounts.id)) return setTimeout(initGoogle, 150);
  initGoogle.done = true;
  google.accounts.id.initialize({client_id:ENV.clientId, callback:onGoogleLogin, auto_select:false});
  google.accounts.id.renderButton(document.getElementById('gBtn'), {theme:'filled_blue', size:'large', text:'signin_with', shape:'pill'});
}
function onGoogleLogin(resp){
  ID_TOKEN = resp.credential;
  document.getElementById('login-msg').textContent = '驗證身分中…';
  api('whoami').then(res => {
    if (res.sessionToken) { TOKEN = res.sessionToken; try { localStorage.setItem(ENV.tokenKey, TOKEN); } catch (e) { } }
    if (!res.matched) throw new Error(res.note || '這個 Google 帳號不在名單裡');
    return start();
  }).catch(e => showLogin(e.message));
}

/** 重新讀取全部資料（每次寫入、復原後都會呼叫） */
function reload(){
  return api('adminData').then(d => { ingest(d); MY_EMAIL = d.me || MY_EMAIL; });
}
function whoLabel(email){
  if (!email) return '';
  if (MY_EMAIL && email.toLowerCase() === MY_EMAIL.toLowerCase()) return '你';
  const p = people.find(x => x.emails.includes(String(email).toLowerCase()));
  return p ? p.name : email;
}
function start(){
  document.getElementById('login').hidden = true;
  // 先排出版面的樣子（灰色方塊），讓人知道頁面正在載入
  document.getElementById('main').innerHTML = '<div class="sk sk-title"></div><div class="sk sk-card"></div><div class="tasks">' + '<div class="sk sk-task"></div>'.repeat(8) + '</div><div class="sk sk-card"></div><p class="hint" role="status">讀取名單與小組資料中，第一次打開大約要 10 秒…</p>';
  document.getElementById('app').hidden = false;
  return reload().then(() => {
    document.getElementById('nav').hidden = false;
    render();
  }).catch(e => {
    if (/只有管理者/.test(e.message)) showLogin('這個帳號沒有管理者權限。需要的話請找核心管理者幫你勾「全職同工」。');
    else if (!/SESSION_EXPIRED/.test(e.message)) document.getElementById('main').innerHTML = `<div class="empty"><p>讀取失敗：${esc(e.message)}</p><button class="btn secondary" onclick="start()">再試一次</button></div>`;
  });
}
window.addEventListener('load', () => { if (TOKEN) start(); else showLogin(); });
