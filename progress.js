/* 共用進度提示（服事平台與管理後台共用）。
 * - 頂端進度條：任何請求超過 0.4 秒就出現；進度依「平常要多久」推算，快到 90% 會放慢，真的完成才跳到 100%。
 * - 按鈕：按下後鎖住並轉圈，避免以為沒反應又按一次。
 * - 等太久：超過 slowAfter 毫秒，在畫面上方顯示「仍在處理中，請不要關閉頁面」。
 * 用法：var h = ChurchProgress.begin({ expected: 4000, write: true, button: el }); ... h.end();
 */
(function (root) {
  'use strict';
  // 樣式放在 progress.css：有些頁面（兒童檔案）的安全設定不允許程式臨時加 <style>，外部樣式檔則都允許
  (function loadCss() {
    if (typeof document === 'undefined' || document.querySelector('link[data-cp]')) return;
    var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'progress.css?v=1'; link.setAttribute('data-cp', '');
    (document.head || document.documentElement).appendChild(link);
  })();
  var bar = null, slowEl = null, active = [], timer = null, shownAt = 0;

  function ensure() {
    if (bar || !document.body) return;
    bar = document.createElement('div'); bar.className = 'cp-bar'; bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
  }
  /* 依經過時間推算進度：平常時間（expected）走到約 80%，之後越來越慢、最多 92% */
  function estimate(h, now) {
    var t = (now - h.t0) / Math.max(800, h.expected);
    return Math.min(0.92, 1 - Math.exp(-1.6 * t));
  }
  function tick() {
    var now = Date.now();
    if (!active.length) return;
    var p = 0;
    active.forEach(function (h) { p = Math.max(p, estimate(h, now)); });
    var visible = active.some(function (h) { return now - h.t0 > 400; });
    if (visible) {
      ensure();
      if (!bar.classList.contains('on')) { bar.classList.add('on'); shownAt = now; }
      bar.style.width = (8 + p * 90) + '%';
    }
    var slow = active.filter(function (h) { return h.slowAfter && now - h.t0 > h.slowAfter; })[0];
    if (slow && !slowEl) {
      ensure();
      slowEl = document.createElement('div'); slowEl.className = 'cp-slow'; slowEl.setAttribute('role', 'status');
      slowEl.textContent = slow.slowText || '比平常久，仍在處理中，請先不要關閉頁面';
      document.body.appendChild(slowEl);
    }
    active.forEach(function (h) { if (h.onTick) h.onTick(estimate(h, now), now - h.t0); });
  }
  function finishAll() {
    clearInterval(timer); timer = null;
    if (slowEl) { slowEl.remove(); slowEl = null; }
    if (!bar || !bar.classList.contains('on')) return;
    bar.style.width = '100%';
    setTimeout(function () { if (!active.length && bar) { bar.classList.remove('on'); setTimeout(function () { if (!active.length && bar) bar.style.width = '0'; }, 260); } }, 220);
  }

  function begin(opts) {
    opts = opts || {};
    var h = {
      t0: Date.now(),
      expected: opts.expected || (opts.write ? 4000 : 2500),
      slowAfter: opts.slowAfter === undefined ? (opts.write ? 12000 : 20000) : opts.slowAfter,
      slowText: opts.slowText,
      onTick: opts.onTick,
      button: null
    };
    var b = opts.button;
    if (b && b.tagName === 'BUTTON' && !b.disabled) { b.disabled = true; b.classList.add('cp-busy'); b.setAttribute('aria-busy', 'true'); h.button = b; }
    active.push(h);
    if (!timer) timer = setInterval(tick, 200);
    h.end = function () {
      var i = active.indexOf(h); if (i === -1) return;
      active.splice(i, 1);
      if (h.button) { h.button.disabled = false; h.button.classList.remove('cp-busy'); h.button.removeAttribute('aria-busy'); }
      if (!active.length) finishAll();
    };
    return h;
  }
  /* 包一個 Promise：開始時 begin、結束（成功或失敗）時 end */
  function track(promise, opts) {
    var h = begin(opts);
    return promise.then(function (v) { h.end(); return v; }, function (e) { h.end(); throw e; });
  }
  /* 剛剛被按下的按鈕（呼叫 API 時順手鎖住它）。Safari 點按鈕不會讓它取得焦點，所以自己記最後一次點擊 */
  var lastBtn = null, lastAt = 0;
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b) { lastBtn = b; lastAt = Date.now(); }
  }, true);
  function pressedButton() {
    if (lastBtn && Date.now() - lastAt < 1500 && document.contains(lastBtn)) return lastBtn;
    var el = document.activeElement;
    return el && el.tagName === 'BUTTON' ? el : null;
  }
  root.ChurchProgress = { begin: begin, track: track, pressedButton: pressedButton };
})(typeof self !== 'undefined' ? self : this);
