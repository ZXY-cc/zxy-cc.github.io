/* 星梦Staream · 互动区装载器（零依赖）
 * 评论区与点赞计数是本站原生 DOM：Waline 客户端与样式都放在 assets/vendor，
 * 并且只在服务已接入且健康时按需加载，归档态不请求任何第三方资源。
 * SPA 用 hash 路由、静态阅读版用 /posts/<slug>.html，统一用 /post/<slug>
 * 作为 path，保证两边共用同一串评论与同一个点赞计数。
 *
 * 十年留存的关键：仓库里的留言归档（#zb-archive）永远先渲染。
 * 服务在线 → 隐藏归档、显示实时评论；服务未接入 / 探活失败 / 组件加载失败
 * → 自动回落显示归档，页面绝不空白，也不会与实时评论重复。
 */
(function () {
  var C = window.ZB_INTERACTIONS || {};
  /* 静态阅读版在 /posts/ 下，SPA 在站点根；相对路径也支持本地直接打开 */
  var BASE = /\/posts\/[^/]+\.html$/.test(String(location.pathname || '')) ? '../assets/' : 'assets/';
  var JS_SRC = BASE + 'vendor/waline.umd.js';
  var CSS_SRC = BASE + 'vendor/waline.css';
  var inst = null, curSlug = '', loading = false, waiters = [];

  function ready() {
    return typeof C.serverURL === 'string' && /^https?:\/\/[^\s]+$/.test(C.serverURL);
  }
  function isNight() {
    try {
      return !!(document.documentElement && document.documentElement.dataset &&
        document.documentElement.dataset.theme === 'night');
    } catch (e) { return false; }
  }
  function articleSlug(slug) {
    if (slug) return String(slug);
    var m = String(location.hash || '').match(/^#\/post\/([^/?#]+)/);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }
  function hint(msg) {
    var p = document.getElementById('interactions-hint');
    if (p) { p.textContent = msg; p.hidden = false; }
  }
  /* 归档是静态 HTML，切换只动 hidden 属性，不重建 DOM、不丢内容 */
  function archive(show) {
    var el = document.getElementById('zb-archive');
    if (el) el.hidden = !show;
  }
  function fallback(msg) {
    archive(true);
    hint(msg || '评论服务暂时连不上，先展示已存档的留言；也可以到 GitHub Discussions 留言。');
  }
  /* Waline 的 23KB 样式只在真正用到时注入，且必须排在本站覆盖样式之前 */
  function ensureCss() {
    if (document.querySelector && document.querySelector('link[data-waline-css]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_SRC;
    link.setAttribute('data-waline-css', '1');
    var anchor = document.querySelector
      ? document.querySelector('link[href*="interactions.css"]') : null;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(link, anchor);
    else (document.head || document.body).appendChild(link);
  }
  /* 探活：Waline 自身加载失败不一定会让 init() 抛错，先确认服务可达再挂载 */
  function probe(cb) {
    if (typeof fetch !== 'function') { cb(true); return; }
    var opt = {};
    try { opt.signal = AbortSignal.timeout(2500); } catch (e) { /* 旧浏览器不设超时 */ }
    fetch(String(C.serverURL).replace(/\/+$/, '') + '/health', opt)
      .then(function (r) { cb(!!(r && r.ok)); })
      .catch(function () { cb(false); });
  }
  function ensureJs(cb) {
    if (window.Waline && window.Waline.init) { cb(); return; }
    waiters.push(cb);
    if (loading) return;
    loading = true;
    var s = document.createElement('script');
    s.src = JS_SRC;
    s.async = true;
    s.onload = function () {
      loading = false;
      var list = waiters.slice(); waiters = [];
      list.forEach(function (f) { try { f(); } catch (e) { /* 单次挂载失败不影响其它回调 */ } });
    };
    s.onerror = function () {
      loading = false; waiters = [];
      fallback('评论组件没能加载，先展示已存档的留言；也可以到 GitHub Discussions 留言。');
    };
    (document.head || document.body).appendChild(s);
  }

  function mount(slug) {
    if (!document.getElementById) return false;
    var s0 = articleSlug(slug);
    if (!ready()) { archive(true); return false; }
    var box = document.getElementById('waline-thread');
    if (!box || !s0) { archive(true); return false; }
    /* 同一篇文章的重绘不销毁实例，避免正在发布评论时被重置 */
    if (curSlug === s0 && inst) return true;
    curSlug = s0;
    if (inst && inst.destroy) { try { inst.destroy(); } catch (e) { /* 已卸载 */ } }
    inst = null;
    box.innerHTML = '';
    archive(false);
    probe(function (alive) {
      if (!alive || curSlug !== s0) { if (curSlug === s0) fallback(); return; }
      ensureCss();
      ensureJs(function () {
        var el = document.getElementById('waline-thread');
        if (!el || !window.Waline || !window.Waline.init || curSlug !== s0) return;
        try {
          var r = window.Waline.init({
            el: '#waline-thread',
            serverURL: C.serverURL,
            path: '/post/' + s0,
            lang: 'zh-CN',
            /* CSS 选择器：日夜主题由本站 data-theme 驱动，无需重载组件 */
            dark: 'html[data-theme="night"]',
            /* 单个反应即点赞按钮，计数持久化在 Waline 数据库 */
            reaction: [C.heart],
            commentSorting: 'latest',
            pageSize: 10,
            requiredMeta: [],
            wordLimit: 1000,
            emoji: false,
            highlighter: false,
            texRenderer: false,
            search: false,
            imageUploader: false,
            locale: {
              reactionTitle: '喜欢这篇文章？点一下留个心',
              reaction0: '喜欢',
              placeholder: '写下你的想法…',
              sofa: '还没有留言，来坐沙发吧',
              submitText: '发布'
            }
          });
          if (r && typeof r.then === 'function') {
            r.then(function (i) { inst = i; }, function () { fallback(); });
          } else inst = r;
        } catch (e) {
          fallback();
        }
      });
    });
    return true;
  }

  /* 主题切换由 dark 选择器自动生效，这里只保留统一接口 */
  function syncTheme() { return isNight(); }

  window.ZBInteractions = {
    ready: ready,
    mount: mount,
    syncTheme: syncTheme,
    fallback: fallback,
    discussionsUrl: C.discussionsUrl || ''
  };
})();
