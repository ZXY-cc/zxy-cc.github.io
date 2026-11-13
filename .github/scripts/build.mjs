/* 星梦Staream · 站点构建脚本（零依赖，Node 18+）
 * 用法：node blog/scripts/build.mjs
 *
 * 唯一内容源：blog/博客版本日志.md
 * 产出：
 *   博客版本日志.html            同名 HTML 镜像（可直接双击打开）
 *   assets/changelog.js         前端数据：HTML 全文 + 版本日志文章 + 元信息
 *   assets/comments-data.js     留言归档快照（由 data/comments.json 生成）
 *   posts/<slug>.html           每篇文章的静态阅读版（含已存档留言，无 JS 可读、爬虫可索引；
 *                               归档区块带同步标记，GitHub Actions 可只替换这一段）
 *   sitemap.xml / robots.txt    站点地图
 *   index.html                  同步 <noscript> 兜底与 JSON-LD
 * 每次更新版本日志后跑一次，四份内容即保持一致。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/* 本地构建时脚本在 blog/scripts/ 下，仓库内自动重建时放在 .github/scripts/ 下，
   用 ZB_ROOT 指定站点根目录，保证两份脚本是同一份实现、输出不分叉。 */
const ROOT = process.env.ZB_ROOT ? path.resolve(process.env.ZB_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://zxy-blog.top';
const CUSTOM_DOMAIN = 'zxy-blog.top';
const MD_REL = '博客版本日志.md';
const HTML_REL = '博客版本日志.html';
const SITE_TITLE = '星梦Staream';
/* Markdown + LaTeX 渲染与前端共用同一份实现，静态镜像不会与站点显示不一致 */
const require = createRequire(import.meta.url);
const ZBMD = require(path.join(ROOT, 'assets/markdown.js'));
/* 归档渲染器与前端共用同一份实现，静态镜像与 SPA 永不版式分叉 */
const ZBArchive = require(path.join(ROOT, 'assets/comment-archive.js'));

/* 互动区配置由 assets/interactions-config.js 单独维护：仓库标识、留言入口与分页条数。
   构建把仓库归档烘焙进静态阅读版（无 JS 也能读），浏览器再按需读取公开 Issues
   把留言直接显示进评论区；GitHub Actions 负责把 Issues 留言写回 data/comments.json。 */
const INTERACTIONS_CFG = (() => {
  try {
    const box = { window: {} };
    /* 此处早于 read 助手定义，直接读文件；读取失败必须让构建报错，不能静默降级 */
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/interactions-config.js'), 'utf8'), box);
    return box.window.ZB_INTERACTIONS || {};
  } catch (e) { throw new Error('读取互动区配置失败：' + e.message); }
})();
const INTERACTIONS_READY = typeof INTERACTIONS_CFG.repository === 'string' &&
  /^[\w.-]+\/[\w.-]+$/.test(INTERACTIONS_CFG.repository);
const newIssueLink = (slug) => {
  try { return String(INTERACTIONS_CFG.newIssueUrl(slug) || ''); } catch (e) {
    return 'https://github.com/' + INTERACTIONS_CFG.repository + '/issues/new?title=' +
      encodeURIComponent('留言 | ' + slug);
  }
};

/* 旧文章 body 是预渲染 HTML，代码块没有高亮标记；剥掉旧标记、还原实体后
   用同一套渲染引擎重新上色（对 markdown 新渲染的结果幂等） */
const rehlHtml = (html) =>
  String(html || '').replace(/<pre[^>]*>[\s\S]*?<\/pre>/g, (blk) => {
    if (!blk.includes('<code')) return blk;
    let lang = (blk.match(/data-lang="([^"]*)"/) || [])[1] ||
      (blk.match(/class="zb-lang">([^<]*)</) || [])[1] || '';
    return blk.replace(/<code[^>]*>[\s\S]*?<\/code>/, (cm) => {
      const gt = cm.indexOf('>'), end = cm.lastIndexOf('</code>');
      const raw = cm.slice(gt + 1, end).replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      if (!lang && /#include|#define\b/.test(raw)) lang = 'c';
      return `<code>${ZBMD.highlight(raw, lang)}</code>`;
    });
  });

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* 互动区脚本与样式带版本参数：发布新版本后浏览器不会再复用旧缓存的
   comment-archive.js 等文件，修复「新页面 + 旧脚本」导致预览按钮丢失的问题 */
const CACHE_FILES = ['comments-data', 'comment-archive', 'interactions-config', 'interactions',
  'issues-live', 'markdown', 'studio', 'likes', 'app'];
let CACHE_VER = '';
const cacheBust = (s) => {
  if (!CACHE_VER) return s;
  let out = s;
  for (const f of CACHE_FILES) {
    out = out.replace(new RegExp('src="((?:\\.\\./)?assets/' + f + '\\.js)(?:\\?v=[^"]*)?"', 'g'),
      'src="$1?v=' + CACHE_VER + '"');
  }
  /* style.css 同样带版本：布局调整后浏览器不会继续复用旧样式 */
  return out.replace(/href="((?:\.\.\/)?assets\/(?:interactions|style)\.css)(?:\?v=[^"]*)?"/g,
    'href="$1?v=' + CACHE_VER + '"');
};
const write = (f, s) => {
  const p = path.join(ROOT, f);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  let text = String(s).replace(/\r\n/g, '\n');
  if (f.endsWith('.html')) text = cacheBust(text);
  fs.writeFileSync(p, text, 'utf8');
};
const loadWindowJs = (f) => {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(read(f), ctx, { filename: f });
  return ctx.window;
};

/* ---------- 留言归档：Git 仓库是评论的最终存储 ----------
   data/comments.json 是随仓库版本化的纯文本资产，可人工审核、删改、导出、迁移。
   GitHub Actions 把 GitHub Issues 的公开留言写回这份文件；构建只读取它，
   不连任何服务、不依赖网络。服务停摆、换域名、十年后回看都沿用仓库里这份快照。 */
const ARCHIVE_FILE = 'data/comments.json';
const readArchive = () => {
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, ARCHIVE_FILE), 'utf8'));
  if (!a || (a.schema !== 1 && a.schema !== 2) || !a.posts ||
      typeof a.posts !== 'object' || Array.isArray(a.posts)) {
    throw new Error('留言归档格式不正确：' + ARCHIVE_FILE);
  }
  return a;
};
const ARCHIVE = readArchive();
/* 前端只读这份生成文件，归档态不发起任何网络请求 */
write('assets/comments-data.js',
  '/* 由 data/comments.json 生成，勿手改 */\n' +
  'window.ZB_COMMENTS = ' + JSON.stringify(ARCHIVE).replace(/</g, '\\u003c') + ';\n');
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, (_m, a) => '<code>' + a + '</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, a) => '<strong>' + a + '</strong>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*)\)/g,
    (_m, t, u) => '<a href="' + u + '">' + t + '</a>');
  return out;
}

