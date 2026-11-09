/* 星梦Staream · 留言归档渲染器（零依赖，构建端与浏览器共用）
 * 唯一数据源：data/comments.json —— 随站点仓库版本化的纯文本资产。
 * 构建时把归档烘焙进 posts/*.html，SPA 由 app.js 调用同一个 render()，
 * 两边不会版式分叉。输出一律经转义，只含纯文本与本站标签，不引任何外部资源。
 *
 * 数据格式（schema 2）：
 * { schema:2, source:"github-issues", repository, updatedAt, pageSize:20,
 *   posts:{ "<slug>": { likes:0, comments:[
 *     { id, root, parent, nick, link, content, date, likes, url }
 *   ] } } }
 * url 是 GitHub 原留言 / 原回复的永久链接，点赞数来自 GitHub 的 👍 反应。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ZBArchive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* 服务端存的评论是 HTML；归档只留纯文本，避免十年后换渲染器还要处理旧标记 */
  function plain(v) {
    return esc(String(v == null ? '' : v)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|blockquote)>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, '&')
      .replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim())
      .replace(/\n/g, '<br>');
  }
  function safeUrl(v) {
    return /^https?:\/\/[^\s]+$/i.test(v || '') ? esc(v) : '';
  }
  function byDate(a, b) {
    return String(a.date || '').localeCompare(String(b.date || ''));
  }
  function item(c, inner) {
    var nick = esc(c.nick || '匿名');
    var link = safeUrl(c.link);
    var name = link
      ? '<a href="' + link + '" target="_blank" rel="noopener nofollow">' + nick + '</a>'
      : nick;
    var date = esc(String(c.date || '').slice(0, 10));
    var like = Number(c.likes || 0) > 0
      ? '<span class="zb-archive-like">♥ ' + Number(c.likes) + '</span>' : '';
    var url = safeUrl(c.url);
    var origin = url
      ? '<a class="zb-archive-origin" href="' + url +
        '" target="_blank" rel="noopener nofollow">原留言 ↗</a>' : '';
    return '<li class="zb-archive-item">' +
      '<div class="zb-archive-meta"><span class="zb-archive-nick">' + name + '</span>' +
      (date ? '<time>' + date + '</time>' : '') + like + origin + '</div>' +
      '<div class="zb-archive-text">' + plain(c.content) + '</div>' +
      (inner || '') + '</li>';
  }

  function render(data, slug) {
    var post = data && data.posts && data.posts[slug];
    if (!post) return '';
    var list = Array.isArray(post.comments) ? post.comments.slice() : [];
    var likes = Number(post.likes || 0);
    if (!list.length && !likes) return '';
    var limit = Number(data && data.pageSize) > 0 ? Number(data.pageSize) : 20;

    var roots = [], replies = {}, rootIds = {};
    list.forEach(function (c) {
      var rid = (c.root == null || c.root === '') ? '' : String(c.root);
      if (rid && rid !== String(c.id)) {
        (replies[rid] = replies[rid] || []).push(c);
      } else {
        roots.push(c); rootIds[String(c.id)] = true;
      }
    });
    /* 根评论被删掉时，回复不能跟着消失：提升为顶层留言 */
    Object.keys(replies).forEach(function (rid) {
      if (!rootIds[rid]) replies[rid].forEach(function (c) { roots.push(c); });
    });
    Object.keys(replies).forEach(function (rid) { if (!rootIds[rid]) delete replies[rid]; });
    roots.sort(byDate);

    function row(c) {
      var kids = (replies[String(c.id)] || []).slice().sort(byDate);
      var inner = kids.length
        ? '<ul class="zb-archive-replies">' + kids.map(function (k) { return item(k); }).join('') + '</ul>'
        : '';
      return item(c, inner);
    }
    var shown = roots.slice(0, limit);
    var rest = roots.slice(limit);
    var rows = shown.map(row).join('');
    /* <details> 是纯 HTML：静态阅读版不执行脚本也能展开更早的留言 */
    var more = rest.length
      ? '<details class="zb-archive-more"><summary>继续阅读（还有 ' + rest.length +
        ' 条）</summary><ol class="zb-archive-list">' + rest.map(row).join('') +
        '</ol></details>'
      : '';

    var head = '<div class="zb-archive-head">' +
      '<span class="zb-archive-title">留言存档 · 只读保留</span>' +
      (list.length ? '<span class="zb-archive-count">' + list.length + ' 条</span>' : '') +
      (likes > 0 ? '<span class="zb-archive-total">♥ ' + likes + '</span>' : '') +
      '</div>';
    return '<div class="zb-archive" id="zb-archive">' + head +
      (rows ? '<ol class="zb-archive-list">' + rows + '</ol>' : '') + more +
      '<p class="zb-archive-note">留言保存在本站仓库的 GitHub Issues，并随站点一起存档；' +
      '关闭或删除的留言会在下次同步后移除。</p>' +
      '</div>';
  }

  return { render: render, esc: esc, plain: plain };
});
