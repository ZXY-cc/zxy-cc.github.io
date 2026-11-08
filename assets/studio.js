/* 星梦Staream · 站长创作台
   静态站没有账号系统，因此「是不是我」由两层凭证判定：
   1) 设备凭证：创作台入口不再公开。持有 128 位密钥链接的设备首次访问 ?o=<密钥>
      时通过 SHA-256 校验并写入本机 90 天签名标记；之后导航才会出现创作台入口，
      其它设备的 #/studio 渲染为「页面不存在」，源码中只保留摘要（明码永不入库）。
   2) 发布凭证：真正把内容写上线时，用 GitHub 细粒度令牌，
      由 GitHub 服务器确认「你确实是这个仓库的所有者」，前端说了不算；
      令牌默认只在内存里存一次，不落本机存储。
   创作内容先存本机 localStorage，发布时整体重写 assets/site-data.js 推到仓库。 */

(function () {
  var DATA = window.STUDIO_DATA;
  if (!DATA) return;

  var SALT = 'paper-blank::owner::v1';
  var GATE_SALT = 'star-dream::owner-gate::v2';
  var OWNER_HASH = '6808eb10040f5bd56dd8de543b3ef4a0e9b5b3e3635ccf65ed1e5aa703d41d47';
  var DEVICE_KEY = 'zb-owner-device';
  var LOCAL_KEY = 'zb-studio-local';
  var PAT_KEY = 'zb-gh-pat';
  var REPO = 'ZXY-cc/zxy-cc.github.io';
  var FILE = 'assets/site-data.js';
  var BRANCH = 'main';
  var DAYS = 90;
  var KINDS = ['posts', 'moments', 'chatter', 'albums', 'projects', 'friends'];
  var DRAFT_KEY = 'zb-studio-draft';
  var CATS = ['随笔', '算法', '建站', '随想', '笔记', '其它'];
  var state = { tab: 'post', msg: '', busy: false, files: [], mode: 'write', draft: null, saveTimer: null };

  /* ---------- 同步 SHA-256（不依赖 Web Crypto，http / file 下同样可用） ---------- */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256(msg) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var s = unescape(encodeURIComponent(String(msg)));
    var b = [], i;
    for (i = 0; i < s.length; i++) b.push(s.charCodeAt(i));
    var bits = b.length * 8;
    b.push(0x80);
    while (b.length % 64 !== 56) b.push(0);
    b.push(0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);
    for (var off = 0; off < b.length; off += 64) {
      var w = [];
      for (i = 0; i < 16; i++) {
        w[i] = ((b[off + i * 4] << 24) | (b[off + i * 4 + 1] << 16) |
                (b[off + i * 4 + 2] << 8) | b[off + i * 4 + 3]) >>> 0;
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & bb) ^ (a & c) ^ (bb & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + bb) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('');
  }

  /* ---------- 本机存储 ---------- */
  function ls(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function setLs(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function delLs(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  function blank() {
    var o = {};
    KINDS.forEach(function (k) { o[k] = []; });
    return o;
  }
  function readLocal() {
    var o = null;
    try { o = JSON.parse(ls(LOCAL_KEY) || 'null'); } catch (e) { o = null; }
    var b = blank();
    if (o) KINDS.forEach(function (k) { if (Object.prototype.toString.call(o[k]) === '[object Array]') b[k] = o[k]; });
    return b;
  }
  function keyOf(x, k) { return k === 'posts' ? (x.slug || '') : (x.id || ''); }
  /* 内置内容快照：每次合并都先回到线上版本，再叠加本机条目，
     这样删除本机条目不会把 site-data.js 里的原有内容一起抹掉。 */
  var BUILTIN = {};
  KINDS.forEach(function (k) {
    BUILTIN[k] = JSON.parse(JSON.stringify(
      Object.prototype.toString.call(DATA[k]) === '[object Array]' ? DATA[k] : []));
  });
  function mergeLocal() {
    var local = readLocal();
    KINDS.forEach(function (k) {
      var base = JSON.parse(JSON.stringify(BUILTIN[k]));
      local[k].forEach(function (item) {
        var id = keyOf(item, k);
        if (!id) return;
        var found = false;
        for (var i = 0; i < base.length; i++) {
          if (keyOf(base[i], k) === id) { base[i] = item; found = true; break; }
        }
        if (!found) base.push(item);
      });
      DATA[k] = base;
    });
  }
  function upsert(kind, item) {
    var local = readLocal();
    var id = keyOf(item, kind);
    var replaced = false;
    local[kind] = local[kind].map(function (x) {
      if (keyOf(x, kind) === id) { replaced = true; return item; }
      return x;
    });
    if (!replaced) local[kind].push(item);
    if (!setLs(LOCAL_KEY, JSON.stringify(local))) return false;
    mergeLocal();
    return true;
  }
  function remove(kind, id) {
    var local = readLocal();
    local[kind] = local[kind].filter(function (x) { return keyOf(x, kind) !== id; });
    setLs(LOCAL_KEY, JSON.stringify(local));
    mergeLocal();
  }

  /* ---------- 判定：设备凭证 ----------
     标记绑定门禁摘要：sig = sha256(OWNER_HASH + '::device::' + t)。
     注意：本地标记只控制「是否显示创作台界面」，不含密钥本身；
     真正的发布权限永远由 GitHub 细粒度令牌决定，伪造本机标记拿不到任何内容。 */
  function isOwner() {
    var m = null;
    try { m = JSON.parse(ls(DEVICE_KEY) || 'null'); } catch (e) { m = null; }
    if (!m || !m.t) return false;
    if (Date.now() - m.t > DAYS * 86400000 * 1000) return false;
    return m.sig === sha256(OWNER_HASH + '::device::' + m.t);
  }
  function grant() {
    var t = Date.now();
    setLs(DEVICE_KEY, JSON.stringify({ t: t, sig: sha256(OWNER_HASH + '::device::' + t) }));
  }
  function revoke() { delLs(DEVICE_KEY); }
  function gateCheck(key) { return sha256(GATE_SALT + String(key || '').trim()) === OWNER_HASH; }
  /* 密钥只可能通过 URL 参数送进来：校验通过即写本机 90 天标记，
     随后立刻把地址栏清理成不含密钥的干净 URL。 */
  function gateBoot() {
    var q = null;
    try { q = new URLSearchParams(String(window.location.search || '')); } catch (e) { q = null; }
    if (!q || !q.has('o')) return false;
    var key = q.get('o') || '';
    if (gateCheck(key)) {
      grant();
      try {
        window.history.replaceState(null, '',
          String(window.location.pathname || '/') +
          String(window.location.hash || ''));
      } catch (e) {}
      return true;
    }
    return false;
  }
  function syncNav() {
    var nav = document.querySelector && document.querySelector('.nav');
    if (!nav || !nav.querySelector) return;
    var a = nav.querySelector('[data-nav="studio"]');
    if (isOwner() && !a) {
      var el = document.createElement('a');
      el.setAttribute('href', '#/studio');
      el.setAttribute('data-nav', 'studio');
      el.textContent = '创作台';
      nav.appendChild(el);
    } else if (!isOwner() && a && a.parentNode) {
      a.parentNode.removeChild(a);
    }
  }

  /* ---------- Markdown + LaTeX ----------
     渲染统一交给 assets/markdown.js（window.ZBMD）：创作台预览、前台文章、
     静态阅读版共用同一套输出，公式与代码块都不会被二次转义。 */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function mdRender(s) {
    return window.ZBMD ? window.ZBMD.render(s) : '<p>' + esc(s) + '</p>';
  }
  function htmlOfBody(s) { return mdRender(s); }
  /* 早期文章只存渲染后的 HTML，回填编辑器时近似还原为可读的 Markdown */
  function htmlToMd(s) {
    return String(s || '')
      .replace(/<h2[^>]*>/gi, '## ').replace(/<\/h2>/gi, '\n\n')
      .replace(/<h3[^>]*>/gi, '### ').replace(/<\/h3>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '- ').replace(/<\/li>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ---------- 小工具 ---------- */
  function today() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function uid(p) { return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function splitTags(s) { return s.split(/[,，、\s]+/).filter(Boolean); }

  /* ---------- 写文章工作台：草稿、工具栏与属性 ---------- */
  function blankDraft() {
    return { slug: '', title: '', markdown: '', tags: [], cover: '',
      summary: '', category: '随笔', date: today(), status: 'draft', savedAt: '' };
  }
  function readDraft() {
    var d = null, b = blankDraft();
    try { d = JSON.parse(ls(DRAFT_KEY) || 'null'); } catch (e) { d = null; }
    if (d && typeof d === 'object') {
      ['slug', 'title', 'markdown', 'cover', 'summary', 'category', 'date', 'status', 'savedAt']
        .forEach(function (k) { if (d[k] != null) b[k] = String(d[k]); });
      if (Object.prototype.toString.call(d.tags) === '[object Array]') b.tags = d.tags.slice();
    }
    return b;
  }
  function savedLabel() {
    var d = state.draft || blankDraft();
    return d.savedAt ? '已自动保存至本机 · ' + d.savedAt : '文档尚未保存在本机';
  }
  function paintSaveLabel() {
    var a = document.getElementById('draft-saved');
    if (a) a.textContent = savedLabel();
    var b = document.getElementById('meta-saved');
    if (b) b.textContent = (state.draft && state.draft.savedAt) ? state.draft.savedAt : '尚未落盘';
  }
  function syncFromForm() {
    var d = state.draft || (state.draft = readDraft());
    d.title = val('f-title');
    var body = document.getElementById('f-body');
    if (body) d.markdown = body.value;
    d.cover = val('f-cover');
    d.summary = val('f-summary');
    d.category = val('f-category') || d.category;
    d.date = val('f-date') || d.date;
    var wc = document.getElementById('word-count');
    if (wc) wc.textContent = String(d.markdown.replace(/\s/g, '').length) + ' 字';
    return d;
  }
  function writeDraft(quiet) {
    var d = syncFromForm(), t = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    d.savedAt = p(t.getHours()) + ':' + p(t.getMinutes());
    if (!setLs(DRAFT_KEY, JSON.stringify(d))) {
      if (!quiet) say('本机存储空间不足，请先发布并清理。', 'warn');
      return false;
    }
    paintSaveLabel();
    return true;
  }
  function scheduleSave() {
    if (state.saveTimer) window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(function () { writeDraft(true); }, 500);
  }
  function refreshPreview() {
    var box = document.getElementById('post-preview');
    if (box) box.innerHTML = mdRender(syncFromForm().markdown);
    var desk = document.getElementById('desk-body');
    if (desk) desk.setAttribute('data-mode', state.mode);
  }
  function setMode(m) {
    state.mode = m;
    var desk = document.getElementById('desk-body');
    if (desk) desk.setAttribute('data-mode', m);
    var btns = document.querySelectorAll ? document.querySelectorAll('[data-mode-btn]') : [];
    Array.prototype.forEach.call(btns, function (b) {
      var on = b.getAttribute('data-mode-btn') === m;
      if (b.classList) b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    refreshPreview();
  }
  function renderTagPills() {
    var box = document.getElementById('tag-pills');
    if (!box) return;
    var d = state.draft || blankDraft();
    box.innerHTML = d.tags.length ? d.tags.map(function (t) {
      return '<span class="zb-tag-pill">#' + esc(t) +
        '<button type="button" data-tag-del="' + esc(t) + '" aria-label="移除标签">×</button></span>';
    }).join('') : '<span class="tag-empty">还没有标签</span>';
  }
  function historyTags() {
    var seen = {}, out = [];
    (window.POSTS || []).concat(DATA.posts || []).forEach(function (p) {
      (p.tags || []).forEach(function (t) { if (!seen[t]) { seen[t] = 1; out.push(t); } });
    });
    return out.slice(0, 18);
  }
  function renderTagHistory() {
    var box = document.getElementById('tag-history');
    if (!box) return;
    var cur = (state.draft || blankDraft()).tags;
    box.innerHTML = historyTags().map(function (t) {
      return '<button type="button" class="tag-history-btn' + (cur.indexOf(t) >= 0 ? ' on' : '') +
        '" data-tag-add="' + esc(t) + '">+ ' + esc(t) + '</button>';
    }).join('') || '<span class="tag-empty">暂无历史标签</span>';
  }
  function renderCover() {
    var box = document.getElementById('cover-box');
    if (!box) return;
    var u = val('f-cover');
    box.innerHTML = u ? '<img src="' + esc(u) + '" alt="封面预览">' :
      '<span class="cover-empty">点击上传封面 / 粘贴图片 URL</span>';
  }
  function addTag(t) {
    var d = state.draft || (state.draft = readDraft());
    t = String(t || '').trim().replace(/^#/, '');
    if (!t || d.tags.indexOf(t) >= 0) return;
    d.tags.push(t);
    renderTagPills(); renderTagHistory(); writeDraft(true);
  }
  function delTag(t) {
    var d = state.draft || readDraft();
    d.tags = d.tags.filter(function (x) { return x !== t; });
    state.draft = d;
    renderTagPills(); renderTagHistory(); writeDraft(true);
  }
  function insertMd(before, after, placeholder) {
    var ta = document.getElementById('f-body');
    if (!ta) return;
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    var sel = v.slice(s, e) || placeholder || '';
    ta.value = v.slice(0, s) + before + sel + (after || '') + v.slice(e);
    ta.focus();
    if (ta.setSelectionRange) {
      var caret = s + before.length + sel.length;
      ta.setSelectionRange(caret, caret);
    }
    syncFromForm(); refreshPreview(); scheduleSave();
  }
  /* 工具栏：前面是 Markdown，后面是 LaTeX；点击往光标处插入对应源码 */
  var MD_TOOLS = [
    ['H2', '## ', '', '二级标题'], ['H3', '### ', '', '三级标题'],
    ['B', '**', '**', '加粗'], ['I', '*', '*', '斜体'], ['S', '~~', '~~', '删除线'],
    ['`', '`', '`', '行内代码'], ['{ }', '\n```c\n', '\n```\n', '代码块'],
    ['❝', '> ', '', '引用'], ['•', '- ', '', '无序列表'], ['1.', '1. ', '', '有序列表'],
    ['☑', '- [ ] ', '', '任务项'],
    ['▦', '\n| 列一 | 列二 |\n| :---: | :---: |\n| 内容 | 内容 |\n', '', '表格'],
    ['↗', '[', '](https://)', '链接'], ['▣', '![说明](', ')', '图片'],
    ['—', '\n---\n', '', '分隔线'],
    ['$', '$', '$', '行内公式'], ['$$', '\n$$\n', '\n$$\n', '块级公式'],
    ['a/b', '\\frac{', '}{b}', '分式'], ['√', '\\sqrt{', '}', '根号'],
    ['∑', '\\sum_{i=1}^{n} ', '', '求和'], ['α', '\\alpha ', '', '希腊字母']
  ];
  var TEX_SNIPPETS = [
    ['\\frac{a}{b}', '分式'], ['\\sqrt{x}', '根号'], ['x^{2}', '上标'],
    ['a_{i}', '下标'], ['\\sum_{i=1}^{n}', '求和'], ['\\int_0^1', '积分'],
    ['\\lim_{x \\to 0}', '极限'], ['\\alpha \\beta \\gamma', '希腊字母'],
    ['\\le \\ge \\ne \\approx', '关系符'], ['\\times \\cdot \\pm \\infty', '运算符'],
    ['\\mathbb{R}', '数集'], ['\\text{文字}', '公式内文字'],
    ['$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$', '整行示例']
  ];
  function toolHtml() {
    return MD_TOOLS.map(function (t, i) {
      return '<button class="md-tool" type="button" data-md="' + i + '" title="' + esc(t[3]) +
        '" aria-label="' + esc(t[3]) + '">' + esc(t[0]) + '</button>';
    }).join('');
  }
  function setDeskWidth(on) {
    var shell = document.querySelector && document.querySelector('.shell');
    if (shell && shell.classList) shell.classList.toggle('is-wide', !!on);
  }
  function download(name, text) {
    try {
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    } catch (e) { say('下载失败，请改用导出内容手动复制。'); }
  }
  function dataFile() {
    return '/* 星梦Staream · 由创作台发布生成 */\nwindow.STUDIO_DATA = ' +
      JSON.stringify(DATA, null, 2) + ';\n';
  }
  function say(msg, kind) {
    state.msg = msg;
    var box = document.getElementById('studio-msg');
    if (box) { box.textContent = msg; box.className = 'studio-msg ' + (kind || 'ok'); }
  }
  function reloadSoon(msg) {
    say(msg + ' · 正在刷新…');
    window.setTimeout(function () { location.reload(); }, 700);
  }

  /* ---------- 解锁页 ---------- */
  function lockHtml() {
    /* 非站长设备看到的和访问任何不存在的路径完全一样：没有激活码、没有创作台、没有任何提示 */
    return '<div class="notfound glass">' +
      '<div class="lock-star"><svg viewBox="0 0 100 100"><use href="#puffy-star"/></svg></div>' +
      '<h1>页面不存在</h1>' +
      '<p>你要找的页面可能已被移动或删除。</p>' +
      '<p><a class="soft-btn" href="#/">回到首页</a></p></div>';
  }

  /* ---------- 创作台外壳 ---------- */
  function tabHtml() {
    var tabs = [
      ['post', '写文章'], ['photo', '发图片'], ['moment', '发说说'], ['chatter', '发杂谈'],
      ['project', '项目'], ['friend', '友链'], ['manage', '内容管理'], ['publish', '发布上线']
    ];
    return '<div class="studio-tabs">' + tabs.map(function (t) {
      return '<button class="stab' + (state.tab === t[0] ? ' on' : '') + '" type="button" data-tab="' +
        t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  }
  function field(label, id, ph, type) {
    return '<label class="f-label" for="' + id + '">' + label + '</label>' +
      '<input class="f-input" id="' + id + '" type="' + (type || 'text') + '" placeholder="' + (ph || '') + '">';
  }
  function area(label, id, ph, rows) {
    return '<label class="f-label" for="' + id + '">' + label + '</label>' +
      '<textarea class="f-input f-area" id="' + id + '" rows="' + (rows || 7) +
      '" placeholder="' + (ph || '') + '"></textarea>';
  }
  /* 仿参考站：左侧沉浸式编辑区（大标题 + 整行工具栏 + 正文），
     右侧窄栏放封面 / 标签 / 分类 / 摘要 / 日期与发布动作。 */
  function formPost() {
    var d = state.draft || readDraft();
    var modes = [['write', '写作'], ['split', '并排'], ['preview', '预览']];
    return '<div class="studio-desk" id="studio-desk">' +
      '<section class="desk-editor glass">' +
        '<div class="desk-title-row">' +
          '<input id="f-title" class="desk-title" type="text" placeholder="文章大标题…" ' +
            'value="' + esc(d.title) + '" aria-label="文章标题">' +
          '<span class="desk-saved" id="draft-saved">' + esc(savedLabel()) + '</span>' +
        '</div>' +
        '<div class="desk-toolbar" role="toolbar" aria-label="Markdown 与 LaTeX 工具栏">' +
          '<div class="md-tools">' + toolHtml() + '</div>' +
          '<div class="mode-switch" role="group" aria-label="编辑视图">' + modes.map(function (m) {
            return '<button type="button" data-mode-btn="' + m[0] + '" aria-pressed="' +
              (state.mode === m[0] ? 'true' : 'false') + '" class="' +
              (state.mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="desk-body" id="desk-body" data-mode="' + state.mode + '">' +
          '<textarea id="f-body" class="desk-textarea" spellcheck="false" ' +
            'placeholder="用 Markdown 写正文，用 $…$ / $$…$$ 写 LaTeX 公式…">' +
            esc(d.markdown) + '</textarea>' +
          '<div id="post-preview" class="desk-preview article-body"></div>' +
        '</div>' +
        '<div class="desk-foot"><span>支持 Markdown 与 LaTeX · 自动保存在本机</span>' +
          '<span id="word-count">0 字</span>' +
          '<button class="mini-btn" type="button" data-act="tex-help">公式速查</button></div>' +
        '<div id="tex-help" class="tex-help" hidden><b>常用 LaTeX · 点击插入</b>' +
          '<div class="tex-list">' + TEX_SNIPPETS.map(function (t, n) {
            return '<button type="button" data-tex="' + n + '" title="插入到正文">' +
              '<code>' + esc(t[0]) + '</code><span>' + esc(t[1]) + '</span></button>';
          }).join('') + '</div></div>' +
      '</section>' +
      '<aside class="desk-meta glass">' +
        '<div class="meta-head"><span>POST MODE</span><h2>属性设置</h2></div>' +
        '<div class="meta-scroll">' +
          '<section class="meta-group"><div class="meta-label l-blue">COVER IMAGE · 封面图</div>' +
            '<div class="cover-box" id="cover-box" data-act="cover-pick" role="button" tabindex="0" ' +
              'title="点击选择本地图片"></div>' +
            '<input class="f-input" id="f-cover" type="text" placeholder="或粘贴图片 URL…" ' +
              'value="' + esc(d.cover) + '" aria-label="封面图地址">' +
            '<input class="f-input f-file" id="f-cover-file" type="file" accept="image/*" aria-label="上传封面图">' +
          '</section>' +
          '<section class="meta-group"><div class="meta-label l-pink">RELEVANT TAGS · 标签</div>' +
            '<div class="tag-pills" id="tag-pills"></div>' +
            '<input class="f-input" id="f-tag-input" type="text" placeholder="+ 输入标签后按回车">' +
            '<div class="tag-history" id="tag-history"></div>' +
          '</section>' +
          '<section class="meta-group"><div class="meta-label l-violet">WORDS STORIES · 分类</div>' +
            '<div class="cat-pills" id="cat-pills">' + CATS.map(function (c) {
              return '<button type="button" data-cat="' + esc(c) + '" class="' +
                (d.category === c ? 'on' : '') + '">' + esc(c) + '</button>';
            }).join('') + '</div>' +
            '<input class="f-input" id="f-category" type="text" placeholder="也可以自己写一个" ' +
              'value="' + esc(d.category) + '" aria-label="分类">' +
          '</section>' +
          '<section class="meta-group"><div class="meta-label l-green">DESCRIPTION · 摘要</div>' +
            '<textarea class="f-input f-area" id="f-summary" rows="4" ' +
              'placeholder="记录一下这篇内容的核心思绪…">' + esc(d.summary) + '</textarea>' +
            '<p class="meta-note">摘要会显示在首页卡片与搜索结果里。</p>' +
          '</section>' +
          '<section class="meta-group"><div class="meta-label l-amber">PUBLISH DATE · 日期</div>' +
            '<input class="f-input" id="f-date" type="date" value="' + esc(d.date) + '">' +
          '</section>' +
        '</div>' +
        '<div class="meta-foot">' +
          '<div class="meta-status">最近落盘：<b id="meta-saved">' + esc(d.savedAt || '尚未落盘') + '</b></div>' +
          '<div class="meta-actions">' +
            '<button class="soft-btn" type="button" data-act="draft-save">存为草稿</button>' +
            '<button class="primary-btn" type="button" data-act="publish-post">正式发布</button>' +
          '</div>' +
          '<p class="meta-hint">发布先写入本机内容；要让访客看到，请到「发布上线」导出或一键提交。</p>' +
        '</div>' +
      '</aside></div>';
  }
  function albumOptions() {
    var albums = DATA.albums || [];
    return '<option value="__new__">＋ 新建一个相册</option>' + albums.map(function (a) {
      return '<option value="' + esc(a.id) + '">' + esc(a.title) + '</option>';
    }).join('');
  }
  function formPhoto() {
    return '<div class="studio-form glass"><h2>发图片</h2>' +
      '<p class="f-hint">图片会压到最长边 1200px 再存进本机，发布时一起写进站点数据文件。</p>' +
      '<label class="f-label" for="f-album">归入相册</label>' +
      '<select class="f-input" id="f-album">' + albumOptions() + '</select>' +
      '<div id="new-album-box">' + field('新相册标题', 'f-album-title', '例如：周末的光') +
      field('新相册说明', 'f-album-desc', '一句话') + '</div>' +
      '<label class="f-label" for="f-files">选择图片（可多选）</label>' +
      '<input class="f-input f-file" id="f-files" type="file" accept="image/*" multiple>' +
      field('照片说明', 'f-photo-note', '留一句给这张照片（可选）') +
      '<div id="file-preview" class="file-preview"></div>' +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="save-photo">保存到本机</button></div></div>';
  }
  function formMoment() {
    return '<div class="studio-form glass"><h2>发一条说说</h2>' +
      area('这一刻想说什么', 'f-moment-text', '…', 5) +
      '<div class="f-row">' + field('心情', 'f-mood', '✨ 满足') + field('地点', 'f-place', '书桌前') + '</div>' +
      '<label class="f-label" for="f-moment-img">配一张图（可选）</label>' +
      '<input class="f-input f-file" id="f-moment-img" type="file" accept="image/*">' +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="save-moment">保存到本机</button></div></div>';
  }
  function formChatter() {
    return '<div class="studio-form glass"><h2>写一则杂谈</h2>' +
      field('标题', 'f-ch-title', '比文章短一点的标题') +
      field('摘要', 'f-ch-summary', '一句话') +
      '<div class="f-row">' + field('标签（逗号分隔）', 'f-ch-tags', '随笔, 建站') + field('心情', 'f-ch-mood', '🌸 平静') + '</div>' +
      area('正文', 'f-ch-body', '想到哪写到哪…', 10) +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="save-chatter">保存到本机</button></div></div>';
  }
  function formProject() {
    return '<div class="studio-form glass"><h2>添加一个项目</h2>' +
      field('名称', 'f-pj-name', '项目名') + area('描述', 'f-pj-desc', '做了什么', 4) +
      '<div class="f-row">' + field('技术标签（逗号分隔）', 'f-pj-tags', 'Python, 算法') + field('状态', 'f-pj-status', '进行中') + '</div>' +
      field('链接', 'f-pj-link', '#/about 或 https://…') +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="save-project">保存到本机</button></div></div>';
  }
  function formFriend() {
    return '<div class="studio-form glass"><h2>添加一个友链</h2>' +
      field('名称', 'f-fr-name', '站点名') + area('描述', 'f-fr-desc', '一句话介绍', 3) +
      '<div class="f-row">' + field('地址', 'f-fr-url', 'https://…') + field('首字母标记', 'f-fr-initial', 'GH') + '</div>' +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="save-friend">保存到本机</button></div></div>';
  }
  function formManage() {
    var local = readLocal();
    var labels = { posts: '文章', moments: '说说', chatter: '杂谈', albums: '相册', projects: '项目', friends: '友链' };
    var rows = [];
    KINDS.forEach(function (k) {
      local[k].forEach(function (x) {
        var name = k === 'posts' ? x.title : (x.title || x.name || (x.text || '').slice(0, 22));
        rows.push('<div class="manage-row"><span class="mr-kind">' + labels[k] + '</span>' +
          '<b>' + esc(name) + '</b><span class="mr-id">' + esc(keyOf(x, k)) + '</span>' +
          (k === 'posts' ? '<button class="mini-btn" type="button" data-edit="' +
            esc(k + '::' + keyOf(x, k)) + '">编辑</button>' : '') +
          '<button class="mini-btn" type="button" data-del="' + esc(k + '::' + keyOf(x, k)) + '">删除</button></div>');
      });
    });
    var size = 0;
    try { size = (ls(LOCAL_KEY) || '').length; } catch (e) {}
    return '<div class="studio-form glass"><h2>内容管理</h2>' +
      '<p class="f-hint">这里只列「保存在本机、还没清理」的条目；已经发布上线的内容同样在这里，删除只会移除本机副本与当前页面显示，不会自动改动线上文件。</p>' +
      '<div class="manage-list">' + (rows.length ? rows.join('') : '<p class="page-note">本机还没有新增内容。</p>') + '</div>' +
      '<p class="f-hint">本机占用约 ' + (size / 1024).toFixed(0) + ' KB。发布成功后可清理本机副本，避免浏览器存储被图片占满。</p>' +
      '<div class="f-actions"><button class="soft-btn" type="button" data-act="clear-local">清理本机副本</button></div></div>';
  }
  function formPublish() {
    return '<div class="studio-form glass"><h2>发布上线</h2>' +
      '<p class="f-hint">静态博客没有服务器，所以「让所有访客看到」必须把数据文件写回 GitHub 仓库。<br>' +
      '下面两种办法任选其一，都能让 https://zxy-blog.top 更新。</p>' +
      '<h3>办法一 · 导出文件交给助手</h3>' +
      '<p class="f-hint">下载 <code>site-data.js</code>，发给我，我用仓库部署密钥推送（不需要你给任何令牌）。</p>' +
      '<div class="f-actions"><button class="soft-btn" type="button" data-act="export-js">下载 site-data.js</button>' +
      '<button class="soft-btn" type="button" data-act="export-json">下载备份 JSON</button></div>' +
      '<h3>办法二 · 自己一键发布</h3>' +
      '<p class="f-hint">在 GitHub 生成一个 <b>细粒度令牌</b>，只授权 <code>ZXY-cc/zxy-cc.github.io</code> 的 Contents 读写。' +
      '令牌只保存在这台设备的浏览器里，只发往 api.github.com，不会写进任何导出文件。</p>' +
      field('GitHub 细粒度令牌', 'f-pat', 'github_pat_…', 'password') +
      '<label class="f-check"><input type="checkbox" id="f-remember"> 记住令牌到本机（可选；默认只保存在内存，刷新即弃）</label>' +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="publish">提交到仓库并发布</button></div>' +
      '<p class="f-hint">提交后 GitHub Pages 通常 1 分钟内完成构建；期间本站仍在显示旧内容，属正常现象。</p></div>';
  }
  function formHtml() {
    return {
      post: formPost, photo: formPhoto, moment: formMoment, chatter: formChatter,
      project: formProject, friend: formFriend, manage: formManage, publish: formPublish
    }[state.tab]();
  }
  function studioHtml() {
    return '<div class="studio-wrap' + (state.tab === 'post' ? ' is-desk' : '') + '" id="studio-panel">' +
      '<div class="studio-head glass"><div><div class="page-kicker">OWNER STUDIO</div>' +
      '<h1>创作台</h1><p>这台设备已识别为站长的设备 · 内容先存本机，发布后才对所有访客可见。</p></div>' +
      '<button class="soft-btn" type="button" data-act="lock">退出站长模式</button></div>' +
      tabHtml() + '<div id="studio-msg" class="studio-msg">' + esc(state.msg) + '</div>' +
      formHtml() + '</div>';
  }

  /* ---------- 图片压缩 ---------- */
  function compress(file, done, maxSide, quality) {
    try {
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          var max = maxSide || 1200, w = img.width, h = img.height;
          var s = Math.min(1, max / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.round(w * s); c.height = Math.round(h * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          done(c.toDataURL('image/jpeg', quality || .82));
        };
        img.onerror = function () { done(''); };
        img.src = ev.target.result;
      };
      reader.onerror = function () { done(''); };
      reader.readAsDataURL(file);
    } catch (e) { done(''); }
  }

  /* ---------- 保存动作 ---------- */
  /* 保存时同时留下 Markdown / LaTeX 原文与渲染后的 HTML：
     原文供再次编辑，HTML 供前台与静态阅读版直接显示；时间统一只留日期。 */
  function savePost(asDraft) {
    var d = syncFromForm();
    if (!d.title) return say('请先写标题。', 'warn');
    if (!d.markdown) return say('正文还是空的。', 'warn');
    writeDraft(true);
    if (asDraft) return say('草稿已保存到本机，下次打开创作台会继续这一篇。');
    var item = {
      slug: d.slug || uid('p'), title: d.title, date: d.date || today(),
      tags: d.tags.slice(), category: d.category || '', cover: d.cover || '',
      summary: d.summary || (window.ZBMD ? window.ZBMD.plain(d.markdown).slice(0, 90) : '') || d.title,
      markdown: d.markdown, body: mdRender(d.markdown),
      format: 'markdown', status: 'published'
    };
    if (!upsert('posts', item)) return say('本机存储空间不足，请先到「发布上线」导出并清理。', 'warn');
    d.slug = item.slug; d.status = 'published';
    writeDraft(true);
    reloadSoon('文章已发布到本机内容');
  }
  function saveMoment() {
    var text = val('f-moment-text');
    if (!text) return say('说点什么再保存吧。', 'warn');
    var src = state.momentImg || '';
    var item = {
      id: uid('m'), date: today(), text: text,
      mood: val('f-mood') || '✨ 记录', place: val('f-place') || '',
      images: src ? [src] : [], likes: 0
    };
    if (!upsert('moments', item)) return say('本机存储空间不足，请先发布并清理。', 'warn');
    state.momentImg = '';
    reloadSoon('说说已保存');
  }
  function saveChatter() {
    var title = val('f-ch-title'), body = val('f-ch-body');
    if (!title || !body) return say('标题和正文都要填。', 'warn');
    var item = {
      id: uid('c'), date: today(), title: title,
      summary: val('f-ch-summary') || title.slice(0, 24), tags: splitTags(val('f-ch-tags')),
      mood: val('f-ch-mood') || '🌸 平静', body: htmlOfBody(body)
    };
    if (!upsert('chatter', item)) return say('本机存储空间不足，请先发布并清理。', 'warn');
    reloadSoon('杂谈已保存');
  }
  function saveProject() {
    var name = val('f-pj-name');
    if (!name) return say('项目名不能为空。', 'warn');
    var item = {
      id: uid('pj'), name: name, desc: val('f-pj-desc'), tags: splitTags(val('f-pj-tags')),
      status: val('f-pj-status') || '记录', date: today(), link: val('f-pj-link')
    };
    if (!upsert('projects', item)) return say('保存失败。', 'warn');
    reloadSoon('项目已保存');
  }
  function saveFriend() {
    var name = val('f-fr-name'), url = val('f-fr-url');
    if (!name || !url) return say('名称和地址都要填。', 'warn');
    var item = {
      name: name, desc: val('f-fr-desc'), url: url,
      status: 'Online', initial: val('f-fr-initial') || name.slice(0, 2)
    };
    item.id = uid('fr');
    if (!upsert('friends', item)) return say('保存失败。', 'warn');
    reloadSoon('友链已保存');
  }
  function savePhoto() {
    if (!state.files.length) return say('还没有选图片。', 'warn');
    var sel = val('f-album');
    var albums = DATA.albums || [];
    var album = null, i;
    if (sel && sel !== '__new__') {
      for (i = 0; i < albums.length; i++) if (albums[i].id === sel) album = albums[i];
    }
    if (!album) {
      var t = val('f-album-title');
      if (!t) return say('新建相册要写个标题。', 'warn');
      album = { id: uid('a'), title: t, date: today(), desc: val('f-album-desc') || t, cover: '', photos: [] };
    } else {
      album = JSON.parse(JSON.stringify(album));
    }
    var note = val('f-photo-note');
    state.files.forEach(function (src, n) {
      album.photos.push({ src: src, title: note || (album.title + ' · ' + (n + 1)), note: note || '' });
    });
    if (!album.cover && album.photos.length) album.cover = album.photos[0].src;
    if (!upsert('albums', album)) return say('图片太大，本机存不下；请先发布已保存的内容并清理。', 'warn');
    state.files = [];
    reloadSoon('已加入 ' + album.photos.length + ' 张照片');
  }

  /* ---------- 一键发布 ---------- */
  function b64utf8(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function publish() {
    if (state.busy) return;
    var pat = val('f-pat') || ls(PAT_KEY) || '';
    if (!pat) return say('先填入 GitHub 细粒度令牌，或者用「办法一」导出文件发给我。', 'warn');
    var remember = document.getElementById('f-remember');
    if (remember && remember.checked) setLs(PAT_KEY, pat);
    else delLs(PAT_KEY);
    state.busy = true;
    say('正在提交到仓库…');
    var url = 'https://api.github.com/repos/' + REPO + '/contents/' + FILE;
    var headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + pat,
      'Content-Type': 'application/json'
    };
    fetch(url + '?ref=' + BRANCH, { method: 'GET', headers: headers })
      .then(function (r) {
        if (!r.ok) throw new Error('读取仓库失败（HTTP ' + r.status + '），请检查令牌权限。');
        return r.json();
      })
      .then(function (d) {
        return fetch(url, {
          method: 'PUT', headers: headers,
          body: JSON.stringify({
            message: 'content: publish from owner studio ' + today(),
            content: b64utf8(dataFile()), sha: d.sha, branch: BRANCH
          })
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error('提交失败（HTTP ' + r.status + '），请检查令牌是否有 Contents 写权限。');
        return r.json();
      })
      .then(function () {
        state.busy = false;
        say('已提交到 GitHub，Pages 构建完成后全网可见（通常 1 分钟内）。');
      })
      .catch(function (e) {
        state.busy = false;
        say(String(e.message || e), 'warn');
      });
  }

  /* ---------- 事件 ---------- */
  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var panel = t.closest('#studio-panel') || t.closest('.studio-lock');
    var door = t.closest('#owner-door');
    if (!panel && !door) return;

    /* 写作工作台：工具栏插入、视图切换、标签 / 分类、公式速查 */
    var mdBtn = t.closest('[data-md]');
    if (mdBtn) {
      var tool = MD_TOOLS[Number(mdBtn.getAttribute('data-md'))];
      if (tool) insertMd(tool[1], tool[2], '');
      return;
    }
    var modeBtn = t.closest('[data-mode-btn]');
    if (modeBtn) { setMode(modeBtn.getAttribute('data-mode-btn')); return; }
    var tagDel = t.closest('[data-tag-del]');
    if (tagDel) { delTag(tagDel.getAttribute('data-tag-del')); return; }
    var tagAdd = t.closest('[data-tag-add]');
    if (tagAdd) { addTag(tagAdd.getAttribute('data-tag-add')); return; }
    var catBtn = t.closest('[data-cat]');
    if (catBtn) {
      var cv = catBtn.getAttribute('data-cat'), ci = document.getElementById('f-category');
      if (ci) ci.value = cv;
      var cats = document.querySelectorAll ? document.querySelectorAll('[data-cat]') : [];
      Array.prototype.forEach.call(cats, function (b) {
        if (b.classList) b.classList.toggle('on', b.getAttribute('data-cat') === cv);
      });
      writeDraft(true);
      return;
    }
    var texBtn = t.closest('[data-tex]');
    if (texBtn) {
      var sn = TEX_SNIPPETS[Number(texBtn.getAttribute('data-tex'))];
      if (sn) insertMd(sn[0], '', '');
      return;
    }
    var edit = t.closest('[data-edit]');
    if (edit) {
      var ep = edit.getAttribute('data-edit').split('::');
      var target = (DATA[ep[0]] || []).filter(function (x) {
        return keyOf(x, ep[0]) === ep[1];
      })[0];
      if (target) {
        var d = blankDraft();
        d.slug = target.slug || ''; d.title = target.title || '';
        d.markdown = target.markdown || htmlToMd(target.body);
        d.tags = (target.tags || []).slice(); d.cover = target.cover || '';
        d.summary = target.summary || ''; d.category = target.category || '随笔';
        d.date = target.date || today(); d.status = target.status || 'published';
        state.draft = d;
        state.tab = 'post';
        /* 先重绘出写作表单，再落盘，避免旧页面的空表单把刚载入的标题覆盖掉 */
        render(document.getElementById('app'));
        writeDraft(true);
        say('已载入这篇文章，可以继续编辑 Markdown 与公式。');
      }
      return;
    }

    if (t.closest('[data-act="lock"]')) { revoke(); syncNav(); render(document.getElementById('app')); return; }
    var tab = t.closest('[data-tab]');
    if (tab) {
      state.tab = tab.getAttribute('data-tab');
      render(document.getElementById('app'));
      return;
    }
    var del = t.closest('[data-del]');
    if (del) {
      var parts = del.getAttribute('data-del').split('::');
      remove(parts[0], parts[1]);
      render(document.getElementById('app'));
      say('已删除本机条目。');
      return;
    }
    var act = t.closest('[data-act]');
    if (!act) return;
    var a = act.getAttribute('data-act');
    if (a === 'lock') { revoke(); syncNav(); render(document.getElementById('app')); return; }
    if (a === 'draft-save') return savePost(true);
    if (a === 'publish-post') return savePost(false);
    if (a === 'cover-pick') {
      var cf = document.getElementById('f-cover-file');
      if (cf && cf.click) cf.click();
      return;
    }
    if (a === 'tex-help') {
      var th = document.getElementById('tex-help');
      if (th) th.hidden = !th.hidden;
      return;
    }
    if (a === 'save-photo') return savePhoto();
    if (a === 'save-moment') return saveMoment();
    if (a === 'save-chatter') return saveChatter();
    if (a === 'save-project') return saveProject();
    if (a === 'save-friend') return saveFriend();
    if (a === 'preview-post') { setMode('preview'); return; }
    if (a === 'export-js') return download('site-data.js', dataFile());
    if (a === 'export-json') return download('studio-backup.json', JSON.stringify(DATA, null, 2));
    if (a === 'publish') return publish();
    if (a === 'clear-local') {
      delLs(LOCAL_KEY);
      say('本机副本已清理；线上已发布的内容不受影响。刷新后以线上文件为准。');
      return;
    }
  }
  function onChange(e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'f-files' && t.files && t.files.length) {
      state.files = [];
      var box = document.getElementById('file-preview');
      if (box) box.innerHTML = '<span>正在处理图片…</span>';
      var files = Array.prototype.slice.call(t.files);
      var left = files.length;
      files.forEach(function (f) {
        compress(f, function (src) {
          if (src) state.files.push(src);
          left--;
          if (!left && box) box.innerHTML = state.files.map(function (s) {
            return '<img src="' + s + '" alt="待保存的图片">';
          }).join('');
        });
      });
    }
    if (t.id === 'f-moment-img' && t.files && t.files.length) {
      compress(t.files[0], function (src) { state.momentImg = src || ''; });
    }
    if (t.id === 'f-cover-file' && t.files && t.files.length) {
      compress(t.files[0], function (src) {
        if (!src) return say('图片读取失败。', 'warn');
        var f = document.getElementById('f-cover');
        if (f) f.value = src;
        renderCover(); writeDraft(true);
      }, 900, .72);
    }
    if (t.id === 'f-album') {
      var nb = document.getElementById('new-album-box');
      if (nb) nb.style.display = t.value === '__new__' ? '' : 'none';
    }
  }
  /* 输入即自动落盘；并排 / 预览模式下实时重渲染 Markdown 与公式 */
  function onInput(e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'f-body' || t.id === 'f-title' || t.id === 'f-summary') {
      syncFromForm();
      if (state.mode !== 'write') refreshPreview();
      scheduleSave();
    } else if (t.id === 'f-cover') {
      renderCover(); scheduleSave();
    } else if (t.id === 'f-category' || t.id === 'f-date') {
      scheduleSave();
    }
  }
  function onKeydown(e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'f-tag-input' && (e.key === 'Enter' || e.keyCode === 13)) {
      if (e.preventDefault) e.preventDefault();
      addTag(t.value);
      t.value = '';
    }
    if (t.id === 'f-body' && (e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      if (e.preventDefault) e.preventDefault();
      insertMd('**', '**', '');
    }
  }
  function bindDoor() {
    var door = document.getElementById('owner-door');
    if (!door || !door.addEventListener) return;
    var taps = 0, timer = null;
    door.addEventListener('click', function () {
      /* 只有已授权设备才能通过小门进入创作台；其它设备点了没有任何反应 */
      if (!isOwner()) return;
      location.hash = '#/studio';
    });
  }

  function render(el) {
    if (!el) return;
    var isDesk = isOwner() && state.tab === 'post';
    setDeskWidth(isDesk);
    if (isOwner() && !state.draft) state.draft = readDraft();
    el.innerHTML = isOwner() ? studioHtml() : lockHtml();
    var nb = document.getElementById('new-album-box');
    var sel = document.getElementById('f-album');
    if (nb && sel && sel.value !== '__new__') nb.style.display = 'none';
    var dt = document.getElementById('f-date');
    if (dt && !dt.value) dt.value = today();
    var pat = ls(PAT_KEY);
    var f = document.getElementById('f-pat');
    if (pat && f) f.value = pat;
    if (isDesk) {
      renderTagPills(); renderTagHistory(); renderCover();
      syncFromForm(); setMode(state.mode); paintSaveLabel();
    }
  }

  gateBoot();
  mergeLocal();

  window.STUDIO = {
    render: render,
    isOwner: isOwner,
    _sha256: sha256,
    _salt: SALT,
    _gateSalt: GATE_SALT,
    _hash: OWNER_HASH,
    _dataFile: dataFile,
    _mergeLocal: mergeLocal
  };
  syncNav();
  bindDoor();
  var appEl = document.getElementById('app');
  if (appEl && appEl.addEventListener) {
    appEl.addEventListener('click', onClick);
    appEl.addEventListener('change', onChange);
    appEl.addEventListener('input', onInput);
    appEl.addEventListener('keydown', onKeydown);
  }
})();
