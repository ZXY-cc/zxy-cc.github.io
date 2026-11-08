/* 星梦Staream · 零依赖 Markdown + LaTeX 渲染引擎
 * 浏览器里挂 window.ZBMD；Node 构建脚本用 module.exports / vm 取同一个对象。
 * 设计取舍：不引外部库、不发网络请求、不执行用户写的 HTML。
 * 所有原文先转义，块级结构与行内结构各自用占位符保护代码与公式，
 * 因此 C 代码里的 $$、Markdown 里的 <tag> 都不会被误解析或注入。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ZBMD = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var PH = '\u0001ZB';
  var store = {};
  var seq = 0;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function reset() { store = {}; seq = 0; }
  function stash(html) { var k = PH + (++seq) + '\u0001'; store[k] = html; return k; }
  function restore(s) {
    return String(s).replace(/\u0001ZB\d+\u0001/g, function (k) { return store[k] || ''; });
  }
  function isStash(s) { return /^\u0001ZB\d+\u0001$/.test(String(s).trim()); }
  function safeUrl(u) {
    var s = String(u || '').trim();
    if (/^(https?:\/\/|mailto:|#|\/|\.\/|\.\.\/)/i.test(s)) return esc(s);
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(s)) return s;
    if (/^assets\//i.test(s)) return esc(s);
    return '#';
  }

  /* ---------------- LaTeX ---------------- */
  var SYM = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
    zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
    lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ',
    varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'φ',
    varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
    Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', ast: '∗', star: '⋆',
    circ: '∘', bullet: '∙', le: '≤', leq: '≤', ge: '≥', geq: '≥',
    ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃',
    cong: '≅', propto: '∝', infty: '∞', partial: '∂', nabla: '∇',
    forall: '∀', exists: '∃', in: '∈', notin: '∉', ni: '∋',
    subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
    cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅',
    land: '∧', wedge: '∧', lor: '∨', vee: '∨', neg: '¬', lnot: '¬',
    oplus: '⊕', otimes: '⊗', perp: '⊥', angle: '∠', triangle: '△',
    to: '→', rightarrow: '→', longrightarrow: '⟶', leftarrow: '←',
    Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', mapsto: '↦',
    implies: '⇒', iff: '⇔', ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',
    hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ',
    lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', langle: '⟨', rangle: '⟩',
    prime: '′', degree: '°', surd: '√', checkmark: '✓'
  };
  var BIG = {
    sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭',
    oint: '∮', bigcup: '⋃', bigcap: '⋂', bigvee: '⋁', bigwedge: '⋀',
    bigoplus: '⊕', bigotimes: '⊗', bigodot: '⊙', lim: 'lim', limsup: 'lim sup', liminf: 'lim inf'
  };
  var FUNC = {
    sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
    arcsin: 'arcsin', arccos: 'arccos', arctan: 'arctan', sinh: 'sinh', cosh: 'cosh',
    tanh: 'tanh', log: 'log', ln: 'ln', lg: 'lg', exp: 'exp', max: 'max', min: 'min',
    arg: 'arg', det: 'det', dim: 'dim', gcd: 'gcd', mod: 'mod', Pr: 'Pr'
  };
  var BB = {
    R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', E: '𝔼', F: '𝔽', H: 'ℍ'
  };
  function charHtml(c) {
    if (/[A-Za-z]/.test(c)) return '<i class="zb-var">' + c + '</i>';
    if (/[0-9]/.test(c)) return '<span class="zb-digit">' + c + '</span>';
    if (c === '+' || c === '-' || c === '=' || c === '<' || c === '>') {
      return '<span class="zb-op">' + esc(c) + '</span>';
    }
    return '<span class="zb-textchar">' + esc(c) + '</span>';
  }
  function plainText(s) {
    return esc(String(s)).replace(/[A-Za-z0-9]/g, function (c) { return c; });
  }
  function textHtml(s, cls) {
    return '<span class="' + (cls || 'zb-text') + '">' + plainText(s) + '</span>';
  }
  function fracHtml(a, b) {
    return '<span class="zb-frac"><span class="zb-num">' + a + '</span>' +
      '<span class="zb-den">' + b + '</span></span>';
  }
  function sqrtHtml(n, x) {
    return '<span class="zb-sqrt">' + (n ? '<span class="zb-root-deg">' + n + '</span>' : '') +
      '<span class="zb-radical">√</span><span class="zb-radicand">' + x + '</span></span>';
  }
  function accentHtml(kind, x) {
    var mark = { hat: '^', bar: '‾', vec: '→', tilde: '~', dot: '˙', ddot: '¨',
      overline: '‾', underline: '_', widehat: '^' }[kind] || '^';
    return '<span class="zb-accent zb-accent-' + kind + '"><span class="zb-accent-mark">' +
      mark + '</span><span class="zb-accent-base">' + x + '</span></span>';
  }
  function bigHtml(op, sub, sup) {
    return '<span class="zb-bigop"><span class="zb-over">' + sup + '</span>' +
      '<span class="zb-op">' + op + '</span><span class="zb-under">' + sub + '</span></span>';
  }
  function envHtml(name, body) {
    var rows = String(body).split(/\\\\/).map(function (r) { return r.trim(); }).filter(function (r) { return r !== ''; });
    var isAligned = /^(aligned|align|split|gathered|gather)$/.test(name);
    var parseRow = function (r) { return r.split('&').map(function (c) { return texToHtml(c.trim()); }); };
    if (isAligned) {
      return '<span class="zb-aligned">' + rows.map(function (r) {
        return '<span class="zb-line">' + parseRow(r).map(function (c) {
          return '<span class="zb-cell">' + c + '</span>';
        }).join('') + '</span>';
      }).join('') + '</span>';
    }
    var cells = rows.map(parseRow);
    return '<span class="zb-matrix zb-matrix-' + esc(name) + '"><span class="zb-mtable">' +
      cells.map(function (r) {
        return '<span class="zb-mrow">' + r.map(function (c) {
          return '<span class="zb-mcell">' + c + '</span>';
        }).join('') + '</span>';
      }).join('') + '</span></span>';
  }

  function texToHtml(src) {
    var s = String(src == null ? '' : src);
    var i = 0;
    function skip() { while (i < s.length && /\s/.test(s[i])) i++; }
    function readArg() {
      skip();
      if (i >= s.length) return '';
      if (s[i] === '{') { i++; return parseSeq('}'); }
      var a = parseAtom();
      return a ? a.html : '';
    }
    function readBracket() {
      skip();
      if (i >= s.length || s[i] !== '[') return '';
      i++;
      var buf = '';
      while (i < s.length && s[i] !== ']') { buf += s[i]; i++; }
      if (i < s.length) i++;
      return texToHtml(buf);
    }
    function command() {
      i++; // backslash
      if (i >= s.length) return { html: '\\' };
      var c = s[i];
      if (!/[A-Za-z]/.test(c)) {
        i++;
        if (c === '\\') return { html: '<span class="zb-break"></span>' };
        if (c === '{' || c === '}') return { html: textHtml(c) };
        if (c === ',' || c === ';' || c === '!' || c === ' ' || c === ':') {
          return { html: '<span class="zb-thinspace"></span>' };
        }
        if (c === '|') return { html: '<span class="zb-delim">‖</span>' };
        if (c === '%') { while (i < s.length && s[i] !== '\n') i++; return { html: '' }; }
        return { html: textHtml(c) };
      }
      var name = '';
      while (i < s.length && /[A-Za-z]/.test(s[i])) { name += s[i]; i++; }
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
        var a = readArg(), b = readArg();
        return { html: fracHtml(a, b) };
      }
      if (name === 'binom' || name === 'dbinom') {
        var n = readArg(), k = readArg();
        return { html: '<span class="zb-binom">' + fracHtml(n, k) + '</span>' };
      }
      if (name === 'sqrt') {
        var deg = readBracket(), rad = readArg();
        return { html: sqrtHtml(deg, rad) };
      }
      if (name === 'text' || name === 'textrm' || name === 'operatorname' ||
          name === 'mathrm' || name === 'mathbf' || name === 'mathsf' || name === 'mathtt' ||
          name === 'mathbb' || name === 'mathcal' || name === 'mathfrak' || name === 'boldsymbol') {
        var raw = '';
        skip();
        if (s[i] === '{') {
          i++;
          var depth = 1;
          while (i < s.length && depth) {
            if (s[i] === '{') depth++;
            else if (s[i] === '}') { depth--; if (!depth) { i++; break; } }
            raw += s[i]; i++;
          }
        }
        var cls = name === 'mathbb' ? 'zb-bb' : (name === 'mathcal' ? 'zb-cal' :
          (name === 'mathbf' || name === 'boldsymbol' ? 'zb-bold' : 'zb-text'));
        var body = name === 'mathbb' ? esc(raw).replace(/[A-Z]/g, function (x) { return BB[x] || x; })
          : plainText(raw);
        return { html: '<span class="' + cls + '">' + body + '</span>' };
      }
      if (/^(hat|bar|vec|tilde|dot|ddot|overline|underline|widehat)$/.test(name)) {
        return { html: accentHtml(name, readArg()) };
      }
      if (name === 'left' || name === 'right' || name === 'big' || name === 'Big' ||
          name === 'bigg' || name === 'Bigg' || name === 'displaystyle' ||
          name === 'textstyle' || name === 'scriptstyle' || name === 'limits' || name === 'nolimits') {
        skip();
        if ((name === 'left' || name === 'right' || /^big/i.test(name)) && i < s.length) {
          var d = s[i]; i++;
          if (d === '\\') {
            var dn = '';
            while (i < s.length && /[A-Za-z]/.test(s[i])) { dn += s[i]; i++; }
            d = SYM[dn] || ({ lbrace: '{', rbrace: '}', lvert: '|', rvert: '|',
              langle: '⟨', rangle: '⟩' }[dn] || dn);
          }
          return { html: '<span class="zb-delim">' + esc(d) + '</span>' };
        }
        return { html: '' };
      }
      if (name === 'begin' || name === 'end') {
        skip();
        var env = '';
        if (s[i] === '{') {
          i++;
          while (i < s.length && s[i] !== '}') { env += s[i]; i++; }
          if (i < s.length) i++;
        }
        if (name === 'begin') {
          var close = '\\end{' + env + '}';
          var at = s.indexOf(close, i);
          var content = at < 0 ? s.slice(i) : s.slice(i, at);
          if (at >= 0) i = at + close.length; else i = s.length;
          return { html: envHtml(env, content) };
        }
        return { html: '' };
      }
      if (name === 'quad') return { html: '<span class="zb-quad"></span>' };
      if (name === 'qquad') return { html: '<span class="zb-qquad"></span>' };
      if (BIG[name]) return { html: BIG[name], big: true };
      if (FUNC[name]) return { html: '<span class="zb-func">' + FUNC[name] + '</span>' };
      if (SYM[name]) return { html: '<span class="zb-sym">' + SYM[name] + '</span>' };
      if (name === 'color' || name === 'hspace') { readArg(); return { html: '' }; }
      return { html: '<span class="zb-unknown">\\' + esc(name) + '</span>' };
    }
    function parseAtom() {
      skip();
      if (i >= s.length) return null;
      var c = s[i];
      if (c === '{') { i++; return { html: '<span class="zb-group">' + parseSeq('}') + '</span>' }; }
      if (c === '\\') return command();
      if (c === '%') { while (i < s.length && s[i] !== '\n') i++; return { html: '' }; }
      if (c === '~') { i++; return { html: '<span class="zb-nbsp">&nbsp;</span>' }; }
      if (c === '&') { i++; return { html: '<span class="zb-alignmark"></span>' }; }
      if (c === '$') { i++; return { html: '' }; }
      i++;
      return { html: charHtml(c) };
    }
    function parseSeq(stop) {
      var out = '';
      while (i < s.length) {
        if (stop && s[i] === stop) { i++; return out; }
        if (s[i] === '}') { i++; return out; }
        var atom = parseAtom();
        if (!atom) break;
        var sup = '', sub = '';
        while (i < s.length && (s[i] === '^' || s[i] === '_')) {
          var kind = s[i]; i++;
          var arg = readArg();
          if (kind === '^') sup += arg; else sub += arg;
        }
        if (atom.big) out += bigHtml(atom.html, sub, sup);
        else if (sup || sub) {
          out += '<span class="zb-script"><span class="zb-base">' + atom.html + '</span>' +
            '<span class="zb-scripts"><span class="zb-sup">' + sup + '</span>' +
            '<span class="zb-sub">' + sub + '</span></span></span>';
        } else out += atom.html;
      }
      return out;
    }
    return parseSeq(null);
  }
  function mathHtml(tex, block) {
    return '<' + (block ? 'div' : 'span') + ' class="zb-math zb-math-' +
      (block ? 'block' : 'inline') + '">' + texToHtml(tex) + '</' +
      (block ? 'div' : 'span') + '>';
  }

  /* ---------------- 行内 Markdown ---------------- */
  function inline(src) {
    var s = String(src == null ? '' : src);
    /* 先用占位符锁住代码、转义美元与公式，避免后续规则互相吃掉 */
    s = s.replace(/\\\$/g, function () { return stash('$'); });
    s = s.replace(/`([^`\n]+)`/g, function (_m, c) { return stash('<code>' + esc(c) + '</code>'); });
    s = s.replace(/(^|[^$])\$(?!\$)([^$\n]+?)\$(?!\$)/g, function (_m, pre, tex) {
      return pre + stash(mathHtml(tex, false));
    });
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      function (_m, alt, u, title) {
        return stash('<img src="' + safeUrl(u) + '" alt="' + alt + '"' +
          (title ? ' title="' + title + '"' : '') + ' loading="lazy">');
      });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      function (_m, txt, u, title) {
        var href = safeUrl(u);
        var ext = /^https?:\/\//.test(String(u).trim());
        return stash('<a href="' + href + '"' + (title ? ' title="' + title + '"' : '') +
          (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + txt + '</a>');
      });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
    return restore(s);
  }

  /* ---------------- 代码块 ---------------- */
  function codeHtml(lang, code) {
    var lines = String(code).replace(/\n$/, '').split('\n');
    var nums = lines.map(function (_, n) { return n + 1; }).join('\n');
    var tag = lang ? '<span class="zb-lang">' + esc(lang) + '</span>' : '';
    return '<pre class="zb-code"' + (lang ? ' data-lang="' + esc(lang) + '"' : '') + '>' +
      tag + '<span class="line-numbers" aria-hidden="true">' + nums + '</span>' +
      '<code>' + esc(lines.join('\n')) + '</code>' +
      '<button class="copy-btn" type="button">复制</button></pre>';
  }

  /* ---------------- 块级 Markdown ---------------- */
  function cellsOf(line) {
    var t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return t.split('|').map(function (c) { return c.trim(); });
  }
  function tableAlign(cells) {
    return cells.map(function (c) {
      if (/^:-+:$/.test(c)) return 'center';
      if (/^-+:$/.test(c)) return 'right';
      return 'left';
    });
  }
  function fenceInfo(line) {
    var m = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*([^\n]*)$/);
    return m ? { ch: m[1][0], n: m[1].length, lang: (m[2] || '').trim().split(/\s+/)[0] } : null;
  }
  function fenceClose(line, ch, n) {
    var m = line.trim().match(/^(`{3,}|~{3,})/);
    return !!(m && m[1][0] === ch && m[1].length >= n);
  }

  function render(src) {
    reset();
    var text = String(src == null ? '' : src).replace(/\r\n?/g, '\n').replace(/\t/g, '  ');
    var lines = text.split('\n');
    var out = [], para = [], i = 0;
    function flush() {
      if (!para.length) return;
      out.push('<p>' + para.map(inline).join('<br>') + '</p>');
      para = [];
    }
    while (i < lines.length) {
      var ln = lines[i];
      var trim = ln.trim();

      if (isStash(trim)) { flush(); out.push(restore(trim)); i++; continue; }

      /* 围栏代码块 */
      var f = fenceInfo(ln);
      if (f) {
        var buf = [];
        i++;
        while (i < lines.length && !fenceClose(lines[i], f.ch, f.n)) { buf.push(lines[i]); i++; }
        if (i < lines.length) i++;
        flush();
        out.push(codeHtml(f.lang, buf.join('\n')));
        continue;
      }

      /* 块级公式 $$ ... $$（单行或多行） */
      if (/^\s*\$\$/.test(ln)) {
        var one = ln.match(/^\s*\$\$(.+)\$\$\s*$/);
        var tex;
        if (one) { tex = one[1]; i++; }
        else {
          var parts = [ln.replace(/^\s*\$\$/, '')];
          i++;
          while (i < lines.length && lines[i].indexOf('$$') < 0) { parts.push(lines[i]); i++; }
          if (i < lines.length) {
            parts.push(lines[i].replace(/\$\$[\s\S]*$/, ''));
            i++;
          }
          tex = parts.join('\n');
        }
        flush();
        out.push(mathHtml(tex, true));
        continue;
      }

      if (!trim) { flush(); i++; continue; }

      /* 分隔线 */
      if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(ln)) { flush(); out.push('<hr>'); i++; continue; }

      /* 标题 */
      var hd = ln.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (hd) {
        flush();
        var lev = Math.min(6, hd[1].length);
        var txt = inline(hd[2]);
        var slug = 'h-' + String(hd[2]).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 40);
        out.push('<h' + lev + ' id="' + esc(slug) + '">' + txt + '</h' + lev + '>');
        i++; continue;
      }

      /* 表格 */
      if (trim.indexOf('|') >= 0 && i + 1 < lines.length &&
          /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+/.test(lines[i + 1])) {
        var head = cellsOf(ln);
        var align = tableAlign(cellsOf(lines[i + 1]));
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].trim().indexOf('|') >= 0 && lines[i].trim()) {
          rows.push(cellsOf(lines[i])); i++;
        }
        flush();
        var t = '<table><thead><tr>' + head.map(function (c, k) {
          return '<th style="text-align:' + (align[k] || 'left') + '">' + inline(c) + '</th>';
        }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
          return '<tr>' + head.map(function (_c, k) {
            return '<td style="text-align:' + (align[k] || 'left') + '">' + inline(r[k] || '') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
        out.push(t);
        continue;
      }

      /* 引用 */
      if (/^ {0,3}>/.test(ln)) {
        flush();
        var q = [];
        while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
          q.push(lines[i].replace(/^ {0,3}>\s?/, '')); i++;
        }
        out.push('<blockquote>' + render(q.join('\n')) + '</blockquote>');
        continue;
      }

      /* 列表：无序 / 有序 / 任务 */
      var li = ln.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
      if (li) {
        flush();
        var ordered = /\d/.test(li[2]);
        var items = [];
        while (i < lines.length) {
          var m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
          if (!m || (/\d/.test(m[2])) !== ordered) break;
          var task = m[3].match(/^\[([ xX])\]\s*(.*)$/);
          items.push((task ? '<span class="zb-task' + (task[1] === ' ' ? '' : ' done') +
            '">' + (task[1] === ' ' ? '☐' : '☑') + '</span>' : '') + inline(task ? task[2] : m[3]));
          i++;
        }
        out.push('<' + (ordered ? 'ol' : 'ul') + '>' + items.map(function (x) {
          return '<li>' + x + '</li>';
        }).join('') + '</' + (ordered ? 'ol' : 'ul') + '>');
        continue;
      }

      para.push(trim);
      i++;
    }
    flush();
    return restore(out.join('\n'));
  }

  function plain(src) {
    return String(src == null ? '' : src)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\$\$[\s\S]*?\$\$/g, ' ')
      .replace(/[#>*_~`|$\[\]()!-]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  return { render: render, inline: inline, tex: texToHtml, plain: plain, version: '1.0.0' };
});
