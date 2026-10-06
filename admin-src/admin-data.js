/* ---------- 資料：從後端 adminData 讀進來，畫面都用這幾個陣列 ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));

let people = [], groups = [], regions = [], log = [], TEAMS = {}, SKILL_TEAM = {}, ROLES = [], teamOrder = [];
const ID_BY_NAME = {};
let NEXT_ID = 1;
const idFor = name => ID_BY_NAME[name] || (ID_BY_NAME[name] = NEXT_ID++);

/** 後端回傳 → 畫面用的形狀（事工團角色包成 {role}，人／組／區記下原始名稱當比對鍵） */
function ingest(d){
  TEAMS = d.teams || {}; SKILL_TEAM = {};
  Object.keys(TEAMS).forEach(t => TEAMS[t].forEach(s => SKILL_TEAM[s] = t));
  teamOrder = Object.keys(TEAMS);
  ROLES = d.roles || [];
  people = (d.people || []).map(p => {
    const teams = {};
    Object.keys(p.teams || {}).forEach(t => teams[t] = {role:p.teams[t]});
    return Object.assign({}, p, {id:idFor(p.name), teams});
  });
  groups = (d.groups || []).map(g => Object.assign({}, g, {_key:g.name}));
  regions = (d.regions || []).map(r => Object.assign({}, r, {_key:r.name}));
  log = d.log || [];
}

const byId = id => people.find(p => p.id === id);
const byName = n => people.find(p => p.name === n);
const nameOf = id => (byId(id) || {}).name || '—';
const regionObj = r => regions.find(x => x.name === r);
const districtOf = r => (regionObj(r) || {}).district || '';
const districtLabel = d => d || '（未設定督區）';
/* 區長沒有獨立欄位：有帳號、職分是區長／區牧／區督、區欄是這一區的人就是 */
const isZoneRole = role => /區長|區牧|區督/.test(role || '');
const headsOf = r => people.filter(p => p.account && p.active && isZoneRole(p.role) && (p.region === r || (p.extraRegions || []).includes(r)));
const headName = r => headsOf(r).map(p => p.name).join('、') || '（尚未設定）';
const weekLabel = w => w == null ? '不在服事表的牧區清單' : +w ? `每月第 ${w} 週主日不排` : '不限制';
const districts = () => [...new Set(regions.map(r => r.district || ''))];
const WEEK_OPTS = [0,1,2,3,4,5];
const groupObj = n => groups.find(g => g.name === n);
const leaderName = n => { const g = groupObj(n); return g ? (g.leader || '—') : '—'; };
const membersOf = n => people.filter(p => p.account && p.group === n);
/* 可以出現在選人清單的人：沒帳號的同工，或帳號沒停用的人 */
const usable = p => !p.account || p.active;
/* 有帳號的人：白名單的區和排班用的區（同工資料庫）不同 */
const zoneMismatch = p => p.account && p.dbRegion && p.dbRegion !== p.region;

/** 一個人在各團的狀態。listed＝帳號管理表「事工團」分頁有登記（多半是團長）；skills＝排班崗位。 */
function teamRows(p, pending){
  const set = new Set([...Object.keys(p.teams), ...p.skills.map(s => SKILL_TEAM[s]).filter(Boolean), ...(pending || [])]);
  return teamOrder.filter(t => set.has(t)).map(t => {
    const listed = !!p.teams[t];
    const skills = p.skills.filter(s => SKILL_TEAM[s] === t);
    const role = listed ? p.teams[t].role : '團員';
    // 團長本來就可以只帶團不排班；只有登記為團員卻沒有崗位的才需要核對
    return {team:t, listed, role, skills, state:listed && role !== '團長' && !skills.length ? 'noSkill' : 'ok'};
  });
}
function search(q){
  q = q.trim().toLowerCase();
  if (!q) return [];
  return people.filter(p => p.name.toLowerCase().includes(q) || p.display.toLowerCase().includes(q) || p.emails.some(e => e.toLowerCase().includes(q))).slice(0, 12);
}
function hl(text, q){
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (!q.trim() || i < 0) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.trim().length)) + '</mark>' + esc(text.slice(i + q.trim().length));
}

/* ---------- 送後端的狀態：和後端 personState_／groupState_／regionState_ 同一個形狀 ---------- */
function pstate(p){
  const t = {};
  Object.keys(p.teams || {}).forEach(k => t[k] = p.teams[k].role);
  return {name:p.name, account:!!p.account, emails:p.emails.slice(), active:!!p.active, staff:!!p.staff, region:p.region || '', dbRegion:p.dbRegion || '', extraRegions:(p.extraRegions || []).slice(), group:p.group || '', role:p.role || '一般同工', display:p.display || p.name, skills:p.skills.slice(), teams:t};
}
function gstate(g){ return {name:g.name, district:g.district || '', region:g.region, leader:g.leader || '', old:(g.old || []).slice(), status:g.status}; }
function rstate(r){ return (r.inSettings || r.week != null) ? {name:r.name, week:Number(r.week) || 0} : null; }
function canon(o){
  if (o === null || o === undefined) return 'null';
  if (Array.isArray(o)) return JSON.stringify(o.map(String).sort());
  if (typeof o === 'object') return '{' + Object.keys(o).sort().map(k => k + ':' + canon(o[k])).join(',') + '}';
  return JSON.stringify(o);
}
/** 比對改前（snap）與改後（目前陣列），產生要送後端的 ops。 */
function buildOps(snap){
  const ops = [];
  const r0 = {}; snap.regions.forEach(r => r0[r._key] = r);
  regions.forEach(r => { const o = r._key ? r0[r._key] : null; const b = o ? rstate(o) : null, a = rstate(r); if (canon(b) !== canon(a)) ops.push({t:'region', key:o ? o.name : r.name, before:b, after:a}); });
  const g0 = {}; snap.groups.forEach(g => g0[g._key] = g);
  groups.forEach(g => { const o = g._key ? g0[g._key] : null; const b = o ? gstate(o) : null, a = gstate(g); if (canon(b) !== canon(a)) ops.push({t:'group', key:o ? o.name : g.name, before:b, after:a}); });
  const p0 = {}; snap.people.forEach(p => p0[p.name] = p);
  people.forEach(p => { const o = p0[p.name]; const b = o ? pstate(o) : null, a = pstate(p); if (canon(b) !== canon(a)) ops.push({t:'person', key:p.name, before:b, after:a}); });
  return ops;
}
