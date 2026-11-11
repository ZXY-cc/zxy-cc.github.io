/* 星梦Staream · 爱心点赞 + 文章浏览量（零依赖）
 * 纯静态站没有数据库，全局计数走免费匿名接口 Abacus
 * （https://abacus.jasoncameron.dev）：/get/<ns>/<key> 读总数、
 * /hit/<ns>/<key> 点一次 +1，无需登录、CORS 全开、限速 30 次/10 秒/IP。
 * 点赞：本机 localStorage（zb-likes）记「已赞」，一台设备只计一次。
 * 浏览：只数匿名访客——带创作台设备标记（站长本人）与 ?preview=1 都不计数；
 *       每个浏览器会话、每篇文章（以及整站首页）只 +1 次，避免刷新刷屏；
 *       countView 由文章页的 [data-view-post] 触发，整站首页由
 *       [data-view-home] 触发，首页文章卡片的 [data-view] 只读不写。
 * 读数带 sessionStorage 缓存（120 秒）；接口不可用时回落为数据基础数
 * （字段 likes）+ 本机状态，爱心与浏览显示都不因接口掉线而失效。 */
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
  /* 读数缓存升到 v2：浏览计数归零后，旧会话里的旧数字不会继续显示 */
  var CACHE_KEY = 'zb-count:v2:';
  var VIEWED_KEY = 'zb-viewed:v1:';
  var TTL = 120000;
  var TIMEOUT = 5000;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  function fetchJson(url) {
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
      var n = v && Number(v.value);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }
  function cacheKey(ns, k) { return ns + ':' + k; }
  function readCount(ns, kind, id) {
    var k = counterKey(kind, id);
    if (!k) return Promise.resolve(null);
    var ck = cacheKey(ns, k), c = cacheGet(ck);
    if (c != null) return Promise.resolve(c);
    return fetchJson(API + '/get/' + ns + '/' + k).then(function (n) { cacheSet(ck, n); return n; });
  }
  function bumpCount(ns, kind, id) {
    var k = counterKey(kind, id);
    if (!k) return Promise.resolve(null);
    return fetchJson(API + '/hit/' + ns + '/' + k).then(function (n) { cacheSet(cacheKey(ns, k), n); return n; });
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
    return bumpCount(NS_VIEW, kind, id).catch(function () { return null; });
  }
  function getViews(slug) { return getViewCount(VIEW_KIND_POST, slug); }
  function countView(slug) { return countViewOnce(VIEW_KIND_POST, slug); }
  function getHomeViews() { return getViewCount(HOME_KIND, homeCounterId()); }
  function countHomeView() { return countViewOnce(HOME_KIND, homeCounterId()); }

  /* 按钮结构：与说说页原有的爱心完全同款（灰 → 粉，点击放大） */
  function html(kind, id, base, extra) {
    var on = liked(kind, id);
    var n = Number(base || 0) + (on ? 1 : 0);
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
    if (span && typeof n === 'number') span.textContent = String(n);
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
    statSlots(kind, id).forEach(function (el) { el.textContent = String(n); });
  }
  /* 点击：本机只赞一次；先本机点亮 +1，再请求 /hit 以服务器返回为准 */
  function onLike(btn) {
    var kind = btn.getAttribute('data-like-kind') || 'moment';
    var id = btn.getAttribute('data-like-id') || '';
    if (!id || liked(kind, id)) return;
    markLiked(kind, id);
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('title', '已点赞，谢谢你喜欢');
    var n = Number((btn.querySelector('span') || {}).textContent || 0) + 1;
    setCount(btn, n);
    setStat(kind, id, n);
    hitCount(kind, id).then(function (v) {
      setCount(btn, v); setStat(kind, id, v);
    }).catch(function () { /* 保留本机 +1 */ });
  }
  /* 每次渲染后补拉真实总数（带缓存；接口挂了就停在回落值）。
     服务器有数时以它为准（本机已赞过的话服务器数里已经含这一次）；
     服务器为 0 而本机亮着时保留 1，接口失败时用「基础数 + 本机状态」回落。 */
  function mountLikes(root) {
    var btns = root.querySelectorAll('[data-like]');
    Array.prototype.forEach.call(btns, function (btn) {
      if (btn.getAttribute('data-like-done')) return;
      btn.setAttribute('data-like-done', '1');
      var kind = btn.getAttribute('data-like-kind') || 'moment';
      var id = btn.getAttribute('data-like-id') || '';
      var base = Number(btn.getAttribute('data-like-base') || 0);
      var span = btn.querySelector('span');
      var fallback = base + (liked(kind, id) ? 1 : 0);
      getCount(kind, id).then(function (n) {
        var real = n > 0 ? n : fallback;
        if (span) span.textContent = String(real);
        setStat(kind, id, real);
      }).catch(function () { /* 保留回落值 */ });
    });
  }
  /* 首页卡片与文章页署名行上的只读点赞数 */
  function mountStats(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-like-stat]'), function (el) {
      var v = String(el.getAttribute('data-like-stat') || '').split(':');
      if (v.length < 2) return;
      var kind = v[0], id = v.slice(1).join(':');
      getCount(kind, id).then(function (n) {
        if (typeof n === 'number') el.textContent = String(n > 0 ? n : (liked(kind, id) ? 1 : 0));
      }).catch(function () { /* 保留占位 0 */ });
    });
  }
  /* 浏览数：所有 [data-view] 显示槽统一填数，文章页的 [data-view-post] 触发计数 */
  function mountViews(root) {
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
        slots[s].forEach(function (el) { el.textContent = String(n); });
      }).catch(function () { /* 保留占位 0 */ });
    });
    /* 首页底部：整站首页的匿名浏览数，与文章同样每会话只 +1 */
    var homeSlots = root.querySelectorAll('[data-view-home]');
    if (homeSlots && homeSlots.length) {
      var hp;
      try { hp = countHomeView(); } catch (e) { hp = Promise.resolve(null); }
      Promise.resolve(hp).then(function (n) {
        if (typeof n !== 'number') return;
        Array.prototype.forEach.call(homeSlots, function (el) { el.textContent = String(n); });
      }).catch(function () { /* 保留占位 0 */ });
    }
  }
  function mount() {
    var root = document.getElementById('app') || document.body;
    if (!root || !root.querySelectorAll) return;
    mountLikes(root);
    mountStats(root);
    mountViews(root);
  }

  window.ZBLikes = {
    html: html, mount: mount, onLike: onLike,
    liked: liked, getCount: getCount, hitCount: hitCount,
    getViews: getViews, countView: countView,
    getHomeViews: getHomeViews, countHomeView: countHomeView,
    ownerDevice: ownerDevice, NO_COUNT_KEY: NO_COUNT_KEY
  };
})();
