/* 星梦Staream · 站长创作台
   静态站没有账号系统，因此「是不是我」由两层凭证判定：
   1) 设备凭证：创作台入口不再公开。持有 128 位密钥链接的设备首次访问 ?o=<密钥>
      时通过 SHA-256 校验并写入本机 90 天签名标记；之后导航才会出现创作台入口，
      其它设备的 #/studio 渲染为「页面不存在」，源码中只保留摘要（明码永不入库）。
   2) 发布凭证：真正把内容写上线时，用 GitHub 细粒度令牌，
      由 GitHub 服务器确认「你确实是这个仓库的所有者」，前端说了不算；
      开启自动同步时令牌保存在这台设备，关闭则只存在内存里。
   创作内容先存本机 localStorage，每次新增 / 修改 / 删除后自动整体重写
   assets/site-data.js 推到仓库，其它设备刷新即可读到最新状态。 */

(function () {
  var DATA = window.STUDIO_DATA;
  if (!DATA) return;

  var SALT = 'paper-blank::owner::v1';
  var GATE_SALT = 'star-dream::owner-gate::v2';
  var OWNER_HASH = '6808eb10040f5bd56dd8de543b3ef4a0e9b5b3e3635ccf65ed1e5aa703d41d47';
  var DEVICE_KEY = 'zb-owner-device';
  var LOCAL_KEY = 'zb-studio-local';
  var DEAD_KEY = 'zb-studio-dead';
  var SITE_KEY = 'zb-studio-site';
  var RESET_KEY = 'zb-studio-reset';
  var PAT_KEY = 'zb-gh-pat';
  var AUTO_KEY = 'zb-studio-autosync';
  var PENDING_KEY = 'zb-studio-pending';
  var REPO = 'ZXY-cc/zxy-cc.github.io';
  var FILE = 'assets/site-data.js';
  var BRANCH = 'main';
  /* 细粒度令牌一键生成页：预填名称、说明与 Contents 读写权限，免去在设置菜单里找入口 */
  var TOKEN_NEW_URL = 'https://github.com/settings/personal-access-tokens/new' +
    '?name=ZXY-Blog-Studio&description=Blog%20studio%20auto-sync&contents=write&expires_in=none';
  var DAYS = 90;
  var KINDS = ['posts', 'moments', 'chatter', 'albums', 'projects', 'friends'];
  var DRAFT_KEY = 'zb-studio-draft';
  var CATS = ['随笔', '算法', '建站', '随想', '笔记', '其它'];
  var state = { tab: 'post', msg: '', busy: false, files: [], mode: 'write', draft: null, saveTimer: null, editing: null, pat: '' };
  /* 自动同步队列：改动先落本机，防抖合并后串行写仓库；失败保留本机内容并重试 */
  var sync = { timer: null, running: false, dirty: false, fails: 0, status: '', warn: true };

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
  /* 老数据文件里部分条目（尤其友链）没有 id：keyOf 会全返回空串，
     删除一条就会把同组全部过滤掉。这里按内容生成一个稳定的短 id，
     保证每条可单独编辑 / 删除；新发布的数据文件会带着 id 一起写回。 */
  function stableId(kind, x, i) {
    var src = [x.url, x.name, x.title, x.text, x.desc].filter(Boolean).join('|') || String(i);
    var h = 2166136261;
    for (var j = 0; j < src.length; j++) {
      h ^= src.charCodeAt(j);
      h = (h * 16777619) >>> 0;
    }
    return (kind === 'friends' ? 'fr-' : kind.slice(0, 2) + '-') + h.toString(36);
  }
  function ensureIds() {
    KINDS.forEach(function (k) {
      (DATA[k] || []).forEach(function (x, i) {
        if (k === 'posts') { if (!x.slug) x.slug = 'p-' + stableId(k, x, i).slice(3); return; }
        if (!x.id) x.id = stableId(k, x, i);
      });
    });
  }
  /* 一次性清理：站点数据文件里带 studioReset 标记，站长设备第一次读到新标记时
     清掉上一次遗留的本机内容与草稿（本机 localStorage 无法从仓库直接删）。
     墓碑 DEAD_KEY 保留，已删除的线上内容不会因此复活。 */
  function applyContentReset() {
    var marker = String(DATA.studioReset || '');
    if (!marker || ls(RESET_KEY) === marker) return;
    delLs(LOCAL_KEY);
    delLs(DRAFT_KEY);
    setLs(RESET_KEY, marker);
  }
  /* 名片设置（头像 / 签名）也存本机，刷新后覆盖到共享的 DATA.site 上，
     发布上线时随 dataFile() 写进站点数据文件，对全部访客生效。 */
  function applySiteLocal() {
    if (!DATA.site || typeof DATA.site !== 'object') DATA.site = {};
    var s = null;
    try { s = JSON.parse(ls(SITE_KEY) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') return;
    if (s.avatar) DATA.site.avatar = String(s.avatar);
    if (typeof s.bio === 'string') DATA.site.bio = s.bio;
    if (typeof s.tagline === 'string') DATA.site.tagline = s.tagline;
    if (typeof s.intro === 'string') DATA.site.intro = s.intro;
    if (Object.prototype.toString.call(s.skills) === '[object Array]') DATA.site.skills = s.skills;
    if (Object.prototype.toString.call(s.social) === '[object Array]') DATA.site.social = s.social;
    if (Number(s.homeViewsVer) >= 1) DATA.site.homeViewsVer = Math.floor(Number(s.homeViewsVer));
  }
  ensureIds();
  /* 线上数据文件里原本的头像与签名，供「恢复」用（本机覆盖层生效之前先存一份） */
  var RAW_SITE = JSON.parse(JSON.stringify(DATA.site || {}));
  applySiteLocal();
  /* 内置内容快照：每次合并都先回到线上版本，再叠加本机条目，
     这样删除本机条目不会把 site-data.js 里的原有内容一起抹掉。 */
  var BUILTIN = {};
  KINDS.forEach(function (k) {
    BUILTIN[k] = JSON.parse(JSON.stringify(
      Object.prototype.toString.call(DATA[k]) === '[object Array]' ? DATA[k] : []));
  });
  /* 线上数据文件自带的 deleted.posts（其它设备上删除基础文章后发布的）也要认 */
  var BUILTIN_DEAD = JSON.parse(JSON.stringify(
    DATA.deleted && Object.prototype.toString.call(DATA.deleted.posts) === '[object Array]'
      ? { posts: DATA.deleted.posts } : { posts: [] }));
  function mergeLocal() {
    var local = readLocal();
    var dead = readDead();
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
      /* 墓碑清理：条目已不在基础快照里（发布删除后 / 本机草稿）就不再保留 */
      dead[k] = dead[k].filter(function (id) {
        return inBuiltin(k, id) || (k === 'posts' && inBasePosts(id));
      });
      DATA[k] = base.filter(function (x) { return dead[k].indexOf(keyOf(x, k)) < 0; });
    });
    setLs(DEAD_KEY, JSON.stringify(dead));
    /* posts.js 基础文章的删除走 site-data.js 里的 deleted.posts，前台据此过滤；
       本机墓碑与线上数据文件里的墓碑取并集 */
    var seen = {};
    DATA.deleted = { posts: BUILTIN_DEAD.posts.concat(dead.posts).filter(function (id) {
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    }) };
    /* 通知前台重算文章集合：删掉的文章不用等刷新就从首页消失 */
    try {
      document.dispatchEvent(new CustomEvent('zb:studio-data'));
    } catch (e) {}
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
    /* 重新保存 = 撤销删除（墓碑只在「删除后未再保存」期间生效） */
    if (deadHas(kind, id)) deadRemove(kind, id);
    if (!setLs(LOCAL_KEY, JSON.stringify(local))) return false;
    mergeLocal();
    queueSync();
    return true;
  }
  /* ---------- 删除墓碑 ----------
     已发布内容（站点数据快照 / posts.js 基础文章）删除时记一条墓碑：
     本机先隐藏，发布上线后从数据文件里移除（posts.js 基础文章则以
     deleted.posts 列表随 site-data.js 下发，前台按 slug 过滤）。
     未发布过的本机草稿删除即消失，不留墓碑。 */
  function blankDead() {
    var o = {};
    KINDS.forEach(function (k) { o[k] = []; });
    return o;
  }
  function readDead() {
    var o = null, b = blankDead();
    try { o = JSON.parse(ls(DEAD_KEY) || 'null'); } catch (e) { o = null; }
    if (o) KINDS.forEach(function (k) {
      if (Object.prototype.toString.call(o[k]) === '[object Array]') b[k] = o[k];
    });
    return b;
  }
  function deadHas(kind, id) { return readDead()[kind].indexOf(id) >= 0; }
  function deadRemove(kind, id) {
    var d = readDead();
    d[kind] = d[kind].filter(function (x) { return x !== id; });
    setLs(DEAD_KEY, JSON.stringify(d));
  }
  function inBuiltin(kind, id) {
    return (BUILTIN[kind] || []).some(function (x) { return keyOf(x, kind) === id; });
  }
  function inBasePosts(id) {
    return (window.POSTS || []).some(function (p) { return p.slug === id; });
  }
  function remove(kind, id) {
    /* 已发布内容记墓碑（本机隐藏 + 发布时从数据文件移除）；
       未发布过的本机草稿直接消失 */
    if (inBuiltin(kind, id) || (kind === 'posts' && inBasePosts(id))) {
      var d = readDead();
      if (d[kind].indexOf(id) < 0) d[kind].push(id);
      setLs(DEAD_KEY, JSON.stringify(d));
    }
    var local = readLocal();
    local[kind] = local[kind].filter(function (x) { return keyOf(x, kind) !== id; });
    setLs(LOCAL_KEY, JSON.stringify(local));
    mergeLocal();
    queueSync();
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
    var key = q ? (q.get('o') || '') : '';
    var unlocked = !!(q && q.has('o') && gateCheck(key));
    if (unlocked) grant();
    /* 密钥与「发布完成」的临时参数都不留在地址栏；后者只用来触发一次整页刷新 */
    if (q && (q.has('o') || q.has('published'))) {
      try {
        window.history.replaceState(null, '',
          String(window.location.pathname || '/') + String(window.location.hash || ''));
      } catch (e) {}
    }
    return unlocked;
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
  function setText(id, v) { var e = document.getElementById(id); if (e) e.value = String(v == null ? '' : v); }
  function splitTags(s) { return s.split(/[,，、\s]+/).filter(Boolean); }
  /* 自动摘要截断：超过 n 字时以「……」结尾，省略号计入总长 */
  function clipSummary(s, n) {
    s = String(s || '').trim();
    if (s.length <= n) return s;
    return s.slice(0, Math.max(1, n - 2)).replace(/[\s,，.。;；:：、!！?？'”’"]+$/, '') + '……';
  }

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
  function insertMd(before, after, placeholder, atLineStart) {
    var ta = document.getElementById('f-body');
    if (!ta) return;
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    /* 先记下点击前的视角：改 value / 重新聚焦 / 移动光标都会让浏览器把长文滚到末尾 */
    var top = ta.scrollTop || 0;
    var pageY = window.pageYOffset ||
      (document.documentElement && document.documentElement.scrollTop) || 0;
    var caret;
    if (atLineStart) {
      /* 标题类工具插到当前行的行首，光标停在标记之后 */
      var ls = v.lastIndexOf('\n', s - 1) + 1;
      ta.value = v.slice(0, ls) + before + v.slice(ls);
      caret = s + before.length;
    } else {
      var sel = v.slice(s, e) || placeholder || '';
      ta.value = v.slice(0, s) + before + sel + (after || '') + v.slice(e);
      caret = s + before.length + sel.length;
    }
    try { ta.focus({ preventScroll: true }); }
    catch (err) { try { ta.focus(); } catch (e2) {} }
    if (ta.setSelectionRange) {
      try { ta.setSelectionRange(caret, caret); } catch (err2) {}
    }
    try { ta.scrollTop = top; } catch (err3) {}
    try { if (window.scrollTo) window.scrollTo(0, pageY); } catch (err4) {}
    syncFromForm(); refreshPreview(); scheduleSave();
  }
  /* 格式优化：把当前表单的正文交给 ZBMD.tidy 去多余空格与空行。
     代码块、公式与行内代码原样保留，整理前后预览一致；写作台顺手落盘草稿。 */
  function tidyForm() {
    var ids = ['f-body', 'f-ch-body', 'f-moment-text'], ta = null;
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) { ta = el; break; }
    }
    if (!ta || !window.ZBMD || !window.ZBMD.tidy) return say('当前没有可整理的正文。', 'warn');
    var before = ta.value, after = window.ZBMD.tidy(before);
    if (after === before) return say('格式已经很整齐，没有多余空格或空行。');
    ta.value = after;
    if (ta.id === 'f-body') { syncFromForm(); refreshPreview(); writeDraft(true); }
    say('格式已整理：去掉 ' + (before.length - after.length) + ' 个多余字符，预览效果不变。');
  }
  /* 工具栏：前面是 Markdown，后面是 LaTeX；点击往光标处插入对应源码 */
  var MD_TOOLS = [
    ['H1', '# ', '', '一级标题'], ['H2', '## ', '', '二级标题'], ['H3', '### ', '', '三级标题'],
    ['▌', '##| ', '', '蓝粉渐变竖线标题（##| 标题）', true],
    ['▌▌', '\n:::vl\n', '\n:::\n', '蓝粉渐变竖线区块（:::vl … :::）'],
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
  function toolHtml() {
    return MD_TOOLS.map(function (t, i) {
      return '<button class="md-tool" type="button" data-md="' + i + '" title="' + esc(t[3]) +
        '" aria-label="' + esc(t[3]) + '">' + esc(t[0]) + '</button>';
    }).join('');
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
  /* 发布完成：清空创作台内容并整页回到首页。
     confirmed 为真（站点数据文件已确认更新）才清理本机副本，构建未完成时
     先留着，避免首页短暂看不到刚发布的内容；草稿与编辑态一律清空。
     带 ?published 强制整页导航，并给站点数据文件换一个会话内版本号绕开缓存。 */
  function goHome(confirmed) {
    /* 还有改动没写回仓库时先等同步落地，别让整页导航把请求掐断（最多等 10 秒） */
    if (!state.goHomeWaiting && autoEnabled() && syncToken() &&
        (sync.timer || sync.dirty || sync.running)) {
      state.goHomeWaiting = true;
      if (sync.timer) { window.clearTimeout(sync.timer); sync.timer = null; runSync(); }
      var waited = 0;
      (function waitSync() {
        if ((sync.dirty || sync.running) && waited < 20) {
          waited++;
          window.setTimeout(waitSync, 500);
        } else {
          state.goHomeWaiting = false;
          goHome(confirmed);
        }
      })();
      return;
    }
    delLs(DRAFT_KEY);
    /* 名片设置已随站点数据文件发布，本机覆盖层可以撤掉，避免以后另一台设备改了不生效 */
    if (confirmed) { delLs(LOCAL_KEY); delLs(SITE_KEY); }
    state.draft = null;
    state.editing = null;
    state.files = [];
    state.momentImg = '';
    try {
      if (window.sessionStorage) window.sessionStorage.setItem('zb-data-v', String(Date.now()));
    } catch (e) {}
    var base = String(window.location.pathname || '/');
    window.location.replace(base + '?published=' + Date.now());
  }
  function homeSoon(confirmed, msg) {
    say(msg);
    window.setTimeout(function () { goHome(confirmed); }, 1100);
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
      ['project', '项目'], ['friend', '友链'], ['site', '名片设置'], ['about', '关于页'],
      ['manage', '内容管理'], ['publish', '发布 / 同步']
    ];
    return '<div class="studio-tabs">' + tabs.map(function (t) {
      return '<button class="stab' + (state.tab === t[0] ? ' on' : '') + '" type="button" data-tab="' +
        t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  }
  function field(label, id, ph, type, value) {
    /* 每个字段包成一个 .f-cell：在 .f-row 两列网格里格子才是完整字段（标签在上、输入框在下），
       否则 label / input 各自成为网格项，会排成「左标签右输入」的半行，视觉上留白。
       第 5 个参数给重编辑表单回填原值，重绘后不会丢失。 */
    return '<span class="f-cell"><label class="f-label" for="' + id + '">' + label + '</label>' +
      '<input class="f-input" id="' + id + '" type="' + (type || 'text') + '" placeholder="' + (ph || '') +
      '" value="' + esc(value == null ? '' : value) + '"></span>';
  }
  function area(label, id, ph, rows) {
    return '<span class="f-cell"><label class="f-label" for="' + id + '">' + label + '</label>' +
      '<textarea class="f-input f-area" id="' + id + '" rows="' + (rows || 7) +
      '" placeholder="' + (ph || '') + '"></textarea></span>';
  }
  /* 写文章与其它分页同一套「玻璃卡片」美术框架：标题、工具栏、正文、
     属性字段（封面 / 标签 / 分类 / 摘要 / 日期）与发布动作按同样的
     f-label + f-input 体系纵向排布，比例与其它表单一致。 */
  function formPost() {
    var d = state.draft || readDraft();
    var editing = !!(state.editing && state.editing.kind === 'posts');
    var modes = [['write', '写作'], ['split', '并排'], ['preview', '预览']];
    return '<div class="studio-form glass post-form"><h2>写文章</h2>' +
      editingBanner('文章', 'posts') +
      '<span class="f-cell"><label class="f-label" for="f-title">标题</label>' +
      '<input class="f-input post-title" id="f-title" type="text" placeholder="文章大标题…" ' +
        'value="' + esc(d.title) + '" aria-label="文章标题"></span>' +
      '<div class="desk-toolbar" role="toolbar" aria-label="Markdown 与 LaTeX 工具栏">' +
        '<div class="md-tools">' + toolHtml() + '</div>' +
        '<div class="mode-switch" role="group" aria-label="编辑视图">' + modes.map(function (m) {
          return '<button type="button" data-mode-btn="' + m[0] + '" aria-pressed="' +
            (state.mode === m[0] ? 'true' : 'false') + '" class="' +
            (state.mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>';
        }).join('') + '</div>' +
        '<button class="md-tool tidy-btn" type="button" data-act="tidy" ' +
          'title="去掉多余空格与空行，预览效果不变">✦ 格式优化</button>' +
      '</div>' +
      '<div class="desk-body" id="desk-body" data-mode="' + state.mode + '">' +
        '<textarea id="f-body" class="desk-textarea" spellcheck="false" ' +
          'placeholder="用 Markdown 写正文，用 $…$ / $$…$$ 写 LaTeX 公式…">' +
          esc(d.markdown) + '</textarea>' +
        '<div id="post-preview" class="desk-preview article-body"></div>' +
      '</div>' +
      '<div class="desk-foot"><span>支持 Markdown 与 LaTeX · ##| 标题 或 :::vl 可加渐变竖线 · 自动保存在本机</span>' +
        '<span class="desk-saved" id="draft-saved">' + esc(savedLabel()) + '</span>' +
        '<span id="word-count">0 字</span></div>' +
      '<div class="f-row post-attr-row">' +
        '<span class="f-cell pc-cover"><label class="f-label" for="f-cover">封面图</label>' +
          '<input class="f-input" id="f-cover" type="text" placeholder="粘贴图片 URL，或点下方选本地图片…" ' +
            'value="' + esc(d.cover) + '" aria-label="封面图地址">' +
          '<div class="cover-box" id="cover-box" data-act="cover-pick" role="button" tabindex="0" ' +
            'title="点击选择本地图片"></div>' +
          '<input class="f-input f-file" id="f-cover-file" type="file" accept="image/*" aria-label="上传封面图">' +
        '</span>' +
        '<span class="f-cell pc-side"><label class="f-label" for="f-tag-input">标签</label>' +
          '<div class="tag-pills" id="tag-pills"></div>' +
          '<input class="f-input" id="f-tag-input" type="text" placeholder="+ 输入标签后按回车">' +
          '<div class="tag-history" id="tag-history"></div>' +
          '<label class="f-label pc-cat-label">分类</label>' +
          '<div class="cat-pills" id="cat-pills">' + CATS.map(function (c) {
            return '<button type="button" data-cat="' + esc(c) + '" class="' +
              (d.category === c ? 'on' : '') + '">' + esc(c) + '</button>';
          }).join('') + '</div>' +
          '<input class="f-input" id="f-category" type="text" placeholder="也可以自己写一个" ' +
            'value="' + esc(d.category) + '" aria-label="分类">' +
        '</span>' +
      '</div>' +
      '<span class="f-cell"><label class="f-label" for="f-date">发布日期</label>' +
        '<input class="f-input" id="f-date" type="date" value="' + esc(d.date) + '">' +
      '</span>' +
      '<span class="f-cell"><label class="f-label" for="f-summary">摘要</label>' +
        '<textarea class="f-input f-area" id="f-summary" rows="4" ' +
          'placeholder="记录一下这篇内容的核心思绪…">' + esc(d.summary) + '</textarea>' +
        '<p class="meta-note">摘要会显示在首页卡片与搜索结果里；留空时自动截取正文前 200 字。</p>' +
      '</span>' +
      '<div class="f-actions">' +
        '<button class="soft-btn" type="button" data-act="draft-save">存为草稿</button>' +
        '<button class="primary-btn" type="button" data-act="publish-post">' +
        (editing ? '保存修改' : '正式发布') + '</button>' +
      '</div>' +
      '<p class="f-hint">发布先写入本机内容，开启自动同步后会立即写进网站；存为草稿只留在本机。' +
        '最近落盘：<b id="meta-saved">' + esc(d.savedAt || '尚未落盘') + '</b></p></div>';
  }
  function albumOptions() {
    var albums = DATA.albums || [];
    return '<option value="__new__">＋ 新建一个相册</option>' + albums.map(function (a) {
      return '<option value="' + esc(a.id) + '">' + esc(a.title) + '</option>';
    }).join('');
  }
  function formPhoto() {
    var ed = (state.editing && state.editing.kind === 'albums') ? findItem('albums', state.editing.id) : null;
    /* 标记「移除某张照片」会重绘表单，先把用户刚填的字段接住，避免输入被清空 */
    var f = (ed && state.editing && state.editing.form) || {};
    var edTitle = f.title != null ? f.title : (ed ? ed.title : '');
    var edDesc = f.desc != null ? f.desc : (ed ? ed.desc : '');
    var edDate = f.date || today();
    var edNote = f.note || '';
    var albumField = ed
      ? '<div class="f-row">' +
        field('相册标题', 'f-album-title', '例如：周末的光', 'text', edTitle) +
        field('相册说明', 'f-album-desc', '一句话', 'text', edDesc) + '</div>'
      : '<label class="f-label" for="f-album">归入相册</label>' +
        '<select class="f-input" id="f-album">' + albumOptions() + '</select>' +
        '<div id="new-album-box">' + field('新相册标题', 'f-album-title', '例如：周末的光') +
        field('新相册说明', 'f-album-desc', '一句话') + '</div>';
    var drops = (ed && state.editing && state.editing.drop) || [];
    var existing = ed
      ? '<div class="album-edit-photos"><label class="f-label">相册里共 ' +
        (ed.photos || []).length + ' 张照片 · 点「移除」标记，保存修改后生效</label>' +
        '<div class="aep-grid">' + (ed.photos || []).map(function (p, i) {
          var off = drops.indexOf(i) >= 0;
          return '<div class="aep-tile' + (off ? ' off' : '') + '">' +
            '<img src="' + esc(p.src) + '" alt="' + esc(p.title || '') + '" loading="lazy">' +
            '<button class="mini-btn" type="button" data-act="album-photo-toggle" data-i="' + i + '">' +
            (off ? '撤销移除' : '移除') + '</button></div>';
        }).join('') + '</div></div>'
      : '';
    var preview = '<div id="file-preview" class="file-preview">' + state.files.map(function (s) {
      return '<img src="' + esc(s) + '" alt="待保存的图片">';
    }).join('') + '</div>';
    return '<div class="studio-form glass"><h2>' + (ed ? '编辑相册' : '发图片') + '</h2>' +
      editingBanner('相册', 'albums') +
      '<p class="f-hint">' + (ed
        ? '可以改相册标题与说明、移除已有照片，也可以继续往这个相册补充图片；改完点「保存修改」。'
        : '图片会压到最长边 1200px 再存进本机，发布时一起写进站点数据文件。') + '</p>' +
      albumField +
      '<span class="f-cell"><label class="f-label" for="f-photo-date">拍摄 / 发布日期</label>' +
      '<input class="f-input" id="f-photo-date" type="date" value="' + esc(edDate) + '"></span>' +
      '<label class="file-zone" for="f-files"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#puffy-star"/></svg>点击选择图片 · 可多选，选好自动压缩<input class="f-input f-file" id="f-files" type="file" accept="image/*" multiple></label>' +
      field('照片说明', 'f-photo-note', '留一句给新加的照片（可选）', 'text', edNote) +
      preview + existing +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="save-photo">' +
      (ed ? '保存修改' : '保存到本机') + '</button></div></div>';
  }
  /* 编辑中的条目在表单顶部给一条提示与退出按钮，保存按钮同步改字；
     只认当前表单对应的类型，避免编辑文章时切到说说页出现错误提示 */
  function editingBanner(kindLabel, kind) {
    if (!state.editing || (kind && state.editing.kind !== kind)) return '';
    return '<div class="edit-banner"><b>正在编辑这条' + kindLabel + '</b>' +
      '<button class="mini-btn" type="button" data-act="cancel-edit">退出编辑</button></div>';
  }
  function formMoment() {
    return '<div class="studio-form glass"><h2>发一条说说</h2>' + editingBanner('说说', 'moments') +
      area('这一刻想说什么', 'f-moment-text', '…', 5) +
      '<div class="f-row">' + field('心情', 'f-mood', '✨ 满足') + field('地点', 'f-place', '书桌前') + '</div>' +
      '<span class="f-cell"><label class="f-label" for="f-moment-date">发布日期</label>' +
      '<input class="f-input" id="f-moment-date" type="date" value="' + today() + '"></span>' +
      '<label class="file-zone" for="f-moment-img"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#puffy-star"/></svg>点击选择配图 · 可选<input class="f-input f-file" id="f-moment-img" type="file" accept="image/*"></label>' +
      '<div id="moment-img-preview" class="file-preview"></div>' +
      '<div class="f-actions"><button class="soft-btn" type="button" data-act="tidy">✦ 格式优化</button>' +
      '<button class="primary-btn" type="button" data-act="save-moment">' +
      (state.editing ? '保存修改' : '保存到本机') + '</button></div></div>';
  }
  function formChatter() {
    return '<div class="studio-form glass"><h2>写一则杂谈</h2>' + editingBanner('杂谈', 'chatter') +
      field('标题', 'f-ch-title', '比文章短一点的标题') +
      field('摘要', 'f-ch-summary', '一句话') +
      '<div class="f-row">' + field('标签（逗号分隔）', 'f-ch-tags', '随笔, 建站') + field('心情', 'f-ch-mood', '🌸 平静') + '</div>' +
      '<span class="f-cell"><label class="f-label" for="f-ch-date">发布日期</label>' +
      '<input class="f-input" id="f-ch-date" type="date" value="' + today() + '"></span>' +
      area('正文', 'f-ch-body', '想到哪写到哪…', 10) +
      '<div class="f-actions"><button class="soft-btn" type="button" data-act="tidy">✦ 格式优化</button>' +
      '<button class="primary-btn" type="button" data-act="save-chatter">' +
      (state.editing ? '保存修改' : '保存到本机') + '</button></div></div>';
  }
  function formProject() {
    var editing = !!(state.editing && state.editing.kind === 'projects');
    return '<div class="studio-form glass"><h2>' + (editing ? '编辑这个项目' : '添加一个项目') + '</h2>' +
      editingBanner('项目', 'projects') +
      field('名称', 'f-pj-name', '项目名') + area('描述', 'f-pj-desc', '做了什么', 4) +
      '<div class="f-row">' + field('技术标签（逗号分隔）', 'f-pj-tags', 'Python, 算法') + field('状态', 'f-pj-status', '进行中') + '</div>' +
      field('链接', 'f-pj-link', '#/about 或 https://…') +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="save-project">' +
      (editing ? '保存修改' : '保存到本机') + '</button></div></div>';
  }
  function formFriend() {
    var editing = !!(state.editing && state.editing.kind === 'friends');
    return '<div class="studio-form glass"><h2>' + (editing ? '编辑这个友链' : '添加一个友链') + '</h2>' +
      editingBanner('友链', 'friends') +
      field('名称', 'f-fr-name', '站点名') + area('描述', 'f-fr-desc', '一句话介绍', 3) +
      '<div class="f-row">' + field('地址', 'f-fr-url', 'https://…') + field('首字母标记', 'f-fr-initial', 'GH') + '</div>' +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="save-friend">' +
      (editing ? '保存修改' : '保存到本机') + '</button></div></div>';
  }
  /* 名片设置：改的是首页名片的头像与名字下面的签名。
     头像可上传（压到 320px 后转 data URL）或直接填图片地址；
     保存后立刻覆盖共享的 DATA.site，首页与导航头像即时换新。 */
  /* 关于页：编辑「关于」页面名片与正文的每一部分。
     intro 支持 Markdown（空行分段）；底部入口逐条增删。 */
  function formAbout() {
    var s = DATA.site || {};
    var social = Object.prototype.toString.call(s.social) === '[object Array]' ? s.social : [];
    var rows = social.map(function (so, i) {
      return '<div class="f-row about-so-row">' +
        field('名称', 'f-so-name-' + i, 'GitHub') +
        field('链接', 'f-so-url-' + i, 'https://… 或 #/about') +
        field('副标题', 'f-so-note-' + i, '一句话说明') +
        '<button class="soft-btn so-del" type="button" data-act="about-so-del" data-i="' + i +
        '" aria-label="删除这条入口">删除</button></div>';
    }).join('');
    return '<div class="studio-form glass"><h2>关于页</h2>' +
      '<p class="f-hint">这里逐项编辑「关于」页面的内容：名片文字、简介正文（支持 Markdown 扩展语法）' +
      '与底部入口。保存后立即更新页面，并自动同步到网站与静态镜像。</p>' +
      area('签名（关于页名字下面的那行文字）', 'f-about-tagline', '记录一些想法，和把它们弄明白的过程。', 2) +
      area('简介正文（Markdown，空行分段）', 'f-about-intro',
        '喜欢把事情拆开看清楚，再慢慢写下来。', 8) +
      field('技能标签（用逗号分隔）', 'f-about-skills', '算法, Python, 折腾') +
      '<h3 class="f-sub">底部入口（每条：名称 + 链接 + 副标题）</h3>' +
      (rows || '<p class="f-hint">还没有入口，点下面添加。</p>') +
      '<div class="f-actions"><button class="soft-btn" type="button" data-act="about-so-add">添加一条入口</button>' +
      '<button class="primary-btn" type="button" data-act="save-about">保存关于页</button>' +
      '<button class="soft-btn" type="button" data-act="about-reset">恢复线上版本</button></div></div>';
  }
  function formSite() {
    var s = DATA.site || {};
    return '<div class="studio-form glass"><h2>名片设置</h2>' +
      '<p class="f-hint">这里改的是首页上方名片的头像，以及名字下面的那行签名。' +
      '先保存在这台设备，开启自动同步后会立即写进网站，对所有访客生效。</p>' +
      '<div class="site-avatar-row">' +
        '<div class="site-avatar-box">' +
          '<img id="site-avatar-preview" src="' + esc(s.avatar || 'assets/avatar.jpg') +
          '" alt="当前名片头像"></div>' +
        '<label class="file-zone" for="f-site-avatar-file">' +
          '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#puffy-star"/></svg>' +
          '点击更换头像 · 自动压到 320px' +
          '<input class="f-input f-file" id="f-site-avatar-file" type="file" accept="image/*"></label>' +
      '</div>' +
      field('头像地址（也可以直接粘贴图片 URL）', 'f-site-avatar', 'assets/avatar.jpg') +
      area('签名（首页名片名字下面的文字）', 'f-site-bio', '写一句想放在这里的话…', 3) +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="save-site">保存名片</button>' +
      '<button class="soft-btn" type="button" data-act="site-reset">恢复当前线上头像与签名</button>' +
      '<button class="soft-btn" type="button" data-act="clear-home-views">清空首页浏览量</button></div></div>';
  }
  /* 内容管理：列出全部内容（线上数据 + 本机 + posts.js 基础文章），
     文章 / 说说 / 杂谈可载回表单重编辑，全部条目可删除；
     已发布内容的删除要再次「发布上线」才对访客生效。 */
  function allPosts() {
    /* DATA.posts（站点数据层）优先覆盖 posts.js 同 slug 条目；
       最后按 deleted.posts 过滤：本机墓碑（readDead）与线上文件自带的
       墓碑（BUILTIN_DEAD）都已由 mergeLocal 汇总进 DATA.deleted.posts，
       这里不过滤的话，被删除的 posts.js 基础文章会在内容管理里反复复活。 */
    var out = (window.POSTS || []).slice();
    (DATA.posts || []).forEach(function (p) {
      var hit = false;
      for (var i = 0; i < out.length; i++) {
        if (out[i].slug === p.slug) { out[i] = p; hit = true; break; }
      }
      if (!hit) out.push(p);
    });
    var dead = (DATA.deleted && DATA.deleted.posts) || [];
    if (dead.length) out = out.filter(function (p) { return dead.indexOf(p.slug) < 0; });
    return out;
  }
  function findItem(kind, id) {
    if (kind === 'posts') return allPosts().filter(function (x) { return x.slug === id; })[0] || null;
    return (DATA[kind] || []).filter(function (x) { return keyOf(x, kind) === id; })[0] || null;
  }
  function formManage() {
    var local = readLocal();
    var labels = { posts: '文章', moments: '说说', chatter: '杂谈', albums: '相册', projects: '项目', friends: '友链' };
    var rows = [];
    KINDS.forEach(function (k) {
      var list = k === 'posts' ? allPosts() : (DATA[k] || []);
      list.forEach(function (x) {
        var id = keyOf(x, k);
        var name = k === 'posts' ? x.title : (x.title || x.name || (x.text || '').slice(0, 22));
        var src = local[k].some(function (y) { return keyOf(y, k) === id; }) ? '本机'
          : (window.POSTS || []).some(function (p) { return p.slug === id; }) ? '基础' : '线上';
        rows.push('<div class="manage-row"><span class="mr-kind">' + labels[k] + '</span>' +
          '<b>' + esc(name || '(未命名)') + '</b><span class="mr-src">' + src + '</span>' +
          '<span class="mr-id">' + esc(id) + '</span>' +
          '<button class="mini-btn" type="button" data-edit="' + esc(k + '::' + id) + '">编辑</button>' +
          '<button class="mini-btn" type="button" data-del="' + esc(k + '::' + id) + '">删除</button></div>');
      });
    });
    var size = 0;
    try { size = (ls(LOCAL_KEY) || '').length; } catch (e) {}
    return '<div class="studio-form glass"><h2>内容管理</h2>' +
      '<p class="f-hint">文章、说说、杂谈、相册、项目、友链都能载回对应表单重新编辑，也都能删除；' +
      '相册可改名、补充图片或移除单张照片。改动先保存在本机，开启自动同步后立即写进网站，' +
      '访客看到的就是最新状态；已发布内容删除后可在仓库提交历史找回。</p>' +
      '<div class="manage-list">' + (rows.length ? rows.join('') : '<p class="page-note">还没有任何内容。</p>') + '</div>' +
      '<p class="f-hint">本机占用约 ' + (size / 1024).toFixed(0) + ' KB。发布成功后可清空本机副本与草稿，避免浏览器存储被图片占满。</p>' +
      '<div class="f-actions"><button class="soft-btn" type="button" data-act="clear-local">清空本机内容与草稿</button></div></div>';
  }
  function formPublish() {
    var auto = autoEnabled(), has = !!syncToken();
    return '<div class="studio-form glass"><h2>发布上线 / 自动同步</h2>' +
      '<p class="f-hint">静态博客没有服务器，「让所有访客看到」必须把数据文件写回 GitHub 仓库。' +
      '<b>开启自动同步后，文章、项目、照片、说说、友链、杂谈与名片的每次新增、修改、删除都会自动写进网站</b>，' +
      '其它设备刷新 https://zxy-blog.top 即可看到最新状态。</p>' +
      '<p class="f-hint" id="sync-state">' + esc(sync.status ||
        (has ? (auto ? '自动同步已开启：本机改动会自动写进网站。' : '自动同步已关闭：改动只保存在这台设备。')
             : '尚未配置发布凭证：改动只保存在这台设备。')) + '</p>' +
      '<h3>办法一 · 一次配置，之后全自动（推荐）</h3>' +
      '<div class="f-actions"><a class="soft-btn token-new" href="' + TOKEN_NEW_URL.replace(/&/g, '&amp;') +
      '" target="_blank" rel="noopener noreferrer">① 点这里直接生成 GitHub 令牌（已填好权限）</a></div>' +
      '<p class="f-hint">不用去 GitHub 找 Settings，链接直达创建页。打开后在 <b>Repository access</b> 选 ' +
      '「Only select repositories」并勾选 <code>ZXY-cc/zxy-cc.github.io</code>，拉到底点 <b>Generate token</b>；' +
      '复制 <code>github_pat_…</code> 粘到下方。若提示不允许永不过期，把 Expiration 改成 90 天即可。' +
      '令牌只存在这台设备、只发往 api.github.com，不会写进导出文件。</p>' +
      field('GitHub 细粒度令牌', 'f-pat', 'github_pat_…', 'password') +
      '<label class="f-check"><input type="checkbox" id="f-autosync"' + (auto ? ' checked' : '') +
      '> 自动同步每次改动到网站</label>' +
      '<label class="f-check"><input type="checkbox" id="f-remember"' + (has ? ' checked' : '') +
      '> 在这台设备记住令牌（自动同步必需）</label>' +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="publish">保存设置并发布当前内容</button>' +
      '<button class="soft-btn" type="button" data-act="sync-now">立即同步当前内容</button>' +
      '<button class="soft-btn" type="button" data-act="sync-off">关闭自动同步并清除令牌</button></div>' +
      '<h3>办法二 · 导出文件交给助手</h3>' +
      '<p class="f-hint">不想在浏览器里放令牌时，下载 <code>site-data.js</code> 发给我，我用仓库部署密钥推送。</p>' +
      '<div class="f-actions"><button class="soft-btn" type="button" data-act="export-js">下载 site-data.js</button>' +
      '<button class="soft-btn" type="button" data-act="export-json">下载备份 JSON</button></div>' +
      '<p class="f-hint">提交后 GitHub Pages 通常 1 分钟内完成构建；站点数据地址每 10 秒轮换，访客不会读到旧缓存。</p></div>';
  }
  function formHtml() {
    return {
      post: formPost, photo: formPhoto, moment: formMoment, chatter: formChatter,
      project: formProject, friend: formFriend, site: formSite, about: formAbout,
      manage: formManage, publish: formPublish
    }[state.tab]();
  }
  function studioHtml() {
    return '<div class="studio-wrap" id="studio-panel">' +
      '<div class="studio-head glass"><div><div class="page-kicker">OWNER STUDIO</div>' +
      '<h1>创作台</h1><p>这台设备已识别为站长的设备 · ' +
      '<span id="sync-badge" class="sync-badge' + (sync.warn ? ' warn' : '') + '">' +
      (sync.warn ? '待同步' : '自动同步') + '</span> · 每次改动自动写进网站，其它设备刷新即可看到最新状态。</p></div>' +
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
    var editing = (state.editing && state.editing.kind === 'posts') ? state.editing : null;
    var item = {
      /* 重编辑保留原来的 slug / 日期，避免生成一篇新文章 */
      slug: editing ? editing.id : (d.slug || uid('p')), title: d.title,
      date: editing ? (findItem('posts', editing.id) || {}).date || d.date : (d.date || today()),
      tags: d.tags.slice(), category: d.category || '', cover: d.cover || '',
      summary: d.summary || clipSummary(window.ZBMD ? window.ZBMD.plain(d.markdown) : '', 200) || d.title,
      markdown: d.markdown, body: mdRender(d.markdown),
      format: 'markdown', status: 'published'
    };
    if (!upsert('posts', item)) return say('本机存储空间不足，请先到「发布上线」导出并清理。', 'warn');
    if (editing) {
      /* 编辑已有文章：按钮是「保存修改」，存完留在写作台，不跳首页也不清空本机内容 */
      state.editing = null;
      state.draft = blankDraft();
      delLs(DRAFT_KEY);
      render(document.getElementById('app'));
      say('文章已保存修改，并已自动同步到网站。');
      return;
    }
    d.slug = item.slug; d.status = 'published';
    writeDraft(true);
    /* 正式发布即离开写作台：草稿清空、整页回首页（自动同步会先把改动写回仓库） */
    homeSoon(false, '文章已发布 · 正在回到首页…');
  }
  function saveMoment() {
    var text = val('f-moment-text');
    if (!text) return say('说点什么再保存吧。', 'warn');
    var src = state.momentImg || '';
    var old = (state.editing && state.editing.kind === 'moments')
      ? findItem('moments', state.editing.id) : null;
    var item = {
      id: old ? old.id : uid('m'), date: val('f-moment-date') || (old ? old.date : today()), text: text,
      mood: val('f-mood') || '✨ 记录', place: val('f-place') || '',
      /* 重编辑保留原有配图；选了新图才整组替换 */
      images: (old && old.images && old.images.length && !src) ? old.images.slice() : (src ? [src] : []),
      likes: old ? (old.likes || 0) : 0
    };
    if (!upsert('moments', item)) return say('本机存储空间不足，请先发布并清理。', 'warn');
    state.momentImg = '';
    state.editing = null;
    reloadSoon(old ? '说说已更新' : '说说已保存');
  }
  function saveChatter() {
    var title = val('f-ch-title'), body = val('f-ch-body');
    if (!title || !body) return say('标题和正文都要填。', 'warn');
    var old = (state.editing && state.editing.kind === 'chatter')
      ? findItem('chatter', state.editing.id) : null;
    var item = {
      id: old ? old.id : uid('c'), date: val('f-ch-date') || (old ? old.date : today()), title: title,
      summary: val('f-ch-summary') || clipSummary(title, 24), tags: splitTags(val('f-ch-tags')),
      mood: val('f-ch-mood') || '🌸 平静',
      markdown: body, body: htmlOfBody(body), format: 'markdown'
    };
    if (!upsert('chatter', item)) return say('本机存储空间不足，请先发布并清理。', 'warn');
    state.editing = null;
    reloadSoon(old ? '杂谈已更新' : '杂谈已保存');
  }
  function saveProject() {
    var name = val('f-pj-name');
    if (!name) return say('项目名不能为空。', 'warn');
    /* 重编辑保留原 id 与日期，避免变成一条新项目 */
    var old = (state.editing && state.editing.kind === 'projects')
      ? findItem('projects', state.editing.id) : null;
    var item = {
      id: old ? old.id : uid('pj'), name: name, desc: val('f-pj-desc'), tags: splitTags(val('f-pj-tags')),
      status: val('f-pj-status') || '记录', date: old ? old.date : today(), link: val('f-pj-link')
    };
    if (!upsert('projects', item)) return say('保存失败。', 'warn');
    state.editing = null;
    reloadSoon(old ? '项目已更新' : '项目已保存');
  }
  function saveFriend() {
    var name = val('f-fr-name'), url = val('f-fr-url');
    if (!name || !url) return say('名称和地址都要填。', 'warn');
    /* 重编辑保留原 id，避免变成一条新友链 */
    var old = (state.editing && state.editing.kind === 'friends')
      ? findItem('friends', state.editing.id) : null;
    var item = {
      name: name, desc: val('f-fr-desc'), url: url,
      status: old ? (old.status || 'Online') : 'Online',
      initial: val('f-fr-initial') || name.slice(0, 2)
    };
    item.id = old ? old.id : uid('fr');
    if (!upsert('friends', item)) return say('保存失败。', 'warn');
    state.editing = null;
    reloadSoon(old ? '友链已更新' : '友链已保存');
  }
  /* 前台与创作台共享同一个 DATA.site 对象，改完通知页面把导航头像一起换掉 */
  function notifySite() {
    try { document.dispatchEvent(new CustomEvent('zb:site-change')); } catch (e) {}
  }
  /* DATA.site 的本机覆盖层：名片与关于页共用一份，发布后随站点数据文件落库 */
  function persistSiteLocal() {
    if (!DATA.site || typeof DATA.site !== 'object') return false;
    return setLs(SITE_KEY, JSON.stringify({
      avatar: DATA.site.avatar, bio: DATA.site.bio,
      tagline: DATA.site.tagline, intro: DATA.site.intro,
      skills: DATA.site.skills, social: DATA.site.social,
      homeViewsVer: DATA.site.homeViewsVer
    }));
  }
  /* 把关于页表单当前值写回 DATA.site（不落盘不通知，供增删入口行前暂存） */
  function collectAbout() {
    var s = DATA.site;
    if (!s || typeof s !== 'object') return;
    var tagEl = document.getElementById('f-about-tagline');
    var intEl = document.getElementById('f-about-intro');
    var skEl = document.getElementById('f-about-skills');
    if (tagEl) s.tagline = String(tagEl.value || '').replace(/\s+$/, '');
    if (intEl) s.intro = String(intEl.value || '').replace(/\s+$/, '');
    if (skEl) s.skills = splitTags(skEl.value);
    var social = [], i = 0;
    while (document.getElementById('f-so-name-' + i)) {
      var name = val('f-so-name-' + i);
      var url = val('f-so-url-' + i);
      if (name || url) {
        var old = (s.social || [])[i] || {};
        var item = { name: name, url: url, note: val('f-so-note-' + i) };
        if (old.icon) item.icon = old.icon;
        if (old.accent) item.accent = true;
        social.push(item);
      }
      i++;
    }
    s.social = social;
  }
  function saveAbout() {
    collectAbout();
    if (!persistSiteLocal()) return say('本机存储空间不足，保存失败。', 'warn');
    notifySite();
    queueSync();
    say('关于页已保存：页面立即更新，并已自动同步到网站。');
  }
  function resetAbout() {
    ['tagline', 'intro', 'skills', 'social'].forEach(function (k) {
      DATA.site[k] = JSON.parse(JSON.stringify(RAW_SITE[k] !== undefined ? RAW_SITE[k] : (k === 'social' ? [] : '')));
    });
    persistSiteLocal();
    notifySite();
    queueSync();
    render(document.getElementById('app'));
    say('已恢复站点数据文件里的关于页内容，并已自动同步到网站。');
  }
  function saveSite() {
    var avatar = val('f-site-avatar') || RAW_SITE.avatar || 'assets/avatar.jpg';
    var bioEl = document.getElementById('f-site-bio');
    var bio = bioEl ? String(bioEl.value || '') : '';
    if (!DATA.site || typeof DATA.site !== 'object') DATA.site = {};
    DATA.site.avatar = avatar;
    DATA.site.bio = bio;
    if (!persistSiteLocal()) {
      return say('本机存储空间不足，换一张小一点的头像再试。', 'warn');
    }
    notifySite();
    queueSync();
    say('名片已保存：首页头像与签名立即更新，并已自动同步到网站。');
  }
  function resetSite() {
    delLs(SITE_KEY);
    DATA.site.avatar = RAW_SITE.avatar || 'assets/avatar.jpg';
    DATA.site.bio = RAW_SITE.bio || '';
    notifySite();
    setText('f-site-avatar', DATA.site.avatar);
    setText('f-site-bio', DATA.site.bio);
    var img = document.getElementById('site-avatar-preview');
    if (img) img.src = DATA.site.avatar;
    queueSync();
    say('已恢复站点数据文件里的头像与签名，并已自动同步到网站。');
  }
  /* 清空首页浏览量：Abacus 匿名键没有服务端清零入口，改用键位版本轮换——
     homeViewsVer 加一后，访客端改读 site-home-vN 新键，旧计数自然不再出现，
     并随站点数据自动同步，对所有设备的访客生效。 */
  function clearHomeViews() {
    if (!DATA.site || typeof DATA.site !== 'object') DATA.site = {};
    if (!window.confirm('确定清空首页浏览量吗？所有访客名片上的浏览数都会从零重新统计。')) return;
    DATA.site.homeViewsVer = (Number(DATA.site.homeViewsVer) || 1) + 1;
    persistSiteLocal();
    queueSync();
    notifySite();
    say('首页浏览量已清零：浏览键已轮换到新版本，自动同步落地后对所有访客生效。');
  }
  function savePhoto() {
    var ed = (state.editing && state.editing.kind === 'albums') ? findItem('albums', state.editing.id) : null;
    var pdate = val('f-photo-date') || today();
    var note = val('f-photo-note');
    var album = null, i;
    if (ed) {
      /* 重编辑：保留原 id 与相册创建日期，按标记移除旧照片，再补上新选的图片 */
      album = JSON.parse(JSON.stringify(ed));
      var at = val('f-album-title'), ad = val('f-album-desc');
      if (at) album.title = at;
      if (ad) album.desc = ad;
      var drops = (state.editing && state.editing.drop) || [];
      album.photos = (album.photos || []).filter(function (p, idx) { return drops.indexOf(idx) < 0; });
      if (!album.photos.length && !state.files.length) {
        return say('相册至少要留一张照片；要删整个相册请到「内容管理」。', 'warn');
      }
    } else {
      if (!state.files.length) return say('还没有选图片。', 'warn');
      var sel = val('f-album');
      var albums = DATA.albums || [];
      if (sel && sel !== '__new__') {
        for (i = 0; i < albums.length; i++) if (albums[i].id === sel) album = albums[i];
      }
      if (!album) {
        var t = val('f-album-title');
        if (!t) return say('新建相册要写个标题。', 'warn');
        album = { id: uid('a'), title: t, date: pdate, desc: val('f-album-desc') || t, cover: '', photos: [] };
      } else {
        album = JSON.parse(JSON.stringify(album));
      }
    }
    state.files.forEach(function (src) {
      album.photos.push({
        src: src, title: note || (album.title + ' · ' + (album.photos.length + 1)),
        note: note || '', date: pdate
      });
    });
    album.cover = album.photos.length ? album.photos[0].src : '';
    if (!upsert('albums', album)) return say('图片太大，本机存不下；请先发布已保存的内容并清理。', 'warn');
    state.files = [];
    state.editing = null;
    reloadSoon((ed ? '相册已更新' : '已加入新照片') + '，现在共 ' + album.photos.length + ' 张照片');
  }

  /* ---------- 发布上线 / 自动同步 ----------
     每次新增、修改、删除内容后，把整份站点数据写回仓库的 assets/site-data.js，
     其它设备刷新就能看到最新状态。写权限仍由 GitHub 细粒度令牌决定；
     改动始终先落本机，网络失败保留本机内容并自动重试，不会丢数据。 */
  function b64utf8(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  /* ---------- 照片出库 ----------
     data URI 的图片（相册 / 说说 / 头像 / 封面）不进数据文件：同步前先把它们
     按内容哈希上传成仓库真实文件 assets/photos/p-<hash>.<ext>，DATA 原地换成
     /assets/photos/... URL。同一张图哈希相同 → 文件名相同 → 已存在且内容一致就
     跳过上传，天然去重、重试幂等；数据文件从 MB 级回到 KB 级，访客首屏不再拉大 JSON。 */
  function walkImages(node, fn) {
    if (typeof node === 'string') {
      if (/^data:image\/[a-z0-9.+-]+;base64,/.test(node)) fn(node);
      return;
    }
    if (Array.isArray(node)) { node.forEach(function (v) { walkImages(v, fn); }); return; }
    if (node && typeof node === 'object') {
      Object.keys(node).forEach(function (k) { walkImages(node[k], fn); });
    }
  }
  function imageHash(bytes) {
    var c = window.crypto || window.msCrypto;
    if (c && c.subtle && c.subtle.digest) {
      return c.subtle.digest('SHA-256', bytes).then(function (buf) {
        var hex = '';
        new Uint8Array(buf).forEach(function (b) {
          hex += (b < 16 ? '0' : '') + b.toString(16);
        });
        return hex.slice(0, 12);
      });
    }
    /* 无 crypto.subtle 的回落：FNV-1a + 长度，仍能稳定命名（冲突概率可忽略） */
    var h = 0x811c9dc5;
    for (var i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = (h * 0x01000193) >>> 0; }
    return Promise.resolve(('00000000' + h.toString(16)).slice(-8) +
      ('0000' + (bytes.length % 65536).toString(16)).slice(-4));
  }
  function toImageNode(dataUri) {
    var m = String(dataUri).match(/^data:image\/([a-z0-9.+-]+);base64,([\s\S]*)$/);
    if (!m) return null;
    var ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    var bin;
    try { bin = atob(m[2]); } catch (e) { return null; }
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return imageHash(bytes).then(function (hash) {
      var name = 'p-' + hash + '.' + ext;
      return { path: 'assets/photos/' + name, url: '/assets/photos/' + name, b64: m[2] };
    });
  }
  function ghPut(path, b64, message, pat) {
    var url = 'https://api.github.com/repos/' + REPO + '/contents/' + path;
    var headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + pat,
      'Content-Type': 'application/json'
    };
    return ghFetch(url + '?ref=' + BRANCH, { method: 'GET', headers: headers })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        /* 文件已存在且内容一致：跳过，不制造空提交 */
        if (d && d.sha && d.content && String(d.content).replace(/\n/g, '') === b64) return;
        return ghFetch(url, {
          method: 'PUT', headers: headers,
          body: JSON.stringify({
            message: message, content: b64,
            sha: d && d.sha, branch: BRANCH
          })
        }).then(function (r) {
          if (!r.ok) throw new Error('图片上传失败 ' + path + '（HTTP ' + r.status + '）');
        });
      });
  }
  function extractPhotos(pat, message) {
    var found = [];
    walkImages(DATA, function (uri) { if (found.indexOf(uri) < 0) found.push(uri); });
    if (!found.length) return Promise.resolve(0);
    syncStatus('正在把 ' + found.length + ' 张内嵌图片转为仓库文件…');
    var map = {};
    var chain = Promise.resolve();
    found.forEach(function (uri) {
      chain = chain.then(function () {
        return toImageNode(uri).then(function (node) {
          if (!node) return;
          map[uri] = node.url;
          return ghPut(node.path, node.b64, message, pat);
        });
      });
    });
    return chain.then(function () {
      (function swap(node) {
        if (typeof node === 'string') return map[node] !== undefined ? map[node] : node;
        if (Array.isArray(node)) { node.forEach(function (v, i) { node[i] = swap(v); }); return node; }
        if (node && typeof node === 'object') {
          Object.keys(node).forEach(function (k) { node[k] = swap(node[k]); });
          return node;
        }
        return node;
      })(DATA);
      return Object.keys(map).length;
    });
  }
  function ghFetch(url, opts) {
    var f = window.fetch;
    if (!f) return Promise.reject(new Error('当前浏览器不支持 fetch'));
    return f.call(window, url, opts);
  }
  function pushData(payload, pat, message) {
    var url = 'https://api.github.com/repos/' + REPO + '/contents/' + FILE;
    var headers = {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + pat,
      'Content-Type': 'application/json'
    };
    return ghFetch(url + '?ref=' + BRANCH, { method: 'GET', headers: headers })
      .then(function (r) {
        if (!r.ok) throw new Error('读取仓库失败（HTTP ' + r.status + '），请检查令牌权限。');
        return r.json();
      })
      .then(function (d) {
        return ghFetch(url, {
          method: 'PUT', headers: headers,
          body: JSON.stringify({
            message: message || ('content: publish from owner studio ' + today()),
            content: b64utf8(payload), sha: d.sha, branch: BRANCH
          })
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error('提交失败（HTTP ' + r.status + '），请检查令牌是否有 Contents 写权限。');
        return r.json();
      });
  }
  function autoEnabled() { return ls(AUTO_KEY) !== '0'; }
  function syncToken() { return String(state.pat || ls(PAT_KEY) || '').trim(); }
  function markPending() { setLs(PENDING_KEY, '1'); }
  function stamp() {
    try { return new Date().toTimeString().slice(0, 5); } catch (e) { return ''; }
  }
  function syncStatus(msg, warn) {
    sync.status = String(msg || '');
    sync.warn = !!warn;
    var box = document.getElementById('sync-state');
    if (box) box.textContent = sync.status;
    var badge = document.getElementById('sync-badge');
    if (badge) {
      badge.textContent = sync.warn ? '待同步' : '自动同步';
      badge.className = 'sync-badge' + (sync.warn ? ' warn' : '');
    }
  }
  function queueSync() {
    if (!isOwner()) return;
    if (!autoEnabled()) { syncStatus('自动同步已关闭：改动只保存在这台设备', true); return; }
    if (!syncToken()) { syncStatus('待同步：本机已保存，到「发布上线」填一次令牌即可自动同步', true); return; }
    markPending();
    sync.dirty = true;
    if (sync.timer) window.clearTimeout(sync.timer);
    sync.timer = window.setTimeout(runSync, 1200);
    syncStatus('改动已保存，正在同步到网站…');
  }
  /* 发布成功且 Pages 换上新文件后，把内置快照刷新成刚发布的内容再清本机副本：
     以后任何设备（含这台）合并或清空都不会把旧内容带回来。 */
  function refreshBuiltin() {
    KINDS.forEach(function (k) {
      BUILTIN[k] = JSON.parse(JSON.stringify(DATA[k] || []));
    });
    BUILTIN_DEAD.posts = ((DATA.deleted && DATA.deleted.posts) || []).slice();
    if (DATA.site) { RAW_SITE.avatar = DATA.site.avatar; RAW_SITE.bio = DATA.site.bio; }
  }
  function waitLive(payload) {
    var tries = 0;
    function check() {
      tries++;
      ghFetch('assets/site-data.js?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : ''; }, function () { return ''; })
        .then(function (txt) {
          if (String(txt).replace(/\r\n/g, '\n') === payload) {
            if (!sync.dirty && !sync.running &&
                dataFile().replace(/\r\n/g, '\n') === payload) {
              refreshBuiltin();
              delLs(LOCAL_KEY); delLs(SITE_KEY); delLs(PENDING_KEY);
              try {
                if (window.sessionStorage) window.sessionStorage.setItem('zb-data-v', String(Date.now()));
              } catch (e) {}
            }
            syncStatus('已同步到网站 · 所有访客可见 · ' + stamp());
          } else if (tries < 20) {
            window.setTimeout(check, 4000);
          } else {
            syncStatus('已提交到仓库，站点构建稍慢；稍后刷新即可看到最新内容');
          }
        }, function () { syncStatus('已提交到仓库，站点构建中…'); });
    }
    window.setTimeout(check, 2000);
  }
  function runSync() {
    if (sync.running || !sync.dirty) return;
    var pat = syncToken();
    if (!pat) { syncStatus('待同步：本机已保存，到「发布上线」填一次令牌即可自动同步', true); return; }
    sync.dirty = false;
    sync.running = true;
    var payload = '';
    extractPhotos(pat, 'content: photo files from owner studio ' + today())
      .then(function () {
        payload = dataFile().replace(/\r\n/g, '\n');
        return pushData(payload, pat,
          'content: auto sync from owner studio ' + today());
      })
      .then(function () {
        sync.running = false;
        sync.fails = 0;
        syncStatus('已提交到仓库，等待站点构建…');
        waitLive(payload);
        if (sync.dirty) window.setTimeout(runSync, 400);
      })
      .catch(function (e) {
        sync.running = false;
        sync.fails++;
        var why = String((e && e.message) || e);
        if (sync.fails <= 3) {
          sync.dirty = true;
          syncStatus('同步失败（' + why + '），' + (sync.fails * 10) + ' 秒后自动重试', true);
          window.setTimeout(runSync, sync.fails * 10000);
        } else {
          syncStatus('同步失败：' + why + '；改动仍安全保存在本机，可到「发布上线」重试', true);
        }
      });
  }
  function syncNow() {
    if (!syncToken()) return say('先在「发布上线」填入令牌并勾选记住，或点「保存设置并发布当前内容」。', 'warn');
    sync.fails = 0;
    markPending();
    sync.dirty = true;
    if (sync.timer) window.clearTimeout(sync.timer);
    say('正在同步当前内容到网站…');
    runSync();
  }
  function syncOff() {
    setLs(AUTO_KEY, '0');
    delLs(PAT_KEY);
    state.pat = '';
    syncStatus('自动同步已关闭，令牌已从本机移除', true);
    render(document.getElementById('app'));
    say('自动同步已关闭；改动仍会保存在这台设备。');
  }
  function publish() {
    if (state.busy || sync.running) return;
    var pat = val('f-pat') || ls(PAT_KEY) || state.pat || '';
    if (!pat) return say('先填入 GitHub 细粒度令牌，或者用「办法二」导出文件发给我。', 'warn');
    state.pat = pat;
    var autoBox = document.getElementById('f-autosync');
    var remember = document.getElementById('f-remember');
    var wantAuto = autoBox ? autoBox.checked : autoEnabled();
    setLs(AUTO_KEY, wantAuto ? '1' : '0');
    if (wantAuto || (remember && remember.checked)) setLs(PAT_KEY, pat);
    else delLs(PAT_KEY);
    sync.fails = 0;
    if (sync.timer) window.clearTimeout(sync.timer);
    sync.dirty = false;
    state.busy = true;
    say('正在提交到仓库…');
    syncStatus('正在同步到网站…');
    var payload = '';
    extractPhotos(pat, 'content: photo files from owner studio ' + today())
      .then(function () {
        payload = dataFile().replace(/\r\n/g, '\n');
        return pushData(payload, pat, 'content: publish from owner studio ' + today());
      })
      .then(function () {
        state.busy = false;
        delLs(PENDING_KEY);
        syncStatus('已提交到仓库，等待站点构建…');
        /* 提交成功后不立刻跳走：等 Pages 真的换上新内容再清本机副本并回首页 */
        var tries = 0;
        function checkLive() {
          tries++;
          ghFetch('assets/site-data.js?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.text() : ''; }, function () { return ''; })
            .then(function (txt) {
              if (String(txt).replace(/\r\n/g, '\n') === payload) {
                homeSoon(true, '站点已更新 · 创作台内容已清空，正在回到首页…');
              } else if (tries >= 20) {
                homeSoon(false, '已提交到仓库，构建稍慢；稍后刷新首页即可看到，正在回到首页…');
              } else {
                say('已提交到仓库，等待站点构建…（' + tries + '/20）');
                window.setTimeout(checkLive, 4000);
              }
            }, function () { homeSoon(false, '已提交到仓库，正在回到首页…'); });
        }
        say('已提交到仓库，等待站点构建…');
        window.setTimeout(checkLive, 2000);
      })
      .catch(function (e) {
        state.busy = false;
        var why = String((e && e.message) || e);
        say(why, 'warn');
        syncStatus('同步失败：' + why, true);
      });
  }

  /* ---------- 事件 ---------- */
  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var panel = t.closest('#studio-panel') || t.closest('.studio-lock');
    var door = t.closest('#owner-door');
    if (!panel && !door) return;

    /* 写作工作台：工具栏插入、视图切换、标签 / 分类 */
    var mdBtn = t.closest('[data-md]');
    if (mdBtn) {
      var tool = MD_TOOLS[Number(mdBtn.getAttribute('data-md'))];
      if (tool) insertMd(tool[1], tool[2], '', tool[4]);
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
    var edit = t.closest('[data-edit]');
    if (edit) {
      var ep = edit.getAttribute('data-edit').split('::');
      var target = findItem(ep[0], ep[1]);
      if (!target) return;
      if (ep[0] === 'posts') {
        var d = blankDraft();
        d.slug = target.slug || ''; d.title = target.title || '';
        d.markdown = target.markdown || htmlToMd(target.body);
        d.tags = (target.tags || []).slice(); d.cover = target.cover || '';
        d.summary = target.summary || ''; d.category = target.category || '随笔';
        d.date = target.date || today(); d.status = target.status || 'published';
        state.draft = d;
        state.editing = { kind: 'posts', id: target.slug };
        state.tab = 'post';
        /* 先重绘出写作表单，再落盘，避免旧页面的空表单把刚载入的标题覆盖掉 */
        render(document.getElementById('app'));
        writeDraft(true);
        say('已载入这篇文章，改完点「保存修改」。');
      } else if (ep[0] === 'moments') {
        state.editing = { kind: 'moments', id: target.id };
        state.momentImg = '';
        state.tab = 'moment';
        render(document.getElementById('app'));
        setText('f-moment-text', target.text);
        setText('f-mood', target.mood);
        setText('f-place', target.place);
        setText('f-moment-date', target.date || today());
        var mp = document.getElementById('moment-img-preview');
        if (mp && target.images && target.images.length) {
          mp.innerHTML = target.images.map(function (s) {
            return '<img src="' + esc(s) + '" alt="说说现有配图">';
          }).join('');
        }
        say('已载入这条说说，改完点「保存修改」。');
      } else if (ep[0] === 'chatter') {
        state.editing = { kind: 'chatter', id: target.id };
        state.tab = 'chatter';
        render(document.getElementById('app'));
        setText('f-ch-title', target.title);
        setText('f-ch-summary', target.summary);
        setText('f-ch-tags', (target.tags || []).join(', '));
        setText('f-ch-mood', target.mood);
        setText('f-ch-date', target.date || today());
        setText('f-ch-body', target.markdown || htmlToMd(target.body));
        say('已载入这则杂谈，改完点「保存修改」。');
      } else if (ep[0] === 'projects') {
        state.editing = { kind: 'projects', id: target.id };
        state.tab = 'project';
        render(document.getElementById('app'));
        setText('f-pj-name', target.name);
        setText('f-pj-desc', target.desc);
        setText('f-pj-tags', (target.tags || []).join(', '));
        setText('f-pj-status', target.status);
        setText('f-pj-link', target.link);
        say('已载入这个项目，改完点「保存修改」。');
      } else if (ep[0] === 'friends') {
        state.editing = { kind: 'friends', id: target.id };
        state.tab = 'friend';
        render(document.getElementById('app'));
        setText('f-fr-name', target.name);
        setText('f-fr-desc', target.desc);
        setText('f-fr-url', target.url);
        setText('f-fr-initial', target.initial);
        say('已载入这个友链，改完点「保存修改」。');
      } else if (ep[0] === 'albums') {
        state.editing = { kind: 'albums', id: target.id, drop: [] };
        state.files = [];
        state.tab = 'photo';
        render(document.getElementById('app'));
        say('已载入这个相册：可改名、补充图片或移除已有照片，改完点「保存修改」。');
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
      var name = '';
      var victim = findItem(parts[0], parts[1]);
      if (victim) name = victim.title || victim.name || (victim.text || '').slice(0, 18);
      if (!window.confirm('确定删除「' + (name || parts[1]) + '」吗？删除也会自动同步到网站。')) return;
      remove(parts[0], parts[1]);
      if (state.editing && state.editing.kind === parts[0] && state.editing.id === parts[1]) state.editing = null;
      render(document.getElementById('app'));
      say('已删除并自动同步到网站；已发布内容可在仓库提交历史找回。');
      return;
    }
    var act = t.closest('[data-act]');
    if (!act) return;
    var a = act.getAttribute('data-act');
    if (a === 'lock') { revoke(); syncNav(); render(document.getElementById('app')); return; }
    if (a === 'cancel-edit') {
      var wasPost = !!(state.editing && state.editing.kind === 'posts');
      var wasAlbum = !!(state.editing && state.editing.kind === 'albums');
      state.editing = null;
      state.momentImg = '';
      if (wasAlbum) state.files = [];
      if (wasPost) { state.draft = blankDraft(); delLs(DRAFT_KEY); }
      render(document.getElementById('app'));
      say('已退出编辑，表单已清空。');
      return;
    }
    if (a === 'album-photo-toggle') {
      if (!state.editing || state.editing.kind !== 'albums') return;
      var pi = parseInt(act.getAttribute('data-i'), 10);
      if (isNaN(pi) || pi < 0) return;
      /* 重绘前接住刚填的字段，移除标记与待保存的新图片都留在 state 里 */
      state.editing.form = {
        title: val('f-album-title'), desc: val('f-album-desc'),
        date: val('f-photo-date'), note: val('f-photo-note')
      };
      if (!state.editing.drop) state.editing.drop = [];
      var di = state.editing.drop.indexOf(pi);
      if (di >= 0) state.editing.drop.splice(di, 1); else state.editing.drop.push(pi);
      render(document.getElementById('app'));
      return;
    }
    if (a === 'tidy') return tidyForm();
    if (a === 'draft-save') return savePost(true);
    if (a === 'publish-post') return savePost(false);
    if (a === 'cover-pick') {
      var cf = document.getElementById('f-cover-file');
      if (cf && cf.click) cf.click();
      return;
    }
    if (a === 'save-photo') return savePhoto();
    if (a === 'save-moment') return saveMoment();
    if (a === 'save-chatter') return saveChatter();
    if (a === 'save-project') return saveProject();
    if (a === 'save-friend') return saveFriend();
    if (a === 'save-site') return saveSite();
    if (a === 'save-about') return saveAbout();
    if (a === 'about-reset') return resetAbout();
    if (a === 'about-so-add') {
      collectAbout();
      if (!DATA.site.social || Object.prototype.toString.call(DATA.site.social) !== '[object Array]') {
        DATA.site.social = [];
      }
      DATA.site.social.push({ name: '', url: '', note: '' });
      render(document.getElementById('app'));
      return;
    }
    if (a === 'about-so-del') {
      collectAbout();
      var di = parseInt(t.getAttribute('data-i'), 10);
      if (DATA.site.social && di >= 0 && di < DATA.site.social.length) {
        DATA.site.social.splice(di, 1);
        render(document.getElementById('app'));
      }
      return;
    }
    if (a === 'site-reset') return resetSite();
    if (a === 'clear-home-views') return clearHomeViews();
    if (a === 'preview-post') { setMode('preview'); return; }
    if (a === 'export-js') return download('site-data.js', dataFile());
    if (a === 'export-json') return download('studio-backup.json', JSON.stringify(DATA, null, 2));
    if (a === 'sync-now') return syncNow();
    if (a === 'sync-off') return syncOff();
    if (a === 'publish') return publish();
    if (a === 'clear-local') {
      if (!window.confirm('清空保存在这台设备上的全部本机内容与草稿？已发布上线的内容不受影响。')) return;
      delLs(LOCAL_KEY); delLs(DRAFT_KEY);
      state.draft = blankDraft(); state.editing = null; state.momentImg = '';
      mergeLocal();
      render(document.getElementById('app'));
      say('本机内容与草稿已清空；已发布上线的内容不受影响。');
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
    if (t.id === 'f-site-avatar-file' && t.files && t.files.length) {
      compress(t.files[0], function (src) {
        if (!src) return say('图片读取失败。', 'warn');
        setText('f-site-avatar', src);
        var img = document.getElementById('site-avatar-preview');
        if (img) img.src = src;
      }, 320, .82);
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
    } else if (t.id === 'f-site-avatar') {
      var img = document.getElementById('site-avatar-preview');
      if (img) img.src = t.value;
    } else if (t.id === 'f-category' || t.id === 'f-date') {
      scheduleSave();
    }
  }
  /* Tab / Shift+Tab：选区所跨行整体缩进或反缩进两空格（列表嵌套、代码块对齐通用） */
  var EDITABLE_AREAS = ['f-body', 'f-ch-body', 'f-moment-text'];
  function shiftIndent(ta, back) {
    var v = ta.value, s = ta.selectionStart, e2 = ta.selectionEnd;
    var top = ta.scrollTop || 0;
    var ls = v.lastIndexOf('\n', s - 1) + 1;
    var le = v.indexOf('\n', e2); if (le < 0) le = v.length;
    var delta = 0;
    var lines = v.slice(ls, le).split('\n').map(function (l) {
      if (back) {
        var cut = l.match(/^(\t| {1,2})/);
        if (cut) { delta -= cut[0].length; return l.slice(cut[0].length); }
        return l;
      }
      delta += 2;
      return '  ' + l;
    });
    ta.value = v.slice(0, ls) + lines.join('\n') + v.slice(le);
    try { ta.setSelectionRange(Math.max(ls, s + delta), Math.max(ls, e2 + delta)); } catch (err) {}
    try { ta.scrollTop = top; } catch (err2) {}
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (err3) {}
  }
  function onKeydown(e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'f-tag-input' && (e.key === 'Enter' || e.keyCode === 13)) {
      if (e.preventDefault) e.preventDefault();
      addTag(t.value);
      t.value = '';
    }
    if (EDITABLE_AREAS.indexOf(t.id) >= 0 && (e.key === 'Tab' || e.keyCode === 9)) {
      if (e.preventDefault) e.preventDefault();
      shiftIndent(t, !!(e.shiftKey));
      return;
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
    var isPost = isOwner() && state.tab === 'post';
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
    if (isOwner() && state.tab === 'site') {
      setText('f-site-avatar', (DATA.site || {}).avatar || 'assets/avatar.jpg');
      setText('f-site-bio', (DATA.site || {}).bio || '');
    }
    if (isOwner() && state.tab === 'about') {
      var sa = DATA.site || {};
      setText('f-about-tagline', sa.tagline || '');
      setText('f-about-intro', sa.intro || '');
      setText('f-about-skills', (sa.skills || []).join(', '));
      (sa.social || []).forEach(function (so, i) {
        setText('f-so-name-' + i, so.name || '');
        setText('f-so-url-' + i, so.url || '');
        setText('f-so-note-' + i, so.note || '');
      });
    }
    if (isPost) {
      renderTagPills(); renderTagHistory(); renderCover();
      syncFromForm(); setMode(state.mode); paintSaveLabel();
    }
  }

  gateBoot();
  applyContentReset();
  mergeLocal();

  /* 自动同步状态：没配置令牌就明确标「待同步」；有令牌且本机留有未发布改动时，
     一打开创作台就补一次同步（上次离线 / 失败的改动不会一直停在这台设备）。 */
  if (!autoEnabled() || !syncToken()) {
    syncStatus('尚未配置自动同步：改动只保存在这台设备，到「发布上线」配置一次即可。', true);
  } else {
    syncStatus('自动同步已开启：每次改动都会写进网站。');
    var hasLocal = !!ls(SITE_KEY);
    if (!hasLocal) {
      var bootLocal = readLocal(), bootDead = readDead();
      KINDS.forEach(function (k) {
        if ((bootLocal[k] || []).length || (bootDead[k] || []).length) hasLocal = true;
      });
    }
    if (hasLocal || ls(PENDING_KEY) === '1') {
      markPending();
      sync.dirty = true;
      sync.timer = window.setTimeout(runSync, 1500);
      syncStatus('检测到本机有未同步的改动，正在补同步…');
    }
  }

  window.STUDIO = {
    render: render,
    isOwner: isOwner,
    _sha256: sha256,
    _salt: SALT,
    _gateSalt: GATE_SALT,
    _hash: OWNER_HASH,
    _dataFile: dataFile,
    _mergeLocal: mergeLocal,
    _syncNow: syncNow
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
