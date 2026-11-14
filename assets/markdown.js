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
    /* 表格单元格与正文里也常写 $$…$$（飞书导出的 Markdown 全是双美元）。
       独占一行的 $$ 块级公式由 render() 提前消费，这里只处理同一行内的成对双美元，
       同样交给公式引擎排版，字体才会是 Computer Modern 而不是正文默认字体。 */
    s = s.replace(/\$\$([^$\n]+?)\$\$/g, function (_m, tex) {
      return stash(mathHtml(tex, false));
    });
    s = s.replace(/(^|[^$])\$(?!\$)([^$\n]+?)\$(?!\$)/g, function (_m, pre, tex) {
      return pre + stash(mathHtml(tex, false));
    });
    s = esc(s);
    /* 图片：URL 后可用 ` =宽x高` 显式控制尺寸（如 =420x 或 =x300，均可省略一侧，
       只给一侧时另一维自适应）。动图太大盖过正文时，作者可直接缩到合适宽度。 */
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?(?:\s+=\s*(\d*)\s*x\s*(\d*)\s*)?\)/g,
      function (_m, alt, u, title, w, h) {
        var dim = '';
        if (w && +w > 0) dim += 'width:' + Math.floor(+w) + 'px;';
        if (h && +h > 0) dim += 'height:' + Math.floor(+h) + 'px;';
        if (w && h && +w > 0 && +h > 0) dim += 'object-fit:contain;';
        return stash('<img src="' + safeUrl(u) + '" alt="' + alt + '"' +
          (title ? ' title="' + title + '"' : '') +
          (dim ? ' style="' + dim + '"' : '') + ' loading="lazy">');
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

  /* ---------------- 语法高亮 ----------------
     轻量零依赖分词：注释 / 字符串 / 数字 / 控制关键字 / 类型与修饰字 / 字面常量 /
     函数名 / 类名 / 属性。颜色集中在 style.css 的 --syn-*（参考 Woodfish-Theme，
     即 Woodfish Dark / Bearded Theme Arc）；低画质由 CSS 统一回退为正文色，无需重渲染。 */
  var SYN_FAM_RE = {
    js: /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_$][\w$]*)|(#\w+)/g,
    py: /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_][\w]*)/g,
    css: /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|vh|vw|vmin|vmax|ms|s|deg|fr|%)?|#[0-9a-fA-F]{3,8})|([@a-zA-Z_][-\w]*)/g,
    html: /(<!--[\s\S]*?-->)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(<\/?[a-zA-Z][\w-]*|\/>|>)|([a-zA-Z_][\w-]*)/g
  };
  SYN_FAM_RE.c = SYN_FAM_RE.js;   /* C 系与 JSON 和 JS 共用同一套分词正则，词表不同 */
  var SYN_KW = {
    js: ' if else for while do return switch case break continue try catch finally throw import export from as default await yield of in is instanceof new delete async ',
    py: ' if elif else for while return switch case match import from as with try except finally raise lambda pass yield await assert in is not and or global nonlocal del ',
    c: ' if else for while do return switch case break continue goto using namespace template ',
    css: ' important and or not from to ',
    html: ' ', json: ' '
  };
  var SYN_TY = {
    js: ' var let const function class extends static get set ',
    py: ' def class ',
    c: ' int char float double long short void unsigned signed struct class enum union const static extern public private protected virtual inline explicit bool boolean string byte var dynamic new delete this abstract interface override final ',
    css: ' ', html: ' ', json: ' '
  };
  var SYN_CS = ' true false null undefined None True False NULL nullptr nil this self super NaN Infinity ';
  function highlightCode(code, lang) {
    /* 静态旧文章的 data-lang 存的是显示名（C++ / C# / Python），统一还原成语言标识，
       多语言标签组里每个代码块才会拿到与首次渲染完全相同的分词词表与上色结果 */
    var l = langIdOf(lang);
    var fam = /^(py|python|sh|bash|shell|zsh|yaml|yml|ruby|rb|toml)$/.test(l) ? 'py'
      : /^(css|scss|less)$/.test(l) ? 'css'
      : /^(html|xml|svg|vue)$/.test(l) ? 'html'
      : /^(c|cpp|c\+\+|h|hpp|java|cs|csharp|go|rust|rs|swift|kt|kotlin|php|dart|scala)$/.test(l) ? 'c'
      : 'js'; /* js / ts / json / 未标注语言通用 */
    var re = SYN_FAM_RE[fam];
    var kw = ' ' + (SYN_KW[fam] || '') + ' ', ty = ' ' + (SYN_TY[fam] || '') + ' ', cs = SYN_CS;
    var out = '', last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(code))) {
      if (m.index > last) out += esc(code.slice(last, m.index));
      var cls = null;
      if (m[1]) cls = 'tk-cm';
      else if (m[2]) cls = (fam === 'json' && /^\s*:/.test(code.slice(re.lastIndex))) ? 'tk-pr' : 'tk-st';
      else if (m[3]) cls = (fam === 'html') ? 'tk-fn' : 'tk-nu';
      else if (m[4]) {
        var w = m[4];
        if (kw.indexOf(' ' + w + ' ') >= 0) cls = 'tk-kw';
        else if (ty.indexOf(' ' + w + ' ') >= 0) cls = 'tk-ty';
        else if (cs.indexOf(' ' + w + ' ') >= 0) cls = 'tk-cs';
        else if (/^\s*\(/.test(code.slice(re.lastIndex))) cls = 'tk-fn';
        else if (fam === 'css' && /^\s*:/.test(code.slice(re.lastIndex))) cls = 'tk-pr';
        else if (code.charAt(m.index - 1) === '.') cls = 'tk-pr';
        else if (/^[A-Z]/.test(w)) cls = 'tk-cls';
      } else if (m[5]) cls = 'tk-kw';
      if (cls) out += '<span class="' + cls + '">' + esc(m[0]) + '</span>';
      else out += esc(m[0]);
      last = re.lastIndex;
    }
    if (last < code.length) out += esc(code.slice(last));
    return out;
  }

  /* ---------------- 代码块 ---------------- */
  /* 围栏标识符 → 语言名称（不是文件类型），首字母大写：cpp → C++、py → Python。
     映射表没收录的标识符按「首字母大写」兜底显示。 */
  var LANG_NAMES = {
    c: 'C', h: 'C', cpp: 'C++', 'c++': 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++',
    cs: 'C#', csharp: 'C#', java: 'Java', go: 'Go', golang: 'Go',
    rs: 'Rust', rust: 'Rust', swift: 'Swift', kt: 'Kotlin', kotlin: 'Kotlin',
    php: 'PHP', dart: 'Dart', scala: 'Scala', lua: 'Lua', rb: 'Ruby', ruby: 'Ruby',
    py: 'Python', python: 'Python', js: 'JavaScript', javascript: 'JavaScript',
    ts: 'TypeScript', typescript: 'TypeScript', json: 'JSON',
    html: 'HTML', xml: 'XML', svg: 'SVG', vue: 'Vue',
    css: 'CSS', scss: 'SCSS', less: 'Less',
    sh: 'Shell', bash: 'Bash', shell: 'Shell', zsh: 'Zsh',
    yaml: 'YAML', yml: 'YAML', toml: 'TOML', sql: 'SQL',
    md: 'Markdown', markdown: 'Markdown', r: 'R', matlab: 'MATLAB', vb: 'VB'
  };
  /* 显示名 → 语言标识：C++ → cpp、C# → cs、Python → python。
     旧文章的 data-lang 是显示名，重刷上色时靠这张表还原成同一套词表。 */
  var LANG_ID_BY_LABEL = (function () {
    var map = {};
    Object.keys(LANG_NAMES).forEach(function (k) {
      var n = LANG_NAMES[k].toLowerCase();
      if (!map[n]) map[n] = k;
    });
    return map;
  })();
  function langIdOf(lang) {
    var l = String(lang || '').trim().toLowerCase();
    return LANG_ID_BY_LABEL[l] || l;
  }
  function langLabel(id) {
    var k = String(id || '').trim().toLowerCase();
    if (!k) return '';
    return LANG_NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1));
  }
  function codeHtml(lang, code, hl, noTag, ln) {
    var text = String(code).replace(/\n$/, '');
    var lines = text.split('\n');
    var tag = (lang && !noTag) ? '<span class="zb-lang">' + esc(langLabel(lang)) + '</span>' : '';
    var body;
    /* l=a-b 指定行高亮：此时逐行分词包裹，跨行字符串与块注释的
       上色会有损失（内容仍逐字保留），用来换取任意行精确高亮。 */
    if (hl && hl[0] >= 1 && hl[0] <= hl[1]) {
      body = lines.map(function (ln2, n) {
        var cls = (n + 1 >= hl[0] && n + 1 <= hl[1]) ? ' zb-cline-hl' : '';
        return '<span class="zb-cline' + cls + '">' + (highlightCode(ln2, lang) || '&nbsp;') + '</span>';
      }).join('');
    } else {
      body = highlightCode(text, lang);
    }
    /* lnum 关键字：显式声明才显示行号列；只写 l=a-b 时仅高亮不显示行号 */
    var gutter = ln ? '<span class="line-numbers" aria-hidden="true">' +
      lines.map(function (_, n) { return n + 1; }).join('\n') + '</span>' : '';
    var langAttrs = lang ? ' data-lang="' + esc(langLabel(lang)) +
      '" data-code-lang="' + esc(String(lang).toLowerCase()) + '"' : '';
    return '<pre class="zb-code"' + langAttrs + '>' +
      tag + gutter +
      '<code>' + body + '</code>' +
      '<button class="copy-btn" type="button">复制</button></pre>';
  }

  /* 多语言代码标签组：块组上方一排语言标签（C / C++ / Python…），点击切换对应代码。
     第一块默认可见，其余 hidden；切换由 bindCodeTabs 的文档级委托完成，
     构建沙箱里没有 DOM，会自动跳过绑定。 */
  function codeTabsHtml(blocks) {
    var bar = blocks.map(function (b, i) {
      return '<button class="zb-tab' + (i ? '' : ' on') + '" type="button" data-zbtab="' + i + '">' +
        esc(langLabel(b.lang)) + '</button>';
    }).join('');
    var pres = blocks.map(function (b, i) {
      return codeHtml(b.lang, b.code, b.hl, true, b.ln).replace('<pre class="zb-code"',
        '<pre class="zb-code" data-zbpre="' + i + '"' + (i ? ' hidden' : ''));
    }).join('');
    return '<div class="zb-code-tabs"><div class="zb-tab-bar">' + bar + '</div>' + pres + '</div>';
  }
  function bindCodeTabs() {
    if (typeof document === 'undefined' || !document.addEventListener ||
        document.__zbTabsBound) return;
    document.__zbTabsBound = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var tab = t.closest('.zb-tab');
      if (!tab) return;
      var bar = tab.parentNode, box = bar && bar.parentNode;
      if (!box) return;
      var k = tab.getAttribute('data-zbtab');
      Array.prototype.forEach.call(box.children, function (el) {
        if (!el || el.tagName !== 'PRE') return;
        if (el.getAttribute('data-zbpre') === k) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
      });
      Array.prototype.forEach.call(bar.children, function (el) {
        if (el.classList) el.classList.toggle('on', el === tab);
      });
    });
  }

  /* ---------------- 块级 Markdown ---------------- */
  function cellsOf(line) {
    var t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    /* 公式里的 |（\left|、|x| 之类）不是表格分隔符：先把公式 / 行内代码
       整段里的竖线换成私有占位符，切完单元格再还原，避免把 $$|x|$$ 拆成两格 */
    t = t.replace(/\$\$[^$\n]+\$\$|\$[^$\n]+\$|`[^`\n]*`/g, function (m) {
      return m.replace(/\|/g, '\u0002');
    });
    return t.split('|').map(function (c) { return c.trim().replace(/\u0002/g, '|'); });
  }
  function tableAlign(cells) {
    return cells.map(function (c) {
      if (/^:-+:$/.test(c)) return 'center';
      if (/^-+:$/.test(c)) return 'right';
      return 'left';
    });
  }
  /* 嵌套列表：缩进两空格算一层（Tab 按 4 空格），同层类型以首项为准，
     同层换标记类型（如 - 后接 1.）按 GFM 拆成两个列表；
     cur 是共享游标 {i}，每次调用消费一段，主循环调到消费完为止 */
  function listTree(items, cur, level) {
    var ordered = /\d/.test(items[cur.i].marker);
    var tag = ordered ? 'ol' : 'ul';
    var html = '';
    while (cur.i < items.length) {
      var it = items[cur.i];
      if (it.indent < level) break;
      if (it.indent === level && (/\d/.test(it.marker)) !== ordered) break;
      var task = it.text.match(/^\[([ xX])\]\s*(.*)$/);
      var inner = (task ? '<span class="zb-task' + (task[1] === ' ' ? '' : ' done') +
        '">' + (task[1] === ' ' ? '☐' : '☑') + '</span>' : '') +
        inline(task ? task[2] : it.text);
      cur.i++;
      if (cur.i < items.length && items[cur.i].indent > level) {
        inner += listTree(items, cur, items[cur.i].indent);
      }
      html += '<li>' + inner + '</li>';
    }
    return '<' + tag + '>' + html + '</' + tag + '>';
  }
  /* 开栏参数：语言名 + lnum（显示行号列）+ l=a-b（高亮第 a 到 b 行）。
     lnum 与 l=a-b 彼此独立，只写 l=a-b 也能高亮，只是不显示行号列；
     line-numbers / lines=a-b 是旧写法，保留兼容。 */
  function parseFenceMeta(meta) {
    var m = String(meta || '').trim();
    var hm = m.match(/\bl=(\d+)-(\d+)\b/) || m.match(/\blines=(\d+)-(\d+)\b/);
    return {
      lang: m.split(/\s+/)[0] || '',
      hl: hm ? [Number(hm[1]), Number(hm[2])] : null,
      ln: /\blnum\b|\bline-numbers\b/.test(m)
    };
  }
  function fenceInfo(line) {
    var m = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*([^\n]*)$/);
    if (!m) return null;
    var meta = (m[2] || '').trim();
    var info = parseFenceMeta(meta);
    /* 声明式多语言组：cpp lnum l=1-2|python l=3-4|java lnum l=5-6，
       竖线两边各自是一段完整的开栏参数，逐段独立控制行号与高亮 */
    var pipes = meta.indexOf('|') >= 0
      ? meta.split('|').map(parseFenceMeta) : null;
    return { ch: m[1][0], n: m[1].length, meta: meta,
      lang: info.lang, hl: info.hl, ln: info.ln,
      pipes: pipes && pipes.length > 1 ? pipes : null };
  }
  function fenceClose(line, ch, n) {
    var m = line.trim().match(/^(`{3,}|~{3,})/);
    return !!(m && m[1][0] === ch && m[1].length >= n);
  }

  /* ---------------- 洛谷扩展：表格（含 ^ 向上合并 / < 向左合并） ----------------
     合并标记必须是单元格内的唯一纯文本；^ 并入上方最近的宿主格（rowspan+1），
     < 并入左侧最近的宿主格（colspan+1），两种标记可在同一张表内混用。 */
  function renderTable(headLine, alignLine, lines, startIdx, tuack) {
    var head = cellsOf(headLine);
    var align = tableAlign(cellsOf(alignLine));
    var rows = [];
    var k = startIdx;
    /* 标题行不算表格数据行：紧跟表格的 ## 标题不能被吞成单元格 */
    while (k < lines.length && lines[k].trim().indexOf('|') >= 0 && lines[k].trim() &&
           !/^ {0,3}#{1,6}\|?\s/.test(lines[k])) {
      rows.push(cellsOf(lines[k])); k++;
    }
    var grid = rows.map(function (r) {
      return head.map(function (_c, ci) { return r[ci] == null ? '' : String(r[ci]).trim(); });
    });
    /* span[r][c]：null 正常格；{rowspan,colspan} 宿主格；'skip' 被并入的格 */
    var span = grid.map(function (r) { return r.map(function () { return null; }); });
    for (var ri = 0; ri < grid.length; ri++) {          /* 先按列吃掉 ^ */
      for (var ci = 0; ci < grid[ri].length; ci++) {
        if (grid[ri][ci] !== '^') continue;
        var r2 = ri - 1;
        while (r2 >= 0 && (span[r2][ci] === 'skip' || grid[r2][ci] === '^')) r2--;
        if (r2 < 0 || !span[r2] || span[r2][ci] === 'skip' || grid[r2][ci] === '^') {
          grid[ri][ci] = '↑'; /* 无宿主可并：显示成箭头提示，不吞内容 */
          continue;
        }
        var host = span[r2][ci] || (span[r2][ci] = { rowspan: 1, colspan: 1 });
        host.rowspan++;
        span[ri][ci] = 'skip';
      }
    }
    for (var ri2 = 0; ri2 < grid.length; ri2++) {       /* 再按行吃掉 < */
      var leftHost = null;
      for (var ci2 = 0; ci2 < grid[ri2].length; ci2++) {
        if (span[ri2][ci2] === 'skip') continue;
        if (grid[ri2][ci2] === '<') {
          if (leftHost) { leftHost.colspan++; span[ri2][ci2] = 'skip'; }
          else grid[ri2][ci2] = '←';
          continue;
        }
        /* 宿主对象必须写回 span 网格，后面的 < 才能把 colspan 累加到正确格子 */
        var h = span[ri2][ci2];
        if (!h) { h = { rowspan: 1, colspan: 1 }; span[ri2][ci2] = h; }
        leftHost = h;
      }
    }
    var th = '<thead><tr>' + head.map(function (c, ci3) {
      return '<th style="text-align:' + (align[ci3] || 'left') + '">' + inline(c) + '</th>';
    }).join('') + '</tr></thead><tbody>';
    var tb = grid.map(function (r, ri3) {
      return '<tr>' + r.map(function (c, ci4) {
        if (span[ri3][ci4] === 'skip') return '';
        var h = span[ri3][ci4];
        var attrs = h ? (h.rowspan > 1 ? ' rowspan="' + h.rowspan + '"' : '') +
          (h.colspan > 1 ? ' colspan="' + h.colspan + '"' : '') : '';
        return '<td' + attrs + ' style="text-align:' + (align[ci4] || 'left') + '">' +
          inline(c) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return { html: '<table' + (tuack ? ' class="zb-tuack"' : '') + '>' + th + tb +
      '</tbody></table>', next: k };
  }

  /* ---------------- 洛谷扩展：容器指令（折叠框 / 对齐 / 引言 / 渐变竖线） ----------------
     语法 :::名字[标题]{open}，闭合行是同等数量的冒号；嵌套时外层多用冒号。 */
  function directiveInfo(line) {
    var m = line.match(/^ {0,3}(:{3,})([a-z][a-z-]*|\|)(?:\[([^\]]*)\])?(?:\{([^}]*)\})?[ \t]*$/);
    return m ? { colons: m[1].length, name: m[2], arg: m[3] || '', opt: m[4] || '' } : null;
  }
  /* 四色折叠框：succ / warn / err 是洛谷短名，success / warning / error 为兼容旧文保留 */
  var FOLD_TITLES = { info: '信息', success: '成功', succ: '成功',
                      warning: '注意', warn: '注意', error: '错误', err: '错误' };
  var FOLD_CLASS = { succ: 'success', warn: 'warning', err: 'error' };
  function containerHtml(dir, inner) {
    if (dir.name === 'vl' || dir.name === '|') return '<div class="zb-vl">' + inner + '</div>';
    if (dir.name === 'align') {
      var how = (dir.opt === 'r' || /right/i.test(dir.opt)) ? 'right' : 'center';
      return '<div class="zb-align zb-align-' + how + '">' + inner + '</div>';
    }
    if (dir.name === 'epigraph' || dir.name === 'epig') {
      return '<blockquote class="zb-epigraph">' + inner +
        (dir.arg ? '<footer class="zb-epigraph-sign">' + inline(dir.arg) + '</footer>' : '') +
        '</blockquote>';
    }
    if (FOLD_TITLES[dir.name]) {
      var fname = FOLD_CLASS[dir.name] || dir.name;
      var open = /open/i.test(dir.opt) ? ' open' : '';
      return '<details class="zb-fold zb-fold-' + fname + '"' + open +
        '><summary class="zb-fold-head">' +
        (dir.arg ? inline(dir.arg) : FOLD_TITLES[dir.name]) +
        '</summary><div class="zb-fold-body">' + inner + '</div></details>';
    }
    return '<div class="zb-box">' + inner + '</div>';
  }

  /* :::cont::: 目录：按整篇文章的标题（含 :::| / ##| 渐变竖线标题）生成带链接的目录。
     扫描时跳过围栏代码块；slug 生成规则与标题渲染完全一致，锚点一一对应。
     lvls 为允许的标题层级（数字 x 直接对应 x 个 # 的标题级，1~6）：null 表示全部（h1~h6）；
     :::cont{2}::: 只收二级（##），:::cont{2,4}::: 只收二、四级，可填任意多个 1~6 的数字。 */
  function contLevels(opt) {
    if (!opt) return null;
    var lv = [];
    String(opt).split(/[,,，\s]+/).forEach(function (s) {
      var n = parseInt(s, 10);
      if (n >= 1 && n <= 6 && lv.indexOf(n) < 0) lv.push(n);
    });
    return lv.length ? lv : null;
  }
  function scanToc(lines, lvls) {
    var items = [], fence = null;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var fm = ln.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fm) {
        if (fence && fm[1][0] === fence.ch && fm[1].length >= fence.n) fence = null;
        else if (!fence) fence = { ch: fm[1][0], n: fm[1].length };
        continue;
      }
      if (fence) continue;
      var hd = ln.match(/^ {0,3}(#{1,6})(\|?)\s+(.+?)\s*#*\s*$/);
      if (hd && hd[2] && hd[3].indexOf('|') >= 0) hd = null;
      if (hd) {
        var lev = hd[1].length;
        if (lev >= 1 && lev <= 6 && (!lvls || lvls.indexOf(lev) >= 0)) {
          var slug = 'h-' + String(hd[3]).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 40);
          items.push({ lev: lev, text: hd[3], slug: slug });
        }
      }
    }
    return items;
  }
  /* :::cont::: 输出与前台自动「本页目录」同一张玻璃卡片：标题、星标、
     流式换行排列、蓝色条目全部复用 .toc 样式；条目是锚点链接，静态阅读版
     也能直接跳转，SPA 里由点击委托拦截成平滑滚动，避免改动 hash 路由。 */
  function tocHtml(items) {
    if (!items.length) return '';
    var html = items.map(function (it) {
      return '<a class="toc-item" href="#' + esc(it.slug) + '">' + esc(it.text) + '</a>';
    }).join('');
    return '<nav class="toc" aria-label="本页目录"><div class="toc-title">本 页 目 录</div>' +
      '<div class="toc-list">' + html + '</div></nav>';
  }

  /* opts.truck：:::truck 块内的所有表格套用 truck 三线表样式（可递归进容器与引用） */
  function render(src, opts) {
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

      /* 洛谷 Tuack 表格：::cute-table{tuack}（或 :::cute-table{tuack}）修饰紧随其后的那张表格。
         必须在容器解析之前判断，否则三个冒号的写法会被当成 :::cute-table 容器。 */
      if (/^ {0,3}:{2,3}cute-table\{tuack\}[ \t]*$/.test(trim)) {
        flush();
        var tj = i + 1;
        while (tj < lines.length && !lines[tj].trim()) tj++;
        if (tj + 1 < lines.length && lines[tj].trim().indexOf('|') >= 0 &&
            /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+/.test(lines[tj + 1])) {
          var tr = renderTable(lines[tj], lines[tj + 1], lines, tj + 2, true);
          out.push(tr.html); i = tr.next;
        } else { i++; }
        continue;
      }

      /* :::cont::: / :::cont{1}::: 单行目录标记：按整篇文章标题生成目录 */
      var contOne = ln.match(/^ {0,3}:::cont(?:\{([^}]*)\})?:::[ \t]*$/);
      if (contOne) {
        flush();
        out.push(tocHtml(scanToc(lines, contLevels(contOne[1]))));
        i++;
        continue;
      }

      /* :::truck … ::: 包裹块：只有块内的表格做成 truck 三线表，块外保持普通表格。
         冒号数量配对决定闭合行，块内可放多张表格、段落与其它容器。 */
      var truckOpen = ln.match(/^ {0,3}(:{3,})truck[ \t]*$/);
      if (truckOpen) {
        flush();
        var truckClose = new RegExp('^ {0,3}\\:{' + truckOpen[1].length + '}[ \\t]*$');
        var tbuf = [];
        i++;
        while (i < lines.length && !truckClose.test(lines[i])) { tbuf.push(lines[i]); i++; }
        if (i < lines.length) i++;
        var tkStore = store, tkSeq = seq;
        var tInner = render(tbuf.join('\n'), { truck: true });
        store = tkStore; seq = tkSeq;
        out.push(tInner);
        continue;
      }

      /* 洛谷扩展容器：:::info[标题]{open} / :::align{c|center} / :::epig[——署名] /
         :::| … :::（渐变竖线）。嵌套 render 前保存占位符表、返回后还原。
         洛谷嵌套规则：最深一层三个冒号，每往外一层多一个；闭合用同等数量的冒号。 */
      var dir = directiveInfo(ln);
      if (dir && dir.name === 'cont') {
        /* 目录容器：不包裹内容，直接按全文标题生成目录（也可写成单行 :::cont:::），
           {1} / {2,3} 可只收指定层级的标题 */
        flush();
        out.push(tocHtml(scanToc(lines, contLevels(dir.opt))));
        if (dir.colons >= 3) {
          var closeCont = new RegExp('^ {0,3}\\:{' + dir.colons + '}[ \\t]*$');
          i++;
          while (i < lines.length && !closeCont.test(lines[i])) i++;
          if (i < lines.length) i++;
        }
        continue;
      }
      if (dir) {
        flush();
        var closeRe = new RegExp('^ {0,3}\\:{' + dir.colons + '}[ \\t]*$');
        var dbuf = [];
        i++;
        while (i < lines.length && !closeRe.test(lines[i])) { dbuf.push(lines[i]); i++; }
        var closed = i < lines.length;
        if (closed) i++;
        /* :::|（或 :::vl）忘了闭合时，只包住到第一个标题为止，后面的普通 ## 标题不再整片染色 */
        if (!closed && (dir.name === 'vl' || dir.name === '|')) {
          var vcut = -1;
          for (var vi = 0; vi < dbuf.length; vi++) {
            if (/^ {0,3}#{1,6}\s/.test(dbuf[vi])) { vcut = vi; break; }
          }
          if (vcut > 0) { i = i - (dbuf.length - vcut); dbuf = dbuf.slice(0, vcut); }
        }
        var keepStore = store, keepSeq = seq;
        var dInner = render(dbuf.join('\n'), opts);
        store = keepStore; seq = keepSeq;
        out.push(containerHtml(dir, dInner));
        continue;
      }

      /* 洛谷 Tuack 表格：::cute-table{tuack}（或 :::cute-table{tuack}）修饰紧随其后的那张表格 */
      if (/^ {0,3}:{2,3}cute-table\{tuack\}[ \t]*$/.test(trim)) {
        flush();
        var tj = i + 1;
        while (tj < lines.length && !lines[tj].trim()) tj++;
        if (tj + 1 < lines.length && lines[tj].trim().indexOf('|') >= 0 &&
            /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+/.test(lines[tj + 1])) {
          var tr = renderTable(lines[tj], lines[tj + 1], lines, tj + 2, true);
          out.push(tr.html); i = tr.next;
        } else { i++; }
        continue;
      }

      /* 围栏代码块（支持两种多语言写法，且都支持逐段 lnum / l=a-b）：
         ① 上一段的结束围栏后带语言标识（```cpp l=5-6）即为下一段开始，
            裸 ``` 收组，各语言段合成一组语言标签页；
         ② 开栏写成 ` cpp lnum l=1-2|python l=3-4`，块内用围栏行分隔各语言的代码段。 */
      var f = fenceInfo(ln);
      if (f) {
        flush();
        var pipes = f.pipes;
        var group = [];
        if (pipes) {
          /* 声明式写法：竖线两边各是一段完整开栏参数，围栏行当段分隔符，
             收满 N 段后由末尾围栏收块；每段的行号列与高亮范围各自独立 */
          var secs = [], cur = [];
          i++;
          while (i < lines.length) {
            if (fenceClose(lines[i], f.ch, f.n)) {
              secs.push(cur.join('\n')); cur = [];
              i++;
              if (secs.length >= pipes.length) break;
              continue;
            }
            cur.push(lines[i]); i++;
          }
          if (cur.length || secs.length < pipes.length) secs.push(cur.join('\n'));
          pipes.forEach(function (mg, k) {
            group.push({ lang: mg.lang, code: secs[k] || '', hl: mg.hl, ln: mg.ln });
          });
        } else if (f.lang) {
          /* 多语言标签组：收段时遇到「带语言标识的围栏行」（如 ```cpp l=5-6）
             表示当前语言段结束、下一段开始；只有裸 ``` 才收整组。
             每段的 lnum 与 l=a-b 各自独立；只收出一段时仍是普通代码块。 */
          var secs = [{ meta: f, buf: [] }];
          i++;
          while (i < lines.length) {
            if (fenceClose(lines[i], f.ch, f.n)) {
              var cf = fenceInfo(lines[i]);
              if (cf && cf.lang && !cf.pipes) {
                secs.push({ meta: cf, buf: [] });
                i++;
                continue;
              }
              i++; /* 裸围栏（或非语言参数围栏）：整组结束 */
              break;
            }
            secs[secs.length - 1].buf.push(lines[i]);
            i++;
          }
          group = secs.map(function (s) {
            return { lang: s.meta.lang, code: s.buf.join('\n'), hl: s.meta.hl, ln: s.meta.ln };
          });
        } else {
          /* 无语言纯围栏块：任何同字符围栏行都收块，不做标签组合并 */
          var buf = [];
          i++;
          while (i < lines.length && !fenceClose(lines[i], f.ch, f.n)) { buf.push(lines[i]); i++; }
          if (i < lines.length) i++;
          group.push({ lang: f.lang, code: buf.join('\n'), hl: f.hl, ln: f.ln });
        }
        out.push(group.length > 1 ? codeTabsHtml(group)
          : codeHtml(f.lang, group[0].code, group[0].hl, undefined, group[0].ln));
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

      /* 标题；井号后紧跟 | 就给这个标题加一条蓝→粉渐变竖线（.zb-vl） */
      var hd = ln.match(/^ {0,3}(#{1,6})(\|?)\s+(.+?)\s*#*\s*$/);
      /* 井号后带 | 且正文里还有 | 的多半是表格行，不当成渐变竖线标题 */
      if (hd && hd[2] && hd[3].indexOf('|') >= 0) hd = null;
      if (hd) {
        flush();
        var lev = Math.min(6, hd[1].length);
        var txt = inline(hd[3]);
        var slug = 'h-' + String(hd[3]).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 40);
        out.push('<h' + lev + (hd[2] ? ' class="zb-vl"' : '') +
          ' id="' + esc(slug) + '">' + txt + '</h' + lev + '>');
        i++; continue;
      }

      /* 表格（支持洛谷 ^ 向上合并 / < 向左合并） */
      if (trim.indexOf('|') >= 0 && i + 1 < lines.length &&
          /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+/.test(lines[i + 1])) {
        flush();
        var t = renderTable(ln, lines[i + 1], lines, i + 2, !!(opts && opts.truck));
        out.push(t.html); i = t.next;
        continue;
      }

      /* 引用 */
      if (/^ {0,3}>/.test(ln)) {
        flush();
        var q = [];
        while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
          q.push(lines[i].replace(/^ {0,3}>\s?/, '')); i++;
        }
        out.push('<blockquote>' + render(q.join('\n'), opts) + '</blockquote>');
        continue;
      }

      /* 列表：无序 / 有序 / 任务，支持缩进嵌套（Tab 缩进两空格算一层）。
         飞书式写法：整块列表之前可以缩进——基准缩进不再忽略，两个空格
         （一个 Tab）算一层，渲染成左外边距（每层 22px、最多 6 层），
         同时把基准归零，块内嵌套关系完全保持相对。 */
      var li = ln.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
      if (li) {
        flush();
        var liItems = [];
        while (i < lines.length) {
          var lm = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
          if (!lm) break;
          liItems.push({
            indent: lm[1].replace(/\t/g, '  ').length,
            marker: lm[2],
            text: lm[3]
          });
          i++;
        }
        var liBase = Math.min.apply(null, liItems.map(function (x) { return x.indent; }));
        if (liBase > 0) liItems.forEach(function (x) { x.indent -= liBase; });
        var liCur = { i: 0 };
        var listHtml = [];
        while (liCur.i < liItems.length) {
          listHtml.push(listTree(liItems, liCur, liItems[liCur.i].indent));
        }
        var liOut = listHtml.join('\n');
        if (liBase > 0) {
          var liPad = ' style="margin-left:' + (Math.min(Math.round(liBase / 2), 6) * 22) + 'px"';
          liOut = liOut.replace(/(^|\n)<(ul|ol)>/g, '$1<$2' + liPad + '>');
        }
        out.push(liOut);
        continue;
      }

      para.push(trim);
      i++;
    }
    flush();
    return restore(out.join('\n'));
  }

  /* ---------------- 格式优化 ----------------
     只删「渲染时本来就被忽略」的空白：行首行尾空格（列表项行首缩进除外，
     它决定整块缩进与嵌套层级）、连续空行、正文里多余的连续半角空格。
     围栏代码块与 $$ 公式整段原样保留，反引号行内代码与 $…$ 行内公式里的
     空格也不动，所以整理前后预览效果一致。 */
  /* 格式优化：mode 缺省为紧凑（现状：压掉多余空格与连续空行，预览效果不变）；
     mode='loose'（舒展）在此基础上保证不同内容之间恰好留一个空行，便于阅读编辑。
     围栏代码块、$$ 公式块内部永远不动；同一段落的连续文本行不会被拆开。 */
  function loosePass(lines) {
    function kindOf(ln) {
      if (/^ {0,3}#{1,6}(\|?)\s+\S/.test(ln)) return 'head';
      if (/^ {0,3}>/.test(ln)) return 'quote';
      if (/^ {0,3}:{3,}/.test(ln)) return 'dir';
      if (/^ {0,3}(?:-\s*){3,}$/.test(ln) || /^ {0,3}(?:\*\s*){3,}$/.test(ln) ||
          /^ {0,3}(?:_\s*){3,}$/.test(ln)) return 'hr';
      if (/^ {0,3}([-*+]|\d+[.)])\s/.test(ln)) return 'list';
      if (/^\s*\|/.test(ln)) return 'table';
      return 'para';
    }
    var out = [], fence = null, math = false, prev = '';
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var fm = ln.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fence) {
        out.push(ln);
        if (fm && fm[1][0] === fence.ch && fm[1].length >= fence.n) fence = null;
        continue;
      }
      if (fm) {
        if (prev) out.push('');
        out.push(ln); fence = { ch: fm[1][0], n: fm[1].length }; prev = 'fence';
        continue;
      }
      if (math) {
        out.push(ln);
        if (ln.indexOf('$$') >= 0) { math = false; prev = 'math'; }
        continue;
      }
      if (!ln) { out.push(''); prev = ''; continue; }
      if (/^ {0,3}\$\$/.test(ln)) {
        if (prev) out.push('');
        out.push(ln);
        if (!/^\s*\$\$(.+)\$\$\s*$/.test(ln)) math = true;
        prev = 'math';
        continue;
      }
      var k = kindOf(ln);
      /* 同一段落的续行、同一个列表的连续项不拆开；其余不同内容之间补一个空行 */
      if (k === 'para' && prev === 'para') { out.push(ln); continue; }
      if (k === 'list' && prev === 'list') { out.push(ln); continue; }
      if (prev) out.push('');
      out.push(ln); prev = k;
    }
    return out;
  }
  function tidy(src, opts) {
    var text = String(src == null ? '' : src).replace(/\r\n?/g, '\n');
    var lines = text.split('\n');
    var out = [], fence = null, math = false, blank = 0;
    function collapse(s) {
      /* 双美元行内公式也要整段保护：表格行里的 $$O(n^2)$$ 不会被压掉空格 */
      return s.replace(/(`[^`\n]*`|\$\$[^$\n]+\$\$|\$[^$\n]+\$)|( {2,})/g, function (m, keep) {
        return keep || ' ';
      });
    }
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i], f = fenceInfo(ln);
      if (fence) {
        out.push(ln);
        if (fenceClose(ln, fence.ch, fence.n)) fence = null;
        blank = 0; continue;
      }
      if (f) { fence = f; out.push(ln); blank = 0; continue; }
      if (math) {
        out.push(ln);
        if (ln.indexOf('$$') >= 0) math = false;
        blank = 0; continue;
      }
      if (/^ {0,3}\$\$/.test(ln)) {
        out.push(ln.replace(/[ \t\u3000]+$/, ''));
        if (!/^\s*\$\$(.+)\$\$\s*$/.test(ln)) math = true;
        blank = 0; continue;
      }
      var t = ln.replace(/\t/g, '  ');
      /* 列表项的行首缩进有渲染含义（整块缩进 / 嵌套层级），原样保留，
         且不能被 collapse 压掉；只清行尾、压缩标记之后的内容 */
      var liM = t.match(/^( +)([-*+]|\d+[.)])\s/);
      if (liM) {
        out.push(liM[1] + collapse(t.slice(liM[1].length).replace(/[ \u3000]+$/, '')));
        blank = 0; continue;
      }
      t = collapse(t.replace(/^[ \u3000]+/, '')
        .replace(/[ \u3000]+$/, ''));
      if (!t) {
        blank++;
        if (blank <= 1) out.push('');
        continue;
      }
      blank = 0;
      out.push(t);
    }
    var lines = (opts && String(opts.mode || '') === 'loose') ? loosePass(out) : out;
    return lines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
  }

  function plain(src) {
    return String(src == null ? '' : src)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\$\$[\s\S]*?\$\$/g, ' ')
      .replace(/^:::(?:vl)?[ \t]*$/gm, ' ')
      .replace(/[#>*_~`|$\[\]()!-]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* 浏览器里给多语言代码标签组挂一次文档级委托（构建沙箱无 document 自动跳过） */
  bindCodeTabs();

  return { render: render, inline: inline, tex: texToHtml, plain: plain,
           tidy: tidy, highlight: highlightCode, langLabel: langLabel, version: '1.8.0' };
});
