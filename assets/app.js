(function () {
  var SITE = window.SITE || {};
  var POSTS = (window.POSTS || []).slice().sort(function (a, b) {
    return b.date.localeCompare(a.date);
  });
  var app = document.getElementById('app');

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
    if (!posts.length) return '<p class="page-note">这里还没有文章。</p>';
    var head = note ? '<p class="page-note">' + esc(note) + '</p>' : '';
    return head + posts.map(function (p) {
      return '<article class="post-item">' +
        metaHtml(p) +
        '<a class="post-title" href="#/post/' + encodeURIComponent(p.slug) + '">' + esc(p.title) + '</a>' +
        '<p class="post-summary">' + esc(p.summary) + '</p>' +
        tagsHtml(p.tags) +
        '</article>';
    }).join('');
  }

  function renderPost(p) {
    return '<article class="article">' +
      '<h1>' + esc(p.title) + '</h1>' + metaHtml(p) + tagsHtml(p.tags) +
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
      if (pre.querySelector('.line-numbers')) return;
      var lines = block.textContent.replace(/\n$/, '').split('\n');
      var nums = document.createElement('span');
      nums.className = 'line-numbers';
      nums.setAttribute('aria-hidden', 'true');
      nums.textContent = lines.map(function (_, i) { return i + 1; }).join('\n');
      pre.insertBefore(nums, block);
    });
  }

  function decode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function route() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('/').filter(Boolean).map(decode);
    var html, active = 'home';

    if (!parts.length) {
      html = renderList(POSTS);
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
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  route();
})();
