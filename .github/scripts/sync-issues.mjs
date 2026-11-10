/* 星梦Staream · 留言归档同步（零依赖，Node 20+）
 * 用法：node .github/scripts/sync-issues.mjs
 *
 * 评论的唯一写入端是本站仓库的 GitHub Issues：访客在页面内输入框写好内容 →
 * 打开预填好的新建 Issue 页 → 登录后发布。本脚本把公开留言、回复与 GitHub 自带 👍 反应拉回来，
 * 写成随仓库版本化的纯文本归档，并直接刷新每篇静态阅读版里的留言区块。
 *
 * 数据双份留存：GitHub Issues（可删/改/关/审核）+ 仓库 JSON 与静态 HTML（无 JS 可读）。
 * 全程只使用 GitHub 自带的 GITHUB_TOKEN，不需要常驻服务、不需要数据库、不需要付费托管。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const ZBArchive = require(path.join(ROOT, 'assets/comment-archive.js'));
const API = process.env.ZB_API_BASE || 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN || process.env.ZB_TOKEN || '';
const BEGIN = '<!-- ZB_ARCHIVE:BEGIN -->';
const END = '<!-- ZB_ARCHIVE:END -->';

const Cfg = (() => {
  const box = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'assets/interactions-config.js'), 'utf8'), box);
  return box.window.ZB_INTERACTIONS || {};
})();
const REPO = process.env.GITHUB_REPOSITORY || Cfg.repository;
if (!REPO || !/^[\w.-]+\/[\w.-]+$/.test(REPO)) throw new Error('仓库标识不正确：' + REPO);

const headers = {
  'accept': 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'zb-comment-archive'
};
if (TOKEN) headers.authorization = 'Bearer ' + TOKEN;

async function api(p) {
  const r = await fetch(API + p, { headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('GitHub API ' + r.status + '：' + p);
  return r.json();
}
async function pages(base) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const join = base.includes('?') ? '&' : '?';
    const rows = await api(base + join + 'per_page=100&page=' + page);
    if (!Array.isArray(rows)) break;
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}
/* 归档保留留言的 Markdown 原文：Markdown 本身就是可读纯文本，十年后换渲染器、
   换域名、换服务也读得懂；显示端与浏览器实时层共用同一份 mdPreview 渲染规则 */
const mdRaw = ZBArchive.mdRaw;
function plusOne(x) {
  const n = x && x.reactions && Number(x.reactions['+1']);
  return Number.isFinite(n) ? n : 0;
}
function actor(u) {
  return { nick: (u && u.login) || '匿名', link: (u && u.html_url) || '' };
}
function safeSlug(s) {
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : '';
}

/* 只有静态阅读版里存在的文章才接收留言，避免标题被改后污染归档 */
/* 先审后发：配置 approvalLabel 后，只有带该标签的留言才进归档；
   关闭 / 删除 / 移除标签的 Issue 会在下次同步后自动从文章页消失。 */
const APPROVAL = String(Cfg.approvalLabel || '').trim();
const approved = (it) => !APPROVAL || (Array.isArray(it.labels) &&
  it.labels.some((l) => String((l && (l.name || l)) || '') === APPROVAL));

const postDir = path.join(ROOT, 'posts');
const known = new Set(fs.readdirSync(postDir)
  .filter((f) => f.endsWith('.html'))
  .map((f) => { try { return decodeURIComponent(f.slice(0, -5)); } catch (e) { return ''; } })
  .filter(Boolean));

const posts = {};
const issues = await pages('/repos/' + REPO + '/issues?state=open&sort=created&direction=asc');
for (const it of issues) {
  if (it.pull_request || !approved(it)) continue;
  const m = String(it.title || '').match(/^留言\s*\|\s*([^\s|]+)\s*$/);
  const slug = m && safeSlug(m[1]);
  if (!slug || !known.has(slug)) continue;
  const entry = posts[slug] || (posts[slug] = { likes: 0, comments: [] });
  const who = actor(it.user);
  const rootId = 'i' + it.number;
  entry.likes += plusOne(it);
  entry.comments.push({
    id: rootId, root: '', parent: '',
    nick: who.nick, link: who.link,
    content: mdRaw(it.body), date: String(it.created_at || '').slice(0, 10),
    likes: plusOne(it), url: it.html_url || ''
  });
  const replies = await pages('/repos/' + REPO + '/issues/' + it.number + '/comments');
  for (const c of replies) {
    const u = actor(c.user);
    const likes = plusOne(c);
    entry.likes += likes;
    entry.comments.push({
      id: 'c' + c.id, root: rootId, parent: rootId,
      nick: u.nick, link: u.link,
      content: mdRaw(c.body), date: String(c.created_at || '').slice(0, 10),
      likes: likes, url: c.html_url || ''
    });
  }
}
for (const slug of Object.keys(posts)) posts[slug].comments.sort((a, b) =>
  String(a.date).localeCompare(String(b.date)));

const data = {
  schema: 2,
  source: 'github-issues',
  repository: REPO,
  updatedAt: new Date().toISOString(),
  pageSize: Number(Cfg.pageSize) > 0 ? Number(Cfg.pageSize) : 20,
  posts
};
const write = (f, s) => {
  const p = path.join(ROOT, f);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, String(s).replace(/\r\n/g, '\n'), 'utf8');
};
write('data/comments.json', JSON.stringify(data, null, 2) + '\n');
write('assets/comments-data.js',
  '/* 由 data/comments.json 生成，勿手改 */\n' +
  'window.ZB_COMMENTS = ' + JSON.stringify(data).replace(/</g, '\\u003c') + ';\n');

/* 静态阅读版无需 JS 也能读到最新留言：只替换标记之间的归档区块 */
let touched = 0;
for (const f of fs.readdirSync(postDir)) {
  if (!f.endsWith('.html')) continue;
  const p = path.join(postDir, f);
  let html = fs.readFileSync(p, 'utf8');
  const a = html.indexOf(BEGIN), b = html.indexOf(END, a + BEGIN.length);
  if (a < 0 || b < 0) continue;
  let slug = '';
  try { slug = decodeURIComponent(f.slice(0, -5)); } catch (e) { continue; }
  const next = html.slice(0, a + BEGIN.length) + '\n' +
    ZBArchive.render(data, slug, { empty: true, id: 'zb-archive' }) + '\n' + html.slice(b);
  if (next !== html) { fs.writeFileSync(p, next.replace(/\r\n/g, '\n'), 'utf8'); touched++; }
}
console.log('留言归档已同步：' + Object.keys(posts).length + ' 篇文章 / ' +
  Object.values(posts).reduce((n, x) => n + x.comments.length, 0) +
  ' 条留言 / ' + touched + ' 个静态页');
