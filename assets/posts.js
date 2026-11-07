window.SITE = {
  title: "纸上留白",
  tagline: "记录一些想法，和把它们弄明白的过程。",
  author: "我",
  since: "2026",
  about: "<p>这里是我的个人博客。写点技术笔记、算法整理，也写点没什么用的随想。</p><p>站点是纯静态的：没有数据库、没有评论系统、没有统计脚本，只有几个 HTML、CSS 和 JavaScript 文件。写新文章时，只要在这个文件里追加一条记录，推上去就发布了。</p><p>如果你也想搭一个，第一篇文章里写了完整做法。</p>"
};

window.POSTS = [
  {
    slug: "free-blog",
    title: "零成本搭一个自己的博客",
    date: "2026-11-07",
    reading: "约 6 分钟",
    tags: ["建站", "笔记"],
    summary: "域名、证书、托管这三件事各管什么，以及一条最省事的上线路径。",
    body: [
      "<p>想拥有一个自己的博客，其实只需要解决三个问题：别人怎么找到你、内容放在哪、以及浏览器地址栏里那把小锁。这三件事分别对应域名、托管和证书，彼此独立，可以分开选。</p>",
      "<h2>三条信息，三层链路</h2>",
      "<table><thead><tr><th>环节</th><th>可选服务</th><th>要做的事</th></tr></thead><tbody>",
      "<tr><td>免费域名</td><td>dpdns.org</td><td>申请一个 you.dpdns.org</td></tr>",
      "<tr><td>解析与证书</td><td>Cloudflare / 平台自带</td><td>加解析记录，勾强制 HTTPS</td></tr>",
      "<tr><td>网站托管</td><td>GitHub Pages / Cloudflare Pages</td><td>上传静态文件</td></tr>",
      "</tbody></table>",
      "<p>dpdns.org 来自 DigitalPlat FreeDomain，是一个免费二级域名服务。注册后你会拿到形如 <code>you.dpdns.org</code> 的地址，并且拥有完整的 DNS 控制权，可以自己添加 A、CNAME、TXT 记录，也可以把 NS 委派给 Cloudflare。每个账号的免费名额有限，长期闲置或违规会被回收，所以它适合练手和个人站点，不适合承载重要业务。</p>",
      "<blockquote><p>一个常见误解：以为要单独去申请一张免费证书。其实不用。GitHub Pages 通过 Let's Encrypt 自动签发，Cloudflare Pages 用 Universal SSL，两者都会自动续期，你要做的只是把 DNS 指对，然后勾选强制 HTTPS。</p></blockquote>",
      "<h2>最省事的一条路径</h2>",
      "<ol>",
      "<li>在 DigitalPlat 控制台注册域名，委派模式选「DigitalPlat DNS」（默认且标了推荐），解析记录就在这个面板里加，先不必迁到 Cloudflare。</li>",
      "<li>把博客文件推到 GitHub 仓库，在 Settings → Pages 里选择从 main 分支根目录部署。此时已经能用 <code>username.github.io</code> 访问了。</li>",
      "<li>回到域名控制台添加解析记录。注意 <code>you.dpdns.org</code> 是这个区域的根，标准 DNS 不允许在根上放 CNAME：</li>",
      "</ol>",
      "<pre><code>方案 A：不带 www，给根域加 4 条 A 记录\nA  you.dpdns.org  185.199.108.153\nA  you.dpdns.org  185.199.109.153\nA  you.dpdns.org  185.199.110.153\nA  you.dpdns.org  185.199.111.153\n\n方案 B：用 www，只加一条 CNAME\nCNAME  www.you.dpdns.org  username.github.io</code></pre>",
      "<p>然后在仓库的 Pages 设置里填入对应的域名并保存。DNS 生效后勾选 <strong>Enforce HTTPS</strong>，证书最多需要一天左右签发完成，之后就是一条带小锁的正式地址。</p>",
      "<h2>如果用 Cloudflare Pages</h2>",
      "<p>子域名不必把 NS 迁到 Cloudflare，直接在 Pages 项目的 Custom domains 里发起添加，再去域名控制台按提示补一条 CNAME 指向 <code>xxx.pages.dev</code> 即可。注意顺序不能反：只在 DNS 里手写 CNAME、而不在 Pages 后台登记域名，会得到 522 错误。CF Pages 只提供 CNAME 目标，所以走 <code>www.you.dpdns.org</code> 这类子域最省事；只有绑裸域（apex）才必须把 NS 托管到 Cloudflare。</p>",
      "<h2>几个值得记住的坑</h2>",
      "<ul>",
      "<li>根域不能放 CNAME。想直接用 <code>you.dpdns.org</code> 就得用 A 记录，CNAME 只能给 <code>www</code> 这类子域用。</li>",
      "<li>委派模式选「外部名称服务器」时，得先在外部 DNS 建好区域、拿到 NS 主机名再提交注册；而 <code>dpdns.org</code> 是子域，Cloudflare 免费版只接受可注册根域作为区域，容易卡在这一步。</li>",
      "<li>把 GitHub Pages 套在 Cloudflare 代理后面时，DNS 记录先设为「仅 DNS」（灰云），否则 Let's Encrypt 的验证容易失败；证书签发后再考虑开代理。</li>",
      "<li>免费域名随时可能调整政策，重要内容要留有迁移方案：DNS 记录导出一份，随时能换到付费域名。</li>",
      "<li>静态博客不需要构建工具。三个文件加一份文章数据，就能直接拖进托管平台。</li>",
      "</ul>",
      "<hr>",
      "<p>写到这里，这个站本身也是这么搭起来的。剩下的问题只有一个：下一篇写什么。</p>"
    ].join("")
  },
  {
    slug: "sorting-notes",
    title: "排序算法笔记：从冒泡到基数",
    date: "2026-11-05",
    reading: "约 4 分钟",
    tags: ["算法", "C"],
    summary: "把几种基础排序的性质放在一起对照，顺便留一份能直接编译的 C 实现。",
    body: [
      "<p>排序算法大概是所有人最早接触的一组算法。它们的思路差别很大，但放在一起对照时，最容易记住的反而不是代码，而是「什么时候该用哪一个」。</p>",
      "<h2>性质对照</h2>",
      "<table><thead><tr><th>算法</th><th>平均时间</th><th>最坏时间</th><th>空间</th><th>稳定性</th></tr></thead><tbody>",
      "<tr><td>冒泡排序</td><td>O(n²)</td><td>O(n²)</td><td>O(1)</td><td>稳定</td></tr>",
      "<tr><td>插入排序</td><td>O(n²)</td><td>O(n²)</td><td>O(1)</td><td>稳定</td></tr>",
      "<tr><td>选择排序</td><td>O(n²)</td><td>O(n²)</td><td>O(1)</td><td>不稳定</td></tr>",
      "<tr><td>计数排序</td><td>O(n + w)</td><td>O(n + w)</td><td>O(w)</td><td>稳定</td></tr>",
      "<tr><td>基数排序</td><td>O(d(n + k))</td><td>O(d(n + k))</td><td>O(n + k)</td><td>稳定</td></tr>",
      "</tbody></table>",
      "<p>表中 <code>n</code> 是元素个数，<code>w</code> 是值域大小，<code>k</code> 是每一位可能的取值数，<code>d</code> 是位数。前三种基于比较，逃脱不了 <code>O(n log n)</code> 的下界；后两种不比较元素大小，用空间换时间，在特定条件下能做得更快。</p>",
      "<h2>冒泡排序的 C 实现</h2>",
      "<p>相邻元素两两比较，把较大的一路交换到末尾。加一个「本轮是否发生过交换」的标志，可以在已经有序时提前结束。</p>",
      "<pre><code>#include &lt;stdio.h&gt;\n\nvoid bubble_sort(int a[], int n) {\n    for (int i = 0; i &lt; n - 1; i++) {\n        int swapped = 0;\n        for (int j = 0; j &lt; n - 1 - i; j++) {\n            if (a[j] &gt; a[j + 1]) {\n                int t = a[j];\n                a[j] = a[j + 1];\n                a[j + 1] = t;\n                swapped = 1;\n            }\n        }\n        if (!swapped) break;\n    }\n}\n\nint main(void) {\n    int a[] = {5, 2, 9, 1, 5, 6};\n    int n = sizeof(a) / sizeof(a[0]);\n    bubble_sort(a, n);\n    for (int i = 0; i &lt; n; i++) printf(\"%d \", a[i]);\n    return 0;\n}</code></pre>",
      "<h2>什么时候值得用</h2>",
      "<p>数据规模很小或者基本有序时，插入排序常数最小，实际跑得比复杂算法快；值域是有限的小整数时，计数排序几乎是线性的；关键字能按位拆分（比如定长整数、日期字符串）时，基数排序很合适，但它要求每一位的排序本身是稳定的。</p>",
      "<p>至于冒泡排序，它现在的主要价值是教学：用最直观的方式说明「一次遍历能确定一个最终位置」这件事。</p>"
    ].join("")
  },
  {
    slug: "why-write",
    title: "为什么要写下来",
    date: "2026-10-28",
    reading: "约 2 分钟",
    tags: ["随笔"],
    summary: "脑子里的「我懂了」，和能让别人看懂的「我懂了」，中间隔着一次输出。",
    body: [
      "<p>有个很常见的错觉：读完之后觉得自己懂了。直到要给别人讲一遍，才发现中间有好几处是含糊带过的——那些地方平时不会被注意到，因为脑子会自动把它们补圆。</p>",
      "<p>写下来就是把这种自动补全关掉。你得给每个判断找到依据，得决定先说哪句后说哪句，得承认某处其实还没想清楚。这个过程不太舒服，但也只有这个过程能把「熟悉」变成「理解」。</p>",
      "<p>另一个好处是时间维度上的。笔记写完放在那里，三个月后回来看，会同时看到当初的思路和现在的想法，两者的差就是这段时间走过的距离。这种反馈很难从别的地方得到。</p>",
      "<blockquote><p>不必写得多好，只要写得比「我懂了」这三个字更具体一点就够了。</p></blockquote>",
      "<p>所以这个站就先这样开起来。文章不会很多，但尽量每篇都写清楚一件事。</p>"
    ].join("")
  }
];
