/* 纸上留白 · 站长创作台
   静态站没有账号系统，因此「是不是我」由两层凭证判定：
   1) 设备凭证：一次性激活码的 SHA-256 摘要写在源码里（明文不落盘），
      校验通过后在本机写入带签名的 30 天会话；只有这台设备会看到创作台入口。
   2) 发布凭证：真正把内容写上线时，用 GitHub 细粒度令牌，
      由 GitHub 服务器确认「你确实是这个仓库的所有者」，前端说了不算。
   创作内容先存本机 localStorage，发布时整体重写 assets/site-data.js 推到仓库。 */

(function () {
  var DATA = window.STUDIO_DATA;
  if (!DATA) return;

  var SALT = 'paper-blank::owner::v1';
  var OWNER_HASH = 'b4f6cb0d29026eb71dbf6bb13a2ead3fdf9034bdc6fbf6c4954f334efe7c0ef3';
  var DEVICE_KEY = 'zb-owner-device';
  var LOCAL_KEY = 'zb-studio-local';
  var PAT_KEY = 'zb-gh-pat';
  var REPO = 'ZXY-cc/zxy-cc.github.io';
  var FILE = 'assets/site-data.js';
  var BRANCH = 'main';
  var DAYS = 30;
  var KINDS = ['posts', 'moments', 'chatter', 'albums', 'projects', 'friends'];
  var state = { tab: 'post', msg: '', busy: false, files: [] };

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

  /* ---------- 判定：设备凭证 ---------- */
  function isOwner() {
    var m = null;
    try { m = JSON.parse(ls(DEVICE_KEY) || 'null'); } catch (e) { m = null; }
    if (!m || !m.t) return false;
    if (Date.now() - m.t > DAYS * 86400000 * 1000) return false;
    return m.sig === sha256(SALT + '::device::' + m.t);
  }
  function grant() {
    var t = Date.now();
    setLs(DEVICE_KEY, JSON.stringify({ t: t, sig: sha256(SALT + '::device::' + t) }));
  }
  function revoke() { delLs(DEVICE_KEY); }
  function checkCode(code) { return sha256(SALT + String(code || '').trim()) === OWNER_HASH; }
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

  /* ---------- 轻量 Markdown ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function inline(s) {
    var t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*|\/[^)\s]*)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return t;
  }
  function md2html(src) {
    var lines = String(src || '').split(/\r?\n/);
    var out = [], i = 0, list = false, quote = false, code = false, buf = [];
    function closeList() { if (list) { out.push('</ul>'); list = false; } }
    function closeQuote() { if (quote) { out.push('</blockquote>'); quote = false; } }
    while (i < lines.length) {
      var l = lines[i];
      if (/^```/.test(l)) {
        if (code) { out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>'); buf = []; }
        code = !code; i++; continue;
      }
      if (code) { buf.push(l); i++; continue; }
      if (/^###\s+/.test(l)) {
        closeList(); closeQuote(); out.push('<h3>' + inline(l.replace(/^###\s+/, '')) + '</h3>');
      } else if (/^##\s+/.test(l)) {
        closeList(); closeQuote(); out.push('<h2>' + inline(l.replace(/^##\s+/, '')) + '</h2>');
      } else if (/^>\s?/.test(l)) {
        closeList();
        if (!quote) { out.push('<blockquote>'); quote = true; }
        out.push('<p>' + inline(l.replace(/^>\s?/, '')) + '</p>');
      } else if (/^[-*]\s+/.test(l)) {
        closeQuote();
        if (!list) { out.push('<ul>'); list = true; }
        out.push('<li>' + inline(l.replace(/^[-*]\s+/, '')) + '</li>');
      } else if (/^\s*$/.test(l)) {
        closeList(); closeQuote();
      } else {
        closeList(); closeQuote(); out.push('<p>' + inline(l) + '</p>');
      }
      i++;
    }
    closeList(); closeQuote();
    if (code && buf.length) out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
    return out.join('');
  }

  /* ---------- 小工具 ---------- */
  function today() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function nowTime() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function uid(p) { return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
  function splitTags(s) { return s.split(/[,，、\s]+/).filter(Boolean); }
  function htmlOfBody(s) { return md2html(s); }
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
    return '/* 纸上留白 · 由创作台发布生成 */\nwindow.STUDIO_DATA = ' +
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
    return '<div class="studio-lock glass">' +
      '<div class="lock-star"><svg viewBox="0 0 100 100"><use href="#puffy-star"/></svg></div>' +
      '<h1>这扇门只给站长开</h1>' +
      '<p>输入一次性激活码，把这台设备认作「我的设备」。之后每次打开网站都会自动识别，访客不会看到任何入口或提示。</p>' +
      '<label class="f-label" for="f-code">激活码</label>' +
      '<input class="f-input" id="f-code" type="password" autocomplete="off" placeholder="请输入激活码">' +
      '<button class="primary-btn" type="button" data-act="unlock">识别设备</button>' +
      '<div id="studio-msg" class="studio-msg"></div>' +
      '<p class="lock-foot">写文章、发图片、发布上线都在这里完成。</p></div>';
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
  function formPost() {
    return '<div class="studio-form glass">' +
      '<h2>写一篇新文章</h2><p class="f-hint">正文支持 ## 标题、- 列表、> 引用、```代码块、`行内代码` 与 **加粗**。</p>' +
      field('标题', 'f-title', '给这篇文章起个名字') +
      '<div class="f-row">' + field('日期', 'f-date', today(), 'date') + field('标签（逗号分隔）', 'f-tags', '算法, 笔记') + '</div>' +
      field('摘要', 'f-summary', '一句话说明写了什么') +
      area('正文', 'f-body', '## 第一节\n\n从这里开始写…', 12) +
      '<div class="f-actions"><button class="primary-btn" type="button" data-act="save-post">保存到本机</button>' +
      '<button class="soft-btn" type="button" data-act="preview-post">预览</button></div>' +
      '<div id="post-preview" class="studio-preview"></div></div>';
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
      '下面两种办法任选其一，都能让 https://zxyblog.dpdns.org 更新。</p>' +
      '<h3>办法一 · 导出文件交给助手</h3>' +
      '<p class="f-hint">下载 <code>site-data.js</code>，发给我，我用仓库部署密钥推送（不需要你给任何令牌）。</p>' +
      '<div class="f-actions"><button class="soft-btn" type="button" data-act="export-js">下载 site-data.js</button>' +
      '<button class="soft-btn" type="button" data-act="export-json">下载备份 JSON</button></div>' +
      '<h3>办法二 · 自己一键发布</h3>' +
      '<p class="f-hint">在 GitHub 生成一个 <b>细粒度令牌</b>，只授权 <code>ZXY-cc/zxy-cc.github.io</code> 的 Contents 读写。' +
      '令牌只保存在这台设备的浏览器里，只发往 api.github.com，不会写进任何导出文件。</p>' +
      field('GitHub 细粒度令牌', 'f-pat', 'github_pat_…', 'password') +
      '<label class="f-check"><input type="checkbox" id="f-remember" checked> 在这台设备记住令牌</label>' +
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
    return '<div class="studio-wrap" id="studio-panel">' +
      '<div class="studio-head glass"><div><div class="page-kicker">OWNER STUDIO</div>' +
      '<h1>创作台</h1><p>这台设备已识别为站长的设备 · 内容先存本机，发布后才对所有访客可见。</p></div>' +
      '<button class="soft-btn" type="button" data-act="lock">退出站长模式</button></div>' +
      tabHtml() + '<div id="studio-msg" class="studio-msg">' + esc(state.msg) + '</div>' +
      formHtml() + '</div>';
  }

  /* ---------- 图片压缩 ---------- */
  function compress(file, done) {
    try {
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          var max = 1200, w = img.width, h = img.height;
          var s = Math.min(1, max / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.round(w * s); c.height = Math.round(h * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          done(c.toDataURL('image/jpeg', .82));
        };
        img.onerror = function () { done(''); };
        img.src = ev.target.result;
      };
      reader.onerror = function () { done(''); };
      reader.readAsDataURL(file);
    } catch (e) { done(''); }
  }

  /* ---------- 保存动作 ---------- */
  function savePost() {
    var title = val('f-title');
    var body = val('f-body');
    if (!title) return say('请先写标题。', 'warn');
    if (!body) return say('正文还是空的。', 'warn');
    var html = htmlOfBody(body);
    var chars = String(body).replace(/\s/g, '').length;
    var item = {
      slug: uid('p'), title: title, date: val('f-date') || today(),
      reading: '约 ' + Math.max(1, Math.round(chars / 400)) + ' 分钟',
      tags: splitTags(val('f-tags')), summary: val('f-summary') || title, body: html
    };
    if (!upsert('posts', item)) return say('本机存储空间不足，请先到「发布上线」导出并清理。', 'warn');
    reloadSoon('文章已保存');
  }
  function saveMoment() {
    var text = val('f-moment-text');
    if (!text) return say('说点什么再保存吧。', 'warn');
    var src = state.momentImg || '';
    var item = {
      id: uid('m'), date: today(), time: nowTime(), text: text,
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
      id: uid('c'), date: today(), time: nowTime(), title: title,
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
    if (t.closest('[data-act="unlock"]')) {
      var code = val('f-code');
      if (!checkCode(code)) return say('激活码不对。', 'warn');
      grant(); syncNav(); render(document.getElementById('app'));
      say('设备已识别，欢迎回来。');
      return;
    }
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
    if (a === 'save-post') return savePost();
    if (a === 'save-photo') return savePhoto();
    if (a === 'save-moment') return saveMoment();
    if (a === 'save-chatter') return saveChatter();
    if (a === 'save-project') return saveProject();
    if (a === 'save-friend') return saveFriend();
    if (a === 'preview-post') {
      var box = document.getElementById('post-preview');
      if (box) box.innerHTML = '<h3>预览</h3><div class="article-body">' + htmlOfBody(val('f-body')) + '</div>';
      return;
    }
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
    if (t.id === 'f-album') {
      var nb = document.getElementById('new-album-box');
      if (nb) nb.style.display = t.value === '__new__' ? '' : 'none';
    }
  }
  function bindDoor() {
    var door = document.getElementById('owner-door');
    if (!door || !door.addEventListener) return;
    var taps = 0, timer = null;
    door.addEventListener('click', function () {
      if (isOwner()) { location.hash = '#/studio'; return; }
      taps++;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(function () { taps = 0; }, 1600);
      if (taps >= 3) { taps = 0; location.hash = '#/studio'; }
    });
  }

  function render(el) {
    if (!el) return;
    el.innerHTML = isOwner() ? studioHtml() : lockHtml();
    var nb = document.getElementById('new-album-box');
    var sel = document.getElementById('f-album');
    if (nb && sel && sel.value !== '__new__') nb.style.display = 'none';
    var dt = document.getElementById('f-date');
    if (dt && !dt.value) dt.value = today();
    var pat = ls(PAT_KEY);
    var f = document.getElementById('f-pat');
    if (pat && f) f.value = pat;
  }

  window.STUDIO = {
    render: render,
    isOwner: isOwner,
    _sha256: sha256,
    _salt: SALT,
    _hash: OWNER_HASH,
    _dataFile: dataFile,
    _mergeLocal: mergeLocal
  };
  mergeLocal();
  syncNav();
  bindDoor();
  var appEl = document.getElementById('app');
  if (appEl && appEl.addEventListener) {
    appEl.addEventListener('click', onClick);
    appEl.addEventListener('change', onChange);
  }
})();