/* ---------- 极简 Markdown 块解析（只覆盖本日志用到的语法） ---------- */
function parseBlocks(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  const isTable = (l) => l.trim().startsWith('|');
  const isSep = (cells) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    if (ln.startsWith('### ')) { blocks.push({ type: 'h3', text: ln.slice(4).trim() }); i++; continue; }
    if (ln.startsWith('## ')) { blocks.push({ type: 'h2', text: ln.slice(3).trim() }); i++; continue; }
    if (ln.startsWith('# ')) { blocks.push({ type: 'h1', text: ln.slice(2).trim() }); i++; continue; }
    if (/^---+$/.test(ln.trim())) { blocks.push({ type: 'hr' }); i++; continue; }
    if (ln.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const paras = [];
      let cur = [];
      buf.forEach((t) => {
        if (!t.trim()) { if (cur.length) { paras.push(cur.join(' ')); cur = []; } }
        else cur.push(t.trim());
      });
      if (cur.length) paras.push(cur.join(' '));
      blocks.push({ type: 'quote', paras });
      continue;
    }
    if (isTable(ln)) {
      const rows = [];
      while (i < lines.length && isTable(lines[i])) {
        rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim()));
        i++;
      }
      const header = rows[0] || [];
      const body = rows.slice(1).filter((r) => !isSep(r));
      blocks.push({ type: 'table', header, rows: body });
      continue;
    }
    if (/^\s*[-*]\s+/.test(ln)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() &&
           !/^(#{1,3}\s|>|\||---|\s*[-*]\s)/.test(lines[i])) {
      buf.push(lines[i].trim());
      i++;
    }
    if (buf.length) blocks.push({ type: 'p', text: buf.join(' ') });
    else i++;
  }
  return blocks;
}

const COLORS = {
  '🆕 新增': '#2f8f5b', '🔧 修复': '#c05555', '⚡ 优化': '#b37816', '🎨 UI': '#3c7fb0',
  '📄 文档': '#6b6b8f', '♿ 无障碍': '#4d7fa8', '📌 需求': '#2f7fa8',
  '🚀 上线': '#a0638f', '🧹 清理': '#3f8b80'
};
const chip = (t) => {
  const c = COLORS[t] || '#607089';
  return '<span class="chip" style="color:' + c + ';background:' + c + '14;border-color:' + c + '38">' + esc(t) + '</span>';
};
const tableKind = (header) => {
  const h = header[0] || '';
  if (h === '版本') return 't-ver';
  if (h === '标签') return 't-legend';
  if (h === '项') return 't-pending';
  return 't-plain';
};
function tableHtml(b) {
  const kind = tableKind(b.header);
  const rows = b.rows.map((r) => {
    const cells = r.map((c, i) => {
      if (kind === 't-ver' && i === 2) return c.split(' · ').map((x) => chip(x.trim())).join(' ');
      if (kind === 't-ver' && i === 0) return '<span class="ver">' + esc(c) + '</span>';
      if (kind === 't-legend' && i === 0) return chip(c.trim());
      return inline(c);
    });
    return '<tr>' + cells.map((c) => '<td>' + c + '</td>').join('') + '</tr>';
  }).join('\n');
  return '<table class="' + kind + '"><thead><tr>' +
    b.header.map((h) => '<th>' + inline(h) + '</th>').join('') +
    '</tr></thead><tbody>\n' + rows + '\n</tbody></table>';
}
function blocksHtml(blocks, { skipH1 = false, quoteClass = 'note' } = {}) {
  let out = '';
  for (const b of blocks) {
    if (b.type === 'h1' && skipH1) continue;
    if (b.type === 'h1') out += '<h1>' + inline(b.text) + '</h1>';
    else if (b.type === 'h2') out += '<h2>' + inline(b.text) + '</h2>';
    else if (b.type === 'h3') out += '<h3>' + inline(b.text) + '</h3>';
    else if (b.type === 'p') out += '<p>' + inline(b.text) + '</p>';
    else if (b.type === 'hr') out += '<hr>';
    else if (b.type === 'ul') out += '<ul>' + b.items.map((x) => '<li>' + inline(x) + '</li>').join('') + '</ul>';
    else if (b.type === 'table') out += tableHtml(b);
    else if (b.type === 'quote') out += '<div class="' + quoteClass + '">' +
      b.paras.map((p) => '<p>' + inline(p) + '</p>').join('') + '</div>';
  }
  return out;
}

/* ---------- 解析版本日志 ---------- */
const md = read(MD_REL);
const blocks = parseBlocks(md);
const titleBlock = blocks.find((b) => b.type === 'h1');
const docTitle = (titleBlock && titleBlock.text) || (SITE_TITLE + ' · 博客版本日志');
const metaBlock = blocks.find((b) => b.type === 'quote');
const metaText = metaBlock ? metaBlock.paras.join(' ') : '';
const dateMatch = metaText.match(/最后更新：(\d{4}-\d{2}-\d{2})/);
const verMatch = metaText.match(/（(v\d+(?:\.\d+)+)/);
const LOG_DATE = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);
const LOG_VER = verMatch ? verMatch[1] : 'v1.0.0';
CACHE_VER = LOG_VER;
const versions = [];
for (const b of blocks) {
  if (b.type === 'table' && tableKind(b.header) === 't-ver') {
    b.rows.forEach((r) => versions.push({ v: r[0], date: r[1], tags: r[2].split(' · ').map((x) => x.trim()), desc: r[3] }));
  }
}
const articleHtml = rehlHtml(blocksHtml(blocks.filter((b) => b !== metaBlock), { skipH1: true, quoteClass: 'note' }));

