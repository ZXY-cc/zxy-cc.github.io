/* 星梦Staream · 互动区装载器（零依赖）
 * 评论区与点赞计数是本站原生 DOM：Waline 客户端与样式都放在 assets/vendor，
 * 只有数据请求发往自建 serverURL，不受第三方 OAuth / CDN 影响。
 * SPA 用 hash 路由、静态阅读版用 /posts/<slug>.html，统一用 /post/<slug>
 * 作为 path，保证两边共用同一串评论与同一个点赞计数。
 */
(function () {
  var C = window.ZB_INTERACTIONS || {};
  /* 静态阅读版在 /posts/ 下，SPA 在站点根；相对路径也支持本地直接打开 */
  var BASE = /\/posts\/[^/]+\.html$/.test(String(location.pathname || '')) ? '../assets/' : 'assets/';
  var JS_SRC = BASE + 'vendor/waline.umd.js';
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
      hint('评论组件没能加载，稍后刷新试试；也可以到 GitHub Discussions 留言。');
    };
    (document.head || document.body).appendChild(s);
  }

  function mount(slug) {
    if (!ready() || !document.getElementById) return false;
    var box = document.getElementById('waline-thread');
    var s0 = articleSlug(slug);
    if (!box || !s0) return false;
    /* 同一篇文章的重绘不销毁实例，避免正在发布评论时被重置 */
    if (curSlug === s0 && inst) return true;
    curSlug = s0;
    if (inst && inst.destroy) { try { inst.destroy(); } catch (e) { /* 已卸载 */ } }
    inst = null;
    box.innerHTML = '';
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
          r.then(function (i) { inst = i; }, function () {
            hint('评论服务暂时连不上，稍后再试；也可以到 GitHub Discussions 留言。');
          });
        } else inst = r;
      } catch (e) {
        hint('评论服务暂时连不上，稍后再试；也可以到 GitHub Discussions 留言。');
      }
    });
    return true;
  }

  /* 主题切换由 dark 选择器自动生效，这里只保留统一接口 */
  function syncTheme() { return isNight(); }

  window.ZBInteractions = {
    ready: ready,
    mount: mount,
    syncTheme: syncTheme,
    discussionsUrl: C.discussionsUrl || ''
  };
})();
