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
  function avatarImg(cls) {
    return '<img class="' + (cls || 'avatar') + '" src="' + esc(CFG.avatar || 'assets/avatar.jpg') +
      '" alt="' + esc(CFG.author || SITE.author || '我') + '的头像">';
  }
  function avatarSrc() { return esc(CFG.avatar || 'assets/avatar.jpg'); }

  /* posts.js 是只读的原始文章；site-data.js 的 posts 是站长发布的新文章；
     创作台未发布的本机内容由 studio.js 合并进同一个数组，这里统一去重排序。 */
  var POSTS = (window.POSTS || []).slice();
  (DATA.posts || []).forEach(function (p) {
    for (var i = 0; i < POSTS.length; i++) {
      if (POSTS[i].slug === p.slug) { POSTS[i] = p; return; }
    }
    POSTS.push(p);
  });
  POSTS.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

  var TITLE = SITE.title || '我的博客';
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

  /* ---------- 公共片段 ---------- */
  function tagsHtml(tags) {
    if (!tags || !tags.length) return '';
    return '<div class="tags">' + tags.map(function (t) {
      return '<a class="tag" href="#/tag/' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
    }).join('') + '</div>';
  }
  function metaHtml(p) {
    return '<div class="post-meta"><time>' + esc(p.date) + '</time>' +
      (p.reading ? '<span>' + esc(p.reading) + '</span>' : '') + '</div>';
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
    var head = note ? '<p class="page-note">' + esc(note) + '</p>' : '';
    if (!posts.length) return head + '<p class="page-note">这里还没有文章。</p>';
    return head + posts.map(function (p) {
      return '<article class="post-item reveal">' +
        metaHtml(p) +
        '<a class="post-title" href="#/post/' + encodeURIComponent(p.slug) + '">' + esc(p.title) + '</a>' +
        '<p class="post-summary">' + esc(p.summary) + '</p>' +
        tagsHtml(p.tags) + '</article>';
    }).join('');
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
  function renderPost(p) {
    var idx = -1;
    POSTS.forEach(function (x, i) { if (x.slug === p.slug) idx = i; });
    var prev = idx > 0 ? POSTS[idx - 1] : null;
    var next = idx >= 0 && idx < POSTS.length - 1 ? POSTS[idx + 1] : null;
    var related = POSTS.filter(function (x) {
      if (x.slug === p.slug) return false;
      return (x.tags || []).some(function (t) { return (p.tags || []).indexOf(t) >= 0; });
    }).slice(0, 2);
    var nav = '<div class="post-nav reveal">' +
      (prev ? '<a class="pn" href="#/post/' + encodeURIComponent(prev.slug) + '"><span>← 较新</span>' + esc(prev.title) + '</a>' : '<span></span>') +
      (next ? '<a class="pn pn-right" href="#/post/' + encodeURIComponent(next.slug) + '"><span>较早 →</span>' + esc(next.title) + '</a>' : '<span></span>') +
      '</div>';
    var rel = related.length ? '<div class="related reveal"><div class="related-title">也许还想看</div>' +
      related.map(function (x) {
        return '<a href="#/post/' + encodeURIComponent(x.slug) + '">' + esc(x.title) + '</a>';
      }).join('') + '</div>' : '';
    return '<article class="article reveal">' +
      '<div class="article-author">' + avatarImg('avatar avatar-sm') +
      '<span>' + esc(CFG.author || SITE.author || '我') + '</span><i>·</i><span>' +
      wordsOf(p.body) + ' 字</span></div>' +
      '<h1>' + esc(p.title) + '</h1>' + metaHtml(p) + tagsHtml(p.tags) +
      tocHtml(p.body) +
      '<div class="article-body">' + (p.body || '') + '</div>' +
      '<div class="article-actions"><button class="soft-btn" type="button" data-share="' +
      esc('#/post/' + p.slug) + '">复制文章链接</button>' +
      '<a class="soft-btn" href="#/">← 返回文章列表</a></div>' +
      '</article>' + rel + nav;
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
        return '<a class="album-card glass sheen reveal" href="#/album/' + encodeURIComponent(a.id) + '">' +
          '<div class="album-cover"><img src="' + esc(a.cover || (a.photos[0] && a.photos[0].src) || avatarSrc()) +
          '" alt="' + esc(a.title) + '" loading="lazy"><span class="album-count">' + n + ' 张</span></div>' +
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
        return '<button class="photo-tile glass sheen reveal" type="button" data-photo="' + i + '">' +
          '<img src="' + esc(p.src) + '" alt="' + esc(p.title || '') + '" loading="lazy">' +
          '<span class="photo-cap"><b>' + esc(p.title || '') + '</b><i>' + esc(p.note || '') + '</i></span>' +
          '</button>';
      }).join('') + '</div>';
  }

  /* ---------- 说说 ---------- */
  function renderMoments() {
    var list = arr('moments');
    if (momentOrder === 'old') list.reverse();
    var likes = readLikes();
    return pageHead('说说', '在正文之外，捕捉一些瞬间的温度', 'MOMENTS') +
      '<div class="sort-row reveal"><span>' + list.length + ' 条动态</span>' +
      '<button class="filter' + (momentOrder === 'new' ? ' on' : '') + '" type="button" data-morder="new">最新</button>' +
      '<button class="filter' + (momentOrder === 'old' ? ' on' : '') + '" type="button" data-morder="old">最早</button></div>' +
      '<div class="moment-list">' + list.map(function (m) {
        var imgs = (m.images || []).length ? '<div class="moment-imgs">' + m.images.map(function (src) {
          return '<img src="' + esc(src) + '" alt="说说的配图" loading="lazy">';
        }).join('') + '</div>' : '';
        return '<article class="moment glass reveal">' +
          '<div class="moment-head">' + avatarImg('avatar avatar-sm') +
          '<div><b>' + esc(CFG.author || SITE.author || '我') + '</b>' +
          '<time>' + esc(m.date) + (m.time ? ' · ' + esc(m.time) : '') + '</time></div>' +
          (m.mood ? '<span class="mood">' + esc(m.mood) + '</span>' : '') + '</div>' +
          '<p class="moment-text">' + esc(m.text) + '</p>' + imgs +
          '<div class="moment-foot">' +
          (m.place ? '<span class="place">' + esc(m.place) + '</span>' : '<span></span>') +
          '<button class="like' + (likes[m.id] ? ' on' : '') + '" type="button" data-like="' + esc(m.id) + '">' +
          '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#soft-heart"/></svg>' +
          '<span>' + ((m.likes || 0) + (likes[m.id] ? 1 : 0)) + '</span></button></div>' +
          '</article>';
      }).join('') + '</div>';
  }
  function readLikes() {
    try { return JSON.parse(window.localStorage.getItem('zb-likes') || '{}') || {}; }
    catch (e) { return {}; }
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
    return pageHead('杂谈', '比文章短一点，比说说长一点', 'CHATTER') + filters +
      '<div class="chatter-list">' + shown.map(function (c) {
        return '<article class="chatter-card glass reveal">' +
          '<div class="chatter-meta"><span class="x-badge">' + esc(c.mood || '碎片') + '</span>' +
          '<time>' + esc(c.date) + ' ' + esc(c.time || '') + '</time></div>' +
          '<a class="chatter-title" href="#/chatter/' + encodeURIComponent(c.id) + '">' + esc(c.title) + '</a>' +
          '<p>' + esc(c.summary) + '</p>' +
          '<div class="x-chips">' + (c.tags || []).map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</div>' +
          '</article>';
      }).join('') + '</div>';
  }
  function renderChatterDetail(c) {
    return '<a class="back-link reveal" href="#/chatter">← 返回杂谈</a>' +
      '<article class="article reveal"><div class="article-author">' + avatarImg('avatar avatar-sm') +
      '<span>' + esc(CFG.author || SITE.author || '我') + '</span><i>·</i><span>' + esc(c.mood || '') + '</span></div>' +
      '<h1>' + esc(c.title) + '</h1><div class="post-meta"><time>' + esc(c.date) + ' ' + esc(c.time || '') +
      '</time></div>' + tagsHtml(c.tags) +
      '<div class="article-body">' + (c.body || '') + '</div></article>';
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

  /* ---------- 关于 ---------- */
  function renderAbout() {
    return pageHead('关于', '关于这个站，和写它的人', 'ABOUT') +
      '<div class="about-card glass reveal"><div class="about-top">' + avatarImg('avatar avatar-lg') +
      '<div><h2>' + esc(CFG.author || SITE.author || '我') + '</h2>' +
      '<p>' + esc(CFG.tagline || SITE.tagline || '') + '</p></div></div>' +
      '<div class="about-intro">' + (CFG.intro || SITE.about || '<p>关于本站。</p>') + '</div>' +
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
      '<div><b>0</b><span>追踪脚本</span></div></div>';
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
    var name = CFG.displayName || SITE.title || '纸上留白';
    var bio = CFG.bio || CFG.tagline || SITE.tagline || '';
    var stats = [
      [POSTS.length, '文章', '#/'],
      [arr('chatter').length, '杂谈', '#/chatter'],
      [photoCount(), '照片', '#/photowall']
    ];
    return '<section class="profile-card glass sheen reveal" aria-label="站长名片">' +
      '<div class="profile-top"><span class="profile-avatar-wrap">' +
      avatarImg('avatar profile-avatar') + '</span>' +
      '<div class="profile-id"><h1 class="profile-name">' + esc(name) + '</h1>' +
      '<p class="profile-bio">' + esc(bio) + '</p></div></div>' +
      '<div class="profile-foot"><div class="profile-stats">' +
      stats.map(function (s) {
        return '<a class="p-stat" href="' + esc(s[2]) + '"><b>' + s[0] + '</b><span>' + s[1] + '</span></a>';
      }).join('') + '</div><div class="p-links">' + profileLinksHtml() + '</div></div></section>';
  }
  function renderHome() {
    return profileCard() + renderList(query ? [] : POSTS, query ? '' : '最近的记录');
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
  function paint(html, active, subTitle) {
    app.innerHTML = html;
    document.title = (subTitle ? subTitle + ' · ' : '') + TITLE;
    Array.prototype.forEach.call(document.querySelectorAll('.nav a'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === active);
    });
    addLineNumbers();
    observeReveal();
    measureScroll();
    updateScroll();
    window.scrollTo(0, 0);
  }
  function route() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('/').filter(Boolean).map(decode);
    var html, active = 'home', sub = '';

    if (!parts.length) {
      html = query ? renderGlobalSearch(query) : renderHome();
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
      s.className = puffy ? 'star is-puffy' : (warm ? 'star is-warm' : 'star is-still');
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
      for (var j = 0; j < 12; j++) {
        var p = document.createElement('span');
        p.className = 'petal';
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
          if (like) {
            var id = like.getAttribute('data-like');
            var likes = readLikes();
            likes[id] = !likes[id];
            try { window.localStorage.setItem('zb-likes', JSON.stringify(likes)); } catch (err) {}
            like.classList.toggle('on', !!likes[id]);
            var span = like.querySelector('span');
            if (span) span.textContent = String(Number(span.textContent) + (likes[id] ? 1 : -1));
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
      var px = 0, py = 0, busy = false;
      document.addEventListener('pointermove', function (e) {
        px = e.clientX; py = e.clientY;
        if (busy) return;
        busy = true;
        (window.requestAnimationFrame || function (f) { window.setTimeout(f, 16); })(function () {
          if (glow && glow.style) glow.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)';
          var card = document.elementFromPoint ? document.elementFromPoint(px, py) : null;
          var host = card && card.closest ? card.closest('.sheen') : null;
          if (host && host.style) {
            var r = host.getBoundingClientRect ? host.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
            host.style.setProperty('--mx', ((px - r.left) / (r.width || 1) * 100).toFixed(1) + '%');
            host.style.setProperty('--my', ((py - r.top) / (r.height || 1) * 100).toFixed(1) + '%');
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
    initLightbox();
  }

  initEffects();
  initSky();
  initTheme();
  initSearch();
  initInteractions();
  route();
})();
