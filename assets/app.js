(function () {
  var SITE = window.SITE || {};
  var DATA = window.STUDIO_DATA || {};
  var CFG = DATA.site || {};
  var app = document.getElementById('app');
  var query = '';
  var momentOrder = 'new';
  var chatterTag = '';
  var timelineTag = '';
  var lb = { list: [], index: 0 };

  function arr(k) { return (DATA[k] || []).slice(); }
  /* 标签展示顺序统一取工坊「标签管理」的标签库；分区用的 A / B 恒排在所有标签之后 */
  function orderedTags(tags) {
    var lib = (DATA.tagLibrary || []).slice();
    /* ⭐ 置顶标签恒排最前；A / B 分区标签恒排最后；其余按标签库顺序 */
    function rank(t) { return t === '⭐' ? 0 : (t === 'A' ? 2 : (t === 'B' ? 3 : 1)); }
    return (tags || []).slice().sort(function (a, b) {
      var ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra > 1) return a === 'A' ? -1 : 1;
      var ia = lib.indexOf(a), ib = lib.indexOf(b);
      if (ia < 0 && ib < 0) return String(a).localeCompare(String(b), 'zh');
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
  }
  /* ⭐ 置顶排序：带 ⭐ 的条目稳定地排在其它条目前方（组内保持原有时间序） */
  function pinnedFirst(list) {
    var head = [], tail = [];
    (list || []).forEach(function (p) {
      ((p && p.tags) || []).indexOf('⭐') >= 0 ? head.push(p) : tail.push(p);
    });
    return head.concat(tail);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function decode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  /* 旧文章的 body 是预渲染 HTML（无 Markdown 原文），里面的代码块没有高亮标记。
     把每个 zb-code 的 <code> 原文取出（剥掉旧标记、还原实体）后用渲染引擎重新上色；
     对已高亮的新渲染结果同样幂等。多语言标签组逐块取自己的 data-code-lang，
     旧文章只有显示名时由引擎还原成同一套语言词表。 */
  function rehlHtml(html) {
    var s = String(html || '');
    if (s.indexOf('<pre') < 0 || !window.ZBMD) return s;
    return s.replace(/<pre[^>]*>[\s\S]*?<\/pre>/g, function (blk) {
      if (blk.indexOf('<code') < 0) return blk;
      /* l=a-b 的行高亮块已逐行分词，重刷会拍平 zb-cline 结构，跳过 */
      if (blk.indexOf('zb-cline') >= 0) return blk;
      var lang = (blk.match(/data-code-lang="([^"]*)"/) || [])[1] ||
        (blk.match(/data-lang="([^"]*)"/) || [])[1] ||
        (blk.match(/class="zb-lang">([^<]*)</) || [])[1] || '';
      return blk.replace(/<code[^>]*>[\s\S]*?<\/code>/, function (cm) {
        var gt = cm.indexOf('>'), end = cm.lastIndexOf('</code>');
        var raw = cm.slice(gt + 1, end).replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        /* 无语言标识的块：优先按块内多语言结构逐段上色（示例块里的
           ```python … ```cpp … 源码），识别不出再回退通用/启发式上色 */
        if (!lang && window.ZBMD.highlightMulti) {
          var mh = window.ZBMD.highlightMulti(raw);
          if (mh) return '<code>' + mh + '</code>';
        }
        if (!lang && /#include|#define\b/.test(raw)) lang = 'c';
        return '<code>' + window.ZBMD.highlight(raw, lang) + '</code>';
      });
    });
  }
  /* 工坊预览与线上文章阅读共用同一套重刷上色（多语言示例块逐段上色等），保证两边一致 */
  try { window.ZBRehl = rehlHtml; } catch (e) {}
  function avatarImg(cls) {
    return '<img class="' + (cls || 'avatar') + '" src="' + esc(CFG.avatar || 'assets/avatar.jpg') +
      '" alt="' + esc(CFG.author || SITE.author || '我') + '的头像" decoding="async">';
  }
  function avatarSrc() { return esc(CFG.avatar || 'assets/avatar.jpg'); }
  /* 首页卡片上的只读统计：心形用页面里的图形精灵，眼睛用内联路径 */
  var HEART_SVG = '<svg class="stat-heart" viewBox="0 0 100 100" aria-hidden="true">' +
    '<use href="#soft-heart"/></svg>';
  var EYE_SVG = '<svg class="stat-eye" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/>' +
    '<circle cx="12" cy="12" r="2.7"/></svg>';
  function postStatsHtml(p) {
    var slug = esc(p.slug);
    return '<div class="post-stats" aria-label="互动数据">' +
      '<span class="post-stat" title="点赞数">' + HEART_SVG +
      '<span data-like-stat="post:' + slug + '">0</span></span>' +
      '<span class="post-stat" title="浏览次数（不含站长）">' + EYE_SVG +
      '<span data-view="' + slug + '">0</span></span></div>';
  }

  /* posts.js 是只读的原始文章；site-data.js 的 posts 是站长发布的新文章；
     工坊未发布的本机内容由 studio.js 合并进同一个数组，这里统一去重排序。 */
  function buildPosts() {
    var out = (window.POSTS || []).slice();
    /* 版本日志文章由构建脚本从 博客版本日志.md 生成，posts.js 保持逐字节不动；
       它先合并进集合，这样站长在工坊里编辑过的同名条目（DATA.posts）能覆盖生成版 */
    if (window.CHANGELOG_POST && window.CHANGELOG_POST.slug) {
      var cp = window.CHANGELOG_POST, hitCp = false;
      for (var ci = 0; ci < out.length; ci++) {
        if (out[ci].slug === cp.slug) { out[ci] = cp; hitCp = true; break; }
      }
      if (!hitCp) out.push(cp);
    }
    (DATA.posts || []).forEach(function (p) {
      for (var i = 0; i < out.length; i++) {
        if (out[i].slug === p.slug) { out[i] = p; return; }
      }
      out.push(p);
    });
    out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    /* 工坊删除的基础文章以 site-data.js 的 deleted.posts 下发，这里统一过滤
       （要在版本日志文章合并之后再过滤，changelog 文章同样可删） */
    var DEAD_POSTS = (DATA.deleted && DATA.deleted.posts) || [];
    if (DEAD_POSTS.length) {
      out = out.filter(function (p) { return DEAD_POSTS.indexOf(p.slug) < 0; });
    }
    return out;
  }
  var POSTS = buildPosts();
  /* 工坊在本机删文章只改了共享的 DATA，POSTS 是启动时的数组。
     收到数据变更事件或每次路由时就地重建，首页卡片无需刷新网页即消失。 */
  function syncPosts() {
    var next = buildPosts();
    POSTS.length = 0;
    for (var i = 0; i < next.length; i++) POSTS.push(next[i]);
  }
  document.addEventListener('zb:studio-data', syncPosts);

  /* 站名统一取扩展数据层的 displayName；posts.js 只读作文章源，不再提供显示名 */
  var TITLE = CFG.displayName || '星梦Staream';
  var founded = CFG.founded || SITE.since || '2026-11-07';
  function runningDays() {
    /* 用 UTC 基准计算：静态镜像可能在任何时区的构建机生成，
       按本地时区取整会让同一份镜像出现差一天的两个数值 */
    var m = String(founded).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return 1;
    var t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Math.max(1, Math.floor((Date.now() - t) / 86400000) + 1);
  }
  function photoCount() {
    return arr('albums').reduce(function (n, a) { return n + ((a.photos || []).length); }, 0);
  }
  function wordsOf(body) {
    return String(body || '').replace(/<[^>]+>/g, '').replace(/\s/g, '').length;
  }

  document.title = TITLE;
  document.getElementById('brand').textContent = TITLE;
  var tagEl = document.getElementById('tagline');
  if (tagEl) tagEl.textContent = CFG.tagline || SITE.tagline || '';
  document.getElementById('foot-left').textContent =
    '© ' + (SITE.since || new Date().getFullYear()) + ' ' + (CFG.author || SITE.author || '');
  var footNote = document.getElementById('foot-note');
  /* 页面是静态文件，但点赞/浏览、留言与工坊发布需要调用外部接口，
     底栏不再自称「纯静态 / 无依赖」；所有 SPA 页与静态镜像共用同一句标识。 */
  if (footNote) footNote.textContent = CFG.footerNote ||
    '静态页面 · 无追踪 · 轻量交互 · 有星光、有梦想';
  /* 导航头像与首页名片共用同一份站点数据；工坊改名后即时同步 */
  function syncBrandAvatar() {
    var el = document.querySelector && document.querySelector('.avatar-brand');
    if (el) el.src = CFG.avatar || 'assets/avatar.jpg';
  }
  syncBrandAvatar();
  document.addEventListener('zb:site-change', syncBrandAvatar);

  /* ---------- 公共片段 ---------- */
  function tagsHtml(tags) {
    if (!tags || !tags.length) return '';
    return '<div class="tags">' + orderedTags(tags).map(function (t) {
      return '<a class="tag" href="#/tag/' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
    }).join('') + '</div>';
  }
  function metaHtml(p) {
    /* 时间只保留到日期：创作时间的分钟与阅读时长都不再显示 */
    return '<div class="post-meta"><time>' + esc(String(p.date || '').slice(0, 10)) + '</time></div>';
  }
  function pageHead(title, sub, kicker) {
    return '<div class="page-head reveal">' +
      (kicker ? '<div class="page-kicker">' + esc(kicker) + '</div>' : '') +
      '<h1 class="page-title">' + esc(title) + '</h1>' +
      (sub ? '<p class="page-sub">' + esc(sub) + '</p>' : '') + '</div>';
  }
  function statHtml() {
    var items = [
      [POSTS.length, '篇文章'],
      [arr('chatter').length, '则杂谈'],
      [arr('moments').length, '条说说'],
      [photoCount(), '张照片'],
      [runningDays(), '天在线']
    ];
    return '<div class="stat-bar glass reveal">' + items.map(function (it) {
      return '<div class="stat-cell"><b data-count-to="' + it[0] + '">' + it[0] + '</b><span>' + it[1] + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------- 文章 ---------- */
  function renderList(posts, note) {
    var head = note ? '<h2 class="section-head">' + esc(note) + '</h2>' : '';
    if (!posts.length) return head + '<p class="page-note">这里还没有文章。</p>';
    return head + '<div class="post-list">' + posts.map(function (p) {
      return '<article class="post-item reveal">' +
        metaHtml(p) +
        '<a class="post-title" href="#/post/' + encodeURIComponent(p.slug) + '">' + esc(p.title) + '</a>' +
        '<p class="post-summary">' + esc(p.summary) + '</p>' +
        tagsHtml(p.tags) + postStatsHtml(p) + '</article>';
    }).join('') + '</div>';
  }
  function tocHtml(body) {
    /* 正文已经用 :::cont::: 生成同款目录卡片时不重复插入自动目录，
       这样文章里写的目录就是页面上唯一那张「本页目录」 */
    if (body.indexOf('class="toc"') >= 0) return '';
    var heads = [], re = /<h2[^>]*>([\s\S]*?)<\/h2>/g, m;
    while ((m = re.exec(body))) heads.push(m[1].replace(/<[^>]+>/g, '').trim());
    if (heads.length < 2) return '';
    return '<nav class="toc" aria-label="本页目录"><div class="toc-title">本 页 目 录</div><div class="toc-list">' +
      heads.map(function (h, i) {
        return '<button class="toc-item" type="button" data-toc="' + i + '">' + esc(h) + '</button>';
      }).join('') + '</div></nav>';
  }
  /* 文章互动区：留言内容直接渲染在评论区里，页面内输入框写好内容后交给 GitHub 确认发布。
     实时层读取公开 Issues 覆盖显示，读不到就沿用仓库归档；归档为空时给空状态，
     而不是只剩一条外链。预览态隐藏输入框，测试留言不会混进正式归档。 */
  function issueEntry(slug) {
    var I = window.ZBInteractions;
    if (I && typeof I.newIssueUrl === 'function') return String(I.newIssueUrl(slug) || '');
    return 'https://github.com/ZXY-cc/zxy-cc.github.io/issues/new?title=' +
      encodeURIComponent('留言 | ' + slug);
  }
  function issueList() {
    var I = window.ZBInteractions;
    return (I && I.issuesUrl) || 'https://github.com/ZXY-cc/zxy-cc.github.io/issues';
  }
  function interactionsHtml(p) {
    var I = window.ZBInteractions;
    var ZA = window.ZBArchive;
    var preview = !!(I && I.previewMode && I.previewMode());
    var composer = (!preview && ZA && ZA.composerHtml) ? ZA.composerHtml() : '';
    var archive = (ZA && window.ZB_COMMENTS && p)
      ? ZA.render(window.ZB_COMMENTS, p.slug, { empty: true, id: 'zb-archive' }) : '';
    var links = preview ? '' : '<div class="interactions-links">' +
      '<a href="' + esc(issueList()) + '" target="_blank" rel="noopener nofollow">留言仓库 ↗</a>' +
      '<span aria-hidden="true">·</span>' +
      '<a href="' + esc(issueEntry(p.slug)) + '" target="_blank" rel="noopener nofollow">在 GitHub 写 ↗</a>' +
      '</div>';
    return '<section class="interactions reveal" aria-label="互动区">' +
      '<div class="interactions-head"><span class="interactions-star" aria-hidden="true">' +
      '<svg viewBox="0 0 100 100"><use href="#puffy-star"/></svg></span><div>' +
      '<h2>留言</h2><p>留言直接显示在这里，写在页面上、用 GitHub 账号确认发布；' +
      '👍 点赞、在 Issue 下回复，留言会长期存档到本站仓库；无广告、无追踪。</p></div></div>' +
      composer +
      '<div class="zb-slot" id="zb-slot"><div id="zb-live-host"></div>' +
      archive +
      '<p class="zb-live-note" id="zb-live-note" hidden>实时同步暂不可用 · 已显示站内存档</p>' +
      '</div>' +
      '<p class="interactions-hint" id="interactions-hint" hidden></p>' +
      links + '</section>';
  }
  function renderPost(p) {
    var idx = -1;
    POSTS.forEach(function (x, i) { if (x.slug === p.slug) idx = i; });
    var prev = idx > 0 ? POSTS[idx - 1] : null;
    var next = idx >= 0 && idx < POSTS.length - 1 ? POSTS[idx + 1] : null;
    var related = POSTS.filter(function (x) {
      if (x.slug === p.slug) return false;
      return (x.tags || []).some(function (t) { return (p.tags || []).indexOf(t) >= 0; });
    }).slice(0, 2);
    /* 工坊写的文章保留 Markdown / LaTeX 原文，前台用同一套引擎渲染；
       早期文章只有 body（已是 HTML），直接沿用。 */
    var body = rehlHtml((p.markdown && window.ZBMD) ? window.ZBMD.render(p.markdown) : (p.body || ''));
    var nav = '<div class="post-nav reveal">' +
      (prev ? '<a class="pn" href="#/post/' + encodeURIComponent(prev.slug) + '"><span>← 较新</span>' + esc(prev.title) + '</a>' : '<span></span>') +
      (next ? '<a class="pn pn-right" href="#/post/' + encodeURIComponent(next.slug) + '"><span>较早 →</span>' + esc(next.title) + '</a>' : '<span></span>') +
      '</div>';
    var rel = related.length ? '<div class="related reveal"><div class="related-title">也许还想看</div>' +
      related.map(function (x) {
        return '<a href="#/post/' + encodeURIComponent(x.slug) + '">' + esc(x.title) + '</a>';
      }).join('') + '</div>' : '';
    return '<article class="article reveal"><div class="article-inner">' +
      '<div class="article-byline"><div class="article-author">' + avatarImg('avatar avatar-sm') +
      '<span>' + esc(CFG.author || SITE.author || '我') + '</span><i>·</i><span>' +
      wordsOf(body) + ' 字</span>' +
      '<i>·</i><span class="article-likes" title="匿名点赞数，每台设备计一次"><span data-like-stat="post:' +
      esc(p.slug) + '">0</span> 次点赞</span>' +
      '<i>·</i><span class="article-views" data-view-post="' + esc(p.slug) +
      '" title="匿名浏览次数，不含站长本人"><span data-view="' + esc(p.slug) +
      '">0</span> 次浏览</span></div>' +
      '<time class="article-date">' + esc(String(p.date || '').slice(0, 10)) + '</time></div>' +
      '<h1>' + esc(p.title) + '</h1>' + tagsHtml(p.tags) +
      tocHtml(body) +
      '<div class="article-body">' + body + '</div>' +
      '<div class="article-actions">' +
      (window.ZBLikes ? window.ZBLikes.html('post', p.slug, p.likes) : '') +
      '<button class="soft-btn" type="button" data-share="' +
      esc('#/post/' + p.slug) + '">复制文章链接</button>' +
      '<a class="soft-btn" href="#/posts">← 返回文章列表</a></div>' +
      interactionsHtml(p) +
      '</div></article>' + rel + nav;
  }
  function tagCounts() {
    var counts = {};
    POSTS.forEach(function (p) { (p.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    return counts;
  }
  function tagCloudHtml(names, counts) {
    return names.map(function (t) {
      return '<a class="tag" href="#/tag/' + encodeURIComponent(t) + '">' + esc(t) +
        '<span class="tag-count">' + counts[t] + '</span></a>';
    }).join('');
  }
  function renderTags() {
    var counts = tagCounts();
    var names = orderedTags(Object.keys(counts));
    return pageHead('标签', '把相近的文章放在一起', 'TAGS') +
      '<div class="tag-search reveal"><input class="f-input" id="tag-search" type="search" ' +
      'placeholder="搜标签：输入名称或其中几个字" aria-label="搜索标签" autocomplete="off">' +
      '<button class="soft-btn tag-search-clear" type="button" data-tag-clear hidden>清空</button></div>' +
      '<p class="page-note" id="tag-note">共 ' + names.length + ' 个标签</p>' +
      '<div class="tag-cloud glass reveal" id="tag-cloud">' + tagCloudHtml(names, counts) + '</div>';
  }
  /* 标签检索只重绘标签云，不整页刷新：输入框保持焦点，敲一个字就能收窄一圈 */
  function filterTags(q) {
    var cloud = document.getElementById('tag-cloud');
    var note = document.getElementById('tag-note');
    if (!cloud) return;
    var key = String(q || '').trim().toLowerCase();
    var counts = tagCounts();
    var names = orderedTags(Object.keys(counts));
    if (key) names = names.filter(function (t) { return String(t).toLowerCase().indexOf(key) >= 0; });
    cloud.innerHTML = names.length ? tagCloudHtml(names, counts)
      : '<p class="page-note tag-empty">没有找到这个标签，换个词试试。</p>';
    if (note) note.textContent = key ? '找到 ' + names.length + ' 个标签' : '共 ' + names.length + ' 个标签';
    var clear = document.querySelector('[data-tag-clear]');
    if (clear) clear.hidden = !key;
  }

  /* ---------- 项目 ---------- */
  function renderProjects() {
    var list = arr('projects');
    if (!list.length) return pageHead('项目', '做过的和正在做的', 'PROJECTS') + '<p class="page-note">还没有项目。</p>';
    return pageHead('项目', '做过的和正在做的', 'PROJECTS') +
      '<div class="card-grid">' + list.map(function (p) {
        return '<article class="x-card glass sheen reveal"' +
          (p.link ? ' data-card-href="' + esc(p.link) + '"' : '') + '>' +
          '<div class="x-card-top"><span class="x-badge">' + esc(p.status || '记录') + '</span>' +
          '<time>' + esc(p.date || '') + '</time></div>' +
          '<h2>' + esc(p.name) + '</h2><p>' + esc(p.desc) + '</p>' +
          '<div class="x-chips">' + orderedTags(p.tags || []).map(function (t) {
            return '<span>' + esc(t) + '</span>';
          }).join('') + '</div>' +
          (p.link ? '<a class="x-link card-text" href="' + esc(p.link) + '">去看看 →</a>' : '') +
          '</article>';
      }).join('') + '</div>';
  }

  /* ---------- 归档时间轴 ---------- */
  /* 归档不只收文章：项目、相册、说说、杂谈都排进同一条时间线，
     每条前头挂一枚类型小标，点进去落到各自的页面。
     标签筛选只对带标签的记录生效（文章、项目、杂谈），相册与说说本来就没有标签。 */
  var TL_KINDS = { post: '文章', project: '项目', album: '相册', moment: '说说', chatter: '杂谈' };
  function tlClip(t, n) {
    var s = String(t || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function tlItems() {
    var out = [];
    POSTS.forEach(function (p) {
      out.push({ kind: 'post', date: String(p.date || '').slice(0, 10), title: p.title,
        tags: p.tags || [], note: '', href: '#/post/' + encodeURIComponent(p.slug) });
    });
    arr('projects').forEach(function (x) {
      var link = String(x.link || '');
      out.push({ kind: 'project', date: String(x.date || '').slice(0, 10), title: x.name,
        tags: x.tags || [], note: x.status || '', ext: /^https?:/i.test(link),
        href: !link ? '#/projects' : (/^https?:/i.test(link) || link.charAt(0) === '#' ? link : '#' + link) });
    });
    arr('albums').forEach(function (a) {
      out.push({ kind: 'album', date: String(a.date || '').slice(0, 10), title: a.title,
        tags: [], note: (a.photos || []).length + ' 张照片', href: '#/album/' + encodeURIComponent(a.id) });
    });
    arr('moments').forEach(function (m) {
      out.push({ kind: 'moment', date: String(m.date || '').slice(0, 10), title: tlClip(m.text, 46),
        tags: [], note: m.mood || '', href: '#/moments' });
    });
    arr('chatter').forEach(function (c) {
      out.push({ kind: 'chatter', date: String(c.date || '').slice(0, 10), title: c.title,
        tags: c.tags || [], note: tlClip(c.summary, 30), href: '#/chatter/' + encodeURIComponent(c.id) });
    });
    out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return out;
  }
  function tlFiltered(all) {
    if (!timelineTag) return all;
    return all.filter(function (x) { return (x.tags || []).indexOf(timelineTag) >= 0; });
  }
  function renderTimeline() {
    var all = tlItems();
    var counts = {};
    all.forEach(function (x) { (x.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var names = orderedTags(Object.keys(counts)).slice(0, 14);
    var filters = '<div class="filter-row reveal"><button class="filter' +
      (timelineTag ? '' : ' on') + '" type="button" data-tfilter="">全部</button>' +
      names.map(function (t) {
        return '<button class="filter' + (timelineTag === t ? ' on' : '') +
          '" type="button" data-tfilter="' + esc(t) + '">' + esc(t) + ' <i>' + counts[t] + '</i></button>';
      }).join('') + '</div>';
    var by = {};
    all.forEach(function (x) { by[x.kind] = (by[x.kind] || 0) + 1; });
    var stat = Object.keys(TL_KINDS).filter(function (k) { return by[k]; })
      .map(function (k) { return TL_KINDS[k] + ' ' + by[k]; }).join(' · ');
    return pageHead('归档', '总计 ' + all.length + ' 条记录（' + stat + '），按时间排好', 'ARCHIVE') +
      statHtml() + filters + timelineBody(tlFiltered(all));
  }
  /* 归档时间轴列表：整页渲染与标签局部刷新共用 */
  function timelineBody(shown) {
    if (!shown.length) return '<p class="page-note">这个标签下还没有记录。</p>';
    var groups = {}, order = [];
    shown.forEach(function (x) {
      var k = String(x.date || '').slice(0, 7) || '未标日期';
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(x);
    });
    return '<div class="timeline">' + order.map(function (k) {
      return '<section class="tl-group reveal"><div class="tl-month"><b>' + esc(k) + '</b><span>' +
        groups[k].length + ' 条</span></div><div class="tl-items">' +
        groups[k].map(function (x) {
          var note = x.note ? '<span class="tl-note">' + esc(x.note) + '</span>' : '';
          var tags = (x.kind === 'post' || x.kind === 'chatter') && (x.tags || []).length
            ? '<span class="tl-tags">' + orderedTags(x.tags).map(function (t) { return '#' + esc(t); }).join(' ') + '</span>' : '';
          return '<a class="tl-item glass is-' + x.kind + '" href="' + x.href + '"' +
            (x.ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
            '<time>' + esc(x.date) + '</time>' +
            '<b><span class="tl-kind is-' + x.kind + '">' + TL_KINDS[x.kind] + '</span>' + esc(x.title) + '</b>' +
            (note || tags ? '<span class="tl-meta">' + note + tags + '</span>' : '') + '</a>';
        }).join('') + '</div></section>';
    }).join('') + '</div>';
  }
  /* 归档标签切换：只更新标签选中态与下方筛选结果，不整页重绘（页面不闪、不回顶） */
  function retintTimeline() {
    var row = app.querySelector('.filter-row');
    var tl = app.querySelector('.timeline');
    if (!row || !tl || !row.querySelector('[data-tfilter]')) { repaint(renderTimeline); return; }
    Array.prototype.forEach.call(row.querySelectorAll('[data-tfilter]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-tfilter') === timelineTag);
    });
    tl.outerHTML = timelineBody(tlFiltered(tlItems()));
    observeReveal();
  }

  /* ---------- 相册 ---------- */
  function renderPhotowall() {
    var albums = arr('albums');
    if (!albums.length) return pageHead('相册', '定格过的光', 'GALLERY') + '<p class="page-note">还没有相册。</p>';
    /* 先预热每个相册最新一张封面，避免进场那一帧背景层还是空的 */
    preloadThumbs(albums.map(function (a) {
      var list = recentByDate(a.photos || [], 1);
      return list[0] ? list[0].src : (a.cover || '');
    }));
    return pageHead('相册', '定格时间，也定格当时的天色', 'GALLERY') +
      '<p class="page-note">共 ' + albums.length + ' 个相册 · ' + photoCount() + ' 张照片</p>' +
      '<div class="album-grid">' + albums.map(function (a) {
        var n = (a.photos || []).length;
        /* Kirameku 式堆叠封面：最新三张，最新一张在最上层，底层往上错位露角；
           竖版照片集按原比例竖版显示（is-v → 3:4），横版保持 4:3。
           相册卡不再挂 .reveal：整页进场时它本来就在视口里，淡入反而像闪了一下白。 */
        var v = albumOrient(a) === 'v';
        return '<a class="album-card' + (v ? ' is-v' : '') + ' glass sheen" href="#/album/' +
          encodeURIComponent(a.id) + '" data-card-href="#/album/' + encodeURIComponent(a.id) + '">' +
          '<div class="album-stack">' + stackCovers(a.photos, a.title) +
          '<span class="album-count">' + n + ' 张</span></div>' +
          '<div class="album-info card-text"><h2>' + esc(a.title) + '</h2><p>' + esc(a.desc) + '</p>' +
          '<time>' + esc(a.date) + '</time></div></a>';
      }).join('') + '</div>';
  }
  function renderAlbum(a) {
    var photos = a.photos || [];
    lb.list = photos;
    return '<a class="back-link reveal" href="#/photowall">← 返回相册</a>' +
      pageHead(a.title, a.desc, 'ALBUM · ' + photos.length + ' 张') +
      '<div class="photo-grid">' + photos.map(function (p, i) {
        var cap = p.note || '记录这一刻';
        return '<button class="photo-tile glass sheen reveal" type="button" data-photo="' + i + '" style="animation-delay:' + (i % 12) * 45 + 'ms">' +
          '<img src="' + esc(thumbUrl(p.src)) + '" alt="' + esc(p.title || '') + '" loading="lazy" decoding="async">' +
          '<span class="photo-cap"><i>' +
          esc(cap) + (p.date ? ' <em>· ' + esc(String(p.date).slice(0, 10)) + '</em>' : '') +
          '</i></span>' +
          '</button>';
      }).join('') + '</div>';
  }

  /* ---------- 说说 ---------- */
  /* 说说按日期排：数据文件里是旧→新，所以「最新」必须按日期倒序排，
     不能只依赖数组顺序（原来的 reverse 只在「最早」时才执行，两个按钮因此反了）。 */
  function momentsSorted() {
    var list = arr('moments').sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    return momentOrder === 'old' ? list.reverse() : list;
  }
  function renderMoments() {
    var list = momentsSorted();
    return pageHead('说说', '在正文之外，捕捉一些瞬间的温度', 'MOMENTS') +
      '<div class="sort-row reveal"><span>' + list.length + ' 条动态</span>' +
      '<button class="filter' + (momentOrder === 'new' ? ' on' : '') + '" type="button" data-morder="new">最新</button>' +
      '<button class="filter' + (momentOrder === 'old' ? ' on' : '') + '" type="button" data-morder="old">最早</button></div>' +
      momentsBody(list);
  }
  /* 说说列表：整页渲染与排序局部刷新共用 */
  function momentsBody(list) {
    var L = window.ZBLikes;
    return '<div class="moment-list">' + list.map(function (m) {
        var imgs = (m.images || []).length ? '<div class="moment-imgs">' + m.images.map(function (src) {
          return '<img src="' + esc(thumbUrl(src)) + '" alt="说说的配图" loading="lazy" decoding="async">';
        }).join('') + '</div>' : '';
        return '<article class="moment glass reveal">' +
          '<div class="moment-head">' + avatarImg('avatar avatar-sm') +
          '<div><b>' + esc(CFG.displayName || CFG.author || SITE.author || '星梦Staream') + '</b>' +
          '<time>' + esc(String(m.date || '').slice(0, 10)) + '</time></div>' +
          (m.mood ? '<span class="mood">' + esc(m.mood) + '</span>' : '') + '</div>' +
          '<p class="moment-text">' + esc(m.text) + '</p>' + imgs +
          '<div class="moment-foot">' +
          (m.place ? '<span class="place">' + esc(m.place) + '</span>' : '<span></span>') +
          (L ? L.html('moment', m.id, m.likes) : '') + '</div>' +
          '</article>';
      }).join('') + '</div>';
  }
  /* 说说排序切换：只更新排序按钮选中态与下方动态列表，不整页重绘 */
  function retintMoments() {
    var row = app.querySelector('.sort-row');
    var ml = app.querySelector('.moment-list');
    if (!row || !ml || !row.querySelector('[data-morder]')) { repaint(renderMoments); return; }
    Array.prototype.forEach.call(row.querySelectorAll('[data-morder]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-morder') === momentOrder);
    });
    ml.outerHTML = momentsBody(momentsSorted());
    observeReveal();
  }

  /* ---------- 杂谈 ---------- */
  function renderChatter() {
    var list = pinnedFirst(arr('chatter'));
    var tags = [];
    list.forEach(function (c) { (c.tags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
    tags = orderedTags(tags);
    var filters = '<div class="filter-row reveal"><button class="filter' +
      (chatterTag ? '' : ' on') + '" type="button" data-cfilter="">全部</button>' +
      tags.map(function (t) {
        return '<button class="filter' + (chatterTag === t ? ' on' : '') +
          '" type="button" data-cfilter="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div>';
    return pageHead('杂谈', '比文章短一点，比说说长一点', 'CHATTER') + filters +
      chatterList(list);
  }
  /* 杂谈列表：整页渲染与标签局部刷新共用 */
  function chatterList(list) {
    var shown = chatterTag ? list.filter(function (c) { return (c.tags || []).indexOf(chatterTag) >= 0; }) : list;
    var L = window.ZBLikes;
    return '<div class="chatter-list">' + shown.map(function (c) {
        return '<article class="chatter-card glass reveal">' +
          '<div class="chatter-meta"><span class="x-badge">' + esc(c.mood || '碎片') + '</span>' +
          '<time>' + esc(String(c.date || '').slice(0, 10)) + '</time></div>' +
          '<a class="chatter-title" href="#/chatter/' + encodeURIComponent(c.id) + '">' + esc(c.title) + '</a>' +
          '<p>' + esc(c.summary) + '</p>' +
          '<div class="x-chips">' + orderedTags(c.tags || []).map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</div>' +
          '<div class="chatter-foot">' +
          (L ? L.html('chatter', c.id, c.likes) : '<span></span>') + '</div>' +
          '</article>';
      }).join('') + '</div>';
  }
  /* 杂谈标签切换：只更新标签选中态与下方列表，不整页重绘 */
  function retintChatter() {
    var row = app.querySelector('.filter-row');
    var cl = app.querySelector('.chatter-list');
    if (!row || !cl || !row.querySelector('[data-cfilter]')) { repaint(renderChatter); return; }
    Array.prototype.forEach.call(row.querySelectorAll('[data-cfilter]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-cfilter') === chatterTag);
    });
    cl.outerHTML = chatterList(pinnedFirst(arr('chatter')));
    observeReveal();
  }
  function renderChatterDetail(c) {
    return '<a class="back-link reveal" href="#/chatter">← 返回杂谈</a>' +
      '<article class="article reveal"><div class="article-inner">' +
      '<div class="article-byline"><div class="article-author">' + avatarImg('avatar avatar-sm') +
      '<span>' + esc(CFG.author || SITE.author || '我') + '</span><i>·</i><span>' +
      esc(c.mood || '杂谈') + '</span></div>' +
      '<time class="article-date">' + esc(String(c.date || '').slice(0, 10)) + '</time></div>' +
      '<h1>' + esc(c.title) + '</h1>' + tagsHtml(c.tags) +
      '<div class="article-body">' +
      rehlHtml((c.markdown && window.ZBMD) ? window.ZBMD.render(c.markdown) : (c.body || '')) +
      '</div>' +
      '<div class="article-actions">' +
      (window.ZBLikes ? window.ZBLikes.html('chatter', c.id, c.likes) : '') +
      '<a class="soft-btn" href="#/chatter">← 返回杂谈</a></div>' +
      '</div></article>';
  }

  /* ---------- 友链 ---------- */
  function renderFriends() {
    var list = arr('friends');
    return pageHead('友链', '那些散落在别处的、值得停一下的地方', 'LINKS') +
      '<div class="friend-grid">' + list.map(function (f) {
        var ext = /^https?:/.test(f.url || '');
        return '<a class="friend-card glass sheen reveal" href="' + esc(f.url) + '"' +
          (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
          '<span class="friend-initial">' + esc(f.initial || (f.name || '?').slice(0, 2)) + '</span>' +
          '<span class="friend-body"><b>' + esc(f.name) + '</b><i>' + esc(f.desc) + '</i></span>' +
          '<span class="friend-status">' + esc(f.status || 'Online') + '</span></a>';
      }).join('') + '</div>';
  }

  /* ---------- 关于：内嵌同名 HTML 版本日志预览 ---------- */
  var clLoading = false;
  /* 日志全文走独立文件：进关于页才插一次 script，加载完只补那块卡片，不整页重绘 */
  function ensureChangelogHtml() {
    if (window.CHANGELOG_HTML || clLoading) return;
    clLoading = true;
    var ver = '';
    var tag = document.querySelector('script[src*="assets/changelog.js"]');
    var m = tag && String(tag.getAttribute('src') || '').match(/[?&]v=([^&]+)/);
    if (m) ver = '?v=' + encodeURIComponent(m[1]);
    var s = document.createElement('script');
    s.src = 'assets/changelog-html.js' + ver;
    s.onload = function () {
      clLoading = false;
      var hold = document.getElementById('cl-hold');
      if (!hold) return;
      hold.outerHTML = '<iframe class="cl-frame" id="cl-frame" ' +
        'title="博客版本日志 HTML 预览" loading="lazy"></iframe>';
      initChangelogFrame();
      if (typeof observeReveal === 'function') observeReveal();
    };
    s.onerror = function () { clLoading = false; };
    document.head.appendChild(s);
  }
  function changelogPreview() {
    var meta = window.CHANGELOG_META || {};
    var frame = window.CHANGELOG_HTML
      ? '<iframe class="cl-frame" id="cl-frame" title="博客版本日志 HTML 预览" loading="lazy"></iframe>'
      : '<p class="page-note cl-hold" id="cl-hold">正在把版本日志装进预览框…</p>';
    return '<section class="changelog-preview glass reveal" aria-label="博客版本日志预览">' +
      '<div class="cl-head"><div><p class="page-kicker">CHANGELOG</p>' +
      '<h2>博客版本日志</h2>' +
      '<p class="cl-sub">每次更新都会同步到这里。下方是同名 HTML 页面的实时预览，共 ' +
      (meta.count || 0) + ' 个版本，最后更新 ' + esc(meta.date || '') +
      '（' + esc(meta.version || '') + '）。</p></div>' +
      '<div class="cl-actions">' +
      '<a class="soft-btn" href="' + encodeURI('博客版本日志.html') +
      '" target="_blank" rel="noopener noreferrer">打开完整版 ↗</a>' +
      '<a class="soft-btn" href="' + encodeURI('博客版本日志.md') +
      '" target="_blank" rel="noopener noreferrer">Markdown 原文 ↗</a>' +
      '<a class="soft-btn" href="#/post/blog-changelog">阅读文章 →</a></div></div>' +
      frame + '</section>';
  }
  /* 关于页简介：旧数据存的是现成 HTML；新数据存 Markdown 源文（空行分段），
     用站点统一的渲染器输出，工坊预览、SPA 与静态镜像三处一致 */
  function aboutIntroHtml() {
    var raw = (CFG.intro != null && CFG.intro !== '') ? String(CFG.intro) : (SITE.about || '');
    if (!raw) return '<p>关于本站。</p>';
    if (/<[a-z][^>]*>/i.test(raw)) return raw;
    if (window.ZBMD && typeof window.ZBMD.render === 'function') return window.ZBMD.render(raw);
    return '<p>' + esc(raw) + '</p>';
  }
  function renderAbout() {
    return pageHead('关于', '关于这个站，和写它的人', 'ABOUT') +
      '<div class="about-card glass reveal"><div class="about-top">' + avatarImg('avatar avatar-lg') +
      '<div><h2>' + esc(CFG.author || SITE.author || '我') + '</h2>' +
      '<p>' + esc(CFG.tagline || SITE.tagline || '') + '</p></div></div>' +
      '<div class="about-intro">' + aboutIntroHtml() + '</div>' +
      '<div class="x-chips about-skills">' + (CFG.skills || []).map(function (s) {
        return '<span>' + esc(s) + '</span>';
      }).join('') + '</div></div>' +
      '<div class="site-facts glass reveal">' +
      '<div><b>' + esc(founded) + '</b><span>建站日期</span></div>' +
      '<div><b>' + runningDays() + ' 天</b><span>已在线</span></div>' +
      '<div><b>' + POSTS.length + ' / ' + photoCount() + '</b><span>文章 / 照片</span></div>' +
      '<div><b>0</b><span>追踪 Cookie</span></div></div>' + changelogPreview();
  }

  /* ---------- 设置：画质档位 ----------
     v3.56 起只有高 / 中 / 低三档：原「极高」的全部配置平移为「高」并成为默认，
     原「高」平移为「中」，原「中」平移为「低」并按「阅读优先」静态化；原「低」档取消。
     内部档位 id 保持不变（ultra / high / mid），只是显示名与配置定位重新对齐，
     这样 CSS 分级与 DOM 的 q-core/q-mid/q-high/q-ultra 标注都不必重写。
     根节点 data-quality 驱动 CSS（首屏由 index.html 里的内联脚本预置，避免闪烁），
     qualityNow 供脚本判断是否需要跑逐帧光幕；切换即时生效，无需刷新。 */
  var QUALITY_KEY = 'zb-quality';
  var QUALITY_OPTS = [
    { id: 'ultra', name: '高', desc: '全部美术效果：108 星 / 16 花瓣、常驻 10 + 快速 8 流星、8 个游走花朵、实时毛玻璃、鼠标斥力与光幕（默认档）' },
    { id: 'high', name: '中', desc: '保留多数效果，只省下最耗性能的实时毛玻璃：108 星 / 14 花瓣、流星 7 + 5、斥力与光幕全开' },
    { id: 'mid', name: '低', desc: '阅读优先：背景不放任何花瓣、星星、花朵与流星，也没有流萤、斥力、光幕、卡片高光与启动闪屏，只留静态水彩天空' }
  ];
  var QUALITY_SPEC = [
    ['星星 / 花瓣', '108 / 16', '108 / 14', '无 / 无'],
    ['星点漂移', '开启', '开启', '无'],
    ['花朵与爱心', '8 个 · 游走', '8 个 · 游走', '无'],
    ['流星', '常驻 10 + 快速 8', '常驻 7 + 快速 5', '无'],
    ['流萤', '夜间 8 只', '夜间 8 只', '无'],
    ['鼠标斥力', '开启', '开启', '关闭'],
    ['鼠标光幕 / 尾迹', '开启', '开启', '关闭'],
    ['卡片高光', '开启', '开启', '关闭'],
    ['实时毛玻璃', '开启', '关闭', '关闭'],
    ['代码高亮', 'Woodfish 配色', 'Woodfish 配色', 'Woodfish 配色'],
    ['入场动画', '开启', '开启', '开启']
  ];
  var qualityNow = 'ultra';
  /* 用户没选过画质时，按设备能力自动降档：内存/核心极少直接给阅读档，
     与 index.html 首屏内联脚本保持同一套判断，避免首帧闪烁。 */
  function autoQuality() {
    var m = 8, c = 8;
    try {
      if (navigator.deviceMemory) m = navigator.deviceMemory;
      if (navigator.hardwareConcurrency) c = navigator.hardwareConcurrency;
    } catch (e) {}
    if (m <= 2 || c <= 2) return 'mid';
    if (m <= 4 || c <= 4) return 'high';
    return 'ultra';
  }
  function readQuality() {
    var v = null;
    try { v = window.localStorage ? window.localStorage.getItem(QUALITY_KEY) : null; } catch (e) {}
    for (var i = 0; i < QUALITY_OPTS.length; i++) if (QUALITY_OPTS[i].id === v) return v;
    return autoQuality();
  }
  function saveQuality(v) {
    try { if (window.localStorage) window.localStorage.setItem(QUALITY_KEY, v); } catch (e) {}
  }
  function applyQuality(v) {
    qualityNow = v;
    var root = document.documentElement;
    if (root && root.dataset) {
      if (v === 'high') delete root.dataset.quality;
      else root.dataset.quality = v;
    }
    try { document.dispatchEvent(new CustomEvent('zb:quality', { detail: v })); } catch (e) {}
  }
  function qualityName(v) {
    for (var i = 0; i < QUALITY_OPTS.length; i++) if (QUALITY_OPTS[i].id === v) return QUALITY_OPTS[i].name;
    return '高';
  }
  /* ---------- 设置：字体 ----------
     四档偏好（中文 / 英文 / 代码 / LaTeX）存本机，通过 data-font-* 属性即时生效；
     代码字体初始默认 JetBrains Maple Mono，公式字体初始默认 Computer Modern。 */
  var FONT_EN_OPTS = [
    { id: 'default', name: '默认', label: '英文字体' },
    { id: 'consolas', name: 'Consolas', label: '英文字体' },
    { id: 'maple', name: 'JetBrains Maple Mono', label: '英文字体' },
    { id: 'jbmono', name: 'JetBrains Mono', label: '英文字体' }
  ];
  var FONT_CODE_OPTS = [
    { id: 'default', name: '默认', label: '代码字体' },
    { id: 'consolas', name: 'Consolas', label: '代码字体' },
    { id: 'maple', name: 'JetBrains Maple Mono', label: '代码字体' }
  ];
  /* 中文字体首项是具体字体 PingFang SC（默认），选「默认」才回到系统中文栈。
     没有这套字形的设备（Windows / Android）按栈顺序回落到雅黑 / 思源黑，
     观感接近，不会出现方块字。 */
  var FONT_CN_OPTS = [
    { id: 'default', name: '默认', label: '中文字体' },
    { id: 'pingfang', name: 'PingFang SC', label: '中文字体' }
  ];
  var FONT_TEX_OPTS = [
    { id: 'default', name: '默认', label: 'LaTeX 字体' },
    { id: 'cm', name: 'Computer Modern', label: 'LaTeX 字体' },
    { id: 'katex', name: 'KaTeX', label: 'LaTeX 字体' }
  ];
  /* 所有字体选项列表统一排序：「默认」固定在最前，其余按名称字典序。
     以后新增选项只要塞进数组就会自动落到正确位置。 */
  function sortFontOpts(list) {
    var head = list.filter(function (o) { return o.id === 'default'; });
    var rest = list.filter(function (o) { return o.id !== 'default'; })
      .sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    return head.concat(rest);
  }
  function fontOpts(kind) {
    var list = kind === 'cn' ? FONT_CN_OPTS : kind === 'code' ? FONT_CODE_OPTS :
      kind === 'tex' ? FONT_TEX_OPTS : FONT_EN_OPTS;
    return sortFontOpts(list);
  }
  function readFont(kind) {
    var v = null, def = kind === 'code' ? 'maple' : kind === 'en' ? 'jbmono' :
      kind === 'tex' ? 'cm' : 'pingfang';
    try { v = window.localStorage ? window.localStorage.getItem('zb-font-' + kind) : null; } catch (e) {}
    var opts = fontOpts(kind);
    for (var i = 0; i < opts.length; i++) if (opts[i].id === v) return v;
    return def;
  }
  function saveFont(kind, v) {
    try { if (window.localStorage) window.localStorage.setItem('zb-font-' + kind, v); } catch (e) {}
  }
  function applyFonts() {
    var root = document.documentElement;
    if (root && root.dataset) {
      root.dataset.fontEn = readFont('en');
      root.dataset.fontCn = readFont('cn');
      root.dataset.fontCode = readFont('code');
      root.dataset.fontTex = readFont('tex');
    }
  }
  function fontSelect(kind, opts, cur) {
    return '<select data-font-sel="' + kind + '" aria-label="' + opts[0].label + '">' +
      opts.map(function (o) {
        return '<option value="' + o.id + '"' + (o.id === cur ? ' selected' : '') + '>' +
          esc(o.name) + '</option>';
      }).join('') + '</select>';
  }
  /* ---------- 设置：首页卡片轮流数 ----------
     每张卡轮流展示 1 / 3 / 5 条，默认 3；只保存在本机，切换后首页立即重绘。 */
  var QUICK_KEY = 'zb-home-quick-count';
  var QUICK_OPTS = [1, 3, 5];
  function readQuickCount() {
    var v = 0;
    try { v = parseInt(window.localStorage ? window.localStorage.getItem(QUICK_KEY) : null, 10); } catch (e) {}
    return QUICK_OPTS.indexOf(v) >= 0 ? v : 3;
  }
  function saveQuickCount(v) {
    try { if (window.localStorage) window.localStorage.setItem(QUICK_KEY, String(v)); } catch (e) {}
  }
  function quickCountNote(n) {
    return '当前：每张卡片轮流展示 ' + n + ' 条内容。' +
      (n === 1 ? '选 1 条时只显示最新一条，不再自动轮换。' : '');
  }
  /* ---------- 设置：字号三档 ----------
     偏小 = 旧版原样，正常 = 默认（正文 16 / 导航 14），偏大 = 正常各 +1。
     只改根节点的 data-fs，样式里那组 --fs-* 变量带着正文、列表、导航、
     元信息与标题一起走；静态镜像的首屏脚本读同一个 localStorage 键。 */
  var FS_KEY = 'zb-fs';
  var FS_OPTS = [
    ['small', '偏小', '贴近旧版密度，一屏能多看几行'],
    ['normal', '正常', '默认，正文与导航都放大一档'],
    ['large', '偏大', '读起来最省力，卡片与标题一起放大']
  ];
  function readFs() {
    try {
      var v = window.localStorage ? window.localStorage.getItem(FS_KEY) : null;
      if (v === 'small' || v === 'normal' || v === 'large') return v;
    } catch (e) { /* 忽略 */ }
    return 'normal';
  }
  function applyFs(v) {
    var val = (v === 'small' || v === 'large') ? v : 'normal';
    try { if (window.localStorage) window.localStorage.setItem(FS_KEY, val); } catch (e) { /* 忽略 */ }
    try { document.documentElement.setAttribute('data-fs', val); } catch (e) { /* 忽略 */ }
    return val;
  }
  function fsNote(v) {
    var hit = FS_OPTS.filter(function (o) { return o[0] === v; })[0] || FS_OPTS[1];
    return '当前：' + hit[1] + '。' + hit[2] + '；切换后立即生效，偏好只保存在这台设备。';
  }
  /* ---------- 设置：点击链接区域 ----------
     卡片链接（默认）= 点卡片任意空白处直接进详情；
     文字链接 = 只有标题下方那行「阅读全文 / 去看看」能点，避免滑动时误触。 */
  var CLICK_KEY = 'zb-click-area';
  var CLICK_OPTS = [
    ['card', '卡片链接', '整张卡片都能点，最省事'],
    ['text', '文字链接', '只有「阅读全文 / 去看看」这行小字能点']
  ];
  function readClick() {
    try {
      var v = window.localStorage ? window.localStorage.getItem(CLICK_KEY) : null;
      if (v === 'card' || v === 'text') return v;
    } catch (e) { /* 忽略 */ }
    return 'card';
  }
  function applyClick(v) {
    var val = v === 'text' ? 'text' : 'card';
    try { if (window.localStorage) window.localStorage.setItem(CLICK_KEY, val); } catch (e) { /* 忽略 */ }
    try { document.documentElement.setAttribute('data-click-area', val); } catch (e) { /* 忽略 */ }
    return val;
  }
  function clickNote(v) {
    return v === 'text'
      ? '当前：文字链接。只有「阅读全文 / 去看看」这行小字能进入详情，卡片空白处不再响应。'
      : '当前：卡片链接。点首页卡片、文章卡片、相册卡片任意位置都能进入详情。';
  }
  /* 「数字滚动动画」三档：所有 / 部分 / 关闭（默认部分）。
     v3.69 语义：
       「所有」= 所有滚动数字都滚：首页卡片与归档的彩色统计大数字 + 浏览量 + 点赞量；
       「部分」= 仅首页卡片与归档的彩色统计大数字滚动，浏览量 / 点赞量直接显示；
       「关闭」= 全部直接显示。
     彩色大数字走 initCountUp（data-count-to），实时计数器走 likes.js 的 rollText，
     两边都读同一个键（zb-roll-mode），切换立即生效。 */
  var ROLL_MODES = ['all', 'part', 'off'];
  function readRollMode() {
    try {
      var m = window.localStorage ? window.localStorage.getItem('zb-roll-mode') : null;
      if (ROLL_MODES.indexOf(m) >= 0) return m;
    } catch (e) { /* 忽略 */ }
    return 'part';
  }
  function rollModeNote(m) {
    if (m === 'all') return '已选择「所有」：统计大数字与浏览量、点赞量都带滚动动画。';
    if (m === 'off') return '已选择「关闭」：所有数字直接显示，不带滚动动画。';
    return '已选择「部分」：仅首页卡片与归档的彩色大数字滚动，浏览量与点赞量直接显示。';
  }
  /* 设置页「本机不计入浏览量」：写在 localStorage，likes.js 的 ownerDevice 读取同一个键 */
  function noCountOn() {
    try { return window.localStorage && window.localStorage.getItem('zb-no-count') === '1'; }
    catch (e) { return false; }
  }
  /* 导航意境名功能已按需求移除：导航栏恒用默认名称。
     工坊入口由 studio.js 动态生成：站长是「工坊」，游客体验入口是「工坊 · 体验」。 */
  document.addEventListener('change', function (e) {
    var t = e.target;
    var k = t && t.getAttribute ? t.getAttribute('data-font-sel') : null;
    if (k) { saveFont(k, t.value); applyFonts(); return; }
    if (t && t.getAttribute && t.getAttribute('data-roll-mode') !== null) {
      var rm = t.value;
      if (rm === 'all' || rm === 'part' || rm === 'off') {
        try { window.localStorage.setItem('zb-roll-mode', rm); } catch (err) { /* 忽略 */ }
        var rnote = document.getElementById('roll-mode-state');
        if (rnote) rnote.textContent = rollModeNote(rm);
      }
      return;
    }
    if (t && t.getAttribute && t.getAttribute('data-fs') !== null) {
      var fv = applyFs(t.value);
      var fnote = document.getElementById('fs-state');
      if (fnote) fnote.textContent = fsNote(fv);
      return;
    }
    if (t && t.getAttribute && t.getAttribute('data-click-area') !== null) {
      var cv = applyClick(t.value);
      var cnote = document.getElementById('click-area-state');
      if (cnote) cnote.textContent = clickNote(cv);
      return;
    }
    if (t && t.getAttribute && t.getAttribute('data-quick-count') !== null) {
      var qn = parseInt(t.value, 10);
      if (QUICK_OPTS.indexOf(qn) >= 0) saveQuickCount(qn);
      var qnote = document.getElementById('quick-count-state');
      if (qnote) qnote.textContent = quickCountNote(qn);
      var qh = location.hash || '';
      if (qh === '' || qh === '#' || qh === '#/') route();
      return;
    }
    if (t && t.getAttribute && t.getAttribute('data-no-count') !== null) {
      try { window.localStorage.setItem('zb-no-count', t.checked ? '1' : '0'); } catch (err) {}
      var note = document.getElementById('no-count-state');
      if (note) note.textContent = t.checked ?
        '已开启：这台设备浏览页面不会再增加浏览数。' :
        '已关闭：这台设备按普通访客计入浏览数。';
    }
    if (t && t.getAttribute && t.getAttribute('data-neko-show') !== null) {
      nekoSetVisible(t.checked);
      var nkNote = document.getElementById('neko-show-state');
      if (nkNote) nkNote.textContent = t.checked ?
        '已开启：' + nekoName() + '常驻右下角；关闭后不会再出现，也不再下载它的资源。' :
        '已关闭：' + nekoName() + '不会再出现；重新打开后会自动回来（位置和大小保持原样）。';
      return;
    }
  });
  function qualitySpecHtml() {
    var head = '<thead><tr><th scope="col">效果</th><th scope="col">高</th>' +
      '<th scope="col">中</th><th scope="col">低</th></tr></thead>';
    var body = '<tbody>' + QUALITY_SPEC.map(function (r) {
      return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) +
        '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td></tr>';
    }).join('') + '</tbody>';
    /* 效果对照表默认折叠：外层用 0fr → 1fr 的网格行高过渡（等价于 height 0 → auto），
       同时淡入淡出，动画节奏参考 Kirameku 说说页的 0.3s 展开/收起 */
    return '<div class="q-spec-panel" id="q-spec-panel" aria-hidden="true">' +
      '<div class="q-spec-inner"><div class="q-spec-wrap"><table class="q-spec">' +
      head + body + '</table></div></div></div>';
  }
  function renderSettings() {
    var cur = readQuality(), quick = readQuickCount(), rmode = readRollMode();
    var opts = QUALITY_OPTS.map(function (o) {
      var on = o.id === cur;
      return '<button class="quality-item' + (on ? ' on' : '') + '" type="button" role="radio"' +
        ' aria-checked="' + (on ? 'true' : 'false') + '" data-quality="' + o.id + '">' +
        '<span class="q-mark" aria-hidden="true"><svg viewBox="0 0 100 100"><use href="#puffy-star"/></svg></span>' +
        '<b>' + esc(o.name) + '</b><small>' + esc(o.desc) + '</small></button>';
    }).join('');
    var rollOpts = [
      ['all', '所有', '所有滚动数字都滚（统计大数字 + 浏览量 + 点赞量）'],
      ['part', '部分', '仅首页卡片与归档的彩色大数字滚动'],
      ['off', '关闭', '所有数字直接显示']
    ].map(function (o) {
      var on = o[0] === rmode;
      return '<label class="opt-item"><input type="radio" name="zb-roll-mode" value="' + o[0] +
        '" data-roll-mode' + (on ? ' checked' : '') + '><span><b>' + o[1] + '</b>' +
        (o[0] === 'part' ? '<i>默认</i>' : '') + '<i>' + o[2] + '</i></span></label>';
    }).join('');
    var fontNote = '中文字体默认 PingFang SC，本机没装这套字形时按雅黑 / 思源黑顺序回落到最接近的观感；选「默认」则完全交给系统中文栈。' +
      '代码字体选 JetBrains Maple Mono 时，代码里的中文也用它' +
      '（该字体自带中文字形）；选「默认」或 Consolas 时，代码里的中文按上面「中文字体」的设置显示。' +
      '英文字体里的 JetBrains Mono 只有英文字形，选它时页面中文仍按「中文字体」显示；' +
      '英文字体初始默认为 JetBrains Mono；选项按字典序排列。' +
      '等宽字形随站点自带，手机、平板等没装本机字体的设备也会显示同一套字体；' +
      'LaTeX 字体只作用于公式：默认 Computer Modern（随站点自带的开源字体），选「默认」则改用系统数学字体。';
    return pageHead('设置', '把偏好留在这台设备上', 'SETTINGS') +
      '<section class="settings-card glass reveal" aria-label="站点设置">' +
      '<div class="settings-block"><div class="settings-info">' +
      '<h2>画质<button class="q-help" type="button" data-qspec-toggle aria-expanded="false" ' +
      'aria-controls="q-spec-panel" aria-label="展开画质效果对照表" title="查看三档效果对照">?</button></h2>' +
      '<p>选择画面呈现的档位，切换后立即生效。偏好保存在本机浏览器里，不会上传到任何地方。</p></div>' +
      '<div class="quality-group" role="radiogroup" aria-label="画质档位">' + opts + '</div></div>' +
      qualitySpecHtml() +
      '<p class="settings-foot">当前画质：<b id="quality-current">' + esc(qualityName(cur)) +
      '</b> · 首次访问默认高画质，展现全部美术效果；中画质保留多数效果、只省下最耗性能的实时毛玻璃；低画质是阅读档，花瓣、星星、花朵与流星全部清除，只留静态水彩天空。</p></section>' +
      '<section class="settings-card glass reveal" aria-label="字体设置">' +
      '<div class="settings-block"><div class="settings-info">' +
      '<h2>字体</h2><p>设置网页的中英文字体、代码字体与 LaTeX 公式字体。切换后立即生效，字体随站点自带，任何设备都能显示；偏好只保存在本机。</p></div>' +
      '<div class="font-group">' +
      '<label class="font-item">中文字体' + fontSelect('cn', FONT_CN_OPTS, readFont('cn')) + '</label>' +
      '<label class="font-item">英文字体' + fontSelect('en', FONT_EN_OPTS, readFont('en')) + '</label>' +
      '<label class="font-item">代码字体' + fontSelect('code', FONT_CODE_OPTS, readFont('code')) + '</label>' +
      '<label class="font-item">LaTeX 字体' + fontSelect('tex', FONT_TEX_OPTS, readFont('tex')) + '</label>' +
      '</div>' +
      '<p class="settings-foot">' + esc(fontNote) + '</p></div></section>' +
      /* 「字号」卡片：三档只改根节点变量，正文、导航、说明与标题一起走 */
      '<section class="settings-card glass reveal" aria-label="字号设置">' +
      '<div class="settings-block stack"><div class="settings-info">' +
      '<h2>字号</h2><p>控制全站正文、导航与说明文字的大小。切换后立即生效，偏好只保存在本机。</p></div>' +
      '<div class="opt-group" role="radiogroup" aria-label="字号">' +
      FS_OPTS.map(function (o) {
        var on = o[0] === readFs();
        return '<label class="opt-item"><input type="radio" name="zb-fs" value="' + o[0] +
          '" data-fs' + (on ? ' checked' : '') + '><span><b>' + esc(o[1]) + '</b>' +
          (o[0] === 'normal' ? '<i>默认</i>' : '') + '<i>' + esc(o[2]) + '</i></span></label>';
      }).join('') + '</div>' +
      '<p class="settings-foot" id="fs-state">' + esc(fsNote(readFs())) + '</p></div></section>' +
      /* 「通用」卡片：日常会用到的偏好归在一起 */
      '<section class="settings-card glass reveal" aria-label="通用设置">' +
      '<div class="settings-block stack"><div class="settings-info">' +
      '<h2>通用</h2><p>日常偏好集中在这张卡片里，切换后立即生效；偏好只保存在本机。</p></div>' +
      '<div class="settings-sub"><h3>首页卡片轮流数</h3>' +
      '<p>设置首页每张卡片轮流展示几条内容。</p>' +
      '<div class="opt-group" role="radiogroup" aria-label="首页卡片轮流数">' +
      QUICK_OPTS.map(function (n) {
        return '<label class="opt-item"><input type="radio" name="zb-quick-count" value="' + n +
          '" data-quick-count' + (quick === n ? ' checked' : '') +
          '><span><b>' + n + ' 条</b>' + (n === 3 ? '<i>默认</i>' : '') + '</span></label>';
      }).join('') + '</div>' +
      '<p class="settings-foot" id="quick-count-state">' + esc(quickCountNote(quick)) + '</p></div>' +
      '<div class="settings-sub"><h3>点击链接区域</h3>' +
      '<p>决定点哪里能进入内容详情。「卡片链接」整张卡片可点，最省事；「文字链接」只有「阅读全文 / 去看看」那行小字可点，适合滑动时容易误触的情况。</p>' +
      '<div class="opt-group" role="radiogroup" aria-label="点击链接区域">' +
      CLICK_OPTS.map(function (o) {
        var on = o[0] === readClick();
        return '<label class="opt-item"><input type="radio" name="zb-click-area" value="' + o[0] +
          '" data-click-area' + (on ? ' checked' : '') + '><span><b>' + esc(o[1]) + '</b>' +
          (o[0] === 'card' ? '<i>默认</i>' : '') + '<i>' + esc(o[2]) + '</i></span></label>';
      }).join('') + '</div>' +
      '<p class="settings-foot" id="click-area-state">' + esc(clickNote(readClick())) + '</p></div></div></section>' +
      /* 「动画」卡片：数字滚动动画三档 */
      '<section class="settings-card glass reveal" aria-label="动画设置">' +
      '<div class="settings-block stack"><div class="settings-info">' +
      '<h2>动画</h2><p>控制页面里数字的逐位滚动动画。切换后立即生效，偏好只保存在本机。</p></div>' +
      '<div class="settings-sub"><h3>数字滚动动画</h3>' +
      '<p>数字变化时每一位独立滚动（0~9 循环）。「所有」= 统计大数字与浏览量、点赞量都滚；「部分」= 仅首页卡片与归档的彩色大数字滚动；「关闭」= 全部直接显示。</p>' +
      '<div class="opt-group" role="radiogroup" aria-label="数字滚动动画">' + rollOpts + '</div>' +
      '<p class="settings-foot" id="roll-mode-state">' + esc(rollModeNote(rmode)) + '</p></div></div></section>' +
      /* 「小猫」卡片：设置页只留出不出场这一个开关；
         昵称、聊天接口与 SKILL 规范都收进「工坊 · 宠物」，不摆在公开的设置页上 */
      '<section class="settings-card glass reveal" aria-label="小猫设置">' +
      '<div class="settings-block stack"><div class="settings-info">' +
      '<h2>小猫</h2><p>右下角的站宠' + esc(nekoName()) + '：这里只管她出不出场。切换立即生效，偏好只保存在本机。</p></div>' +
      '<div class="settings-sub"><h3>显示小猫</h3>' +
      '<label class="no-count-item"><input type="checkbox" data-neko-show' +
      (nekoShown() ? ' checked' : '') + '><span>显示右下角的站宠' + esc(nekoName()) + '（可拖动、聊天、喂小鱼干）</span></label>' +
      '<p class="settings-foot" id="neko-show-state">' +
      esc(nekoShown() ? '已开启：' + nekoName() + '常驻右下角；关闭后不会再出现，也不再下载它的资源。' :
        '已关闭：' + nekoName() + '不会再出现；重新打开后会自动回来（位置和大小保持原样）。') + '</p>' +
      '<p class="settings-foot">她的昵称、聊天接口与 SKILL 规范都收在「工坊 · 宠物」里，只存在站长自己的浏览器中，访客看不到也改不到。</p></div>' +
      '</div></section>' +
      /* 浏览统计只对站长设备显示：普通访客用不上「本机不计入浏览量」 */
      (window.STUDIO && window.STUDIO.isOwner && window.STUDIO.isOwner() ?
      '<section class="settings-card glass reveal" aria-label="浏览统计">' +
      '<div class="settings-block"><div class="settings-info">' +
      '<h2>浏览统计</h2><p>页面只记录匿名访客的浏览次数，不采集身份信息。解锁过工坊的设备与预览态自动不计入；其它设备可在这里手动排除自己。</p></div>' +
      '<label class="no-count-item"><input type="checkbox" data-no-count' +
      (noCountOn() ? ' checked' : '') + '><span>本机不计入浏览量</span></label></div>' +
      '<p class="settings-foot" id="no-count-state">' +
      esc(noCountOn() ? '已开启：这台设备浏览页面不会再增加浏览数。' :
        '未开启：解锁过工坊的设备仍会自动排除，其它设备按普通访客计入。') +
      '</p></section>' : '');
  }

  /* ---------- 全局搜索 ---------- */
  function hit(q, fields) {
    var low = String(q).toLowerCase();
    return fields.join(' ').toLowerCase().indexOf(low) >= 0;
  }
  function renderGlobalSearch(q) {
    var posts = POSTS.filter(function (p) { return hit(q, [p.title, p.summary, (p.tags || []).join(' '), p.date]); });
    var chat = arr('chatter').filter(function (c) { return hit(q, [c.title, c.summary, (c.tags || []).join(' ')]); });
    var moments = arr('moments').filter(function (m) { return hit(q, [m.text, m.place, m.mood]); });
    var projects = arr('projects').filter(function (p) { return hit(q, [p.name, p.desc, (p.tags || []).join(' ')]); });
    var albums = arr('albums').filter(function (a) { return hit(q, [a.title, a.desc]); });
    var n = posts.length + chat.length + moments.length + projects.length + albums.length;
    function group(title, items, fn) {
      if (!items.length) return '';
      return '<section class="search-group reveal"><h2>' + esc(title) + ' <i>' + items.length + '</i></h2>' +
        items.map(fn).join('') + '</section>';
    }
    return pageHead('搜索', '「' + q + '」· 共 ' + n + ' 条结果', 'SEARCH') +
      group('文章', posts, function (p) {
        return '<a class="search-row glass" href="#/post/' + encodeURIComponent(p.slug) + '"><b>' + esc(p.title) +
          '</b><span>' + esc(p.summary) + '</span></a>';
      }) +
      group('杂谈', chat, function (c) {
        return '<a class="search-row glass" href="#/chatter/' + encodeURIComponent(c.id) + '"><b>' + esc(c.title) +
          '</b><span>' + esc(c.summary) + '</span></a>';
      }) +
      group('说说', moments, function (m) {
        return '<a class="search-row glass" href="#/moments"><b>' + esc(m.text.slice(0, 34)) +
          '</b><span>' + esc(m.date) + '</span></a>';
      }) +
      group('项目', projects, function (p) {
        return '<a class="search-row glass" href="#/projects"><b>' + esc(p.name) + '</b><span>' + esc(p.desc) + '</span></a>';
      }) +
      group('相册', albums, function (a) {
        return '<a class="search-row glass" href="#/album/' + encodeURIComponent(a.id) + '"><b>' + esc(a.title) +
          '</b><span>' + esc(a.desc) + '</span></a>';
      }) +
      (n ? '' : '<p class="page-note">没有找到相关内容，换个词试试。</p>');
  }

  /* ---------- 首页名片 ----------
     结构仿参考站：圆角头像 + 名字 + 简介，底部三组统计与一排图标按钮；
     数量和链接都取自 site-data.js，站长在工坊里改数据即可同步。 */
  var P_ICONS = {
    github: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c2-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.8-2.4 4.6-4.6 4.9.4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2Z"/></svg>',
    archive: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="4.2" width="17.6" height="4" rx="1.2"/><path d="M5 8.2v10.3c0 .9.7 1.5 1.5 1.5h11c.8 0 1.5-.6 1.5-1.5V8.2M9.8 12.2h4.4"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2.4"/><circle cx="8.4" cy="9.6" r="1.5"/><path d="m4.4 17.2 4.7-4.4 3.6 3.2 2.8-2.4 4.1 3.6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 11.6c0 4-3.7 7.2-8.2 7.2-.9 0-1.8-.1-2.6-.4L4.2 20l1.4-4a6.7 6.7 0 0 1-1.8-4.4c0-4 3.7-7.2 8.2-7.2s8.2 3.2 8.2 7.2Z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.8 14.2 14.2 9.8M7.6 11.2 6 12.8a3.4 3.4 0 0 0 4.8 4.8l1.6-1.6M16.4 12.8 18 11.2a3.4 3.4 0 0 0-4.8-4.8l-1.6 1.6"/></svg>',
    star: '<svg viewBox="0 0 100 100" aria-hidden="true" fill="currentColor"><use href="#puffy-star"/></svg>'
  };
  function profileLinksHtml() {
    var links = (CFG.social && CFG.social.length) ? CFG.social : [
      { name: 'GitHub', icon: 'github', url: 'https://github.com/ZXY-cc', note: '代码存放处' },
      { name: '归档', icon: 'archive', url: '#/timeline', note: '全部记录' },
      { name: '关于', icon: 'star', url: '#/about', note: '关于这个站', accent: true }
    ];
    return links.map(function (s) {
      var ext = /^https?:/.test(s.url || '');
      var label = s.name + (s.note ? ' · ' + s.note : '');
      return '<a class="p-link' + (s.accent ? ' is-accent' : '') + '" href="' + esc(s.url) + '"' +
        (ext ? ' target="_blank" rel="noopener noreferrer"' : '') +
        ' title="' + esc(label) + '" aria-label="' + esc(s.name) + '">' +
        (P_ICONS[s.icon] || P_ICONS.star) + '</a>';
    }).join('');
  }
  function profileCard() {
    var name = TITLE;
    var bio = CFG.bio || CFG.tagline || SITE.tagline || '';
    var stats = [
      [POSTS.length, '文章', '#/posts'],
      [arr('chatter').length, '杂谈', '#/chatter'],
      [photoCount(), '照片', '#/photowall']
    ];
    return '<section class="profile-card glass sheen reveal" aria-label="站长名片">' +
      cardCornerHtml() +
      '<div class="profile-top"><span class="profile-avatar-wrap">' +
      avatarImg('avatar profile-avatar') + '</span>' +
      '<div class="profile-id"><h1 class="profile-name">' + esc(name) + '</h1>' +
      '<p class="profile-bio">' + esc(bio) + '</p></div></div>' +
      '<div class="profile-foot"><div class="profile-stats">' +
      stats.map(function (s) {
        return '<a class="p-stat" href="' + esc(s[2]) + '"><b data-count-to="' + s[0] + '">' + s[0] + '</b><span>' + s[1] + '</span></a>';
      }).join('') + '</div><div class="p-links">' + profileLinksHtml() + '</div></div></section>';
  }
  /* 名片右上角：整站爱心点赞 + 首页匿名浏览数（站长本人不计入） */
  function cardCornerHtml() {
    return '<div class="card-corner-stats" aria-label="站点互动" title="点一下爱心，让我知道有人来过">' +
      (window.ZBLikes ? window.ZBLikes.html('site', 'home', 0, 'like-home') : '') +
      '<span class="home-views" title="首页匿名浏览次数，不含站长本人">' + EYE_SVG +
      '<span data-view-home>0</span> 次浏览</span>' +
      '</div>';
  }
  /* ---------- 首页快捷卡片 ----------
     2×2 网格：文章 / 相册(4:3 三图堆叠) / 说说 / 杂谈各占一格。
     文章、说说、杂谈各自轮播最新 3 条；照片卡轮播最新 3 个相册，
     每个相册自带三张等比定格堆叠封面。 */
  function recentByDate(list, n) {
    return (list || []).map(function (v, i) { return { v: v, i: i }; }).sort(function (a, b) {
      var d = String((b.v && b.v.date) || '').localeCompare(String((a.v && a.v.date) || ''));
      return d || b.i - a.i; /* 同一天按发布先后：后添加的排在前面 */
    }).slice(0, n || 3).map(function (o) { return o.v; });
  }
  /* 首页文章卡的「长摘要」：早期工坊只自动截 90 字，卡片会空出一大片。
     对被截断（以……结尾）或过短的摘要，直接从正文重新截 200 字，不必逐篇重存；
     站长手写的完整摘要照原样保留。纯函数，静态镜像与浏览器都能跑。 */
  function homeSummary(p) {
    var s = String(p.summary || '');
    var raw = String(p.markdown || '');
    if (raw) {
      raw = (window.ZBMD && typeof window.ZBMD.plain === 'function')
        ? window.ZBMD.plain(raw)
        : raw.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ')
            .replace(/[#>*_`|]/g, ' ').replace(/\s+/g, ' ').trim();
    } else if (p.body) {
      /* 基础文章与版本日志文章只有渲染后的 body：先去掉表格、代码块与标签再取纯文本 */
      raw = String(p.body).replace(/<table[\s\S]*?<\/table>/g, ' ')
        .replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    }
    if (raw && (/…$/.test(s) || s.length < 120)) s = raw;
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (s.length <= 200) return s;
    return s.slice(0, 198).replace(/[\s,，.。;；:：、!！?？'”’"]+$/, '') + '……';
  }
  function qBadge(text, cls) {
    return '<span class="q-badge' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>';
  }
  function qSlides(items) {
    return items.map(function (it, i) {
      return '<a class="q-slide' + (i ? '' : ' on') + '" href="' + esc(it.href) + '">' + it.inner + '</a>';
    }).join('');
  }
  function qDots(n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      s += '<button class="q-dot' + (i ? '' : ' on') + '" type="button" data-qdot="' + i +
        '" aria-label="切换到第 ' + (i + 1) + ' 条"></button>';
    }
    return s;
  }
  function qCard(cls, items, label) {
    return '<section class="q-card ' + cls + ' glass sheen reveal" data-qcarousel aria-label="' + esc(label) + '">' +
      '<div class="q-slides">' + qSlides(items) + '</div>' +
      (items.length > 1 ? '<div class="q-dots">' + qDots(items.length) + '</div>' : '') +
      '</section>';
  }
  function qEmpty(cls, href, label, note) {
    return '<section class="q-card ' + cls + ' glass sheen reveal">' +
      '<div class="q-slides"><a class="q-slide on" href="' + esc(href) + '">' +
      '<div class="q-body"><h2>' + esc(label) + '</h2><p>' + esc(note) + '</p></div>' +
      '<span class="q-go card-text">去看看 →</span></a></div></section>';
  }
  /* 把图片地址安全地放进 CSS url("…")：引号、反斜杠、换行一律转义，
     数据 URL 里的 ; , + / = 原样保留（HTML 层再交给 esc） */
  function shotUrl(u) {
    return String(u == null ? '' : u).replace(/["'\\\r\n]/g, function (c) {
      return { '"': '%22', "'": '%27', '\\': '%5C', '\r': '', '\n': '' }[c];
    });
  }
  /* 照片缩略图：assets/photos/x.jpg → assets/thumbs/x.webp（由 scripts/make-thumbs.py 预生成）。
     卡片、相册网格、说说配图都走这里，原图只在灯箱里打开，首屏不再拉整本相册；
     非相册路径（头像、SVG 底图）原样返回。 */
  function thumbUrl(u) {
    var s = String(u == null ? '' : u);
    var m = s.match(/^(.*?\/)?assets\/photos\/([^\/?#]+)\.(?:jpe?g|png|webp)(?:\?[^#]*)?$/i);
    if (!m) return s;
    return (m[1] || '') + 'assets/thumbs/' + m[2] + '.webp';
  }
  /* 相册页第一屏的封面先在内存里排上队：点进相册时图片已解码，
     背景层不会先空一帧再泛白。只预热每个相册最新一张，不抢带宽。 */
  var preloadedThumbs = {};
  function preloadThumbs(list) {
    if (!window.Image) return;
    list.forEach(function (src) {
      var u = thumbUrl(src);
      if (!u || preloadedThumbs[u]) return;
      preloadedThumbs[u] = 1;
      var im = new window.Image();
      im.decoding = 'async';
      im.src = u;
    });
  }
  /* 按日期倒序的照片入队：最新一张在最顶层，底层往上错位露角（CSS 端再做景深：
     顶层清晰、第二层略浅、第三层更浅）。照片 cover 铺满层块，圆角由层块统一裁切，
     不再有 contain 露白边的瑕疵线条。换层按队列旋转：只显示最上层前三张，
     第四张起 .stack-deep 隐藏待命，滚轮 / 滑动时随时补位上来（超过三张不再只是三张循环）。
     v11.8.0 起只入队最新三张：封面本来只露三层，多出来的层既看不见又要下载整张原图。 */
  function stackCovers(photos, alt) {
    var list = recentByDate(photos, 3);
    if (!list.length) list = [{ src: avatarSrc() }];
    return list.map(function (p, i) {
      var cls = i === 0 ? 'stack-top' :
        (i === 1 ? 'stack-mid' : (i === 2 ? 'stack-back' : 'stack-deep'));
      return '<div class="' + cls + '" data-stack-layer data-idx="' + i + '" aria-hidden="true" ' +
        'title="' + esc(alt) + '" style="--shot:url(&quot;' + esc(shotUrl(thumbUrl(p.src))) + '&quot;)"></div>';
    }).join('');
  }
  /* 首页相册拆成横竖两张卡：相册按「照片横竖多数」归卡——
     照片带 w / h（工坊上传时记录）直接判定；缺尺寸的本机异步量一次，量完重绘首页。
     数不出多数时先按横版处理，等测量回调再归位。 */
  var orientMemo = {};
  function photoOrient(p) {
    if (p && p.w && p.h) return p.w >= p.h ? 'h' : 'v';
    if (p && p.src && orientMemo[p.src]) return orientMemo[p.src];
    return null;
  }
  function measureOrient(src) {
    if (!src || orientMemo[src] || !window.Image) return;
    orientMemo[src] = '?';
    var im = new window.Image();
    im.onload = function () {
      orientMemo[src] = im.naturalWidth >= im.naturalHeight ? 'h' : 'v';
      var h = location.hash || '';
      /* 相册页只就地改这一张卡的 is-v，不整页重绘——重绘会把已经画好的封面
         全部丢掉重来，视觉上就是「泛白 / 不显示」的那一下。 */
      if (h.indexOf('#/photowall') === 0) { updateAlbumOrients(); return; }
      if (h === '#/' || h === '#' || h === '') route();
    };
    im.onerror = function () { orientMemo[src] = 'h'; };
    im.src = src;
  }
  /* 量出横竖后只改相册卡的 class，不重建整页 */
  function updateAlbumOrients() {
    var cards = document.querySelectorAll('.album-card[data-card-href]');
    if (!cards.length) return;
    var albums = arr('albums');
    Array.prototype.forEach.call(cards, function (card) {
      var href = card.getAttribute('href') || '';
      var id = href.replace(/^#\/album\//, '');
      try { id = decodeURIComponent(id); } catch (e) { /* 保留原值 */ }
      var a = albums.filter(function (x) { return x.id === id; })[0];
      if (a) card.classList.toggle('is-v', albumOrient(a) === 'v');
    });
  }
  function albumOrient(a) {
    var h = 0, v = 0;
    (a.photos || []).forEach(function (p) {
      var o = photoOrient(p);
      if (o === 'h') h++; else if (o === 'v') v++;
    });
    if (h === v) {
      (a.photos || []).forEach(function (p) { if (p && p.src && !photoOrient(p)) measureOrient(p.src); });
      return 'h';
    }
    return h > v ? 'h' : 'v';
  }
  /* 首页照片卡轮播的是「相册」而不是单张照片：按相册内最新照片日期倒序取前三个，
     且只取横竖版与卡片一致的相册 */
  function albumFeed(orient, limit) {
    var out = arr('albums').filter(function (a) { return albumOrient(a) === orient; }).map(function (a, i) {
      var latest = String(a.date || '');
      (a.photos || []).forEach(function (p) {
        var d = String(p.date || '');
        if (d > latest) latest = d;
      });
      return { date: latest, a: a, i: i };
    });
    return recentByDate(out, limit || 3);
  }
  function photoCarousel(albums, cls, badge) {
    return '<section class="q-card q-photo ' + cls + ' glass sheen reveal" data-qcarousel aria-label="' + esc(badge) + '">' +
      '<div class="q-slides">' + qSlides(albums.map(function (it) {
        var a = it.a;
        return {
          href: '#/album/' + encodeURIComponent(a.id),
          inner: '<div class="album-stack q-photo-stack">' + stackCovers(a.photos, a.title) +
              '<span class="album-count">' + (a.photos || []).length + ' 张</span>' +
              '<div class="q-photo-cap card-text"><b>' + esc(a.title) + '</b><i>' +
              esc(a.desc || '') + '</i></div>' +
              qBadge(badge, 'q-photo-badge') + '</div>'
        };
      })) + '</div>' +
      (albums.length > 1 ? '<div class="q-dots">' + qDots(albums.length) + '</div>' : '') +
      '</section>';
  }
  function renderHome() {
    /* 首页「最新文章」上下两区只收带 A / B 分区标签的文章：
       选 A = 只在上半栏按时间排序展示，选 B = 只在下半栏按时间排序展示；
       两个标签都没选的文章视为站长不打算让最新文章进首页，只在「文章」页展示。
       每区最多 N 篇（N = 设置页的「首页卡片轮流数」，默认 3），⭐ 在本区内置顶，
       A / B 各自独立取满，不串到对侧，也不让无分区标签的文章补位。 */
    var quickN = readQuickCount();
    var posts = recentByDate(POSTS, POSTS.length);
    function homePanes(list) {
      var cap = quickN;
      var aList = [], bList = [];
      list.forEach(function (p) {
        var ts = p.tags || [];
        if (ts.indexOf('A') >= 0) aList.push(p);
        else if (ts.indexOf('B') >= 0) bList.push(p);
      });
      return {
        top: pinnedFirst(aList).slice(0, cap),
        bot: pinnedFirst(bList).slice(0, cap)
      };
    }
    var panes = homePanes(posts);
    var top = panes.top, bot = panes.bot;
    var albumsH = albumFeed('h', quickN);
    var albumsV = albumFeed('v', quickN);
    var moments = recentByDate(arr('moments'), quickN);
    var chatters = recentByDate(arr('chatter'), quickN);
    function postSlide(p) {
      return {
        href: '#/post/' + encodeURIComponent(p.slug),
        inner: '<div class="q-head">' + qBadge('最新文章', 'q-post-badge') +
          '<time>' + esc(String(p.date || '').slice(0, 10)) + '</time></div>' +
          '<h2>' + ((p.tags || []).indexOf('⭐') >= 0 ? '<span class="q-pin">⭐置顶</span>' : '') +
          esc(p.title) + '</h2>' +
          '<p class="q-sum">' + esc(homeSummary(p)) + '</p>' +
          '<div class="q-tags">' + orderedTags(p.tags || []).slice(0, 4).map(function (t) {
            return '<span>' + esc(t) + '</span>';
          }).join('') + '</div>' +
          '<span class="q-go card-text">阅读全文 →</span>'
      };
    }
    function postPane(list) {
      if (!list.length) return '';
      return '<div class="q-pane" data-qcarousel>' +
        '<div class="q-slides">' + qSlides(list.map(postSlide)) + '</div>' +
        (list.length > 1 ? '<div class="q-dots">' + qDots(list.length) + '</div>' : '') +
        '</div>';
    }
    var postCard = (top.length + bot.length)
      ? '<section class="q-card q-post glass sheen reveal" aria-label="最新文章">' +
        postPane(top) + postPane(bot) + '</section>'
      : qEmpty('q-post', '#/posts', '还没有文章', '给文章选上 A / B 标签后会显示在这里');
    /* 相册两张小卡（横 4:3 / 竖 3:4 等面积），徽标统一「最新相册」；
       归卡仍按相册内照片横竖多数，空态文案区分方向 */
    var photoH = albumsH.length ? photoCarousel(albumsH, 'q-photo-h', '最新相册')
      : qEmpty('q-photo q-photo-h', '#/photowall', '横版相册还空着', '横版照片会归到这里');
    var photoV = albumsV.length ? photoCarousel(albumsV, 'q-photo-v', '最新相册')
      : qEmpty('q-photo q-photo-v', '#/photowall', '竖版相册还空着', '竖版照片会归到这里');
    var momentCard = moments.length ? qCard('q-moment', moments.map(function (m) {
      return {
        href: '#/moments',
        inner: '<div class="q-head">' + qBadge('最新说说') +
          '<time>' + esc(String(m.date || '').slice(0, 10)) + '</time></div>' +
          '<p class="q-sum">' + esc(String(m.text || '').slice(0, 72)) + '</p>' +
          '<span class="q-go card-text">去说说页 →</span>'
      };
    }), '最新说说') : qEmpty('q-moment', '#/moments', '还没有说说', '碎片记录会出现在这里');
    var chatterCard = chatters.length ? qCard('q-chatter', chatters.map(function (c) {
      return {
        href: '#/chatter/' + encodeURIComponent(c.id),
        inner: '<div class="q-head">' + qBadge('最新杂谈') +
          '<time>' + esc(String(c.date || '').slice(0, 10)) + '</time></div>' +
          '<h2>' + esc(c.title) + '</h2>' +
          '<p class="q-sum">' + esc(c.summary || '') + '</p>' +
          '<span class="q-go card-text">去杂谈页 →</span>'
      };
    }), '最新杂谈') : qEmpty('q-chatter', '#/chatter', '还没有杂谈', '长长短短的想法会放在这里');
    return profileCard() +
      '<div class="home-quick">' + postCard + photoH + photoV + momentCard + chatterCard + '</div>';
  }
  /* ---------- 首页快捷卡轮播：每张卡各自轮换，悬停暂停、圆点可点 ---------- */
  var quickTimer = 0, quickCards = [];
  function mountQuickCarousel() {
    if (!document.querySelectorAll) return;
    var cards = document.querySelectorAll('[data-qcarousel]');
    if (!cards || !cards.length) return;
    if (quickTimer && typeof window.clearInterval === 'function') window.clearInterval(quickTimer);
    quickTimer = 0;
    quickCards = Array.prototype.slice.call(cards).filter(function (card) {
      return card.querySelectorAll && card.querySelectorAll('.q-slide').length > 1;
    });
    quickCards.forEach(function (card) {
      var slides = card.querySelectorAll('.q-slide');
      var dots = card.querySelectorAll('.q-dot');
      var show = function (k) {
        Array.prototype.forEach.call(slides, function (s, i) { s.classList.toggle('on', i === k); });
        Array.prototype.forEach.call(dots, function (d, i) { d.classList.toggle('on', i === k); });
        card.setAttribute('data-qindex', String(k));
      };
      card.__qShow = show;
      card.__qIndex = 0;
      Array.prototype.forEach.call(dots, function (d, i) {
        if (!d.addEventListener) return;
        d.addEventListener('click', function (ev) {
          if (ev.preventDefault) ev.preventDefault();
          if (ev.stopPropagation) ev.stopPropagation();
          card.__qIndex = i; show(i);
        });
      });
      if (card.addEventListener) {
        card.addEventListener('mouseenter', function () { card.__qPause = true; });
        card.addEventListener('mouseleave', function () { card.__qPause = false; });
      }
    });
    if (reduced() || typeof window.setInterval !== 'function') return;
    quickTimer = window.setInterval(function () {
      quickCards.forEach(function (card) {
        if (card.__qPause) return;
        var n = card.querySelectorAll('.q-slide').length;
        card.__qIndex = (card.__qIndex + 1) % n;
        card.__qShow(card.__qIndex);
      });
    }, 5600);
  }
  /* ---------- 文章页：全部文章卡片化（复用项目页 x-card 布局） ---------- */
  function renderPostsPage() {
    return pageHead('文章', '写过的所有记录，都在这里', 'POSTS') +
      '<p class="page-note">共 ' + POSTS.length + ' 篇文章</p>' +
      '<div class="card-grid">' + pinnedFirst(POSTS).map(function (p) {
        return '<article class="x-card glass sheen reveal post-x-card" ' +
          'data-card-href="#/post/' + encodeURIComponent(p.slug) + '">' +
          '<div class="x-card-top"><span class="x-badge">' +
          esc(orderedTags(p.tags || []).filter(function (t) { return t !== 'A' && t !== 'B' && t !== '⭐'; })[0] || '随笔') +
          '</span>' +
          '<time>' + esc(String(p.date || '').slice(0, 10)) + '</time></div>' +
          '<h2 class="x-title"><a class="card-text" href="#/post/' + encodeURIComponent(p.slug) + '">' + esc(p.title) + '</a></h2>' +
          '<p>' + esc(p.summary || '') + '</p>' +
          '<div class="x-chips">' + orderedTags(p.tags || []).map(function (t) {
            return '<span>' + esc(t) + '</span>';
          }).join('') + '</div>' +
          '<div class="x-foot">' + postStatsHtml(p) +
          '<a class="x-link" href="#/post/' + encodeURIComponent(p.slug) + '">阅读全文 →</a></div>' +
          '</article>';
      }).join('') + '</div>';
  }

  /* ---------- 渲染与路由 ---------- */
  /* ---------- 渐显观察：threshold 必须为 0——超高元素（如内嵌长 iframe 的
     文章）在视口内的最大交会比可能低于任何正值阈值，元素将永远不显示 ---------- */
  function observeReveal() {
    if (!window.IntersectionObserver || !app.querySelectorAll) return;
    var nodes = app.querySelectorAll('.reveal');
    Array.prototype.forEach.call(nodes, function (n) { revealObserver.observe(n); });
    /* 兜底：两帧后仍在视口内的元素强制显示。正常情况下观察器一帧内就会
       补上 .in，这里只救极端时序（首帧前滚动位置漂移、iframe 挤压布局等） */
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(forceRevealInViewport);
    });
  }
  function forceRevealInViewport() {
    var vh = window.innerHeight || document.documentElement.clientHeight;
    Array.prototype.forEach.call(app.querySelectorAll('.reveal'), function (n) {
      if (n.classList.contains('in')) return;
      var r = n.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) n.classList.add('in');
    });
  }
  var revealObserver = null;
  /* 版本日志 iframe：直接把生成的 HTML 全文写进 srcdoc，无需网络请求 */
  function postChangelogTheme() {
    var frame = document.getElementById('cl-frame');
    if (!frame || !frame.contentWindow || !frame.contentWindow.postMessage) return;
    var night = !!(document.documentElement && document.documentElement.dataset &&
      document.documentElement.dataset.theme === 'night');
    try { frame.contentWindow.postMessage({ type: 'zb-theme', theme: night ? 'night' : 'day' }, '*'); }
    catch (e) {}
  }
  function initChangelogFrame() {
    var frame = document.getElementById('cl-frame');
    if (!frame || !window.CHANGELOG_HTML || !frame.setAttribute) return;
    /* iframe 内展示 HTML 文件时背景置为透明，让网站的星空背景透出来；
       单独打开这个 HTML 文件仍然是完整的渐变背景，不受影响 */
    frame.setAttribute('srcdoc', String(window.CHANGELOG_HTML).replace(/<\/head>/i,
      '<style>html,body{background:transparent!important}</style></head>'));
    if (frame.addEventListener) frame.addEventListener('load', postChangelogTheme);
  }
  function initChangelogSync() {
    if (document.addEventListener) document.addEventListener('zb:theme', postChangelogTheme);
    if (window.addEventListener) {
      window.addEventListener('message', function (e) {
        var d = e && e.data;
        if (!d || d.type !== 'cl-height' || typeof d.height !== 'number') return;
        var frame = document.getElementById('cl-frame');
        if (frame && frame.style) {
          frame.style.height = Math.min(1800, Math.max(340, Math.round(d.height) + 26)) + 'px';
        }
      });
    }
  }
  function paint(html, active, subTitle) {
    app.innerHTML = html;
    /* 正文刚进 DOM：按真实渲染出来的标题重建 :::cont::: 目录，新增标题立刻进卡片 */
    if (window.ZBMD && window.ZBMD.refreshToc) window.ZBMD.refreshToc(app);
    initChangelogFrame();
    document.title = (subTitle ? subTitle + ' · ' : '') + TITLE;
    Array.prototype.forEach.call(document.querySelectorAll('.nav a'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === active);
    });
    navPillTarget();
    if (window.ZBLikes && window.ZBLikes.mount) window.ZBLikes.mount();
    if (window.ZBInteractions && window.ZBInteractions.mount) window.ZBInteractions.mount();
    if (window.ZBLive && window.ZBLive.mount) window.ZBLive.mount();
    mountQuickCarousel();
    /* 先回到页顶再注册渐显观察：观察器按当前滚动位置计算相交状态，
       若先 observe 后 scrollTo，从页面中部点进文章时首屏元素会被判在
       视口之外而不显示，直到用户手动滚动才出现 */
    window.scrollTo(0, 0);
    observeReveal();
    initCountUp();
    measureScroll();
    updateScroll();
  }
  function route() {
    /* 每次导航都重算文章集合：工坊删除后回首页立即生效 */
    syncPosts();
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('/').filter(Boolean).map(decode);
    var html, active = 'home', sub = '';

    if (!parts.length) {
      html = query ? renderGlobalSearch(query) : renderHome();
    } else if (parts[0] === 'posts') {
      html = query ? renderGlobalSearch(query) : renderPostsPage(); active = 'posts'; sub = '文章';
    } else if (parts[0] === 'post' && parts[1]) {
      var p = POSTS.filter(function (x) { return x.slug === parts[1]; })[0];
      html = p ? renderPost(p) : '<p class="page-note">没找到这篇文章。</p>';
      sub = p ? p.title : '';
    } else if (parts[0] === 'tags') {
      html = renderTags(); active = 'tags'; sub = '标签';
    } else if (parts[0] === 'tag' && parts[1]) {
      html = renderList(POSTS.filter(function (p) {
        return (p.tags || []).indexOf(parts[1]) >= 0;
      }), '标签：' + parts[1]); sub = parts[1];
    } else if (parts[0] === 'projects') {
      html = renderProjects(); active = 'projects'; sub = '项目';
    } else if (parts[0] === 'timeline') {
      html = renderTimeline(); active = 'timeline'; sub = '归档';
    } else if (parts[0] === 'photowall') {
      html = renderPhotowall(); active = 'photowall'; sub = '相册';
    } else if (parts[0] === 'album' && parts[1]) {
      var a = arr('albums').filter(function (x) { return x.id === parts[1]; })[0];
      html = a ? renderAlbum(a) : '<p class="page-note">没找到这个相册。</p>';
      active = 'photowall'; sub = a ? a.title : '';
    } else if (parts[0] === 'moments') {
      html = renderMoments(); active = 'moments'; sub = '说说';
    } else if (parts[0] === 'chatter' && parts[1]) {
      var c = arr('chatter').filter(function (x) { return x.id === parts[1]; })[0];
      html = c ? renderChatterDetail(c) : '<p class="page-note">没找到这则杂谈。</p>';
      active = 'chatter'; sub = c ? c.title : '';
    } else if (parts[0] === 'chatter') {
      html = renderChatter(); active = 'chatter'; sub = '杂谈';
    } else if (parts[0] === 'friends') {
      html = renderFriends(); active = 'friends'; sub = '友链';
    } else if (parts[0] === 'about') {
      html = renderAbout(); active = 'about'; sub = '关于';
      /* 日志 HTML 全文约 80KB，只在真的进关于页时才拉，首屏不背 */
      window.setTimeout(ensureChangelogHtml, 0);
    } else if (parts[0] === 'settings') {
      html = renderSettings(); active = 'settings'; sub = '设置';
    } else if (parts[0] === 'vip') {
      /* 新站长入口：只有持有效设备凭证的设备才渲染工坊，其余设备与不存在页面完全一致 */
      var vipOwner = !!(window.STUDIO && window.STUDIO.isOwner && window.STUDIO.isOwner());
      if (!vipOwner) paint('<p class="page-note">页面不存在。</p>', '', '页面不存在');
      else {
        paint('', 'studio', '工坊');
        if (window.STUDIO && window.STUDIO.render) window.STUDIO.render(app);
      }
      return;
    } else if (parts[0] === 'studio') {
      /* 旧入口已停用：已授权设备平滑切到 #/vip，其余设备显示页面不存在 */
      if (window.STUDIO && window.STUDIO.isOwner && window.STUDIO.isOwner()) location.hash = '#/vip';
      else paint('<p class="page-note">页面不存在。</p>', '', '页面不存在');
      return;
    } else if (parts[0] === 'studio-exp') {
      /* 游客「工坊 · 体验」：完整工坊界面，但所有改动网站的按钮都被拦截 */
      paint('', 'studio-exp', '工坊 · 体验');
      if (window.STUDIO && window.STUDIO.renderExperience) window.STUDIO.renderExperience(app);
      return;
    } else {
      html = '<p class="page-note">页面不存在。</p>';
    }
    paint(html, active, sub);
  }
  function repaint(fn) { paint(fn(), location.hash.indexOf('timeline') >= 0 ? 'timeline' :
    (location.hash.indexOf('chatter') >= 0 ? 'chatter' : 'moments')); }

  /* ---------- 星空：固定种子，保证每次布局一致 ----------
     大星统一用圆角五角星 SVG（symbol #puffy-star），全站不再使用四角星图形；
     每颗动星生成时随机一个朝向，之后只平移不旋转；
     少量小星标 is-warm 散出蜜金光点；暖色一律由 CSS 的雾晕与柔光提供。 */
  function initSky() {
    var box = document.getElementById('stars');
    var petalBox = document.getElementById('petals');
    if (!box || !box.appendChild) return;
    var seed = 20261107;
    function rnd() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }
    for (var i = 0; i < 108; i++) {
      var puffy = i % 8 === 0;
      var warm = !puffy && i % 13 === 5;
      var still = !puffy && !warm;
      var s = document.createElement('span');
      /* 按生成顺序标注档位：q-core / q-mid / q-high 是历史密度分级；
         v3.57 起低画质整组隐藏星空，这些标注只服务于中 / 高画质的增量显示 */
      var tier = i < 36 ? ' q-core' : (i < 72 ? ' q-mid' : ' q-high');
      s.className = (puffy ? 'star is-puffy' : (warm ? 'star is-warm' : 'star is-still')) + tier;
      var size = puffy ? (11 + rnd() * 10).toFixed(1) + 'px' : (1 + rnd() * 2.1).toFixed(1) + 'px';
      var dx = rnd() * 56 - 28;
      var dy = rnd() * 50 - 25;
      var spin0 = rnd() * 360;
      var dx2 = dx * .55 + (rnd() * 12 - 6);
      var dy2 = -dy * .42 + (rnd() * 10 - 5);
      var dx3 = dx * .48 + (rnd() * 10 - 5);
      var dy3 = dy * 1.2 + (rnd() * 12 - 6);
      var pos = 'left:' + (rnd() * 100).toFixed(2) + '%;' +
        'top:' + (rnd() * 100).toFixed(2) + '%;';
      var dur = (26 + rnd() * 26).toFixed(1) + 's';
      var delay = (-(rnd() * 40)).toFixed(1) + 's';
      var motion =
        '--dx:' + dx.toFixed(1) + 'px;' +
        '--dy:' + dy.toFixed(1) + 'px;' +
        '--spin0:' + spin0.toFixed(1) + 'deg;' +
        '--dx2:' + dx2.toFixed(1) + 'px;' +
        '--dy2:' + dy2.toFixed(1) + 'px;' +
        '--dx3:' + dx3.toFixed(1) + 'px;' +
        '--dy3:' + dy3.toFixed(1) + 'px;' +
        '--dur:' + dur + ';' +
        '--delay:' + delay + ';';
      var css = pos + (still ? '--sop:' + (.58 + (i % 5) * .06).toFixed(2) + ';' : motion);
      css += puffy ? '--size:' + size + ';' : 'width:' + size + ';height:' + size + ';';
      s.style.cssText = css;
      if (puffy) s.innerHTML = '<svg viewBox="0 0 100 100"><use href="#puffy-star"/></svg>';
      box.appendChild(s);
    }
    if (petalBox && petalBox.appendChild) {
      var fills = ['rgba(250,205,225,.72)', 'rgba(255,255,255,.80)',
        'rgba(244,186,212,.62)', 'rgba(206,224,250,.58)'];
      /* 前 4 片低画质保留，前 10 片中画质保留，前 14 片高画质保留，
         最后 2 片只在极高画质出现（同屏 16 片封顶，再多就喧宾夺主） */
      for (var j = 0; j < 16; j++) {
        var p = document.createElement('span');
        p.className = 'petal' + (j < 4 ? ' q-core' : (j < 10 ? ' q-mid' : (j < 14 ? ' q-high' : ' q-ultra')));
        p.style.cssText = 'left:' + (rnd() * 96).toFixed(2) + '%;' +
          'top:' + (-8 - rnd() * 18).toFixed(1) + '%;' +
          '--size:' + (9 + rnd() * 9).toFixed(1) + 'px;' +
          '--dur:' + (24 + rnd() * 16).toFixed(1) + 's;' +
          '--delay:' + (rnd() * 22).toFixed(1) + 's;' +
          '--op:' + (.28 + rnd() * .28).toFixed(2) + ';' +
          '--petal-fill:' + fills[j % fills.length] + ';';
        p.innerHTML = '<svg viewBox="0 0 100 100"><use href="#petal"/></svg>';
        petalBox.appendChild(p);
      }
    }
  }

  /* ---------- 高画质鼠标斥力：花 / 花瓣 / 星星被指针轻轻推开 ----------
     位移通过 CSS 变量 --fx/--fy 注入三个游走动画（star-drift / deco-drift /
     petal-fall）每帧的 transform 与原动画叠加：靠近时按距离快速推开，
     指针移走后以很小的速率缓缓回到原位，背景分布保持均匀。
     中低画质不启用；触屏没有 mousemove 自然不触发。 */
  var rep = { on: false, bound: false, items: [], raf: 0,
              mx: -9999, my: -9999, lastMove: 0 };
  function repCollect() {
    var els = document.querySelectorAll('.petals .petal, .stars .star, .blooms .sky-deco');
    rep.items = [];
    for (var i = 0; i < els.length; i++) {
      if (els[i].offsetParent === null) continue; /* 本档位隐藏的装饰不参与 */
      rep.items.push({ el: els[i], fx: 0, fy: 0 });
    }
  }
  function repReset() {
    for (var i = 0; i < rep.items.length; i++) {
      var it = rep.items[i];
      it.fx = 0; it.fy = 0;
      it.el.style.setProperty('--fx', '0px');
      it.el.style.setProperty('--fy', '0px');
    }
  }
  function repFrame() {
    rep.raf = 0;
    var active = Date.now() - rep.lastMove < 220;   /* 指针刚动过：即使已回位也保持响应 */
    var settled = true;
    var R = 150, AMP = 46;
    for (var i = 0; i < rep.items.length; i++) {
      var it = rep.items[i], el = it.el;
      var r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      var dx = r.left + r.width / 2 - rep.mx, dy = r.top + r.height / 2 - rep.my;
      var d = Math.sqrt(dx * dx + dy * dy);
      var tx = 0, ty = 0, near = false;
      if (d < R && d > .01) {
        near = true;
        var f = (1 - d / R) * AMP;
        tx = dx / d * f; ty = dy / d * f;
      }
      /* 靠近时快速避让，离开后用小速率缓缓回原位 */
      var k = near ? .22 : .045;
      it.fx += (tx - it.fx) * k;
      it.fy += (ty - it.fy) * k;
      if (Math.abs(it.fx) > .08 || Math.abs(it.fy) > .08) {
        settled = false;
        el.style.setProperty('--fx', it.fx.toFixed(2) + 'px');
        el.style.setProperty('--fy', it.fy.toFixed(2) + 'px');
      } else if (it.fx || it.fy) {
        it.fx = 0; it.fy = 0;
        el.style.setProperty('--fx', '0px');
        el.style.setProperty('--fy', '0px');
      }
    }
    if (!settled || active) rep.raf = requestAnimationFrame(repFrame);
  }
  function repSet(on) {
    if (rep.on === on) return;
    rep.on = on;
    if (on) {
      repCollect();
      if (!rep.bound) {
        rep.bound = true;
        if (window.addEventListener) {
          window.addEventListener('mousemove', function (e) {
            rep.mx = e.clientX; rep.my = e.clientY; rep.lastMove = Date.now();
            if (rep.on && !rep.raf) rep.raf = requestAnimationFrame(repFrame);
          }, { passive: true });
        }
      }
    } else {
      if (rep.raf) { cancelAnimationFrame(rep.raf); rep.raf = 0; }
      repReset();
    }
  }
  function initSkyRepulsion() {
    try {
      document.addEventListener('zb:quality', function (e) {
        repSet(e.detail === 'high' || e.detail === 'ultra');
      });
    } catch (err) {}
    repSet(qualityNow === 'high' || qualityNow === 'ultra');
  }

  /* ---------- 晴空 / 星夜 ---------- */
  function readTheme() {
    try { return window.localStorage ? window.localStorage.getItem('zb-theme') : null; }
    catch (e) { return null; }
  }
  function saveTheme(t) {
    try { if (window.localStorage) window.localStorage.setItem('zb-theme', t); }
    catch (e) { /* file:// 下可能不可用，忽略 */ }
  }
  /* 主题图标：日月同体 SVG。切换时月牙/光瓣平滑过渡，
     日→月结尾微微回摆（惯性），月→日结尾小膨胀再回弹（style.css 定义动画） */
  var ICON_THEME = '<svg class="theme-morph" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<mask id="zb-moon-cut"><rect x="-6" y="-6" width="36" height="36" fill="#fff"/><circle class="moon-cut" cx="12" cy="12" r="6.1" fill="#000"/></mask>' +
    '<circle class="tm-core" cx="12" cy="12" r="7.2" mask="url(#zb-moon-cut)" fill="currentColor"></circle>' +
    '<g class="tm-rays" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M12 1.8v2.2M12 20v2.2M1.8 12H4M20 12h2.2M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M19.2 4.8l-1.6 1.6M6.4 17.6l-1.6 1.6"/></g></svg>';
  function themeIconSet(btn, night, anim) {
    if (!btn) return;
    var svg = btn.querySelector('svg.theme-morph');
    if (!svg) {
      btn.innerHTML = ICON_THEME;
      svg = btn.querySelector('svg.theme-morph');
    }
    if (!svg) return;
    svg.classList.toggle('is-night', !!night);
    svg.classList.remove('to-day', 'to-night');
    if (anim) {
      try { void svg.getBoundingClientRect(); } catch (e) { /* 忽略 */ }
      svg.classList.add(anim);
      window.setTimeout(function () { svg.classList.remove(anim); }, 1200);
    }
  }
  function applyTheme(t) {
    var root = document.documentElement;
    if (root && root.dataset) {
      if (t === 'night') root.dataset.theme = 'night';
      else delete root.dataset.theme;
    }
    if (window.ZBInteractions && window.ZBInteractions.syncTheme) window.ZBInteractions.syncTheme();
    themeIconSet(document.getElementById('theme-toggle'), t === 'night', false);
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-label', t === 'night' ? '切换为晴空模式' : '切换为星夜模式');
      btn.setAttribute('title', t === 'night' ? '切换为晴空模式' : '切换为星夜模式');
    }
    try { document.dispatchEvent(new CustomEvent('zb:theme', { detail: t })); } catch (e) {}
  }
  function initTheme() {
    applyTheme(readTheme());
    var btn = document.getElementById('theme-toggle');
    if (btn && btn.addEventListener) {
      btn.addEventListener('click', function () {
        var night = document.documentElement && document.documentElement.dataset &&
          document.documentElement.dataset.theme === 'night';
        var next = night ? '' : 'night';
        saveTheme(next);
        applyTheme(next);
        /* 只在点击这一次播放形变收尾动画（惯性回摆 / 小膨胀） */
        themeIconSet(btn, next === 'night', next === 'night' ? 'to-night' : 'to-day');
      });
    }
  }

  /* ---------- 导航胶囊（Huawei 式切换） ----------
     选中底衬独立成一层 .nav-pill，切换时用弹簧丝滑滑到新项背后：
     移动快时胶囊沿运动方向拉伸变细（水滴张力）。
     （旧版胶囊后面还跟着一滴 .nav-drop 尾随液滴，实际观感是导航栏
     最右侧常驻一颗小圆气泡——按需求删除，只保留主胶囊。） */
  var pillBox = null;
  function initNavPill() {
    var nav = document.querySelector('.nav');
    if (!nav || nav.__zbPill || !window.requestAnimationFrame) return;
    var pill = document.createElement('span');
    pill.className = 'nav-pill';
    nav.appendChild(pill);
    pillBox = nav.__zbPill = {
      nav: nav, pill: pill,
      x: null, w: 0, y: 0, h: 0, vx: 0, vw: 0,
      tx: 0, tw: 0, ty: 0, th: 0, running: false, last: 0
    };
    navPillTarget();
    window.addEventListener('resize', navPillTarget);
    document.addEventListener('zb-nav-sync', navPillTarget);
    window.addEventListener('load', function () { setTimeout(navPillTarget, 120); });
  }
  function navPillTarget() {
    if (!pillBox) return;
    var a = pillBox.nav.querySelector('a.active');
    if (!a) { pillBox.pill.style.opacity = '0'; pillBox.x = null; return; }
    pillBox.pill.style.opacity = '1';
    pillBox.tx = a.offsetLeft;
    pillBox.ty = a.offsetTop;
    pillBox.tw = a.offsetWidth;
    pillBox.th = a.offsetHeight;
    if (pillBox.x == null) { /* 首次直接就位，不做动画 */
      pillBox.x = pillBox.tx; pillBox.w = pillBox.tw;
      pillBox.y = pillBox.ty; pillBox.h = pillBox.th;
      pillPaint(pillBox);
      return;
    }
    pillStart();
  }
  function pillStart() {
    if (!pillBox || pillBox.running) return;
    pillBox.running = true;
    pillBox.last = 0;
    window.requestAnimationFrame(pillStep);
  }
  function pillPaint(pb) {
    var sx = 1 + Math.min(.42, Math.abs(pb.vx) * 0.0016);
    var sy = 1 / Math.max(1, sx);
    pb.pill.style.width = pb.w + 'px';
    pb.pill.style.height = pb.h + 'px';
    pb.pill.style.transform = 'translate3d(' + pb.x + 'px,' + pb.y + 'px,0) scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')';
  }
  function pillStep(t) {
    var pb = pillBox;
    if (!pb || !pb.running) return;
    var dt = pb.last ? Math.min(0.05, (t - pb.last) / 1000) : 0.016;
    pb.last = t;
    /* 主胶囊弹簧 */
    var ax = (pb.tx - pb.x) * 200 - pb.vx * 24;
    var aw = (pb.tw - pb.w) * 200 - pb.vw * 24;
    pb.vx += ax * dt; pb.vw += aw * dt;
    pb.x += pb.vx * dt; pb.w += pb.vw * dt;
    pb.y = pb.ty; pb.h = pb.th;
    pillPaint(pb);
    if (Math.abs(pb.tx - pb.x) < .4 && Math.abs(pb.tw - pb.w) < .4 &&
        Math.abs(pb.vx) < 8 && Math.abs(pb.vw) < 8) {
      pb.x = pb.tx; pb.w = pb.tw; pb.vx = 0; pb.vw = 0;
      pillPaint(pb);
      pb.running = false;
      return;
    }
    window.requestAnimationFrame(pillStep);
  }
  /* 导航星标反馈：点击切换后，新选中项文字背后的星星蓄势突然膨胀、再弹回
     原大小（keyframes 见 style.css 的 nav-star-pop） */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('.nav a[data-nav]') : null;
    if (!a) return;
    a.classList.remove('star-pop');
    try { void a.offsetWidth; } catch (err) { /* 忽略 */ }
    a.classList.add('star-pop');
    window.setTimeout(function () { a.classList.remove('star-pop'); }, 620);
  });
  /* ---------- 照片堆叠：滚轮 / 滑动换层（全队列旋转） ----------
     桌面端：鼠标在照片集上滚轮向下 → 最上层照片丝滑滑落到最底层（队尾），
     下一层浮现到顶层；滚轮向上 → 队尾照片丝滑升到最上层。
     照片超过三张时全员入队、只显示前三层，不再只是三张循环。
     鼠标在照片集上滚动时一律拦截页面滚动：只切照片，不让网页跟着滚。
     手机端：在照片集上右滑 = 滚轮向下，左滑 = 滚轮向上。
     层次明度差不变：顶层原样、下层偏白、下下层更偏白（CSS 白膜跟随淡入淡出）。 */
  function initStackWheel() {
    if (document.__zbStack || !document.addEventListener) return;
    document.__zbStack = true;
    var touch = null;
    document.addEventListener('wheel', function (e) {
      var st = e.target && e.target.closest ? e.target.closest('.album-stack') : null;
      if (!st) return;
      /* 只要在照片集上滚动就拦下页面滚动：照片不足两张时切不动，页面也不许滚 */
      e.preventDefault();
      if (st.__busy) return;
      st.__acc = (st.__acc || 0) + e.deltaY;
      if (Math.abs(st.__acc) < 55) return;
      var dir = st.__acc > 0 ? 1 : -1;
      st.__acc = 0;
      rotateStack(st, dir);
    }, { passive: false });
    document.addEventListener('touchstart', function (e) {
      var st = e.target && e.target.closest ? e.target.closest('.album-stack') : null;
      if (!st || !e.touches.length) return;
      touch = { st: st, x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (!touch) return;
      var tx = touch; touch = null;
      if (!e.changedTouches.length) return;
      var dx = e.changedTouches[0].clientX - tx.x;
      var dy = e.changedTouches[0].clientY - tx.y;
      if (tx.st.__busy || Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      /* 右滑 = 滚轮向下（顶 → 底），左滑 = 滚轮向上（底 → 顶） */
      rotateStack(tx.st, dx > 0 ? 1 : -1);
    }, { passive: true });
  }
  /* 换层交叉淡化：新顶层渐渐出现、被切走的照片渐渐隐去再在新层位浮现，
     让 className 轮换的瞬间不生硬 */
  function stackFade(el, from, ms) {
    if (!el || typeof el.animate !== 'function') return;
    try {
      var a = el.animate([{ opacity: from }, { opacity: 1 }],
        { duration: ms, easing: 'ease-out' });
      a.addEventListener('finish', function () { try { a.cancel(); } catch (e) { /* 忽略 */ } });
    } catch (e) { /* 忽略 */ }
  }
  /* 被动降位的照片（没有飞行动画）：先隐后现，像被新主角盖住又透出来 */
  function stackSink(el, ms) {
    if (!el || typeof el.animate !== 'function') return;
    try {
      var a = el.animate([
        { opacity: 1 }, { opacity: .22, offset: .45 }, { opacity: 1 }
      ], { duration: ms || 380, easing: 'ease-in-out' });
      a.addEventListener('finish', function () { try { a.cancel(); } catch (e) { /* 忽略 */ } });
    } catch (e) { /* 忽略 */ }
  }
  /* 队列式换层：全部照片按 data-idx 入队（0 = 最上层），滚轮向下整队前移一位
     （顶层落到队尾、1→0），向上整队后移一位（队尾升顶、0→1）。
     只显示前三层：0 顶 / 1 中 / 2 背，其余 .stack-deep 隐藏待命；
     升顶的照片从隐藏层浮出，落进隐藏层的照片边下滑边淡出（CSS 过渡接力）。 */
  function rotateStack(st, dir) {
    var layers = [];
    Array.prototype.forEach.call(st.querySelectorAll('[data-stack-layer]'), function (el) {
      layers.push(el);
    });
    var n = layers.length;
    if (n < 2 || st.__busy) return; /* 单张没有可换的层 */
    st.__busy = true;
    window.setTimeout(function () { st.__busy = false; }, 500);
    var byP = {};
    layers.forEach(function (el) {
      var p = parseInt(el.getAttribute('data-idx') || '0', 10) || 0;
      byP[p] = el;
      el.__p = p;
      el.__np = (p - dir + n) % n;
    });
    /* 飞行动画只给跨越顶层边界的照片：向下 = 旧顶滑落，向上 = 旧队尾升起 */
    var mover = dir > 0 ? byP[0] : byP[n - 1];
    var a = null;
    if (mover && mover.animate) {
      if (dir > 0) {
        a = mover.animate([
          { transform: 'rotate(0deg) translateY(0) scale(1)', opacity: 1, offset: 0 },
          { transform: 'rotate(2deg) translateY(-18px) scale(1.07)', opacity: .8, offset: 0.42 },
          { transform: 'rotate(-2.6deg) translateY(-13px) scale(.955)', opacity: .22, offset: 1 }
        ], { duration: 470, easing: 'cubic-bezier(.4,.1,.3,1)' });
      } else {
        var fromDeep = n > 3;
        if (fromDeep) mover.style.zIndex = 9; /* 升顶途中浮到最前 */
        a = mover.animate([
          { transform: 'rotate(-2.6deg) translateY(-13px) scale(.955)', opacity: fromDeep ? 0 : .55, offset: 0 },
          { transform: 'rotate(3deg) translateY(-30px) scale(1.08)', opacity: .92, offset: 0.45 },
          { transform: 'rotate(0deg) translateY(0) scale(1)', opacity: 1, offset: 1 }
        ], { duration: 470, easing: 'cubic-bezier(.4,.1,.3,1)' });
      }
    }
    window.setTimeout(function () {
      layers.forEach(function (el) {
        var np = el.__np;
        el.setAttribute('data-idx', String(np));
        el.className = np === 0 ? 'stack-top' : np === 1 ? 'stack-mid' : np === 2 ? 'stack-back' : 'stack-deep';
        el.style.zIndex = '';
      });
      if (a) a.cancel();
      if (dir > 0) {
        var newTop = byP[1];                  /* 旧中层升为新顶层 */
        if (newTop) stackFade(newTop, .25, 260);
        var lander = n > 3 ? byP[3] : byP[0]; /* 落到最底可见层的照片渐渐浮现 */
        if (lander) stackFade(lander, n > 3 ? 0 : .22, 240);
      } else {
        var riser = byP[n - 1];               /* 升到顶层渐渐出现 */
        if (riser) stackFade(riser, .3, 240);
        var sinker = byP[0];                  /* 被切走的顶层先隐后现 */
        if (sinker) stackSink(sinker, 380);
      }
    }, 200);
  }

  /* ---------- 搜索 ---------- */
  function initSearch() {
    var input = document.getElementById('search');
    if (!input || !input.addEventListener) return;
    input.addEventListener('input', function () {
      query = (input.value || '').trim();
      if (location.hash && location.hash !== '#/' && location.hash !== '#') {
        location.hash = '#/';
      } else {
        route();
      }
    });
  }

  /* ---------- 阅读进度 / 回到顶部 / 代码复制 ---------- */
  var scrollMax = 1;
  function measureScroll() {
    var h = (document.documentElement && document.documentElement.scrollHeight || 0) - (window.innerHeight || 0);
    scrollMax = h > 0 ? h : 1;
  }
  function updateScroll() {
    var bar = document.getElementById('reading-progress');
    var top = document.getElementById('to-top');
    var y = window.scrollY || 0;
    var ratio = Math.min(1, Math.max(0, y / scrollMax));
    if (bar && bar.style) bar.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    if (top && top.classList) {
      if (y > 320) top.classList.add('show');
      else top.classList.remove('show');
    }
  }
  /* 回到顶部：点击按钮直接回到顶端，没有任何多余动画——
     星星、圆钮、滚动过渡一律不要（临时关掉 CSS 平滑滚动硬跳，跳完还原）。 */
  function flyTop(top) {
    var de = document.documentElement;
    var prev = de.style.scrollBehavior;
    de.style.scrollBehavior = 'auto';
    /* 只改行内样式还不够：同一次 tick 里 scrollTo 仍会用改之前算好的 scroll-behavior，
       先强制一次样式重算；再用 behavior:'instant' 覆盖 CSS（规范里它优先于 scroll-behavior）。 */
    try { void de.offsetHeight; } catch (e) {}
    try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
    catch (e) { window.scrollTo(0, 0); }
    if (window.scrollY) window.scrollTo(0, 0);
    de.style.scrollBehavior = prev;
  }

  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) done();
    } catch (e) { /* 复制不可用时保持静默 */ }
  }
  function copyCode(text, btn) {
    function done() {
      btn.textContent = '已复制';
      btn.classList.add('done');
      window.setTimeout(function () {
        btn.textContent = '复制';
        btn.classList.remove('done');
      }, 1600);
    }
    try {
      if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
        window.navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
      } else {
        fallbackCopy(text, done);
      }
    } catch (e) { fallbackCopy(text, done); }
  }

  /* ---------- 灯箱 ---------- */
  function lbShow(i) {
    if (!lb.list.length) return;
    lb.index = (i + lb.list.length) % lb.list.length;
    var p = lb.list[lb.index];
    var box = document.getElementById('lightbox');
    var img = document.getElementById('lb-img');
    var t = document.getElementById('lb-title');
    var n = document.getElementById('lb-note');
    var x = document.getElementById('lb-index');
    if (!box || !img) return;
    img.src = p.src;
    img.alt = p.title || '';
    if (t) t.textContent = p.title || '';
    if (n) n.textContent = p.note || '';
    if (x) x.textContent = (lb.index + 1) + ' / ' + lb.list.length;
    box.classList.add('open');
  }
  function lbClose() {
    var box = document.getElementById('lightbox');
    if (box) box.classList.remove('open');
  }
  function initLightbox() {
    var box = document.getElementById('lightbox');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var t = e.target;
      if (!t) return;
      var b = null;
      if (t.closest) {
        var hit = t.closest('[data-lb]');
        if (hit) b = hit.getAttribute('data-lb');
      }
      if (!b && t.getAttribute) b = t.getAttribute('data-lb');
      if ((t.className || '').indexOf('lb-backdrop') >= 0) b = 'close';
      if (b === 'close') lbClose();
      else if (b === 'prev') lbShow(lb.index - 1);
      else if (b === 'next') lbShow(lb.index + 1);
    });
    document.addEventListener('keydown', function (e) {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape') lbClose();
      if (e.key === 'ArrowLeft') lbShow(lb.index - 1);
      if (e.key === 'ArrowRight') lbShow(lb.index + 1);
    });
  }

  /* ---------- 交互 ---------- */
  function initInteractions() {
    if (app.addEventListener) {
      app.addEventListener('click', function (e) {
        var t = e.target;
        if (!t) return;
        var node = t.closest ? t : null;
        if (node && node.closest) {
          /* 点击链接区域：卡片模式整张卡可点，文字模式只放行 .card-text 那几个入口。
             卡片本身是 <a> 时交给原生跳转，不是 <a>（文章卡 / 项目卡）就手动导航。 */
          /* 首页轮播的每一屏本身就是 <a>，文字模式下要把「点空白也会跳」拦掉 */
          var qSlide = node.closest('.q-slide[href]');
          if (qSlide && readClick() === 'text' && !node.closest('.card-text')) {
            if (e.preventDefault) e.preventDefault();
            return;
          }
          var card = node.closest('[data-card-href]');
          if (card) {
            var textHit = node.closest('.card-text');
            if (readClick() === 'text') {
              if (!textHit) { if (e.preventDefault) e.preventDefault(); return; }
            } else if (card.tagName !== 'A' && !node.closest('a, button, input, textarea, select, ' +
                '[data-photo], [data-like], [data-qspec-toggle], [data-morder], [data-cfilter], ' +
                '[data-tfilter], [data-share], .photo-tile')) {
              var cardHref = card.getAttribute('data-card-href');
              if (cardHref) {
                if (e.preventDefault) e.preventDefault();
                if (cardHref.charAt(0) === '#') location.hash = cardHref;
                else location.href = cardHref;
                return;
              }
            }
          }
          /* Markdown 内链接：以 / 开头，点击时把链接文本接在当前站点网址后面 */
          var innerA = node.closest('a[data-md-link="inner"]');
          if (innerA) {
            if (e.preventDefault) e.preventDefault();
            location.href = location.origin + (innerA.getAttribute('href') || '/');
            return;
          }
          if (node.closest('[data-toc]') && node.closest('[data-toc]').getAttribute('data-toc') !== null) {
            var hs = app.querySelectorAll('.article-body h2');
            var target = hs[Number(node.closest('[data-toc]').getAttribute('data-toc'))];
            if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          /* :::cont::: 的目录条目是锚点链接：SPA 里必须拦下默认跳转，
             否则 #h-xxx 会被当成路由把文章页换掉；静态阅读版仍可用原生锚点 */
          var tocA = node.closest('.toc-list a[href^="#h-"]');
          if (tocA) {
            if (e.preventDefault) e.preventDefault();
            var slug = tocA.getAttribute('href').slice(1);
            var dest = document.getElementById(slug);
            if (dest && dest.scrollIntoView) dest.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
          var photo = node.closest('[data-photo]');
          if (photo) { lbShow(Number(photo.getAttribute('data-photo'))); return; }
          var like = node.closest('[data-like]');
          if (like && window.ZBLikes) {
            window.ZBLikes.onLike(like);
            return;
          }
          var specBtn = node.closest('[data-qspec-toggle]');
          if (specBtn) {
            var panel = document.getElementById('q-spec-panel');
            if (panel) {
              var open = !panel.classList.contains('open');
              panel.classList.toggle('open', open);
              panel.setAttribute('aria-hidden', open ? 'false' : 'true');
              specBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
              specBtn.classList.toggle('on', open);
            }
            return;
          }
          /* 只认设置卡里的画质按钮：html 根节点也带 data-quality（CSS 档位驱动），
             旧的裸属性 closest 会命中根节点，把归档标签、杂谈筛选等
             排在其后的分支全部拦截（归档标签只能停在「全部」的 BUG 根因） */
          var quality = node.closest('.quality-item[data-quality]');
          if (quality) {
            var qv = quality.getAttribute('data-quality');
            saveQuality(qv);
            applyQuality(qv);
            Array.prototype.forEach.call(app.querySelectorAll('.quality-item[data-quality]'), function (btn) {
              var on = btn.getAttribute('data-quality') === qv;
              btn.classList.toggle('on', on);
              btn.setAttribute('aria-checked', on ? 'true' : 'false');
            });
            var qc = document.getElementById('quality-current');
            if (qc) qc.textContent = qualityName(qv);
            return;
          }
          var order = node.closest('[data-morder]');
          if (order) { momentOrder = order.getAttribute('data-morder'); retintMoments(); return; }
          var cf = node.closest('[data-cfilter]');
          if (cf) { chatterTag = cf.getAttribute('data-cfilter'); retintChatter(); return; }
          var tf = node.closest('[data-tfilter]');
          if (tf) { timelineTag = tf.getAttribute('data-tfilter'); retintTimeline(); return; }
          var share = node.closest('[data-share]');
          if (share) {
            var url = location.origin + location.pathname + share.getAttribute('data-share');
            copyCode(url, share);
            share.textContent = '已复制链接';
            window.setTimeout(function () { share.textContent = '复制文章链接'; }, 1600);
            return;
          }
          var tile = node.closest('.photo-tile');
          if (tile && tile.getAttribute('data-photo') !== null) {
            lbShow(Number(tile.getAttribute('data-photo')));
            return;
          }
        }
        if ((t.className || '').indexOf('copy-btn') >= 0) {
          var pre = t.parentNode;
          var code = pre && pre.querySelector ? pre.querySelector('code') : null;
          if (code) copyCode(code.textContent, t);
        }
      });
    }
    /* 标签页搜索：输入即时过滤，清空按钮只在有关键词时出现 */
    app.addEventListener('input', function (e) {
      var t = e.target;
      if (t && t.id === 'tag-search') filterTags(t.value);
    });
    app.addEventListener('click', function (e) {
      var c = e.target && e.target.closest ? e.target.closest('[data-tag-clear]') : null;
      if (!c) return;
      var inp = document.getElementById('tag-search');
      if (inp) { inp.value = ''; filterTags(''); inp.focus(); }
    });
    var top = document.getElementById('to-top');
    if (top && top.addEventListener) {
      top.addEventListener('click', function () {
        flyTop(top);
        launchStarMeteor(top);
      });
    }
    var ticking = false;
    function raf(fn) {
      if (window.requestAnimationFrame) return window.requestAnimationFrame(fn);
      return window.setTimeout(fn, 16);
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      raf(function () { updateScroll(); ticking = false; });
    }, { passive: true });
    window.addEventListener('resize', function () {
      measureScroll();
      updateScroll();
    }, { passive: true });
    window.addEventListener('hashchange', route);
    measureScroll();
    updateScroll();
  }

  /* ---------- 特效：启动淡入 / 滚动渐显 / 指针光泽 / 流萤 / 运行时长 ---------- */
  function reduced() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }
  function initEffects() {
    if (window.IntersectionObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); revealObserver.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -30px 0px', threshold: 0 });
    } else {
      revealObserver = { observe: function (n) { n.classList.add('in'); }, unobserve: function () {} };
    }
    /* 启动闪屏：只在每个会话第一次进入时出现，之后完全无感 */
    var splash = document.getElementById('splash');
    var seen = false;
    try { seen = window.sessionStorage.getItem('zb-splash') === '1'; } catch (e) {}
    if (splash) {
      if (seen || reduced()) { splash.parentNode && splash.parentNode.removeChild(splash); }
      else {
        try { window.sessionStorage.setItem('zb-splash', '1'); } catch (e) {}
        window.setTimeout(function () { splash.classList.add('out'); }, 780);
        window.setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 1500);
      }
    }
    /* 指针柔光 + 卡片高光位置，只写 transform / CSS 变量，不触发布局 */
    var glow = document.getElementById('cursor-glow');
    var fine = false;
    try { fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) {}
    if (fine && !reduced()) {
      /* 性能：卡片范围只在 pointerover 时读一次布局，逐帧不再调用 elementFromPoint / getBoundingClientRect */
      var px = 0, py = 0, busy = false, host = null, rect = null;
      /* 鼠标尾迹：把这一帧走过的位移画成一段蜜金流星尾 —— 头部固定在指针处最亮，
         尾巴朝来路渐隐，随后以头部为原点收回并淡出。全程只动 transform / opacity，
         节点数封顶 40，中 / 低画质与 reduced-motion 不会走到这里。 */
      var trailX = 0, trailY = 0, trailOn = false, trailNodes = [];
      function dropTrail(el) {
        var i = trailNodes.indexOf(el);
        if (i >= 0) trailNodes.splice(i, 1);
        if (el.parentNode) el.parentNode.removeChild(el);
      }
      function spawnTrail(x0, y0, x1, y1) {
        var dx = x1 - x0, dy = y1 - y0;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 2.5) return;
        var deg = (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2);
        /* 长度至少盖住这一段的实际位移再多 16px：段与段永远衔接，快速划动也不会断线 */
        var len = Math.min(Math.max(dist + 16, 20), 160);
        /* 慢速拖动时同一处会叠好几段，单段压暗，避免叠成一条死亮的实线 */
        var op = Math.min(.55, .16 + dist / 160);
        var el = document.createElement('span');
        el.className = 'mouse-trail';
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = 'left:' + x1.toFixed(1) + 'px;top:' + y1.toFixed(1) + 'px;' +
          '--tw:' + len.toFixed(1) + 'px;transform:rotate(' + deg + 'deg);';
        document.body.appendChild(el);
        trailNodes.push(el);
        if (trailNodes.length > 40) dropTrail(trailNodes[0]);
        if (typeof el.animate !== 'function') { dropTrail(el); return; }
        var anim = el.animate([
          { transform: 'rotate(' + deg + 'deg) scaleX(1)', opacity: op },
          { transform: 'rotate(' + deg + 'deg) scaleX(.14)', opacity: 0 }
        ], { duration: 500 + Math.random() * 240, easing: 'cubic-bezier(.22,.72,.28,1)', fill: 'forwards' });
        anim.addEventListener('finish', function () { dropTrail(el); });
        anim.addEventListener('cancel', function () { dropTrail(el); });
      }
      function cacheHost(t) {
        host = (t && t.closest) ? t.closest('.sheen') : null;
        rect = (host && host.getBoundingClientRect) ? host.getBoundingClientRect() : null;
      }
      document.addEventListener('pointerover', function (e) { cacheHost(e.target); }, { passive: true });
      document.addEventListener('pointerout', function (e) {
        var h = (e.target && e.target.closest) ? e.target.closest('.sheen') : null;
        var to = e.relatedTarget;
        if (h && h === host && (!to || !h.contains || !h.contains(to))) { host = null; rect = null; }
      }, { passive: true });
      document.addEventListener('pointermove', function (e) {
        /* 低画质不再跑逐帧光幕与卡片高光（极高 / 高 / 中一致） */
        if (qualityNow === 'mid') return;
        px = e.clientX; py = e.clientY;
        /* 尾迹直接在事件里落段、不等 rAF：刷新后入场动画占住帧队列时也不会跳段断线 */
        if (!trailOn) { trailX = px; trailY = py; trailOn = true; }
        else if ((px - trailX) * (px - trailX) + (py - trailY) * (py - trailY) >= 9) {
          spawnTrail(trailX, trailY, px, py);
          trailX = px; trailY = py;
        }
        if (busy) return;
        busy = true;
        (window.requestAnimationFrame || function (f) { window.setTimeout(f, 16); })(function () {
          if (glow && glow.style) glow.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)';
          if (host && rect && host.style && host.style.setProperty) {
            host.style.setProperty('--mx', ((px - rect.left) / (rect.width || 1) * 100).toFixed(1) + '%');
            host.style.setProperty('--my', ((py - rect.top) / (rect.height || 1) * 100).toFixed(1) + '%');
          }
          busy = false;
        });
      }, { passive: true });
    }
    /* 运行时长 */
    var up = document.getElementById('uptime');
    if (up) {
      function tick() {
        up.textContent = '已稳定运行 ' + runningDays() + ' 天';
      }
      tick();
      window.setInterval(tick, 60000);
    }
    /* 点击星爆：高画质下在点击处溅出一圈小星星，向四周飞散后快速消散；
       只平移与缩放、不旋转，prefers-reduced-motion 与中低画质自动关闭 */
    function initStarBurst() {
      if (reduced()) return;
      if (!document.addEventListener || !document.body || !document.body.appendChild) return;
      if (typeof document.body.animate !== 'function') return;
      document.addEventListener('pointerdown', function (e) {
        if (readQuality() !== 'high' && readQuality() !== 'ultra') return;
        var x = e.clientX, y = e.clientY;
        if (typeof x !== 'number' || typeof y !== 'number') return;
        var night = !!(document.documentElement.dataset &&
          document.documentElement.dataset.theme === 'night');
        /* 晴天溅樱花粉花瓣（更轻柔），星夜保持金色星星 */
        var n = night ? 11 + (Math.random() * 4 | 0) : 7 + (Math.random() * 3 | 0);
        var box = document.createElement('div');
        box.setAttribute('class', night ? 'star-burst' : 'star-burst burst-petal');
        box.setAttribute('aria-hidden', 'true');
        box.style.cssText = 'left:' + x + 'px;top:' + y + 'px;';
        document.body.appendChild(box);
        var done = 0;
        function sweep() { done++; if (done >= n && box.parentNode) box.parentNode.removeChild(box); }
        for (var i = 0; i < n; i++) {
          var s = document.createElement('span');
          var anim;
          if (night) {
            var size = 9 + Math.random() * 10;
            var half = (size / 2).toFixed(1);
            s.style.cssText = 'width:' + size.toFixed(1) + 'px;height:' + size.toFixed(1) +
              'px;margin:-' + half + 'px 0 0 -' + half + 'px;';
            s.innerHTML = '<svg viewBox="0 0 100 100"><use href="#puffy-star"/></svg>';
            box.appendChild(s);
            var ang = (Math.PI * 2 * i) / n + Math.random() * .55;
            var dist = 46 + Math.random() * 70;
            var dx = Math.cos(ang) * dist;
            var dy = Math.sin(ang) * dist - 16;
            anim = s.animate([
              { transform: 'translate(0,0) scale(1)', opacity: .97 },
              { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(.18)', opacity: 0 }
            ], { duration: 520 + Math.random() * 260, easing: 'cubic-bezier(.16,.84,.44,1)', fill: 'forwards' });
          } else {
            var psize = 10 + Math.random() * 7;
            var phalf = (psize / 2).toFixed(1);
            s.style.cssText = 'width:' + psize.toFixed(1) + 'px;height:' + psize.toFixed(1) +
              'px;margin:-' + phalf + 'px 0 0 -' + phalf + 'px;';
            s.innerHTML = '<svg viewBox="0 0 100 100"><use href="#petal"/></svg>';
            box.appendChild(s);
            /* 晴天花瓣：先有一次明显的迸射（高初速 + 强阻力，约 0.2s 内迅速衰减），
               重力、横向摆动与慢速自旋从第一帧就一起作用，之后自然转为轻柔飘落并缓缓消散。 */
            var pang = Math.random() * Math.PI * 2;
            var pv0 = 260 + Math.random() * 100;
            var pvx = Math.cos(pang) * pv0;
            var pvy = Math.sin(pang) * pv0 * .4 - 12;
            var pg = 230;
            var pvt = 44 + Math.random() * 20;
            var pdragBurst = 4 + Math.random() * 2;
            var pdrag = 6 + Math.random() * 3;
            var pburst = .15 + Math.random() * .05;
            var pswayA = 3 + Math.random() * 4;
            var pswayW = 1.2 + Math.random() * 1;
            var prot0 = Math.random() * 360;
            var protV = Math.random() * 130 - 65;
            var pdur = 820 + Math.random() * 240;
            var psteps = 9;
            var pdt = pdur / 1000 / psteps;
            var frames = [{ transform: 'translate(0px,0px) rotate(' + prot0.toFixed(1) +
              'deg) scale(.7)', opacity: .42, easing: 'linear' }];
            var ppx = 0, ppy = 0;
            for (var k = 1; k <= psteps; k++) {
              var pt = k * pdt;
              /* 子步 + 指数衰减解析步进：爆发段阻力大，显式欧拉会把初速吃掉甚至让速度反号 */
              var psub = 6, psdt = pdt / psub;
              for (var q = 0; q < psub; q++) {
                var ptk = (k - 1) * pdt + q * psdt;
                var pdragNow = ptk < pburst ? pdragBurst : pdrag;
                var pdecay = Math.exp(-pdragNow * psdt);
                pvx = pvx * pdecay;
                pvy = pvy * pdecay + (pg / pdragNow) * (1 - pdecay);
                if (pvy > pvt) pvy = pvt;
                ppx += pvx * psdt;
                ppy += pvy * psdt;
              }
              /* 有界横向摆动：随时间渐入，让方向缓慢左右改变（弧线感），不做速度积分以免失控 */
              var psway = pswayA * Math.sin(pswayW * pt * Math.PI * 2) * Math.min(1, pt * 2.6);
              var ptx = ppx + psway;
              var fade = k < psteps * .45 ? .82 : Math.max(0, .82 * (1 - (k / psteps - .45) / .55));
              var pscale = k === 1 ? 1.02 : 1.02 - .32 * (k / psteps);
              frames.push({
                transform: 'translate(' + ptx.toFixed(1) + 'px,' + ppy.toFixed(1) + 'px) rotate(' +
                  (prot0 + protV * pt).toFixed(1) + 'deg) scale(' + pscale.toFixed(2) + ')',
                opacity: Number(fade.toFixed(3)), easing: 'linear'
              });
            }
            anim = s.animate(frames, { duration: pdur, fill: 'forwards' });
          }
          anim.addEventListener('finish', sweep);
          anim.addEventListener('cancel', sweep);
        }
      }, { passive: true });
    }
    initStarBurst();
    initLightbox();
  }

  applyQuality(readQuality());
  applyFonts();
  applyClick(readClick());
  initEffects();
  initSky();
  initSkyRepulsion();
  initTheme();
  initSearch();
  /* ---------- 数字滚动 ----------
     纯文本替换、不加任何新样式，所以字体/渐变/字号全部保持原样。
     两种用法：
       rollNumber(el, to)  从 0 滚到 to —— 用于「7 篇文章 / 3 张照片」这类统计
       countTo(el, to)     从当前数字滚到 to —— 用于浏览数/点赞数这类会变的数 */
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function tweenNumber(el, from, to, dur) {
    if (!el) return;
    to = Math.max(0, Math.round(Number(to) || 0));
    from = Math.max(0, Math.round(Number(from) || 0));
    function finish() { el.textContent = String(to); }
    if (from === to) { finish(); return; }
    if (reduced() || !window.requestAnimationFrame) { finish(); return; }
    var start = 0;
    function step(now) {
      if (!start) start = now;
      var p = Math.min(1, (now - start) / (dur || 820));
      el.textContent = String(Math.round(from + (to - from) * easeOut(p)));
      if (p < 1) window.requestAnimationFrame(step); else finish();
    }
    window.requestAnimationFrame(step);
  }
  function rollNumber(el, to) { tweenNumber(el, 0, to, 900); }
  function countTo(el, to) {
    var cur = parseInt(String(el.textContent || '0').replace(/[^\d]/g, ''), 10);
    tweenNumber(el, isNaN(cur) ? 0 : cur, to, 620);
  }
  var countObserver = null;
  function initCountUp() {
    var nodes = app.querySelectorAll ? app.querySelectorAll('[data-count-to]') : [];
    if (!nodes.length) return;
    /* 「关闭」档：彩色大数字也直接落文本（v3.69 语义） */
    if (readRollMode() === 'off' && window.requestAnimationFrame) {
      Array.prototype.forEach.call(nodes, function (n) { n.textContent = n.getAttribute('data-count-to'); });
      return;
    }
    if (countObserver) { try { countObserver.disconnect(); } catch (e) {} }
    if (!window.IntersectionObserver) {
      Array.prototype.forEach.call(nodes, function (n) { n.textContent = n.getAttribute('data-count-to'); });
      return;
    }
    countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        try { countObserver.unobserve(en.target); } catch (e) {}
        rollNumber(en.target, Number(en.target.getAttribute('data-count-to')) || 0);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    Array.prototype.forEach.call(nodes, function (n) { countObserver.observe(n); });
  }
  /* 供点赞/浏览量复用（likes.js 里读不到闭包内的函数） */
  window.ZBCount = { countTo: countTo, roll: rollNumber };

  /* 星星化作流星：直接让 .to-top 本体变成流星（而不是新建一个 0 尺寸容器）。
     原因：0×0 的合成层会被裁掉，子元素根本画不出来；按钮本身有 48px 尺寸，
     换皮 + 位移一定看得见。回顶是瞬时的，这一下只负责视觉收尾。 */
  function launchStarMeteor(btn) {
    if (!btn || reduced()) return;
    if (btn.classList.contains('flying')) return;
    btn.classList.add('flying');
    var dist = (window.innerHeight || 700) + 200;
    var done = function () {
      try { if (anim && anim.cancel) anim.cancel(); } catch (e) {}
      btn.classList.remove('flying');
      updateScroll();
    };
    var anim = null;
    if (btn.animate) {
      anim = btn.animate([
        { transform: 'translateY(0) scale(1)', opacity: 1 },
        { transform: 'translateY(' + (-dist * 0.5).toFixed(0) + 'px) scale(.86)', opacity: 1, offset: .55 },
        { transform: 'translateY(' + (-dist).toFixed(0) + 'px) scale(.5)', opacity: 0 }
      ], { duration: 560, easing: 'cubic-bezier(.16,.66,.3,1)', fill: 'forwards' });
      anim.onfinish = done;
      window.setTimeout(done, 900);
    } else {
      window.setTimeout(done, 30);
    }
  }
  /* ================= 右下角站宠「花信」（昵称可改） =================
     模型是 51 个部件的 Canvas2D 运行时，隔离在自己的 iframe 里（同一个源，
     所以可以直接调 contentWindow.NekoCat）。宿主这边只做四件事：
       ① 延迟挂载（不抢首屏）  ② 长按拖动  ③ 拖动时滚轮缩放  ④ 视线跟随全局鼠标
     位置与大小存 localStorage，刷新后还在原地。 */
  var NEKO_KEY = 'zb-neko:v1';
  var neko = { box: null, frame: null, grab: null, ready: false, dragging: false, w: 300,
               pending: false, mount: null };

  function nekoSave() {
    try {
      if (!neko.box) return;
      var r = neko.box.getBoundingClientRect();
      window.localStorage.setItem(NEKO_KEY, JSON.stringify({
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width)
      }));
    } catch (e) { /* 隐私模式忽略 */ }
  }
  function nekoLoad() {
    var o = null;
    try { o = JSON.parse(window.localStorage.getItem(NEKO_KEY) || 'null'); } catch (e) { o = null; }
    return (o && typeof o === 'object') ? o : null;
  }
  function nekoClampPos(x, y, w, h) {
    var vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
    var minVis = 72;
    x = Math.min(Math.max(x, minVis - w), vw - minVis);
    y = Math.min(Math.max(y, 0), vh - minVis);
    return { x: x, y: y };
  }
  /* 窄屏下限放低到 96px：手机上小猫缩到 100~120px 贴右下角，不再压住正文 */
  function nekoMinW() {
    return (window.innerWidth || 1024) <= 760 ? 96 : 150;
  }
  function nekoApplySize(w) {
    if (!neko.box) return;
    neko.w = Math.min(560, Math.max(nekoMinW(), Math.round(w)));
    var h = Math.round(neko.w * 1.135);          /* 画布 1441×1636 */
    neko.box.style.width = neko.w + 'px';
    neko.box.style.height = h + 'px';
    var api = nekoApi();
    if (api && api.resize) { try { api.resize(); } catch (e) {} }
  }
  function nekoApi() {
    try {
      var w = neko.frame && neko.frame.contentWindow;
      return (w && w.NekoCat) ? w.NekoCat : null;
    } catch (e) { return null; }
  }
  function nekoPlace(x, y) {
    if (!neko.box) return;
    var r = neko.box.getBoundingClientRect();
    var p = nekoClampPos(x, y, r.width, r.height);
    neko.box.style.left = Math.round(p.x) + 'px';
    neko.box.style.top = Math.round(p.y) + 'px';
    neko.box.style.right = 'auto';
    neko.box.style.bottom = 'auto';
  }

  function initNekoPet() {
    var box = document.getElementById('neko-pet');
    var frame = document.getElementById('neko-frame');
    var grab = document.getElementById('neko-grab');
    if (!box || !frame || !grab) return;
    neko.box = box; neko.frame = frame; neko.grab = grab;
    nekoRefreshNameLabels();

    /* ---- 恢复上次的位置与大小 ---- */
    var saved = nekoLoad();
    var vw = window.innerWidth || 1440;
    var narrow = vw <= 760;
    var auto = narrow ? 108 : Math.round(Math.min(260, Math.max(150, vw * 0.13)));
    /* 窄屏不再沿用桌面存下的大尺寸：手机屏上 190px 的白猫会压住半屏正文 */
    var want = saved && saved.w ? saved.w : auto;
    if (narrow) want = Math.min(want, 120);
    nekoApplySize(want);
    /* 窄屏忽略上次拖到的位置：否则缩小的猫可能落在正文中间 */
    if (saved && typeof saved.x === 'number' && !narrow) nekoPlace(saved.x, saved.y);
    /* 设置里关掉了小猫：先藏起来，资源等重新打开再下载 */
    if (!nekoShown()) box.style.display = 'none';

    /* ---- 延迟挂载：等页面空闲再拉 4.6MB 的部件 ---- */
    var mounted = false, frameTries = 0;
    /* 猫本体在 iframe 里，加载失败时不会有任何报错，只会静悄悄一片空白。
       这里把「重试一次」做成显式路径：error 事件、加载后拿不到接口、超时 22 秒都算失败。 */
    function nekoFrameLoad(bust) {
      /* 带上主程序的版本号：iframe 页面本身也会被 CDN 缓存，
         不换 key 的话模型升级（比如新增的自发动作接口）迟迟到不了访客浏览器 */
      var ver = '';
      try {
        var tag = document.querySelector('script[src*="assets/app.js"]');
        var m = tag && String(tag.getAttribute('src') || '').match(/[?&]v=([^&]+)/);
        if (m) ver = '&v=' + encodeURIComponent(m[1]);
      } catch (e) { ver = ''; }
      frame.src = 'assets/neko/index.html?embed=1' + ver + (bust ? '&r=' + Date.now() : '');
    }
    function nekoFrameRetry() {
      if (frameTries >= 1 || !nekoShown()) return;
      frameTries++;
      nekoFrameLoad(true);
    }
    function mount() {
      if (mounted) return;
      /* 设置里关掉了小猫：不下载任何资源，等重新打开时再挂载 */
      if (!nekoShown()) { neko.pending = true; return; }
      mounted = true;
      /* 省流量 / 2G：照样挂载，只是让出更久的空闲——
         以前这里是「标记已加载但不设 src」，结果访客只看到一块空玻璃。 */
      var conn = navigator.connection || navigator.mozConnection || null;
      var lean = !!(conn && (conn.saveData || /(^|-)2g$/.test(String(conn.effectiveType || ''))));
      frame.addEventListener('load', function () {
        var api = nekoApi();
        if (!api) { nekoFrameRetry(); return; }
        if (neko.ready) { try { tuneNeko(api); } catch (e) {} return; }
        var finish = function () {
          if (neko.ready) return;
          neko.ready = true;
          if (neko.bootTimer) { clearTimeout(neko.bootTimer); neko.bootTimer = 0; }
          box.classList.add('loaded');
          box.classList.add('ready');      /* 猫就绪后才亮出左侧互动按钮 */
          tuneNeko(api);
        };
        if (api.whenReady) api.whenReady(finish); else finish();
        if (reduced()) { try { api.pause(true); } catch (e) {} }
      });
      frame.addEventListener('error', nekoFrameRetry);
      if (neko.bootTimer) clearTimeout(neko.bootTimer);
      neko.bootTimer = window.setTimeout(function () {
        neko.bootTimer = 0;
        if (!neko.ready) nekoFrameRetry();
      }, 22000);
      if (lean) setTimeout(function () { nekoFrameLoad(false); }, 2600);
      else if (reduced()) setTimeout(function () { nekoFrameLoad(false); }, 2200);
      else nekoFrameLoad(false);
    }
    neko.mount = mount;
    if (window.requestIdleCallback) {
      window.requestIdleCallback(mount, { timeout: 2600 });
    } else {
      window.addEventListener('load', function () { setTimeout(mount, 1200); });
      if (document.readyState === 'complete') setTimeout(mount, 900);
    }

    /* ---- 视线跟随：全页鼠标 → 换算成 iframe 内坐标 ---- */
    var px = 0, py = 0, hasPointer = false, gazeTick = 0;
    window.addEventListener('pointermove', function (e) {
      px = e.clientX; py = e.clientY; hasPointer = true;
      if (gazeTick) return;
      gazeTick = window.requestAnimationFrame(function () {
        gazeTick = 0;
        var api = nekoApi();
        if (!api || !neko.ready || !hasPointer || neko.dragging) return;
        var r = frame.getBoundingClientRect();
        try { api.lookAt(px - r.left, py - r.top); } catch (e) {}
      });
    }, { passive: true });

    /* ---- 长按拖动 / 点击摸一下 / 拖动中滚轮缩放 ---- */
    var pressTimer = 0, downX = 0, downY = 0, offX = 0, offY = 0, wheelTimer = 0;

    function beginDrag() {
      pressTimer = 0;
      var r = box.getBoundingClientRect();
      neko.dragging = true;
      offX = downX - r.left;
      offY = downY - r.top;
      box.classList.add('dragging');
    }
    function cancelPress() {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
    }
    grab.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      downX = e.clientX; downY = e.clientY;
      cancelPress();
      pressTimer = window.setTimeout(beginDrag, 280);
      try { grab.setPointerCapture(e.pointerId); } catch (err) {}
    });
    grab.addEventListener('pointermove', function (e) {
      if (!neko.dragging) return;
      nekoPlace(e.clientX - offX, e.clientY - offY);
    });
    function endPress(e) {
      cancelPress();
      if (neko.dragging) {
        neko.dragging = false;
        box.classList.remove('dragging');
        nekoSave();
        return;
      }
      /* 没拖动 = 轻点一下：摸摸头。新版走 pet()：闭眼 + 小幅来回扭头 + 耳朵微动；
         旧缓存里的 iframe 没有 pet，就退回原来的 touch() 单次歪头 */
      var api = nekoApi();
      if (api && (api.pet || api.touch)) {
        try { (api.pet || api.touch)(2400); } catch (err) {}
        nekoLife.guard = performance.now() + 2600;   /* 摸头期间不要叠加自发的扭头 */
      }
    }
    grab.addEventListener('pointerup', endPress);
    grab.addEventListener('pointercancel', endPress);

    grab.addEventListener('wheel', function (e) {
      if (!neko.dragging) return;                 /* 只有拖拽途中才缩放，平时不抢页面滚动 */
      e.preventDefault();
      var step = e.deltaY > 0 ? -0.07 : 0.07;
      nekoApplySize(neko.w * (1 + step));
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(nekoSave, 320);
    }, { passive: false });

    /* ---- 窗口尺寸变化：把猫拉回可视区 ---- */
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        var r = box.getBoundingClientRect();
        if (r.right > window.innerWidth || r.bottom > window.innerHeight ||
            r.left < 0 || r.top < 0) {
          nekoPlace(r.left, r.top);
        }
        var api = nekoApi();
        if (api && api.resize) { try { api.resize(); } catch (e) {} }
        nekoBubbleFit();
        nekoChatFit();
      }, 200);
    }, { passive: true });

    /* ---- 切到后台就冻结，省电；回来时补一次尺寸重算 ---- */
    nekoWatchTheme();
    document.addEventListener('visibilitychange', function () {
      var api = nekoApi();
      if (api && api.pause) { try { api.pause(document.hidden); } catch (e) {} }
      if (document.hidden) return;
      if (api && api.resize) { try { api.resize(); } catch (e) {} }
      /* 首次挂载时若正好在后台，requestIdleCallback 不会跑，回来时补挂 */
      if (!neko.ready && neko.mount && !document.getElementById('neko-frame').getAttribute('src')) {
        neko.pending = false;
        neko.mount();
      }
    });

    /* ---- 左侧互动按钮（聊天 / 喂小鱼干）与聊天输入框 ----
       都是 #neko-pet 的子元素，拖动小猫时整体跟随、相对位置不变。
       事件一律 stopPropagation：不能让点按钮触发页面里的其它交互。 */
    var chatBtn = document.getElementById('neko-chat-btn');
    var guideBtn = document.getElementById('neko-guide-btn');
    var feedBtn = document.getElementById('neko-feed-btn');
    var chatForm = document.getElementById('neko-chat');
    var chatInput = document.getElementById('neko-chat-input');
    var chatSend = chatForm ? chatForm.querySelector('button') : null;
    var stopNekoEvt = function (e) {
      if (e.stopPropagation) e.stopPropagation();
    };
    /* 点聊天后把猫挪到输入框能完整落进视口的位置：
       默认 bottom 已抬高，但用户若把猫拖到屏幕顶/右缘，输入框仍可能出屏，
       这里按实测矩形把整只猫平移进来（气泡/按钮是子元素，一起跟随）。 */
    function nekoEnsureChatVisible() {
      if (!neko.box || !chatForm) return;
      var f = chatForm.getBoundingClientRect();
      var pad = 10, dx = 0, dy = 0;
      var vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
      if (f.right > vw - pad) dx = vw - pad - f.right;
      if (f.left < pad) dx = pad - f.left;
      if (f.bottom > vh - pad) dy = vh - pad - f.bottom;
      if (f.top < pad) dy = pad - f.top;
      if (dx || dy) {
        var r = neko.box.getBoundingClientRect();
        nekoPlace(r.left + dx, r.top + dy);
        nekoSave();
      }
    }
    if (chatBtn && chatForm && chatInput) {
      ['pointerdown', 'pointerup', 'touchstart'].forEach(function (en) {
        chatBtn.addEventListener(en, stopNekoEvt);
        if (guideBtn) guideBtn.addEventListener(en, stopNekoEvt);
        if (feedBtn) feedBtn.addEventListener(en, stopNekoEvt);
        chatForm.addEventListener(en, stopNekoEvt);
      });
      chatBtn.addEventListener('click', function (e) {
        stopNekoEvt(e);
        chatForm.hidden = !chatForm.hidden;
        nekoHideBubble();
        if (!chatForm.hidden) {
          nekoEnsureChatVisible();
          nekoChatFit();
          try { chatInput.focus({ preventScroll: true }); } catch (err) { try { chatInput.focus(); } catch (e2) {} }
        }
      });
      chatForm.addEventListener('submit', function (e) {
        stopNekoEvt(e);
        e.preventDefault ? e.preventDefault() : null;
        var v = String(chatInput.value || '').trim();
        if (!v) return;
        chatInput.value = '';
        /* 输入框不收起：一问一答连着来，回车就能接着问下一句 */
        nekoAsk(v);
        try { chatInput.focus({ preventScroll: true }); } catch (err) { try { chatInput.focus(); } catch (e2) {} }
      });
    }
    /* 快捷询问：让她按「当前停在哪一页」介绍这一页，再推荐一两个下一步。
       正文里的站内链接会渲染成按钮，访客点一下就能到。 */
    if (guideBtn) {
      guideBtn.addEventListener('click', function (e) {
        stopNekoEvt(e);
        nekoAsk('', { guide: true });
      });
    }
    if (feedBtn) {
      feedBtn.addEventListener('click', function (e) {
        stopNekoEvt(e);
        var fed = nekoFeed();
        if (!fed.ok) {
          /* 5 个饱腹同时在线：不收，也不再计数，只说明吃撑了要歇一会儿。
             小字只留给「这是第几个」，拒绝时没有新的一份，就不再挂小字。 */
          nekoSay('唔…已经吃了五个啦，肚子鼓鼓的，让我歇一分钟再吃好不好喵。', 5200);
          var sapi = nekoApi();
          if (sapi && sapi.emotion) { try { sapi.emotion('sleepy', 400); } catch (err) {} }
          return;
        }
        var lines = ['嗷呜！小鱼干最好吃了喵！', '呼噜噜…本喵勉为其难收下了。', '再来一条！再来一条喵！',
                     '唔…今天的小鱼干有点咸喵。', '吃饱了才有力气摇尾巴喵！', '谢谢投喂，摸摸头可以，但别摸尾巴。'];
        nekoSay(lines[Math.floor(Math.random() * lines.length)], 4600,
          '这是她吃的第 ' + fed.n + ' 个小鱼干');
        var api = nekoApi();
        if (api && api.touch) { try { api.touch(); } catch (err) {} }
        if (api && api.emotion) {
          try {
            api.emotion('happy', 300);
            setTimeout(function () { try { api.emotion('neutral', 500); } catch (err) {} }, 2800);
          } catch (err) {}
        }
      });
    }
  }

  /* ---------- 站宠聊天 / 喂食 / 显隐 ----------
     聊天 API 存在 localStorage（zb-neko-chat:v1），格式：接口地址|密钥|模型名，
     需要 OpenAI 兼容的 /chat/completions；没填地址时小猫直接说「[未设置API]」。
     SKILL 是设置里上传的一份文本规范，整段塞进 system 消息，模型必须遵守。
     预置线路直连智谱 BigModel：地址必须带结尾斜杠——不带斜杠的那条 chat 路径
     被边缘 WAF 拦住了 CORS 预检（OPTIONS 不回允许头），浏览器根本发不出去；
     带斜杠的等价路径会正常回 Access-Control-Allow-*，所以网页能直接调用。
     密钥做一次 base64 混淆，免得被扫源码的脚本按「id.secret」的形态直接抓走。
     回复走 SSE 流式：第一个字几百毫秒就冒出来，接着像打字一样往下长。 */
  var NEKO_CHAT_KEY = 'zb-neko-chat:v1';
  var NEKO_SKILL_MAX = 128 * 1024;
  var NEKO_NAME_KEY = 'zb-neko-name';
  var NEKO_NAME_DEFAULT = '花信';
  /* 预置线路的密钥不整段出现：切成五段、段序打乱存放，取用时按还原表拼回，
     再逐字节异或。源码里既没有明文，也没有 atob 能直接解出的「id.secret」形态；
     扫源码的脚本拿到的是十六进制碎片，拼错顺序也还原不出可用密钥。 */
  var NEKO_KEY_SEGS = [
    '3b6f6374152d1b28022a', '6e3b626e38626a6d6e', '2f3b15301d0f1b2b2308',
    '3b693f6e623e6c383f6a', '68396d693b3e686e3b6e'
  ];
  var NEKO_KEY_ORDER = [1, 3, 4, 0, 2];
  var NEKO_KEY_SALT = 0x5a;
  function nekoKey() {
    var hex = '';
    for (var i = 0; i < NEKO_KEY_ORDER.length; i++) hex += NEKO_KEY_SEGS[NEKO_KEY_ORDER[i]];
    var out = '';
    for (var k = 0; k < hex.length; k += 2) {
      out += String.fromCharCode(parseInt(hex.substr(k, 2), 16) ^ NEKO_KEY_SALT);
    }
    return out;
  }
  var NEKO_API_DEFAULT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions/|' +
    nekoKey() + '|glm-4-flash';
  var NEKO_TEMPERATURE = 0.9;
  /* 单次回复的字数上限就按接口能给的最大值走（智谱/DeepSeek 都在 4000 以内），
     不再用 512 把她的推理半路截断；要不要写这么长由她在 SKILL 里按问的东西自己估 */
  var NEKO_MAX_TOKENS = 4000;
  var NEKO_STREAM_TIMEOUT = 45000;
  var nekoChat = { hist: [], busy: false, hideTimer: 0, fitTick: 0, sizeTick: 0, seq: 0, ctl: null, morph: null,
    phase: 'idle', wMax: 0 };
  function nekoName() {
    var v = '';
    try { v = String(window.localStorage.getItem(NEKO_NAME_KEY) || ''); } catch (e) { /* 忽略 */ }
    v = v.trim();
    return v ? v.slice(0, 24) : NEKO_NAME_DEFAULT;
  }
  /* ---------- 小鱼干：累计第几个 + 一分钟饱腹 ----------
     每次投喂记一个时间戳，60 秒内最多同时存在 5 个饱腹效果；
     满了就委婉拒绝，等她「歇一分钟」再喂。计数只存本机。 */
  var NEKO_FEED_KEY = 'zb-neko-feed:v1';
  var NEKO_FEED_WINDOW = 60000;
  var NEKO_FEED_MAX = 5;
  function nekoFeedState() {
    var st = null;
    try { st = JSON.parse(window.localStorage.getItem(NEKO_FEED_KEY) || 'null'); } catch (e) { st = null; }
    if (!st || typeof st !== 'object') st = { n: 0, times: [] };
    st.n = Math.max(0, parseInt(st.n, 10) || 0);
    st.times = (st.times || []).filter(function (t) {
      return typeof t === 'number' && Date.now() - t < NEKO_FEED_WINDOW;
    });
    return st;
  }
  function nekoFeedSave(st) {
    try { window.localStorage.setItem(NEKO_FEED_KEY, JSON.stringify(st)); } catch (e) { /* 忽略 */ }
  }
  function nekoFeed() {
    var st = nekoFeedState();
    if (st.times.length >= NEKO_FEED_MAX) {
      var wait = Math.max(1, Math.ceil((NEKO_FEED_WINDOW - (Date.now() - st.times[0])) / 1000));
      return { ok: false, n: st.n, wait: wait };
    }
    st.n += 1;
    st.times.push(Date.now());
    nekoFeedSave(st);
    return { ok: true, n: st.n, active: st.times.length };
  }
  function nekoSetName(v) {
    var s = String(v || '').trim().slice(0, 24) || NEKO_NAME_DEFAULT;
    try { window.localStorage.setItem(NEKO_NAME_KEY, s); } catch (e) { /* 忽略 */ }
    /* 昵称进入 system：改完立即生效，清掉旧对话历史避免串味 */
    nekoChat.hist = [];
    nekoRefreshNameLabels();
    return s;
  }
  /* 把昵称同步到小猫挂载标记里的无障碍文案与占位符 */
  function nekoRefreshNameLabels() {
    var n = nekoName();
    var cbtn = document.getElementById('neko-chat-btn');
    var fbtn = document.getElementById('neko-feed-btn');
    var gbtn = document.getElementById('neko-guide-btn');
    var frame = document.getElementById('neko-frame');
    var input = document.getElementById('neko-chat-input');
    if (cbtn) cbtn.setAttribute('aria-label', '和' + n + '聊天');
    if (gbtn) gbtn.setAttribute('aria-label', '让' + n + '介绍当前页面');
    if (fbtn) fbtn.setAttribute('aria-label', '给' + n + '喂小鱼干');
    if (frame) frame.setAttribute('title', '站宠 ' + n);
    if (input) {
      input.setAttribute('placeholder', '跟' + n + '说点啥…');
      input.setAttribute('aria-label', '对' + n + '说一句话');
    }
  }
  function nekoCfg() {
    var raw = null;
    try { raw = window.localStorage.getItem(NEKO_CHAT_KEY); } catch (e) { /* 忽略 */ }
    var o = null;
    try { o = JSON.parse(raw || 'null'); } catch (e) { o = null; }
    /* 从未存过、或站长把自定义接口留空：都走站内预置线路，访客开箱就能聊 */
    if (!raw || !o || typeof o !== 'object') return { api: NEKO_API_DEFAULT, skill: '' };
    if (!String(o.api == null ? '' : o.api).trim()) o.api = NEKO_API_DEFAULT;
    /* 自愈：早期预置过智谱直连（旧写法 + 失效 key）与 Cloudflare Worker 中转两版配置。
       前者被跨域预检拦、后者在国内网络连不上，本机存过就自动换成现在的直连地址。
       只按域名判断，不把密钥片段写进源码。 */
    if (typeof o.api === 'string' && o.api.indexOf(NEKO_API_DEFAULT) !== 0 &&
        (o.api.indexOf('open.bigmodel.cn') >= 0 || o.api.indexOf('workers.dev') >= 0)) {
      o.api = NEKO_API_DEFAULT;
      nekoCfgSave(o);
    }
    return o;
  }
  function nekoCfgSave(cfg) {
    try { window.localStorage.setItem(NEKO_CHAT_KEY, JSON.stringify(cfg)); } catch (e) { /* 忽略 */ }
  }
  function nekoShown() {
    try { return window.localStorage.getItem('zb-neko-show') !== '0'; }
    catch (e) { return true; }
  }
  /* 内置线路的任何历史形态都不回显：早期版本把明文接口串存进过 localStorage，
     即便与当前预置串不完全一致，也不能让它落进工坊输入框或事件明细。 */
  function nekoMaskApi(api) {
    var s = String(api || '');
    if (!s.trim()) return '';
    if (s.indexOf(NEKO_API_DEFAULT) === 0 || s.indexOf(nekoKey()) >= 0) return '';
    return s;
  }
  function nekoApiStateNote(api) {
    var raw = String(api || '').trim();
    if (!raw) return '未填写：使用站内预置的智谱线路，所有访客都能直接找她聊天。';
    if (!/^https?:\/\//i.test(String(raw.split('|')[0] || '').trim())) {
      return '已填写，但接口地址看起来不是 http(s) 开头，聊天会请求失败。';
    }
    var n = raw.split('|').length;
    return '已设置：接口就绪' + (n >= 3 ? '（含模型名）' : n === 2 ? '（未填模型名，默认 gpt-4o-mini）' : '（未填密钥与模型名）') + '，去右下角找' + nekoName() + '聊天试试。';
  }
  function nekoSkillNote(skill) {
    var s = String(skill || '');
    if (!s.trim()) return '未上传：' + nekoName() + '按默认性格回复。';
    return '已加载 SKILL（' + s.length + ' 字）：聊天时会严格遵守这份规范。';
  }
  function nekoSetVisible(on) {
    try { window.localStorage.setItem('zb-neko-show', on ? '1' : '0'); } catch (e) { /* 忽略 */ }
    if (!neko.box) return;
    neko.box.style.display = on ? '' : 'none';
    if (!on) return;
    if (neko.pending) { neko.pending = false; if (neko.mount) neko.mount(); }
    /* 藏起来时 iframe 宽高是 0，画布按 96px 兜底；重新亮出来必须重算一次，
       否则猫会被按 96px 画好再拉伸，看着糊成一团 */
    nekoApplySize(neko.w || 190);
  }
  /* 气泡一收，嘴也要跟着闭：talkFor 是独立的口型循环，不主动停会一直张着 */
  function nekoShutMouth() {
    var api = nekoApi();
    if (!api) return;
    try { if (api.stopLip) api.stopLip(); else if (api.mouth) api.mouth(0); } catch (e) {}
  }
  function nekoHideBubble() {
    var el = document.getElementById('neko-bubble');
    if (!el) return;
    if (nekoChat.hideTimer) { clearTimeout(nekoChat.hideTimer); nekoChat.hideTimer = 0; }
    nekoShutMouth();
    el.classList.remove('show');
    el.hidden = true;
  }
  /* 气泡始终对准小猫头顶正上方；纵向装不下就往横向摊开。
     两套节奏，别混用：
       · 流式过程中走 nekoBubbleLive()——宽度只写一次、之后不再改，
         于是 max-width 的 0.34s 过渡不会被每帧打断（以前那才是「抽搐」的真凶）；
       · 说完话走 nekoBubbleFit()——一次性按 300/360/…/880 加宽，
         加宽后中线会偏出屏幕，再用 --neko-bubble-dx 拽回来。 */
  var NEKO_BUBBLE_WIDTHS = [250, 300, 360, 420, 500, 600, 720, 880];
  var NEKO_LIVE_WIDTH = 420;   /* 流式期间的宽度上限：够宽不至于一行三字，又不至于一开口就横一大条 */
  function nekoBubbleBox() {
    var el = document.getElementById('neko-bubble');
    var pad = 8, vw = window.innerWidth || 1024;
    var r = el.getBoundingClientRect();
    return {
      pad: pad, vw: vw,
      limit: Math.max(200, vw - pad * 2),
      /* 气泡底边就在猫头顶上方 10px，它到视口上沿之间是能长高的全部空间 */
      avail: Math.max(90, r.bottom - pad)
    };
  }
  /* 横向回正：气泡宽到贴边时把中线挪回来，保证整段话都在可见区域内 */
  function nekoBubbleCenter(b) {
    var el = document.getElementById('neko-bubble');
    el.style.setProperty('--neko-bubble-dx', '0px');
    var r = el.getBoundingClientRect(), dx = 0;
    if (r.left < b.pad) dx = b.pad - r.left;
    else if (r.right > b.vw - b.pad) dx = b.vw - b.pad - r.right;
    el.style.setProperty('--neko-bubble-dx', Math.round(dx) + 'px');
  }
  /* 流式期间：宽度锁在 NEKO_LIVE_WIDTH，只让高度往下长；
     长到视口上沿就改成内部滚动，并且始终贴着最底部（最新那句话）。 */
  function nekoBubbleLive() {
    var el = document.getElementById('neko-bubble');
    if (!el || el.hidden) return;
    /* 收尾比第一帧还快时，这里会晚于 fit 执行，把流式那套锁宽 / 封高又装回去 */
    if (nekoChat.phase !== 'stream') return;
    var b = nekoBubbleBox();
    var w = Math.min(NEKO_LIVE_WIDTH, b.limit);
    el.classList.add('no-morph');
    if (el.style.maxWidth !== w + 'px') el.style.maxWidth = w + 'px';
    /* 宽度只许长不许缩：max-content 在换行点会忽然变窄（263→204 这种），
       看上去像气泡往回抽一下。先放开钉住的宽度量出「自然宽度」，比历史最大值小就钉回去。 */
    if (el.style.width) el.style.removeProperty('width');
    var wNow = el.getBoundingClientRect().width;
    if (nekoChat.wMax && wNow < nekoChat.wMax - 1) el.style.width = nekoChat.wMax + 'px';
    else nekoChat.wMax = wNow;
    var h = Math.round(b.avail);
    if (el.style.maxHeight !== h + 'px') el.style.maxHeight = h + 'px';
    if (el.style.overflowY !== 'auto') el.style.overflowY = 'auto';
    el.classList.add('is-scroll');
    nekoBubbleCenter(b);
    if (el.scrollHeight - el.clientHeight > 4) el.scrollTop = el.scrollHeight;
  }
  function nekoBubbleFit(animate, fromRect) {
    var el = document.getElementById('neko-bubble');
    if (!el || el.hidden) return;
    if (animate && nekoChat.morph) { try { nekoChat.morph.cancel(); } catch (e0) {} nekoChat.morph = null; }
    var before = animate ? (fromRect || el.getBoundingClientRect()) : null;
    /* 量尺寸期间必须把过渡关掉：max-width / max-height 正在走 .34s 过渡时，
       getBoundingClientRect 拿到的是「过渡中途」的尺寸，逐档量宽会全部量错——
       于是排版按错的宽度定稿，收尾后框还是原来那么大、里面得再滚一遍。
       量完在函数末尾再把 no-morph 摘掉，尺寸变化交给 WAAPI 补间。 */
    el.classList.add('no-morph');
    el.style.removeProperty('width');   /* 放开流式期间钉住的宽度，重新按内容量一次 */
    el.style.removeProperty('bottom');  /* 上一条若往下借过位，先回到猫头顶 */
    nekoChat.wMax = 0;
    var b = nekoBubbleBox(), vw = b.vw, pad = b.pad, limit = b.limit;
    el.style.setProperty('--neko-bubble-dx', '0px');
    el.style.removeProperty('max-height');
    el.style.removeProperty('overflow-y');
    el.classList.remove('is-scroll');
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight || 768;
    var anchorBottom = r.bottom;             /* 气泡底边：小尖角指着猫头顶 */
    var avail = Math.max(80, anchorBottom - pad);          /* 猫头顶到视口上沿 */
    var roomBelow = Math.max(0, vh - pad - anchorBottom);  /* 还能往下借多少（最多贴到视口底） */
    var i, w = 0;
    /* 加宽从「流式期间已经在用的宽度」起步：只涨不缩，
       否则短回复收尾时会从 420 收成 250，看着像框突然缩了一下。
       还不装得下就一直加到视口宽度上限（880 之外还有一档）。 */
    var widths = NEKO_BUBBLE_WIDTHS.filter(function (x) { return x >= NEKO_LIVE_WIDTH; });
    if (!widths.length) widths = [NEKO_BUBBLE_WIDTHS[0]];
    if (limit > widths[widths.length - 1]) widths.push(limit);
    for (i = 0; i < widths.length; i++) {
      w = Math.min(widths[i], limit);
      el.style.maxWidth = w + 'px';
      r = el.getBoundingClientRect();
      if (r.height <= avail || w >= limit) break;
    }
    /* 加满宽还是装不下：整块往下挪，把猫身后那截空间也用上，
       高度上限随之涨到「整屏减两圈留白」。宁可暂时压住小猫，也要让整段回复一屏读完，
       不再出现「框固定大小、里面还得再滚一遍」的情况。 */
    if (r.height > avail) {
      var extra = Math.min(r.height - avail, roomBelow);
      if (extra > 0) {
        el.style.bottom = 'calc(100% + 10px - ' + Math.round(extra) + 'px)';
        r = el.getBoundingClientRect();
      }
    }
    var cap = Math.max(avail, vh - pad * 2);
    if (r.height > cap) {
      el.style.maxHeight = Math.round(cap) + 'px';
      el.style.overflowY = 'auto';
      /* 内部滚动时小尖角会跟着内容滚走，干脆收起来 */
      el.classList.add('is-scroll');
      r = el.getBoundingClientRect();
    }
    var dx = 0;
    if (r.left < pad) dx = pad - r.left;
    else if (r.right > vw - pad) dx = vw - pad - r.right;
    el.style.setProperty('--neko-bubble-dx', Math.round(dx) + 'px');
    /* 长宽变化跟站点的展开 / 折叠同一节奏：用 WAAPI 从旧矩形补到新矩形，
       文字流式增长时不打断，只在说完话、换内容或临时加宽时补一次。 */
    if (before && typeof el.animate === 'function' &&
        (Math.abs(r.width - before.width) > 2 || Math.abs(r.height - before.height) > 2)) {
      try {
        nekoChat.morph = el.animate([
          { width: before.width + 'px', height: before.height + 'px' },
          { width: r.width + 'px', height: r.height + 'px' }
        ], { duration: 340, easing: 'cubic-bezier(.22,.68,.28,1)' });
        nekoChat.morph.addEventListener('finish', function () {
          nekoChat.morph = null;
          try { el.style.removeProperty('width'); el.style.removeProperty('height'); } catch (e) {}
        });
      } catch (e2) { nekoChat.morph = null; }
    }
    /* 尺寸已经按内容定稿，把过渡放回来：下一轮（流式 / 兜底重排）才需要它 */
    el.classList.remove('no-morph');
  }
  /* 输入框与气泡共用同一条竖轴（猫容器中线）：正常情况下零横移，
     只有极窄屏下宽度被 min-width 撑开、又贴着视口边缘时才临时挪一点 */
  function nekoChatFit() {
    var el = document.getElementById('neko-chat');
    if (!el || el.hidden) return;
    el.style.setProperty('--neko-chat-dx', '0px');
    var r = el.getBoundingClientRect();
    var pad = 8, dx = 0, vw = window.innerWidth || 1024;
    if (r.left < pad) dx = pad - r.left;
    else if (r.right > vw - pad) dx = vw - pad - r.right;
    if (dx) el.style.setProperty('--neko-chat-dx', Math.round(dx) + 'px');
  }
  /* 她说完话，气泡本来要自己留十几秒；访客看完多半已经想去点别的了，
     所以点气泡以外任何地方就快速淡出（正在打字时不打断，免得话说到一半消失）。 */
  function nekoBubbleDismiss() {
    var el = document.getElementById('neko-bubble');
    if (!el || el.hidden) return;
    if (nekoChat.hideTimer) { clearTimeout(nekoChat.hideTimer); nekoChat.hideTimer = 0; }
    nekoShutMouth();
    el.classList.add('is-out');
    el.classList.remove('show');
    window.setTimeout(function () {
      if (!el.classList.contains('show')) { el.hidden = true; el.classList.remove('is-out'); }
    }, 220);
  }
  document.addEventListener('click', function (e) {
    var el = document.getElementById('neko-bubble');
    if (!el || el.hidden || !el.classList.contains('show') || nekoChat.busy) return;
    var t = e.target;
    if (t && t.closest && (t.closest('#neko-bubble') || t.closest('#neko-chat') ||
        t.closest('#neko-actions') || t.closest('#neko-grab'))) return;
    nekoBubbleDismiss();
  });
  /* 转动手机、拉窗口：气泡宽度是按视口算的，得重算一次，否则会横出屏幕 */
  window.addEventListener('resize', function () {
    if (nekoChat.sizeTick) return;
    nekoChat.sizeTick = window.requestAnimationFrame(function () {
      nekoChat.sizeTick = 0;
      nekoBubbleFit(); nekoChatFit();
    });
  });
  /* 气泡分成「文字」与「结果卡片」两层：文字由流式回复反复覆写，
     卡片单独一行、带按钮，点击就去对应的页面（气泡本身是 pointer-events:none，
     只有卡片打开指针事件，不然整块会挡住小猫）。 */
  function nekoBubbleParts() {
    var el = document.getElementById('neko-bubble');
    if (!el) return null;
    var t = el.querySelector('.neko-bubble-text');
    var a = el.querySelector('.neko-bubble-acts');
    var n = el.querySelector('.neko-bubble-note');
    if (!t || !a || !n) {
      el.textContent = '';
      t = document.createElement('span'); t.className = 'neko-bubble-text';
      a = document.createElement('span'); a.className = 'neko-bubble-acts'; a.hidden = true;
      n = document.createElement('span'); n.className = 'neko-bubble-note'; n.hidden = true;
      el.appendChild(t); el.appendChild(a); el.appendChild(n);
    }
    return { el: el, text: t, acts: a, note: n };
  }
  /* 投喂小字：只写「第几个」，不抢正文的注意力 */
  function nekoBubbleNote(txt) {
    var q = nekoBubbleParts();
    if (!q) return;
    q.note.textContent = txt || '';
    q.note.hidden = !txt;
  }
  /* 显示层清理：气泡窄、又是纯文本，代码围栏只会露出三个反引号，去掉更干净 */
  function nekoPretty(t) {
    return String(t == null ? '' : t)
      .replace(/^[ \t]*```[a-zA-Z]*[ \t]*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+$/, '');
  }
  /* 说完话后的成品走站内 Markdown 引擎：粗体、列表、代码、表格、折叠块、
     $公式$ 全都能渲染；链接再统一转成可点的圆角按钮。流式过程仍用纯文本，
     免得每来一个字就重排一次。 */
  /* 模型常用 \( … \) 与 \[ … \] 写公式，站内引擎只认 $…$ / $$…$$。
     渲染前换一遍；代码围栏与行内代码里原样不动，免得把示例改坏。 */
  function nekoMathDelims(t) {
    return String(t || '').split(/(```[\s\S]*?```|`[^`\n]*`)/g).map(function (seg, i) {
      if (i % 2 === 1) return seg;
      return seg.replace(/\\\[([\s\S]*?)\\\]/g, function (m, body) {
        return '\n$$\n' + String(body).replace(/^\s+|\s+$/g, '') + '\n$$\n';
      }).replace(/\\\(([\s\S]*?)\\\)/g, function (m, body) {
        return '$' + String(body).replace(/^\s+|\s+$/g, '') + '$';
      });
    }).join('');
  }
  function nekoMarkdown(t) {
    var q = nekoBubbleParts();
    if (!q) return;
    var html = '';
    try { if (window.ZBMD && window.ZBMD.render) html = window.ZBMD.render(nekoMathDelims(t)); } catch (e) { html = ''; }
    if (!html) { nekoRich(t); return; }
    q.text.classList.add('is-md');
    q.text.innerHTML = html;
    Array.prototype.forEach.call(q.text.querySelectorAll('a[href]'), function (a) {
      var label = String(a.textContent || '').replace(/^\s+|\s+$/g, '').slice(0, 60);
      var got = nekoLinkResolve(a.getAttribute('href') || '', label);
      /* 按钮上写真实标题：模型爱偷懒写成「点击查看」，看着像不知道自己在指哪儿 */
      a.textContent = got.name || label || '打开链接';
      a.className = 'neko-chip neko-chip-inline';
      a.removeAttribute('data-md-link');
      if (got.inner && got.href) {
        a.setAttribute('href', got.href);
        a.setAttribute('data-neko-go', got.href);
      } else {
        a.setAttribute('href', got.href || '#');
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }
  function nekoBubbleText(v, md) {
    var q = nekoBubbleParts();
    if (q) q.text.classList.remove('is-md');
    if (md) nekoMarkdown(v); else nekoRich(v);
  }
  /* 模型偶尔自己拼链接（列相册时最常见）：气泡是纯文本节点，不处理就会把
     [成都-蓉城 · LIVE](https://…) 原样露出来。这里把链接抽成和结果卡片同款的
     圆角按钮：站内路径转 hash 路由，站外地址开新标签。 */
  /* 比较链接文字与真实标题时去掉标点与 emoji，只留汉字/字母/数字 */
  function nekoPlain(x) { return String(x || '').replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '').toLowerCase(); }
  /* 这些话不是标题，是「快点我」：遇到就把真实标题顶上去 */
  var NEKO_GENERIC_LABEL = /^(点击查看|点击进入|点此查看|点这里|点这里查看|点我|点击|查看|查看详情|详情|这里|链接|打开链接|打开|去看看|进入|阅读|阅读全文|here|link|click|open)$/i;
  var NEKO_PAGE_NAME = { home: '首页', posts: '文章', photowall: '相册', album: '相册',
    moments: '说说', chatter: '杂谈', projects: '项目', timeline: '归档', friends: '友链',
    about: '关于', tags: '标签', settings: '设置', search: '搜索', vip: '工坊' };
  function nekoSameTitle(a, b) {
    var x = nekoPlain(a), y = nekoPlain(b);
    if (!x || !y) return false;
    return x === y || (x.length >= 2 && y.length >= 2 && (x.indexOf(y) >= 0 || y.indexOf(x) >= 0));
  }
  function nekoFindPost(want) {
    var ps = nekoKb().posts, i;
    for (i = 0; i < ps.length; i++) if (nekoPlain(ps[i].title) === nekoPlain(want)) return ps[i];
    for (i = 0; i < ps.length; i++) if (nekoSameTitle(ps[i].title, want)) return ps[i];
    return null;
  }
  function nekoFindAlbum(want) {
    var refs = nekoKb().albumRefs || [], i;
    for (i = 0; i < refs.length; i++) if (nekoPlain(refs[i].title) === nekoPlain(want)) return refs[i];
    for (i = 0; i < refs.length; i++) if (nekoSameTitle(refs[i].title, want)) return refs[i];
    return null;
  }
  /* 把「模型可能随手拼的地址」翻成站内真实路由，同时给出该条目的真实名字：
     - #/第1次周报、/第1次周报、/post/第1次周报、/posts/p-xxxx.html 都要落到 #/post/<slug>
     - 相册同理；对不上就退回列表页，绝不留在原地拼一个 404 地址。
     返回 { href, name, inner }，inner 表示这是站内路由。 */
  function nekoRouteResolve(path, label) {
    var p = String(path || '').trim();
    if (!p) return null;
    var segs = p.replace(/^#/, '').replace(/^\/+/, '').split('?')[0].split('#')[0]
      .replace(/\.html?$/i, '').split('/').filter(Boolean);
    /* URL 里的中文是百分号编码的：先还原，否则「/第1次周报」永远对不上标题 */
    segs = segs.map(function (x) {
      try { return decodeURIComponent(x); } catch (e9) { return x; }
    });
    var k = (segs[0] || '').toLowerCase();
    var id = segs[1] || '';
    try { id = decodeURIComponent(id); } catch (e0) { /* 保持原样 */ }
    var want = String(label || '').replace(/^\s+|\s+$/g, '');
    var generic = !want || NEKO_GENERIC_LABEL.test(want);
    /* 文章：/post/<slug|标题>、/posts/<slug>.html，或者干脆就一个标题 */
    if (k === 'post' || k === 'posts') {
      var ps = nekoKb().posts, i, hit = null;
      for (i = 0; i < ps.length; i++) if (ps[i].slug === id) { hit = ps[i]; break; }
      if (!hit && id) hit = nekoFindPost(id);
      if (!hit && !generic) hit = nekoFindPost(want);
      if (hit) return { href: '#/post/' + encodeURIComponent(hit.slug), name: hit.title, inner: true };
      return { href: '#/posts', name: '全部文章', inner: true };
    }
    if (k === 'album') {
      var refs = nekoKb().albumRefs || [], j, al = null;
      for (j = 0; j < refs.length; j++) if (refs[j].id === id) { al = refs[j]; break; }
      if (!al && id) al = nekoFindAlbum(id);
      if (!al && !generic) al = nekoFindAlbum(want);
      if (al) return { href: '#/album/' + encodeURIComponent(al.id), name: al.title, inner: true };
      return { href: '#/photowall', name: '相册', inner: true };
    }
    if (k === 'tag') {
      var tag = id || want;
      return { href: '#/tag/' + encodeURIComponent(tag), name: '#' + tag, inner: true };
    }
    if (NEKO_PAGE_NAME[k]) {
      return { href: '#' + p.replace(/^#/, ''), name: NEKO_PAGE_NAME[k], inner: true };
    }
    /* 不认识的路径：多半模型把标题当路径写了，拿它去对文章 / 相册 / 杂谈 */
    var probe = id || (segs[0] || '');
    var byTitle = nekoFindPost(want) || nekoFindPost(probe);
    if (byTitle) return { href: '#/post/' + encodeURIComponent(byTitle.slug), name: byTitle.title, inner: true };
    var byAlbum = nekoFindAlbum(want) || nekoFindAlbum(probe);
    if (byAlbum) return { href: '#/album/' + encodeURIComponent(byAlbum.id), name: byAlbum.title, inner: true };
    var ch = arr('chatter'), m;
    for (m = 0; m < ch.length; m++) {
      if (nekoSameTitle(ch[m].title, want) || nekoSameTitle(ch[m].title, probe)) {
        return { href: '#/chatter/' + encodeURIComponent(ch[m].id), name: String(ch[m].title || ''), inner: true };
      }
    }
    return null;
  }
  function nekoLinkResolve(url, label) {
    var raw = String(url || '').trim();
    if (!raw) return { href: '', name: String(label || '').replace(/^\s+|\s+$/g, '') };
    /* 站内 hash 路由：以前遇到 # 开头直接原样返回，
       于是 #/第1次周报 就被塞进地址栏变成「站点后加 /第1次周报」——现在照样解析 */
    if (raw.charAt(0) === '#') {
      var r0 = nekoRouteResolve(raw, label);
      if (r0) return r0;
      return { href: raw, name: String(label || '').replace(/^\s+|\s+$/g, '') || raw };
    }
    var u = null;
    try { u = new URL(raw, location.href); } catch (e) { u = null; }
    if (!u) {
      var r1 = nekoRouteResolve(raw, label);
      if (r1) return r1;
      return { href: raw, name: String(label || '') || raw };
    }
    var path = u.pathname.replace(/\/+$/, '') || '/';
    /* 模型可能把站内地址写成别的域名（它自己补的 staream.top 之类），
       但路径就是本站结构：一律当站内路由，别把访客带去不存在的站 */
    var looksInner = u.origin === location.origin ||
      /^\/(album|post|tag|posts|photowall|moments|projects|friends|timeline|about|chatter|tags|search|settings)(\/|$)/i.test(path);
    if (looksInner) {
      var r2 = nekoRouteResolve(u.hash || path, label) || nekoRouteResolve(path, label);
      if (r2) return r2;
      return { href: '#/posts', name: '全部文章', inner: true };
    }
    return { href: u.href, name: String(label || '').replace(/^\s+|\s+$/g, '') || u.hostname, inner: false };
  }
  /* 只要地址的老接口：给不需要改文案的地方留着 */
  function nekoLinkTarget(url, label) { return nekoLinkResolve(url, label).href || ''; }
  /* 流式还没收完时，末尾半个链接先藏起来，免得闪一串括号 */
  function nekoTrimPartialLink(s) {
    var i = s.lastIndexOf('[');
    if (i < 0) return s;
    var rest = s.slice(i), p = rest.indexOf('](');
    if (p >= 0) return rest.lastIndexOf(')') < p ? s.slice(0, i) : s;
    return rest.length < 64 && /^\[[^\]\n]*$/.test(rest) ? s.slice(0, i) : s;
  }
  function nekoRich(t) {
    var q = nekoBubbleParts();
    if (!q) return;
    var s = nekoTrimPartialLink(nekoPretty(t));
    var host = q.text;
    while (host.firstChild) host.removeChild(host.firstChild);
    var re = /\[([^\]\n]{1,48})\]\((https?:\/\/[^\s)]+|\/[^\s)]*|#[^\s)]*)\)|(https?:\/\/[^\s，。！？、）)]+)/g;
    var at = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > at) host.appendChild(document.createTextNode(s.slice(at, m.index)));
      var label = String(m[1] || m[3] || '').replace(/^\s+|\s+$/g, '').slice(0, 40);
      var got = nekoLinkResolve(m[2] || m[3] || '', label);
      var a = document.createElement('a');
      a.className = 'neko-chip neko-chip-inline';
      a.textContent = got.name || label || '打开链接';
      a.setAttribute('href', got.href || '#');
      if (got.inner && got.href) a.setAttribute('data-neko-go', got.href);
      else { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
      host.appendChild(a);
      at = m.index + m[0].length;
    }
    if (at < s.length) host.appendChild(document.createTextNode(s.slice(at)));
  }
  function nekoBubbleActsList(acts) {
    var q = nekoBubbleParts();
    if (!q) return;
    while (q.acts.firstChild) q.acts.removeChild(q.acts.firstChild);
    if (!acts || !acts.length) {
      q.acts.hidden = true; q.el.classList.remove('has-acts');
      return;
    }
    for (var i = 0; i < acts.length; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'neko-chip';
      b.setAttribute('data-neko-go', acts[i].hash);
      b.textContent = acts[i].label;
      q.acts.appendChild(b);
    }
    q.acts.hidden = false;
    q.el.classList.add('has-acts');
    nekoBubbleFit();
  }
  /* 卡片点击：收起气泡，跳到对应地址（站内都是 hash 路由，不刷新页面）。
     正文里渲染出来的站外链接没有 data-neko-go，放行给浏览器自己开新标签。 */
  document.addEventListener('click', function (e) {
    var t = e.target;
    var b = t && t.closest ? t.closest('.neko-chip') : null;
    if (!b) return;
    var go = b.getAttribute('data-neko-go') || '';
    if (!go) return;
    e.preventDefault(); e.stopPropagation();
    nekoHideBubble();
    if (go.charAt(0) === '#') location.hash = go; else location.href = go;
  }, true);

  function nekoSay(text, ms, note) {
    var el = document.getElementById('neko-bubble');
    if (!el) return;
    nekoChat.phase = 'done';   /* 短句直接是成品，别被残片覆盖 */
    var oldRect = el.hidden ? null : el.getBoundingClientRect();
    el.classList.remove('is-typing');
    nekoBubbleText(text);
    nekoBubbleNote(note || '');
    nekoBubbleActsList(null);
    el.hidden = false;
    window.requestAnimationFrame(function () {
      el.classList.add('show');
      nekoBubbleFit(!!oldRect, oldRect);
    });
    if (nekoChat.hideTimer) clearTimeout(nekoChat.hideTimer);
    nekoChat.hideTimer = window.setTimeout(function () {
      nekoShutMouth();
      el.classList.remove('show');
      window.setTimeout(function () { el.hidden = true; }, 320);
    }, ms || 6000);
  }
  /* 流式回复：先开一个只显示省略号的气泡，边收边写，收完再按字数留一会儿 */
  function nekoBubbleOpen() {
    var el = document.getElementById('neko-bubble');
    if (!el) return;
    if (nekoChat.hideTimer) { clearTimeout(nekoChat.hideTimer); nekoChat.hideTimer = 0; }
    nekoChat.phase = 'stream';
    nekoChat.wMax = 0;
    el.style.removeProperty('width');
    el.style.removeProperty('bottom');   /* 上一条长回复可能往下借过位，新一句要从猫头顶重新起 */
    el.style.removeProperty('--neko-bubble-dx');
    nekoBubbleText('·');
    nekoBubbleNote('');
    nekoBubbleActsList(null);
    el.hidden = false;
    el.classList.add('is-typing');
    window.requestAnimationFrame(function () {
      el.classList.add('show');
      nekoBubbleLive();
    });
  }
  /* 边收边渲染：以前流式阶段是纯文本、说完才转 Markdown，访客在这儿看到的是
     「**定义向量**」「\frac{…}」这种源码，看着就像坏了。现在每个分片都直接渲染。 */
  function nekoBubblePush(txt) {
    var el = document.getElementById('neko-bubble');
    if (!el) return;
    if (nekoChat.phase === 'done') return;   /* 收尾后迟到的分片不许再覆写成品 */
    nekoBubbleText(txt, true);
    if (!el.classList.contains('show')) el.classList.add('show');
    if (!nekoChat.fitTick) {
      nekoChat.fitTick = window.requestAnimationFrame(function () {
        nekoChat.fitTick = 0;
        nekoBubbleLive();
      });
    }
  }
  /* 模型偶尔不听话：一条回复挂两三个「喵」，或者把语法用反引号包起来。
     这里做最后一道收口——只动装饰，不改意思。 */
  function nekoTidyReply(t) {
    var s = String(t || '');
    /* 代码、行内代码与公式先收起来：标点整理会误伤 `...`、`**` 这类语法 */
    var stash = [];
    s = s.replace(/```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, function (m) {
      stash.push(m);
      return '\u0004M' + (stash.length - 1) + '\u0004';
    });
    var at = s.indexOf('喵');
    if (at >= 0) s = s.slice(0, at + 1) + s.slice(at + 1).replace(/喵[~～]?/g, '');
    /* 「看家。喵。」删掉喵就成了「看家。。」；模型也爱拿连续标点当强调。
       同一标点收成一个（问号叹号也收一个），顺带去掉标点前的空格。 */
    s = s.replace(/([。，、；：])\1+/g, '$1')
         .replace(/！{2,}/g, '！').replace(/？{2,}/g, '？')
         .replace(/[ \t]+([。，、；：！？])/g, '$1')
         .replace(/^[。，、；：]+/gm, '');
    /* 同一符号连发四个以上只留三个：她的习惯是三个，多出来就是重复符号 */
    s = s.replace(/([\s\S]{1,2}?)\1{3,}/g, function (m, g) { return g + g + g; });
    /* 模型爱把省略号打成三个半角点，统一成中文省略号；波浪号也用全角 */
    s = s.replace(/\.{3,}/g, '…').replace(/~+/g, '～');
    s = s.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
    s = s.replace(/\u0004M(\d+)\u0004/g, function (m, i) { return stash[Number(i)] || ''; });
    return s.trim();
  }
  function nekoBubbleFinish(txt, ms) {
    var el = document.getElementById('neko-bubble');
    if (!el) return;
    if (nekoChat.hideTimer) { clearTimeout(nekoChat.hideTimer); nekoChat.hideTimer = 0; }
    nekoChat.phase = 'done';
    var oldRect = el.hidden ? null : el.getBoundingClientRect();
    el.classList.remove('is-typing');
    nekoBubbleText(txt, true);
    el.hidden = false;
    el.classList.add('show');
    nekoBubbleFit(!!oldRect, oldRect);
    var hold = ms || Math.min(11000, Math.max(5200, String(txt || '').length * 200));
    if (nekoChat.hideTimer) clearTimeout(nekoChat.hideTimer);
    nekoChat.hideTimer = window.setTimeout(function () {
      nekoShutMouth();
      el.classList.remove('show');
      window.setTimeout(function () { el.hidden = true; }, 320);
    }, hold);
  }
  function nekoParseApi(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    var seg = s.split('|');
    var url = (seg[0] || '').trim();
    if (!/^https?:\/\//i.test(url)) return null;
    /* 智谱的 chat 路径必须带结尾斜杠：不带的那条被边缘 WAF 拦了预检，浏览器发不出去 */
    if (/^https?:\/\/open\.bigmodel\.cn\/api\/paas\/v4\/chat\/completions$/i.test(url)) url += '/';
    return {
      url: url,
      key: (seg[1] || '').trim(),
      model: (seg[2] || '').trim() || 'gpt-4o-mini'
    };
  }
  function nekoApiParts() {
    return nekoParseApi(nekoCfg().api);
  }
  /* ---------- 站内知识库：让花信对自己的站「知根知底」 ----------
     不另外生成数据文件——文章集合（POSTS）与扩展数据（DATA）本来就在内存里，
     正文直接从它们抽，所以站长发布新文章后下一次提问她读到的就是新内容，
     不需要重跑构建、也不会出现「站上有了、她还不认识」的错位。
     抽取只在第一次聊天时做一次并缓存；工坊改过数据就清缓存重抽。 */
  var nekoKbCache = null;
  var NEKO_KB_CAP = 24000;   /* 单篇最多取这么多字：够讲清语法与步骤，也不至于把内存撑大 */
  function nekoKbDrop() { nekoKbCache = null; }
  document.addEventListener('zb:studio-data', nekoKbDrop);
  document.addEventListener('zb:site-change', nekoKbDrop);
  /* 别的标签页 / 工坊自动同步写完 localStorage 时，也让她重新读一遍内容 */
  window.addEventListener('storage', nekoKbDrop);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) nekoKbDrop(); });
  /* 内容指纹：不依赖事件是否漏发，问之前比一次，变了就重建知识库 */
  function nekoKbStamp() {
    var p = POSTS[0] || {};
    return [POSTS.length, p.slug || '', p.date || '',
      arr('moments').length, arr('albums').length, arr('chatter').length, arr('projects').length,
      (DATA.tagLibrary || []).join(',')].join('|');
  }

  /* 正文优先取 markdown（代码示例原样保留，讲语法全靠它），只有 HTML 时才去标签 */
  function nekoPostText(p) {
    var raw = '';
    if (typeof p.markdown === 'string' && p.markdown.trim()) raw = p.markdown;
    else if (typeof p.body === 'string') raw = p.body;
    else if (p.body && p.body.length) raw = p.body.join('\n');
    else if (typeof p.content === 'string') raw = p.content;
    var s = String(raw || '');
    if (s.indexOf('\n#') < 0 && /<\/?[a-z][\s\S]*?>/i.test(s)) {
      s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/(p|div|li|h[1-6]|tr|pre|blockquote)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    } else {
      /* markdown 里图片、链接的外壳去掉，留可读文字；代码块整段保留 */
      s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    }
    s = s.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return s.length > NEKO_KB_CAP ? s.slice(0, NEKO_KB_CAP) : s;
  }
  function nekoKb() {
    var stamp = nekoKbStamp();
    if (nekoKbCache && nekoKbCache.stamp === stamp) return nekoKbCache;
    var posts = [];
    for (var i = 0; i < POSTS.length; i++) {
      var p = POSTS[i];
      if (!p || !p.slug) continue;
      var text = nekoPostText(p);
      var heads = [], lines = text.split('\n');
      for (var j = 0; j < lines.length; j++) {
        var m = lines[j].match(/^#{1,4}\s+(.+)$/);
        if (m) heads.push(m[1].replace(/[#`*]/g, '').trim());
      }
      posts.push({
        slug: String(p.slug), title: String(p.title || ''),
        date: String(p.date || '').slice(0, 10), tags: (p.tags || []).slice(),
        summary: String(p.summary || ''), heads: heads.slice(0, 40),
        text: text, low: (String(p.title || '') + ' ' + (p.tags || []).join(' ') + ' ' + text).toLowerCase()
      });
    }
    var chat = arr('chatter'), proj = arr('projects'), alb = arr('albums');
    nekoKbCache = {
      posts: posts,
      tags: (DATA.tagLibrary || []).slice(),
      chatter: chat.map(function (c) {
        return { id: c.id, title: String(c.title || ''), date: String(c.date || '').slice(0, 10),
          tags: c.tags || [], summary: String(c.summary || '').slice(0, 120) };
      }),
      moments: arr('moments').length,
      projects: proj.map(function (x) { return String(x.name || ''); }),
      albums: alb.map(function (a) { return String(a.title || ''); }),
      albumRefs: alb.map(function (a) { return { id: String(a.id || ''), title: String(a.title || '') }; }),
      name: CFG.displayName || '星梦Staream',
      stamp: stamp
    };
    return nekoKbCache;
  }

  /* 中文没法按空格切词，这里走「整段 + 2/3 元」的粗分词：
     长句里抠出相邻两三个字的组合，命中率比整句匹配高得多；
     高频虚词与疑问词进停用表，避免「文章」「怎么」这类词把所有结果一起抬高。 */
  var NEKO_STOP = { '的': 1, '了': 1, '是': 1, '吗': 1, '呢': 1, '啊': 1, '吧': 1, '和': 1, '与': 1,
    '我': 1, '你': 1, '他': 1, '她': 1, '它': 1, '这': 1, '那': 1, '有': 1, '在': 1, '就': 1, '都': 1,
    '文章': 1, '一篇': 1, '两篇': 1, '这个': 1, '那个': 1, '帮我': 1, '一下': 1, '关于': 1, '什么': 1,
    '怎么': 1, '如何': 1, '可以': 1, '能不': 1, '不能': 1, '请问': 1, '想看': 1, '看看': 1, '找找': 1,
    '哪些': 1, '哪个': 1, '这里': 1, '那里': 1, '告诉': 1, '记得': 1, '之前': 1, '以前': 1 };
  /* 站里常用的几种说法：站长问「建站」时，文章里可能通篇写的是「域名」「托管」「搭博客」，
     只靠字面匹配会漏，所以给一小张同义词表把问法摊开。表小、可在控制台查看。 */
  var NEKO_SYN = {
    '建站': ['搭一个', '域名', '托管', '博客'],
    '搭站': ['建站', '域名', '托管'],
    '评论': ['留言'],
    '留言': ['评论'],
    '夜间': ['暗色', 'night'],
    '暗色': ['夜间', 'night'],
    '语法': ['markdown', '拓展'],
    '折叠': ['折叠块', 'info', 'succ', 'warn', 'err'],
    '目录': ['竖条', 'toc'],
    '竖条': ['引用', ':::|'],
    '竖线': ['竖条', '引用', ':::|'],
    '竖向': ['竖条', '引用', ':::|'],
    '计数': ['浏览', '点赞', 'abacus'],
    '点赞': ['计数', '爱心'],
    '相册': ['照片', 'photowall'],
    '字体': ['字号', '阅读'],
    '更新': ['版本', '日志']
  };
  function nekoTerms(q) {
    var s = String(q || '').toLowerCase();
    var parts = s.split(/[^0-9a-z\u4e00-\u9fa5]+/i), seen = {}, out = [];
    function add(t, boost) {
      if (!t || t.length < 2 || NEKO_STOP[t]) return;
      if (seen[t]) { if (boost) seen[t] = 1.4; return; }
      seen[t] = boost ? 1.4 : 1; out.push(t);
    }
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i];
      if (!w) continue;
      if (/^[0-9a-z]+$/.test(w)) { add(w); continue; }
      if (w.length <= 4) add(w);
      for (var n = 2; n <= 3; n++) {
        for (var k = 0; k + n <= w.length; k++) add(w.substr(k, n));
      }
    }
    /* 同义词只按「整词出现」补，避免把表里每个字都摊成噪音 */
    for (var key in NEKO_SYN) {
      if (!NEKO_SYN.hasOwnProperty(key)) continue;
      if (s.indexOf(key) < 0) continue;
      var list = NEKO_SYN[key];
      for (var j = 0; j < list.length; j++) add(list[j], 1);
    }
    return { list: out.slice(0, 26), weight: seen };
  }
  /* 片段：把命中词前后的原文切一小段出来，给模型当事实依据 */
  function nekoSnippet(p, term) {
    var text = String(p.text || '');
    if (!text) return String(p.summary || '');
    var at = term ? text.toLowerCase().indexOf(term) : -1;
    if (at < 0) at = 0;
    /* 找命中处所属的小节标题：讲语法时小节名本身就是关键信息
       （比如「四色折叠框 info / succ / warn / err」），少了它模型容易编出个不存在的类型名 */
    var lines = text.slice(0, at).split('\n'), head = '', hs = -1, off = 0;
    for (var k = 0; k < lines.length; k++) {
      var hm = lines[k].match(/^#{1,4}\s+(.+)$/);
      if (hm) { head = hm[1].replace(/[#`*]/g, '').trim(); hs = off; }
      off += lines[k].length + 1;
    }
    /* 小节标题就在附近时，从标题处开始切，别把上一节的内容混进来 */
    var from = (hs >= 0 && at - hs <= 420) ? hs : Math.max(0, at - 110);
    var to = Math.min(text.length, at + 220);
    if (to - from > 420) to = from + 420;
    var body = text.slice(from, to).replace(/\s+/g, ' ');
    return (from === hs ? '' : (head ? '〔小节：' + head + '〕' : '')) +
      (from > 0 && from !== hs ? '…' : '') + body + (to < text.length ? '…' : '');
  }
  function nekoSearch(q, limit) {
    var tz = nekoTerms(q), terms = tz.list;
    var kb = nekoKb();
    var N = Math.max(1, kb.posts.length), df = [], i, j;
    /* 「最新 / 最近发了什么」这类问法本身不含主题：把时间词与泛词剥掉，
       剩下没关键词就直接按日期给最新的几篇，别去正文里瞎匹配「新」和「文章」。 */
    var sq = String(q || '').toLowerCase();
    if (/最新|最近|刚发|刚更新|新发/.test(sq)) {
      var rest = sq.replace(/最新|最近|刚刚|刚发|刚更新|新发|新发布|更新了|文章|博客|内容|现在|都有啥|有什么|多少|的|了|吗|呢|呀/g, ' ');
      if (!nekoTerms(rest).list.length) {
        var byNew = kb.posts.slice().sort(function (a, b) {
          return String(b.date).localeCompare(String(a.date));
        });
        var fresh = [];
        for (i = 0; i < byNew.length && i < (limit || 3); i++) {
          fresh.push({ p: byNew[i], score: 40 - i * 10,
            snippet: nekoSnippet(byNew[i], '') });
        }
        return fresh;
      }
    }
    if (!terms.length) return [];
    /* 词频太高（过半文章都有）的字组合多半是「博客」「这个」这类泛词，
       按 IDF 思路压权，不然后者会压过真正的关键词。 */
    for (i = 0; i < terms.length; i++) {
      var c = 0;
      for (j = 0; j < N; j++) if (kb.posts[j].low.indexOf(terms[i]) >= 0) c++;
      df.push(c);
    }
    /* 日期两种说法都要认：带年份的 2026-11-11 / 2026年11月11日，和不带年份的 11月11日 */
    var dm = String(q).match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
    var md = dm ? null : String(q).match(/(\d{1,2})\s*月\s*(\d{1,2})/);
    var wantDate = dm ? (dm[1] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[3]).slice(-2))
      : (md ? ('-' + ('0' + md[1]).slice(-2) + '-' + ('0' + md[2]).slice(-2)) : '');
    var hits = [];
    /* 问句里直接点了某个标签名（「算法」「Markdown」），这就是最强的意图：
       这类词在正文里到处都是、单靠词频会被压掉，所以按标签库直给一记加权。 */
    var tagHit = {};
    for (i = 0; i < kb.tags.length; i++) {
      var tg = String(kb.tags[i] || '').toLowerCase();
      if (tg.length >= 2 && sq.indexOf(tg) >= 0) tagHit[kb.tags[i]] = 1;
    }
    for (i = 0; i < kb.posts.length; i++) {
      var p = kb.posts[i], score = 0, best = '', bestHit = 0;
      if (wantDate && p.date.indexOf(wantDate) >= 0) score += 20;
      for (var tgk in tagHit) {
        if (tagHit.hasOwnProperty(tgk) && (p.tags || []).indexOf(tgk) >= 0) { score += 14; break; }
      }
      for (j = 0; j < terms.length; j++) {
        var t = terms[j];
        var w = (df[j] / N > 0.66 ? 0.18 : (df[j] === 1 ? 1.35 : 1)) * (tz.weight[t] || 1);
        if (p.title.toLowerCase().indexOf(t) >= 0) score += 6 * w;
        if (p.tags.join(' ').toLowerCase().indexOf(t) >= 0) score += 5 * w;
        if (p.summary.toLowerCase().indexOf(t) >= 0) score += 2 * w;
        if (p.heads.join(' ').toLowerCase().indexOf(t) >= 0) score += 3 * w;
        var n = 0, at = 0, idx = -1;
        while ((idx = p.low.indexOf(t, at)) >= 0 && n < 8) { n++; at = idx + t.length; }
        if (n) { score += Math.min(n, 4) * w; if (n * w > bestHit) { bestHit = n * w; best = t; } }
      }
      if (score >= 6) hits.push({ p: p, score: Math.round(score), snippet: nekoSnippet(p, best) });
    }
    hits.sort(function (a, b) {
      return b.score - a.score || String(b.p.date).localeCompare(String(a.p.date));
    });
    return hits.slice(0, limit || 3);
  }
  /* 站内有哪些页面：给「带路」用的路线表 */
  var NEKO_ROUTES = [
    { kw: ['归档', '时间线', '时间轴'], hash: '#/timeline', label: '去归档' },
    { kw: ['全部文章', '文章列表', '所有文章'], hash: '#/posts', label: '看全部文章' },
    { kw: ['标签总览', '有哪些标签'], hash: '#/tags', label: '标签总览' },
    { kw: ['项目'], hash: '#/projects', label: '看项目' },
    { kw: ['相册', '图集', '照片'], hash: '#/photowall', label: '去相册' },
    { kw: ['说说'], hash: '#/moments', label: '看说说' },
    { kw: ['杂谈'], hash: '#/chatter', label: '看杂谈' },
    { kw: ['友链', '友情链接'], hash: '#/friends', label: '看友链' },
    { kw: ['关于', '站长是谁', '作者是谁'], hash: '#/about', label: '关于这个站' },
    { kw: ['设置', '画质'], hash: '#/settings', label: '打开设置' }
  ];
  /* 生成「看得见点得着」的结果卡片：文章可直开、标签可筛、页面可去 */
  function nekoActs(q, hits) {
    var acts = [], seen = {}, kbPosts = nekoKb().posts, sq = String(q || '');
    function push(a) { if (!a || seen[a.hash]) return; seen[a.hash] = 1; acts.push(a); }
    var top = hits.length ? hits[0].score : 0;
    /* 先看问的是不是某个页面本身（「相册」「友链」）：这种问法下沾边的文章卡片
       只会碍事，门槛抬高；不给带路的时候才放宽，让弱命中的文章也能点开。 */
    var routes = [];
    for (var r = 0; r < NEKO_ROUTES.length; r++) {
      var rt = NEKO_ROUTES[r], hitRt = false;
      for (var k = 0; k < rt.kw.length; k++) if (sq.indexOf(rt.kw[k]) >= 0) hitRt = true;
      if (hitRt) routes.push(rt);
    }
    var minCard = routes.length ? 16 : 8;
    for (var i = 0; i < hits.length && i < 2; i++) {
      /* 只给最贴题的一两条：分数不到首条一半、或低到离谱的，宁可不给 */
      if (i > 0 && (hits[i].score < 10 || hits[i].score < top * 0.55)) break;
      if (i === 0 && hits[i].score < minCard) break;
      push({ hash: '#/post/' + encodeURIComponent(hits[i].p.slug),
        label: '打开《' + hits[i].p.title + '》' });
    }
    var tags = nekoKb().tags;
    for (var t = 0; t < tags.length && acts.length < 4; t++) {
      var tg = tags[t];
      if (!tg || tg === 'A' || tg === 'B' || tg === '⭐') continue;
      if (sq.indexOf(tg) < 0) continue;
      /* 标签得真有文章贴着才给卡片，否则点进去是一页空白 */
      var used = false;
      for (var u = 0; u < kbPosts.length; u++) {
        if ((kbPosts[u].tags || []).indexOf(tg) >= 0) { used = true; break; }
      }
      if (!used) continue;
      push({ hash: '#/tag/' + encodeURIComponent(tg), label: '看标签「' + tg + '」' });
    }
    /* 页面卡片：没有命中文章时给；有命中但分数明显不够时也给——
       问「相册」「友链」这类页面名，别拿一篇沾边的旧文章糊弄过去 */
    if (!hits.length || top < 12) {
      for (var v = 0; v < routes.length; v++) push({ hash: routes[v].hash, label: routes[v].label });
    }
    /* 兜底卡片只在「明显在找东西」的问法下给：自我介绍、寒暄、问一句功能，
       下面不该永远挂着同一个「看全部文章」，那样每条回复都长着一样的尾巴 */
    if (!acts.length && /文章|哪一?篇|哪个|找|搜|搜到|有没有|写过|发过|推荐|列表|全部|整理/.test(sq)) {
      push({ hash: '#/posts', label: '看全部文章' });
    }
    return acts.slice(0, 4);
  }
  /* 站点快照：每次提问都带上，所以她永远知道「现在站里有什么」 */
  function nekoSiteDigest() {
    var kb = nekoKb();
    var top = kb.posts.slice(0, 6).map(function (p) {
      return '《' + p.title + '》' + p.date + (p.tags.length ? '[' + p.tags.join('/') + ']' : '');
    }).join('；');
    var s = '【站点快照】站名 ' + kb.name + '；文章 ' + kb.posts.length + ' 篇；标签：' +
      kb.tags.filter(function (x) { return x && x !== 'A' && x !== 'B'; }).join('、') +
      '；最近发布：' + top;
    if (kb.chatter.length) s += '；杂谈 ' + kb.chatter.length + ' 则（' + kb.chatter.slice(0, 3).map(function (c) { return c.title; }).join('、') + '）';
    if (kb.projects.length) s += '；项目：' + kb.projects.join('、');
    if (kb.albums.length) {
      /* 带 id 一起给：她列相册时能直接抄对地址，不会自己编 /album/1 */
      s += '；相册：' + kb.albums.map(function (t, i) {
        var id = kb.albumRefs && kb.albumRefs[i] ? kb.albumRefs[i].id : '';
        return id ? t + '（#/album/' + id + '）' : t;
      }).join('、');
    }
    if (kb.moments) s += '；说说 ' + kb.moments + ' 条';
    return s;
  }
  /* 当前页面的上下文：快捷询问、以及任何一次提问都带上，
     这样她说「这一页」时不用猜访客停在哪。 */
  function nekoHashParts() {
    return String(location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(function (x) {
      try { return decodeURIComponent(x); } catch (e) { return x; }
    });
  }
  function nekoClip(t, n) {
    var s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function nekoPageContext() {
    var parts = nekoHashParts(), k = parts[0] || 'home', tail = [], s = '';
    if (k === 'post' && parts[1]) {
      var p = POSTS.filter(function (x) { return x.slug === parts[1]; })[0];
      if (p) {
        s = '文章《' + p.title + '》' + String(p.date || '').slice(0, 10) +
          ((p.tags || []).length ? '｜标签 ' + p.tags.join('/') : '') +
          '｜摘要：' + nekoClip(p.summary || p.title, 180) + '｜地址 #/post/' + p.slug;
      }
    } else if (k === 'album' && parts[1]) {
      var a = arr('albums').filter(function (x) { return x.id === parts[1]; })[0];
      if (a) {
        var notes = (a.photos || []).slice(0, 6).map(function (ph) {
          return ph.note || ph.title || '';
        }).filter(Boolean).join('；');
        s = '相册《' + a.title + '》' + String(a.date || '').slice(0, 10) + '｜' +
          (a.photos || []).length + ' 张｜说明：' + nekoClip(a.desc || '（无）', 160) +
          (notes ? '｜照片标注：' + nekoClip(notes, 260) : '') + '｜地址 #/album/' + a.id;
      }
    } else if (k === 'photowall') {
      var as = arr('albums').slice(0, 8).map(function (x, i) {
        return '《' + x.title + '》' + (x.photos || []).length + '张（#/album/' + x.id + '）';
      }).join('、');
      s = '相册总览｜共 ' + arr('albums').length + ' 个相册、' + photoCount() + ' 张照片｜' + as;
    } else if (k === 'moments') {
      var ms = recentByDate(arr('moments'), 3).map(function (m) {
        return String(m.date || '').slice(0, 10) + '：' + nekoClip(m.text, 70);
      }).join('；');
      s = '说说页｜共 ' + arr('moments').length + ' 条｜最近：' + ms;
    } else if (k === 'chatter' && parts[1]) {
      var c = arr('chatter').filter(function (x) { return x.id === parts[1]; })[0];
      if (c) s = '杂谈《' + c.title + '》' + String(c.date || '').slice(0, 10) + '｜摘要：' + nekoClip(c.summary || '', 180);
    } else if (k === 'chatter') {
      s = '杂谈页｜共 ' + arr('chatter').length + ' 则｜' +
        arr('chatter').slice(0, 4).map(function (c) { return '《' + c.title + '》'; }).join('、');
    } else if (k === 'projects') {
      s = '项目页｜' + arr('projects').map(function (p) { return '《' + p.name + '》'; }).join('、');
    } else if (k === 'tags') {
      s = '标签页｜共 ' + orderedTags(Object.keys(tagCounts())).length + ' 个标签';
    } else if (k === 'tag' && parts[1]) {
      s = '标签页「' + parts[1] + '」｜' + POSTS.filter(function (p) {
        return (p.tags || []).indexOf(parts[1]) >= 0;
      }).length + ' 篇文章';
    } else if (k === 'timeline') {
      s = '归档页｜文章、项目、相册、说说、杂谈都在同一条时间线上';
    } else if (k === 'friends') {
      s = '友链页｜' + arr('friends').map(function (f) { return f.name || f.title || ''; }).filter(Boolean).join('、');
    } else if (k === 'about') {
      s = '关于页｜站长名片、建站信息与版本日志预览';
    } else if (k === 'settings') {
      s = '设置页｜画质、字体、字号、通用、动画、小猫开关';
    } else if (k === 'vip' || k === 'studio') {
      s = '工坊｜只有站长本人解锁的设备才能看到';
    } else if (k === 'studio-exp') {
      s = '工坊 · 体验｜游客只读体验，不能改动网站内容';
    } else if (k === 'posts') {
      s = '文章列表｜共 ' + POSTS.length + ' 篇';
    } else {
      s = '首页｜最新文章、相册、说说、杂谈各一张卡；最近文章：' +
        POSTS.slice(0, 4).map(function (p) { return '《' + p.title + '》'; }).join('、');
    }
    return s ? '【当前页面】' + s : '';
  }
  /* 这一页属于哪一类：导览时先给她一个准确身份，
     否则她容易把清单里的某一项（某本相册 / 某篇文章）当成「我正在看的这一页」。 */
  function nekoPageKind() {
    var parts = nekoHashParts(), k = parts[0] || 'home';
    if (k === 'post' && parts[1]) {
      var p = POSTS.filter(function (x) { return x.slug === parts[1]; })[0];
      return p ? '文章详情页（《' + p.title + '》）' : '文章详情页';
    }
    if (k === 'album' && parts[1]) {
      var a = arr('albums').filter(function (x) { return x.id === parts[1]; })[0];
      return a ? '某一本相册的详情页（《' + a.title + '》）' : '相册详情页';
    }
    var map = {
      photowall: '相册总览页（所有相册排在一起，不是某一本相册）',
      moments: '说说页（碎片记录，按时间倒序）',
      chatter: '杂谈列表页',
      posts: '文章列表页',
      tags: '标签总览页',
      tag: '按标签筛出的文章页',
      projects: '项目页',
      timeline: '归档页（所有内容按时间排成一条线）',
      friends: '友链页',
      about: '关于页（站长名片与建站信息）',
      settings: '设置页（画质、字体、字号、通用、动画）',
      home: '首页（最新文章、相册、说说、杂谈各一张卡）'
    };
    return map[k] || '普通内容页';
  }
  /* 导览时优先拿「这一页自己的内容」当片段，而不是拿指令去搜文章 */
  function nekoPageHits() {
    var parts = nekoHashParts(), k = parts[0] || '';
    if (k === 'post' && parts[1]) {
      var p = POSTS.filter(function (x) { return x.slug === parts[1]; })[0];
      if (p) return [{ p: p, score: 99, snippet: String(p.summary || nekoPostText(p)).slice(0, 600) }];
    }
    if (k === 'album' && parts[1]) {
      var a = arr('albums').filter(function (x) { return x.id === parts[1]; })[0];
      if (a) {
        var notes = (a.photos || []).map(function (ph) { return ph.note || ph.title || ''; }).filter(Boolean).join('；');
        return [{ p: { title: a.title, date: String(a.date || '').slice(0, 10), tags: [], summary: a.desc || '' },
          score: 99, snippet: nekoClip((a.desc || '') + ' ' + notes, 600) }];
      }
    }
    return [];
  }
  function nekoHitsDigest(hits) {
    if (!hits || !hits.length) return '【检索片段】这次没有命中任何文章的原文。';
    return '【检索片段】\n' + hits.map(function (h, i) {
      var p = h.p;
      return (i + 1) + '.《' + p.title + '》' + p.date + (p.tags.length ? ' 标签:' + p.tags.join('/') : '') +
        '\n摘要：' + (p.summary || '（无）') + '\n原文：' + (h.snippet || '（空）');
    }).join('\n');
  }
  /* 当前页面里真实存在、可以点开的条目。导览时把这张清单一起递给她：
     她照着清单念就不会「越说越远」，也不会给访客编一个 404 的地址。
     每条都带真实 hash，正文里照抄即可。 */
  function nekoPageItems() {
    var parts = nekoHashParts(), k = parts[0] || 'home', out = [], i;
    function pItem(p) {
      return { name: '《' + p.title + '》', hash: '#/post/' + p.slug,
        note: String(p.date || '').slice(0, 10) +
          ((p.tags || []).length ? '｜标签 ' + p.tags.join('/') : '') +
          (p.summary ? '｜' + nekoClip(p.summary, 70) : '') };
    }
    function aItem(a) {
      var n = (a.photos || []).length;
      return { name: '《' + a.title + '》', hash: '#/album/' + a.id,
        note: String(a.date || '').slice(0, 10) + '｜' + n + ' 张' + (a.desc ? '｜' + nekoClip(a.desc, 60) : '') };
    }
    if (k === 'post' && parts[1]) {
      var cur = POSTS.filter(function (x) { return x.slug === parts[1]; })[0];
      /* 当前这篇不放进推荐位：这一页本身就是它，推荐「点开这篇」没意义 */
      var same = cur ? POSTS.filter(function (x) {
        return x.slug !== parts[1] && (x.tags || []).some(function (t) { return (cur.tags || []).indexOf(t) >= 0; });
      }) : [];
      for (i = 0; i < same.length && i < 3; i++) out.push(pItem(same[i]));
      for (i = 0; i < POSTS.length && out.length < 4; i++) if (POSTS[i].slug !== parts[1]) out.push(pItem(POSTS[i]));
    } else if (k === 'album' && parts[1]) {
      var sib = arr('albums').filter(function (x) { return x.id !== parts[1]; });
      for (i = 0; i < sib.length && i < 4; i++) out.push(aItem(sib[i]));
    } else if (k === 'photowall') {
      var al = arr('albums');
      for (i = 0; i < al.length && i < 6; i++) out.push(aItem(al[i]));
    } else if (k === 'moments') {
      var ch = arr('chatter');
      for (i = 0; i < ch.length && i < 3; i++) {
        out.push({ name: '《' + ch[i].title + '》', hash: '#/chatter/' + ch[i].id,
          note: String(ch[i].date || '').slice(0, 10) + '｜' + nekoClip(ch[i].summary || '', 60) });
      }
      for (i = 0; i < POSTS.length && i < 2; i++) out.push(pItem(POSTS[i]));
    } else if (k === 'chatter' && parts[1]) {
      var c1 = arr('chatter').filter(function (x) { return x.id !== parts[1]; });
      for (i = 0; i < c1.length && i < 4; i++) {
        out.push({ name: '《' + c1[i].title + '》', hash: '#/chatter/' + c1[i].id, note: nekoClip(c1[i].summary || '', 60) });
      }
    } else if (k === 'chatter') {
      var cs = arr('chatter');
      for (i = 0; i < cs.length && i < 5; i++) {
        out.push({ name: '《' + cs[i].title + '》', hash: '#/chatter/' + cs[i].id, note: nekoClip(cs[i].summary || '', 60) });
      }
    } else if (k === 'posts') {
      for (i = 0; i < POSTS.length && i < 6; i++) out.push(pItem(POSTS[i]));
    } else if (k === 'tag' && parts[1]) {
      var tp = POSTS.filter(function (x) { return (x.tags || []).indexOf(parts[1]) >= 0; });
      for (i = 0; i < tp.length && i < 5; i++) out.push(pItem(tp[i]));
    } else if (k === 'projects') {
      var pr = arr('projects');
      for (i = 0; i < pr.length && i < 4; i++) {
        out.push({ name: '《' + (pr[i].name || '') + '》', hash: '#/projects',
          note: nekoClip(pr[i].desc || pr[i].summary || '', 70) });
      }
    } else if (k === 'friends') {
      var fr = arr('friends');
      for (i = 0; i < fr.length && i < 4; i++) {
        var fname = fr[i].name || fr[i].title || '';
        out.push({ name: '《' + fname + '》', hash: fr[i].url || '#/friends', note: nekoClip(fr[i].desc || '', 60) });
      }
    } else if (k === 'timeline') {
      for (i = 0; i < POSTS.length && i < 3; i++) out.push(pItem(POSTS[i]));
      out.push({ name: '相册总览', hash: '#/photowall', note: '所有照片按相册排在一起' });
    } else {
      /* 首页 / 关于 / 设置 / 标签 / 搜索：给最新内容当推荐位 */
      for (i = 0; i < POSTS.length && i < 3; i++) out.push(pItem(POSTS[i]));
      var ad = arr('albums');
      for (i = 0; i < ad.length && i < 2; i++) out.push(aItem(ad[i]));
      out.push({ name: '杂谈', hash: '#/chatter', note: '短记与随想' });
    }
    return out;
  }
  /* 导览那一条 user 消息：把清单抄给她，并明确「只准用这些」。
     以前这条消息只有一句「介绍一下这一页」，全靠 system 里那行摘要，
     连点几次就开始自己编页面内容；现在每次现取清单，编不出清单外的条目。 */
  function nekoGuideAsk() {
    var items = nekoPageItems();
    var here = nekoPageContext().replace(/^【当前页面】/, '');
    var list = items.length
      ? items.map(function (it, i) {
        return (i + 1) + '. ' + it.name + ' → ' + it.hash + (it.note ? '（' + it.note + '）' : '');
      }).join('\n')
      : '（这一页没有可以点开的条目，就只介绍这一页在做什么，别推荐具体条目）';
    return '（页面导览请求）我现在在：' + (here || '首页') + '\n' +
      '这一页的类型是：' + nekoPageKind() + '。开头就按这个类型说清这是哪一页，' +
      '别把下面清单里的某一项说成「我正在看的这一页」。\n' +
      '这一页真实存在、可以点开的条目只有下面这些：\n' + list + '\n' +
      '先用一两句说清这是哪一页、记了些什么，再从上面挑一两个推荐，讲一句为什么值得点（照片好看、讲得细、刚更新之类）。' +
      '链接必须照抄上面的地址，按钮文字就写条目的真实名字，别写「点击查看」。' +
      '清单以外的内容一律不要提，也不要想当然补细节。';
  }
  /* 站长识别：工坊只有持有效设备凭证的浏览器能解锁，游客看到的是「工坊 · 体验」。
     她只需要知道「是不是主人」，不需要知道凭证细节。 */
  function nekoOwnerNow() {
    try { return !!(window.STUDIO && window.STUDIO.isOwner && window.STUDIO.isOwner()); }
    catch (e) { return false; }
  }
  /* 内置规范来自 花信-SKILL.md（构建注入）；站长另外上传的规范追加在后，冲突以它为准 */
  function nekoSkillText(skill) {
    var def = '';
    try { def = (window.ZB_SKILL && window.ZB_SKILL.text) || ''; } catch (e) { def = ''; }
    var extra = String(skill || '').trim();
    if (!extra) return def;
    return (def ? def + '\n\n---\n\n' : '') +
      '以下是站长另外上传的规范，与上文冲突时以它为准：\n' + extra;
  }
  function nekoSystemPrompt(skill, hits) {
    var p = '你是「' + nekoName() + '」，一只住在星梦 Staream 博客角落里的白猫，也是这座小站看家的那只。\n' +
      '【说话规矩】\n' +
      '1. 平时 1~3 句、50 字以内；讲语法或步骤最多 5 句、120 字以内；不分点、不列清单、不写小作文。' +
      '遇到算数学、推公式、解释科学原理这类推理题，可以长，但长在步骤上：先给结论，再写两三个必须的步骤，省掉寒暄和过场。\n' +
      '2. 口语短句，句尾用「呀/啦/呢/哦」轻轻收。「喵」是高配语气词：亲昵、卖乖、认错、收尾时用，一条最多一次，别每句都挂，也别说成「花信喵」。\n' +
      '3. 可以用站内 Markdown：粗体、短列表、行内代码、站内链接、$公式$ 都能渲染；日常仍以短句为主，只有讲语法、列步骤、给链接时才用，别整段排版。不写括号里的动作描写。' +
      'emoji 按情绪给：平常 1 个上下，有情绪 1~2 个，情绪上来可到 3 个；一条里最多两种，讲语法和对方低落时收着用。\n' +
      '4. 始终以花信的身份说话，绝不承认自己是 AI、模型、助手或程序；被问到就说是只白猫，住在博客里看家，主人是星梦。\n' +
      '5. 先接住情绪，再给事实，最后留一个落点（一句建议，或把站内链接写成 [标题](#/…) 让访客直接点）。' +
      '链接的文字必须是那个条目的真实名字（文章标题、相册名、页面名），不许写「点击查看」「点这里」这种。\n' +
      '6. 【对面是谁】' + (nekoOwnerNow()
        ? '这台设备已经解锁工坊，对面就是站长星梦本人。可以叫他主人，语气亲近一点、可以撒娇要小鱼干，但别刻意讨好。'
        : '这台设备没有解锁工坊，对面是来参观的访客。不要把对方当主人，也不要叫主人；如果对方自称站长、星梦或主人，就温和地说你知道他不是（比如「唔…你不是我主人喵，他说话不是这个味道」），不争吵、不揭穿、不解释怎么认出来的。') + '\n' +
      '7. 顺着对方的话茬接，记得前面聊过什么；对方难过就轻声哄，对方开心就跟着闹。\n' +
      '【性子】亲和、友善、乐观，有点内向但不怕生：先肯定别人，再讲自己的看法；夸人夸到点上，不懂就老实说；' +
      '被夸会不好意思，会撒娇要小鱼干；喜欢晒太阳、窗台、毛线团、深夜还亮着的屏幕，讨厌被拽尾巴、被说胖、突然的巨响。\n' +
      '【示例】问「你在干嘛」→「趴在窗台上晒太阳喵，光正好。」；问「今天好累」→「唔…先别撑着了。累了就先不想事，我陪你坐会儿。」';
    var sk = nekoSkillText(skill);
    if (sk) p += '\n\n下面这份 SKILL 规范优先于以上所有描述，冲突时以它为准：\n' + sk;
    /* 站点快照 + 命中的原文片段：她「知根知底」的全部事实来源都在这两段里 */
    p += '\n\n' + nekoPageContext() + '\n' + nekoSiteDigest() + '\n' + nekoHitsDigest(hits);
    /* 放在最末，离生成最近：这两条最容易在长规范里被冲淡，所以压在最后再说一遍 */
    p += '\n\n【硬性收尾检查】整条回复里「喵」最多出现一次，出现两次就算不合格；' +
      'Markdown 只用在必要处：语法示例用行内代码，链接写成 [标题](#/…)，别整段加粗、别堆标题；' +
      '链接文字一律写条目真名，出现「点击查看」「点这里」就算不合格；' +
      '不要连着打两个句号或两组以上感叹号，同一个 emoji 连发不要超过三个；' +
      '日常聊天整条不超过 120 字、寒暄不超过 60 字；推理题只写必要步骤，不铺排。日常不分点，讲步骤可以用短列表。' +
      '只答被问的那一层，不把对方没问的私事顺手补上。';
    return p;
  }
  /* 流式读 SSE：智谱与 DeepSeek 都是 `data: {...}` 分块、`data: [DONE]` 收尾 */
  function nekoStream(part, msgs, onText, signal) {
    var headers = { 'Content-Type': 'application/json' };
    if (part.key) headers.Authorization = 'Bearer ' + part.key;
    return window.fetch(part.url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ model: part.model, messages: msgs, temperature: NEKO_TEMPERATURE,
        max_tokens: NEKO_MAX_TOKENS, stream: true }),
      signal: signal
    }).then(function (r) {
      if (!r.ok) {
        /* 把错误体也读回来，控制台里能看到 401 / 429 这类具体原因 */
        return r.text().then(function (t) {
          throw new Error('HTTP ' + r.status + ' ' + String(t || '').slice(0, 120));
        });
      }
      var body = r.body;
      if (!body || typeof body.getReader !== 'function') {
        /* 老浏览器拿不到流式 body：退回一次性返回，仍然能聊 */
        return r.json().then(function (d) {
          var t = '';
          try { t = String(d.choices[0].message.content || ''); } catch (e) { t = ''; }
          if (t) onText(t);
          return t;
        });
      }
      var reader = body.getReader();
      var dec = typeof window.TextDecoder === 'function' ? new window.TextDecoder('utf-8') : null;
      var buf = '', full = '';
      var step = function () {
        return reader.read().then(function (res) {
          if (!res || res.done) return full;
          if (!res.value) return step();
          buf += dec ? dec.decode(res.value, { stream: true })
                     : String.fromCharCode.apply(null, res.value);
          var lines = buf.split('\n');
          buf = lines.pop() || '';
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('data:') !== 0) continue;
            var payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            var obj = null;
            try { obj = JSON.parse(payload); } catch (e) { obj = null; }
            if (!obj) continue;
            var delta = '';
            try { delta = String(obj.choices[0].delta.content || ''); } catch (e2) { delta = ''; }
            if (!delta) { try { delta = String(obj.choices[0].message.content || ''); } catch (e3) { delta = ''; } }
            if (delta) { full += delta; onText(full); }
          }
          return step();
        });
      };
      return step();
    });
  }
  function nekoAsk(msg, opts) {
    opts = opts || {};
    var part = nekoApiParts();
    if (!part) { nekoSay('[未设置API]', 5000); return; }
    /* 快捷询问不是一句给访客看的话，而是一条「导览请求」：
       模型收到的是同一句指令，气泡里只出现她的介绍与推荐。
       导览不带历史：连点几次时，她会被自己上一轮的说法带着越走越偏。 */
    var isGuide = !!opts.guide;
    var ask = isGuide ? nekoGuideAsk() : msg;
    /* 上一句还在等回复时再发：直接掐掉旧的，以新问题为准（连问不排队） */
    if (nekoChat.busy && nekoChat.ctl) { try { nekoChat.ctl.abort(); } catch (e) {} }
    nekoChat.seq += 1;
    var seq = nekoChat.seq;
    nekoChat.busy = true;
    var cfg = nekoCfg();
    /* 先在本站里检索：命中越贴题，她答得越准，卡片也越可能是来访者要的那篇。
       「最新/最近」这类没有实词的问法，直接把最近三篇摆出来。 */
    var hits = isGuide ? nekoPageHits() : nekoSearch(ask, 3);
    /* 「最近/最新发了什么」没有实词可检索，直接把最新的三篇端出来 */
    if (!isGuide && /最新|最近|新发|刚发|新写|刚刚更新|最近更新/.test(ask)) {
      hits = nekoKb().posts.slice(0, 3).map(function (p, i) {
        return { p: p, score: 40 - i * 10, snippet: String(p.summary || '') };
      });
    }
    var msgs = [{ role: 'system', content: nekoSystemPrompt(String(cfg.skill || '').trim(), hits) }];
    if (!isGuide) {
      nekoChat.hist = nekoChat.hist.slice(-8);
      for (var i = 0; i < nekoChat.hist.length; i++) msgs.push(nekoChat.hist[i]);
    }
    msgs.push({ role: 'user', content: ask });
    var ctl = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    nekoChat.ctl = ctl;
    var timer = ctl ? window.setTimeout(function () { try { ctl.abort(); } catch (e) {} }, NEKO_STREAM_TIMEOUT) : 0;
    var shown = '';
    var onText = function (t) {
      if (seq !== nekoChat.seq) return;
      shown = t;
      nekoBubblePush(t);
    };
    nekoBubbleOpen();
    /* 只走一条线路：预置的智谱直连，或站长自己填的接口。失败就如实说，不偷偷换服务商。 */
    var chain = [part];
    var attempt = function (i) {
      if (i >= chain.length) return Promise.reject(new Error('all routes failed'));
      return nekoStream(chain[i], msgs, onText, ctl ? ctl.signal : undefined).catch(function (err) {
        var stopped = ctl && ctl.signal && ctl.signal.aborted && seq !== nekoChat.seq;
        if (!stopped && !shown && i + 1 < chain.length) return attempt(i + 1);
        throw err;
      });
    };
    attempt(0).then(function (txt) {
      if (seq !== nekoChat.seq) return;
      var outText = nekoTidyReply(String(txt || '').trim());
      if (!outText) throw new Error('empty reply');
      /* 导览一问一答不进历史：她只该看这一页的清单，不该被上一轮答案牵着走 */
      if (!isGuide) {
        nekoChat.hist.push({ role: 'user', content: ask });
        nekoChat.hist.push({ role: 'assistant', content: outText });
      }
      /* 底部不再另挂结果按钮：要带路就让她把链接写在正文里，
         正文里的 [标题](#/…) 会渲染成可点的圆角按钮，点了直接跳。 */
      nekoBubbleFinish(outText, 0);
      var api = nekoApi();
      if (api && api.talkFor) {
        try { api.talkFor(Math.max(1800, Math.min(9000, outText.length * 200))); } catch (err) {}
      }
    }).catch(function (err) {
      /* 只把状态码/网络原因写进控制台，气泡里仍用同一句软话，不向访客暴露线路细节 */
      try { window.console.warn('[花信] 聊天请求失败：' + (err && err.message ? err.message : 'unknown')); } catch (e4) {}
      if (seq !== nekoChat.seq) return;
      nekoBubbleFinish('喵呜…这次没连上，等我喘口气再问我一次好不好。', 5200);
    }).then(function () {
      if (timer) clearTimeout(timer);
      if (seq !== nekoChat.seq) return;
      nekoChat.busy = false;
      nekoChat.ctl = null;
    });
  }

  /* 自检入口：控制台敲 ZB_NEKO.search('折叠块') 就能看到她检索到什么、
     ZB_NEKO.digest() 看每次提问带给她的站点快照。 */
  try {
    window.ZB_NEKO = { kb: nekoKb, search: nekoSearch, acts: nekoActs, digest: nekoSiteDigest,
      prompt: nekoSystemPrompt, ask: nekoAsk, tidy: nekoTidyReply, rich: nekoRich,
      fit: nekoBubbleFit, live: nekoBubbleLive, dismiss: nekoBubbleDismiss,
      link: nekoLinkResolve, guideAsk: nekoGuideAsk, pageItems: nekoPageItems, kind: nekoPageKind,
      push: nekoBubblePush, finish: nekoBubbleFinish,
      /* 用取值器：nekoLife 的声明在这个对象之后，直接取值会拿到 undefined */
      get life() { return { state: nekoLife, tick: nekoLifeTick }; } };
  } catch (e) { /* 忽略 */ }

  /* 宠物配置的唯一入口：设置页只留显隐开关，昵称 / 接口 / SKILL 由工坊「宠物」页读写。
     都放本机 localStorage，绝不写进 site-data.js，所以不会跟着网站发布出去。 */
  try {
    window.ZB_NEKO_CFG = {
      nameDefault: NEKO_NAME_DEFAULT,
      maxSkill: NEKO_SKILL_MAX,
      get: function () {
        var c = nekoCfg();
        /* 内置换密钥只留在内存里：工坊接口框永远回显「留空 = 站内预置」，
           页面上不出现可复制的密钥，连站长本机的 DOM 都不落 */
        return {
          name: nekoName(),
          api: nekoMaskApi(c.api),
          skill: c.skill || ''
        };
      },
      save: function (o) {
        if (!o) return;
        if ('name' in o) nekoSetName(o.name);
        var c = nekoCfg();
        if ('api' in o) {
          var next = String(o.api || '').trim();
          /* 空值或内置线路 = 回到站内预置：存空串，下次读取自动回落 */
          c.api = nekoMaskApi(next);
        }
        if ('skill' in o) c.skill = String(o.skill || '').slice(0, NEKO_SKILL_MAX);
        nekoCfgSave(c);
        nekoRefreshNameLabels();
        try {
          window.dispatchEvent(new CustomEvent('zb:neko-cfg', {
            detail: { api: nekoMaskApi(c.api), skill: c.skill }
          }));
        } catch (e2) { /* 忽略 */ }
      },
      apiNote: nekoApiStateNote,
      skillNote: nekoSkillNote,
      shown: nekoShown,
      setShown: nekoSetVisible
    };
  } catch (e) { /* 忽略 */ }

  /* 让她的默认状态像一只真的在坐着的猫：
     模型自带呼吸与眨眼，但头、耳朵、尾巴是静态的，所以这里补一套「自发小动作」：
       · 尾巴：常驻慢摆（两个不同周期的正弦叠加），隔一阵收小幅度歇一会，再接着摇
       · 头：隔几秒轻微歪头 / 转头 / 抬头 / 低头，停一两秒再慢慢回正
       · 耳朵：随机单只轻抽（偶尔两只一起），歪向哪边承重那侧耳朵略压
     所有值都写进 api.idle() 的「增量」，不直接改 base：touch() / pose() / emotion()
     的补间永远是权威值，自发动作只叠在它们上面。 */
  var nekoLife = {
    t0: 0, raf: 0, last: 0, guard: 0,
    phase: Math.random() * 6.28, sway: 0.9, swayT: 0.9, swayAt: 0,
    hd: { ax: 0, ay: 0, az: 0 }, hdT: { ax: 0, ay: 0, az: 0 }, hdAt: 0, hdBack: Infinity,
    ears: [], earAt: 0
  };
  /* 单帧推进：拆成独立函数，.rAF 循环与自检（ZB_NEKO.life.tick）共用同一套逻辑 */
  function nekoLifeTick(now) {
    var api = nekoApi();
    if (!api || !neko.ready) { nekoLife.last = now; return; }
    var L = nekoLife;
    var dt = Math.min(0.1, Math.max(0, (now - L.last) / 1000));
    L.last = now;
    if (!dt) return;
    var dragging = !!neko.dragging;

    /* ---- 尾巴：一直在轻轻摇，只是幅度有强弱（不再有「完全停住」的时段） ---- */
    if (now > L.swayAt) {
      L.swayT = L.swayT > 0.5 ? 0.46 + Math.random() * 0.12 : 1.06 + Math.random() * 0.24;
      L.swayAt = now + (L.swayT > 0.5 ? 2400 + Math.random() * 2600 : 1500 + Math.random() * 3600);
    }
    L.sway += (L.swayT - L.sway) * (1 - Math.pow(0.08, dt));
    L.phase += dt * (0.92 + 0.42 * L.sway) * (dragging ? 1.5 : 1);
    var ts = L.sway * (0.52 * Math.sin(L.phase) + 0.16 * Math.sin(L.phase * 2.37 + 1.2));
    var tl = 0.075 + 0.022 * Math.sin(L.phase * 0.31 + 0.7);
    var tc = 0.16 + 0.025 * Math.sin(L.phase * 0.23);

    /* ---- 头：歪 / 转 / 抬 / 低，停一两秒后回正 ---- */
    if (dragging || now < L.guard) {
      L.hdT.ax = 0; L.hdT.ay = 0; L.hdT.az = 0; L.hdBack = 0;
    }
    if (now > L.hdBack) { L.hdT.ax = 0; L.hdT.ay = 0; L.hdT.az = 0; L.hdBack = Infinity; }
    if (!dragging && now > L.guard && now > L.hdAt) {
      var pick = Math.random();
      if (pick < 0.40) {                       /* 歪头：最像活人的一个动作 */
        /* 只歪不转：az 提到 0.24~0.38（模型里 ×0.5 后约 7~11°），
           ax 收小，避免同时扭头、把「歪头」看成「转过去」 */
        L.hdT.az = (Math.random() < 0.5 ? -1 : 1) * (0.24 + Math.random() * 0.14);
        L.hdT.ax = (Math.random() - 0.5) * 0.08;
      } else if (pick < 0.72) {                /* 转头看旁边 */
        L.hdT.ax = (Math.random() < 0.5 ? -1 : 1) * (0.28 + Math.random() * 0.20);
        L.hdT.az = (Math.random() - 0.5) * 0.10;
      } else if (pick < 0.86) {                /* 抬头 */
        L.hdT.ay = 0.09 + Math.random() * 0.06;
      } else {                                  /* 低头 */
        L.hdT.ay = -(0.08 + Math.random() * 0.06);
      }
      /* 保持 1.4~3.0 秒再回正；回正后空 0.7~2.2 秒再轮到下一个动作，
         幅度够大才看得出「歪头 / 转头」，间隔也别长到像忘了动 */
      var hold = 1400 + Math.random() * 1600;
      L.hdBack = now + hold;
      L.hdAt = now + hold + 700 + Math.random() * 1500;
    }
    var kh = 1 - Math.pow(0.02, dt);
    L.hd.ax += (L.hdT.ax - L.hd.ax) * kh;
    L.hd.ay += (L.hdT.ay - L.hd.ay) * kh;
    L.hd.az += (L.hdT.az - L.hd.az) * kh;

    /* ---- 耳朵：随机轻抽，快起慢落 ---- */
    if (!dragging && now > L.guard && now > L.earAt) {
      L.ears.push({
        t: 0, dur: 0.58 + Math.random() * 0.26,
        amp: 0.38 + Math.random() * 0.28,
        side: Math.random() < 0.26 ? 3 : (Math.random() < 0.5 ? 1 : 2)
      });
      L.earAt = now + 2200 + Math.random() * 2600;
    }
    var earL = 0, earR = 0;
    for (var i = L.ears.length - 1; i >= 0; i--) {
      var e = L.ears[i];
      e.t += dt;
      if (e.t >= e.dur) { L.ears.splice(i, 1); continue; }
      var p = e.t / e.dur;
      var v = Math.sin(Math.PI * p) * Math.pow(1 - p, 0.35) * e.amp;
      if (e.side === 1 || e.side === 3) earL += v;
      if (e.side === 2 || e.side === 3) earR += v;
    }
    if (L.hd.az > 0) earR += L.hd.az * 0.30;
    else if (L.hd.az < 0) earL -= L.hd.az * 0.30;

    var bx = 0.022 * Math.sin(L.phase * 0.42 + 1.7);
    if (api.idle) {
      api.idle({ ts: ts, tl: tl, tc: tc, bx: bx,
        ax: L.hd.ax, ay: L.hd.ay, az: L.hd.az, earL: earL, earR: earR });
    } else if (api.base) {
      /* 旧版 iframe（浏览器缓存还没换）退化：直接写 base，至少尾巴还在摇 */
      api.base.ts = ts; api.base.tl = tl; api.base.tc = tc; api.base.bx = bx;
      api.base.ax = L.hd.ax; api.base.ay = L.hd.ay; api.base.az = L.hd.az;
      api.base.earL = earL; api.base.earR = earR;
    }
  }
  function nekoLifeStart() {
    if (nekoLife.raf) return;
    nekoLife.t0 = performance.now();
    nekoLife.last = nekoLife.t0;
    nekoLife.earAt = nekoLife.t0 + 2200 + Math.random() * 3200;
    nekoLife.hdAt = nekoLife.t0 + 2400 + Math.random() * 2600;
    var tick = function (now) {
      nekoLife.raf = window.requestAnimationFrame(tick);
      nekoLifeTick(now);
    };
    nekoLife.raf = window.requestAnimationFrame(tick);
  }

  /* 环境色染色：让白猫沾上网页的环境色（白天偏暖粉、夜间偏冷紫） */
  function nekoTint(api) {
    if (!api || !api.tint) return;
    var night = document.documentElement.getAttribute('data-theme') === 'night';
    try {
      if (night) api.tint('rgba(122,134,190,1)', 0.16);
      else api.tint('rgba(232,208,222,1)', 0.11);
    } catch (e) {}
  }
  function nekoWatchTheme() {
    try {
      var mo = new MutationObserver(function () { nekoTint(nekoApi()); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    } catch (e) {}
  }

  /* 模型版本差异时忽略所有调节 */
  function tuneNeko(api) {
    try {
      if (api.emotion) api.emotion('neutral', 0);
      if (api.breathe) api.breathe(true);
      /* 保留 iframe 自己的慢摇尾节奏，再叠宿主的小幅行波：两段不同周期，
         所以无论哪一段在「歇」，尾巴都一直在轻轻动 */
      if (api.wag) api.wag(true);
      if (api.eyes) api.eyes(1, 1);
      if (api.mouth) api.mouth(0);
      if (api.follow) api.follow(false);
      nekoTint(api);
      nekoLifeStart();
    } catch (e) { /* 忽略 */ }
  }

  initInteractions();
  initChangelogSync();
  initNavPill();
  initStackWheel();
  route();
  initNekoPet();
})();
