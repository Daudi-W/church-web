/* ---------- 預覽：列出一個人改前改後的差異，以及會改到哪些地方 ---------- */
function personDiff(o, d){
  const out = [];
  d.emails.filter(e => !o.emails.includes(e)).forEach(e => out.push({label:'新增 email', after:e, fx:['白名單 email 欄加入，他可以用這個帳號登入']}));
  o.emails.filter(e => !d.emails.includes(e)).forEach(e => out.push({label:'移除 email', before:e, after:'（移除）', fx:['之後用這個帳號登入會被擋下']}));
  if (o.active !== d.active) out.push({label:'登入權限', before:o.active ? '可以登入' : '停用', after:d.active ? '可以登入' : '停用',
    fx: d.active ? ['白名單「啟用」改為 TRUE'] : ['白名單「啟用」改為 FALSE，他登入會被擋下', ...(d.skills.length ? [{w:'排班崗位不會自動拿掉；如果也不再服事，請在事工團區塊讓他退出'}] : [])]});
  if (o.group !== d.group) out.push({label:'小組', before:o.group || '（無）', after:d.group || '（無）',
    fx:['白名單「小組」欄更新', `牧養視圖：${o.group ? leaderName(o.group) + ' 不再看到他' : '原本沒有小組長'}；${d.group ? '改由 ' + leaderName(d.group) + ' 看到' : '之後沒有小組長看得到他'}`]});
  if (o.region !== d.region) out.push({label:'區', before:o.region, after:d.region,
    fx:['白名單「區」欄更新', `區長視圖：${headName(o.region)} → ${headName(d.region)}`, ...(districtOf(o.region) !== districtOf(d.region) ? [`督區也從 ${districtLabel(districtOf(o.region))} 變成 ${districtLabel(districtOf(d.region))}`] : [])]});
  if (o.staff !== d.staff) out.push({label:'全職同工', before:o.staff ? '是' : '否', after:d.staff ? '是' : '否', fx:[d.staff ? '白名單「全職同工」打勾，他會取得管理者權限' : '白名單「全職同工」取消，他不再能進管理頁']});
  const ox = (o.extraRegions || []).join('、'), dx = (d.extraRegions || []).join('、');
  if (ox !== dx) out.push({label:'兼管區', before:ox || '（無）', after:dx || '（無）', fx:['白名單「兼管區」欄更新', dx ? `他的牧養視圖會包含「${dx}」的同工；那一區沒有自己的區長時，請假通知也會找他` : '他不再兼管其他區', '排班不受影響（排班只看主要的區）']});
  if (o.role !== d.role) out.push({label:'職分', before:o.role, after:d.role, fx:['白名單「職分」欄更新，會影響他看得到的牧養範圍']});
  if (o.display !== d.display) out.push({label:'服事表稱呼', before:o.display, after:d.display, fx:['同工資料庫「顯示名稱」更新', {w:'請確認服事表上寫的也是「' + d.display + '」，否則偵測不到他的服事'}]});
  const teams = teamOrder.filter(t => o.teams[t] || d.teams[t] || o.skills.some(s => SKILL_TEAM[s] === t) || d.skills.some(s => SKILL_TEAM[s] === t));
  teams.forEach(t => {
    const ol = o.teams[t], dl = d.teams[t];
    const os = o.skills.filter(s => SKILL_TEAM[s] === t), ds = d.skills.filter(s => SKILL_TEAM[s] === t);
    const quitAll = (ol || os.length) && !dl && !ds.length;
    if (quitAll) {
      const fx = [];
      if (ol) fx.push('帳號管理表「事工團」分頁刪除這一列');
      if (os.length) fx.push('同工資料庫移除崗位：' + os.join('、') + '，之後不會再排到他');
      if (ol && ol.role === '團長') fx.push({w:'他會失去這團的團長班表畫面，記得指定新團長'});
      out.push({label:'退出事工團', before:t, after:'（退出）', fx});
      return;
    }
    if (!ol && dl) out.push({label:'加入事工團', after:t + '（' + dl.role + '）', fx:['帳號管理表「事工團」分頁新增一列']});
    if (ol && !dl) out.push({label:'從平台移除登記', before:t, after:'（只留排班崗位）', fx:['帳號管理表「事工團」分頁刪除這一列', '排班崗位保留：' + ds.join('、')]});
    if (ol && dl && ol.role !== dl.role) out.push({label:t + '角色', before:ol.role, after:dl.role, fx:[dl.role === '團長' ? '他會看到這團的團長班表（含缺人提醒）' : '他不再看到這團的團長班表']});
    if (os.join() !== ds.join()) out.push({label:t + '排班崗位', before:os.join('、') || '（無）', after:ds.join('、') || '（無）', fx:['同工資料庫「可服事崗位」更新']});
  });
  return out;
}
function diffList(items){
  return `<ol class="diff">${items.map(it => `<li>
    <div class="d-label">${esc(it.label)}</div>
    <div class="d-val">${it.before != null ? `<s>${esc(it.before)}</s><span class="arrow">→</span>` : ''}<strong>${esc(it.after ?? '')}</strong></div>
    ${it.fx && it.fx.length ? `<ul class="fx">${it.fx.map(f => typeof f === 'string' ? `<li>${esc(f)}</li>` : `<li class="w">${esc(f.w)}</li>`).join('')}</ul>` : ''}
  </li>`).join('')}</ol>`;
}
