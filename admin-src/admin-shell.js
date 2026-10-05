/* ---------- 登入與連線：沿用服事平台的 Google 登入與平台 session ---------- */
// ADMIN_ENV 由頁面提供：正式 admin.html 讀 service-runtime-config；沙盒 sandbox-admin.html 直接寫沙盒網址
const ENV = window.ADMIN_ENV || {};
let TOKEN = null, ID_TOKEN = null, MY_EMAIL = '';
try { TOKEN = localStorage.getItem(ENV.tokenKey); } catch (e) { }

function api(action, args){
  return fetch(ENV.endpoint, {
    method:'POST', redirect:'follow',
    body:JSON.stringify({action, idToken:ID_TOKEN, sessionToken:TOKEN, args:args || {}})
  }).then(r => r.json()).then(res => {
    if (res.ok) return res;
    const msg = String(res.error || '發生錯誤');
    if (/SESSION_EXPIRED/.test(msg)) { forgetToken(); showLogin('登入已過期，請重新登入'); }
    throw new Error(msg);
  }, () => { throw new Error('連不上伺服器，請檢查網路後再試一次'); });
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
  document.getElementById('main').innerHTML = '<div class="empty"><p>載入中…</p></div>';
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
