/* 星梦Staream · 互动区配置（唯一开关）
 * 评论 / 回复 / 点赞计数由自建 Waline 服务承载，前端是本站原生 DOM，
 * 不再使用跨域 iframe。把部署好的服务地址填进 serverURL，重新跑一次
 * build.mjs 即可让 SPA 与静态阅读版同时启用；未填时显示接入中提示。
 */
window.ZB_INTERACTIONS = {
  serverURL: '',
  heart: 'https://zxy-blog.top/assets/heart.svg',
  discussionsUrl: 'https://github.com/ZXY-cc/zxy-cc.github.io/discussions'
};
