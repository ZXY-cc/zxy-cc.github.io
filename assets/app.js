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
  function renderTags() {
    var counts = {};
    POSTS.forEach(function (p) { (p.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var names = orderedTags(Object.keys(counts));
    return pageHead('标签', '把相近的文章放在一起', 'TAGS') +
      '<p class="page-note">共 ' + names.length + ' 个标签</p>' +
      '<div class="tag-cloud glass reveal">' + names.map(function (t) {
        return '<a class="tag" href="#/tag/' + encodeURIComponent(t) + '">' + esc(t) +
          '<span class="tag-count">' + counts[t] + '</span></a>';
      }).join('') + '</div>';
  }

  /* ---------- 项目 ---------- */
  function renderProjects() {
    var list = arr('projects');
    if (!list.length) return pageHead('项目', '做过的和正在做的', 'PROJECTS') + '<p class="page-note">还没有项目。</p>';
    return pageHead('项目', '做过的和正在做的', 'PROJECTS') +
      '<div class="card-grid">' + list.map(function (p) {
        return '<article class="x-card glass sheen reveal">' +
          '<div class="x-card-top"><span class="x-badge">' + esc(p.status || '记录') + '</span>' +
          '<time>' + esc(p.date || '') + '</time></div>' +
          '<h2>' + esc(p.name) + '</h2><p>' + esc(p.desc) + '</p>' +
          '<div class="x-chips">' + orderedTags(p.tags || []).map(function (t) {
            return '<span>' + esc(t) + '</span>';
          }).join('') + '</div>' +
          (p.link ? '<a class="x-link" href="' + esc(p.link) + '">去看看 →</a>' : '') +
          '</article>';
      }).join('') + '</div>';
  }

  /* ---------- 归档时间轴 ---------- */
  function renderTimeline() {
    var all = POSTS.slice();
    var counts = {};
    all.forEach(function (p) { (p.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var names = orderedTags(Object.keys(counts)).slice(0, 14);
    var filters = '<div class="filter-row reveal"><button class="filter' +
      (timelineTag ? '' : ' on') + '" type="button" data-tfilter="">全部</button>' +
      names.map(function (t) {
        return '<button class="filter' + (timelineTag === t ? ' on' : '') +
          '" type="button" data-tfilter="' + esc(t) + '">' + esc(t) + ' <i>' + counts[t] + '</i></button>';
      }).join('') + '</div>';
    var shown = timelineTag ? all.filter(function (p) {
      return (p.tags || []).indexOf(timelineTag) >= 0;
    }) : all;
    return pageHead('归档', '总计 ' + all.length + ' 篇文章，按时间排好', 'ARCHIVE') +
      statHtml() + filters + timelineBody(all, shown);
  }
  /* 归档时间轴列表：整页渲染与标签局部刷新共用 */
  function timelineBody(all, shown) {
    var groups = {}, order = [];
    shown.forEach(function (p) {
      var k = String(p.date || '').slice(0, 7) || '未标日期';
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(p);
    });
    return '<div class="timeline">' + order.map(function (k) {
      return '<section class="tl-group reveal"><div class="tl-month"><b>' + esc(k) + '</b><span>' +
        groups[k].length + ' 篇</span></div><div class="tl-items">' +
        groups[k].map(function (p) {
          return '<a class="tl-item glass" href="#/post/' + encodeURIComponent(p.slug) + '">' +
            '<time>' + esc(p.date) + '</time><b>' + esc(p.title) + '</b>' +
            '<span>' + orderedTags(p.tags || []).map(function (t) { return '#' + esc(t); }).join(' ') + '</span></a>';
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
    var all = POSTS.slice();
    var shown = timelineTag ? all.filter(function (p) {
      return (p.tags || []).indexOf(timelineTag) >= 0;
    }) : all;
    tl.outerHTML = timelineBody(all, shown);
    observeReveal();
  }

  /* ---------- 相册 ---------- */
  function renderPhotowall() {
    var albums = arr('albums');
    if (!albums.length) return pageHead('相册', '定格过的光', 'GALLERY') + '<p class="page-note">还没有相册。</p>';
    return pageHead('相册', '定格时间，也定格当时的天色', 'GALLERY') +
      '<p class="page-note">共 ' + albums.length + ' 个相册 · ' + photoCount() + ' 张照片</p>' +
      '<div class="album-grid">' + albums.map(function (a) {
        var n = (a.photos || []).length;
        /* Kirameku 式堆叠封面：最新三张，最新一张在最上层，底层往上错位露角；
           竖版照片集按原比例竖版显示（is-v → 3:4），横版保持 4:3 */
        var v = albumOrient(a) === 'v';
        return '<a class="album-card' + (v ? ' is-v' : '') + ' glass sheen reveal" href="#/album/' + encodeURIComponent(a.id) + '">' +
          '<div class="album-stack">' + stackCovers(a.photos, a.title) +
          '<span class="album-count">' + n + ' 张</span></div>' +
          '<div class="album-info"><h2>' + esc(a.title) + '</h2><p>' + esc(a.desc) + '</p>' +
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
          '<img src="' + esc(p.src) + '" alt="' + esc(p.title || '') + '" loading="lazy" decoding="async">' +
          '<span class="photo-cap"><i>' +
          esc(cap) + (p.date ? ' <em>· ' + esc(String(p.date).slice(0, 10)) + '</em>' : '') +
          '</i></span>' +
          '</button>';
      }).join('') + '</div>';
  }

  /* ---------- 说说 ---------- */
  function renderMoments() {
    var list = arr('moments');
    if (momentOrder === 'old') list.reverse();
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
          return '<img src="' + esc(src) + '" alt="说说的配图" loading="lazy" decoding="async">';
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
    var list = arr('moments');
    if (momentOrder === 'old') list.reverse();
    ml.outerHTML = momentsBody(list);
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
  function changelogPreview() {
    var meta = window.CHANGELOG_META || {};
    var frame = window.CHANGELOG_HTML
      ? '<iframe class="cl-frame" id="cl-frame" title="博客版本日志 HTML 预览" loading="lazy"></iframe>'
      : '<p class="page-note">版本日志尚未生成。</p>';
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
      }).join('') + '</div>' +
      '<div class="about-social">' + (CFG.social || []).map(function (s) {
        var ext = /^https?:/.test(s.url || '');
        return '<a href="' + esc(s.url) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') +
          '>' + esc(s.name) + '<i>' + esc(s.note || '') + '</i></a>';
      }).join('') + '</div></div>' +
      '<div class="site-facts glass reveal">' +
      '<div><b>' + esc(founded) + '</b><span>建站日期</span></div>' +
      '<div><b>' + runningDays() + ' 天</b><span>已在线</span></div>' +
      '<div><b>' + POSTS.length + ' / ' + photoCount() + '</b><span>文章 / 照片</span></div>' +
      '<div><b>0</b><span>追踪脚本</span></div></div>' + changelogPreview();
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
  var FONT_CN_OPTS = [{ id: 'default', name: '默认', label: '中文字体' }];
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
      kind === 'tex' ? 'cm' : 'default';
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
  /* 「数字滚动动画」三档：所有 / 部分 / 关闭（默认部分）。
     滚动对象 = 实时计数器（浏览量与点赞量：爱心按钮、名片右上角、文章署名行）。
     「所有」= 两类计数器都滚；「部分」= 仅点赞量滚，浏览量直接显示；
     「关闭」= 全部直接显示。likes.js 的 rollText 每次执行都读同一个键
     （zb-roll-mode），切换立即生效。 */
  var ROLL_MODES = ['all', 'part', 'off'];
  function readRollMode() {
    try {
      var m = window.localStorage ? window.localStorage.getItem('zb-roll-mode') : null;
      if (ROLL_MODES.indexOf(m) >= 0) return m;
    } catch (e) { /* 忽略 */ }
    return 'part';
  }
  function rollModeNote(m) {
    if (m === 'all') return '已选择「所有」：浏览量与点赞量都带逐位滚动动画。';
    if (m === 'off') return '已选择「关闭」：所有数字直接显示，不带滚动动画。';
    return '已选择「部分」：仅点赞量带逐位滚动动画，浏览量直接显示。';
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
      ['all', '所有', '浏览量与点赞量都滚动'],
      ['part', '部分', '仅点赞量滚动'],
      ['off', '关闭', '所有数字直接显示']
    ].map(function (o) {
      var on = o[0] === rmode;
      return '<label class="opt-item"><input type="radio" name="zb-roll-mode" value="' + o[0] +
        '" data-roll-mode' + (on ? ' checked' : '') + '><span><b>' + o[1] + '</b>' +
        (o[0] === 'part' ? '<i>默认</i>' : '') + '<i>' + o[2] + '</i></span></label>';
    }).join('');
    var fontNote = '代码字体选 JetBrains Maple Mono 时，代码里的中文也用它' +
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
      '<p class="settings-foot" id="quick-count-state">' + esc(quickCountNote(quick)) + '</p></div></div></section>' +
      /* 「动画」卡片：数字滚动动画三档 */
      '<section class="settings-card glass reveal" aria-label="动画设置">' +
      '<div class="settings-block stack"><div class="settings-info">' +
      '<h2>动画</h2><p>控制页面里数字的逐位滚动动画。切换后立即生效，偏好只保存在本机。</p></div>' +
      '<div class="settings-sub"><h3>数字滚动动画</h3>' +
      '<p>数字变化时每一位独立滚动（0~9 循环）；控制浏览量与点赞量计数器的滚动动画。</p>' +
      '<div class="opt-group" role="radiogroup" aria-label="数字滚动动画">' + rollOpts + '</div>' +
      '<p class="settings-foot" id="roll-mode-state">' + esc(rollModeNote(rmode)) + '</p></div></div></section>' +
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
      '<span class="q-go">去看看 →</span></a></div></section>';
  }
  /* 把图片地址安全地放进 CSS url("…")：引号、反斜杠、换行一律转义，
     数据 URL 里的 ; , + / = 原样保留（HTML 层再交给 esc） */
  function shotUrl(u) {
    return String(u == null ? '' : u).replace(/["'\\\r\n]/g, function (c) {
      return { '"': '%22', "'": '%27', '\\': '%5C', '\r': '', '\n': '' }[c];
    });
  }
  /* 按日期倒序的照片全部入队：最新一张在最顶层，底层往上错位露角（CSS 端再做景深：
     顶层清晰、第二层略浅、第三层更浅）。照片 cover 铺满层块，圆角由层块统一裁切，
     不再有 contain 露白边的瑕疵线条。换层按队列旋转：只显示最上层前三张，
     第四张起 .stack-deep 隐藏待命，滚轮 / 滑动时随时补位上来（超过三张不再只是三张循环）。 */
  function stackCovers(photos, alt) {
    var list = recentByDate(photos, photos ? photos.length : 0);
    if (!list.length) list = [{ src: avatarSrc() }];
    return list.map(function (p, i) {
      var cls = i === 0 ? 'stack-top' :
        (i === 1 ? 'stack-mid' : (i === 2 ? 'stack-back' : 'stack-deep'));
      return '<div class="' + cls + '" data-stack-layer data-idx="' + i + '" aria-hidden="true" ' +
        'title="' + esc(alt) + '" style="--shot:url(&quot;' + esc(shotUrl(p.src)) + '&quot;)"></div>';
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
      /* 首页与相册都依赖横竖归卡 / is-v 标记，量完任一页面在场就重绘 */
      if (h === '#/' || h === '#' || h === '' || h.indexOf('#/photowall') === 0) route();
    };
    im.onerror = function () { orientMemo[src] = 'h'; };
    im.src = src;
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
              '<div class="q-photo-cap"><b>' + esc(a.title) + '</b><i>' +
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
          '<span class="q-go">阅读全文 →</span>'
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
          '<span class="q-go">去说说页 →</span>'
      };
    }), '最新说说') : qEmpty('q-moment', '#/moments', '还没有说说', '碎片记录会出现在这里');
    var chatterCard = chatters.length ? qCard('q-chatter', chatters.map(function (c) {
      return {
        href: '#/chatter/' + encodeURIComponent(c.id),
        inner: '<div class="q-head">' + qBadge('最新杂谈') +
          '<time>' + esc(String(c.date || '').slice(0, 10)) + '</time></div>' +
          '<h2>' + esc(c.title) + '</h2>' +
          '<p class="q-sum">' + esc(c.summary || '') + '</p>' +
          '<span class="q-go">去杂谈页 →</span>'
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
        return '<article class="x-card glass sheen reveal post-x-card">' +
          '<div class="x-card-top"><span class="x-badge">' +
          esc(orderedTags(p.tags || []).filter(function (t) { return t !== 'A' && t !== 'B' && t !== '⭐'; })[0] || '随笔') +
          '</span>' +
          '<time>' + esc(String(p.date || '').slice(0, 10)) + '</time></div>' +
          '<h2 class="x-title"><a href="#/post/' + encodeURIComponent(p.slug) + '">' + esc(p.title) + '</a></h2>' +
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
  /* ================= 右下角站宠「雪团」 =================
     模型是 51 个部件的 Canvas2D 运行时，隔离在自己的 iframe 里（同一个源，
     所以可以直接调 contentWindow.NekoCat）。宿主这边只做四件事：
       ① 延迟挂载（不抢首屏）  ② 长按拖动  ③ 拖动时滚轮缩放  ④ 视线跟随全局鼠标
     位置与大小存 localStorage，刷新后还在原地。 */
  var NEKO_KEY = 'zb-neko:v1';
  var neko = { box: null, frame: null, grab: null, ready: false, dragging: false, w: 300 };

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
  function nekoApplySize(w) {
    if (!neko.box) return;
    neko.w = Math.min(560, Math.max(180, Math.round(w)));
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

    /* ---- 恢复上次的位置与大小 ---- */
    var saved = nekoLoad();
    nekoApplySize(saved && saved.w ? saved.w : (window.innerWidth < 760 ? 200 : 280));
    if (saved && typeof saved.x === 'number') nekoPlace(saved.x, saved.y);

    /* ---- 延迟挂载：等页面空闲再拉 4.6MB 的部件 ---- */
    var mounted = false;
    function mount() {
      if (mounted) return;
      mounted = true;
      /* 省流量模式 / 2G 网络：不下载这只猫，页面其余功能不受影响 */
      var conn = navigator.connection || navigator.mozConnection || null;
      if (conn && (conn.saveData || /(^|-)2g$/.test(String(conn.effectiveType || '')))) {
        box.classList.add('loaded');
        return;
      }
      frame.addEventListener('load', function () {
        var api = nekoApi();
        if (!api) return;
        var finish = function () {
          neko.ready = true;
          box.classList.add('loaded');
          tuneNeko(api);
        };
        if (api.whenReady) api.whenReady(finish); else finish();
      }, { once: true });
      frame.src = 'assets/neko/index.html?embed=1';
    }
    if (reduced()) {
      /* 减少动效：只挂一张静止的猫，不跑循环 */
      var once = function () {
        var api = nekoApi();
        if (api && api.pause) api.pause(true);
      };
      frame.addEventListener('load', once, { once: true });
      setTimeout(function () { frame.src = 'assets/neko/index.html?embed=1'; }, 2200);
    } else if (window.requestIdleCallback) {
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
      /* 没拖动 = 轻点一下：摸摸头 */
      var api = nekoApi();
      if (api && api.touch) {
        try { api.touch(); } catch (err) {}
        nekoLife.guard = performance.now() + 1200;   /* 摸头的耳朵动画期间不要叠加抽动 */
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
      }, 200);
    }, { passive: true });

    /* ---- 切到后台就冻结，省电 ---- */
    document.addEventListener('visibilitychange', function () {
      var api = nekoApi();
      if (api && api.pause) { try { api.pause(document.hidden); } catch (e) {} }
    });
  }

  /* 让她的默认状态像一只真的在坐着的猫：
     模型自带呼吸与头部的慢摆，但耳朵和尾巴是静态的，所以这里补两层「生命感」：
       · 尾巴：两个不同周期的正弦叠加，慢速左右扫（不是机械等幅摆动）
       · 耳朵：随机间隔的轻抽动，幅度小、带回落，像被什么声音惊了一下
     直接写 base.*（模型每帧读它），所以是零延迟、无缝的，不会和缓动队列打架。 */
  var nekoLife = { t0: 0, raf: 0, earAt: 0, earBusy: 0, guard: 0 };
  function nekoLifeStart() {
    if (nekoLife.raf) return;
    nekoLife.t0 = performance.now();
    nekoLife.earAt = 3 + Math.random() * 4;
    var tick = function (now) {
      nekoLife.raf = window.requestAnimationFrame(tick);
      var api = nekoApi();
      if (!api || !neko.ready) return;
      var t = (now - nekoLife.t0) / 1000;
      var base = api.base;
      if (base) {
        /* 尾巴：慢扫 + 一点不规则；抬起角度也跟着轻轻起伏 */
        base.ts = 0.15 * Math.sin(t * 0.62) + 0.06 * Math.sin(t * 1.47 + 1.1);
        base.tl = 0.05 + 0.025 * Math.sin(t * 0.44 + 0.6);
        base.tc = 0.16 + 0.02 * Math.sin(t * 0.31);
        /* 身体：极轻的重心左右转移，和尾巴反相，看起来才像"活着" */
        base.bx = 0.018 * Math.sin(t * 0.37 + 2.0);
      }
      /* 耳朵抽动：每 4~9 秒一次，左右随机，0.28s 回落 */
      if (now >= nekoLife.earAt && now > nekoLife.guard && !neko.dragging) {
        var left = Math.random() < 0.5;
        var amp = 0.16 + Math.random() * 0.14;
        var cur = api.base ? { l: api.base.earL || 0, r: api.base.earR || 0 } : { l: 0, r: 0 };
        if (api.ears) {
          api.ears(left ? cur.l + amp : cur.l, left ? cur.r : cur.r + amp);
          window.setTimeout(function () {
            if (api.ears) api.ears(cur.l, cur.r);
          }, 260 + Math.random() * 120);
        }
        nekoLife.earAt = now + 4000 + Math.random() * 5200;
      }
    };
    nekoLife.raf = window.requestAnimationFrame(tick);
  }

  /* 模型版本差异时忽略所有调节 */
  function tuneNeko(api) {
    try {
      if (api.emotion) api.emotion('neutral', 0);
      if (api.breathe) api.breathe(true);
      if (api.wag) api.wag(false);
      if (api.eyes) api.eyes(1, 1);
      if (api.mouth) api.mouth(0);
      if (api.follow) api.follow(false);
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
