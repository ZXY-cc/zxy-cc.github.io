/* 星梦Staream · 互动区配置（唯一内容源）
 * 留言写入端 = 本站仓库的 GitHub Issues；点赞 = Issue / 评论自带的 👍 反应。
 * 页面直接读取公开 Issues 把留言渲染进评论区，发布后刷新即可看到；
 * GitHub Actions 再把公开留言同步成仓库内 JSON 并烘焙进静态文章页，
 * 读不到实时数据时自动沿用这份归档：服务停用、换域名、十年后回看都能读到留言。
 * live:false 可切回纯归档（页面零网络请求）。
 */
window.ZB_INTERACTIONS = {
  repository: 'ZXY-cc/zxy-cc.github.io',
  issuesUrl: 'https://github.com/ZXY-cc/zxy-cc.github.io/issues',
  prefix: '留言 | ',
  pageSize: 20,
  /* 实时读取：评论区进入视口才请求，结果缓存 2 分钟，最多补拉 8 组回复 */
  live: true,
  apiBase: 'https://api.github.com',
  cacheSeconds: 120,
  maxReplyFetches: 8,
  timeoutMs: 5000,
  /* 留空 = 发布即公开（站长可随时关闭或删除 Issue 下架）；
     填 '已公开' = 先审后发，只有带上同名标签的留言才会进入归档 */
  approvalLabel: '',
  /* 页面内输入框写好的正文直接预填进新建 Issue；标题由同步脚本用来定位文章。
     不带 body 时打开空白新建页，访客自己填写。 */
  newIssueUrl: function (slug, body) {
    var url = 'https://github.com/ZXY-cc/zxy-cc.github.io/issues/new?title=' +
      encodeURIComponent('留言 | ' + String(slug || ''));
    var text = String(body == null ? '' : body).trim();
    if (text) url += '&body=' + encodeURIComponent(text);
    return url;
  }
};
