/* 星梦Staream · 爱心点赞 + 文章浏览量（零依赖）
 * 纯静态站没有数据库，全局计数走免费匿名接口 Abacus
 * （https://abacus.jasoncameron.dev）：/get/<ns>/<key> 读总数、
 * /hit/<ns>/<key> 点一次 +1，无需登录、CORS 全开、限速 30 次/10 秒/IP。
 * 点赞：本机 localStorage（zb-likes）记「已赞」，一台设备只计一次。
 * 浏览：只数匿名访客——带创作台设备标记（站长本人）与 ?preview=1 都不计数；
 *       每个浏览器会话、每篇文章（以及整站首页）只 +1 次，避免刷新刷屏；
 *       countView 由文章页的 [data-view-post] 触发，整站首页由
 *       [data-view-home] 触发，首页文章卡片的 [data-view] 只读不写。
 * 数字一致性：页面显示的点赞数与浏览量只认服务端 /get 的真实总数，
 *   所有设备在同一时刻读到的都是同一个服务端值。
 * 抗抖动（接口偶发变慢 / 超时，避免全站显示 0）：
 *   1. 请求统一排队（并发 ≤3、间隔 250ms），不再一拥而上挤爆 6 连接；
 *   2. 单次超时 15s，失败自动重试一次；
 *   3. 会话内读数缓存 5 分钟，翻页不再重复打接口；
 *   4. 部署时由构建脚本把服务端各键的当时总数烘进 data/counts.json，
 *      页面先加载这份「全站统一基线」立即显示，接口成功后用真值覆盖；
 *      接口彻底失联时，所有设备显示的都是同一份基线，不再各显各的 0。
 *   错误响应一律按失败处理（绝不把错误当成 0 缓存展示）；
 *   /hit 失败的浏览与点赞进本地补账队列（zb-hitq），下次 mount 时
 *   静默重打（每页最多 5 笔、间隔 400ms，防触发限速）。 */
