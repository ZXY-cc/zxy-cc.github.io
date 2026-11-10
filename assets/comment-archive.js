/* 星梦Staream · 留言渲染器（零依赖，构建端 / 浏览器 / 实时层共用）
 * 唯一数据源：data/comments.json —— 随站点仓库版本化的纯文本资产。
 * 构建时把归档烘焙进 posts/*.html，SPA 与实时层调用同一个 render()，
 * 三处不会版式分叉。输出一律经转义，只含纯文本与本站标签，不引任何外部资源。
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
  /* 留言正文保留 Markdown 原文：Markdown 本身就是可读的纯文本，十年后没有渲染器
     也读得懂；显示端统一用 mdPreview 渲染（先转义再生成有限标签），
     与发布预览、GitHub Issue 页同一套语法 */
  function mdRaw(s) {
    return String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim();
  }
  function safeUrl(v) {
    return /^https?:\/\/[^\s]+$/i.test(v || '') ? esc(v) : '';
  }
  function byDate(a, b) {
    return String(a.date || '').localeCompare(String(b.date || ''));
  }
  function plusOne(x) {
    var n = x && x.reactions && Number(x.reactions['+1']);
    return Number.isFinite(n) ? n : 0;
  }
  function actor(u) {
    return { nick: (u && u.login) || '匿名', link: (u && u.html_url) || '' };
  }
  /* 先审后发：配置了 approvalLabel 就只认带同名标签的留言 */
  function approved(it, label) {
    var need = String(label || '').trim();
    if (!need) return true;
    return Array.isArray(it.labels) && it.labels.some(function (l) {
      return String((l && (l.name || l)) || '') === need;
    });
  }
  function issueToComment(it, md) {
    var who = actor(it.user);
    return {
      id: 'i' + it.number, root: '', parent: '',
      nick: who.nick, link: who.link,
      content: (md || mdRaw)(it.body),
      date: String(it.created_at || '').slice(0, 10),
      likes: plusOne(it), url: String(it.html_url || '')
    };
  }
  function replyToComment(c, rootId, md) {
    var who = actor(c.user);
    return {
      id: 'c' + c.id, root: rootId, parent: rootId,
      nick: who.nick, link: who.link,
      content: (md || mdRaw)(c.body),
      date: String(c.created_at || '').slice(0, 10),
      likes: plusOne(c), url: String(c.html_url || '')
    };
  }
  function makeData(slug, comments, opts) {
    var o = opts || {};
    var rows = comments || [];
    var likes = 0;
    rows.forEach(function (c) { likes += Number(c.likes || 0); });
    var posts = {};
    posts[slug] = { likes: likes, comments: rows };
    return {
      schema: 2, source: 'github-issues', repository: String(o.repository || ''),
      updatedAt: new Date().toISOString(),
      pageSize: Number(o.pageSize) > 0 ? Number(o.pageSize) : 20,
      posts: posts
    };
  }

  /* 发布前预览用的小型 Markdown 渲染：先整体转义再生成有限的几个标签，
     不加载外部图片、不放行任何原文 HTML。最终展示以 GitHub 的渲染为准。 */
  function mdInline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi, function (_, alt, u) {
        return '<a href="' + u + '" target="_blank" rel="noopener nofollow">[图片] ' +
          (alt || u) + '</a>';
      })
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener nofollow">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  }
  function mdPreview(src) {
    var text = esc(String(src == null ? '' : src).replace(/\r\n?/g, '\n'));
    var blocks = [];
    text = text.replace(/```([^\n]*)\n([\s\S]*?)```/g, function (_, lang, code) {
      blocks.push('<pre><code>' + code.replace(/\n$/, '') + '</code></pre>');
      return '\n\u0000' + (blocks.length - 1) + '\u0000\n';
    });
    var out = [], para = [], listTag = '', inQuote = false;
    function closePara() {
      if (para.length) { out.push('<p>' + para.map(mdInline).join('<br>') + '</p>'); para = []; }
    }
    function closeList() { if (listTag) { out.push('</' + listTag + '>'); listTag = ''; } }
    function closeQuote() { if (inQuote) { out.push('</blockquote>'); inQuote = false; } }
    String(text).split('\n').forEach(function (line) {
      var bk = line.match(/^\s*\u0000(\d+)\u0000\s*$/);
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      var q = line.match(/^&gt;\s?(.*)$/);
      var ul = line.match(/^\s*[-*+]\s+(.*)$/);
      var ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (bk) { closePara(); closeList(); closeQuote(); out.push(blocks[Number(bk[1])] || ''); }
      else if (h) { closePara(); closeList(); closeQuote();
        out.push('<h' + h[1].length + '>' + mdInline(h[2]) + '</h' + h[1].length + '>'); }
      else if (q) { closePara(); closeList();
        if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
        out.push('<p>' + mdInline(q[1]) + '</p>'); }
      else if (ul) { closePara(); closeQuote();
        if (listTag !== 'ul') { closeList(); out.push('<ul>'); listTag = 'ul'; }
        out.push('<li>' + mdInline(ul[1]) + '</li>'); }
      else if (ol) { closePara(); closeQuote();
        if (listTag !== 'ol') { closeList(); out.push('<ol>'); listTag = 'ol'; }
        out.push('<li>' + mdInline(ol[1]) + '</li>'); }
      else if (/^\s*$/.test(line)) { closePara(); closeList(); closeQuote(); }
      else { closeList(); closeQuote(); para.push(line); }
    });
    closePara(); closeList(); closeQuote();
    return out.join('');
  }

  /* 发布框：页面内直接写，最后一步交给 GitHub 登录确认；SPA 与静态阅读版同一份 HTML */
  function composerHtml() {
    return '<div class="zb-composer" id="zb-composer">' +
      '<div class="zb-composer-label-row">' +
      '<label class="zb-composer-label" for="zb-composer-input">写下想说的话</label>' +
      '<button class="zb-composer-md" type="button" id="zb-composer-md" aria-pressed="false" ' +
      'title="支持 Markdown 语法：**加粗**、*斜体*、~~删除线~~、`代码`、[链接](url)、引用、列表等">预览 Markdown</button>' +
      '</div>' +
      '<textarea class="zb-composer-input" id="zb-composer-input" rows="3" maxlength="2000" ' +
      'placeholder="路过、读后感，或者只是打个招呼…（支持 Markdown 语法）"></textarea>' +
      '<div class="zb-composer-preview" id="zb-composer-preview" hidden aria-live="polite"></div>' +
      '<div class="zb-composer-bar">' +
      '<span class="zb-composer-tip">支持 Markdown · 留言会公开保存在本站仓库 · 发布需 GitHub 账号</span>' +
      '<span class="zb-composer-count" id="zb-composer-count">0 / 2000</span>' +
      '<button class="interactions-btn primary" type="button" id="zb-composer-submit">发布留言</button>' +
      '</div>' +
      '<p class="zb-composer-after" id="zb-composer-after" hidden>' +
      '已打开 GitHub 发布页，登录后确认提交；回来刷新就能在这里看到。</p>' +
      '</div>';
  }
  function emptyHtml(id) {
    return '<div class="zb-archive zb-empty" id="' + esc(id || 'zb-archive') + '">' +
      '<span class="zb-empty-star" aria-hidden="true">✦</span>' +
      '<p class="zb-empty-title">还没有留言</p>' +
      '<p class="zb-empty-note">在上方写下第一句话吧，留言会长期保存在本站仓库里。</p>' +
      '</div>';
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
      '<div class="zb-archive-text">' + mdPreview(c.content) + '</div>' +
      (inner || '') + '</li>';
  }

  /* opts: { live:true 实时态文案, empty:true 无留言时给空状态, id:自定义容器 id } */
  function render(data, slug, opts) {
    var o = opts || {};
    var post = data && data.posts && data.posts[slug];
    if (!post) return o.empty ? emptyHtml(o.id) : '';
    var list = Array.isArray(post.comments) ? post.comments.slice() : [];
    var likes = Number(post.likes || 0);
    if (!list.length && !likes) return o.empty ? emptyHtml(o.id) : '';
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
      '<span class="zb-archive-title">' +
      (o.live ? '最新留言' : '留言存档 · 只读保留') + '</span>' +
      (list.length ? '<span class="zb-archive-count">' + list.length + ' 条</span>' : '') +
      (likes > 0 ? '<span class="zb-archive-total">♥ ' + likes + '</span>' : '') +
      '</div>';
    var note = o.live
      ? '留言实时读取自本站仓库的 GitHub Issues，发布后刷新即可看到；关闭或删除的留言会自动消失。'
      : '留言保存在本站仓库的 GitHub Issues，并随站点一起存档；关闭或删除的留言会在下次同步后移除。';
    return '<div class="zb-archive"' + (o.live ? ' data-live="1"' : '') +
      ' id="' + esc(o.id || 'zb-archive') + '">' + head +
      (rows ? '<ol class="zb-archive-list">' + rows + '</ol>' : '') + more +
      '<p class="zb-archive-note">' + note + '</p>' +
      '</div>';
  }

  return {
    render: render, esc: esc, plain: plain, mdRaw: mdRaw, mdPreview: mdPreview,
    plusOne: plusOne, actor: actor, approved: approved,
    issueToComment: issueToComment, replyToComment: replyToComment,
    makeData: makeData, composerHtml: composerHtml, emptyHtml: emptyHtml
  };
});
