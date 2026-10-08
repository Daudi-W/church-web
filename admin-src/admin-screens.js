/* ---------- 畫面狀態 ---------- */
/* peek＝從首頁或組織點進某人：留在原分頁顯示他的資料，返回時回到原本的位置 */
/* 事工團頁的排序記在這台裝置；沒記過就用崗位排 */
function savedTeamSort(){ try { return localStorage.getItem('adminTeamSort') || 'skill'; } catch (e) { return 'skill'; } }
function savedTeamDir(){ try { return localStorage.getItem('adminTeamDir') === 'desc' ? 'desc' : 'asc'; } catch (e) { return 'asc'; } }
const state = {tab:'home', q:'', sel:null, peek:null, org:{mode:'care', region:null, group:null, team:null, pick:[], tf:{skill:'', region:'', sort:savedTeamSort(), dir:savedTeamDir()}}, allLog:false};
let ms = null; // 目前開著的彈窗（任務）

const isLeaderRole = r => /小組長|區長|區牧|區督/.test(r);
const leadsOther = (pname, exceptName) => groups.some(x => x.name !== exceptName && x.status === '啟用' && x.leader === pname);
const nameTaken = (n, except) => groups.find(x => x !== except && (x.name === n || x.old.includes(n)));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toast(msg, err){
  const r = document.getElementById('toast-root');
  r.innerHTML = '<div class="toast' + (err ? ' err' : '') + '" role="status">' + esc(msg) + '</div>';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { r.innerHTML = ''; }, err ? 4500 : 3000);
}
/* 所有寫入都經過這裡：在畫面資料上試做一次 → 比對出 ops → 畫面先還原 → 送後端 → 成功後重新讀取 */
function commit(title, items, apply){
  const snap = clone({people, groups, regions});
  const distBefore = {}; regions.forEach(r => { if (r._key) distBefore[r._key] = r.district; });
  apply();
  // 督區跟著區走：小組換了區、新開的小組、或所屬區換了督區，都把小組的督區對齊
  const g0 = {}; snap.groups.forEach(g => g0[g._key] = g);
  groups.forEach(g => {
    const r = regionObj(g.region); if (!r) return;
    const moved = !g._key || (g0[g._key] && g0[g._key].region !== g.region);
    const regionChanged = r._key && distBefore[r._key] !== r.district;
    if (moved || regionChanged) g.district = r.district || '';
  });
  // 改了區的人，排班用的區（同工資料庫、各團分頁）也跟著改
  const p0 = {}; snap.people.forEach(x => p0[x.name] = x);
  people.forEach(x => {
    const o = p0[x.name];
    if (!o) x.dbRegion = x.dbRegion || x.region;
    else if (o.region !== x.region) x.dbRegion = x.region;
    // 有帳號的人，排班用的區一動就對齊白名單的區（每次寫入後的身分重建也會這樣對齊，否則復原會對不上）
    else if (x.member && o.dbRegion !== x.dbRegion) x.dbRegion = x.region;
    // 沒登記的人被設定了小組或職分 → 登記到白名單（email 留空）
    if (o && !o.member && (x.group || (x.role && x.role !== '一般同工') || (x.extraRegions || []).length)) ensureMember(x, x.region);
  });
  const ops = buildOps(snap);
  people = snap.people; groups = snap.groups; regions = snap.regions;
  if (!ops.length) { toast('沒有任何變更', true); return Promise.resolve(false); }
  // 儲存要十幾秒：確認按鈕上依時間推算顯示目前大概在做哪一步
  const stage = p => p < 0.3 ? '核對資料中…' : p < 0.62 ? '寫入試算表中…' : '更新權限中…';
  const onTick = p => { const b = document.querySelector('.mactions [data-act=apply]'); if (b && ms && ms.busy) b.textContent = stage(p); };
  return api('adminApply', {title, items, ops}, {onTick}).then(res => res.data ? ingest(res.data) : reload()).then(() => { toast('已儲存：' + title); return true; })
    .catch(e => {
      if (!e.network) { toast(e.message || String(e), true); return false; }
      // 連線在等回覆時斷了（手機切 App、鎖螢幕、換網路）：後端可能已經寫完，重新讀一次核對
      return verifyAfterDrop(ops).then(landed => {
        if (landed) { toast('已儲存：' + title + '（連線中斷過，已確認寫入成功）'); return true; }
        toast('沒有存到，請再按一次「確認執行」', true); return false;
      });
    });
}
/** 連線中斷後：重新讀資料，看每一項是否都已經是「改後」的樣子（全部是＝寫入成功）。讀不到就等幾秒再試。 */
function verifyAfterDrop(ops, tries){
  tries = tries || 0;
  return new Promise(r => setTimeout(r, 2500)).then(() => reload()).then(() => {
    const now = {person:{}, group:{}, region:{}};
    people.forEach(p => now.person[p.name] = pstate(p));
    groups.forEach(g => now.group[g.name] = gstate(g));
    regions.forEach(r => now.region[r.name] = rstate(r));
    return ops.every(op => {
      const key = op.after ? op.after.name : op.key;
      const cur = now[op.t][key] || null;
      if (!op.after) return cur === null || (op.t === 'region' && !regions.some(r => r.name === key));
      if (!cur) return false;
      const a = Object.assign({}, op.after), c = Object.assign({}, cur);
      if (op.t === 'person') { delete a.dbRegion; delete c.dbRegion; } // 排班用的區會被身分重建對齊，不拿來判斷
      return canon(a) === canon(c);
    });
  }).catch(() => tries < 2 ? verifyAfterDrop(ops, tries + 1) : false);
}
function fixRefs(){
  const o = state.org;
  if (state.sel && !byId(state.sel)) state.sel = null;
  if (state.peek && !byId(state.peek.id)) state.peek = null;
  if (o.group && !groupObj(o.group)) o.group = null;
  if (o.region && !regionObj(o.region)) o.region = null;
  o.pick = o.pick.filter(id => byId(id) && byId(id).group === o.group);
}
function auditList(){
  const out = [];
  people.filter(usable).forEach(p => teamRows(p).forEach(r => { if (r.state !== 'ok') out.push({p, r}); }));
  people.filter(p => usable(p) && zoneMismatch(p)).forEach(p => out.push({p, zone:true}));
  return out;
}
function regionOptions(sel){ return regions.map(r => `<option ${r.name === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join(''); }
function groupOptionsIn(region, sel, opts){
  opts = opts || {};
  const gs = groups.filter(g => g.region === region && g.name !== opts.except && (opts.status ? g.status === opts.status : (g.status === '啟用' || g.name === sel)));
  return `<option value="">${opts.placeholder || '（不屬於小組）'}</option>` + gs.map(g => `<option value="${esc(g.name)}" ${g.name === sel ? 'selected' : ''}>${esc(g.name)}（${esc(g.leader || '無小組長')}）</option>`).join('');
}
function teamMembers(t){
  return people.filter(usable).map(p => ({p, r:teamRows(p).find(r => r.team === t)})).filter(x => x.r);
}

/* ---------- 導覽 ---------- */
const ICON = {
  home:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
  people:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  org:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/></svg>'
};
function renderNav(){
  const n = auditList().length;
  document.getElementById('nav').innerHTML = [['home','首頁'],['people','找人'],['org','組織']].map(([k, l]) =>
    `<button data-act="tab" data-k="${k}" aria-current="${state.tab === k ? 'page' : 'false'}"><span class="ni">${ICON[k]}</span><span>${l}</span>${k === 'home' && n ? `<span class="count" aria-label="${n} 件待核對">${n}</span>` : ''}</button>`).join('');
}
function render(){
  renderNav();
  const m = document.getElementById('main');
  if (state.peek) m.innerHTML = renderPerson();
  else if (state.tab === 'home') m.innerHTML = renderHome();
  else if (state.tab === 'people') m.innerHTML = state.sel ? renderPerson() : renderSearch();
  else m.innerHTML = renderOrg();
}
function toTop(){ window.scrollTo(0, 0); }

/* ---------- 首頁 ---------- */
const TASKS = [
  {k:'move', l:'移動組員', d:'換到別組或別區'},
  {k:'split', l:'小組分殖', d:'一組分成兩組'},
  {k:'handover', l:'小組交棒', d:'改組名＋換小組長'},
  {k:'newGroup', l:'新開小組', d:'也能同時開新的區'},
  {k:'newAcct', l:'開新帳號', d:'新同工要登入平台'},
  {k:'teams', l:'事工團與崗位', d:'加入、退出、崗位'},
  {k:'disable', l:'停用帳號', d:'離開教會或暫停'},
  {k:'moveGroup', l:'整組搬區', d:'組員的區一起改'}
];
function renderHome(){
  const need = auditList();
  const row = x => `<li><button class="lrow" data-act="openPerson" data-id="${x.p.id}"><span class="lbody">
      <span class="lmain"><strong>${esc(x.p.name)}</strong><span class="tag">${esc(x.zone ? '區不一致' : x.r.team)}</span></span>
      <span class="lmeta">${x.zone ? `排班用「${esc(x.p.dbRegion)}」，白名單是「${esc(x.p.region)}」` : '登記為團員，但排班沒有崗位'}</span>
    </span><span class="chev" aria-hidden="true">›</span></button></li>`;
  return `
  <header class="page-h"><div class="row-between"><h1>管理後台</h1><a class="back-link" href="${esc(ENV.platformUrl || 'service.html')}">回服事平台</a></div><p>帳號、小組與事工團維護</p></header>
  ${need.length ? `<section class="card attention" aria-labelledby="h-audit">
    <h2 id="h-audit">待核對 ${need.length} 件</h2>
    <p class="hint">點進去處理。區不一致：排班會用錯區的牧區限制，建議統一成白名單的區。團員沒有崗位：不會被排到，請補崗位或讓他退出。</p>
    <ul class="list">${need.map(row).join('')}</ul>
  </section>` : ''}
  <section class="stack" aria-labelledby="h-tasks">
    <h2 id="h-tasks" class="sec-h">今天要做什麼？</h2>
    <div class="tasks">${TASKS.map(t => `<button class="task" data-act="task" data-t="${t.k}"><strong>${t.l}</strong><span>${t.d}</span></button>`).join('')}</div>
    <div class="more">其他：<button class="link" data-act="task" data-t="leader">只換小組長</button><button class="link" data-act="task" data-t="disableGroup">停用或合併小組</button><button class="link" data-act="goOrg">區與督區設定</button></div>
  </section>
  <section class="stack" aria-labelledby="h-log">${logHtml()}</section>`;
}
function logHtml(){
  if (!log.length) return `<h2 id="h-log" class="sec-h">最近變更</h2><div class="empty"><p>還沒有變更。每次修改都會記在這裡，最新的一筆可以復原。</p></div>`;
  const latest = log.find(e => !e.undone), list = state.allLog ? log : log.slice(0, 3);
  return `<div class="row-between"><h2 id="h-log" class="sec-h">最近變更</h2>${log.length > 3 ? `<button class="link" data-act="allLog">${state.allLog ? '只看最近 3 筆' : '看全部（' + log.length + '）'}</button>` : ''}</div>
  ${list.map(e => `<div class="card logrow">
    <div class="row-between"><strong>${esc(e.title)}</strong><span class="when">${esc(e.when)}・${esc(whoLabel(e.who))}</span></div>
    <details><summary>改了哪些地方（${e.items.length} 項）</summary>${diffList(e.items)}</details>
    ${e.undone ? '<span class="tag">已復原</span>' : e === latest ? `<div class="row-actions"><button class="btn sm danger" data-act="undo" data-id="${e.id}">復原這筆</button></div>` : ''}
  </div>`).join('')}
  <p class="hint">只能從最新的一筆往回復原，避免把後面的修改一起蓋掉。</p>`;
}

/* ---------- 找人 ---------- */
function renderSearch(){
  return `
  <div class="row-between"><h1>找人</h1><button class="btn secondary sm" data-act="task" data-t="newAcct">＋ 開新帳號</button></div>
  <div class="field">
    <label class="field-l" for="q">姓名、服事表稱呼或 email</label>
    <input id="q" type="search" value="${esc(state.q)}" placeholder="姓名的任何一段，或 email" autocomplete="off">
  </div>
  <p class="hint">打任何一段就會列出符合的人，包含有平台帳號的人和同工資料庫裡的同工。只能從清單點選，點到的一定是名單上真的有的人。</p>
  <div id="results">${resultsHtml()}</div>`;
}
function resultsHtml(){
  const q = state.q.trim();
  if (!q) return `<div class="empty"><p>輸入名字開始搜尋，名單目前共 ${people.length} 人（${people.filter(p => !p.account).length} 位還沒有平台帳號）。</p></div>`;
  const r = search(q);
  if (!r.length) return `<div class="empty"><p>名單裡沒有「${esc(q)}」這個人。</p><button class="btn primary" data-act="newAcctQ">用「${esc(q)}」開新帳號</button></div>`;
  const cnt = {};
  r.forEach(p => cnt[p.name] = (cnt[p.name] || 0) + 1);
  return `<ul class="list">${r.map(p => `<li><button class="lrow" data-act="openPerson" data-id="${p.id}">
    <span class="lbody">
      <span class="lmain"><strong>${hl(p.name, q)}</strong>${cnt[p.name] > 1 ? '<span class="tag warn">同名，請看 email 核對</span>' : ''}${!p.account ? '<span class="tag">沒有帳號</span>' : p.active ? '' : '<span class="tag">已停用</span>'}</span>
      <span class="lmeta">${esc(p.region || '未設定區')}・${esc(p.member ? (p.group ? p.group + ' 小組' : '不屬於小組') + '・' + p.role : '還沒登記小組')}</span>
      ${p.emails.length ? `<span class="mono">${p.emails.map(e => hl(e, q)).join('、')}</span>` : ''}
    </span><span class="chev" aria-hidden="true">›</span></button></li>`).join('')}</ul>`;
}
function statePill(r){
  return r.state === 'noSkill' ? '<span class="tag warn">⚠ 排班沒有崗位</span>' : r.state === 'notListed' ? '<span class="tag info">平台未登記</span>' : '';
}
const curPid = () => state.peek ? state.peek.id : state.sel;
function backLabel(){
  if (!state.peek) return '回到搜尋';
  if (state.tab === 'home') return '首頁';
  const o = state.org;
  if (o.mode === 'team') return o.team || '事工團';
  return o.group ? o.group + ' 小組' : o.region || '組織';
}
function renderPerson(){
  const p = byId(curPid()), rows = teamRows(p);
  const sec = (key, title, body) => `<section class="card"><div class="sec-top"><h3>${title}</h3><button class="btn sm ghost" data-act="editSec" data-s="${key}">編輯</button></div>${body}</section>`;
  return `
  <button class="btn ghost back" data-act="${state.peek ? 'backPeek' : 'backSearch'}">← ${esc(backLabel())}</button>
  <div class="card">
    <div class="phead">
      <div><h2>${esc(p.name)}</h2><div class="hint">服事表上稱呼「${esc(p.display)}」・${esc(p.region)}${p.group ? '・' + esc(p.group) + ' 小組' : ''}</div></div>
      <div class="tags">${p.member ? `<span class="tag">${esc(p.role)}</span>` : ''}${p.account ? '' : '<span class="tag">沒有帳號</span>'}${p.staff ? '<span class="tag info">全職同工・管理者</span>' : ''}${p.account && !p.active ? '<span class="tag danger">已停用</span>' : ''}</div>
    </div>
    <div class="quick">
      <button class="btn sm secondary" data-act="editSec" data-s="care">${p.member ? '移到別組' : '設定小組'}</button>
      <button class="btn sm secondary" data-act="editSec" data-s="teams">事工團與崗位</button>
      ${!p.account ? '<button class="btn sm secondary" data-act="openAcct">開帳號</button>' : p.active ? '<button class="btn sm danger" data-act="editSec" data-s="disable">停用帳號</button>' : '<button class="btn sm secondary" data-act="editSec" data-s="acct">重新啟用</button>'}
    </div>
  </div>
  ${sec('care', '牧養', p.member ? `<dl class="kv"><dt>區</dt><dd>${esc(p.region || '未設定')}（${esc(districtLabel(districtOf(p.region)))}）</dd>
    <dt>小組</dt><dd>${p.group && groupObj(p.group) ? `<button class="link inline" data-act="openGroupPage" data-g="${esc(p.group)}">${esc(p.group)}</button>（小組長 ${esc(leaderName(p.group))}）` : esc(p.group || '不屬於小組')}</dd>
    <dt>職分</dt><dd>${esc(p.role)}</dd>${(p.extraRegions || []).length ? `<dt>兼管區</dt><dd>${esc(p.extraRegions.join('、'))}</dd>` : ''}</dl>${zoneMismatch(p) ? `<div class="alert warn"><p>排班用的區是「${esc(p.dbRegion)}」，和白名單的「${esc(p.region)}」不一致，排班會套用「${esc(p.dbRegion)}」的牧區限制。</p><div class="row-actions"><button class="btn sm secondary" data-act="fixZone">統一成「${esc(p.region)}」</button></div></div>` : ''}` : `<dl class="kv"><dt>區</dt><dd>${esc(p.region || '未設定')}</dd><dt>小組</dt><dd>還沒登記</dd></dl><p class="hint">點「編輯」設定小組後，小組長和區長的牧養視圖就看得到他的服事。不用開帳號。</p>`)}
  ${sec('teams', '事工團與排班崗位', rows.length ? `<div>${rows.map(r => `<div class="tline"><div class="lmain"><strong>${esc(r.team)}</strong>${r.listed && r.role === '團長' ? '<span class="tag info">團長</span>' : ''}${statePill(r)}</div><div class="lmeta">${esc(r.skills.join('、') || '沒有排班崗位')}</div></div>`).join('')}</div>` : '<p class="hint">還沒有加入任何事工團。</p>')}
  ${p.account ? sec('acct', '帳號', `<dl class="kv"><dt>email</dt><dd>${p.emails.map(esc).join('<br>')}</dd><dt>登入</dt><dd>${p.active ? '可以登入' : '已停用'}</dd><dt>全職同工</dt><dd>${p.staff ? '是（有管理者權限）' : '否'}</dd></dl>`)
    : `<section class="card"><h3>帳號</h3><p class="hint">還沒有平台帳號，不能登入平台。</p><div class="quick"><button class="btn sm secondary" data-act="openAcct">開帳號</button></div></section>`}
  ${sec('display', '服事表稱呼', `<p class="big">${esc(p.display)}</p><p class="hint">要和服事表上寫的一模一樣，系統才偵測得到他的服事。</p>`)}`;
}

/* ---------- 組織 ---------- */
function renderOrg(){
  const o = state.org;
  if (o.mode === 'team') return o.team ? renderTeamPage() : renderOrgRoot();
  if (o.group) return renderGroupPage();
  if (o.region) return renderRegionPage();
  return renderOrgRoot();
}
function renderOrgRoot(){
  const o = state.org;
  const seg = `<div class="seg big" role="group" aria-label="切換">${[['care','牧養'],['team','事工團']].map(([k, l]) => `<button data-act="orgMode" data-m="${k}" aria-pressed="${o.mode === k}">${l}</button>`).join('')}</div>`;
  if (o.mode === 'team') return `<h1>組織</h1>${seg}
    <p class="hint">點一團看成員、換團長或加人。</p>
    <ul class="list">${teamOrder.map(t => { const m = teamMembers(t), heads = m.filter(x => x.r.listed && x.r.role === '團長'), warn = m.filter(x => x.r.state === 'noSkill').length;
      return `<li><button class="lrow" data-act="openTeamPage" data-t="${esc(t)}"><span class="lbody"><span class="lmain"><strong>${esc(t)}</strong>${warn ? `<span class="tag warn">⚠ ${warn} 人沒有崗位</span>` : ''}</span><span class="lmeta">團長 ${esc(heads.map(x => x.p.name).join('、') || '（尚未設定）')}</span></span><span class="num">${m.length} 人</span><span class="chev" aria-hidden="true">›</span></button></li>`; }).join('')}</ul>`;
  return `<h1>組織</h1>${seg}
    <div class="row-between"><p class="hint">督區 → 區 → 小組。點區看小組，點小組看組員。</p><button class="btn secondary sm" data-act="task" data-t="newGroup">＋ 新開小組／新的區</button></div>
    ${districts().map(d => `<span class="district">${esc(districtLabel(d))}</span><ul class="list">${regions.filter(r => (r.district || '') === d).map(r => {
      const gs = groups.filter(g => g.region === r.name && g.status === '啟用');
      return `<li><button class="lrow" data-act="openRegionPage" data-r="${esc(r.name)}"><span class="lbody"><span class="lmain"><strong>${esc(r.name)}</strong>${gs.length ? '' : '<span class="tag">沒有小組</span>'}</span><span class="lmeta">區長 ${esc(headName(r.name))}</span><span class="mono">${esc(weekLabel(r.week))}</span></span><span class="num">${gs.length} 組・${people.filter(p => p.region === r.name).length} 人</span><span class="chev" aria-hidden="true">›</span></button></li>`; }).join('')}</ul>`).join('')}`;
}
const REGION_ACTS = {rename:['改區名','白名單、小組分頁、同工資料庫、牧區限制一次改完'], district:['換督區','這區所有小組的督區欄一起改'], week:['調整牧區限制','每月哪一週主日不排（由牧師決定）'], dissolve:['解散這區','同工移到別區，牧區限制一併移除']};
function renderRegionPage(){
  const r = regionObj(state.org.region), gs = groups.filter(g => g.region === r.name), heads = headsOf(r.name);
  return `<button class="btn ghost back" data-act="orgUp">← 組織</button>
  <div class="card">
    <h2>${esc(r.name)}</h2>
    <dl class="kv"><dt>督區</dt><dd>${esc(districtLabel(r.district))}</dd><dt>牧區限制</dt><dd>${esc(weekLabel(r.week))}</dd><dt>同工</dt><dd class="num">${regionPeople(r.name).length} 人</dd></dl>
    <div class="field"><span class="field-l">區長</span><div class="chips">${heads.map(p => `<button class="chip" data-act="openPerson" data-id="${p.id}">${esc(p.name)}（${esc(p.role)}）</button>`).join('') || '<span class="hint">尚未設定</span>'}</div></div>
    <p class="hint">區長不用另外設定：某人的職分是區長、區牧或區督，區又是這一區，他就是這區的區長。</p>
    ${(() => { const un = regionPeople(r.name).filter(p => !p.group); return un.length ? `<details><summary>還沒分到小組：${un.length} 人</summary><p class="hint">點名字進去設定小組；全部分完後這一行就不會出現。</p><ul class="list">${un.map(p => `<li><button class="lrow" data-act="openPerson" data-id="${p.id}"><span class="lbody"><span class="lmain"><strong>${esc(p.name)}</strong>${p.account ? '' : '<span class="tag">沒有帳號</span>'}</span><span class="lmeta">${esc(p.skills.length ? '排班：' + p.skills.join('、') : '沒有排班崗位')}</span></span><span class="chev" aria-hidden="true">›</span></button></li>`).join('')}</ul></details>` : ''; })()}
  </div>
  <div class="row-between"><h2 class="sec-h">小組（${gs.length}）</h2><button class="btn sm secondary" data-act="newGroupHere">＋ 在這區新開小組</button></div>
  <ul class="list">${gs.map(g => `<li><button class="lrow" data-act="openGroupPage" data-g="${esc(g.name)}"><span class="lbody"><span class="lmain"><strong>${esc(g.name)}</strong>${g.status === '停用' ? '<span class="tag">停用</span>' : ''}${g.old.length ? `<span class="tag">舊名 ${esc(g.old.join('、'))}</span>` : ''}</span><span class="lmeta">小組長 ${esc(g.leader || '（未設定）')}</span></span><span class="num">${membersOf(g.name).length} 人</span><span class="chev" aria-hidden="true">›</span></button></li>`).join('') || '<li><div class="lrow hint">這區目前沒有小組</div></li>'}</ul>
  <h2 class="sec-h">這一區的設定</h2>
  <div class="agrid">${Object.keys(REGION_ACTS).map(a => `<button class="action" data-act="regionAct" data-a="${a}"><strong>${REGION_ACTS[a][0]}</strong><span>${REGION_ACTS[a][1]}</span></button>`).join('')}</div>`;
}
const GROUP_ACTS = {
  rename:['小組交棒','改組名並換小組長，組員的小組欄一起改'],
  leader:['只換小組長','組名不變'],
  split:['小組分殖','分出新組，勾選要跟過去的組員'],
  move:['整組搬區','組員的「區」一起改'],
  disable:['停用或合併','組員併入別組，這一列保留'],
  enable:['重新啟用','重新出現在小組選單'],
  batchMove:['移動組員','']
};
function renderGroupPage(){
  const o = state.org, g = groupObj(o.group), mem = membersOf(g.name);
  const acts = g.status === '啟用' ? ['rename','leader','split','move','disable'] : ['enable'];
  const allPicked = mem.length && mem.every(p => o.pick.includes(p.id));
  return `<button class="btn ghost back" data-act="orgUp">← ${esc(g.region)}</button>
  <div class="card">
    <div class="phead"><h2>${esc(g.name)} 小組</h2>${g.status === '停用' ? '<span class="tag">停用</span>' : ''}</div>
    <dl class="kv"><dt>區</dt><dd>${esc(g.region)}（${esc(districtOf(g.region))}）</dd><dt>小組長</dt><dd>${byName(g.leader) ? `<button class="link inline" data-act="openPerson" data-id="${byName(g.leader).id}">${esc(g.leader)}</button>` : esc(g.leader || '（未設定）')}</dd>${g.old.length ? `<dt>舊名</dt><dd>${esc(g.old.join('、'))}</dd>` : ''}</dl>
  </div>
  <div class="row-between"><h2 class="sec-h">組員（${mem.length}）</h2>${mem.length ? `<button class="link" data-act="pickAll">${allPicked ? '取消全選' : '全選'}</button>` : ''}</div>
  <p class="hint">這裡列出登記在這組的人，沒有帳號的會標「沒有帳號」。還沒登記小組的同工，到他的個人資料設定小組後就會出現在這裡。</p>
  ${mem.length ? `<p class="hint">勾選組員，可以一次移到別組，或分出新的小組。點右邊箭頭看個人資料。</p>
  <ul class="list">${mem.map(p => `<li class="mrow"><label class="mcheck"><input type="checkbox" data-sel="${p.id}" ${o.pick.includes(p.id) ? 'checked' : ''}><span class="lbody"><span class="lmain"><strong>${esc(p.name)}</strong>${p.name === g.leader ? '<span class="tag info">小組長</span>' : ''}${!p.account ? '<span class="tag">沒有帳號</span>' : p.active ? '' : '<span class="tag">已停用</span>'}</span><span class="lmeta">${esc(p.role)}</span></span></label><button class="iconbtn" data-act="openPerson" data-id="${p.id}" aria-label="打開 ${esc(p.name)} 的個人資料">›</button></li>`).join('')}</ul>` : '<div class="empty"><p>這組目前沒有登記的組員。</p></div>'}
  <h2 class="sec-h">小組設定</h2>
  <div class="agrid">${acts.map(a => `<button class="action" data-act="groupAct" data-a="${a}"><strong>${GROUP_ACTS[a][0]}</strong><span>${GROUP_ACTS[a][1]}</span></button>`).join('')}</div>
  ${o.pick.length ? `<div class="selbar" role="region" aria-label="已勾選的組員"><span>已選 ${o.pick.length} 人</span><button class="btn sm ghost" data-act="clearPick">取消</button><div class="selbtns"><button class="btn sm secondary" data-act="pickMove">移到別組</button><button class="btn sm primary" data-act="pickSplit">分出新組</button></div></div>` : ''}`;
}
const TEAM_SORT = {skill:'崗位', region:'區', lead:'團長', name:'姓名'};
const nameCmp = new Intl.Collator('zh-TW-u-co-stroke').compare;
function teamView(t){
  const f = state.org.tf, all = teamMembers(t), skills = TEAMS[t];
  const isHead = x => x.r.listed && x.r.role === '團長';
  const regionIdx = n => { const i = regions.findIndex(r => r.name === n); return i < 0 ? regions.length : i; };
  const skillIdx = x => x.r.skills.length ? Math.min(...x.r.skills.map(s => { const i = skills.indexOf(s); return i < 0 ? skills.length : i; })) : skills.length + 1;
  const list = all.filter(x =>
    (!f.skill || (f.skill === '__none' ? !x.r.skills.length : x.r.skills.includes(f.skill))) &&
    (!f.region || (x.p.region || '') === (f.region === '__none' ? '' : f.region)));
  const by = {
    lead:(a, b) => isHead(b) - isHead(a),
    name:() => 0,
    region:(a, b) => regionIdx(a.p.region) - regionIdx(b.p.region),
    skill:(a, b) => skillIdx(a) - skillIdx(b)
  }[f.sort] || (() => 0);
  const sign = f.dir === 'desc' ? -1 : 1;
  return {all, list:list.sort((a, b) => sign * (by(a, b) || nameCmp(a.p.name, b.p.name)))};
}
function renderTeamPage(){
  const t = state.org.team, f = state.org.tf, {all:m, list} = teamView(t), heads = m.filter(x => x.r.listed && x.r.role === '團長');
  const rs = regions.filter(r => m.some(x => x.p.region === r.name)), noRegion = m.some(x => !x.p.region);
  const filtered = f.skill || f.region;
  return `<button class="btn ghost back" data-act="orgUp">← 事工團</button>
  <div class="card">
    <h2>${esc(t)}</h2>
    <dl class="kv"><dt>團長</dt><dd>${esc(heads.map(x => x.p.name).join('、') || '（尚未設定）')}</dd><dt>排班崗位</dt><dd>${esc(TEAMS[t].join('、'))}</dd><dt>成員</dt><dd class="num">${m.length} 人</dd></dl>
    <div class="quick"><button class="btn sm secondary" data-act="teamLead">換團長</button><button class="btn sm secondary" data-act="teamAdd">加入成員</button></div>
  </div>
  <div class="tfilter" role="group" aria-label="篩選成員">
    <div class="field"><label class="field-l" for="tf-skill">篩選崗位</label><select id="tf-skill" data-tf="skill"><option value="">全部崗位</option>${TEAMS[t].map(s => `<option ${s === f.skill ? 'selected' : ''}>${esc(s)}</option>`).join('')}<option value="__none" ${f.skill === '__none' ? 'selected' : ''}>沒有崗位</option></select></div>
    <div class="field"><label class="field-l" for="tf-region">篩選區</label><select id="tf-region" data-tf="region"><option value="">全部的區</option>${rs.map(r => `<option ${r.name === f.region ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}${noRegion ? `<option value="__none" ${f.region === '__none' ? 'selected' : ''}>未設定區</option>` : ''}</select></div>
  </div>
  <div class="row-between tbar"><p class="hint" role="status">${filtered ? `符合 ${list.length} 人／共 ${m.length} 人 <button class="link" data-act="teamFilterClear">清除篩選</button>` : `共 ${m.length} 人`}</p>
    <div class="tsort"><span class="field-l" id="tsort-l">排序</span><div class="seg" role="group" aria-labelledby="tsort-l">${Object.keys(TEAM_SORT).map(k => `<button data-act="teamSort" data-k="${k}" aria-pressed="${k === f.sort}">${TEAM_SORT[k]}</button>`).join('')}</div><button class="btn sm ghost tdir" data-act="teamDir" aria-label="目前${f.dir === 'desc' ? '降冪' : '升冪'}，點一下切換">${f.dir === 'desc' ? '↓ 降冪' : '↑ 升冪'}</button></div></div>
  <ul class="list">${list.map(x => `<li><button class="lrow" data-act="openPerson" data-id="${x.p.id}"><span class="lbody"><span class="lmain"><strong>${esc(x.p.name)}</strong>${x.r.listed && x.r.role === '團長' ? '<span class="tag info">團長</span>' : ''}${statePill(x.r)}</span><span class="lmeta">${esc(x.p.region || '未設定區')}・${esc(x.r.skills.join('、') || '沒有排班崗位')}</span></span><span class="chev" aria-hidden="true">›</span></button></li>`).join('') || `<li><div class="lrow hint">${filtered ? '沒有符合條件的成員' : '目前沒有成員'}</div></li>`}</ul>
  <p class="hint">要讓某人退出或改崗位，點他的名字，在個人資料的「事工團與排班崗位」修改。</p>`;
}

/* ---------- 彈窗框架：每個任務都是 選擇 → 填寫 → 確認 ---------- */
const STEP_LABEL = {pick:'選擇', form:'填寫', preview:'確認'};
const SEC_TITLE = {care:'移動組員／牧養', acct:'帳號', teams:'事工團與排班崗位', display:'服事表稱呼', disable:'停用帳號'};
function closeModal(){ ms = null; document.getElementById('modal-root').innerHTML = ''; }
function renderModal(){
  if (!ms) return closeModal();
  const st = ms.steps[ms.i];
  const stepper = ms.steps.length > 1 ? `<div class="stepper">${ms.steps.map((s, i) => `<span class="${i === ms.i ? 'on' : i < ms.i ? 'done' : ''}">${i + 1} ${STEP_LABEL[s]}</span>`).join('<span aria-hidden="true">›</span>')}</div>` : '';
  let body = '';
  if (st === 'preview') {
    const p = currentPlan();
    body = `<p class="hint">下面列出會改到的每個地方，確認沒問題再執行。</p>${diffList(p.items)}${p.extra || ''}`;
  } else body = KINDS[ms.kind][st]();
  const first = ms.i === 0;
  const actions = st === 'preview'
    ? `<button class="btn secondary" data-act="${first ? 'close' : 'prev'}" ${ms.busy ? 'disabled' : ''}>${first ? '取消' : '回去修改'}</button><button class="btn primary${ms.busy ? ' cp-busy' : ''}" data-act="apply" ${ms.busy ? 'disabled aria-busy="true"' : ''}>${ms.busy ? '核對資料中…' : '確認執行'}</button>`
    : `<button class="btn secondary" data-act="${first ? 'close' : 'prev'}">${first ? '取消' : '上一步'}</button>${st === 'pick' && ms.autoNext ? '' : '<button class="btn primary" data-act="next">' + (ms.steps[ms.i + 1] === 'preview' ? '預覽變更' : '下一步') + '</button>'}`;
  const wait = ms.busy ? '<p class="hint" role="status">通常要 15 秒左右，請先不要關閉這個頁面；畫面最上方的綠色進度條跑完就好了。</p>' : '';
  document.getElementById('modal-root').innerHTML = `<div class="modal" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(modalTitle())}"><button class="x" data-act="close" aria-label="關閉">×</button>${stepper}<h2>${esc(modalTitle())}</h2>${body}${wait}<div class="mactions">${actions}</div></div></div>`;
}
function modalTitle(){
  const k = ms.kind;
  if (k === 'person') return SEC_TITLE[ms.sec] + (ms.pid ? '：' + nameOf(ms.pid) : '');
  if (k === 'group') return GROUP_ACTS[ms.action][0] + (ms.g ? '：' + ms.g : '');
  if (k === 'region') return REGION_ACTS[ms.action][0] + '：' + ms.r;
  if (k === 'team') return '換團長：' + ms.team;
  if (k === 'zonefix') return '統一排班用的區：' + nameOf(ms.pid);
  if (k === 'newGroup') return '新開小組';
  return '開新帳號';
}
function next(){
  const st = ms.steps[ms.i];
  const err = KINDS[ms.kind].validate(st);
  if (err) return toast(err, true);
  if (st === 'pick' && KINDS[ms.kind].enter) KINDS[ms.kind].enter();
  if (ms.steps[ms.i + 1] === 'preview' && !currentPlan().items.length) return toast('沒有任何變更', true);
  ms.i++; renderModal();
}
function currentPlan(){ return KINDS[ms.kind].plan(); }

function pickerHtml(label, f, filter){
  ms.pf = f; ms.pfilter = filter || null;
  const p = ms[f] ? byId(ms[f]) : null;
  if (p) return `<div class="field"><span class="field-l">${esc(label)}</span><div class="picked"><span class="pinfo"><strong>${esc(p.name)}</strong><span class="muted">${esc(p.region)}・${esc(p.group ? p.group + ' 小組' : '不屬於小組')}・${esc(p.emails[0])}</span></span><button class="btn sm ghost" data-act="unpick" data-f="${f}">更換</button></div></div>`;
  return `<div class="field"><label class="field-l" for="pk-q">${esc(label)}</label><input id="pk-q" type="search" placeholder="搜尋姓名或 email，再從清單點選" autocomplete="off" value="${esc(ms.pq || '')}"><div id="pk-results">${pickResultsHtml()}</div></div>`;
}
function pickResultsHtml(){
  const q = (ms.pq || '').trim();
  if (!q) return '';
  const r = search(q).filter(ms.pfilter || (() => true));
  if (!r.length) return `<p class="hint">找不到「${esc(q)}」。如果是新同工，請先開帳號。</p>`;
  return `<ul class="pk-list">${r.map(p => `<li><button class="lrow" data-act="pick" data-f="${ms.pf}" data-id="${p.id}"><span class="lbody"><span class="lmain"><strong>${hl(p.name, q)}</strong>${p.active ? '' : '<span class="tag">已停用</span>'}</span><span class="mono">${esc(p.region)}・${esc(p.group || '不屬於小組')}・${esc(p.emails[0])}</span></span></button></li>`).join('')}</ul>`;
}
function groupPickHtml(statusFilter){
  return `<div class="grid2">
    <div class="field"><label class="field-l" for="gp-r">區</label><select id="gp-r" data-ms="pr" data-rr>${regionOptions(ms.pr)}</select></div>
    <div class="field"><label class="field-l" for="gp-g">小組</label><select id="gp-g" data-ms="g">${groupOptionsIn(ms.pr, ms.g, {status:statusFilter, placeholder:'請選擇'})}</select></div>
  </div>`;
}

/* ---------- 任務：個人（移動、帳號、事工團、稱呼、停用） ---------- */
function personTask(sec, pid, extra){
  ms = Object.assign({kind:'person', sec, pid, steps: pid ? ['form','preview'] : ['pick','form','preview'], i:0, autoNext:true, quitAll:true, pending:[]}, extra || {});
  if (pid) KINDS.person.enter();
  renderModal();
}
function teamRowHtml(r, d){
  const t = esc(r.team);
  return `<div class="trow ${r.state}">
    <div class="trow-h"><strong>${t}</strong>${statePill(r)}<span class="spacer"></span>
      <div class="seg" role="group" aria-label="${t} 角色">${['團員','團長'].map(x => `<button data-act="trole" data-team="${t}" data-v="${x}" aria-pressed="${r.role === x}">${x}</button>`).join('')}</div>
    </div>
    <div class="field-l">排班崗位（點一下切換）</div>
    <div class="chips">${TEAMS[r.team].map(s => `<button class="chip" data-act="skill" data-s="${esc(s)}" aria-pressed="${d.skills.includes(s)}">${esc(s)}</button>`).join('')}</div>
    ${r.state === 'noSkill' ? '<p class="note warn">平台登記他在這團，但沒有任何排班崗位，所以不會排到他。請選崗位，或讓他退出這團。</p>' : ''}
    ${!r.listed && !r.skills.length ? '<p class="note">請點選他在這團的排班崗位。</p>' : ''}
    <div class="row-actions">
      <button class="btn sm danger" data-act="tquit" data-team="${t}">退出這團</button>
    </div>
  </div>`;
}
const KINDS = {};
KINDS.person = {
  pick(){ return pickerHtml('要處理哪一位同工？', 'pid', ms.sec === 'disable' ? (p => p.account && p.active) : null); },
  enter(){
    const d = clone(byId(ms.pid));
    if (ms.addTeam && !teamRows(d).some(r => r.team === ms.addTeam)) ms.pending = [ms.addTeam];
    ms.draft = d;
  },
  form(){
    const d = ms.draft;
    if (ms.sec === 'care') return `
      <div class="grid2">
        <div class="field"><label class="field-l" for="d-region">區</label><select id="d-region" data-dr="region" data-rr>${regionOptions(d.region)}</select></div>
        <div class="field"><label class="field-l" for="d-group">小組（只列 ${esc(d.region)} 的）</label><select id="d-group" data-dr="group">${groupOptionsIn(d.region, d.group)}</select></div>
      </div>
      <div class="field"><label class="field-l" for="d-role">職分</label><select id="d-role" data-dr="role" data-rr>${ROLES.map(r => `<option ${r === d.role ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      ${isZoneRole(d.role) ? `<div class="field"><span class="field-l">兼管區（同時擔任這些區的區長，可不選）</span><div class="chips">${regions.filter(r => r.name !== d.region).map(r => `<button class="chip" data-act="xregion" data-r="${esc(r.name)}" aria-pressed="${(d.extraRegions || []).includes(r.name)}">${esc(r.name)}</button>`).join('')}</div><p class="hint">他會在牧養視圖看到這些區的同工；排班仍只看主要的區。</p></div>` : ''}
      <p class="hint">先選區，小組選單就只剩那一區的幾組。換到別區時，原本的小組會清空。一次要移好幾個人，從「組織」點進小組勾選比較快。</p>
      ${d.member ? '' : '<p class="hint">他還沒登記小組。設定小組後會加進白名單（email 留空，不能登入），小組長和區長就看得到他的服事。</p>'}`;
    if (ms.sec === 'acct') return `
      <div class="field"><span class="field-l">登入用 email（可以有好幾個）</span>
        <div class="emails">${d.emails.map(e => `<div class="erow"><span>${esc(e)}</span>${d.emails.length > 1 ? `<button class="btn sm ghost" data-act="rmEmail" data-e="${esc(e)}" aria-label="移除 ${esc(e)}">移除</button>` : ''}</div>`).join('')}</div>
        <div class="inline"><input id="email-new" type="email" placeholder="再加一個 email" autocomplete="off"><button class="btn sm secondary" data-act="addEmail">加入</button></div>
      </div>
      <label class="switch"><input type="checkbox" data-dr="active" ${d.active ? 'checked' : ''}><span><strong>可以登入</strong><br><span class="hint">關掉＝暫停或離開教會，他登入會被擋下。</span></span></label>
      <label class="switch"><input type="checkbox" data-dr="staff" ${d.staff ? 'checked' : ''}><span><strong>全職同工</strong><br><span class="hint">勾了就有管理者權限，可以進這個管理後台。</span></span></label>`;
    if (ms.sec === 'teams') {
      const rows = teamRows(d, ms.pending), free = teamOrder.filter(t => !rows.some(r => r.team === t));
      return `<p class="hint">「團」決定他在平台上屬於哪團、是不是團長；「崗位」決定排班會不會排到他。退出時兩邊一起移除。</p>
        ${rows.length ? rows.map(r => teamRowHtml(r, d)).join('') : '<div class="empty"><p>還沒有加入任何事工團。</p></div>'}
        ${free.length ? `<div class="inline"><select id="team-new" aria-label="選擇要加入的事工團">${free.map(t => `<option>${esc(t)}</option>`).join('')}</select><button class="btn sm secondary" data-act="addTeam">加入這團</button></div>` : ''}`;
    }
    if (ms.sec === 'display') return `<div class="field"><label class="field-l" for="d-display">服事表上的稱呼</label><input id="d-display" type="text" data-dr="display" value="${esc(d.display)}"></div><p class="hint">要和服事表上寫的一模一樣，系統才偵測得到他的服事。</p>`;
    // disable
    const rows = teamRows(byId(ms.pid));
    return `<p>停用後 <strong>${esc(d.name)}</strong> 登入會被擋下。資料會保留，之後可以重新啟用。</p>
      ${rows.length ? `<label class="switch"><input type="checkbox" data-ms="quitAll" ${ms.quitAll ? 'checked' : ''}><span><strong>同時退出所有事工團</strong><br><span class="hint">他目前在：${esc(rows.map(r => r.team).join('、'))}。勾選後排班崗位一起拿掉，之後不會再排到他。</span></span></label>` : ''}`;
  },
  validate(st){
    if (st === 'pick') return ms.pid ? '' : '請搜尋並點選一位同工';
    if (st !== 'form') return '';
    if (ms.sec === 'teams') {
      const empty = (ms.pending || []).find(t => !ms.draft.skills.some(s => SKILL_TEAM[s] === t));
      if (empty) return `請點選他在「${empty}」的排班崗位，或按「退出這團」`;
    }
    if (ms.sec === 'disable') {
      const p = byId(ms.pid);
      if (!p.active) return '他已經是停用狀態';
      const d = clone(p); d.active = false;
      if (ms.quitAll) { d.teams = {}; d.skills = []; }
      ms.draft = d;
    }
    ms.draft.display = String(ms.draft.display || '').trim();
    if (!ms.draft.display) return '服事表稱呼不能空白';
    if (ms.draft.account && !ms.draft.emails.length) return '至少要留一個 email，他才能登入';
    return '';
  },
  plan(){
    const o = byId(ms.pid), d = ms.draft, items = personDiff(o, d);
    const warn = teamRows(d).filter(r => r.state === 'noSkill');
    return {title:`${d.name}：${items.map(i => i.label).join('、')}`, items,
      extra: warn.length ? `<div class="alert warn"><p>⚠ ${warn.map(r => esc(r.team)).join('、')}：平台有登記，但沒有排班崗位。儲存後會出現在首頁的「待核對」。</p></div>` : '',
      apply(){ people[people.indexOf(o)] = clone(d); }};
  }
};

/* ---------- 任務：小組（交棒、換組長、分殖、搬區、停用合併、移動組員） ---------- */
function groupTask(action, gname, extra){
  ms = Object.assign({kind:'group', action, g:gname || '', steps: gname ? ['form','preview'] : ['pick','form','preview'], i:0, pr:gname ? groupObj(gname).region : regions[0].name, ids:[]}, extra || {});
  if (gname) KINDS.group.enter();
  renderModal();
}
KINDS.group = {
  pick(){ return `<p class="hint">先選區，再選是哪一組。</p>${groupPickHtml(ms.action === 'enable' ? '停用' : '啟用')}`; },
  enter(){
    const g = groupObj(ms.g), a = ms.action;
    ms.pick = null; ms.pq = ''; ms.newName = ''; ms.demote = true;
    ms.tr = a === 'move' ? regions.find(r => r.name !== g.region).name : g.region;
    const sameRegion = groups.find(x => x.status === '啟用' && x.name !== g.name && x.region === g.region);
    ms.tg = a === 'disable' ? (sameRegion || groups.find(x => x.status === '啟用' && x.name !== g.name) || {}).name : '';
  },
  form(){
    const g = groupObj(ms.g), mem = membersOf(g.name), a = ms.action;
    const ol = byName(g.leader);
    const demoteBox = ol && ol.member && ol.role === '小組長' ? `<label class="switch"><input type="checkbox" data-ms="demote" ${ms.demote ? 'checked' : ''}><span>原小組長 ${esc(g.leader)} 的職分改回「一般同工」<br><span class="hint">他如果還帶別的組，會保留小組長職分。</span></span></label>` : '';
    if (a === 'rename') return `<div class="field"><label class="field-l" for="f-nn">新組名</label><input id="f-nn" type="text" data-ms="newName" value="${esc(ms.newName)}" placeholder="通常是新小組長的名字"></div>${pickerHtml('新小組長', 'pick', usable)}${demoteBox}`;
    if (a === 'leader') return pickerHtml('新小組長', 'pick', usable) + demoteBox;
    if (a === 'move') return `<div class="field"><label class="field-l" for="f-tr">搬到哪一區</label><select id="f-tr" data-ms="tr">${regions.filter(r => r.name !== g.region).map(r => `<option ${r.name === ms.tr ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div><p class="hint">這組的 ${mem.length} 位組員，區會一起改。</p>`;
    if (a === 'enable') return '<p class="hint">重新啟用後，這組會再出現在小組選單裡。</p>';
    if (a === 'disable') return mem.length ? `<p class="hint">這組還有 ${mem.length} 位組員，要全部併入另一組。這就是「合併小組」。</p>
      <div class="grid2"><div class="field"><label class="field-l" for="f-tr2">併入哪一區的</label><select id="f-tr2" data-ms="tr" data-rr>${regionOptions(ms.tr)}</select></div>
      <div class="field"><label class="field-l" for="f-tg">小組</label><select id="f-tg" data-ms="tg">${groupOptionsIn(ms.tr, ms.tg, {except:g.name, status:'啟用', placeholder:'請選擇'})}</select></div></div>` : '<p class="hint">這組沒有組員，可以直接停用。</p>';
    if (a === 'batchMove') return `<p>要移動的組員（${ms.ids.length} 位）：<strong>${esc(ms.ids.map(nameOf).join('、'))}</strong></p>
      <div class="grid2"><div class="field"><label class="field-l" for="f-tr3">移到哪一區的</label><select id="f-tr3" data-ms="tr" data-rr>${regionOptions(ms.tr)}</select></div>
      <div class="field"><label class="field-l" for="f-tg2">小組</label><select id="f-tg2" data-ms="tg">${groupOptionsIn(ms.tr, ms.tg, {except:g.name, status:'啟用', placeholder:'請選擇'})}</select></div></div>`;
    // split
    return `<div class="field"><label class="field-l" for="f-nn">新小組的組名</label><input id="f-nn" type="text" data-ms="newName" value="${esc(ms.newName)}" placeholder="通常用新小組長的名字"></div>
      <div class="field"><span class="field-l">新小組長（從這組點選）</span><div class="chips">${mem.filter(p => p.active).map(p => `<button class="chip" data-act="pick" data-f="pick" data-id="${p.id}" aria-pressed="${ms.pick === p.id}">${esc(p.name)}</button>`).join('')}</div>
        <p class="hint">新小組長如果不在這組，先用「移動組員」把他移過來。</p></div>
      <div class="field"><span class="field-l">要跟過去的組員（新小組長會自動算進去）</span>
        <div class="checks">${mem.map(p => `<label class="checkrow"><input type="checkbox" data-idbox="${p.id}" ${ms.ids.includes(p.id) || ms.pick === p.id ? 'checked' : ''} ${ms.pick === p.id ? 'disabled' : ''}><span>${esc(p.name)}${p.name === g.leader ? '（現任小組長）' : ''}</span></label>`).join('')}</div></div>
      <div class="field"><label class="field-l" for="f-tr4">新小組屬於哪一區</label><select id="f-tr4" data-ms="tr">${regionOptions(ms.tr)}</select></div>`;
  },
  validate(st){
    if (st === 'pick') return ms.g ? '' : '請選是哪一組';
    if (st !== 'form') return '';
    const g = groupObj(ms.g), a = ms.action;
    ms.newName = String(ms.newName || '').trim();
    if (a === 'rename' || a === 'split') {
      if (!ms.newName) return a === 'split' ? '請填新小組的組名' : '請填新組名';
      if (ms.newName === g.name) return '新組名和現在一樣；只換小組長請用「只換小組長」';
      const c = nameTaken(ms.newName, a === 'rename' ? g : null);
      if (c) return `「${ms.newName}」已經被 ${c.name} 小組用過（含舊名），請換一個`;
    }
    if ((a === 'rename' || a === 'leader' || a === 'split') && !ms.pick) return a === 'split' ? '請點選新小組長' : '請搜尋並點選新小組長';
    if (a === 'leader' && byId(ms.pick).name === g.leader) return '選到的就是現在的小組長';
    if ((a === 'disable' && membersOf(g.name).length || a === 'batchMove') && !ms.tg) return '請選要移到哪一組';
    return '';
  },
  plan(){ return groupPlan(); }
};
function leaderItems(g, nl, demote){
  if (nl.name === g.leader) return [];
  const ol = byName(g.leader);
  const fx = [`${nl.name} 會在牧養視圖看到這組的組員`];
  if (g.leader) fx.push(`${g.leader} 不再看到這組`);
  if (!isLeaderRole(nl.role)) fx.push(`${nl.name} 的職分：${nl.role || '一般同工'} → 小組長`);
  if (!nl.member) fx.push(`${nl.name} 登記到白名單（email 留空）`);
  if (!nl.account) fx.push({w:`${nl.name} 沒有平台帳號，自己看不到牧養視圖；需要時再幫他開帳號`});
  if (nl.member && nl.group !== g.name) fx.push({w:`${nl.name} 目前在「${nl.group || '無小組'}」，他本人的小組不會自動改`});
  if (demote && ol && ol.member && ol.role === '小組長') fx.push(leadsOther(ol.name, g.name) ? `${ol.name} 還帶別的組，職分保留小組長` : `${ol.name} 的職分：小組長 → 一般同工`);
  return [{label:'小組長', before:g.leader || '（未設定）', after:nl.name, fx}];
}
function setLeader(g, nl, demote){
  if (nl.name === g.leader) return;
  const ol = byName(g.leader);
  g.leader = nl.name;
  ensureMember(nl, g.region);
  if (!isLeaderRole(nl.role)) nl.role = '小組長';
  if (demote && ol && ol.member && ol.role === '小組長' && !leadsOther(ol.name, g.name)) ol.role = '一般同工';
}
function groupPlan(){
  const g = groupObj(ms.g), mem = membersOf(g.name), a = ms.action, o = state.org;
  if (a === 'rename') {
    const nl = byId(ms.pick), nn = ms.newName;
    return {title:`${g.name} 交棒並改名為 ${nn}`, items:[
      {label:'組名', before:g.name, after:nn, fx:[`小組分頁的「舊名」欄記下「${g.name}」，還寫著舊名的資料也認得`]},
      {label:'組員的小組欄', after:`${mem.length} 位改成「${nn}」`, fx:mem.length ? [mem.map(p => p.name).join('、')] : []},
      ...leaderItems(g, nl, ms.demote)
    ], apply(){ const old = g.name; mem.forEach(p => p.group = nn); g.old.push(old); g.name = nn; setLeader(g, nl, ms.demote); if (o.group === old) o.group = nn; }};
  }
  if (a === 'leader') { const nl = byId(ms.pick); return {title:`${g.name} 換小組長`, items:leaderItems(g, nl, ms.demote), apply(){ setLeader(g, nl, ms.demote); }}; }
  if (a === 'move') {
    const tr = ms.tr, fx = [`區長視圖：${headName(g.region)} 不再看到這組，改由 ${headName(tr)} 看到`];
    if (districtOf(g.region) !== districtOf(tr)) fx.push(`督區：${districtOf(g.region)} → ${districtOf(tr)}`);
    return {title:`${g.name} 搬到 ${tr}`, items:[
      {label:'小組所屬區', before:g.region, after:tr, fx},
      {label:'組員的區欄', after:`${mem.length} 位改成「${tr}」`, fx:mem.length ? [mem.map(p => p.name).join('、')] : []}
    ], apply(){ g.region = tr; mem.forEach(p => p.region = tr); }};
  }
  if (a === 'enable') return {title:`重新啟用 ${g.name}`, items:[{label:'小組狀態', before:'停用', after:'啟用', fx:['重新出現在小組選單']}], apply(){ g.status = '啟用'; }};
  if (a === 'disable') {
    const tg = ms.tg ? groupObj(ms.tg) : null;
    const items = [{label:'小組狀態', before:'啟用', after:'停用', fx:['小組分頁這一列保留，只把狀態改成停用', '之後不會出現在小組選單']}];
    if (mem.length && tg) {
      const fx = [mem.map(p => p.name).join('、'), `改由 ${tg.leader || '新組的小組長'} 看到這些組員`];
      if (tg.region !== g.region) fx.push(`他們的區也從 ${g.region} 改成 ${tg.region}`);
      items.push({label:'組員併入', after:`${mem.length} 位 → ${tg.name}`, fx});
    }
    const ol = byName(g.leader);
    if (ol && ol.member && ol.role === '小組長' && !leadsOther(ol.name, g.name)) items.push({label:'原小組長', after:ol.name, fx:[{w:'職分仍是小組長，如需調整請到他的個人資料'}]});
    return {title:mem.length && tg ? `${g.name} 併入 ${tg.name}` : `停用 ${g.name}`, items, apply(){ g.status = '停用'; if (tg) mem.forEach(p => { p.group = tg.name; p.region = tg.region; }); o.pick = []; }};
  }
  if (a === 'batchMove') {
    const tg = groupObj(ms.tg), movers = ms.ids.map(byId).filter(Boolean);
    const fx = [movers.map(p => p.name).join('、'), '白名單「小組」欄更新', `牧養視圖：${g.leader || '原小組長'} 不再看到他們，改由 ${tg.leader || '新組的小組長'} 看到`];
    if (tg.region !== g.region) fx.push(`他們的區也從 ${g.region} 改成 ${tg.region}`);
    const items = [{label:'移動組員', before:g.name, after:`${tg.name}（${movers.length} 位）`, fx}];
    const lm = movers.find(p => p.name === g.leader);
    if (lm) items.push({label:'注意', after:`${lm.name} 是 ${g.name} 的小組長`, fx:[{w:'他移走後仍是這組的小組長；要換人請另外做「小組交棒」或「只換小組長」'}]});
    return {title:`${movers.length} 位從 ${g.name} 移到 ${tg.name}`, items, apply(){ movers.forEach(p => { p.group = tg.name; p.region = tg.region; }); o.pick = []; }};
  }
  // split
  const nl = byId(ms.pick), nn = ms.newName, tr = ms.tr;
  const ids = [...new Set([...ms.ids, nl.id])], movers = ids.map(byId), remain = mem.filter(p => !ids.includes(p.id));
  const lf = [`${nl.name} 會在牧養視圖看到新組的組員`];
  if (!isLeaderRole(nl.role)) lf.unshift(`職分：${nl.role} → 小組長`);
  return {title:`${g.name} 分殖出 ${nn}`, items:[
    {label:'小組分頁新增一列', after:`${nn}（${tr}・${districtOf(tr)}）`, fx:[`小組長：${nl.name}`]},
    {label:`從 ${g.name} 移到 ${nn}`, after:`${movers.length} 位`, fx:[movers.map(p => p.name).join('、'), '白名單「小組」欄改成新組名', ...(tr !== g.region ? [`他們的區也從 ${g.region} 改成 ${tr}`] : [])]},
    {label:`${g.name} 留下`, after:`${remain.length} 位`, fx:remain.length ? [remain.map(p => p.name).join('、')] : [{w:'原組沒有人了，可以考慮改用「停用或合併」'}]},
    {label:nl.name, after:'新小組長', fx:lf}
  ], apply(){ groups.push({name:nn, district:districtOf(tr), region:tr, leader:nl.name, status:'啟用', old:[]}); movers.forEach(p => { p.group = nn; p.region = tr; }); if (!isLeaderRole(nl.role)) nl.role = '小組長'; o.pick = []; }};
}

/* ---------- 任務：新開小組（可同時開新的區） ---------- */
function newGroupTask(region){
  ms = {kind:'newGroup', steps:['form','preview'], i:0, tr:region || regions[0].name, moveLeader:true, newName:'', nr:'', nd:'', ndn:'', nw:''};
  renderModal();
}
KINDS.newGroup = {
  form(){
    const ds = districts();
    return `<div class="field"><label class="field-l" for="f-nn">組名</label><input id="f-nn" type="text" data-ms="newName" value="${esc(ms.newName)}" placeholder="通常用小組長的名字，例如：宗翰B"></div>
    <div class="field"><label class="field-l" for="f-tr">屬於哪一區</label><select id="f-tr" data-ms="tr" data-rr>${regionOptions(ms.tr)}<option value="__new" ${ms.tr === '__new' ? 'selected' : ''}>＋ 新的區…</option></select></div>
    ${ms.tr === '__new' ? `<div class="subform">
      <div class="field"><label class="field-l" for="f-nr">新區名</label><input id="f-nr" type="text" data-ms="nr" value="${esc(ms.nr)}" placeholder="通常用區長的名字，例如：宗翰區"></div>
      <div class="field"><label class="field-l" for="f-nd">屬於哪個督區</label><select id="f-nd" data-ms="nd" data-rr><option value="">請選擇</option>${ds.map(d => `<option ${d === ms.nd ? 'selected' : ''}>${esc(d)}</option>`).join('')}<option value="__new" ${ms.nd === '__new' ? 'selected' : ''}>＋ 新的督區…</option></select></div>
      ${ms.nd === '__new' ? `<div class="field"><label class="field-l" for="f-ndn">新督區名稱</label><input id="f-ndn" type="text" data-ms="ndn" value="${esc(ms.ndn)}"></div>` : ''}
      <div class="field"><label class="field-l" for="f-nw">牧區限制（由牧師決定）</label><select id="f-nw" data-ms="nw"><option value="">請選擇</option>${WEEK_OPTS.map(w => `<option value="${w}" ${String(w) === String(ms.nw) ? 'selected' : ''}>${weekLabel(w)}</option>`).join('')}</select></div>
      <p class="hint">會寫進服事表「設定」分頁，排班時這一區的人在那一週不會被排到。還沒決定就先選「不限制」，之後在這區的設定裡改。</p>
    </div>` : ''}
    ${pickerHtml('小組長', 'pick', usable)}
    <label class="switch"><input type="checkbox" data-ms="moveLeader" ${ms.moveLeader ? 'checked' : ''}><span>把小組長本人也移到這組</span></label>`;
  },
  validate(){
    ['newName','nr','ndn'].forEach(k => ms[k] = String(ms[k] || '').trim());
    if (!ms.newName) return '請填組名';
    const c = nameTaken(ms.newName, null);
    if (c) return `「${ms.newName}」已經被 ${c.name} 小組用過（含舊名），請換一個`;
    if (ms.tr === '__new') {
      if (!ms.nr) return '請填新區名';
      if (regions.some(r => r.name === ms.nr)) return `已經有「${ms.nr}」這個區了，請直接在區選單選它`;
      if (!ms.nd) return '請選新區屬於哪個督區';
      if (ms.nd === '__new' && !ms.ndn) return '請填新督區名稱';
      if (ms.nd === '__new' && districts().includes(ms.ndn)) return `已經有「${ms.ndn}」這個督區了，請直接選它`;
      if (ms.nw === '') return '請選牧區限制；還沒決定就選「不限制」';
    }
    if (!ms.pick) return '請搜尋並點選小組長';
    return '';
  },
  plan(){
    const isNew = ms.tr === '__new';
    const region = isNew ? ms.nr : ms.tr, district = isNew ? (ms.nd === '__new' ? ms.ndn : ms.nd) : districtOf(ms.tr);
    const nl = byId(ms.pick), items = [];
    if (isNew) items.push({label:'新增區', after:`${region}（${district}）`, fx:[
      ...(ms.nd === '__new' ? [`同時新增督區「${district}」`] : []),
      `服事表「設定」分頁新增牧區限制：${region}・${weekLabel(ms.nw)}`,
      '排班表的牧區下拉選單加入這一區',
      {w:'區長：之後把某人的職分設為區長，區選這一區即可'}]});
    items.push({label:'小組分頁新增一列', after:`${ms.newName}（${region}・${district}）`, fx:[`小組長：${nl.name}`]});
    const fx = [];
    if (!nl.member) fx.push('登記到白名單（email 留空）');
    if (!isLeaderRole(nl.role)) fx.push(`職分：${nl.role || '一般同工'} → 小組長`);
    if (ms.moveLeader) fx.push(`他的小組：${nl.group || '無'} → ${ms.newName}`);
    if (ms.moveLeader && nl.region !== region) fx.push(`他的區：${nl.region || '未設定'} → ${region}`);
    if (!nl.account) fx.push({w:`${nl.name} 沒有平台帳號，自己看不到牧養視圖；需要時再幫他開帳號`});
    if (fx.length) items.push({label:nl.name, after:'個人資料一起更新', fx});
    const nn = ms.newName, w = +ms.nw, move = ms.moveLeader;
    return {title:isNew ? `新增 ${region}與 ${nn} 小組` : `新開 ${nn} 小組`, items, apply(){
      if (isNew) regions.push({name:region, district, week:w, inSettings:false});
      groups.push({name:nn, district, region, leader:nl.name, status:'啟用', old:[]});
      ensureMember(nl, region);
      if (!isLeaderRole(nl.role)) nl.role = '小組長';
      if (move) { nl.group = nn; nl.region = region; }
    }};
  }
};

/* ---------- 任務：區（改名、督區、牧區限制） ---------- */
function regionTask(action){
  const r = regionObj(state.org.region);
  ms = {kind:'region', action, r:r.name, steps:['form','preview'], i:0, rn:'', rd:districts().find(d => d !== r.district) || '__new', rdn:'', rw:String(r.week), rt:(regions.find(x => x.name !== r.name && x.inSettings) || {}).name || ''};
  renderModal();
}
KINDS.region = {
  form(){
    const r = regionObj(ms.r), a = ms.action;
    if (a === 'rename') return `<div class="field"><label class="field-l" for="f-rn">新區名</label><input id="f-rn" type="text" data-ms="rn" value="${esc(ms.rn)}"></div><p class="hint">區名寫在好幾個地方，這裡會一次全部改掉，不會留下舊名。</p>`;
    if (a === 'dissolve') {
      const gs = groups.filter(g => g.region === r.name), ps = regionPeople(r.name);
      if (gs.length) return `<div class="alert warn"><p>這區還有 ${gs.length} 個小組（${esc(gs.map(g => g.name).join('、'))}），要先把小組搬到別區，或停用併入別組，才能解散。</p></div>`;
      return `${ps.length ? `<p>這區還有 ${ps.length} 位同工：<strong>${esc(ps.map(p => p.name).join('、'))}</strong></p>
        <div class="field"><label class="field-l" for="f-rt">全部移到哪一區</label><select id="f-rt" data-ms="rt">${regions.filter(x => x.name !== r.name).map(x => `<option ${x.name === ms.rt ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <p class="hint">要分到不同的區，請先點進個人資料一個一個改，剩下的再用這裡一次移。</p>` : '<p class="hint">這區已經沒有同工，可以直接解散。</p>'}
        <p class="hint">解散後，服事表「設定」裡這一區的牧區限制會移除，排班下拉選單也不再有這一區。</p>`;
    }
    if (a === 'district') return `<div class="field"><label class="field-l" for="f-rd">改到哪個督區</label><select id="f-rd" data-ms="rd" data-rr>${districts().filter(d => d !== r.district).map(d => `<option ${d === ms.rd ? 'selected' : ''}>${esc(d)}</option>`).join('')}<option value="__new" ${ms.rd === '__new' ? 'selected' : ''}>＋ 新的督區…</option></select></div>${ms.rd === '__new' ? `<div class="field"><label class="field-l" for="f-rdn">新督區名稱</label><input id="f-rdn" type="text" data-ms="rdn" value="${esc(ms.rdn)}"></div>` : ''}`;
    return `<div class="field"><label class="field-l" for="f-rw">牧區限制（由牧師決定）</label><select id="f-rw" data-ms="rw">${WEEK_OPTS.map(w => `<option value="${w}" ${String(w) === String(ms.rw) ? 'selected' : ''}>${weekLabel(w)}</option>`).join('')}</select></div><p class="hint">目前：${esc(weekLabel(r.week))}</p>`;
  },
  validate(){
    const r = regionObj(ms.r);
    ms.rn = String(ms.rn || '').trim(); ms.rdn = String(ms.rdn || '').trim();
    if (ms.action === 'rename') {
      if (!ms.rn) return '請填新區名';
      if (ms.rn === r.name) return '新區名和現在一樣';
      if (regions.some(x => x.name === ms.rn)) return `已經有「${ms.rn}」這個區了，請換一個`;
    }
    if (ms.action === 'district' && ms.rd === '__new') {
      if (!ms.rdn) return '請填新督區名稱';
      if (districts().includes(ms.rdn)) return `已經有「${ms.rdn}」這個督區了，請直接選它`;
    }
    if (ms.action === 'week' && +ms.rw === +r.week) return '和現在的設定一樣';
    if (ms.action === 'dissolve') {
      if (groups.some(g => g.region === r.name)) return '這區還有小組，請先把小組搬走或合併';
      if (regionPeople(r.name).length && !ms.rt) return '請選同工要移到哪一區';
    }
    return '';
  },
  plan(){
    const r = regionObj(ms.r), gs = groups.filter(g => g.region === r.name), ps = people.filter(p => p.region === r.name), o = state.org;
    if (ms.action === 'rename') {
      const nn = ms.rn;
      return {title:`${r.name} 改名為 ${nn}`, items:[
        {label:'區名', before:r.name, after:nn},
        {label:'白名單「區」欄', after:`${ps.length} 位改成「${nn}」`, fx:[ps.map(p => p.name).join('、')]},
        {label:'小組分頁「區」欄', after:`${gs.length} 組`, fx:[gs.map(g => g.name).join('、')]},
        ...(people.some(p => (p.extraRegions || []).includes(r.name)) ? [{label:'白名單「兼管區」欄', after:people.filter(p => (p.extraRegions || []).includes(r.name)).map(p => p.name).join('、'), fx:[`兼管區裡的「${r.name}」改成「${nn}」`]}] : []),
        {label:'同工資料庫「所屬牧區」', after:`${ps.length} 位一起改`, fx:['儲存後馬上同步，不用等每晚 04:00']},
        {label:'服事表「設定」牧區限制', after:`${r.name} → ${nn}`, fx:[`限制照舊：${weekLabel(r.week)}`, '排班表的牧區下拉選單一起更新', {w:'漏改這裡的話，排班會找不到這區的限制，把人排到不該排的那一週，所以這一步一定一起做'}]}
      ], apply(){ const old = r.name; ps.forEach(p => p.region = nn); people.forEach(p => { if (p.dbRegion === old) p.dbRegion = nn; if ((p.extraRegions || []).includes(old)) p.extraRegions = p.extraRegions.map(z => z === old ? nn : z); }); gs.forEach(g => g.region = nn); r.name = nn; if (o.region === old) o.region = nn; }};
    }
    if (ms.action === 'district') {
      const nd = ms.rd === '__new' ? ms.rdn : ms.rd;
      return {title:`${r.name} 改到 ${nd}`, items:[{label:'督區', before:r.district, after:nd, fx:[...(ms.rd === '__new' ? [`新增督區「${nd}」`] : []), `小組分頁 ${gs.length} 組的「督區」欄一起改：${gs.map(g => g.name).join('、')}`]}], apply(){ r.district = nd; }};
    }
    if (ms.action === 'dissolve') {
      const rp = regionPeople(r.name), rt = ms.rt;
      const items = [];
      if (rp.length) {
        const fx = [rp.map(p => p.name).join('、'), '白名單「區」與同工資料庫「所屬牧區」更新，各團分頁的區一起改'];
        const own = rp.filter(p => p.member && p.region !== r.name && p.dbRegion === r.name);
        if (own.length) fx.push(`${own.map(p => p.name).join('、')} 有帳號，排班用的區改回他們白名單上的區`);
        const wt = (regionObj(rt) || {}).week;
        if (wt !== r.week) fx.push({w:`牧區限制從「${weekLabel(r.week)}」變成「${weekLabel(wt)}」，已排好的班不會自動重排，請主責檢查`});
        if (rp.some(p => (p.extraRegions || []).includes(r.name))) fx.push('兼管這區的區長，兼管區裡拿掉這一區');
        items.push({label:'同工移到', after:`${rt}（${rp.length} 位）`, fx});
      }
      items.push({label:'解散區', before:r.name, after:'（移除）', fx:r.inSettings ? ['服事表「設定」移除這一區的牧區限制', '排班表的牧區下拉選單不再有這一區'] : ['這一區不在服事表的牧區清單，只需要把人移走']});
      return {title:`解散 ${r.name}`, items, apply(){
        const z = r.name;
        people.forEach(p => {
          if (p.region === z) p.region = rt;
          if (p.dbRegion === z) p.dbRegion = rt;
          if ((p.extraRegions || []).includes(z)) p.extraRegions = p.extraRegions.filter(x => x !== z && x !== p.region);
        });
        regions = regions.filter(x => x !== r);
      }};
    }
    const nw = +ms.rw;
    return {title:`${r.name} 牧區限制改為${weekLabel(nw)}`, items:[{label:'牧區限制', before:weekLabel(r.week), after:weekLabel(nw), fx:['服事表「設定」分頁更新', {w:'已經排好的班不會自動重排，請主責檢查' + (nw ? `第 ${nw} 週有沒有排到這區的人` : '之後的班表')}]}], apply(){ r.week = nw; }};
  }
};

/* ---------- 任務：排班用的區統一成白名單的區 ---------- */
KINDS.zonefix = {
  plan(){
    const p = byId(ms.pid), from = p.dbRegion, to = p.region;
    const wf = (regionObj(from) || {}).week, wt = (regionObj(to) || {}).week;
    const fx = ['同工資料庫「所屬牧區」更新', '他所在的各團分頁，區一起改'];
    if (wf !== wt) fx.push({w:`牧區限制從「${weekLabel(wf)}」變成「${weekLabel(wt)}」，已排好的班不會自動重排，請主責檢查`});
    return {title:`${p.name}：排班用的區統一成${to}`, items:[{label:'排班用的區', before:from, after:to, fx}], apply(){ byName(p.name).dbRegion = to; }};
  }
};

/* ---------- 任務：換團長 ---------- */
KINDS.team = {
  form(){
    const m = teamMembers(ms.team), heads = m.filter(x => x.r.listed && x.r.role === '團長');
    return `<div class="field"><span class="field-l">新團長（從成員點選）</span><div class="chips">${m.map(x => `<button class="chip" data-act="pick" data-f="pick" data-id="${x.p.id}" aria-pressed="${ms.pick === x.p.id}">${esc(x.p.name)}${x.r.role === '團長' && x.r.listed ? '（現任）' : ''}</button>`).join('')}</div></div>
      ${heads.length ? `<label class="switch"><input type="checkbox" data-ms="demote" ${ms.demote ? 'checked' : ''}><span>現任團長 ${esc(heads.map(x => x.p.name).join('、'))} 改為團員<br><span class="hint">不勾的話會變成多位團長，一團可以有好幾位。</span></span></label>` : ''}
      <p class="hint">新團長要先是這團的成員；不是的話先用「加入成員」。</p>`;
  },
  validate(){
    if (!ms.pick) return '請點選新團長';
    const p = byId(ms.pick);
    if (p.teams[ms.team] && p.teams[ms.team].role === '團長') return '他已經是團長';
    return '';
  },
  plan(){
    const t = ms.team, nl = byId(ms.pick), heads = teamMembers(t).filter(x => x.r.listed && x.r.role === '團長').map(x => x.p);
    const fx = [nl.teams[t] ? '帳號管理表「事工團」分頁他的角色改為團長' : '帳號管理表「事工團」分頁新增他這一列（角色：團長）', `${nl.name} 會看到${t}的團長班表（含缺人提醒）`];
    if (heads.length) fx.push(ms.demote ? `${heads.map(p => p.name).join('、')} 改為團員，不再看到團長班表` : `${heads.map(p => p.name).join('、')} 仍是團長`);
    const demote = ms.demote;
    return {title:`${t} 團長改為 ${nl.name}`, items:[{label:'團長', before:heads.map(p => p.name).join('、') || '（無）', after:nl.name, fx}], apply(){ nl.teams[t] = {role:'團長'}; if (demote) heads.forEach(p => p.teams[t].role = '團員'); }};
  }
};

/* ---------- 任務：開新帳號 ---------- */
function newAcctTask(q, preset){
  q = (q || '').trim();
  const isEmail = q.includes('@');
  ms = Object.assign({kind:'newAcct', steps:['form','preview'], i:0, name:isEmail ? '' : q, email:isEmail ? q : '', display:!isEmail && q.length >= 3 ? q.slice(1) : '', region:regions[0].name, group:'', role:'一般同工'}, preset || {});
  renderModal();
}
KINDS.newAcct = {
  form(){
    const same = people.filter(p => p.name === String(ms.name || '').trim());
    return `<div class="grid2">
      <div class="field"><label class="field-l" for="n-name">姓名（全名）</label><input id="n-name" type="text" data-ms="name" data-rr value="${esc(ms.name)}"></div>
      <div class="field"><label class="field-l" for="n-disp">服事表稱呼</label><input id="n-disp" type="text" data-ms="display" value="${esc(ms.display)}" placeholder="例如：怡君"></div>
    </div>
    ${same.length && same[0].account ? `<div class="alert warn"><p>「${esc(ms.name.trim())}」已經有平台帳號（${esc(same[0].group || '不屬於小組')}・${esc(same[0].emails[0] || '')}）。</p><p>系統用姓名辨識同工，同名的兩個人無法分開；如果真的是不同的人，請在姓名後面加註，例如「${esc(ms.name.trim())}B」。</p><p><button class="btn sm ghost" data-act="openPerson" data-id="${same[0].id}">打開他的資料</button></p></div>` : ''}
    ${same.length && !same[0].account ? `<div class="alert warn"><p>同工資料庫已經有「${esc(ms.name.trim())}」（${esc(same[0].region || '未設定區')}），還沒有帳號。會直接幫他開帳號，不會多出一個人。</p></div>` : ''}
    <div class="field"><label class="field-l" for="n-email">登入用 email</label><input id="n-email" type="email" data-ms="email" value="${esc(ms.email)}" placeholder="他登入用的 Google 帳號"></div>
    <div class="grid2">
      <div class="field"><label class="field-l" for="n-region">區</label><select id="n-region" data-ms="region" data-rr>${regionOptions(ms.region)}</select></div>
      <div class="field"><label class="field-l" for="n-group">小組（只列 ${esc(ms.region)} 的）</label><select id="n-group" data-ms="group">${groupOptionsIn(ms.region, ms.group)}</select></div>
    </div>
    <div class="field"><label class="field-l" for="n-role">職分</label><select id="n-role" data-ms="role">${ROLES.map(r => `<option ${r === ms.role ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    <p class="hint">開好後會直接打開他的個人資料，可以接著加入事工團、設定排班崗位。</p>`;
  },
  validate(){
    ['name','display','email'].forEach(k => ms[k] = String(ms[k] || '').trim());
    if (!ms.name) return '請填姓名';
    if (!ms.display) return '請填服事表稱呼，要和服事表上寫的一樣';
    if (!EMAIL_RE.test(ms.email)) return 'email 格式不對，請檢查有沒有打錯';
    const owner = people.find(p => p.emails.includes(ms.email));
    if (owner) return `這個 email 已經是 ${owner.name}（${owner.group || '無小組'}）的帳號，請直接打開他的資料`;
    const same = byName(ms.name);
    if (same && same.account) { renderModal(); return `「${ms.name}」已經有平台帳號；同名的人請在姓名後面加註`; }
    return '';
  },
  plan(){
    const v = {...ms}, existing = byName(v.name);
    const fx = [`email：${v.email}`, `區：${v.region}・小組：${v.group || '無'}・職分：${v.role}`, `服事表稱呼：${v.display}`, '啟用＝TRUE，他現在就能登入'];
    if (existing) fx.push('他原本在同工資料庫的崗位與排班資料不變');
    return {title:`開新帳號：${v.name}`, items:[{label:'白名單新增一列', after:v.name, fx}],
      apply(){
        const p = byName(v.name);
        if (p) Object.assign(p, {account:true, member:true, emails:[v.email.toLowerCase()], active:true, region:v.region, group:v.group, role:v.role, display:v.display});
        else people.push({id:idFor(v.name), name:v.name, display:v.display, emails:[v.email.toLowerCase()], region:v.region, group:v.group, role:v.role, account:true, member:true, active:true, staff:false, teams:{}, skills:[]});
        ms.newId = idFor(v.name);
      }};
  }
};

/* ---------- 事件 ---------- */
function openPerson(id){
  if (state.tab === 'people') { state.sel = id; state.peek = null; }
  else state.peek = {id, y:window.scrollY};
  closeModal(); render(); toTop();
}
function orgGo(patch){ state.tab = 'org'; state.peek = null; Object.assign(state.org, {region:null, group:null, team:null, pick:[]}, patch); closeModal(); render(); toTop(); }
const H = {
  tab(b){ const k = b.dataset.k; state.peek = null; if (state.tab === k) { if (k === 'people') state.sel = null; if (k === 'org') Object.assign(state.org, {region:null, group:null, team:null, pick:[]}); } state.tab = k; render(); toTop(); },
  goOrg(){ orgGo({mode:'care'}); },
  task(b){
    const k = b.dataset.t;
    const personSec = {move:'care', teams:'teams', disable:'disable'};
    const groupAct = {split:'split', handover:'rename', moveGroup:'move', leader:'leader', disableGroup:'disable'};
    if (personSec[k]) return personTask(personSec[k], null);
    if (groupAct[k]) return groupTask(groupAct[k], null);
    if (k === 'newGroup') return newGroupTask(state.tab === 'org' && state.org.region ? state.org.region : null);
    if (k === 'newAcct') return newAcctTask('');
  },
  newAcctQ(){ newAcctTask(state.q); },
  openAcct(){ const p = byId(curPid()); newAcctTask('', {name:p.name, display:p.display, region:p.region || regions[0].name}); },
  allLog(){ state.allLog = !state.allLog; render(); },
  openPerson(b){ openPerson(+b.dataset.id); },
  backSearch(){ state.sel = null; render(); toTop(); },
  backPeek(){ const y = state.peek.y; state.peek = null; render(); window.scrollTo(0, y); },
  editSec(b){ personTask(b.dataset.s, curPid()); },
  fixZone(){ ms = {kind:'zonefix', pid:curPid(), steps:['preview'], i:0}; renderModal(); },
  orgMode(b){ orgGo({mode:b.dataset.m}); },
  openRegionPage(b){ orgGo({mode:'care', region:b.dataset.r}); },
  openGroupPage(b){ const g = groupObj(b.dataset.g); orgGo({mode:'care', region:g.region, group:g.name}); },
  openTeamPage(b){ orgGo({mode:'team', team:b.dataset.t, tf:{skill:'', region:'', sort:state.org.tf.sort, dir:state.org.tf.dir}}); },
  teamSort(b){ state.org.tf.sort = b.dataset.k; try { localStorage.setItem('adminTeamSort', b.dataset.k); } catch (x) { } render(); },
  teamDir(){ const f = state.org.tf; f.dir = f.dir === 'desc' ? 'asc' : 'desc'; try { localStorage.setItem('adminTeamDir', f.dir); } catch (x) { } render(); },
  teamFilterClear(){ Object.assign(state.org.tf, {skill:'', region:''}); render(); },
  orgUp(){ const o = state.org; if (o.group) { o.group = null; o.pick = []; } else if (o.region) o.region = null; else o.team = null; render(); toTop(); },
  regionAct(b){ regionTask(b.dataset.a); },
  newGroupHere(){ newGroupTask(state.org.region); },
  groupAct(b){ groupTask(b.dataset.a, state.org.group); },
  pickAll(){ const o = state.org, mem = membersOf(o.group).map(p => p.id); o.pick = mem.every(id => o.pick.includes(id)) ? [] : mem; render(); },
  clearPick(){ state.org.pick = []; render(); },
  pickMove(){ groupTask('batchMove', state.org.group, {ids:[...state.org.pick]}); },
  pickSplit(){ groupTask('split', state.org.group, {ids:[...state.org.pick]}); },
  teamLead(){ ms = {kind:'team', team:state.org.team, steps:['form','preview'], i:0, pick:null, demote:true}; renderModal(); },
  teamAdd(){ personTask('teams', null, {addTeam:state.org.team}); },
  close(){ if (ms && ms.busy) return; closeModal(); },
  scrim(b, e){ if (e.target === b && !(ms && ms.busy)) closeModal(); },
  next(){ next(); },
  prev(){ ms.i--; renderModal(); },
  apply(){
    if (ms.busy) return;
    const p = currentPlan(), kind = ms.kind;
    ms.busy = true; renderModal();
    commit(p.title, p.items, p.apply).then(done => {
      if (!ms) return;
      if (!done) { ms.busy = false; renderModal(); return; }
      const newId = ms.newId;
      closeModal(); fixRefs();
      if (kind === 'newAcct') return openPerson(newId);
      render();
    });
  },
  pick(b){
    const f = b.dataset.f, id = +b.dataset.id;
    ms[f] = id;
    if (ms.kind === 'group' && ms.action === 'split' && !ms.ids.includes(id)) ms.ids.push(id);
    if (ms.steps[ms.i] === 'pick' && ms.autoNext) return next();
    renderModal();
  },
  unpick(b){ ms[b.dataset.f] = null; ms.pq = ''; renderModal(); setTimeout(() => { const i = document.getElementById('pk-q'); if (i) i.focus(); }); },
  // 個人資料編輯（作用在 ms.draft）
  rmEmail(b){ ms.draft.emails = ms.draft.emails.filter(e => e !== b.dataset.e); renderModal(); },
  addEmail(){
    const v = document.getElementById('email-new').value.trim();
    if (!EMAIL_RE.test(v)) return toast('email 格式不對，請檢查有沒有打錯', true);
    const owner = people.find(p => p.id !== ms.pid && p.emails.includes(v));
    if (owner) return toast(`這個 email 已經是 ${owner.name}（${owner.group || '無小組'}）的帳號`, true);
    if (ms.draft.emails.includes(v)) return toast('他已經有這個 email 了', true);
    ms.draft.emails.push(v); renderModal();
  },
  xregion(b){ const d = ms.draft, z = b.dataset.r; d.extraRegions = (d.extraRegions || []).includes(z) ? d.extraRegions.filter(x => x !== z) : (d.extraRegions || []).concat([z]); renderModal(); },
  trole(b){ const t = b.dataset.team, d = ms.draft; if (b.dataset.v === '團長') d.teams[t] = {role:'團長'}; else if (d.teams[t]) d.teams[t].role = '團員'; renderModal(); },
  skill(b){ const s = b.dataset.s, d = ms.draft; d.skills = d.skills.includes(s) ? d.skills.filter(x => x !== s) : [...d.skills, s]; renderModal(); },
  tquit(b){ const t = b.dataset.team, d = ms.draft; delete d.teams[t]; d.skills = d.skills.filter(s => SKILL_TEAM[s] !== t); ms.pending = (ms.pending || []).filter(x => x !== t); renderModal(); },
  addTeam(){ const t = document.getElementById('team-new').value; ms.pending = (ms.pending || []).concat([t]); renderModal(); toast(`已加入${t}，請點選他的排班崗位`); },
  undo(b){
    const e = log.find(x => x.id === b.dataset.id);
    b.disabled = true; b.textContent = '復原中…';
    api('adminUndo', {id:e.id}).then(res => res.data ? ingest(res.data) : reload()).then(() => { fixRefs(); render(); toast('已復原：' + e.title); })
      .catch(err => {
        if (!err.network) { toast(err.message || String(err), true); render(); return; }
        // 連線中斷：重新讀紀錄，看這筆是否已標成「已復原」
        new Promise(r => setTimeout(r, 2500)).then(() => reload()).then(() => {
          fixRefs(); render();
          const x = log.find(l => l.id === e.id);
          toast(x && x.undone ? '已復原：' + e.title + '（連線中斷過，已確認完成）' : '沒有復原成功，請再按一次', !(x && x.undone));
        }).catch(() => { toast('連不上伺服器，請稍後重新整理確認', true); render(); });
      });
  }
};
/* 表單欄位隨打隨存：data-ms 存進任務狀態、data-dr 存進個人資料草稿；有 data-rr 的欄位改了就重畫 */
function bind(e){
  const el = e.target;
  // 搜尋框只在打字時更新清單；失焦（change）時不要重畫，否則正要點的那一列會被換掉
  if (el.id === 'q') { if (e.type === 'input') { state.q = el.value; document.getElementById('results').innerHTML = resultsHtml(); } return; }
  if (el.id === 'pk-q') { if (e.type === 'input') { ms.pq = el.value; document.getElementById('pk-results').innerHTML = pickResultsHtml(); } return; }
  if (el.dataset.tf) { if (e.type === 'change') { state.org.tf[el.dataset.tf] = el.value; render(); document.getElementById(el.id)?.focus(); } return; }
  if (el.dataset.sel && e.type === 'change') { const o = state.org, id = +el.dataset.sel; o.pick = el.checked ? [...o.pick, id] : o.pick.filter(x => x !== id); render(); return; }
  if (!ms) return;
  if (el.dataset.idbox && e.type === 'change') { const id = +el.dataset.idbox; ms.ids = el.checked ? [...ms.ids, id] : ms.ids.filter(x => x !== id); return; }
  const val = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.ms) {
    const k = el.dataset.ms, prev = ms[k];
    ms[k] = val;
    if (k === 'pr' && prev !== val) ms.g = '';
    if (k === 'tr' && prev !== val && ms.kind === 'group' && (ms.action === 'batchMove' || ms.action === 'disable')) ms.tg = '';
    if (k === 'region' && ms.kind === 'newAcct' && prev !== val) ms.group = '';
    if (k === 'name' && ms.kind === 'newAcct' && e.type === 'change' && !ms.display && val.trim().length >= 3) ms.display = val.trim().slice(1);
  }
  if (el.dataset.dr && ms.draft) {
    const k = el.dataset.dr, d = ms.draft;
    d[k] = val;
    if (k === 'role' && !isZoneRole(val)) d.extraRegions = [];
    if (k === 'region') d.extraRegions = (d.extraRegions || []).filter(z => z !== val);
    if (k === 'region' && d.group && groupObj(d.group).region !== val) { d.group = ''; if (e.type === 'change') toast(`已換到${val}，請在小組選單選他的新小組`); }
  }
  if (e.type === 'change' && 'rr' in el.dataset) renderModal();
}
document.addEventListener('input', bind);
document.addEventListener('change', bind);
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'scrim') return H.scrim(b, e);
  if (H[b.dataset.act]) H[b.dataset.act](b, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ms && !ms.busy) closeModal(); });