/* ---------- 同名 HTML 镜像 ---------- */
const STANDALONE_CSS = `
:root{--panel:#fff;--ink:#39436a;--muted:#525d84;--line:#e5eaf7;--brand:#8fb1ee;--brand-deep:#3f5c9c;--chip-bg:#f4f7ff;--page:#eff4ff;--shadow:0 1px 3px rgba(20,30,70,.05)}
html[data-theme="night"]{--panel:rgba(24,34,76,.92);--ink:#f4f7ff;--muted:#d4e1fc;--line:rgba(208,226,255,.22);--brand:#b6d0ff;--brand-deep:#dbe9ff;--chip-bg:rgba(126,162,226,.14);--page:#141c3c;--shadow:0 1px 3px rgba(0,0,0,.24)}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:linear-gradient(160deg,#dceafb,#eae6fb 46%,#fdeef5);color:var(--ink);font:15px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;min-height:100vh}
html[data-theme="night"] body{background:linear-gradient(160deg,#2c3f78,#3b3670 50%,#5b4273)}
.wrap{max-width:1080px;margin:0 auto;padding:30px 20px 54px}
header.hero{background:var(--panel);border:1px solid var(--line);border-top:3px solid var(--brand);border-radius:14px;padding:22px 26px;margin-bottom:18px;box-shadow:var(--shadow)}
header.hero h1{margin:0 0 4px;font-size:23px;letter-spacing:.5px}
header.hero .sub{color:var(--muted);font-size:13px}
header.hero .sub a{color:var(--brand-deep);text-decoration:none;font-weight:600}
.meta{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--brand);border-radius:10px;padding:12px 20px;margin:0 0 20px;font-size:14px;line-height:2}
.meta p{margin:0 0 4px}.meta p:last-child{margin:0}
.note{background:var(--chip-bg);border:1px solid var(--line);border-left:4px solid var(--brand);border-radius:10px;padding:10px 18px;margin:12px 0 18px;font-size:13.5px;line-height:2}
.note p{margin:6px 0}
h2{font-size:18px;margin:30px 0 12px;padding-left:12px;border-left:4px solid var(--brand);line-height:1.45}
h2.foldable-h2{display:flex;justify-content:space-between;align-items:center;gap:10px}
h3{font-size:15.5px;margin:20px 0 8px;color:var(--brand-deep)}
p{margin:10px 0}
.fold-btn{flex:none;width:26px;height:26px;border:1px solid var(--line);background:var(--chip-bg);border-radius:7px;color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.fold-btn:hover{border-color:var(--brand);color:var(--ink)}
.fold-btn svg{transition:transform .18s ease;display:block}
.fold-btn.open svg{transform:rotate(180deg)}
.fold-body.collapsed{display:none}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:13.5px;margin:6px 0 4px}
th{background:var(--chip-bg);text-align:left;font-weight:600;white-space:nowrap;color:var(--ink)}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
tbody tr:hover{background:var(--chip-bg)}
.t-ver td:nth-child(1),.t-ver th:nth-child(1){width:96px}
.t-ver td:nth-child(2),.t-ver th:nth-child(2){width:110px;color:var(--muted);white-space:nowrap}
.t-ver td:nth-child(3),.t-ver th:nth-child(3){width:210px}
.t-legend td:first-child{width:140px;white-space:nowrap}
.t-pending td:nth-child(1){width:150px;font-weight:600}
.t-pending td:nth-child(2){width:120px}
.ver{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;white-space:nowrap}
.chip{display:inline-block;padding:1px 8px;margin:1px 4px 1px 0;border:1px solid;border-radius:20px;font-size:12px;line-height:1.65;white-space:nowrap}
code{background:var(--chip-bg);border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;color:var(--brand-deep)}
a{color:var(--brand-deep)}
footer{margin-top:40px;padding-top:14px;border-top:1px dashed var(--line);color:var(--muted);font-size:12px;text-align:center}
[hidden]{display:none!important}
.tagsearch{margin-top:16px}
.ts-row{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap}
.ts-box{position:relative;flex:1 1 320px;min-width:230px;background:var(--chip-bg);border:1px solid var(--line);border-radius:9px;padding:8px 34px 8px 12px;cursor:pointer;user-select:none;font-size:13.5px;color:var(--muted);outline:none}
.ts-box:hover,.ts-box:focus{border-color:var(--brand)}
.ts-arrow{position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none}
.ts-placeholder.has{color:var(--ink)}
.ts-panel{position:absolute;left:-1px;right:-1px;top:calc(100% + 6px);z-index:30;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 18px rgba(20,30,70,.12);padding:10px 12px}
.ts-tabs{display:flex;gap:6px;margin-bottom:8px;border-bottom:1px solid var(--line);padding-bottom:8px}
.ts-tab{border:1px solid var(--line);background:var(--chip-bg);border-radius:8px;padding:4px 14px;font-size:13px;cursor:pointer;color:var(--muted)}
.ts-tab.active{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
.ts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:2px 8px}
.ts-item{display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:7px;cursor:pointer;font-size:13px}
.ts-item:hover{background:var(--chip-bg)}
.ts-item input{margin:0;accent-color:var(--brand-deep)}
.ts-btn{border:1px solid var(--brand-deep);background:var(--brand-deep);color:#fff;border-radius:9px;padding:8px 16px;font-size:13.5px;cursor:pointer}
.ts-btn.ts-clear{background:var(--panel);color:var(--muted);border-color:var(--line)}
.ts-result{margin-top:14px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.ts-head{font-size:13.5px;font-weight:600;margin-bottom:6px}
.ts-result table{margin:0}
@media (max-width:640px){.wrap{padding:18px 12px 36px}header.hero{padding:18px}table{font-size:12.5px}th,td{padding:8px 8px}}
`;
const STANDALONE_JS = `
(function(){
  var DATA=${JSON.stringify(versions)};
  var COLORS=${JSON.stringify(COLORS)};
  function chipHTML(t){var c=COLORS[t]||'#607089';return '<span class="chip" style="color:'+c+';background:'+c+'14;border-color:'+c+'38">'+t+'</span>';}
  var box=document.getElementById('ts-box'),panel=document.getElementById('ts-panel'),display=document.getElementById('ts-display');
  var gridTag=document.getElementById('ts-grid-tag'),gridDate=document.getElementById('ts-grid-date');
  var body=document.getElementById('ts-body'),head=document.getElementById('ts-head'),result=document.getElementById('ts-result');
  var btn=document.getElementById('ts-btn'),clear=document.getElementById('ts-clear'),tabs=document.querySelectorAll('.ts-tab');
  var dates=[];DATA.forEach(function(r){if(dates.indexOf(r.date)<0)dates.push(r.date);});
  gridDate.innerHTML=dates.map(function(d){return '<label class="ts-item"><input type="checkbox" value="'+d+'"><span>'+d+' <em>('+DATA.filter(function(r){return r.date===d;}).length+')</em></span></label>';}).join('');
  function chosen(g){return [].filter.call(g.querySelectorAll('input'),function(c){return c.checked;}).map(function(c){return c.value;});}
  function refresh(){
    var n=chosen(gridTag).length+chosen(gridDate).length;
    display.textContent=n?'已选 '+n+' 个条件':'点击选择日期或标签，可多选…';
    display.classList.toggle('has',n>0);
  }
  function vkey(v){var m=String(v).match(/v(\\d+(?:\\.\\d+)+)/);return m?m[1].split('.').map(Number):[0];}
  function cmp(a,b){a=vkey(a);b=vkey(b);for(var i=0;i<Math.max(a.length,b.length);i++){var x=a[i]||0,y=b[i]||0;if(x!==y)return x-y;}return 0;}
  function run(){
    var ds=chosen(gridDate),ts=chosen(gridTag);
    if(!ds.length&&!ts.length){result.hidden=true;clear.hidden=true;return;}
    var hits=DATA.filter(function(r){return (!ds.length||ds.indexOf(r.date)>=0)&&(!ts.length||r.tags.some(function(t){return ts.indexOf(t)>=0;}));});
    hits.sort(function(a,b){return a.date!==b.date?(a.date<b.date?-1:1):cmp(a.v,b.v);});
    head.textContent='筛选结果：'+hits.length+' 个版本（时间从早到晚）';
    body.innerHTML=hits.map(function(r){return '<tr><td><span class="ver">'+r.v+'</span></td><td>'+r.date+'</td><td>'+r.tags.map(chipHTML).join('')+'</td><td>'+r.desc+'</td></tr>';}).join('');
    result.hidden=false;clear.hidden=false;panel.hidden=true;
  }
  box.addEventListener('click',function(e){if(e.target===box||e.target.className==='ts-placeholder'||e.target.className==='ts-arrow'){panel.hidden=!panel.hidden;}});
  box.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();panel.hidden=!panel.hidden;}});
  [].forEach.call(tabs,function(t){t.addEventListener('click',function(){[].forEach.call(tabs,function(x){x.classList.remove('active');});t.classList.add('active');var tag=t.getAttribute('data-tab')==='tag';gridTag.hidden=!tag;gridDate.hidden=tag;});});
  panel.addEventListener('change',refresh);
  btn.addEventListener('click',run);
  clear.addEventListener('click',function(){[].forEach.call(panel.querySelectorAll('input'),function(c){c.checked=false;});refresh();result.hidden=true;clear.hidden=true;});
  document.addEventListener('click',function(e){if(!box.contains(e.target))panel.hidden=true;});
  refresh();
  [].forEach.call(document.querySelectorAll('.fold-btn'),function(b){
    b.addEventListener('click',function(){var t=document.getElementById(b.getAttribute('data-target'));if(!t)return;var c=t.classList.toggle('collapsed');b.classList.toggle('open',!c);b.setAttribute('aria-expanded',c?'false':'true');sendHeight();});
  });
  function sendHeight(){try{window.parent.postMessage({type:'cl-height',height:document.documentElement.scrollHeight},'*');}catch(e){}}
  function setTheme(t){document.documentElement.setAttribute('data-theme',t==='night'?'night':'day');}
  try{var pt=window.parent!==window?window.parent.document.documentElement.getAttribute('data-theme'):null;setTheme(pt||((window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'night':'day'));}catch(e){}
  window.addEventListener('message',function(e){if(e.data&&e.data.type==='zb-theme')setTheme(e.data.theme);});
  window.addEventListener('load',function(){sendHeight();});
  if(window.ResizeObserver){new ResizeObserver(sendHeight).observe(document.body);}
  sendHeight();
})();`;

