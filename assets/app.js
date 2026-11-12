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
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function decode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  /* 旧文章的 body 是预渲染 HTML（无 Markdown 原文），里面的代码块没有高亮标记。
     把每个 zb-code 的 <code> 原文取出（剥掉旧标记、还原实体）后用渲染引擎重新上色；
     对已高亮的新渲染结果同样幂等。 */
  function rehlHtml(html) {
    var s = String(html || '');
    if (s.indexOf('<pre') < 0 || !window.ZBMD) return s;
    return s.replace(/<pre[^>]*>[\s\S]*?<\/pre>/g, function (blk) {
      if (blk.indexOf('<code') < 0) return blk;
      var lang = (blk.match(/data-lang="([^"]*)"/) || [])[1] ||
        (blk.match(/class="zb-lang">([^<]*)</) || [])[1] || '';
      return blk.replace(/<code[^>]*>[\s\S]*?<\/code>/, function (cm) {
        var gt = cm.indexOf('>'), end = cm.lastIndexOf('</code>');
        var raw = cm.slice(gt + 1, end).replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        if (!lang && /#include|#define\b/.test(raw)) lang = 'c';
        return '<code>' + window.ZBMD.highlight(raw, lang) + '</code>';
      });
    });
  }
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
     创作台未发布的本机内容由 studio.js 合并进同一个数组，这里统一去重排序。 */
  function buildPosts() {
    var out = (window.POSTS || []).slice();
    (DATA.posts || []).forEach(function (p) {
      for (var i = 0; i < out.length; i++) {
        if (out[i].slug === p.slug) { out[i] = p; return; }
      }
      out.push(p);
    });
    /* 版本日志文章由构建脚本从 博客版本日志.md 生成，posts.js 保持逐字节不动 */
    if (window.CHANGELOG_POST && window.CHANGELOG_POST.slug) {
      var cp = window.CHANGELOG_POST, hitCp = false;
      for (var ci = 0; ci < out.length; ci++) {
        if (out[ci].slug === cp.slug) { out[ci] = cp; hitCp = true; break; }
      }
      if (!hitCp) out.push(cp);
    }
    out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    /* 创作台删除的基础文章以 site-data.js 的 deleted.posts 下发，这里统一过滤
       （要在版本日志文章合并之后再过滤，changelog 文章同样可删） */
    var DEAD_POSTS = (DATA.deleted && DATA.deleted.posts) || [];
    if (DEAD_POSTS.length) {
      out = out.filter(function (p) { return DEAD_POSTS.indexOf(p.slug) < 0; });
    }
    return out;
  }
  var POSTS = buildPosts();
  /* 创作台在本机删文章只改了共享的 DATA，POSTS 是启动时的数组。
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
    var t = new Date(String(founded).replace(/-/g, '/')).getTime();
    if (isNaN(t)) return 1;
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
  if (footNote) footNote.textContent = CFG.footerNote || '纯静态 · 无追踪 · 无依赖';
  /* 导航头像与首页名片共用同一份站点数据；创作台改名后即时同步 */
  function syncBrandAvatar() {
    var el = document.querySelector && document.querySelector('.avatar-brand');
    if (el) el.src = CFG.avatar || 'assets/avatar.jpg';
  }
  syncBrandAvatar();
  document.addEventListener('zb:site-change', syncBrandAvatar);

  /* ---------- 公共片段 ---------- */
  function tagsHtml(tags) {
    if (!tags || !tags.length) return '';
    return '<div class="tags">' + tags.map(function (t) {
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
      return '<div class="stat-cell"><b>' + it[0] + '</b><span>' + it[1] + '</span></div>';
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
    /* 创作台写的文章保留 Markdown / LaTeX 原文，前台用同一套引擎渲染；
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
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
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
          '<div class="x-chips">' + (p.tags || []).map(function (t) {
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
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 14);
    var filters = '<div class="filter-row reveal"><button class="filter' +
      (timelineTag ? '' : ' on') + '" type="button" data-tfilter="">全部</button>' +
      names.map(function (t) {
        return '<button class="filter' + (timelineTag === t ? ' on' : '') +
          '" type="button" data-tfilter="' + esc(t) + '">' + esc(t) + ' <i>' + counts[t] + '</i></button>';
      }).join('') + '</div>';
    var shown = timelineTag ? all.filter(function (p) {
      return (p.tags || []).indexOf(timelineTag) >= 0;
    }) : all;
    var groups = {}, order = [];
    shown.forEach(function (p) {
      var k = String(p.date || '').slice(0, 7) || '未标日期';
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(p);
    });
    return pageHead('归档', '总计 ' + all.length + ' 篇文章，按时间排好', 'ARCHIVE') +
      statHtml() + filters +
      '<div class="timeline">' + order.map(function (k) {
        return '<section class="tl-group reveal"><div class="tl-month"><b>' + esc(k) + '</b><span>' +
          groups[k].length + ' 篇</span></div><div class="tl-items">' +
          groups[k].map(function (p) {
            return '<a class="tl-item glass" href="#/post/' + encodeURIComponent(p.slug) + '">' +
              '<time>' + esc(p.date) + '</time><b>' + esc(p.title) + '</b>' +
              '<span>' + (p.tags || []).map(function (t) { return '#' + esc(t); }).join(' ') + '</span></a>';
          }).join('') + '</div></section>';
      }).join('') + '</div>';
  }

  /* ---------- 照片墙 ---------- */
  function renderPhotowall() {
    var albums = arr('albums');
    if (!albums.length) return pageHead('照片墙', '定格过的光', 'GALLERY') + '<p class="page-note">还没有相册。</p>';
    return pageHead('照片墙', '定格时间，也定格当时的天色', 'GALLERY') +
      '<p class="page-note">共 ' + albums.length + ' 个相册 · ' + photoCount() + ' 张照片</p>' +
      '<div class="album-grid">' + albums.map(function (a) {
        var n = (a.photos || []).length;
        /* Kirameku 式堆叠封面：最新三张，最新一张在最上层，底层往上错位露角 */
        return '<a class="album-card glass sheen reveal" href="#/album/' + encodeURIComponent(a.id) + '">' +
          '<div class="album-stack">' + stackCovers(a.photos, a.title) +
          '<span class="album-count">' + n + ' 张</span></div>' +
          '<div class="album-info"><h2>' + esc(a.title) + '</h2><p>' + esc(a.desc) + '</p>' +
          '<time>' + esc(a.date) + '</time></div></a>';
      }).join('') + '</div>';
  }
  function renderAlbum(a) {
    var photos = a.photos || [];
    lb.list = photos;
    return '<a class="back-link reveal" href="#/photowall">← 返回照片墙</a>' +
      pageHead(a.title, a.desc, 'ALBUM · ' + photos.length + ' 张') +
      '<div class="photo-grid">' + photos.map(function (p, i) {
        return '<button class="photo-tile glass sheen reveal" type="button" data-photo="' + i + '" style="animation-delay:' + (i % 12) * 45 + 'ms">' +
          '<img src="' + esc(p.src) + '" alt="' + esc(p.title || '') + '" loading="lazy" decoding="async">' +
          '<span class="photo-cap"><b>' + esc(p.title || '') + '</b><i>' +
          esc(((p.date ? p.date + (p.note ? ' · ' : '') : '') + (p.note || '')) || ' ') + '</i></span>' +
          '</button>';
      }).join('') + '</div>';
  }

  /* ---------- 说说 ---------- */
  function renderMoments() {
    var list = arr('moments');
    if (momentOrder === 'old') list.reverse();
    var L = window.ZBLikes;
    return pageHead('说说', '在正文之外，捕捉一些瞬间的温度', 'MOMENTS') +
      '<div class="sort-row reveal"><span>' + list.length + ' 条动态</span>' +
      '<button class="filter' + (momentOrder === 'new' ? ' on' : '') + '" type="button" data-morder="new">最新</button>' +
      '<button class="filter' + (momentOrder === 'old' ? ' on' : '') + '" type="button" data-morder="old">最早</button></div>' +
      '<div class="moment-list">' + list.map(function (m) {
        var imgs = (m.images || []).length ? '<div class="moment-imgs">' + m.images.map(function (src) {
          return '<img src="' + esc(src) + '" alt="说说的配图" loading="lazy" decoding="async">';
        }).join('') + '</div>' : '';
        return '<article class="moment glass reveal">' +
          '<div class="moment-head">' + avatarImg('avatar avatar-sm') +
          '<div><b>' + esc(CFG.author || SITE.author || '我') + '</b>' +
          '<time>' + esc(String(m.date || '').slice(0, 10)) + '</time></div>' +
          (m.mood ? '<span class="mood">' + esc(m.mood) + '</span>' : '') + '</div>' +
          '<p class="moment-text">' + esc(m.text) + '</p>' + imgs +
          '<div class="moment-foot">' +
          (m.place ? '<span class="place">' + esc(m.place) + '</span>' : '<span></span>') +
          (L ? L.html('moment', m.id, m.likes) : '') + '</div>' +
          '</article>';
      }).join('') + '</div>';
  }

  /* ---------- 杂谈 ---------- */
  function renderChatter() {
    var list = arr('chatter');
    var tags = [];
    list.forEach(function (c) { (c.tags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
    var filters = '<div class="filter-row reveal"><button class="filter' +
      (chatterTag ? '' : ' on') + '" type="button" data-cfilter="">全部</button>' +
      tags.map(function (t) {
        return '<button class="filter' + (chatterTag === t ? ' on' : '') +
          '" type="button" data-cfilter="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div>';
    var shown = chatterTag ? list.filter(function (c) { return (c.tags || []).indexOf(chatterTag) >= 0; }) : list;
    var L = window.ZBLikes;
    return pageHead('杂谈', '比文章短一点，比说说长一点', 'CHATTER') + filters +
      '<div class="chatter-list">' + shown.map(function (c) {
        return '<article class="chatter-card glass reveal">' +
          '<div class="chatter-meta"><span class="x-badge">' + esc(c.mood || '碎片') + '</span>' +
          '<time>' + esc(String(c.date || '').slice(0, 10)) + '</time></div>' +
          '<a class="chatter-title" href="#/chatter/' + encodeURIComponent(c.id) + '">' + esc(c.title) + '</a>' +
          '<p>' + esc(c.summary) + '</p>' +
          '<div class="x-chips">' + (c.tags || []).map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</div>' +
          '<div class="chatter-foot">' +
          (L ? L.html('chatter', c.id, c.likes) : '<span></span>') + '</div>' +
          '</article>';
      }).join('') + '</div>';
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
     用站点统一的渲染器输出，创作台预览、SPA 与静态镜像三处一致 */
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
     高 = 站点原本的完整效果，也是所有访客的默认档；极高 = 高的全部效果 + 实时毛玻璃，
     以后新增的画质细节都挂在极高上；中 / 低按 QUALITY_SPEC 逐层减负，全部不开实时毛玻璃。
     根节点 data-quality 驱动 CSS（首屏由 index.html 里的内联脚本预置，避免闪烁），
     qualityNow 供脚本判断是否需要跑逐帧光幕；切换即时生效，无需刷新。 */
  var QUALITY_KEY = 'zb-quality';
  var QUALITY_OPTS = [
    { id: 'ultra', name: '极高', desc: '「高」的全部效果之上开启实时毛玻璃，并把流星与花瓣加到两倍密度；以后新增的画质细节都会出现在这一档' },
    { id: 'high', name: '高', desc: '完整效果：星空、花瓣、花朵爱心游走、全部流星与光幕（默认档）' },
    { id: 'mid', name: '中', desc: '星点减半、花朵爱心静止；关闭鼠标光幕与卡片高光，保留主要动效' },
    { id: 'low', name: '低', desc: '静态精简星空：关闭装饰、流星、流萤、光幕与入场动画' }
  ];
  var QUALITY_SPEC = [
    ['星星 / 花瓣', '72 / 24', '72 / 12', '36 / 6', '18 / 0'],
    ['花朵与爱心', '缓慢游走旋转', '缓慢游走旋转', '静止', '隐藏'],
    ['流星', '常驻 6 + 快速 6', '常驻 3 + 快速 3', '各留 1 条', '关闭'],
    ['流萤', '夜间 8 只', '夜间 8 只', '夜间 4 只', '关闭'],
    ['鼠标光幕 / 尾迹', '开启', '开启', '关闭', '关闭'],
    ['卡片高光', '开启', '开启', '关闭', '关闭'],
    ['实时毛玻璃', '开启', '关闭', '关闭', '关闭'],
    ['代码高亮', 'Woodfish 配色', 'Woodfish 配色', 'Woodfish 配色', '不上色'],
    ['入场动画', '开启', '开启', '开启', '关闭']
  ];
  var qualityNow = 'high';
  /* 用户没选过画质时，按设备能力自动降档：内存/核心极少直接给静态档，
     与 index.html 首屏内联脚本保持同一套判断，避免首帧闪烁。 */
  function autoQuality() {
    var m = 8, c = 8;
    try {
      if (navigator.deviceMemory) m = navigator.deviceMemory;
      if (navigator.hardwareConcurrency) c = navigator.hardwareConcurrency;
    } catch (e) {}
    if (m <= 2 || c <= 2) return 'low';
    if (m <= 4 || c <= 4) return 'mid';
    return 'high';
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
  /* 设置页「本机不计入浏览量」：写在 localStorage，likes.js 的 ownerDevice 读取同一个键 */
  function noCountOn() {
    try { return window.localStorage && window.localStorage.getItem('zb-no-count') === '1'; }
    catch (e) { return false; }
  }
  document.addEventListener('change', function (e) {
    var t = e.target;
    var k = t && t.getAttribute ? t.getAttribute('data-font-sel') : null;
    if (k) { saveFont(k, t.value); applyFonts(); return; }
    if (t && t.getAttribute && t.getAttribute('data-no-count') !== null) {
      try { window.localStorage.setItem('zb-no-count', t.checked ? '1' : '0'); } catch (err) {}
      var note = document.getElementById('no-count-state');
      if (note) note.textContent = t.checked ?
        '已开启：这台设备浏览页面不会再增加浏览数。' :
        '已关闭：这台设备按普通访客计入浏览数。';
    }
  });
  function qualitySpecHtml() {
    var head = '<thead><tr><th scope="col">效果</th><th scope="col">极高</th>' +
      '<th scope="col">高</th><th scope="col">中</th><th scope="col">低</th></tr></thead>';
    var body = '<tbody>' + QUALITY_SPEC.map(function (r) {
      return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) +
        '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td><td>' + esc(r[4]) + '</td></tr>';
    }).join('') + '</tbody>';
    return '<div class="q-spec-wrap"><table class="q-spec">' + head + body + '</table></div>';
  }
  function renderSettings() {
    var cur = readQuality();
    var opts = QUALITY_OPTS.map(function (o) {
      var on = o.id === cur;
      return '<button class="quality-item' + (on ? ' on' : '') + '" type="button" role="radio"' +
        ' aria-checked="' + (on ? 'true' : 'false') + '" data-quality="' + o.id + '">' +
        '<span class="q-mark" aria-hidden="true"><svg viewBox="0 0 100 100"><use href="#puffy-star"/></svg></span>' +
        '<b>' + esc(o.name) + '</b><small>' + esc(o.desc) + '</small></button>';
    }).join('');
    var fontNote = '代码字体选 JetBrains Maple Mono 时，代码里的中文也用它' +
      '（该字体自带中文字形）；选「默认」或 Consolas 时，代码里的中文按上面「中文字体」的设置显示。' +
      '英文字体里的 JetBrains Mono 只有英文字形，选它时页面中文仍按「中文字体」显示；' +
      '英文字体初始默认为 JetBrains Mono；选项按字典序排列。' +
      'LaTeX 字体只作用于公式：默认 Computer Modern（随站点自带的开源字体），选「默认」则改用系统数学字体。';
    return pageHead('设置', '把偏好留在这台设备上', 'SETTINGS') +
      '<section class="settings-card glass reveal" aria-label="站点设置">' +
      '<div class="settings-block"><div class="settings-info">' +
      '<h2>画质</h2><p>选择画面呈现的档位，切换后立即生效。偏好保存在本机浏览器里，不会上传到任何地方。</p></div>' +
      '<div class="quality-group" role="radiogroup" aria-label="画质档位">' + opts + '</div></div>' +
      qualitySpecHtml() +
      '<p class="settings-foot">当前画质：<b id="quality-current">' + esc(qualityName(cur)) +
      '</b> · 首次访问默认高画质；「极高」在其上额外开启实时毛玻璃并加密流星与花瓣，中 / 低 依次减少装饰与实时渲染。</p></section>' +
      '<section class="settings-card glass reveal" aria-label="字体设置">' +
      '<div class="settings-block"><div class="settings-info">' +
      '<h2>字体</h2><p>设置网页的中英文字体、代码字体与 LaTeX 公式字体。切换后立即生效，偏好同样只保存在本机。</p></div>' +
      '<div class="font-group">' +
      '<label class="font-item">中文字体' + fontSelect('cn', FONT_CN_OPTS, readFont('cn')) + '</label>' +
      '<label class="font-item">英文字体' + fontSelect('en', FONT_EN_OPTS, readFont('en')) + '</label>' +
      '<label class="font-item">代码字体' + fontSelect('code', FONT_CODE_OPTS, readFont('code')) + '</label>' +
      '<label class="font-item">LaTeX 字体' + fontSelect('tex', FONT_TEX_OPTS, readFont('tex')) + '</label>' +
      '</div>' +
      '<p class="settings-foot">' + esc(fontNote) + '</p></div></section>' +
      /* 浏览统计只对站长设备显示：普通访客用不上「本机不计入浏览量」 */
      (window.STUDIO && window.STUDIO.isOwner && window.STUDIO.isOwner() ?
      '<section class="settings-card glass reveal" aria-label="浏览统计">' +
      '<div class="settings-block"><div class="settings-info">' +
      '<h2>浏览统计</h2><p>页面只记录匿名访客的浏览次数，不采集身份信息。解锁过创作台的设备与预览态自动不计入；其它设备可在这里手动排除自己。</p></div>' +
      '<label class="no-count-item"><input type="checkbox" data-no-count' +
      (noCountOn() ? ' checked' : '') + '><span>本机不计入浏览量</span></label></div>' +
      '<p class="settings-foot" id="no-count-state">' +
      esc(noCountOn() ? '已开启：这台设备浏览页面不会再增加浏览数。' :
        '未开启：解锁过创作台的设备仍会自动排除，其它设备按普通访客计入。') +
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
     数量和链接都取自 site-data.js，站长在创作台里改数据即可同步。 */
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
        return '<a class="p-stat" href="' + esc(s[2]) + '"><b>' + s[0] + '</b><span>' + s[1] + '</span></a>';
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
     2×2 网格：文章 / 照片墙(4:3 三图堆叠) / 说说 / 杂谈各占一格。
     文章、说说、杂谈各自轮播最新 3 条；照片卡轮播最新 3 个相册，
     每个相册自带三张等比定格堆叠封面。 */
  function recentByDate(list, n) {
    return (list || []).map(function (v, i) { return { v: v, i: i }; }).sort(function (a, b) {
      var d = String((b.v && b.v.date) || '').localeCompare(String((a.v && a.v.date) || ''));
      return d || b.i - a.i; /* 同一天按发布先后：后添加的排在前面 */
    }).slice(0, n || 3).map(function (o) { return o.v; });
  }
  /* 首页文章卡的「长摘要」：早期创作台只自动截 90 字，卡片会空出一大片。
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
  /* 三张按日期倒序的照片：最新一张在最上层，底层往上错位露角。
     每层是固定 4:3 定格框，同一张图先模糊铺底、再 contain 等比完整显示，
     横版与竖版都不裁切、不变形，也不会因 height:auto 撑出卡片。 */
  function stackCovers(photos, alt) {
    var list = recentByDate(photos, 3);
    if (!list.length) list = [{ src: avatarSrc() }];
    var layers = list.slice().reverse();
    return layers.map(function (p, i) {
      var cls = i === layers.length - 1 ? 'stack-top' :
        (i === layers.length - 2 ? 'stack-mid' : 'stack-back');
      return '<div class="' + cls + '" data-stack-layer aria-hidden="true" ' +
        'title="' + esc(alt) + '" style="--shot:url(&quot;' + esc(shotUrl(p.src)) + '&quot;)"></div>';
    }).join('');
  }
  /* 首页照片卡轮播的是「相册」而不是单张照片：按相册内最新照片日期倒序取前三个 */
  function albumFeed() {
    var out = arr('albums').map(function (a, i) {
      var latest = String(a.date || '');
      (a.photos || []).forEach(function (p) {
        var d = String(p.date || '');
        if (d > latest) latest = d;
      });
      return { date: latest, a: a, i: i };
    });
    return recentByDate(out, 3);
  }
  function renderHome() {
    var posts = recentByDate(POSTS, 3);
    var albums = albumFeed();
    var moments = recentByDate(arr('moments'), 3);
    var chatters = recentByDate(arr('chatter'), 3);
    var postCard = posts.length ? qCard('q-post', posts.map(function (p) {
      return {
        href: '#/post/' + encodeURIComponent(p.slug),
        inner: '<div class="q-head">' + qBadge('最新文章', 'q-post-badge') +
          '<time>' + esc(String(p.date || '').slice(0, 10)) + '</time></div>' +
          '<h2>' + esc(p.title) + '</h2>' +
          '<p class="q-sum">' + esc(homeSummary(p)) + '</p>' +
          '<div class="q-tags">' + (p.tags || []).slice(0, 4).map(function (t) {
            return '<span>' + esc(t) + '</span>';
          }).join('') + '</div>' +
          '<span class="q-go">阅读全文 →</span>'
      };
    }), '最新文章') : qEmpty('q-post', '#/posts', '还没有文章', '第一篇正在路上');
    var photoCard;
    if (albums.length) {
      photoCard = '<section class="q-card q-photo glass sheen reveal" data-qcarousel aria-label="最新照片墙">' +
        '<div class="q-slides">' + qSlides(albums.map(function (it) {
          var a = it.a;
          return {
            href: '#/album/' + encodeURIComponent(a.id),
            inner: '<div class="album-stack q-photo-stack">' + stackCovers(a.photos, a.title) +
              '<span class="album-count">' + (a.photos || []).length + ' 张</span>' +
              '<div class="q-photo-cap"><b>' + esc(a.title) + '</b><i>' +
              esc(a.desc || '') + '</i></div>' +
              qBadge('最新照片墙', 'q-photo-badge') + '</div>'
          };
        })) + '</div>' +
        (albums.length > 1 ? '<div class="q-dots">' + qDots(albums.length) + '</div>' : '') +
        '</section>';
    } else {
      photoCard = qEmpty('q-photo', '#/photowall', '照片墙还空着', '定格过的光会放在这里');
    }
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
      '<div class="home-quick">' + postCard + photoCard + momentCard + chatterCard + '</div>';
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
      '<div class="card-grid">' + POSTS.map(function (p) {
        return '<article class="x-card glass sheen reveal post-x-card">' +
          '<div class="x-card-top"><span class="x-badge">' + esc(p.category || '随笔') + '</span>' +
          '<time>' + esc(String(p.date || '').slice(0, 10)) + '</time></div>' +
          '<h2 class="x-title"><a href="#/post/' + encodeURIComponent(p.slug) + '">' + esc(p.title) + '</a></h2>' +
          '<p>' + esc(p.summary || '') + '</p>' +
          '<div class="x-chips">' + (p.tags || []).map(function (t) {
            return '<span>' + esc(t) + '</span>';
          }).join('') + '</div>' +
          '<div class="x-foot">' + postStatsHtml(p) +
          '<a class="x-link" href="#/post/' + encodeURIComponent(p.slug) + '">阅读全文 →</a></div>' +
          '</article>';
      }).join('') + '</div>';
  }

  /* ---------- 行号 ---------- */
  function addLineNumbers() {
    var blocks = app.querySelectorAll('pre > code');
    Array.prototype.forEach.call(blocks, function (block) {
      var pre = block.parentNode;
      if (!pre || pre.querySelector('.line-numbers')) return;
      var lines = block.textContent.replace(/\n$/, '').split('\n');
      var nums = document.createElement('span');
      nums.className = 'line-numbers';
      nums.setAttribute('aria-hidden', 'true');
      nums.textContent = lines.map(function (_, i) { return i + 1; }).join('\n');
      pre.insertBefore(nums, block);
      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.textContent = '复制';
      btn.setAttribute('aria-label', '复制代码');
      pre.appendChild(btn);
    });
  }

  /* ---------- 渲染与路由 ---------- */
  function observeReveal() {
    if (!window.IntersectionObserver || !app.querySelectorAll) return;
    var nodes = app.querySelectorAll('.reveal');
    Array.prototype.forEach.call(nodes, function (n) { revealObserver.observe(n); });
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
    frame.setAttribute('srcdoc', window.CHANGELOG_HTML);
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
    initChangelogFrame();
    document.title = (subTitle ? subTitle + ' · ' : '') + TITLE;
    Array.prototype.forEach.call(document.querySelectorAll('.nav a'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === active);
    });
    addLineNumbers();
    if (window.ZBLikes && window.ZBLikes.mount) window.ZBLikes.mount();
    if (window.ZBInteractions && window.ZBInteractions.mount) window.ZBInteractions.mount();
    if (window.ZBLive && window.ZBLive.mount) window.ZBLive.mount();
    mountQuickCarousel();
    observeReveal();
    measureScroll();
    updateScroll();
    window.scrollTo(0, 0);
  }
  function route() {
    /* 每次导航都重算文章集合：创作台删除后回首页立即生效 */
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
      html = renderPhotowall(); active = 'photowall'; sub = '照片墙';
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
    } else if (parts[0] === 'studio') {
      paint('', 'studio', '创作台');
      if (window.STUDIO && window.STUDIO.render) window.STUDIO.render(app);
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
    for (var i = 0; i < 72; i++) {
      var puffy = i % 8 === 0;
      var warm = !puffy && i % 13 === 5;
      var still = !puffy && !warm;
      var s = document.createElement('span');
      /* 按生成顺序标注档位：前 18 颗低画质也保留，前 36 颗中画质保留，其余仅高画质 */
      var tier = i < 18 ? ' q-core' : (i < 36 ? ' q-mid' : ' q-high');
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
      /* 前 6 片低画质保留，其后 6 片高画质保留，最后 12 片只在极高画质出现（密度翻倍）。
         位置沿用同一随机序列，因此高画质的前 12 片摆位与旧版逐像素一致。 */
      for (var j = 0; j < 24; j++) {
        var p = document.createElement('span');
        p.className = 'petal' + (j < 6 ? ' q-core' : (j < 12 ? ' q-high' : ' q-ultra'));
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

  /* ---------- 晴空 / 星夜 ---------- */
  function readTheme() {
    try { return window.localStorage ? window.localStorage.getItem('zb-theme') : null; }
    catch (e) { return null; }
  }
  function saveTheme(t) {
    try { if (window.localStorage) window.localStorage.setItem('zb-theme', t); }
    catch (e) { /* file:// 下可能不可用，忽略 */ }
  }
  var ICON_MOON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.7 8.7 0 1 0 10.7 10.7Z" fill="currentColor"/></svg>';
  var ICON_SUN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.6" fill="currentColor"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 1.8v2.2M12 20v2.2M1.8 12H4M20 12h2.2M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M19.2 4.8l-1.6 1.6M6.4 17.6l-1.6 1.6"/></g></svg>';
  function applyTheme(t) {
    var root = document.documentElement;
    if (root && root.dataset) {
      if (t === 'night') root.dataset.theme = 'night';
      else delete root.dataset.theme;
    }
    if (window.ZBInteractions && window.ZBInteractions.syncTheme) window.ZBInteractions.syncTheme();
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      var night = t === 'night';
      btn.innerHTML = night ? ICON_SUN : ICON_MOON;
      btn.setAttribute('aria-label', night ? '切换为晴空模式' : '切换为星夜模式');
      btn.setAttribute('title', night ? '切换为晴空模式' : '切换为星夜模式');
    }
    try { document.dispatchEvent(new CustomEvent('zb:theme', { detail: t })); } catch (e) {}
  }
  function initTheme() {
    applyTheme(readTheme());
    var btn = document.getElementById('theme-toggle');
    if (btn && btn.addEventListener) {
      btn.addEventListener('click', function () {
        var next = document.documentElement && document.documentElement.dataset &&
          document.documentElement.dataset.theme === 'night' ? '' : 'night';
        saveTheme(next);
        applyTheme(next);
      });
    }
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
          if (node.closest('[data-toc]') && node.closest('[data-toc]').getAttribute('data-toc') !== null) {
            var hs = app.querySelectorAll('.article-body h2');
            var target = hs[Number(node.closest('[data-toc]').getAttribute('data-toc'))];
            if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          var photo = node.closest('[data-photo]');
          if (photo) { lbShow(Number(photo.getAttribute('data-photo'))); return; }
          var like = node.closest('[data-like]');
          if (like && window.ZBLikes) {
            window.ZBLikes.onLike(like);
            return;
          }
          var quality = node.closest('[data-quality]');
          if (quality) {
            var qv = quality.getAttribute('data-quality');
            saveQuality(qv);
            applyQuality(qv);
            Array.prototype.forEach.call(app.querySelectorAll('[data-quality]'), function (btn) {
              var on = btn.getAttribute('data-quality') === qv;
              btn.classList.toggle('on', on);
              btn.setAttribute('aria-checked', on ? 'true' : 'false');
            });
            var qc = document.getElementById('quality-current');
            if (qc) qc.textContent = qualityName(qv);
            return;
          }
          var order = node.closest('[data-morder]');
          if (order) { momentOrder = order.getAttribute('data-morder'); repaint(renderMoments); return; }
          var cf = node.closest('[data-cfilter]');
          if (cf) { chatterTag = cf.getAttribute('data-cfilter'); repaint(renderChatter); return; }
          var tf = node.closest('[data-tfilter]');
          if (tf) { timelineTag = tf.getAttribute('data-tfilter'); repaint(renderTimeline); return; }
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
      top.addEventListener('click', function () { window.scrollTo(0, 0); });
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
      }, { rootMargin: '0px 0px -30px 0px', threshold: .06 });
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
        /* 中 / 低 画质不再跑逐帧光幕与卡片高光（极高与高一致） */
        if (qualityNow !== 'high' && qualityNow !== 'ultra') return;
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
  initTheme();
  initSearch();
  initInteractions();
  initChangelogSync();
  route();
})();
