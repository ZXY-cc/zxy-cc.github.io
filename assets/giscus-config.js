/* 星梦Staream · giscus 配置
 * 评论区由 GitHub Discussions 承载：访客用 GitHub 账号登录后可评论、回复、加表情回应，
 * 数据全部存在自己的仓库里，站点本身零数据库、零后端。
 *
 * 启用前置条件（在 GitHub 网页上操作一次）：
 *   1. 仓库 Settings → Features 勾选 Discussions；
 *   2. 安装 https://github.com/apps/giscus 并授权到本仓库。
 * 分类用 General（开放式讨论）：Announcements 仅维护者可建讨论，会让访客首条评论卡住。
 * 未填 categoryId 时评论区整块不渲染。
 */
window.ZB_GISCUS = {
  repo: 'ZXY-cc/zxy-cc.github.io',
  repoId: 'R_kgDOVmJRnA',
  category: 'General',
  categoryId: 'DIC_kwDOVmJRnM4DKts3',
  discussionsUrl: 'https://github.com/ZXY-cc/zxy-cc.github.io/discussions',
  themeDay: 'https://zxy-blog.top/assets/giscus-day.css',
  themeNight: 'https://zxy-blog.top/assets/giscus-night.css'
};
