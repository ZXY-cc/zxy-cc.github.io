/* 星梦Staream · 爱心点赞（零依赖）
 * 纯静态站没有数据库，全局点赞数走免费匿名计数接口 Abacus
 * （https://abacus.jasoncameron.dev）：/get/<ns>/<key> 读总数、
 * /hit/<ns>/<key> 点一次 +1，无需登录、CORS 全开、限速 30 次/10 秒/IP。
 * 「已赞」记在本机 localStorage（zb-likes），一台设备只计一次；
 * 接口读数带 sessionStorage 缓存（120 秒），接口不可用时回落为
 * 数据基础数（字段 likes）+ 本机状态，爱心功能不因接口掉线而失效。
 * 点赞是单向的：点了就亮，与「每台设备只计一次」的计数口径一致。 */
(function () {
  'use strict';
  var NS = 'zxy-blog-heart';
  var API = 'https://abacus.jasoncameron.dev';
  var LIKE_KEY = 'zb-likes';
  var CACHE_KEY = 'zb-like:v1:';
  var TTL = 120000;
  var TIMEOUT = 5000;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* Abacus key 只允许 [A-Za-z0-9_-.]：连字符分隔（kind 前缀 + 条目 id，
     两者本身都不含连字符歧义冲突） */
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
  function getCount(kind, id) {
    var k = counterKey(kind, id);
    if (!k) return Promise.resolve(null);
    var c = cacheGet(k);
    if (c != null) return Promise.resolve(c);
    return fetchJson(API + '/get/' + NS + '/' + k).then(function (n) { cacheSet(k, n); return n; });
  }
  function hitCount(kind, id) {
    var k = counterKey(kind, id);
    if (!k) return Promise.resolve(null);
    return fetchJson(API + '/hit/' + NS + '/' + k).then(function (n) { cacheSet(k, n); return n; });
  }

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
  /* 点击：本机只赞一次；先本机点亮 +1，再请求 /hit 以服务器返回为准 */
  function onLike(btn) {
    var kind = btn.getAttribute('data-like-kind') || 'moment';
    var id = btn.getAttribute('data-like-id') || '';
    if (!id || liked(kind, id)) return;
    markLiked(kind, id);
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('title', '已点赞，谢谢你喜欢');
    setCount(btn, Number((btn.querySelector('span') || {}).textContent || 0) + 1);
    hitCount(kind, id).then(function (n) { setCount(btn, n); }).catch(function () { /* 保留本机 +1 */ });
  }
  /* 每次渲染后补拉真实总数（带缓存；接口挂了就停在回落值）。
     服务器有数时以它为准（本机已赞过的话服务器数里已经含这一次）；
     服务器为 0 而本机亮着时保留 1，接口失败时用「基础数 + 本机状态」回落。 */
  function mount() {
    var app = document.getElementById('app');
    if (!app || !app.querySelectorAll) return;
    var btns = app.querySelectorAll('[data-like]');
    Array.prototype.forEach.call(btns, function (btn) {
      if (btn.getAttribute('data-like-done')) return;
      btn.setAttribute('data-like-done', '1');
      var kind = btn.getAttribute('data-like-kind') || 'moment';
      var id = btn.getAttribute('data-like-id') || '';
      var base = Number(btn.getAttribute('data-like-base') || 0);
      var span = btn.querySelector('span');
      var fallback = base + (liked(kind, id) ? 1 : 0);
      getCount(kind, id).then(function (n) {
        if (!span) return;
        if (n > 0) span.textContent = String(n);
        else if (fallback > 0) span.textContent = String(fallback);
        else span.textContent = '0';
      }).catch(function () { /* 保留回落值 */ });
    });
  }

  window.ZBLikes = {
    html: html, mount: mount, onLike: onLike,
    liked: liked, getCount: getCount, hitCount: hitCount
  };
})();
