/* 星梦Staream · 扩展数据层
   posts.js 只负责 window.SITE / window.POSTS，永远不改动；
   本文件是唯一的「内容覆盖层」：内置示例数据 + 站长创作台发布的内容。
   studio.js 一键发布时整体重写本文件，因此这里保持纯 JSON 结构、无任何逻辑。 */

window.STUDIO_DATA = {
  "version": 1,
  "studioReset": "2026-11-10-a",
  "site": {
    "avatar": "assets/avatar.jpg",
    "author": "我",
    "displayName": "星梦Staream",
    "bio": "在算法、代码与一点随想之间慢慢走。近期正忙着把想法写下来，顺手给这片星空添几颗会发光的星星。",
    "tagline": "记录一些想法，和把它们弄明白的过程。",
    "founded": "2026-11-07",
    "intro": "<p>喜欢把事情拆开看清楚，再慢慢写下来。算法、代码、还有一点没什么用的随想，都放在这里。</p><p>这个站是纯静态的：没有数据库、没有统计脚本、不追踪任何人。几份 HTML、CSS、JavaScript 加一张头像，就能一直开下去。</p>",
    "skills": ["算法", "C / C++", "Python", "静态站点", "水彩与星空", "折腾"],
    "social": [
      { "name": "GitHub", "icon": "github", "url": "https://github.com/ZXY-cc", "note": "代码存放处" },
      { "name": "归档", "icon": "archive", "url": "#/timeline", "note": "全部记录" },
      { "name": "照片墙", "icon": "image", "url": "#/photowall", "note": "抬头看到的颜色" },
      { "name": "说说", "icon": "chat", "url": "#/moments", "note": "随手记的几句话" },
      { "name": "友链", "icon": "link", "url": "#/friends", "note": "常去的地方" },
      { "name": "关于", "icon": "star", "url": "#/about", "note": "关于这个站", "accent": true }
    ],
    "footerNote": "纯静态 · 无追踪 · 无依赖 · 有一点点星光"
  },
  "projects": [
    {
      "id": "p-paper",
      "name": "星梦Staream · 静态博客",
      "desc": "零依赖的单页博客：hash 路由、玻璃星空、日夜主题、全局搜索与照片灯箱，托管在 GitHub Pages 上，绑自己的域名。",
      "tags": ["静态站点", "CSS", "JavaScript"],
      "status": "在用",
      "date": "2026-11-07",
      "link": "#/about"
    },
    {
      "id": "p-path",
      "name": "中垂线引路算法实验台",
      "desc": "批量生成平面图，对比 PB-Path 与 PB-Full 的路径比上界、时间开销和适用边界，把结论整理成可复现的实验记录。",
      "tags": ["算法", "Python", "实验"],
      "status": "研究中",
      "date": "2026-11-03",
      "link": "#/timeline"
    },
    {
      "id": "p-sort",
      "name": "基础排序对照笔记",
      "desc": "把冒泡、插入、选择、计数、基数五种排序的性质放进同一张表，并给一份能直接编译的 C 实现。",
      "tags": ["C", "笔记"],
      "status": "已完成",
      "date": "2026-11-05",
      "link": "#/post/sorting-notes"
    }
  ],
  "albums": [
    {
      "id": "a-sky",
      "title": "晴空与云",
      "date": "2026-11-07",
      "desc": "抬头的时候刚好是那种很淡的蓝。",
      "cover": "assets/photos/sky-cloud.svg",
      "photos": [
        { "src": "assets/photos/sky-cloud.svg", "title": "淡蓝", "note": "云被光推开了一点" },
        { "src": "assets/photos/morning-blue.svg", "title": "清晨", "note": "还没完全醒过来的天色" },
        { "src": "assets/photos/gold-haze.svg", "title": "午后的雾", "note": "蜜金色的光化在空气里" }
      ]
    },
    {
      "id": "a-sakura",
      "title": "樱色黄昏",
      "date": "2026-11-05",
      "desc": "粉和紫交界的那一小段时间。",
      "cover": "assets/photos/sakura-dusk.svg",
      "photos": [
        { "src": "assets/photos/sakura-dusk.svg", "title": "黄昏", "note": "整片天都软下来了" },
        { "src": "assets/photos/violet-tide.svg", "title": "紫色的潮", "note": "颜色慢慢漫过山脊" }
      ]
    },
    {
      "id": "a-night",
      "title": "夜航星",
      "date": "2026-10-28",
      "desc": "留一盏不太亮的灯给夜里的路。",
      "cover": "assets/photos/night-voyage.svg",
      "photos": [
        { "src": "assets/photos/night-voyage.svg", "title": "星夜", "note": "蓝调的深空里有一点暖黄" }
      ]
    }
  ],
  "moments": [
    {
      "id": "m-1",
      "date": "2026-11-07",
      "text": "把博客的导航补齐了。以前只有文章、标签、关于三个入口，现在终于像个小站了。",
      "mood": "✨ 满足",
      "place": "书桌前",
      "images": [],
      "likes": 0
    },
    {
      "id": "m-2",
      "date": "2026-11-06",
      "text": "给星星加了固定的初始朝向，之后就只慢慢飘、不再转。盯着看了十分钟，什么也没干。",
      "mood": "🌙 放空",
      "place": "窗边",
      "images": ["assets/photos/night-voyage.svg"],
      "likes": 0
    },
    {
      "id": "m-3",
      "date": "2026-11-05",
      "text": "排序那篇写完，发现表格比正文更有用。有些东西本来就该并排放着看。",
      "mood": "📝 记录",
      "place": "图书馆",
      "images": [],
      "likes": 0
    },
    {
      "id": "m-4",
      "date": "2026-10-28",
      "text": "域名解析生效的那一刻，比想象中安静。刷新一下，就是自己的地址了。",
      "mood": "🌤 晴天",
      "place": "家里",
      "images": ["assets/photos/morning-blue.svg"],
      "likes": 0
    }
  ],
  "chatter": [
    {
      "id": "c-1",
      "date": "2026-11-07",
      "title": "关于「先写出来」这件事",
      "summary": "草稿可以很丑，只要它存在。",
      "tags": ["随笔", "写作"],
      "mood": "🌸 平静",
      "body": "<p>一直有个坏习惯：想等把一件事彻底想清楚再动笔。结果就是脑子里堆着很多半成品，真正落到纸上的没几篇。</p><p>后来发现顺序反了。写下来不是最后一步，而是把想法摊开、看清哪里还缺一块的那一步。草稿丑一点没关系，只要它存在，就有得改。</p><blockquote><p>先写出来，再写清楚。</p></blockquote>"
    },
    {
      "id": "c-2",
      "date": "2026-11-04",
      "title": "夜里改 CSS 的一点记录",
      "summary": "玻璃太厚会挡住天空，雾太大又会糊住字。",
      "tags": ["建站", "CSS"],
      "mood": "✨ 折腾",
      "body": "<p>今晚主要在处理一件事：玻璃面板的通透感。模糊半径调大之后，背景的水彩全被磨平了，字也跟着发虚。</p><p>最后的做法是把大面积模糊全部去掉，改成烘焙好的渐变；只给几块主面板留很浅的背景采样。看起来几乎没变，但滚动的时候顺了很多。</p><p>视觉和性能偶尔是可以同时要的，前提是先找到真正在吃帧的那一层。</p>"
    },
    {
      "id": "c-3",
      "date": "2026-10-29",
      "title": "为什么还是选了静态站",
      "summary": "少一层要维护的东西，就多一分长期开下去的可能。",
      "tags": ["建站", "随笔"],
      "mood": "🌤 清楚",
      "body": "<p>搭站的时候考虑过带后台的方案，最后还是回到几个纯静态文件。理由很朴素：不想三年后回来发现服务要迁移、数据库要升级、证书要重新签。</p><p>文章就写在一份数据文件里，改完推上去就是发布。没有评论、没有统计，也没有需要照看的东西。这样的小站大概能安静地放很久。</p>"
    }
  ],
  "friends": [
    {
      "id": "fr-oiwiki",
      "name": "OI Wiki",
      "desc": "算法与竞赛知识的公共笔记，写排序那篇时翻了很多次。",
      "url": "https://oi-wiki.org/",
      "status": "常去",
      "initial": "OI"
    },
    {
      "id": "fr-mdn",
      "name": "MDN Web Docs",
      "desc": "前端查询手册，CSS 和浏览器行为基本以这里为准。",
      "url": "https://developer.mozilla.org/",
      "status": "常去",
      "initial": "MD"
    },
    {
      "id": "fr-arxiv",
      "name": "arXiv",
      "desc": "论文预印本，偶尔来这里看看别人把问题写成了什么样。",
      "url": "https://arxiv.org/",
      "status": "常去",
      "initial": "aX"
    },
    {
      "id": "fr-github",
      "name": "GitHub",
      "desc": "代码与站点都放在这里，也是这个博客的托管方。",
      "url": "https://github.com/ZXY-cc",
      "status": "常去",
      "initial": "GH"
    }
  ],
  "posts": []
};
