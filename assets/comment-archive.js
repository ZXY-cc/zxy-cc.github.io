/* 星梦Staream · 留言归档渲染器（零依赖，构建端与浏览器共用）
 * 唯一数据源：data/comments.json —— 随站点仓库版本化的纯文本资产。
 * 构建时把归档烘焙进 posts/*.html，SPA 由 app.js 调用同一个 render()，
 * 两边不会版式分叉。输出一律经转义，只含纯文本与本站标签，不引任何外部资源。
 *
 * 数据格式（schema 1）：
 * { schema:1, updatedAt:"ISO", posts:{ "<slug>": {
 *     likes: 0,
 *     comments:[ { id, root, parent, nick, link, content, date, likes } ]
 * } } }
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
  function byDate(a, b) {
    return String(a.date || '').localeCompare(String(b.date || ''));
  }
  function item(c, inner) {
    var nick = esc(c.nick || '匿名');
    var link = /^https?:\/\/[^\s]+$/i.test(c.link || '') ? esc(c.link) : '';
    var name = link
      ? '<a href="' + link + '" target="_blank" rel="noopener nofollow">' + nick + '</a>'
      : nick;
    var date = esc(String(c.date || '').slice(0, 10));
    var like = Number(c.likes || 0) > 0
      ? '<span class="zb-archive-like">♥ ' + Number(c.likes) + '</span>' : '';
    return '<li class="zb-archive-item">' +
      '<div class="zb-archive-meta"><span class="zb-archive-nick">' + name + '</span>' +
      (date ? '<time>' + date + '</time>' : '') + like + '</div>' +
      '<div class="zb-archive-text">' + plain(c.content) + '</div>' +
      (inner || '') + '</li>';
  }

  function render(data, slug) {
    var post = data && data.posts && data.posts[slug];
    if (!post) return '';
    var list = Array.isArray(post.comments) ? post.comments.slice() : [];
    var likes = Number(post.likes || 0);
    if (!list.length && !likes) return '';

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

    var rows = roots.map(function (c) {
      var kids = (replies[String(c.id)] || []).slice().sort(byDate);
      var inner = kids.length
        ? '<ul class="zb-archive-replies">' + kids.map(function (k) { return item(k); }).join('') + '</ul>'
        : '';
      return item(c, inner);
    }).join('');

    var head = '<div class="zb-archive-head">' +
      '<span class="zb-archive-title">留言存档</span>' +
      (list.length ? '<span class="zb-archive-count">' + list.length + ' 条</span>' : '') +
      (likes > 0 ? '<span class="zb-archive-total">♥ ' + likes + '</span>' : '') +
      '</div>';
    return '<div class="zb-archive" id="zb-archive">' + head +
      (rows ? '<ol class="zb-archive-list">' + rows + '</ol>' : '') +
      '<p class="zb-archive-note">这些留言已随站点仓库存档，评论服务停用或更换后依然保留。</p>' +
      '</div>';
  }

  return { render: render, esc: esc, plain: plain };
});
