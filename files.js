/* 最後更新：2026-11-02。權限只採用檔案後端驗證結果；不讀 svcWhoami 快取判角色。 */
(function () {
  'use strict';
  var FOLDER = 'application/vnd.google-apps.folder';
  function formatBytes(n) {
    n = Number(n); if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return n + ' B';
    var unit = Math.min(3, Math.floor(Math.log(n) / Math.log(1024)));
    return (n / Math.pow(1024, unit)).toFixed(unit > 1 ? 1 : 0) + ' ' + ['B', 'KB', 'MB', 'GB'][unit];
  }
  function chunkRange(offset, total, limit) {
    if (![offset, total, limit].every(Number.isSafeInteger) || offset < 0 || total <= offset || limit <= 0) throw new Error('上傳進度不正確。');
    var end = Math.min(total, offset + limit);
    return { start: offset, end: end, header: 'bytes ' + offset + '-' + (end - 1) + '/' + total };
  }
  function apiBase(raw) {
    try {
      var url = new URL(raw);
      var local = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
      if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) return '';
      return url.href.replace(/\/$/, '');
    } catch (e) { return ''; }
  }
  function canPreview(mimeType) {
    return ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'].indexOf(mimeType) !== -1;
  }
  function folderLink(href, id) {
    var url = new URL('files.html', href);
    if (!/^https?:$/.test(url.protocol) || !/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new Error('資料夾連結不正確。');
    url.search = ''; url.hash = 'folder=' + encodeURIComponent(id);
    return url.href;
  }
  if (typeof module === 'object' && module.exports) module.exports = { formatBytes: formatBytes, chunkRange: chunkRange, apiBase: apiBase, folderLink: folderLink, canPreview: canPreview };
  if (typeof document === 'undefined') return;

  var $ = function (id) { return document.getElementById(id); };
  var preview = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('preview') === '1';
  var base = apiBase((window.MinistryFilesConfig || {}).apiBase || '');
  var me, currentId, items = [], nextPage = '', rootFolders = [], requestVersion = 0, busy = false, uploadJobs = [], toastTimer, manageAction;
  var previewFolders = ['小幼苗製作 SOP', '兒童歡慶教案', '主日活動照片與影片', '老師教育訓練', '教會主要活動教案', '季會議', '注音字型'];
  var sampleFolders = previewFolders.map(function (name, index) { return { id: 'preview-folder-' + index, name: name, mimeType: FOLDER, modifiedTime: '2026-11-02T04:00:00Z' }; });
  function el(tag, className, text) {
    var node = document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  }
  function button(text, className, action) {
    var node = el('button', className || 'button', text); node.type = 'button'; node.addEventListener('click', action); return node;
  }
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(function () { $('toast').hidden = true; }, 4500);
  }
  function gate(title, message, login) {
    $('gate').hidden = false; $('workspace').hidden = true; $('gateTitle').textContent = title; $('gateMessage').textContent = message;
    $('gateLogin').hidden = !login; $('gateRetry').hidden = !!login;
    $('gateLogin').href = PlatformModule.loginHref('files');
  }
  async function request(path, options) {
    options = options || {};
    if (preview) {
      if (path === '/api/me') return { name: '示範同工', admin: false, canUpload: false, rootId: 'preview-root', chunkBytes: 8388608, maxUploadBytes: 10737418240 };
      if (path.indexOf('/api/folders?') === 0) {
        var query = new URLSearchParams(path.split('?')[1]); var id = query.get('folderId') || 'preview-root';
        var parent = sampleFolders.find(function (f) { return f.id === id; });
        var list = id === 'preview-root' ? sampleFolders : [
          { id: 'preview-file-1', name: '本週教案.pdf', mimeType: 'application/pdf', size: 2480000, modifiedTime: '2026-11-01T06:00:00Z' },
          { id: 'preview-file-2', name: '同工預備事項.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 142000, modifiedTime: '2026-10-28T06:00:00Z' }
        ];
        var search = query.get('search') || '';
        return { path: [{ id: 'preview-root', name: '全部資料夾' }].concat(parent ? [{ id: parent.id, name: parent.name }] : []),
          files: list.filter(function (f) { return f.name.toLowerCase().indexOf(search.toLowerCase()) !== -1; }), nextPageToken: '' };
      }
      throw new Error('這是畫面預覽，尚未接通上傳與管理。');
    }
    var token = PlatformModule.getToken();
    if (!token) { PlatformModule.requirePlatformLogin('files'); throw new Error('請先登入教會平台。'); }
    var response;
    try {
      response = await fetch(base + path, Object.assign({}, options, { cache: 'no-store', headers: Object.assign({ Authorization: 'Bearer ' + token }, options.headers || {}) }));
    } catch (e) { throw new Error('連線暫時中斷。檔案仍保留在你的裝置，可以重新嘗試。'); }
    var data;
    try { data = await response.json(); } catch (e) { throw new Error('檔案服務暫時沒有回應，請稍後重試。'); }
    if (response.status === 401) {
      gate('請重新登入', data.error || '登入已過期，請回平台重新登入。', true);
      PlatformModule.requirePlatformLogin('files', { afterRejectedToken: true, reason: 'session_expired' });
    }
    if (response.status === 403 && (data.code === 'ACCOUNT_DISABLED' || data.code === 'TEAM_REQUIRED')) gate('目前無法開啟檔案區', data.error, false);
    if (!response.ok) { var error = new Error(data.error || '暫時無法完成操作。'); error.code = data.code; throw error; }
    return data;
  }
  function jsonRequest(path, body, method) { return request(path, { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  function navigate(id) {
    $('searchInput').value = ''; var hash = '#folder=' + encodeURIComponent(id);
    if (location.hash === hash) loadFolder(id); else location.hash = hash;
  }
  function fromHash() { return new URLSearchParams(location.hash.slice(1)).get('folder') || (me && me.rootId); }
  function renderNav() {
    $('folderNav').replaceChildren();
    rootFolders.forEach(function (folder) {
      var node = button(folder.name, 'folder-nav' + (currentId === folder.id ? ' active' : ''), function () { navigate(folder.id); });
      $('folderNav').append(node);
    });
    $('allFiles').classList.toggle('active', currentId === me.rootId);
  }
  function openFile(file, inline) {
    if (preview) { toast(inline ? '畫面預覽尚未接通實際檔案預覽。' : '畫面預覽尚未接通下載。'); return; }
    var form = el('form'); form.method = 'POST'; form.action = base + (inline ? '/preview' : '/download'); form.target = '_blank'; form.rel = 'noopener'; form.hidden = true;
    var fields = { fileId: file.id, sessionToken: PlatformModule.getToken() || '' };
    Object.keys(fields).forEach(function (name) { var input = el('input'); input.name = name; input.value = fields[name]; form.append(input); });
    document.body.append(form); form.submit(); form.remove();
    toast(inline ? '已在新分頁開啟預覽。' : '已開啟下載，請查看瀏覽器的下載進度。');
  }
  function download(file) { openFile(file, false); }
  function openManage(kind, file) {
    if (preview) return;
    manageAction = { kind: kind, file: file, parentId: currentId };
    $('dialogTitle').textContent = kind === 'new' ? '新增資料夾' : kind === 'rename' ? '重新命名' : '移到垃圾桶';
    $('dialogMessage').textContent = kind === 'trash' ? '「' + file.name + '」會移到 Drive 垃圾桶，不會永久刪除。' : '請使用同工容易辨認的名稱。';
    $('dialogName').value = file ? file.name : '';
    $('dialogName').hidden = kind === 'trash'; $('dialogLabel').hidden = kind === 'trash';
    $('dialogSave').textContent = kind === 'trash' ? '移到垃圾桶' : '儲存';
    $('dialogSave').className = 'button ' + (kind === 'trash' ? 'danger' : 'primary');
    $('dialogError').textContent = ''; $('manageDialog').showModal();
    if (kind !== 'trash') $('dialogName').focus();
  }
  function renderFiles() {
    $('fileList').replaceChildren(); $('itemCount').textContent = items.length + ' 個項目' + (nextPage ? '・尚有更多' : '');
    if (!items.length) $('fileList').append(el('div', 'empty', $('searchInput').value.trim() ? '這個資料夾裡找不到符合的檔案。' : '這個資料夾目前沒有檔案。'));
    items.forEach(function (file) {
      var isFolder = file.mimeType === FOLDER; var row = el('div', 'file-row');
      var label = isFolder ? '▰' : file.mimeType === 'application/pdf' ? 'PDF' : file.mimeType.indexOf('video/') === 0 ? '影片' : '檔案';
      var icon = el('span', 'file-icon' + (isFolder ? '' : ' document'), label); icon.setAttribute('aria-hidden', 'true'); row.append(icon);
      var info = el('div'); info.append(button(file.name, 'file-name', function () { if (isFolder) navigate(file.id); else openFile(file, canPreview(file.mimeType)); }));
      var date = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
      info.append(el('div', 'file-meta', [isFolder ? '資料夾' : formatBytes(file.size), date].filter(Boolean).join(' · '))); row.append(info);
      var actions = el('div', 'row-actions');
      if (canPreview(file.mimeType)) actions.append(button('預覽', 'button quiet', function () { openFile(file, true); }));
      actions.append(button(isFolder ? '開啟 →' : '↓ 下載', 'button quiet', function () { if (isFolder) navigate(file.id); else download(file); }));
      if (me.admin && !preview) {
        var menu = el('details'); var summary = el('summary', '', '⋯'); summary.setAttribute('aria-label', '管理「' + file.name + '」'); menu.append(summary);
        var options = el('div', 'menu'); options.append(button('重新命名', '', function () { menu.open = false; openManage('rename', file); }));
        if (!isFolder) options.append(button('移到垃圾桶', 'danger', function () { menu.open = false; openManage('trash', file); }));
        menu.append(options); actions.append(menu);
      }
      row.append(actions); $('fileList').append(row);
    });
    $('loadMore').hidden = !nextPage;
  }
  async function loadFolder(id, append) {
    if (!me) return;
    var version = ++requestVersion; var search = $('searchInput').value.trim(); var page = append ? nextPage : '';
    $('fileList').setAttribute('aria-busy', 'true'); $('loadError').hidden = true; $('loadMore').disabled = true;
    if (!append) { $('fileList').replaceChildren(el('div', 'loading', '正在讀取檔案…')); }
    try {
      var query = new URLSearchParams({ folderId: id, search: search }); if (page) query.set('pageToken', page);
      var data = await request('/api/folders?' + query);
      if (version !== requestVersion) return;
      currentId = id; nextPage = data.nextPageToken || '';
      items = append ? items.concat(data.files.filter(function (file) { return !items.some(function (old) { return old.id === file.id; }); })) : data.files;
      $('folderTitle').textContent = id === me.rootId ? '全部資料夾' : data.path[data.path.length - 1].name;
      $('breadcrumbs').replaceChildren();
      data.path.forEach(function (part, index) {
        if (index) $('breadcrumbs').append(el('span', '', '›'));
        $('breadcrumbs').append(button(index === 0 ? '全部資料夾' : part.name, '', function () { navigate(part.id); }));
      });
      if (id === me.rootId && !search && !append) rootFolders = data.files.filter(function (file) { return file.mimeType === FOLDER; });
      renderNav(); renderFiles();
    } catch (error) {
      if (version !== requestVersion) return;
      $('loadError').textContent = error.message; $('loadError').hidden = false;
      if (!append) $('fileList').replaceChildren(el('div', 'empty', '讀取失敗，請按「重新整理」再試。'));
    } finally {
      if (version === requestVersion) { $('fileList').setAttribute('aria-busy', 'false'); $('loadMore').disabled = false; }
    }
  }
  function renderUploads() {
    $('uploads').hidden = !uploadJobs.length; $('uploads').replaceChildren();
    uploadJobs.forEach(function (job) {
      var row = el('div', 'upload-item'); row.append(el('strong', 'upload-label', job.file.name));
      var progress = el('progress'); progress.max = job.file.size; progress.value = job.offset; progress.setAttribute('aria-label', job.file.name + ' 上傳進度'); row.append(progress);
      row.append(el('div', 'upload-detail', job.message || (formatBytes(job.offset) + ' / ' + formatBytes(job.file.size))));
      if (job.state === 'error' || job.state === 'paused') {
        var controls = el('div', 'upload-buttons'); controls.append(button('重新嘗試', 'button', function () { if (!busy) { job.state = 'waiting'; runUploads(); } })); row.append(controls);
      } else if (job.state === 'uploading') {
        row.append(button('暫停', 'button', function () { job.pause = true; job.message = '正在暫停…'; renderUploads(); }));
      }
      $('uploads').append(row);
    });
  }
  async function runUploads() {
    if (busy) return; busy = true;
    for (var job of uploadJobs) {
      if (job.state !== 'waiting') continue;
      job.state = 'uploading'; job.pause = false; job.message = '準備上傳到「' + job.destination + '」…'; renderUploads();
      try {
        if (!job.handle) {
          var session = await jsonRequest('/api/uploads/start', { parentId: job.parentId, name: job.file.name, size: job.file.size, mimeType: job.file.type || 'application/octet-stream' });
          job.handle = session.handle; job.chunk = session.chunkBytes;
        } else {
          var status = await jsonRequest('/api/uploads/status', { handle: job.handle });
          if (status.done) { job.offset = job.file.size; job.state = 'done'; }
          else job.offset = status.offset;
        }
        while (job.state !== 'done' && job.offset < job.file.size && !job.pause) {
          var range = chunkRange(job.offset, job.file.size, job.chunk);
          var result = await request('/api/uploads/chunk', { method: 'PUT', headers: { 'X-Upload-Handle': job.handle, 'Content-Range': range.header }, body: job.file.slice(range.start, range.end) });
          var previousOffset = job.offset;
          if (result.done) { job.offset = job.file.size; job.state = 'done'; }
          else { job.offset = result.offset; if (job.offset <= previousOffset || job.offset >= job.file.size) throw new Error('上傳進度尚未確認，請重新嘗試。'); }
          job.message = '上傳到「' + job.destination + '」・' + formatBytes(job.offset) + ' / ' + formatBytes(job.file.size); renderUploads();
        }
        if (job.pause && job.state !== 'done') { job.state = 'paused'; job.message = '已暫停。保持這個頁面開啟，即可繼續上傳。'; }
        else if (job.state === 'done') { job.message = '上傳完成・' + job.destination; if (currentId === job.parentId) await loadFolder(currentId); }
      } catch (error) {
        job.state = 'error';
        if (error.code === 'BAD_UPLOAD' || error.code === 'NOT_FOUND') { job.handle = ''; job.offset = 0; }
        job.message = error.message + ' 保持頁面開啟，再按「重新嘗試」。';
      }
      renderUploads();
    }
    busy = false;
  }
  function addFiles(files) {
    if (preview || !me || !currentId) return;
    var added = 0;
    Array.from(files).forEach(function (file) {
      if (!file.size || file.size > me.maxUploadBytes) { toast('「' + file.name + '」為空白或超過 ' + formatBytes(me.maxUploadBytes) + ' 上限。'); return; }
      if (uploadJobs.some(function (job) { return job.state !== 'done' && job.file.name === file.name && job.file.size === file.size && job.file.lastModified === file.lastModified && job.parentId === currentId; })) return;
      uploadJobs.push({ file: file, parentId: currentId, destination: $('folderTitle').textContent, offset: 0, state: 'waiting' }); added++;
    });
    if (added) { renderUploads(); runUploads(); }
  }
  $('shareFolder').addEventListener('click', async function () {
    if (preview || !currentId) { toast('本機預覽不能分享給其他人；正式上線後可複製連結。'); return; }
    try {
      await navigator.clipboard.writeText(folderLink(location.href, currentId));
      toast('已複製此資料夾連結；接收者仍須具備兒童／幼幼事工權限。');
    } catch (error) { toast('無法自動複製，請直接複製瀏覽器網址列。'); }
  });
  $('allFiles').addEventListener('click', function () { navigate(me.rootId); });
  $('refresh').addEventListener('click', function () { loadFolder(fromHash()); });
  $('gateRetry').addEventListener('click', function () { location.reload(); });
  $('searchForm').addEventListener('submit', function (event) { event.preventDefault(); loadFolder(currentId || me.rootId); });
  $('loadMore').addEventListener('click', function () { loadFolder(currentId, true); });
  $('newFolder').addEventListener('click', function () { openManage('new'); });
  $('chooseFiles').addEventListener('click', function () { if (!preview) $('fileInput').click(); });
  $('dropZone').addEventListener('click', function () { if (!preview) $('fileInput').click(); });
  $('dropZone').addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!preview) $('fileInput').click(); } });
  $('fileInput').addEventListener('change', function () { addFiles($('fileInput').files); $('fileInput').value = ''; });
  ['dragenter', 'dragover'].forEach(function (name) { $('dropZone').addEventListener(name, function (event) { event.preventDefault(); if (!preview) $('dropZone').classList.add('dragging'); }); });
  ['dragleave', 'drop'].forEach(function (name) { $('dropZone').addEventListener(name, function (event) { event.preventDefault(); $('dropZone').classList.remove('dragging'); if (name === 'drop') addFiles(event.dataTransfer.files); }); });
  $('dialogCancel').addEventListener('click', function () { $('manageDialog').close(); });
  $('manageForm').addEventListener('submit', async function (event) {
    event.preventDefault(); if (!manageAction) return;
    $('dialogSave').disabled = true; $('dialogError').textContent = '';
    try {
      if (manageAction.kind === 'new') await jsonRequest('/api/folders', { parentId: manageAction.parentId, name: $('dialogName').value });
      else await jsonRequest('/api/files/' + encodeURIComponent(manageAction.file.id), { name: $('dialogName').value }, manageAction.kind === 'trash' ? 'DELETE' : 'PATCH');
      $('manageDialog').close(); toast('已完成，檔案清單已更新。'); await loadFolder(currentId);
    } catch (error) { $('dialogError').textContent = error.message; }
    finally { $('dialogSave').disabled = false; }
  });
  window.addEventListener('hashchange', function () { if (me) { $('searchInput').value = ''; loadFolder(fromHash()); } });
  window.addEventListener('beforeunload', function (event) { if (uploadJobs.some(function (job) { return job.state !== 'done'; })) { event.preventDefault(); event.returnValue = ''; } });
  async function boot() {
    if (!preview && !base) { gate('檔案站準備中', '尚未接通儲存服務，請稍後由教會平台入口開啟。', false); return; }
    if (!preview && !PlatformModule.getToken()) { PlatformModule.requirePlatformLogin('files'); return; }
    try {
      me = await request('/api/me'); PlatformModule.markModuleAuthenticated('files');
      $('identity').replaceChildren(el('strong', '', me.name), el('span', '', preview ? '畫面預覽' : me.admin ? '檔案管理員' : '事工同工'));
      $('newFolder').hidden = !me.admin; $('chooseFiles').disabled = preview;
      $('shareFolder').disabled = preview;
      $('dropZone').setAttribute('aria-disabled', String(preview)); $('previewBanner').hidden = !preview;
      $('gate').hidden = true; $('workspace').hidden = false; currentId = fromHash(); await loadFolder(currentId);
    } catch (error) { if (!$('workspace').hidden) return; gate('目前無法開啟檔案區', error.message, false); }
  }
  boot();
})();
