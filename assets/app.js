(function () {
  var SITE = window.SITE || {};
  var POSTS = (window.POSTS || []).slice().sort(function (a, b) {
    return b.date.localeCompare(a.date);
  });
  var app = document.getElementById('app');
  var query = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  document.title = SITE.title || '我的博客';
  document.getElementById('brand').textContent = SITE.title || '我的博客';
  document.getElementById('tagline').textContent = SITE.tagline || '';
  document.getElementById('foot-left').textContent =
    '© ' + (SITE.since || new Date().getFullYear()) + ' ' + (SITE.author || '');

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

  function renderList(posts, note) {
    var head = note ? '<p class="page-note">' + esc(note) + '</p>' : '';
    if (!posts.length) return head + '<p class="page-note">这里还没有文章。</p>';
    return head + posts.map(function (p) {
      return '<article class="post-item">' +
        metaHtml(p) +
        '<a class="post-title" href="#/post/' + encodeURIComponent(p.slug) + '">' + esc(p.title) + '</a>' +
        '<p class="post-summary">' + esc(p.summary) + '</p>' +
        tagsHtml(p.tags) +
        '</article>';
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
    return '<article class="article">' +
      '<h1>' + esc(p.title) + '</h1>' + metaHtml(p) + tagsHtml(p.tags) +
      tocHtml(p.body) +
      '<div class="article-body">' + p.body + '</div>' +
      '<a class="back-link" href="#/">← 返回文章列表</a>' +
      '</article>';
  }

  function renderTags() {
    var counts = {};
    POSTS.forEach(function (p) {
      (p.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    });
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    return '<p class="page-note">共 ' + names.length + ' 个标签</p>' +
      '<div class="tag-cloud">' + names.map(function (t) {
        return '<a class="tag" href="#/tag/' + encodeURIComponent(t) + '">' + esc(t) +
          '<span class="tag-count">' + counts[t] + '</span></a>';
      }).join('') + '</div>';
  }

  function renderAbout() {
    return '<div class="about-card">' + (SITE.about || '<p>关于本站。</p>') + '</div>';
  }

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

  function decode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function searchPosts(q) {
    var low = q.toLowerCase();
    return POSTS.filter(function (p) {
      return [p.title, p.summary, (p.tags || []).join(' '), p.date].join(' ').toLowerCase().indexOf(low) >= 0;
    });
  }

  function route() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('/').filter(Boolean).map(decode);
    var html, active = 'home';

    if (!parts.length) {
      var list = query ? searchPosts(query) : POSTS;
      html = renderList(list, query ? '搜索「' + query + '」 · ' + list.length + ' 篇' : '');
    } else if (parts[0] === 'post' && parts[1]) {
      var p = POSTS.filter(function (x) { return x.slug === parts[1]; })[0];
      html = p ? renderPost(p) : '<p class="page-note">没找到这篇文章。</p>';
    } else if (parts[0] === 'tags') {
      html = renderTags();
      active = 'tags';
    } else if (parts[0] === 'tag' && parts[1]) {
      html = renderList(POSTS.filter(function (p) {
        return (p.tags || []).indexOf(parts[1]) >= 0;
      }), '标签：' + parts[1]);
    } else if (parts[0] === 'about') {
      html = renderAbout();
      active = 'about';
    } else {
      html = '<p class="page-note">页面不存在。</p>';
    }

    app.innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('.nav a'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === active);
    });
    addLineNumbers();
    measureScroll();
    updateScroll();
    window.scrollTo(0, 0);
  }

  /* ---------- 星空：固定种子，保证每次布局一致 ----------
     大星用圆润胖星 SVG（symbol #puffy-star），不用任何五角星文字符号；
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
      var s = document.createElement('span');
      s.className = puffy ? 'star is-puffy' : (warm ? 'star is-warm' : 'star');
      var size = puffy ? (11 + rnd() * 10).toFixed(1) + 'px' : (1 + rnd() * 2.1).toFixed(1) + 'px';
      var spin = puffy ? (rnd() * 70 - 35) : (rnd() * 44 - 22);
      var css = 'left:' + (rnd() * 100).toFixed(2) + '%;' +
        'top:' + (rnd() * 100).toFixed(2) + '%;' +
        '--dx:' + (rnd() * 30 - 15).toFixed(1) + 'px;' +
        '--dy:' + (rnd() * 26 - 13).toFixed(1) + 'px;' +
        '--spin:' + spin.toFixed(1) + 'deg;' +
        '--dur:' + (26 + rnd() * 26).toFixed(1) + 's;' +
        '--delay:' + (-(rnd() * 40)).toFixed(1) + 's;';
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
  function applyTheme(t) {
    var root = document.documentElement;
    if (root && root.dataset) {
      if (t === 'night') root.dataset.theme = 'night';
      else delete root.dataset.theme;
    }
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      var night = t === 'night';
      btn.textContent = night ? '☀' : '☾';
      btn.setAttribute('aria-label', night ? '切换为晴空模式' : '切换为星夜模式');
      btn.setAttribute('title', night ? '切换为晴空模式' : '切换为星夜模式');
    }
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

  function initInteractions() {
    if (app.addEventListener) {
      app.addEventListener('click', function (e) {
        var t = e.target;
        if (!t) return;
        if (t.getAttribute && t.getAttribute('data-toc') !== null && t.getAttribute('data-toc') !== undefined) {
          var hs = app.querySelectorAll('.article-body h2');
          var target = hs[Number(t.getAttribute('data-toc'))];
          if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  initSky();
  initTheme();
  initSearch();
  initInteractions();
  route();
})();
