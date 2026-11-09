/* 星梦Staream · 实时留言层（零依赖、零第三方组件）
 * 归档才是最终存储（随仓库版本化、无 JS 也能读）；这一层只负责「让留言直接出现在评论区」：
 * 评论区进入视口时匿名读取本站仓库的公开 Issues，交给同一个 ZBArchive.render() 渲染，
 * 发布后刷新即可看到，不必等每日归档、也不必跳链接去 GitHub 翻留言。
 * 读不到就静默沿用页面里烘焙好的归档，绝不空白、绝不阻塞首屏、绝不写任何数据。
 * 写入端仍是 GitHub：页面内输入框写好内容 → 打开预填好的新建 Issue 页 → 登录确认。
 */
(function () {
  'use strict';
  var C = window.ZB_INTERACTIONS || {};
  var A = window.ZBArchive;
  var REPO = String(C.repository || '');
  var API = String(C.apiBase || 'https://api.github.com').replace(/\/+$/, '');
  var LIVE = C.live !== false;
  var TTL = Number(C.cacheSeconds) > 0 ? Number(C.cacheSeconds) : 120;
  var MAX_REPLIES = Number(C.maxReplyFetches) > 0 ? Number(C.maxReplyFetches) : 8;
  var TIMEOUT = Number(C.timeoutMs) > 0 ? Number(C.timeoutMs) : 5000;
  var currentSlug = '';
  var seq = 0;
  var activeObserver = null;

  function slugOf(v) {
    if (v) return String(v);
    var m = String(window.location && window.location.hash || '').match(/^#\/post\/([^/?#]+)/);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }
  function safeSlug(s) {
    return /^[A-Za-z0-9_-]+$/.test(s || '') ? String(s) : '';
  }
  function mine(it, slug) {
    if (!it || it.pull_request || it.state !== 'open' || !slug) return false;
    var m = String(it.title || '').match(/^留言\s*\|\s*([^\s|]+)\s*$/);
    return !!(m && safeSlug(m[1]) === slug);
  }

  /* GitHub REST 匿名可读（Access-Control-Allow-Origin: *），失败一律交给归档兜底 */
  function fetchJson(url) {
    var f = window.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!f) return Promise.reject(new Error('fetch 不可用'));
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) { try { ctrl.abort(); } catch (e) {} } }, TIMEOUT);
    var opt = { headers: { Accept: 'application/vnd.github+json' } };
    if (ctrl) opt.signal = ctrl.signal;
    return f.call(window, url, opt).then(function (r) {
      if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
      return r.json();
    }).then(function (v) {
      if (typeof clearTimeout === 'function') clearTimeout(timer);
      return v;
    }, function (e) {
      if (typeof clearTimeout === 'function') clearTimeout(timer);
      throw e;
    });
  }
  function endpoint(p) { return API + '/repos/' + REPO + p; }

  /* 把 GitHub 原始 Issue / 回复整理成 schema 2，交给共用的渲染器 */
  function toData(issues, replies, slug, opts) {
    var o = opts || {};
    var rows = [];
    (Array.isArray(issues) ? issues : []).forEach(function (it) {
      if (!mine(it, slug) || !A.approved(it, o.approvalLabel)) return;
      var c = A.issueToComment(it, A.mdToText);
      rows.push(c);
      var kids = replies && replies[String(it.number)];
      if (Array.isArray(kids)) kids.forEach(function (k) {
        rows.push(A.replyToComment(k, c.id, A.mdToText));
      });
    });
    rows.sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    return A.makeData(slug, rows, o);
  }

  function cacheKey(slug) { return 'zb-live:v2:' + slug; }
  function cacheGet(slug) {
    try {
      var s = window.sessionStorage;
      if (!s) return null;
      var raw = s.getItem(cacheKey(slug));
      if (!raw) return null;
      var box = JSON.parse(raw);
      if (!box || !box.t || !box.data || Date.now() - box.t > TTL * 1000) return null;
      return box.data;
    } catch (e) { return null; }
  }
  function cacheSet(slug, data) {
    try {
      var s = window.sessionStorage;
      if (s) s.setItem(cacheKey(slug), JSON.stringify({ t: Date.now(), data: data }));
    } catch (e) { /* 隐私模式下不缓存，不影响显示 */ }
  }
  function note(show) {
    var el = document.getElementById && document.getElementById('zb-live-note');
    if (el) el.hidden = !show;
  }
  function paint(data, slug) {
    var post = data && data.posts && data.posts[slug];
    var total = post && Array.isArray(post.comments) ? post.comments.length : 0;
    var host = document.getElementById && document.getElementById('zb-live-host');
    if (!host) return;
    var arch = document.getElementById('zb-archive');
    if (!total) {
      host.innerHTML = '';
      if (arch) arch.hidden = false;
      return;
    }
    host.innerHTML = A.render(data, slug, { live: true, id: 'zb-live' });
    if (arch && arch !== host) arch.hidden = true;
    note(false);
  }

  function load(slug) {
    if (!LIVE || !REPO || !A || !safeSlug(slug)) return Promise.resolve(null);
    var mineSeq = seq;
    var cached = cacheGet(slug);
    if (cached) { paint(cached, slug); return Promise.resolve(cached); }
    return fetchJson(endpoint('/issues?state=open&sort=created&direction=asc&per_page=100'))
      .then(function (rows) {
        if (!Array.isArray(rows)) throw new Error('返回格式不正确');
        var mineRows = rows.filter(function (it) { return mine(it, slug); });
        var withReplies = mineRows.filter(function (it) { return Number(it.comments) > 0; })
          .slice(0, MAX_REPLIES);
        return Promise.all(withReplies.map(function (it) {
          var n = encodeURIComponent(it.number);
          return fetchJson(endpoint('/issues/' + n + '/comments?per_page=100'))
            .then(function (list) { return [String(it.number), Array.isArray(list) ? list : []]; })
            .catch(function () { return [String(it.number), []]; });
        })).then(function (pairs) {
          var map = {};
          pairs.forEach(function (p) { map[p[0]] = p[1]; });
          var data = toData(rows, map, slug, {
            repository: REPO, pageSize: C.pageSize, approvalLabel: C.approvalLabel
          });
          cacheSet(slug, data);
          if (mineSeq === seq) paint(data, slug);
          return data;
        });
      })
      .catch(function () { if (mineSeq === seq) note(true); return null; });
  }

  function newIssueUrl(slug, text) {
    if (typeof C.newIssueUrl !== 'function') return '';
    try { return String(C.newIssueUrl(slug, text) || ''); } catch (e) { return ''; }
  }
  function bindComposer(slug) {
    var input = document.getElementById && document.getElementById('zb-composer-input');
    var btn = document.getElementById && document.getElementById('zb-composer-submit');
    if (!input || !btn) return;
    var counter = document.getElementById('zb-composer-count');
    var after = document.getElementById('zb-composer-after');
    var mdBtn = document.getElementById('zb-composer-md');
    var preview = document.getElementById('zb-composer-preview');
    input.addEventListener && input.addEventListener('input', function () {
      if (counter) counter.textContent = String(String(input.value || '').length) + ' / 2000';
    });
    /* 预览只重画预览框，不改输入内容；再点一次回到编辑态 */
    if (mdBtn && preview) {
      mdBtn.addEventListener && mdBtn.addEventListener('click', function () {
        var toPreview = mdBtn.getAttribute('aria-pressed') !== 'true';
        if (toPreview) {
          var raw = String(input.value || '').replace(/&/g, '&amp;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
          preview.innerHTML = (A && typeof A.mdPreview === 'function')
            ? A.mdPreview(input.value)
            : raw.replace(/\n/g, '<br>');
          if (!String(input.value || '').trim()) {
            preview.innerHTML = '<p class="zb-preview-empty">（还没有内容，回到编辑写几句吧）</p>';
          }
          preview.hidden = false;
          input.hidden = true;
        } else {
          preview.hidden = true;
          input.hidden = false;
          try { input.focus(); } catch (e) {}
        }
        mdBtn.setAttribute('aria-pressed', toPreview ? 'true' : 'false');
        mdBtn.textContent = toPreview ? '回到编辑' : '预览 Markdown';
      });
    }
    btn.addEventListener && btn.addEventListener('click', function () {
      var text = String(input.value || '').trim();
      if (!text) { try { input.focus(); } catch (e) {} return; }
      var url = newIssueUrl(slug, text);
      if (!url) return;
      if (after) after.hidden = false;
      var w = null;
      try { w = window.open(url, '_blank', 'noopener'); } catch (e) { /* 被拦截则本页跳转 */ }
      if (!w) { try { window.location.href = url; } catch (e) {} }
    });
  }

  function mount(slug) {
    var s = safeSlug(slugOf(slug));
    if (!s) return;
    seq += 1;
    currentSlug = s;
    if (activeObserver) { try { activeObserver.disconnect(); } catch (e) {} activeObserver = null; }
    /* 预览态不显示写入入口：测试留言不会混进正式归档（SPA 与静态阅读版一致） */
    var preview = window.ZBInteractions && window.ZBInteractions.previewMode &&
      window.ZBInteractions.previewMode();
    if (preview) {
      var comp = document.getElementById && document.getElementById('zb-composer');
      if (comp) comp.hidden = true;
      var links = document.querySelector && document.querySelector('.interactions-links');
      if (links) links.hidden = true;
    }
    bindComposer(s);
    var slot = document.getElementById && document.getElementById('zb-slot');
    if (!slot || !LIVE || !REPO || !A) return;
    if (!cacheGet(s) && typeof IntersectionObserver === 'function') {
      var io = new IntersectionObserver(function (entries) {
        var hit = entries && entries.some(function (e) { return e.isIntersecting || e.intersectionRatio > 0; });
        if (!hit) return;
        try { io.disconnect(); } catch (e) {}
        activeObserver = null;
        load(s);
      }, { rootMargin: '240px' });
      activeObserver = io;
      try { io.observe(slot); } catch (e) { load(s); }
    } else {
      load(s);
    }
  }

  window.ZBLive = {
    mount: mount, load: load, toData: toData, paint: paint,
    mine: mine, fetchJson: fetchJson, currentSlug: function () { return currentSlug; }
  };
})();
