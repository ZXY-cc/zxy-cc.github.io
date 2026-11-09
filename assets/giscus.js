/* 星梦Staream · giscus 装载器（零依赖）
 * SPA 用 hash 路由，所有文章共享同一个 pathname，所以不用 pathname 映射，
 * 改为 mapping=specific + 稳定 term「post:<slug>」：SPA 与静态阅读版共用同一条 discussion。
 * 主题切换通过 giscus 的 setConfig 消息实时同步，无需重载 iframe。
 */
(function () {
  var C = window.ZB_GISCUS || {};
  var CLIENT = 'https://giscus.app/client.js';

  function ready() {
    return !!(C.repo && C.repoId && C.category && C.categoryId);
  }
  function isNight() {
    try {
      return !!(document.documentElement && document.documentElement.dataset &&
        document.documentElement.dataset.theme === 'night');
    } catch (e) { return false; }
  }
  function themeUrl() { return isNight() ? C.themeNight : C.themeDay; }

  /* 静态阅读版直接传 slug；SPA 从 hash 里取 */
  function articleSlug(slug) {
    if (slug) return String(slug);
    var m = String(location.hash || '').match(/^#\/post\/([^/?#]+)/);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  function mount(slug) {
    if (!ready() || !document.createElement || !document.getElementById) return false;
    var box = document.getElementById('giscus-thread');
    var s0 = articleSlug(slug);
    if (!box || !s0) return false;

    /* 新 discussion 的正文回链指向 SPA 文章页，而不是被 giscus 清掉 hash 的首页 */
    var meta = document.querySelector && document.querySelector('meta[name="giscus:backlink"]');
    if (meta && meta.setAttribute) {
      meta.setAttribute('content', 'https://zxy-blog.top/#/post/' + encodeURIComponent(s0));
    }

    /* 切换文章时清掉上一篇文章的 iframe，再重新挂载 */
    while (box.firstChild) box.removeChild(box.firstChild);
    var s = document.createElement('script');
    function set(k, v) { if (v) s.setAttribute('data-' + k, v); }
    s.src = CLIENT;
    set('repo', C.repo);
    set('repo-id', C.repoId);
    set('category', C.category);
    set('category-id', C.categoryId);
    set('mapping', 'specific');
    set('term', 'post:' + s0);
    set('strict', '0');
    set('reactions-enabled', '1');
    set('emit-metadata', '0');
    set('input-position', 'top');
    set('theme', themeUrl());
    set('lang', 'zh-CN');
    set('loading', 'lazy');
    if ('crossOrigin' in s) s.crossOrigin = 'anonymous';
    s.async = true;
    box.appendChild(s);
    return true;
  }

  function syncTheme() {
    var frame = document.querySelector && document.querySelector('iframe.giscus-frame');
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage(
        { giscus: { setConfig: { theme: themeUrl() } } }, 'https://giscus.app');
    } catch (e) { /* 跨域 iframe 偶尔还没就绪，忽略 */ }
  }

  /* 加载/授权失败时给出 Discussions 直达入口，不留一块空白 */
  if (window.addEventListener) {
    window.addEventListener('message', function (e) {
      if (e.origin !== 'https://giscus.app') return;
      if (!e.data || !e.data.giscus || !e.data.giscus.error) return;
      var hint = document.getElementById && document.getElementById('giscus-fallback');
      if (hint) hint.hidden = false;
    });
  }

  window.ZBGiscus = {
    ready: ready,
    mount: mount,
    syncTheme: syncTheme,
    themeUrl: themeUrl,
    discussionsUrl: C.discussionsUrl || ''
  };
})();