(function () {
  'use strict';
  var NS_LIKE = 'zxy-blog-heart';
  /* 浏览计数归零：匿名键无法在服务端重置（管理接口要 admin key），
     因此换一段全新命名空间，所有文章与首页的浏览数都从 0 重新累计。 */
  var NS_VIEW = 'zxy-blog-views2';
  var API = 'https://abacus.jasoncameron.dev';
  var LIKE_KEY = 'zb-likes';
  var OWNER_KEY = 'zb-owner-device';
  var NO_COUNT_KEY = 'zb-no-count';
  /* v4 缓存：会话内 5 分钟。翻页 / 回首页不再对每个卡片重复打接口，
     新会话仍然立即拉服务端真值，过期自动重拉。 */
  var CACHE_KEY = 'zb-count:v4:';
  var QUEUE_KEY = 'zb-hitq:v1';
  var VIEWED_KEY = 'zb-viewed:v1:';
  var TTL = 5 * 60 * 1000;
  var TIMEOUT = 15000;
  var RETRY_WAIT = 1200;
  /* API 请求排队：并发 ≤3、出队间隔 250ms。首页一次要拉几十个键，
     并发打满浏览器 6 连接后，慢接口会把后面的请求全部拖到超时。 */
  var Q_MAX = 3, Q_GAP = 250;
  var BASELINE_URL = 'data/counts.json';
  var DRAIN_MAX = 5, DRAIN_GAP = 400;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* ---------- 数字逐位滚动（odometer）----------
     每个数位独立一列 0~9（末尾多放一个 0 供 9→0 折返），只滚动发生
     变化的位。总时长全站统一 ROLL_MS，缓动 easeInOutCubic（慢→快→慢）。
     设置页「数字滚动动画」三档（localStorage zb-roll-mode）：
       all  = 浏览量与点赞量都滚动；
       part = 默认，仅点赞量滚动，浏览量直接显示；
       off  = 全部直接落文本。
     无 WAAPI / 减少动态偏好 / 沙箱环境直接落文本，不影响功能。 */
  var ROLL_MS = 1000;
  function rollCan() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    } catch (e) { /* 判不了就按支持处理 */ }
    return typeof window.requestAnimationFrame === 'function' &&
      typeof window.Element === 'function' && Element.prototype.animate;
  }
  function rollMode() {
    try {
      var m = window.localStorage && window.localStorage.getItem('zb-roll-mode');
      if (m === 'all' || m === 'part' || m === 'off') return m;
    } catch (e) { /* 判不了就按默认档 */ }
    return 'part';
  }
  /* 单列滚动：to 是数位栈里的行号（0~9，10 = 折返的 0）。
     自愈关键：动画启动的同时就把内联 transform 写成目标行——动画播放期间
     由 WAAPI 关键帧覆盖显示；无论动画正常结束、被下一次滚动取消还是意外
     丢失，元素回落到的内联值永远是最新的目标行，绝不会卡在半行。
     起点取当前视觉位置（可能是上一次滚动被打断的半行处），接续平滑不跳变。 */
  function rollCol(c, to, snap) {
    var col = c.col;
    var fs = parseFloat(getComputedStyle(col).fontSize) || 16;
    var from = c.cur;
    if (col.getAnimations) {
      var runs = col.getAnimations();
      for (var i = 0; i < runs.length; i++) {
        try {
          var t = getComputedStyle(col).transform;
          if (t && t !== 'none') {
            var m = t.match(/matrix.*\((.+?)\)/);
            if (m) { var ty = Number(m[1].split(',')[5]); from = -ty / fs; }
          }
        } catch (e) { /* 取不到就按逻辑行起步 */ }
        try { runs[i].cancel(); } catch (e) { /* 忽略 */ }
      }
    }
    if (!(from > -0.01)) from = 0; /* 防御：非法值回 0 */
    c.cur = snap ? 0 : to;
    col.style.transform = 'translateY(' + (-c.cur) + 'em)';
    col.animate([
      { transform: 'translateY(' + (-from) + 'em)' },
      { transform: 'translateY(' + (-c.cur) + 'em)' }
    ], { duration: ROLL_MS, easing: 'cubic-bezier(.45,.05,.2,1)' });
    /* 看门狗：滚动结束后强制取消残存动画并落回内联目标行——即使动画被
       浏览器意外冻结/丢失，这一列也必定显示逻辑目标行，绝不卡在半行。 */
    if (c.wd) window.clearTimeout(c.wd);
    c.wd = window.setTimeout(function () {
      c.wd = 0;
      if (col.getAnimations) {
        var runs = col.getAnimations();
        for (var k = 0; k < runs.length; k++) { try { runs[k].cancel(); } catch (e) { /* 忽略 */ } }
      }
      col.style.transform = 'translateY(' + (-c.cur) + 'em)';
    }, ROLL_MS + 150);
  }
  function rollText(el, target, live) {
    /* live = 计数器标记：'like'（点赞数）/'view'（浏览量）。三档语义：
       all  = 浏览量与点赞量都滚动；
       part = 默认，仅点赞量滚动（浏览量直接显示）；
       off  = 全部直接落文本。 */
    if (!el) return;
    target = Math.max(0, Math.round(Number(target) || 0));
    var mode = rollMode();
    var st = el.__zbRoll;
    if (mode === 'off' || !live || (mode === 'part' && live !== 'like') || !rollCan()) {
      if (st) { if (st.wrap.parentNode) st.wrap.parentNode.removeChild(st.wrap); el.__zbRoll = null; }
      el.textContent = String(target);
      return;
    }
    if (!st) {
      var wrap = document.createElement('span');
      wrap.className = 'zb-roll';
      el.textContent = '';
      el.appendChild(wrap);
      st = el.__zbRoll = { el: el, wrap: wrap, cols: [], shown: null };
    }
    var ts = String(target);
    /* 位数增减：新列插在最前（数字向左生长），删列也从最前删 */
    while (st.cols.length < ts.length) {
      var dig = document.createElement('span');
      dig.className = 'zb-dig';
      var col = document.createElement('span');
      col.className = 'zb-col';
      col.style.transform = 'translateY(0em)';
      for (var d = 0; d <= 10; d++) {
        var cell = document.createElement('span');
        cell.textContent = String(d % 10);
        col.appendChild(cell);
      }
      dig.appendChild(col);
      st.wrap.insertBefore(dig, st.wrap.firstChild);
      st.cols.unshift({ col: col, cur: 0 });
    }
    while (st.cols.length > ts.length) {
      var gone = st.cols.shift();
      var digEl = gone.col && gone.col.parentNode;
      if (digEl && digEl.parentNode) digEl.parentNode.removeChild(digEl);
    }
    var first = st.shown == null; /* 首次挂载：每一位都从 0 滚到目标 */
    for (var i = 0; i < st.cols.length; i++) {
      var td = Number(ts.charAt(i));
      var c = st.cols[i];
      if (first || c.cur !== td) {
        if (c.cur === 9 && td === 0) rollCol(c, 10, true);          /* 9→0 走折返位 */
        else rollCol(c, td, false);
      }
    }
    st.shown = target;
  }
  /* Abacus key 只允许 [A-Za-z0-9_-.]：连字符分隔（kind 前缀 + 条目 id） */
  function counterKey(kind, id) {
    var raw = String(kind) + '-' + String(id);
    return /^[A-Za-z0-9_\-.]{3,64}$/.test(raw) ? raw : '';
  }
  function readLikes() {
    try { return JSON.parse(window.localStorage.getItem(LIKE_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function liked(kind, id) {
    var l = readLikes();
    return !!(l[kind + ':' + id] || (kind === 'moment' && l[id]));
  }
  function markLiked(kind, id) {
    try {
      var l = readLikes();
      l[kind + ':' + id] = 1;
      window.localStorage.setItem(LIKE_KEY, JSON.stringify(l));
    } catch (e) { /* 隐私模式记不住，不影响本次点亮 */ }
  }
  /* 站长设备：设置页可显式排除本机，创作台解锁设备与预览态也一律不计入。
     静态阅读版没有创作台脚本，就直接认本机标记。这个判断只用于「不给自己刷浏览量」，不是安全边界。 */
  function ownerDevice() {
    try {
      if (window.localStorage && window.localStorage.getItem(NO_COUNT_KEY) === '1') return true;
      if (window.STUDIO && typeof window.STUDIO.isOwner === 'function' && window.STUDIO.isOwner()) return true;
      var m = JSON.parse(window.localStorage.getItem(OWNER_KEY) || 'null');
      return !!(m && m.t && Date.now() - m.t < 90 * 86400000 * 1000 &&
        /^[a-f0-9]{64}$/.test(m.sig || ''));
    } catch (e) { return false; }
  }
  function previewMode() {
    return /(?:^|[?&])preview=1(?:&|$)/.test(String(window.location && window.location.search || ''));
  }
  function cacheGet(k) {
    try {
      var s = window.sessionStorage;
      var raw = s && s.getItem(CACHE_KEY + k);
      if (!raw) return null;
      var box = JSON.parse(raw);
      if (!box || !box.t || Date.now() - box.t > TTL) return null;
      return box.n;
    } catch (e) { return null; }
  }
  function cacheSet(k, n) {
    try {
      var s = window.sessionStorage;
      if (s) s.setItem(CACHE_KEY + k, JSON.stringify({ t: Date.now(), n: n }));
    } catch (e) { /* 忽略 */ }
  }
  function rawFetch(url) {
    var f = window.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!f) return Promise.reject(new Error('fetch 不可用'));
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) { try { ctrl.abort(); } catch (e) {} } }, TIMEOUT);
    return f.call(window, url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (!r) throw new Error('无响应');
      if (r.status === 404) return { value: 0 };
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (v) {
      /* 服务端故障窗口会返回 200 + 错误 JSON（如 Failed to get data），
         这不是 0——按失败处理，绝不缓存或显示成 0。 */
      var n = v && Number(v.value);
      if (Number.isFinite(n) && n >= 0) return n;
      throw new Error('接口返回异常');
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }
  /* 排队器：所有 Abacus 请求走同一条队，并发 ≤ Q_MAX、出队间隔 Q_GAP。
     注意每个出队项要用 IIFE 单独捕获，否则 var 共享变量会让先完成的
     请求把结果 resolve 到别的排队者上（首页浏览量会显示成点赞数）。 */
  var qWait = [], qActive = 0, qTimer = null;
  function qPump() {
    if (qTimer) return;
    qTimer = window.setTimeout(function () {
      qTimer = null;
      while (qActive < Q_MAX && qWait.length) {
        (function (it) {
          qActive++;
          rawFetch(it.url).then(function (v) {
            qActive--;
            it.resolve(v);
            qPump();
          }, function (e) {
            qActive--;
            it.reject(e);
            qPump();
          });
        }(qWait.shift()));
      }
      if (qWait.length && qActive < Q_MAX) qPump();
    }, qActive ? Q_GAP : 0);
  }
  function apiFetch(path) {
    return new Promise(function (resolve, reject) {
      qWait.push({ url: API + path, resolve: resolve, reject: reject });
      qPump();
    });
  }
  /* 单键请求：失败自动重试一次（接口偶发抖动不直接判死） */
  function fetchJson(path) {
    return apiFetch(path).then(null, function () {
      return new Promise(function (resolve, reject) {
        window.setTimeout(function () {
          apiFetch(path).then(resolve, reject);
        }, RETRY_WAIT);
      });
    });
  }
  function cacheKey(ns, k) { return ns + ':' + k; }
  /* 补账队列：/hit 失败的浏览与点赞先记下，下次页面加载静默补打 */
  function readQueue() {
    try {
      var q = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(q) ? q : [];
    } catch (e) { return []; }
  }
  function writeQueue(q) {
    try { window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-40))); }
    catch (e) { /* 记不住就放弃补账，不影响本次使用 */ }
  }
  function enqueue(ns, k) {
    var s = ns + '/' + k, q = readQueue();
    if (q.indexOf(s) < 0) { q.push(s); writeQueue(q); }
  }
  function dequeue(ns, k) {
    var s = ns + '/' + k, q = readQueue(), i = q.indexOf(s);
    if (i >= 0) { q.splice(i, 1); writeQueue(q); }
  }
  /* 全站统一基线：部署时构建脚本把各键的服务端总数写进 data/counts.json。
     接口失联时所有设备回落到同一份数字；基线到达后立即补画到还没拿到
     真值的槽位上（已显示真值的不覆盖）。 */
  var BASE = null, BASE_P = null;
  function baselineFile() {
    try {
      var p = String(window.location && window.location.pathname || '/');
      return /\/posts\//.test(p) ? '../' + BASELINE_URL : BASELINE_URL;
    } catch (e) { return BASELINE_URL; }
  }
  function baselineLoad() {
    if (BASE_P) return BASE_P;
    BASE_P = new Promise(function (resolve) {
      var f = window.fetch || (typeof fetch === 'function' ? fetch : null);
      if (!f) { BASE = {}; return resolve(BASE); }
      f.call(window, baselineFile()).then(function (r) {
        if (!r || !r.ok) throw new Error('基线 HTTP ' + (r && r.status));
        return r.json();
      }).then(function (v) {
        BASE = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
      }).catch(function () {
        BASE = {};
      }).then(function () { resolve(BASE); });
    });
    return BASE_P;
  }
  function baseVal(ns, kind, id) {
    if (!BASE) return null;
    var v = BASE[(ns === NS_LIKE ? 'like:' : 'view:') + kind + ':' + id];
    return (typeof v === 'number' && v >= 0) ? v : null;
  }
  /* 基线补画：只填还停在初始占位（没有 data-live 标记）的槽位 */
  function paintBaseline(root) {
    if (!BASE) return;
    function paint(el, v) {
      if (el.getAttribute('data-live')) return;
      var target = el.tagName === 'BUTTON' ? el.querySelector('span') : el;
      if (target) rollText(target, v, true);
    }
    Array.prototype.forEach.call(root.querySelectorAll('[data-like]'), function (btn) {
      var kind = btn.getAttribute('data-like-kind') || 'moment';
      var id = btn.getAttribute('data-like-id') || '';
      var v = baseVal(NS_LIKE, kind, id);
      if (v != null) paint(btn, v);
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-like-stat]'), function (el) {
      var v0 = String(el.getAttribute('data-like-stat') || '').split(':');
      if (v0.length < 2) return;
      var v = baseVal(NS_LIKE, v0[0], v0.slice(1).join(':'));
      if (v != null) paint(el, v);
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-view]'), function (el) {
      var v = baseVal(NS_VIEW, 'post', el.getAttribute('data-view'));
      if (v != null) paint(el, v);
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-view-home]'), function (el) {
      var v = baseVal(NS_VIEW, HOME_KIND, homeCounterId());
      if (v != null) paint(el, v);
    });
  }
  /* 只读服务端真值；接口失败回落到部署基线（全站同一份数字），
     成功的槽位带 data-live 标记，基线补画不会覆盖。 */
  function readCount(ns, kind, id) {
    var k = counterKey(kind, id);
    if (!k) return Promise.resolve(null);
    var ck = cacheKey(ns, k), c = cacheGet(ck);
    if (c != null) return Promise.resolve(c);
    return fetchJson('/get/' + ns + '/' + k).then(function (n) {
      cacheSet(ck, n);
      return n;
    }, function () {
      return baselineLoad().then(function () {
        var v = baseVal(ns, kind, id);
        if (v == null) throw new Error('接口失败且无基线');
        return v;
      });
    });
  }
  function bumpCount(ns, kind, id) {
    var k = counterKey(kind, id);
    if (!k) return Promise.resolve(null);
    return fetchJson('/hit/' + ns + '/' + k).then(function (n) {
      cacheSet(cacheKey(ns, k), n);
      dequeue(ns, k);
      return n;
    }, function (e) {
      enqueue(ns, k);
      throw e;
    });
  }
  /* 补账：把之前失败的打点逐笔补上（每页最多 DRAIN_MAX 笔，防限速） */
  var draining = false;
  function drainQueue() {
    if (draining || !readQueue().length) return;
    draining = true;
    var done = 0;
    var step = function () {
      var q = readQueue();
      if (!q.length || done >= DRAIN_MAX) { draining = false; return; }
      var s = q[0], slash = s.indexOf('/');
      var ns = s.slice(0, slash), k = s.slice(slash + 1);
      fetchJson('/hit/' + ns + '/' + k).then(function (n) {
        cacheSet(cacheKey(ns, k), n);
        dequeue(ns, k);
        done++;
        window.setTimeout(step, DRAIN_GAP);
      }, function () { draining = false; });
    };
    step();
  }
  function getCount(kind, id) { return readCount(NS_LIKE, kind, id); }
  function hitCount(kind, id) { return bumpCount(NS_LIKE, kind, id); }
  /* 浏览量键位：文章 post-<slug>，整站首页 site-home。
     文章的会话标记沿用旧格式，首页单独用一段新标记，互不干扰。 */
  var VIEW_KIND_POST = 'post';
  var HOME_KIND = 'site', HOME_ID = 'home';
  /* 首页浏览键随 DATA.site.homeViewsVer 轮换：创作台「清空首页浏览量」把版本 +1，
     访客端改读 site-home-vN 新键（Abacus 匿名键无法在服务端清零，只能换键归零）；
     点赞键 site-home 不轮换，爱心数据不受影响。 */
  function homeCounterId() {
    var v = 1, site = (window.STUDIO_DATA && window.STUDIO_DATA.site) || null;
    if (site && Number(site.homeViewsVer) >= 1) v = Math.floor(Number(site.homeViewsVer));
    return v <= 1 ? HOME_ID : 'home-v' + v;
  }
  function viewMark(kind, id) {
    return VIEWED_KEY + (kind === VIEW_KIND_POST ? id : kind + '-' + id);
  }
  function getViewCount(kind, id) { return readCount(NS_VIEW, kind, id); }
  /* 一次匿名浏览：站长 / 预览态 / 本会话已计过 → 只读取数不再 +1 */
  function countViewOnce(kind, id) {
    if (!id) return Promise.resolve(null);
    var mark = viewMark(kind, id);
    if (ownerDevice() || previewMode()) return getViewCount(kind, id);
    try {
      var s = window.sessionStorage;
      if (s) {
        if (s.getItem(mark)) return getViewCount(kind, id);
        s.setItem(mark, '1');
      }
    } catch (e) { /* 记不住就按每次打开计一次 */ }
    /* 打点失败会自动入补账队列；读数失败时所有设备统一回落部署基线 */
    return bumpCount(NS_VIEW, kind, id).catch(function () {
      return getViewCount(kind, id);
    });
  }
  function getViews(slug) { return getViewCount(VIEW_KIND_POST, slug); }
  function countView(slug) { return countViewOnce(VIEW_KIND_POST, slug); }
  function getHomeViews() { return getViewCount(HOME_KIND, homeCounterId()); }
  function countHomeView() { return countViewOnce(HOME_KIND, homeCounterId()); }

  /* 按钮结构：与说说页原有的爱心完全同款（灰 → 粉，点击放大）。
     数字只放站点静态基准，服务端真值由 mountLikes 统一覆盖；
     本机已赞不再 +1，避免同一篇文章在不同设备显示不同总数。 */
  function html(kind, id, base, extra) {
    var on = liked(kind, id);
    var n = Number(base || 0);
    return '<button class="like like-inline' + (on ? ' on' : '') +
      (extra ? ' ' + extra : '') + '" type="button" data-like="' + esc(kind + ':' + id) +
      '" data-like-kind="' + esc(kind) + '" data-like-id="' + esc(id) +
      '" data-like-base="' + Number(base || 0) + '"' +
      ' title="' + (on ? '已点赞，谢谢你喜欢' : '点个赞（每台设备计一次）') + '" ' +
      'aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#soft-heart"/></svg>' +
      '<span>' + n + '</span></button>';
  }
  function setCount(btn, n) {
    var span = btn.querySelector('span');
    if (span && typeof n === 'number') {
      rollText(span, n, 'like');
      btn.setAttribute('data-live', '1');
    }
  }
  /* 只读统计位（首页卡片、文章页署名行的点赞数）：与爱心按钮共用同一个总数 */
  function statSlots(kind, id) {
    var all = document.querySelectorAll ? document.querySelectorAll('[data-like-stat]') : [];
    return Array.prototype.filter.call(all, function (el) {
      return el.getAttribute('data-like-stat') === kind + ':' + id;
    });
  }
  function setStat(kind, id, n) {
    if (typeof n !== 'number') return;
    statSlots(kind, id).forEach(function (el) {
      rollText(el, n, 'like');
      el.setAttribute('data-live', '1');
    });
  }
  /* 点击：本机只赞一次；先本机点亮并乐观 +1，再以 /hit 返回的服务端值为准。
     打点失败回滚到部署基线（没有就退回静态基准），不保留本机私有 +1。 */
  function onLike(btn) {
    var kind = btn.getAttribute('data-like-kind') || 'moment';
    var id = btn.getAttribute('data-like-id') || '';
    if (!id || liked(kind, id)) return;
    markLiked(kind, id);
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('title', '已点赞，谢谢你喜欢');
    var base = Number(btn.getAttribute('data-like-base') || 0);
    var fallback = baseVal(NS_LIKE, kind, id);
    if (fallback == null) fallback = base;
    setCount(btn, fallback + 1);
    setStat(kind, id, fallback + 1);
    hitCount(kind, id).then(function (v) {
      setCount(btn, v); setStat(kind, id, v);
    }).catch(function () {
      setCount(btn, fallback); setStat(kind, id, fallback);
    });
  }
  /* 每次渲染后补拉服务端真实总数。服务器有数时以它为准（包括 0），
     本机已赞状态只决定按钮亮不亮；失败时回落到部署基线。 */
  function mountLikes(root) {
    baselineLoad().then(function () { paintBaseline(root); });
    var btns = root.querySelectorAll('[data-like]');
    Array.prototype.forEach.call(btns, function (btn) {
      if (btn.getAttribute('data-like-done')) return;
      btn.setAttribute('data-like-done', '1');
      var kind = btn.getAttribute('data-like-kind') || 'moment';
      var id = btn.getAttribute('data-like-id') || '';
      getCount(kind, id).then(function (n) {
        if (typeof n !== 'number') return;
        setCount(btn, n); setStat(kind, id, n);
      }).catch(function () { /* 基线补画兜底 */ });
    });
  }
  /* 首页卡片与文章页署名行上的只读点赞数 */
  function mountStats(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-like-stat]'), function (el) {
      var v = String(el.getAttribute('data-like-stat') || '').split(':');
      if (v.length < 2) return;
      var kind = v[0], id = v.slice(1).join(':');
      getCount(kind, id).then(function (n) {
        if (typeof n === 'number') { rollText(el, n, 'like'); el.setAttribute('data-live', '1'); }
      }).catch(function () { /* 基线补画兜底 */ });
    });
  }
  /* 浏览数：所有 [data-view] 显示槽统一填数，文章页的 [data-view-post] 触发计数 */
  function mountViews(root) {
    baselineLoad().then(function () { paintBaseline(root); });
    var slots = {}, hits = {};
    Array.prototype.forEach.call(root.querySelectorAll('[data-view]'), function (el) {
      var s = el.getAttribute('data-view');
      if (s) (slots[s] = slots[s] || []).push(el);
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-view-post]'), function (el) {
      var s = el.getAttribute('data-view-post');
      if (s) hits[s] = true;
    });
    Object.keys(slots).forEach(function (s) {
      var p;
      try { p = hits[s] ? countView(s) : getViews(s); }
      catch (e) { p = Promise.resolve(null); }
      Promise.resolve(p).then(function (n) {
        if (typeof n !== 'number') return;
        slots[s].forEach(function (el) {
          rollText(el, n, 'view');
          el.setAttribute('data-live', '1');
        });
      }).catch(function () { /* 基线补画兜底 */ });
    });
    /* 首页底部：整站首页的匿名浏览数，与文章同样每会话只 +1 */
    var homeSlots = root.querySelectorAll('[data-view-home]');
    if (homeSlots && homeSlots.length) {
      var hp;
      try { hp = countHomeView(); } catch (e) { hp = Promise.resolve(null); }
      Promise.resolve(hp).then(function (n) {
        if (typeof n !== 'number') return;
        Array.prototype.forEach.call(homeSlots, function (el) {
          rollText(el, n, 'view');
          el.setAttribute('data-live', '1');
        });
      }).catch(function () { /* 基线补画兜底 */ });
    }
  }
  function mount() {
    var root = document.getElementById('app') || document.body;
    if (!root || !root.querySelectorAll) return;
    mountLikes(root);
    mountStats(root);
    mountViews(root);
    drainQueue();
  }

  window.ZBLikes = {
    html: html, mount: mount, onLike: onLike,
    liked: liked, getCount: getCount, hitCount: hitCount,
    getViews: getViews, countView: countView,
    getHomeViews: getHomeViews, countHomeView: countHomeView,
    rollText: rollText, rollMode: rollMode,
    ownerDevice: ownerDevice, NO_COUNT_KEY: NO_COUNT_KEY
  };
})();
