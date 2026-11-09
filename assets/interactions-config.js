/* 星梦Staream · 互动区配置（唯一内容源）
 * 留言写入端 = 本站仓库的 GitHub Issues；点赞 = Issue / 评论自带的 👍 反应。
 * GitHub Actions 把公开留言同步成仓库内 JSON 归档并烘焙进静态文章页，
 * 页面本身零后端、零第三方请求；服务停用、换域名、十年后回看都能读到留言。
 */
window.ZB_INTERACTIONS = {
  repository: 'ZXY-cc/zxy-cc.github.io',
  issuesUrl: 'https://github.com/ZXY-cc/zxy-cc.github.io/issues',
  prefix: '留言 | ',
  pageSize: 20,
  /* 留空 = 发布即公开（站长可随时关闭或删除 Issue 下架）；
     填 '已公开' = 先审后发，只有带上同名标签的留言才会进入归档 */
  approvalLabel: '',
  /* 预填标题与说明，访客登录后直接发布；标题由同步脚本用来定位文章 */
  newIssueUrl: function (slug) {
    var title = '留言 | ' + String(slug || '');
    var body = '在这里写下想说的话…\n\n> 标题请勿修改。发布后会自动同步到文章页，通常几分钟内可见。';
    return 'https://github.com/ZXY-cc/zxy-cc.github.io/issues/new?title=' +
      encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  }
};
