(async function () {
  'use strict';

  var D = window.MultiChurchDomain;
  var M = window.MultiChurchModules;
  var S = window.MultiChurchStorage;
  var A = window.MultiChurchDataAdapter;
  var T = window.MultiChurchAppsScriptTransport;
  var config = window.MultiChurchRuntimeConfig || { mode: 'local', churchId: 'church_demo' };
  var CHURCH_ID = config.churchId || 'church_demo';
  var isAppsScript = config.mode === 'apps-script';
  var repository = S.createRepository(window.localStorage);
  var dataAdapter;
  if (isAppsScript) {
    var authProvider = window.MultiChurchGoogleAuth.createProvider({ clientId: config.googleClientId });
    dataAdapter = A.createAppsScriptAdapter(T.createTransport({
      endpoint: config.endpoint,
      getIdToken: authProvider.getIdToken
    }), CHURCH_ID);
  } else {
    dataAdapter = A.createLocalAdapter(repository, CHURCH_ID);
  }
  var app = document.getElementById('app');
  var toast = document.getElementById('toast');
  var saveStatus = document.getElementById('save-status');
  var churchTitle = document.getElementById('church-title');
  var activeView = 'home';
  var setupStep = 0;
  var selectedCell = null;
  var publishPreview = false;

  function demoState() {
    return {
      church: { id: CHURCH_ID, name: '示範教會', timezone: 'Asia/Taipei', template: '一般兩堂聚會' },
      moduleSchemaVersion: 1,
      rulePresetVersion: 2,
      events: [
        { id: 'evt_1', churchId: CHURCH_ID, date: '2026-09-06', start: '09:00', end: '10:30', name: '主日第一堂' },
        { id: 'evt_2', churchId: CHURCH_ID, date: '2026-09-06', start: '11:00', end: '12:30', name: '主日第二堂' }
      ],
      roles: [
        { id: 'role_lead', churchId: CHURCH_ID, name: '敬拜主領', team: '敬拜', required: true },
        { id: 'role_keys', churchId: CHURCH_ID, name: '司琴', team: '敬拜', required: true },
        { id: 'role_usher', churchId: CHURCH_ID, name: '招待', team: '招待', required: true }
      ],
      people: [
        { id: 'person_01', churchId: CHURCH_ID, name: '小安', email: 'member01@example.test', accessRole: 'member', teams: ['敬拜', '招待'], active: true, skills: ['role_lead', 'role_usher'], leaveEventIds: [], recommendedMax: 2 },
        { id: 'person_02', churchId: CHURCH_ID, name: '恩慈', email: 'member02@example.test', accessRole: 'member', teams: ['敬拜'], active: true, skills: ['role_keys'], leaveEventIds: ['evt_2'], recommendedMax: 2 },
        { id: 'person_03', churchId: CHURCH_ID, name: '家豪', email: 'leader01@example.test', accessRole: 'team_lead', teams: ['敬拜'], active: true, skills: ['role_lead', 'role_keys'], leaveEventIds: [], recommendedMax: 2 },
        { id: 'person_04', churchId: CHURCH_ID, name: '小林', email: 'member04@example.test', accessRole: 'member', teams: ['招待'], active: true, skills: ['role_usher'], leaveEventIds: [], recommendedMax: 2 },
        { id: 'person_05', churchId: CHURCH_ID, name: '小雨', email: 'member05@example.test', accessRole: 'member', teams: ['招待'], active: true, skills: ['role_usher'], leaveEventIds: [], recommendedMax: 2 },
        { id: 'person_06', churchId: CHURCH_ID, name: '以琳', email: 'member06@example.test', accessRole: 'member', teams: ['敬拜'], active: true, skills: ['role_keys'], leaveEventIds: [], recommendedMax: 2 },
        { id: 'person_07', churchId: CHURCH_ID, name: '子晴', email: 'admin@example.test', accessRole: 'admin', teams: ['敬拜'], active: true, skills: ['role_keys'], leaveEventIds: [], recommendedMax: 0 }
      ],
      compatiblePairs: [],
      settings: {
        rules: {
          ON_LEAVE: 'block', NO_SKILL: 'warn', SAME_EVENT_CONFLICT: 'block',
          SAME_DAY_OTHER_EVENT: 'warn', FREQUENCY_HIGH: 'warn', REQUIRED_GAP: 'publish_block'
        },
        announcement: {
          weeksAhead: 4, weeklyEnabled: true, weeklyDay: '週三', weeklyTime: '08:00',
          tomorrowEnabled: true, tomorrowTime: '20:00'
        }
      },
      assignments: [
        { id: 'as_01', churchId: CHURCH_ID, eventId: 'evt_1', roleId: 'role_lead', personId: 'person_01', status: 'published', isLead: true },
        { id: 'as_02', churchId: CHURCH_ID, eventId: 'evt_1', roleId: 'role_keys', personId: 'person_02', status: 'published' },
        { id: 'as_03', churchId: CHURCH_ID, eventId: 'evt_1', roleId: 'role_usher', personId: 'person_04', status: 'published' },
        { id: 'as_04', churchId: CHURCH_ID, eventId: 'evt_2', roleId: 'role_lead', personId: 'person_03', status: 'published', isLead: true },
        { id: 'as_05', churchId: CHURCH_ID, eventId: 'evt_2', roleId: 'role_usher', personId: 'person_05', status: 'published' },
        { id: 'as_06', churchId: CHURCH_ID, eventId: 'evt_1', roleId: 'role_keys', personId: 'person_07', status: 'cancelled' }
      ],
      newcomers: [
        { id: 'new_01', churchId: CHURCH_ID, receivedDate: '2026-09-06', name: '小光', contactChannel: 'LINE', source: '主日來賓', ownerPersonId: 'person_03', status: '跟進中', nextFollowupDate: '2026-09-09' },
        { id: 'new_02', churchId: CHURCH_ID, receivedDate: '2026-09-06', name: '小禾', contactChannel: '電話', source: '朋友邀請', ownerPersonId: '', status: '待分派', nextFollowupDate: '2026-09-08' }
      ],
      followups: [
        { id: 'fu_01', churchId: CHURCH_ID, newcomerId: 'new_01', contactedAt: '2026-09-07T19:30', channel: 'LINE', result: '已回覆', nextAction: '邀請參加小組', ownerPersonId: 'person_03' }
      ],
      venues: [
        { id: 'venue_main', churchId: CHURCH_ID, name: '主堂', capacity: 200, active: true, notes: '無個資示範場地' },
        { id: 'venue_room_a', churchId: CHURCH_ID, name: '教室 A', capacity: 30, active: true, notes: '無個資示範場地' }
      ],
      venueRequests: [
        { id: 'req_01', churchId: CHURCH_ID, venueId: 'venue_room_a', requesterPersonId: 'person_03', date: '2026-09-12', start: '14:00', end: '16:00', purpose: '小組聚會', status: 'approved' },
        { id: 'req_02', churchId: CHURCH_ID, venueId: 'venue_main', requesterPersonId: 'person_01', date: '2026-09-13', start: '13:00', end: '15:00', purpose: '敬拜練習', status: 'pending' }
      ]
    };
  }

  var state;
  var storageBlocked = false;
  try {
    state = await dataAdapter.load(demoState);
  } catch (error) {
    if (isAppsScript) {
      document.querySelector('.app-shell').hidden = false;
      document.querySelector('.main-nav').hidden = true;
      document.getElementById('app').innerHTML = '<section class="panel"><p class="eyebrow">連線未完成</p><h2>無法讀取教會資料</h2><p class="error-text" id="startup-error"></p><p class="muted">請確認登入帳號已在白名單，再重新整理頁面。</p></section>';
      document.getElementById('startup-error').textContent = String(error && error.message ? error.message : error);
      saveStatus.textContent = '未連線';
      saveStatus.classList.add('error');
      return;
    }
    state = demoState();
    storageBlocked = true;
    saveStatus.textContent = '沙盒資料異常，暫未覆寫';
    saveStatus.classList.add('error');
  }

  function hydrateState() {
    state.church.template = state.church.template || '一般兩堂聚會';
    if (!state.settings) state.settings = {};
    state.settings.rules = Object.assign({
      ON_LEAVE: 'block', NO_SKILL: 'warn', SAME_EVENT_CONFLICT: 'block',
      SAME_DAY_OTHER_EVENT: 'warn', FREQUENCY_HIGH: 'warn', REQUIRED_GAP: 'publish_block'
    }, state.settings.rules || {});
    if (dataAdapter.kind === 'local-sandbox' && Number(state.rulePresetVersion || 0) < 2) {
      state.settings.rules.NO_SKILL = 'warn';
      state.rulePresetVersion = 2;
    }
    state.settings.announcement = Object.assign({
      weeksAhead: 4, weeklyEnabled: true, weeklyDay: '週三', weeklyTime: '08:00',
      tomorrowEnabled: true, tomorrowTime: '20:00'
    }, state.settings.announcement || {});
    state.people.forEach(function (person, index) {
      if (!person.email) person.email = 'member' + String(index + 1).padStart(2, '0') + '@example.test';
      if (!person.accessRole) person.accessRole = 'member';
      if (!Array.isArray(person.teams)) {
        person.teams = Array.from(new Set(person.skills.map(function (roleId) {
          var role = D.roleById(state, roleId);
          return role ? role.team : '';
        }).filter(Boolean)));
      }
    });
    var moduleDefaults = demoState();
    if (state.moduleSchemaVersion !== 1) {
      state.newcomers = moduleDefaults.newcomers;
      state.followups = moduleDefaults.followups;
      state.venues = moduleDefaults.venues;
      state.venueRequests = moduleDefaults.venueRequests;
      state.moduleSchemaVersion = 1;
    } else {
      if (!Array.isArray(state.newcomers)) state.newcomers = [];
      if (!Array.isArray(state.followups)) state.followups = [];
      if (!Array.isArray(state.venues)) state.venues = [];
      if (!Array.isArray(state.venueRequests)) state.venueRequests = [];
    }
  }

  hydrateState();

  var saveTimer = null;
  var saveSequence = Promise.resolve();

  function persistState() {
    if (storageBlocked) return;
    churchTitle.textContent = state.church.name + '事工平台';
    if (saveTimer) window.clearTimeout(saveTimer);
    saveStatus.textContent = isAppsScript ? '尚未同步的變更' : '正在保存…';
    saveStatus.classList.remove('error');
    saveTimer = window.setTimeout(function () {
      var snapshot = JSON.parse(JSON.stringify(state));
      saveSequence = saveSequence.catch(function () {}).then(function () {
        saveStatus.textContent = isAppsScript ? '正在同步到教會表格…' : '正在保存…';
        return dataAdapter.save(snapshot);
      }).then(function () {
        saveStatus.textContent = isAppsScript ? '已同步到教會表格' : '已保存於瀏覽器沙盒';
        saveStatus.classList.remove('error');
      }).catch(function (error) {
        saveStatus.textContent = '保存失敗：' + error.message;
        saveStatus.classList.add('error');
      });
    }, isAppsScript ? 700 : 0);
  }

  var setupSteps = [
    { title: '教會與範本', note: '選擇起始範本後，所有內容仍可調整。' },
    { title: '聚會與場次', note: '設定星期與時間後，系統產生未來聚會。' },
    { title: '事工與崗位', note: '崗位名稱、人數與排序不寫死在程式裡。' },
    { title: '人員與權限', note: '人員編號由系統建立，管理者只看到名稱。' },
    { title: '規則與提示', note: '平衡模式已套用，可再依教會調整。' },
    { title: '公告與測試', note: isAppsScript ? '先以測試資料預覽，不會真正發送。' : '先以假資料預覽，不會真正發送。' }
  ];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function flash(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  function setView(view) {
    activeView = view;
    selectedCell = null;
    var navView = view === 'personal' || view === 'announcement' ? 'schedule' : view === 'handoff' ? 'setup' : view;
    document.querySelectorAll('.main-nav button').forEach(function (button) {
      if (button.dataset.view === navView) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    render();
    app.focus();
  }

  function assignmentAt(eventId, roleId) {
    return state.assignments.find(function (item) {
      return item.eventId === eventId && item.roleId === roleId && item.status !== 'cancelled';
    });
  }

  function displayDate(dateText) {
    var parts = String(dateText || '').split('-');
    return parts.length === 3 ? Number(parts[1]) + '/' + Number(parts[2]) : dateText;
  }

  function uniqueTeams() {
    return Array.from(new Set(state.roles.map(function (role) { return role.team; }).filter(Boolean)));
  }

  function personOptions(selectedId, includeEmpty) {
    var empty = includeEmpty ? '<option value="">尚未分派</option>' : '';
    return empty + state.people.filter(function (person) { return person.active; }).map(function (person) {
      return '<option value="' + person.id + '" ' + (person.id === selectedId ? 'selected' : '') + '>' + escapeHtml(person.name) + '</option>';
    }).join('');
  }

  function venueOptions(selectedId) {
    return state.venues.filter(function (venue) { return venue.active; }).map(function (venue) {
      return '<option value="' + venue.id + '" ' + (venue.id === selectedId ? 'selected' : '') + '>' + escapeHtml(venue.name) + '</option>';
    }).join('');
  }

  function serviceTabs(current) {
    var tabs = [
      { view: 'schedule', label: '排班工作台' },
      { view: 'personal', label: '個人服事' },
      { view: 'announcement', label: 'LINE 公告' }
    ];
    return '<nav class="subnav" aria-label="服事排班功能">' + tabs.map(function (tab) {
      return '<button type="button" class="' + (tab.view === current ? 'active' : '') + '" data-go="' + tab.view + '">' + tab.label + '</button>';
    }).join('') + '</nav>';
  }

  function bindModuleLinks() {
    app.querySelectorAll('[data-go]').forEach(function (button) {
      button.addEventListener('click', function () { setView(button.dataset.go); });
    });
  }

  function renderHome() {
    var summary = M.dashboardSummary(state);
    app.innerHTML = '<section class="welcome-card"><div><p class="eyebrow">四份資料，一個入口</p><h2>' + escapeHtml(state.church.name) + '管理首頁</h2><p>白名單只維護一次，服事、新人與場地共用同一批帳號和權限。</p></div><button type="button" data-go="setup">繼續六步驟設置</button></section>' +
      '<section class="module-grid" aria-label="事工模組">' +
      '<article class="module-card"><div class="module-icon">帳</div><div><h2>教會帳號管理</h2><p>白名單、事工團、登入權限與人員資格。</p></div><div class="metric-row"><span><strong>' + summary.activePeople + '</strong> 位啟用</span><span><strong>' + summary.teams + '</strong> 個事工團</span></div><button type="button" class="secondary" data-go="accounts">管理帳號</button></article>' +
      '<article class="module-card"><div class="module-icon">服</div><div><h2>服事排班</h2><p>週表、候選側欄、提示規則與 LINE 公告。</p></div><div class="metric-row"><span><strong>' + summary.publishedAssignments + '</strong> 筆已發布</span><span><strong>' + state.events.length + '</strong> 場聚會</span></div><button type="button" class="secondary" data-go="schedule">進入排班</button></article>' +
      '<article class="module-card"><div class="module-icon">新</div><div><h2>新人跟進</h2><p>新人名單、分派、下一步與聯繫紀錄。</p></div><div class="metric-row"><span class="attention"><strong>' + summary.newcomerAttention + '</strong> 筆需處理</span><span><strong>' + state.followups.length + '</strong> 筆紀錄</span></div><button type="button" class="secondary" data-go="newcomers">管理跟進</button></article>' +
      '<article class="module-card"><div class="module-icon">地</div><div><h2>場地借用</h2><p>場地、時段、申請審核與撞期提示。</p></div><div class="metric-row"><span class="attention"><strong>' + summary.venuePending + '</strong> 筆待審</span><span><strong>' + state.venues.length + '</strong> 個場地</span></div><button type="button" class="secondary" data-go="venues">管理場地</button></article>' +
      '</section><section class="panel compact-panel"><div class="section-head"><div><h2>資料與移交</h2><p>' + (isAppsScript ? '目前已連線這間測試教會自己的四份 Google Sheets；其他教會會使用各自的獨立資料。' : '目前是無個資瀏覽器沙盒；正式版才連各教會自己的四份 Google Sheets。') + '</p></div><button type="button" class="ghost" data-go="handoff">查看漸進式移交</button></div></section>';
    bindModuleLinks();
  }

  function renderAccounts() {
    app.innerHTML = '<section class="panel"><div class="section-head"><div><p class="eyebrow">01 教會帳號管理</p><h2>白名單與事工團</h2><p>其他三個模組都從這裡認人，不需要重複建立名單。</p></div><span class="badge neutral">共用資料來源</span></div>' + renderPeopleEditors() + '</section>';
    bindSetupEditors();
  }

  function renderNewcomerEditors() {
    return '<div class="editor-list">' + state.newcomers.map(function (item) {
      return '<article class="editor-row person-editor"><div class="editor-grid newcomer-fields">' +
        '<label>姓名<input data-entity="newcomers" data-id="' + item.id + '" data-field="name" value="' + escapeHtml(item.name) + '"></label>' +
        '<label>收到日期<input type="date" data-entity="newcomers" data-id="' + item.id + '" data-field="receivedDate" value="' + escapeHtml(item.receivedDate) + '"></label>' +
        '<label>來源<input data-entity="newcomers" data-id="' + item.id + '" data-field="source" value="' + escapeHtml(item.source) + '"></label>' +
        '<label>聯繫管道<select data-entity="newcomers" data-id="' + item.id + '" data-field="contactChannel"><option ' + (item.contactChannel === 'LINE' ? 'selected' : '') + '>LINE</option><option ' + (item.contactChannel === '電話' ? 'selected' : '') + '>電話</option><option ' + (item.contactChannel === '面談' ? 'selected' : '') + '>面談</option></select></label>' +
        '<label>跟進者<select data-entity="newcomers" data-id="' + item.id + '" data-field="ownerPersonId">' + personOptions(item.ownerPersonId, true) + '</select></label>' +
        '<label>狀態<select data-entity="newcomers" data-id="' + item.id + '" data-field="status"><option ' + (item.status === '待分派' ? 'selected' : '') + '>待分派</option><option ' + (item.status === '跟進中' ? 'selected' : '') + '>跟進中</option><option ' + (item.status === '已連結' ? 'selected' : '') + '>已連結</option><option ' + (item.status === '暫停跟進' ? 'selected' : '') + '>暫停跟進</option></select></label>' +
        '<label>下次跟進<input type="date" data-entity="newcomers" data-id="' + item.id + '" data-field="nextFollowupDate" value="' + escapeHtml(item.nextFollowupDate) + '"></label>' +
        '</div><div class="row-foot"><span class="badge ' + (item.status === '待分派' ? 'warn' : 'neutral') + '">' + escapeHtml(item.status) + '</span><button type="button" class="danger" data-remove="newcomers" data-id="' + item.id + '">' + (isAppsScript ? '移除新人' : '移除假新人') + '</button></div></article>';
    }).join('') + '</div><button type="button" class="secondary add-row" data-add="newcomer">＋' + (isAppsScript ? '新增新人' : '新增假新人') + '</button>';
  }

  function renderFollowupEditors() {
    return '<div class="editor-list">' + state.followups.map(function (item) {
      return '<article class="editor-row"><div class="editor-grid followup-fields">' +
        '<label>新人<select data-entity="followups" data-id="' + item.id + '" data-field="newcomerId">' + state.newcomers.map(function (newcomer) { return '<option value="' + newcomer.id + '" ' + (newcomer.id === item.newcomerId ? 'selected' : '') + '>' + escapeHtml(newcomer.name) + '</option>'; }).join('') + '</select></label>' +
        '<label>聯繫時間<input type="datetime-local" data-entity="followups" data-id="' + item.id + '" data-field="contactedAt" value="' + escapeHtml(item.contactedAt) + '"></label>' +
        '<label>結果<input data-entity="followups" data-id="' + item.id + '" data-field="result" value="' + escapeHtml(item.result) + '"></label>' +
        '<label>下一步<input data-entity="followups" data-id="' + item.id + '" data-field="nextAction" value="' + escapeHtml(item.nextAction) + '"></label>' +
        '<label>跟進者<select data-entity="followups" data-id="' + item.id + '" data-field="ownerPersonId">' + personOptions(item.ownerPersonId, false) + '</select></label>' +
        '</div><button type="button" class="danger" data-remove="followups" data-id="' + item.id + '">移除紀錄</button></article>';
    }).join('') + '</div><button type="button" class="secondary add-row" data-add="followup">＋新增跟進紀錄</button>';
  }

  function renderNewcomers() {
    app.innerHTML = '<section class="panel"><div class="section-head"><div><p class="eyebrow">03 新人跟進</p><h2>新人名單與分派</h2><p>姓名只留在新人資料；跟進者直接選共用白名單。</p></div><span class="badge neutral">' + (isAppsScript ? '測試資料' : '假資料') + '</span></div>' + renderNewcomerEditors() + '</section>' +
      '<section class="panel"><div class="section-head"><div><h2>跟進紀錄</h2><p>每次聯繫獨立留下結果與下一步。</p></div></div>' + renderFollowupEditors() + '</section>';
    bindSetupEditors();
  }

  function renderVenueEditors() {
    return '<div class="editor-list">' + state.venues.map(function (venue) {
      return '<article class="editor-row"><div class="editor-grid venue-fields">' +
        '<label>場地名稱<input data-entity="venues" data-id="' + venue.id + '" data-field="name" value="' + escapeHtml(venue.name) + '"></label>' +
        '<label>容納人數<input type="number" min="1" data-entity="venues" data-id="' + venue.id + '" data-field="capacity" data-number value="' + venue.capacity + '"></label>' +
        '<label>備註<input data-entity="venues" data-id="' + venue.id + '" data-field="notes" value="' + escapeHtml(venue.notes) + '"></label>' +
        '<label class="check-line"><input type="checkbox" data-entity="venues" data-id="' + venue.id + '" data-field="active" ' + (venue.active ? 'checked' : '') + '>開放借用</label>' +
        '</div><button type="button" class="danger" data-remove="venues" data-id="' + venue.id + '" ' + (state.venues.length === 1 ? 'disabled' : '') + '>移除場地</button></article>';
    }).join('') + '</div><button type="button" class="secondary add-row" data-add="venue">＋新增場地</button>';
  }

  function renderRequestEditors() {
    return '<div class="editor-list">' + state.venueRequests.map(function (request) {
      var conflicts = M.venueConflicts(state, request);
      return '<article class="editor-row person-editor ' + (conflicts.length ? 'has-conflict' : '') + '"><div class="editor-grid request-fields">' +
        '<label>場地<select data-entity="venueRequests" data-id="' + request.id + '" data-field="venueId">' + venueOptions(request.venueId) + '</select></label>' +
        '<label>申請人<select data-entity="venueRequests" data-id="' + request.id + '" data-field="requesterPersonId">' + personOptions(request.requesterPersonId, false) + '</select></label>' +
        '<label>日期<input type="date" data-entity="venueRequests" data-id="' + request.id + '" data-field="date" value="' + escapeHtml(request.date) + '"></label>' +
        '<label>開始<input type="time" data-entity="venueRequests" data-id="' + request.id + '" data-field="start" value="' + escapeHtml(request.start) + '"></label>' +
        '<label>結束<input type="time" data-entity="venueRequests" data-id="' + request.id + '" data-field="end" value="' + escapeHtml(request.end) + '"></label>' +
        '<label>用途<input data-entity="venueRequests" data-id="' + request.id + '" data-field="purpose" value="' + escapeHtml(request.purpose) + '"></label>' +
        '<label>狀態<select data-entity="venueRequests" data-id="' + request.id + '" data-field="status"><option value="pending" ' + (request.status === 'pending' ? 'selected' : '') + '>待審核</option><option value="approved" ' + (request.status === 'approved' ? 'selected' : '') + '>已核准</option><option value="rejected" ' + (request.status === 'rejected' ? 'selected' : '') + '>未核准</option><option value="cancelled" ' + (request.status === 'cancelled' ? 'selected' : '') + '>已取消</option></select></label>' +
        '</div><div class="row-foot"><span class="badge ' + (conflicts.length ? 'block' : 'neutral') + '">' + (conflicts.length ? '與 ' + conflicts.length + ' 筆撞期' : request.status === 'pending' ? '待審核' : '無撞期') + '</span><button type="button" class="danger" data-remove="venueRequests" data-id="' + request.id + '">移除申請</button></div></article>';
    }).join('') + '</div><button type="button" class="secondary add-row" data-add="venueRequest">＋新增借用申請</button>';
  }

  function renderVenues() {
    app.innerHTML = '<section class="panel"><div class="section-head"><div><p class="eyebrow">04 場地借用</p><h2>場地設定</h2><p>各教會自行建立場地與容量，不寫死桃園名稱。</p></div><span class="badge neutral">' + (isAppsScript ? '測試資料' : '假資料') + '</span></div>' + renderVenueEditors() + '</section>' +
      '<section class="panel"><div class="section-head"><div><h2>借用申請與審核</h2><p>同場地、同日期、時段重疊會立即標出。</p></div></div>' + renderRequestEditors() + '</section>';
    bindSetupEditors();
  }

  function renderEventEditors() {
    return '<div class="editor-list">' + state.events.map(function (event) {
      return '<article class="editor-row"><div class="editor-grid event-fields">' +
        '<label>聚會名稱<input data-entity="events" data-id="' + event.id + '" data-field="name" value="' + escapeHtml(event.name) + '"></label>' +
        '<label>日期<input type="date" data-entity="events" data-id="' + event.id + '" data-field="date" value="' + escapeHtml(event.date) + '"></label>' +
        '<label>開始<input type="time" data-entity="events" data-id="' + event.id + '" data-field="start" value="' + escapeHtml(event.start) + '"></label>' +
        '<label>結束<input type="time" data-entity="events" data-id="' + event.id + '" data-field="end" value="' + escapeHtml(event.end) + '"></label>' +
        '</div><button type="button" class="danger" data-remove="events" data-id="' + event.id + '" ' + (state.events.length === 1 ? 'disabled' : '') + '>移除場次</button></article>';
    }).join('') + '</div><button type="button" class="secondary add-row" data-add="event">＋新增聚會場次</button>';
  }

  function renderRoleEditors() {
    return '<div class="editor-list">' + state.roles.map(function (role) {
      return '<article class="editor-row"><div class="editor-grid role-fields">' +
        '<label>事工團<input data-entity="roles" data-id="' + role.id + '" data-field="team" value="' + escapeHtml(role.team) + '"></label>' +
        '<label>崗位名稱<input data-entity="roles" data-id="' + role.id + '" data-field="name" value="' + escapeHtml(role.name) + '"></label>' +
        '<label class="check-line"><input type="checkbox" data-entity="roles" data-id="' + role.id + '" data-field="required" ' + (role.required ? 'checked' : '') + '>發布前必須有人</label>' +
        '</div><button type="button" class="danger" data-remove="roles" data-id="' + role.id + '" ' + (state.roles.length === 1 ? 'disabled' : '') + '>移除崗位</button></article>';
    }).join('') + '</div><button type="button" class="secondary add-row" data-add="role">＋新增事工崗位</button>' +
      '<p class="muted small">敬拜樂器、兒童／幼幼與「助理」都以一般崗位建立，不需要特殊欄位。</p>';
  }

  function renderPeopleEditors() {
    var teams = uniqueTeams();
    return '<div class="editor-list">' + state.people.map(function (person) {
      return '<article class="editor-row person-editor"><div class="editor-grid person-fields">' +
        '<label>姓名<input data-entity="people" data-id="' + person.id + '" data-field="name" value="' + escapeHtml(person.name) + '"></label>' +
        '<label>Google 帳號<input type="email" data-entity="people" data-id="' + person.id + '" data-field="email" value="' + escapeHtml(person.email) + '"></label>' +
        '<label>平台權限<select data-entity="people" data-id="' + person.id + '" data-field="accessRole">' +
          '<option value="member" ' + (person.accessRole === 'member' ? 'selected' : '') + '>一般同工</option>' +
          '<option value="team_lead" ' + (person.accessRole === 'team_lead' ? 'selected' : '') + '>事工團長</option>' +
          '<option value="admin" ' + (person.accessRole === 'admin' ? 'selected' : '') + '>系統管理者</option></select></label>' +
        '<label class="check-line"><input type="checkbox" data-entity="people" data-id="' + person.id + '" data-field="active" ' + (person.active ? 'checked' : '') + '>允許登入</label></div>' +
        '<div class="field-group"><span>所屬事工團</span><div class="inline-checks">' + teams.map(function (team) {
          return '<label class="check-chip"><input type="checkbox" data-person-team="' + person.id + '" value="' + escapeHtml(team) + '" ' + (person.teams.indexOf(team) !== -1 ? 'checked' : '') + '>' + escapeHtml(team) + '</label>';
        }).join('') + '</div></div>' +
        '<div class="field-group"><span>可服事崗位</span><div class="inline-checks">' + state.roles.map(function (role) {
          return '<label class="check-chip"><input type="checkbox" data-person-skill="' + person.id + '" value="' + role.id + '" ' + (person.skills.indexOf(role.id) !== -1 ? 'checked' : '') + '>' + escapeHtml(role.name) + '</label>';
        }).join('') + '</div></div>' +
        '<div class="row-foot"><span class="muted small">系統編號已在背景建立</span><button type="button" class="danger" data-remove="people" data-id="' + person.id + '" ' + (state.people.length === 1 ? 'disabled' : '') + '>移除人員</button></div></article>';
    }).join('') + '</div><button type="button" class="secondary add-row" data-add="person">＋新增白名單人員</button>' +
      '<div class="preview-box"><strong>這一頁同時取代兩張維護表</strong><p class="small">Google 帳號與平台權限是白名單；所屬事工團與可服事崗位是事工團設定。一般管理者不用理解 person_id。</p></div>';
  }

  function severitySelect(code, allowed) {
    var labels = { ignore: '不檢查', warn: '提醒但可繼續', block: '直接禁止', publish_block: '發布前阻擋' };
    return '<select data-rule="' + code + '">' + allowed.map(function (value) {
      return '<option value="' + value + '" ' + (state.settings.rules[code] === value ? 'selected' : '') + '>' + labels[value] + '</option>';
    }).join('') + '</select>';
  }

  function renderRuleEditors() {
    var rules = [
      { code: 'ON_LEAVE', title: '已請假', note: '候選人已在本場請假', allowed: ['block', 'warn', 'ignore'] },
      { code: 'NO_SKILL', title: '沒有崗位資格', note: '尚未被勾選為可服事此崗位', allowed: ['block', 'warn', 'ignore'] },
      { code: 'SAME_EVENT_CONFLICT', title: '同場撞班', note: '同一場聚會已有其他不相容崗位', allowed: ['block', 'warn', 'ignore'] },
      { code: 'SAME_DAY_OTHER_EVENT', title: '同日跨堂', note: '同一天的其他堂次已有服事', allowed: ['warn', 'block', 'ignore'] },
      { code: 'FREQUENCY_HIGH', title: '超過建議頻率', note: '本期排班次數已達個人建議上限', allowed: ['warn', 'block', 'ignore'] },
      { code: 'REQUIRED_GAP', title: '必要崗位缺人', note: '標示為必要的崗位尚未排人', allowed: ['publish_block', 'warn', 'ignore'] }
    ];
    return '<div class="rule-editor-list">' + rules.map(function (rule) {
      return '<article class="rule-editor"><div><strong>' + rule.title + '</strong><p class="muted small">' + rule.note + '</p></div><label>處理方式' + severitySelect(rule.code, rule.allowed) + '</label></article>';
    }).join('') + '</div><div class="preview-box"><strong>平衡模式只是預設值</strong><p class="small">每間教會可以逐條調整；候選側欄、手動排班與發布檢查會共用同一份結果。</p></div>';
  }

  function renderAnnouncementSettings() {
    var config = state.settings.announcement;
    return '<div class="editor-list"><article class="editor-row person-editor"><div class="editor-grid reminder-fields">' +
      '<label>LINE 公告顯示未來幾週<input type="number" min="1" max="12" data-announcement="weeksAhead" value="' + config.weeksAhead + '"></label>' +
      '<label class="check-line"><input type="checkbox" data-announcement="weeklyEnabled" ' + (config.weeklyEnabled ? 'checked' : '') + '>啟用每週服事提醒</label>' +
      '<label>每週提醒日<select data-announcement="weeklyDay"><option ' + (config.weeklyDay === '週一' ? 'selected' : '') + '>週一</option><option ' + (config.weeklyDay === '週三' ? 'selected' : '') + '>週三</option><option ' + (config.weeklyDay === '週五' ? 'selected' : '') + '>週五</option></select></label>' +
      '<label>每週提醒時間<input type="time" data-announcement="weeklyTime" value="' + escapeHtml(config.weeklyTime) + '"></label>' +
      '<label class="check-line"><input type="checkbox" data-announcement="tomorrowEnabled" ' + (config.tomorrowEnabled ? 'checked' : '') + '>啟用前一天提醒</label>' +
      '<label>前一天提醒時間<input type="time" data-announcement="tomorrowTime" value="' + escapeHtml(config.tomorrowTime) + '"></label>' +
      '</div></article></div><div class="preview-box"><strong>目前採個人網頁＋LINE 文字</strong><p class="small">第一版仍由管理者預覽後複製 LINE 文字，不會自動對外發送。提醒時間先保存為設定，等正式後端連線後才建立排程。</p></div>' +
      '<div class="preview-box"><strong>啟用前測試</strong><ul><li>排出一週班表</li><li>處理一個規則警告</li><li>預覽個人服事頁</li><li>產生 LINE 文字</li><li>模擬發布後異動，不外送</li></ul></div>';
  }

  function renderSetupContent() {
    var step = setupSteps[setupStep];
    var content = '';
    if (setupStep === 0) {
      content = '<div class="form-grid">' +
        '<label>教會名稱<input id="church-name" value="' + escapeHtml(state.church.name) + '"></label>' +
        '<label>起始範本<select id="template"><option ' + (state.church.template === '一般單堂聚會' ? 'selected' : '') + '>一般單堂聚會</option><option ' + (state.church.template === '一般兩堂聚會' ? 'selected' : '') + '>一般兩堂聚會</option><option ' + (state.church.template === '桃園三堂聚會' ? 'selected' : '') + '>桃園三堂聚會</option><option ' + (state.church.template === '完全空白' ? 'selected' : '') + '>完全空白</option></select></label>' +
        '</div><div class="preview-box"><strong>範本預覽</strong><ul><li>每週兩場聚會</li><li>敬拜與招待示範事工</li><li>平衡規則模式</li><li>個人網頁＋LINE 文字</li></ul></div>';
    } else if (setupStep === 1) {
      content = renderEventEditors();
    } else if (setupStep === 2) {
      content = renderRoleEditors();
    } else if (setupStep === 3) {
      content = renderPeopleEditors();
    } else if (setupStep === 4) {
      content = renderRuleEditors();
    } else {
      content = renderAnnouncementSettings();
    }
    return '<section class="panel"><div class="section-head"><div><h2>' + (setupStep + 1) + '. ' + step.title + '</h2><p>' + step.note + '</p></div><span class="badge">' + (isAppsScript ? '變更自動同步' : '自動保存草稿') + '</span></div>' + content +
      '<div class="actions" style="margin-top:18px"><button type="button" class="secondary" id="setup-prev" ' + (setupStep === 0 ? 'disabled' : '') + '>上一步</button><button type="button" id="setup-next">' + (setupStep === 5 ? '前往排班原型' : '下一步') + '</button></div></section>';
  }

  function renderSetup() {
    app.innerHTML = '<div class="setup-layout"><aside class="step-list" aria-label="設置步驟">' + setupSteps.map(function (step, index) {
      return '<button type="button" data-step="' + index + '" class="' + (index === setupStep ? 'active' : '') + '"><span class="step-number">' + (index + 1) + '</span>' + step.title + '</button>';
    }).join('') + '</aside>' + renderSetupContent() + '</div>';

    app.querySelectorAll('[data-step]').forEach(function (button) {
      button.addEventListener('click', function () { setupStep = Number(button.dataset.step); renderSetup(); });
    });
    bindSetupEditors();
    document.getElementById('setup-prev').addEventListener('click', function () { setupStep -= 1; renderSetup(); });
    document.getElementById('setup-next').addEventListener('click', function () {
      var nameInput = document.getElementById('church-name');
      if (nameInput) state.church.name = nameInput.value.trim() || '示範教會';
      var templateInput = document.getElementById('template');
      if (templateInput) state.church.template = templateInput.value;
      persistState();
      if (setupStep < 5) { setupStep += 1; renderSetup(); }
      else setView('schedule');
    });
  }

  function findRecord(collection, id) {
    return state[collection].find(function (record) { return record.id === id; });
  }

  function updateSimpleField(input) {
    var record = findRecord(input.dataset.entity, input.dataset.id);
    if (!record) return;
    var oldValue = record[input.dataset.field];
    var newValue = input.type === 'checkbox' ? input.checked : input.hasAttribute('data-number') ? Number(input.value) : input.value.trim();
    record[input.dataset.field] = newValue;
    if (input.dataset.entity === 'roles' && input.dataset.field === 'team' && newValue !== oldValue) {
      state.people.forEach(function (person) {
        if (person.skills.indexOf(record.id) !== -1 && person.teams.indexOf(newValue) === -1) person.teams.push(newValue);
      });
    }
    persistState();
    if (input.dataset.entity === 'venueRequests' && ['venueId', 'date', 'start', 'end', 'status'].indexOf(input.dataset.field) !== -1) renderVenues();
  }

  function refreshEditorView() {
    if (activeView === 'accounts') renderAccounts();
    else if (activeView === 'newcomers') renderNewcomers();
    else if (activeView === 'venues') renderVenues();
    else renderSetup();
  }

  function removeRecord(collection, id) {
    state[collection] = state[collection].filter(function (record) { return record.id !== id; });
    if (collection === 'events') {
      state.assignments = state.assignments.filter(function (item) { return item.eventId !== id; });
      state.people.forEach(function (person) {
        person.leaveEventIds = person.leaveEventIds.filter(function (eventId) { return eventId !== id; });
      });
    }
    if (collection === 'roles') {
      state.assignments = state.assignments.filter(function (item) { return item.roleId !== id; });
      state.people.forEach(function (person) {
        person.skills = person.skills.filter(function (roleId) { return roleId !== id; });
      });
    }
    if (collection === 'people') {
      state.assignments = state.assignments.filter(function (item) { return item.personId !== id; });
      state.newcomers.forEach(function (item) { if (item.ownerPersonId === id) item.ownerPersonId = ''; });
      state.followups = state.followups.filter(function (item) { return item.ownerPersonId !== id; });
      state.venueRequests = state.venueRequests.filter(function (item) { return item.requesterPersonId !== id; });
    }
    if (collection === 'newcomers') {
      state.followups = state.followups.filter(function (item) { return item.newcomerId !== id; });
    }
    if (collection === 'venues') {
      state.venueRequests = state.venueRequests.filter(function (item) { return item.venueId !== id; });
    }
    persistState();
    refreshEditorView();
  }

  function addRecord(type) {
    if (type === 'event') {
      state.events.push({ id: S.createId('evt'), churchId: CHURCH_ID, date: '2026-09-13', start: '09:00', end: '10:30', name: '新聚會' });
    } else if (type === 'role') {
      state.roles.push({ id: S.createId('role'), churchId: CHURCH_ID, name: '新崗位', team: '新事工團', required: true });
    } else if (type === 'person') {
      var personId = S.createId('person');
      state.people.push({ id: personId, churchId: CHURCH_ID, name: '新同工', email: personId + '@example.test', accessRole: 'member', teams: [], active: true, skills: [], leaveEventIds: [], recommendedMax: 2 });
    } else if (type === 'newcomer') {
      state.newcomers.push({ id: S.createId('new'), churchId: CHURCH_ID, receivedDate: '2026-09-13', name: '新朋友', contactChannel: 'LINE', source: '主日來賓', ownerPersonId: '', status: '待分派', nextFollowupDate: '2026-09-16' });
    } else if (type === 'followup') {
      state.followups.push({ id: S.createId('fu'), churchId: CHURCH_ID, newcomerId: state.newcomers[0] ? state.newcomers[0].id : '', contactedAt: '2026-09-13T19:30', channel: 'LINE', result: '尚未聯繫', nextAction: '安排第一次聯繫', ownerPersonId: state.people[0] ? state.people[0].id : '' });
    } else if (type === 'venue') {
      state.venues.push({ id: S.createId('venue'), churchId: CHURCH_ID, name: '新場地', capacity: 20, active: true, notes: '' });
    } else if (type === 'venueRequest') {
      state.venueRequests.push({ id: S.createId('req'), churchId: CHURCH_ID, venueId: state.venues[0] ? state.venues[0].id : '', requesterPersonId: state.people[0] ? state.people[0].id : '', date: '2026-09-14', start: '14:00', end: '16:00', purpose: '聚會', status: 'pending' });
    }
    persistState();
    refreshEditorView();
    flash(isAppsScript ? '已新增，正在同步到教會表格' : '已新增並保存於沙盒');
  }

  function bindSetupEditors() {
    app.querySelectorAll('[data-entity][data-field]').forEach(function (input) {
      var eventName = input.type === 'checkbox' || input.type === 'date' || input.type === 'time' || input.type === 'datetime-local' || input.type === 'number' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, function () { updateSimpleField(input); });
    });
    var churchName = document.getElementById('church-name');
    if (churchName) churchName.addEventListener('input', function () {
      state.church.name = churchName.value.trim() || '示範教會';
      persistState();
    });
    var template = document.getElementById('template');
    if (template) template.addEventListener('change', function () {
      state.church.template = template.value;
      persistState();
    });
    app.querySelectorAll('[data-person-team]').forEach(function (input) {
      input.addEventListener('change', function () {
        var person = D.personById(state, input.dataset.personTeam);
        if (!person) return;
        if (input.checked && person.teams.indexOf(input.value) === -1) person.teams.push(input.value);
        if (!input.checked) person.teams = person.teams.filter(function (team) { return team !== input.value; });
        persistState();
      });
    });
    app.querySelectorAll('[data-person-skill]').forEach(function (input) {
      input.addEventListener('change', function () {
        var person = D.personById(state, input.dataset.personSkill);
        if (!person) return;
        if (input.checked && person.skills.indexOf(input.value) === -1) person.skills.push(input.value);
        if (!input.checked) person.skills = person.skills.filter(function (roleId) { return roleId !== input.value; });
        persistState();
      });
    });
    app.querySelectorAll('[data-remove]').forEach(function (button) {
      button.addEventListener('click', function () {
        var labels = { events: '這個聚會場次及相關排班', roles: '這個崗位及相關排班', people: '這位白名單人員及其關聯資料', newcomers: '這筆新人及跟進紀錄', followups: '這筆跟進紀錄', venues: '這個場地及借用申請', venueRequests: '這筆借用申請' };
        if (window.confirm('確定要移除' + labels[button.dataset.remove] + '嗎？')) removeRecord(button.dataset.remove, button.dataset.id);
      });
    });
    app.querySelectorAll('[data-add]').forEach(function (button) {
      button.addEventListener('click', function () { addRecord(button.dataset.add); });
    });
    app.querySelectorAll('[data-rule]').forEach(function (input) {
      input.addEventListener('change', function () {
        state.settings.rules[input.dataset.rule] = input.value;
        persistState();
      });
    });
    app.querySelectorAll('[data-announcement]').forEach(function (input) {
      var eventName = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventName, function () {
        var value;
        if (input.type === 'checkbox') value = input.checked;
        else if (input.type === 'number') {
          if (!input.value) return;
          value = Math.max(1, Math.min(12, Number(input.value)));
        } else value = input.value;
        state.settings.announcement[input.dataset.announcement] = value;
        persistState();
      });
    });
  }

  function cellButton(event, role) {
    var assignment = assignmentAt(event.id, role.id);
    var selected = selectedCell && selectedCell.eventId === event.id && selectedCell.roleId === role.id;
    if (!assignment) {
      return '<button type="button" class="cell-button empty ' + (selected ? 'selected' : '') + '" data-event="' + event.id + '" data-role="' + role.id + '">缺 1 人<span class="meta">點擊查看候選</span></button>';
    }
    var person = D.personById(state, assignment.personId);
    return '<button type="button" class="cell-button ' + (selected ? 'selected' : '') + '" data-event="' + event.id + '" data-role="' + role.id + '">' + escapeHtml(person.name) + (assignment.isLead ? ' ★' : '') + '<span class="meta">' + escapeHtml(assignment.status === 'published' ? '已發布' : '草稿') + '</span></button>';
  }

  function renderCandidateDrawer() {
    if (!selectedCell) return '';
    var event = D.eventById(state, selectedCell.eventId);
    var role = D.roleById(state, selectedCell.roleId);
    var candidates = D.candidateList(state, event.id, role.id);
    var groups = [
      { level: 'ok', title: '建議人選' },
      { level: 'warn', title: '可排但需注意' },
      { level: 'block', title: '目前不可排' }
    ];
    return '<aside class="drawer" aria-label="候選人側欄"><div class="drawer-head"><div><h3>' + escapeHtml(event.name) + '</h3><p class="muted small" style="margin:3px 0">' + escapeHtml(role.team + '｜' + role.name) + '</p></div><button type="button" class="ghost" id="close-drawer">關閉</button></div><div class="candidate-groups">' + groups.map(function (group) {
      var items = candidates.filter(function (item) { return item.level === group.level; });
      return '<section class="candidate-group"><h3>' + group.title + '（' + items.length + '）</h3>' + items.map(function (item) {
        return '<button type="button" class="candidate ' + item.level + '" data-person="' + item.person.id + '" ' + (item.level === 'block' ? 'disabled' : '') + '><span>' + escapeHtml(item.person.name) + '<span class="reason">' + escapeHtml(item.reasons.map(function (reason) { return reason.text; }).join('；')) + '</span></span><span class="badge ' + (item.level === 'warn' ? 'warn' : item.level === 'block' ? 'block' : '') + '">' + (item.level === 'ok' ? '可排' : item.level === 'warn' ? '提醒' : '禁止') + '</span></button>';
      }).join('') + '</section>';
    }).join('') + '</div></aside>';
  }

  function renderSchedule() {
    var issues = D.scheduleIssues(state);
    app.innerHTML = serviceTabs('schedule') + '<section class="panel"><div class="section-head"><div><p class="eyebrow">02 服事排班</p><h2>排班工作台</h2><p>點選空缺或已排人員，右側只顯示相關候選與規則。</p></div><div class="status-row"><span class="badge neutral">' + (isAppsScript ? '測試環境' : '草稿／示範') + '</span><span class="badge ' + (issues.blocks.length ? 'block' : '') + '">' + issues.blocks.length + ' 個發布阻擋</span></div></div>' +
      '<div class="toolbar"><div class="filters"><label>期間<select><option>' + escapeHtml(displayDate(state.events[0] && state.events[0].date)) + ' 這一週</option></select></label><label>事工團<select><option>全部</option>' + uniqueTeams().map(function (team) { return '<option>' + escapeHtml(team) + '</option>'; }).join('') + '</select></label></div><div class="actions"><button type="button" class="secondary" id="copy-last">複製上期</button><button type="button" id="check-schedule">' + (!issues.blocks.length && state.assignments.some(function (item) { return item.status === 'draft'; }) ? '模擬發布' : '檢查班表') + '</button></div></div>' +
      '<div class="schedule-layout ' + (selectedCell ? 'drawer-open' : '') + '"><div class="schedule-table-wrap"><table class="schedule-table"><thead><tr><th>事工／崗位</th>' + state.events.map(function (event) { return '<th>' + escapeHtml(event.name) + '<span class="muted small" style="display:block">' + escapeHtml(displayDate(event.date) + ' ' + event.start) + '</span></th>'; }).join('') + '</tr></thead><tbody>' + state.roles.map(function (role) {
        return '<tr><th>' + escapeHtml(role.team) + '<span class="muted small" style="display:block">' + escapeHtml(role.name) + '</span></th>' + state.events.map(function (event) { return '<td>' + cellButton(event, role) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' + renderCandidateDrawer() + '</div></section>' + renderRulePanel();

    app.querySelectorAll('.cell-button').forEach(function (button) {
      button.addEventListener('click', function () {
        selectedCell = { eventId: button.dataset.event, roleId: button.dataset.role };
        renderSchedule();
      });
    });
    var close = document.getElementById('close-drawer');
    if (close) close.addEventListener('click', function () { selectedCell = null; renderSchedule(); });
    app.querySelectorAll('.candidate[data-person]').forEach(function (button) {
      button.addEventListener('click', function () {
        assignPerson(selectedCell.eventId, selectedCell.roleId, button.dataset.person);
      });
    });
    document.getElementById('check-schedule').addEventListener('click', function () {
      var current = D.scheduleIssues(state);
      if (current.blocks.length) {
        flash('還有 ' + current.blocks.length + ' 個發布阻擋');
      } else {
        var drafts = state.assignments.filter(function (item) { return item.status === 'draft'; });
        if (drafts.length) {
          drafts.forEach(function (item) { item.status = 'published'; });
          persistState();
          flash('已完成發布預覽，不會外送通知');
          renderSchedule();
        } else {
          flash('班表檢查通過');
        }
      }
    });
    document.getElementById('copy-last').addEventListener('click', function () { flash('已預覽 6 筆，未修改來源期間'); });
    bindModuleLinks();
  }

  function assignPerson(eventId, roleId, personId) {
    var existing = assignmentAt(eventId, roleId);
    if (existing) {
      existing.personId = personId;
      existing.status = 'draft';
    } else {
      state.assignments.push({
        id: S.createId('as'), churchId: CHURCH_ID, eventId: eventId, roleId: roleId,
        personId: personId, status: 'draft', source: 'manual'
      });
    }
    selectedCell = null;
    publishPreview = false;
    persistState();
    flash('已排入草稿，可復原上一動');
    renderSchedule();
  }

  function renderRuleCards(compact) {
    var labels = {
      ON_LEAVE: '已請假', NO_SKILL: '無崗位資格', SAME_EVENT_CONFLICT: '同場不相容撞班',
      SAME_DAY_OTHER_EVENT: '同日跨堂', FREQUENCY_HIGH: '超過建議頻率', REQUIRED_GAP: '必要崗位缺人'
    };
    function itemsFor(level) {
      var items = Object.keys(labels).filter(function (code) { return state.settings.rules[code] === level; }).map(function (code) { return '<li>' + labels[code] + '</li>'; });
      return items.length ? items.join('') : '<li class="muted">目前沒有</li>';
    }
    return '<div class="rule-grid"><article class="rule-card block"><span class="badge block">直接禁止</span><ul>' + itemsFor('block') + '</ul></article><article class="rule-card warn"><span class="badge warn">警告可繼續</span><ul>' + itemsFor('warn') + '</ul></article><article class="rule-card publish"><span class="badge">發布前阻擋</span><ul>' + itemsFor('publish_block') + '</ul></article></div>' + (compact ? '' : '<p class="muted small">同一套結果用在手動排班、候選、自動建議、換班與發布檢查。</p>');
  }

  function renderRulePanel() {
    return '<section class="panel"><div class="section-head"><div><h2>平衡模式</h2><p>明確錯誤先擋下，需要判斷的情況清楚提醒。</p></div></div>' + renderRuleCards(true) + '</section>';
  }

  function renderRules() {
    app.innerHTML = renderRulePanel();
  }

  function renderPersonal() {
    var person = D.personById(state, 'person_01') || state.people[0];
    var items = D.personalAssignments(state, person.id);
    app.innerHTML = serviceTabs('personal') + '<section class="panel"><div class="section-head"><div><h2>' + escapeHtml(person.name) + '的個人服事</h2><p>只顯示本人已發布內容；異動以這裡的最新狀態為準。</p></div><span class="badge">登入後頁面</span></div><div class="personal-list">' + (items.length ? items.map(function (item) {
      return '<article class="service-item"><div class="date-box">' + escapeHtml(displayDate(item.event.date)) + '<br><span class="muted small">聚會</span></div><div><h3>' + escapeHtml(item.event.name) + '</h3><p class="muted" style="margin:4px 0">' + escapeHtml(item.event.start + '–' + item.event.end + '｜' + item.role.team + '｜' + item.role.name) + '</p></div><span class="badge">已發布</span></article>';
    }).join('') : '<p class="muted">目前沒有已發布的服事。</p>') + '</div></section>';
    bindModuleLinks();
  }

  function renderAnnouncement() {
    var issues = D.scheduleIssues(state);
    var text = D.generateLineText(state);
    var reminder = state.settings.announcement;
    app.innerHTML = serviceTabs('announcement') + '<section class="panel"><div class="section-head"><div><h2>LINE 公告預覽</h2><p>同一份已發布資料產生文字；第一版只複製，不自動發送。</p></div><span class="badge neutral">未外送</span></div><div class="announcement-layout"><div><label for="line-text">公告文字<textarea id="line-text" readonly>' + escapeHtml(text) + '</textarea></label><div class="actions" style="margin-top:12px"><button type="button" id="preview-publish">發布前檢查</button><button type="button" class="secondary" id="copy-line">複製 LINE 文字</button></div></div><aside class="checklist"><div class="check-item"><span class="checkmark">✓</span><span>只含已發布資料</span></div><div class="check-item"><span class="checkmark">✓</span><span>不含 email、請假原因與內部編號</span></div><div class="check-item"><span class="checkmark">⚙</span><span>公告範圍：未來 ' + reminder.weeksAhead + ' 週</span></div><div class="check-item"><span class="checkmark">⚙</span><span>每週提醒：' + (reminder.weeklyEnabled ? reminder.weeklyDay + ' ' + reminder.weeklyTime : '關閉') + '<br>前一天提醒：' + (reminder.tomorrowEnabled ? reminder.tomorrowTime : '關閉') + '</span></div><div class="check-item"><span class="' + (issues.blocks.length ? 'badge block' : 'checkmark') + '">' + (issues.blocks.length ? issues.blocks.length : '✓') + '</span><span>' + (issues.blocks.length ? '個發布阻擋尚未處理' : '發布檢查通過') + '</span></div>' + (publishPreview ? '<div class="preview-box"><strong>預覽完成</strong><p class="small">這只是預覽，不會提高發布水位或發送訊息。</p></div>' : '') + '</aside></div></section>';
    document.getElementById('preview-publish').addEventListener('click', function () { publishPreview = true; renderAnnouncement(); flash('已完成無外送預覽'); });
    document.getElementById('copy-line').addEventListener('click', function () {
      var area = document.getElementById('line-text');
      area.select();
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(area.value).then(function () { flash('已複製公告文字'); });
      else flash('已選取文字，可手動複製');
    });
    bindModuleLinks();
  }

  function renderHandoff() {
    app.innerHTML = '<section class="panel"><div class="section-head"><div><h2>漸進式自主</h2><p>教會先自行管理內容與資料，有需要時再逐步接手技術。</p></div><span class="badge">已確認模式</span></div><div class="handoff-grid"><article class="handoff-card"><h3>1. 自行管理內容</h3><ul><li>白名單與事工團</li><li>排班、公告與規則</li><li>不需要 GitHub</li></ul></article><article class="handoff-card"><h3>2. 持有資料</h3><ul><li>教會 Google 帳號</li><li>自己的試算表與備份</li><li>共用網頁與 OAuth 仍由我們維護</li></ul></article><article class="handoff-card"><h3>3. 完全技術移交</h3><ul><li>程式碼、部署與版本文件</li><li>自己的 OAuth、網域與密鑰</li><li>由教會技術人員維護</li></ul></article></div><div class="preview-box"><strong>每一階段都能正常使用</strong><p>資料自主不等於必須自己維護 GitHub。完全移交是選項，不是新教會第一次導入的門檻。</p></div></section>';
  }

  function render() {
    if (activeView === 'home') renderHome();
    else if (activeView === 'accounts') renderAccounts();
    else if (activeView === 'setup') renderSetup();
    else if (activeView === 'schedule') renderSchedule();
    else if (activeView === 'personal') renderPersonal();
    else if (activeView === 'announcement') renderAnnouncement();
    else if (activeView === 'newcomers') renderNewcomers();
    else if (activeView === 'venues') renderVenues();
    else if (activeView === 'handoff') renderHandoff();
  }

  document.querySelectorAll('.main-nav button').forEach(function (button) {
    button.addEventListener('click', function () { setView(button.dataset.view); });
  });
  var resetButton = document.getElementById('reset-demo');
  resetButton.hidden = isAppsScript;
  resetButton.addEventListener('click', async function () {
    await dataAdapter.reset();
    storageBlocked = false;
    state = demoState(); setupStep = 0; selectedCell = null; publishPreview = false; activeView = 'home';
    persistState();
    document.querySelectorAll('.main-nav button').forEach(function (button) {
      if (button.dataset.view === 'home') button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    render(); flash('假資料已重設');
  });

  saveStatus.textContent = isAppsScript ? '已連線教會表格' : '已保存於瀏覽器沙盒';
  churchTitle.textContent = state.church.name + '事工平台';
  if (!isAppsScript) persistState();
  render();
})();
