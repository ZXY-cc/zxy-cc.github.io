/* 星梦Staream · 互动区装载器（零依赖、零网络请求）
 * 留言的最终存储是仓库里的 data/comments.json + GitHub Issues，页面只渲染归档：
 * 不加载任何评论组件、不发任何请求，服务停摆、换域名、十年后回看都能读。
 * 借鉴参考站：归档标为「只读保留」并留 GitHub 原链接；数据异常时给明确提示与重连。
 * SPA 用 hash 路由、静态阅读版用 /posts/<slug>.html，两边共用同一份归档。
 */
(function () {
  var C = window.ZB_INTERACTIONS || {};

  function ready() {
    return typeof C.repository === 'string' && /^[\w.-]+\/[\w.-]+$/.test(C.repository) &&
      typeof C.newIssueUrl === 'function';
  }
  function previewMode() {
    try {
      return /[?&]preview=1(?:&|$)/.test(String(location.search || ''));
    } catch (e) { return false; }
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
  function newIssueUrl(slug) {
    if (!ready()) return '';
    try { return String(C.newIssueUrl(articleSlug(slug)) || ''); } catch (e) { return ''; }
  }
  /* 归档数据是随站点一起发布的内联脚本；缺失时只提示并给一次重连，不伪造空白评论区 */
  function hint(msg) {
    var box = document.getElementById && document.getElementById('interactions-hint');
    if (!box) return;
    box.textContent = msg + ' ';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'interactions-retry';
    btn.textContent = '重新加载';
    btn.onclick = function () { try { location.reload(); } catch (e) { /* 忽略 */ } };
    box.appendChild(btn);
    box.hidden = false;
  }
  function mount(slug) {
    if (!document.getElementById) return false;
    var data = window.ZB_COMMENTS;
    var good = !!(data && data.posts && typeof data.posts === 'object' &&
      !Array.isArray(data.posts));
    var box = document.getElementById('interactions-hint');
    if (!good) {
      hint('留言暂时没能加载，可以重新载入页面再试。');
      return false;
    }
    if (box) box.hidden = true;
    void slug;
    return true;
  }

  window.ZBInteractions = {
    ready: ready,
    mount: mount,
    syncTheme: isNight,
    previewMode: previewMode,
    newIssueUrl: newIssueUrl,
    issuesUrl: String(C.issuesUrl || ''),
    pageSize: Number(C.pageSize) > 0 ? Number(C.pageSize) : 20
  };
})();