function standaloneHtml() {
  const tagItems = Object.keys(COLORS).map((t) =>
    '<label class="ts-item"><input type="checkbox" value="' + esc(t) + '">' + chip(t) + '</label>').join('\n');
  const foldSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const metaHtml = metaBlock
    ? '<div class="meta">' + metaBlock.paras.map((p) => '<p>' + inline(p) + '</p>').join('') + '</div>'
    : '';
  // 按 h2 切段；前两段默认折叠，其余展开
  const sections = [];
  let cur = null;
  for (const b of blocks) {
    if (b.type === 'h2') { cur = { title: b.text, body: [] }; sections.push(cur); continue; }
    if (!cur) continue;                  // h1 与首个 meta 引用块由 hero / meta 呈现
    cur.body.push(b);
  }
  const sectionHtml = sections.map((s, idx) => {
    const collapsed = idx < 2;
    const id = 'fold-body-' + (idx + 1);
    return '<h2 class="foldable-h2">' + inline(s.title) +
      '<button type="button" class="fold-btn' + (collapsed ? '' : ' open') + '" data-target="' + id +
      '" title="展开 / 折叠" aria-expanded="' + (collapsed ? 'false' : 'true') + '">' + foldSvg + '</button></h2>\n' +
      '<div class="fold-body' + (collapsed ? ' collapsed' : '') + '" id="' + id + '">' +
      blocksHtml(s.body, { quoteClass: 'note' }) + '</div>';
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="day">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(docTitle)}</title>
<meta name="description" content="星梦Staream 博客的版本记录镜像，与站点文章、关于页预览保持同步。">
<style>${STANDALONE_CSS}</style>
</head>
<body>
<div class="wrap">
<header class="hero">
  <h1>${esc(docTitle)}</h1>
  <div class="sub">纯静态个人博客 · 版本记录镜像 · <a href="${ORIGIN}/" target="_top">返回站点 ↗</a></div>
  <div class="tagsearch">
    <div class="ts-row">
      <div class="ts-box" id="ts-box" tabindex="0" title="选择日期或标签，可多选">
        <span class="ts-placeholder" id="ts-display">点击选择日期或标签，可多选…</span>
        <span class="ts-arrow">▾</span>
        <div class="ts-panel" id="ts-panel" hidden>
          <div class="ts-tabs">
            <button type="button" class="ts-tab" data-tab="date">日期</button>
            <button type="button" class="ts-tab active" data-tab="tag">标签</button>
          </div>
          <div class="ts-grid" id="ts-grid-tag">
${tagItems}
          </div>
          <div class="ts-grid" id="ts-grid-date" hidden></div>
        </div>
      </div>
      <button class="ts-btn" id="ts-btn" type="button">筛选</button>
      <button class="ts-btn ts-clear" id="ts-clear" type="button" hidden>清除筛选</button>
    </div>
    <div class="ts-result" id="ts-result" hidden>
      <div class="ts-head" id="ts-head"></div>
      <table class="t-ver"><thead><tr><th>版本</th><th>日期</th><th>类别</th><th>主要改动</th></tr></thead><tbody id="ts-body"></tbody></table>
    </div>
  </div>
</header>
${metaHtml}
${sectionHtml}
<footer>${esc(SITE_TITLE)} · 版本日志镜像 · 最后更新 ${esc(LOG_DATE)}（${esc(LOG_VER)}） · md 与 html 同源同步</footer>
</div>
<script>${STANDALONE_JS}</script>
</body>
</html>
`;
}

const standalone = standaloneHtml();
write(HTML_REL, standalone);

/* ---------- 前端数据 ---------- */
const changelogPost = {
  slug: 'blog-changelog',
  title: '博客版本日志',
  date: LOG_DATE,
  tags: ['版本日志', '站点', 'A'],
  summary: '每次更新都记在这里：改了什么、什么时候改的。',
  body: articleHtml
};
const frontend = [
  '/* 本文件由 scripts/build.mjs 从 博客版本日志.md 生成，请勿手改。',
  '   md → html → 前端文章 → 关于页预览，四份内容同源同步。 */',
  'window.CHANGELOG_HTML = ' + JSON.stringify(standalone) + ';',
  'window.CHANGELOG_POST = ' + JSON.stringify(changelogPost) + ';',
  'window.CHANGELOG_META = ' + JSON.stringify({ version: LOG_VER, date: LOG_DATE, count: versions.length, title: docTitle }) + ';',
  ''
].join('\n');
write('assets/changelog.js', frontend);

/* ---------- 文章集合（posts.js 逐字节不动；覆盖层与版本日志文章在此合并） ---------- */
const base = loadWindowJs('assets/posts.js');
const overlay = loadWindowJs('assets/site-data.js');
const generated = loadWindowJs('assets/changelog.js');
const POSTS = (base.POSTS || []).slice();
((overlay.STUDIO_DATA || {}).posts || []).forEach((p) => {
  const i = POSTS.findIndex((x) => x.slug === p.slug);
  if (i >= 0) POSTS[i] = p; else POSTS.push(p);
});
if (generated.CHANGELOG_POST) {
  const i = POSTS.findIndex((x) => x.slug === generated.CHANGELOG_POST.slug);
  if (i >= 0) POSTS[i] = generated.CHANGELOG_POST; else POSTS.push(generated.CHANGELOG_POST);
}
POSTS.sort((a, b) => String(b.date).localeCompare(String(a.date)));
/* 创作台删除的基础文章：site-data.js 的 deleted.posts 全局生效——
   文章集合、静态阅读版与站点地图都不再收录，旧的静态文件一并清掉 */
const DEAD_POSTS = ((overlay.STUDIO_DATA || {}).deleted || {}).posts || [];
if (DEAD_POSTS.length) {
  for (let i = POSTS.length - 1; i >= 0; i--) {
    if (DEAD_POSTS.includes(POSTS[i].slug)) POSTS.splice(i, 1);
  }
  const postsDir = path.join(ROOT, 'posts');
  DEAD_POSTS.forEach((slug) => {
    const f = path.join(postsDir, encodeURIComponent(slug) + '.html');
    if (fs.existsSync(f)) fs.rmSync(f);
  });
}

/* ---------- 静态文章镜像：无 JS 可读、爬虫可索引 ----------
   公式与代码块样式在 style.css 的 ZB-MATH 段里只维护一份，这里直接复用。 */
const styleCss = read('assets/style.css');
const MATH_A = '/* ZB-MATH:START */', MATH_B = '/* ZB-MATH:END */';
const ZB_MATH_CSS = (() => {
  const a = styleCss.indexOf(MATH_A), b = styleCss.indexOf(MATH_B);
  return a >= 0 && b > a ? styleCss.slice(a + MATH_A.length, b) : '';
})();
const MIRROR_CSS = `
:root{--ink:#39436a;--muted:#525d84;--line:#e5eaf7;--brand:#3f5c9c}
*{box-sizing:border-box}
body{margin:0;background:linear-gradient(160deg,#dceafb,#eae6fb 46%,#fdeef5);color:var(--ink);font:15.5px/1.9 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;min-height:100vh}
.wrap{max-width:860px;margin:0 auto;padding:36px 22px 70px}
.crumb{font-size:13px;color:var(--muted);margin:0 0 18px}
.crumb a{color:var(--brand);text-decoration:none}
article{background:rgba(255,255,255,.82);border:1px solid var(--line);border-radius:16px;padding:32px 36px;box-shadow:0 10px 30px rgba(112,138,190,.10)}
h1{font-size:27px;margin:0 0 8px;letter-spacing:.5px}
.meta{color:var(--muted);font-size:13px;margin:0 0 26px}
h2{font-size:22px;margin:34px 0 14px}
.zb-vl{border-left:3px solid transparent;border-image:linear-gradient(180deg,#7897dc,#ab8bd4,#e096bd) 1;padding-left:13px}
.zb-vl>:first-child{margin-top:0}.zb-vl>:last-child{margin-bottom:0}
h3{font-size:17px;margin:24px 0 10px}
p{margin:0 0 18px}
strong{color:var(--ink)}
code{background:#eef3ff;border-radius:5px;padding:1px 6px;font-size:13px}
pre{background:#eef3ff;border-radius:10px;padding:16px;overflow:auto;font-size:13px;line-height:1.7}
blockquote{margin:20px 0;padding:12px 18px;border-left:3px solid var(--brand);background:#eef3ff;border-radius:0 10px 10px 0}
table{width:100%;border-collapse:collapse;margin:22px 0;font-size:14px;background:rgba(255,255,255,.5)}
th,td{border:1px solid var(--line);padding:9px 12px;text-align:center}
th{background:#eef3ff}
ul,ol{padding-left:22px}
a{color:var(--brand)}
.back{margin:24px 0 0;font-size:14px}
@media (max-width:640px){.wrap{padding:20px 12px 48px}article{padding:22px 18px}h1{font-size:23px}}
${ZB_MATH_CSS}
`;
function mirrorHtml(p) {
  const url = ORIGIN + '/posts/' + encodeURIComponent(p.slug) + '.html';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)} · ${esc(SITE_TITLE)}</title>
<meta name="description" content="${esc(p.summary || '')}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(p.title)} · ${esc(SITE_TITLE)}">
<meta property="og:description" content="${esc(p.summary || '')}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/assets/og-card.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ORIGIN}/assets/og-card.jpg">
<meta property="article:published_time" content="${esc(p.date || '')}">
<link rel="stylesheet" href="../assets/interactions.css">
<style>${MIRROR_CSS}</style>
</head>
<body>
<div class="wrap">
<p class="crumb"><a href="/">${esc(SITE_TITLE)}</a> / 静态阅读版</p>
<article>
<h1>${esc(p.title)}</h1>
<p class="meta" data-view-post="${esc(p.slug)}">${esc(String(p.date || '').slice(0, 10))}${(p.tags || []).length ? ' · ' + (p.tags || []).map(esc).join(' / ') : ''} · <span class="mirror-likes"><span data-like-stat="post:${esc(p.slug)}">0</span> 次点赞</span> · <span class="mirror-views"><span data-view="${esc(p.slug)}">0</span> 次浏览（不含站长）</span></p>
<div class="body">${rehlHtml(p.markdown ? ZBMD.render(p.markdown) : (p.body || ''))}</div>
<section class="interactions" aria-label="互动区">
<div class="interactions-head"><span class="interactions-star" aria-hidden="true"><svg viewBox="0 0 100 100"><path d="M 44.3 14.0 Q 50.0 6.0 55.7 14.0 L 61.1 21.5 Q 65.9 28.2 73.7 30.6 L 82.5 33.4 Q 91.8 36.4 86.0 44.3 L 80.5 51.8 Q 75.7 58.3 75.7 66.5 L 75.8 75.8 Q 75.9 85.6 66.6 82.5 L 57.8 79.6 Q 50.0 77.0 42.2 79.6 L 33.4 82.5 Q 24.1 85.6 24.2 75.8 L 24.3 66.5 Q 24.3 58.3 19.5 51.8 L 14.0 44.3 Q 8.2 36.4 17.5 33.4 L 26.3 30.6 Q 34.1 28.2 38.9 21.5 Z"/></svg></span><div>
<h2>留言</h2><p>留言直接显示在这里，写在页面上、用 GitHub 账号确认发布；👍 点赞、在 Issue 下回复，留言会长期存档到本站仓库；无广告、无追踪。</p></div></div>
${INTERACTIONS_READY ? ZBArchive.composerHtml() : ''}
<div class="zb-slot" id="zb-slot"><div id="zb-live-host"></div>
<!-- ZB_ARCHIVE:BEGIN -->
${ZBArchive.render(ARCHIVE, String(p.slug), { empty: true, id: 'zb-archive' })}
<!-- ZB_ARCHIVE:END -->
<p class="zb-live-note" id="zb-live-note" hidden>实时同步暂不可用 · 已显示站内存档</p>
</div>
<p class="interactions-hint" id="interactions-hint" hidden></p>
${INTERACTIONS_READY ? `<div class="interactions-links"><a href="${esc(INTERACTIONS_CFG.issuesUrl)}" target="_blank" rel="noopener nofollow">留言仓库 ↗</a><span aria-hidden="true">·</span><a href="${esc(newIssueLink(String(p.slug)))}" target="_blank" rel="noopener nofollow">在 GitHub 写 ↗</a></div>` : ''}
</section>
</article>
<p class="back"><a href="/#/post/${encodeURIComponent(p.slug)}">在站点中打开 →</a></p>
</div>
<script src="../assets/comments-data.js"></script>
<script src="../assets/comment-archive.js"></script>
<script src="../assets/interactions-config.js"></script>
<script src="../assets/interactions.js"></script>
<script src="../assets/issues-live.js"></script>
<script src="../assets/likes.js"></script>
<script>window.ZBInteractions && window.ZBInteractions.mount(${JSON.stringify(String(p.slug))});
window.ZBLive && window.ZBLive.mount(${JSON.stringify(String(p.slug))});
window.ZBLikes && window.ZBLikes.mount();</script>
<script>/* 多语言代码标签组切换（与 markdown.js bindCodeTabs 同款委托，静态阅读版无 ZBMD 时兜底） */
document.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest)return;var b=t.closest('.zb-tab');if(!b)return;var bar=b.parentNode,box=bar&&bar.parentNode;if(!box)return;var k=b.getAttribute('data-zbtab');Array.prototype.forEach.call(box.children,function(el){if(!el||el.tagName!=='PRE')return;if(el.getAttribute('data-zbpre')===k)el.removeAttribute('hidden');else el.setAttribute('hidden','')});Array.prototype.forEach.call(bar.children,function(el){if(el.classList)el.classList.toggle('on',el===b)})});</script>
</body>
</html>
`;
}
const mirrorDir = path.join(ROOT, 'posts');
for (const f of fs.readdirSync(mirrorDir)) {
  if (f.endsWith('.html')) fs.unlinkSync(path.join(mirrorDir, f));
}
POSTS.forEach((p) => write('posts/' + encodeURIComponent(p.slug) + '.html', mirrorHtml(p)));

/* ---------- 路由静态镜像：把每个 SPA 分页预渲染成可索引的静态 HTML ----------
   hash 路由的页面原本只能被搜索引擎看到首页，分享到微信 / QQ 也只出首页卡片。
   这里用与 check.mjs 相同的 DOM 模拟让 app.js 在 Node 里真实跑一遍每个路由，
   抓取渲染结果静态化，分享卡片与 SEO 立刻补齐。 */
class El {
  constructor(tag) {
    this.tagName = tag || 'div'; this.innerHTML = ''; this.textContent = ''; this.className = '';
    this.value = '';
    this.style = { cssText: '', transform: '', setProperty() {} };
    this.attributes = {}; this.parentNode = null; this.children = []; this.handlers = {};
    const set = new Set();
    this.classList = {
      add: (x) => set.add(x), remove: (x) => set.delete(x), contains: (x) => set.has(x),
      toggle: (x, on) => { if (on === undefined) on = !set.has(x); on ? set.add(x) : set.delete(x); return on; }
    };
  }
}
El.prototype.appendChild = function (c) { this.children.push(c); c.parentNode = this; return c; };
El.prototype.removeChild = function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; };
El.prototype.insertBefore = function (n) { this.children.push(n); n.parentNode = this; return n; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.setAttribute = function (k, v) { this.attributes[k] = v; };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; };
El.prototype.addEventListener = function (t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); };
El.prototype.closest = function () { return null; };

/* 照片尺寸现读：创作台 v3.33 起上传时记录 w/h，更早入库的照片从仓库文件补读一次，
   照片墙竖版相册（is-v → 3:4）与首页横竖归卡在静态镜像里也能正确判定 */
function imgDims(file) {
  try {
    const buf = fs.readFileSync(file);
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50)
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd9)) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } catch (e) { /* 文件缺失按未知尺寸处理，横竖判定回落默认 */ }
  return null;
}

function captureRoutes() {
  const body = new El('body'), ids = {}, winHandlers = {};
  const get = (id) => { if (!ids[id]) { ids[id] = new El(); ids[id].parentNode = body; } return ids[id]; };
  const navNames = ['home', 'posts', 'post', 'tags', 'timeline', 'projects', 'photowall',
                    'moments', 'chatter', 'friends', 'about', 'settings'];
  const navAnchors = navNames.map((n) => { const a = new El('a'); a.setAttribute('data-nav', n); return a; });
  const document = {
    title: '', body, documentElement: { dataset: {}, scrollHeight: 2000 },
    getElementById: get, createElement: (t) => new El(t),
    querySelectorAll: (sel) => sel === '.nav a' ? navAnchors : [],
    querySelector: () => null, addEventListener: () => {}, dispatchEvent: () => true,
    execCommand: undefined
  };
  const store = {};
  const sandbox = {
    console, document, location: { hash: '', origin: ORIGIN, pathname: '/' },
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    sessionStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    matchMedia: () => ({ matches: false }),
    CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; },
    setTimeout: () => 0, setInterval: () => 0, requestAnimationFrame: () => 0,
    scrollTo: () => {}, innerHeight: 800, scrollY: 0, navigator: {},
    IntersectionObserver: function () { return { observe() {}, unobserve() {}, disconnect() {} }; },
    addEventListener: (t, fn) => { (winHandlers[t] = winHandlers[t] || []).push(fn); }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['assets/posts.js', 'assets/site-data.js', 'assets/changelog.js',
                   'assets/markdown.js', 'assets/studio.js', 'assets/app.js']) {
    vm.runInContext(read(f), sandbox, { filename: f });
    if (f === 'assets/site-data.js') {
      /* 在 app.js 启动快照之前把照片 w/h 补进站点数据 */
      ((sandbox.STUDIO_DATA || {}).albums || []).forEach((a) => (a.photos || []).forEach((p) => {
        if (p && p.src && !p.w && /^\/?assets\/photos\//.test(p.src)) {
          const d = imgDims(path.join(ROOT, p.src.replace(/^\//, '')));
          if (d) { p.w = d.w; p.h = d.h; }
        }
      }));
    }
  }
  const appEl = get('app');
  const fire = () => {
    for (const fn of winHandlers['hashchange'] || []) fn();
  };
  sandbox.location.hash = '';
  fire();
  const ROUTES = [
    ['projects', '项目', '计划中与完成中的项目记录'],
    ['timeline', '归档', '全部文章按时间排列的归档'],
    ['photowall', '照片墙', '定格时间，也定格当时的天色'],
    ['moments', '说说', '正文之外的瞬间与温度'],
    ['chatter', '杂谈', '长长短短的想法'],
    ['friends', '友链', '朋友们的站点'],
    ['tags', '标签', '按标签浏览全部文章'],
    ['about', '关于', '关于我与这个站点']
  ];
  const captured = {};
  for (const [name] of ROUTES) {
    sandbox.location.hash = '#/' + name;
    fire();
    captured[name] = {
      html: appEl.innerHTML,
      title: sandbox.document.title
    };
  }
  return { captured, routes: ROUTES };
}

const { captured: ROUTE_HTML, routes: ROUTES } = captureRoutes();
const MIRROR_FIX_CSS = `
body{margin:0;background:linear-gradient(160deg,#eaf3fd 0%,#f2ecfb 55%,#fdeef4 100%);color:#3a4668;
  font-family:system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}
.mirror-head{max-width:1080px;margin:0 auto;padding:26px 24px 0;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:baseline}
.mirror-head .brand{font-weight:700;font-size:19px;color:#3f5c9c;text-decoration:none}
.mirror-head a.mlink{color:#6b7ba0;text-decoration:none;font-size:13.5px}
.mirror-head a.mlink:hover{color:#3f5c9c}
.route-mirror{max-width:1080px;margin:0 auto;padding:18px 24px 60px}
.route-mirror .page-head,.route-mirror .section-head{max-width:none}
.mirror-foot{max-width:1080px;margin:0 auto;padding:0 24px 40px;color:#8a93ad;font-size:12.5px}
.mirror-foot a{color:#3f5c9c}
.reveal{opacity:1 !important;transform:none !important;transition:none !important}
img{max-width:100%}
`;
function routeMirrorHtml(name, label, sub, data) {
  const url = ORIGIN + '/' + name + '.html';
  const title = data.title || (label + ' · ' + SITE_TITLE);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(sub + ' —— ' + SITE_TITLE + ' 的' + label + '页面')}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_TITLE)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(sub)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/assets/og-card.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:image" content="${ORIGIN}/assets/og-card.jpg">
<link rel="stylesheet" href="assets/style.css">
<style>${MIRROR_FIX_CSS}</style>
${ZB_MATH_CSS ? '<style>' + ZB_MATH_CSS + '</style>' : ''}
</head>
<body>
<header class="mirror-head">
  <a class="brand" href="/">星梦Staream</a>
  <span>${ROUTES.map((r) => '<a class="mlink" href="' + r[0] + '.html">' + r[1] + '</a>').join(' · ')}</span>
  <span>${POSTS.map((p) => '<a class="mlink" href="posts/' + encodeURIComponent(p.slug) + '.html">' + esc(p.title) + '</a>').join(' · ')}</span>
</header>
<main class="route-mirror">
${data.html}
</main>
<footer class="mirror-foot">这是「${esc(SITE_TITLE)}」${esc(label)}页的静态镜像，完整交互（搜索、特效、夜间模式）请
<a href="/#/${name}">在站点中打开 →</a></footer>
<script>/* 多语言代码标签组切换（与 markdown.js bindCodeTabs 同款委托，静态镜像无 ZBMD 时兜底） */
document.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest)return;var b=t.closest('.zb-tab');if(!b)return;var bar=b.parentNode,box=bar&&bar.parentNode;if(!box)return;var k=b.getAttribute('data-zbtab');Array.prototype.forEach.call(box.children,function(el){if(!el||el.tagName!=='PRE')return;if(el.getAttribute('data-zbpre')===k)el.removeAttribute('hidden');else el.setAttribute('hidden','')});Array.prototype.forEach.call(bar.children,function(el){if(el.classList)el.classList.toggle('on',el===b)})});</script>
</body>
</html>
`;
}
for (const [name, label, sub] of ROUTES) {
  write(name + '.html', routeMirrorHtml(name, label, sub, ROUTE_HTML[name]));
}

/* ---------- 自定义 404 ---------- */
write('404.html', `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>页面不存在 · ${esc(SITE_TITLE)}</title>
<meta name="robots" content="noindex">
<style>${MIRROR_CSS}</style>
</head>
<body>
<div class="wrap">
<article>
<h1>页面不存在</h1>
<p class="meta">404 · 你要找的页面可能已被移动或删除</p>
<p>可以从下面的入口找回去：</p>
<ul>
  <li><a href="/">回到首页</a></li>
  <li><a href="/#/photowall">照片墙</a> · <a href="/#/moments">说说</a> · <a href="/#/chatter">杂谈</a> · <a href="/#/friends">友链</a></li>
  ${POSTS.map((p) => '<li><a href="posts/' + encodeURIComponent(p.slug) + '.html">' + esc(p.title) + '</a></li>').join('\n  ')}
</ul>
<p>也欢迎直接在首页顶部的搜索框里搜关键词。</p>
</article>
</div>
</body>
</html>
`);

/* ---------- Atom 订阅 feed.xml ---------- */
const AUTHOR = esc(String((loadWindowJs('assets/site-data.js').STUDIO_DATA || {}).author || SITE_TITLE));
const feedEntries = POSTS.map((p) => `  <entry>
    <title>${esc(p.title)}</title>
    <id>${ORIGIN}/posts/${encodeURIComponent(p.slug)}.html</id>
    <link rel="alternate" href="${ORIGIN}/posts/${encodeURIComponent(p.slug)}.html"/>
    <link rel="alternate" type="text/html" href="${ORIGIN}/#/post/${encodeURIComponent(p.slug)}"/>
    <updated>${esc(p.date || LOG_DATE)}T00:00:00Z</updated>
    <summary>${esc(p.summary || '')}</summary>
  </entry>`).join('\n');
write('feed.xml', `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(SITE_TITLE)}</title>
  <subtitle>一个关于算法、代码、建站与日常随想的纯静态个人博客</subtitle>
  <id>${ORIGIN}/</id>
  <link rel="self" href="${ORIGIN}/feed.xml"/>
  <link href="${ORIGIN}/"/>
  <updated>${LOG_DATE}T00:00:00Z</updated>
  <author><name>${AUTHOR}</name></author>
${feedEntries}
</feed>
`);

/* ---------- sitemap / robots ---------- */
const urls = [{ loc: ORIGIN + '/', lastmod: LOG_DATE }]
  .concat(POSTS.map((p) => ({ loc: ORIGIN + '/posts/' + encodeURIComponent(p.slug) + '.html', lastmod: p.date || LOG_DATE })))
  .concat(ROUTES.map(([name]) => ({ loc: ORIGIN + '/' + name + '.html', lastmod: LOG_DATE })))
  .concat([{ loc: ORIGIN + '/' + encodeURIComponent(HTML_REL), lastmod: LOG_DATE }]);
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => '  <url><loc>' + esc(u.loc) + '</loc><lastmod>' + u.lastmod + '</lastmod></url>').join('\n') +
  '\n</urlset>\n');
write('robots.txt', 'User-agent: *\nAllow: /\nSitemap: ' + ORIGIN + '/sitemap.xml\n');
write('CNAME', CUSTOM_DOMAIN + '\n');

/* ---------- index.html：noscript 兜底与 JSON-LD ---------- */
let index = read('index.html');
const noscript = `    <!-- NOSCRIPT:START -->
    <noscript><div class="noscript-card">
      <h1>${esc(SITE_TITLE)}</h1>
      <p>本站内容由浏览器脚本渲染，请开启 JavaScript 查看完整页面。下面是不依赖脚本的静态文章列表：</p>
      <ul>${POSTS.map((p) => '<li><a href="posts/' + encodeURIComponent(p.slug) + '.html">' + esc(p.title) + '</a> · ' + esc(p.date || '') + ' · ' + esc(p.summary || '') + '</li>').join('')}</ul>
      <p><a href="${encodeURIComponent(HTML_REL)}">博客版本日志（HTML 镜像）</a> · <a href="sitemap.xml">站点地图</a></p>
    </div></noscript>
    <!-- NOSCRIPT:END -->`;
index = index.replace(/    <!-- NOSCRIPT:START -->[\s\S]*?    <!-- NOSCRIPT:END -->/, noscript);
const ld = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: SITE_TITLE,
  url: ORIGIN + '/',
  description: '一个关于算法、代码、建站与日常随想的纯静态个人博客',
  inLanguage: 'zh-CN',
  blogPost: POSTS.map((p) => ({
    '@type': 'BlogPosting',
    headline: p.title,
    datePublished: p.date,
    description: p.summary || '',
    url: ORIGIN + '/posts/' + encodeURIComponent(p.slug) + '.html',
    mainEntityOfPage: ORIGIN + '/posts/' + encodeURIComponent(p.slug) + '.html'
  }))
};
const jsonld = '<!-- JSONLD:START -->\n<script type="application/ld+json">' +
  JSON.stringify(ld) + '</script>\n<!-- JSONLD:END -->';
index = index.replace(/<!-- JSONLD:START -->[\s\S]*?<!-- JSONLD:END -->/, jsonld);
/* RSS 自动发现：先清掉旧的（含历史重复），再插入唯一一条，保证构建幂等 */
index = index.replace(/<link rel="alternate" type="application\/atom\+xml"[^\n]*\n?/g, '');
index = index.replace('<link rel="canonical"',
  '<link rel="alternate" type="application/atom+xml" title="' + SITE_TITLE + '" href="' + ORIGIN + '/feed.xml">\n' +
  '<link rel="canonical"');
write('index.html', index);

console.log('生成完成：');
console.log('  ' + HTML_REL + '  (' + standalone.length + ' chars, ' + versions.length + ' 个版本)');
console.log('  assets/changelog.js  (文章日期 ' + LOG_DATE + ')');
console.log('  assets/comments-data.js  (' + Object.keys(ARCHIVE.posts).length + ' 篇文章的留言归档)');
console.log('  posts/*.html         (' + POSTS.length + ' 篇文章镜像，内嵌留言存档)');
console.log('  ' + ROUTES.map((r) => r[0]).join('/') + '.html  (' + ROUTES.length + ' 个分页静态镜像)');
console.log('  feed.xml / 404.html / sitemap.xml / robots.txt / index.html 兜底与结构化数据');
