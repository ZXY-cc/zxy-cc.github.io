/* 仓库内自动重建的入口（GitHub Actions 调用：node .github/scripts/build.mjs）。
 *
 * 实现只有 scripts/build.mjs 一份：这里只把站点根目录告诉它，然后加载。
 * 以前靠「两份文件逐字节相同」的约定同步，改一边忘另一边就会让线上镜像
 * 和本地分叉；现在只有一处可改，天然不会漂移。
 *
 * 因此 scripts/build.mjs 必须一起进部署仓库（同步脚本对顶层 scripts/ 只放行这一个文件），
 * 少了它这里 import 会直接 ERR_MODULE_NOT_FOUND，Actions 的重建步骤整步失败。
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));   // <repo>/.github/scripts
const root = path.resolve(here, '..', '..');                 // <repo>
process.env.ZB_ROOT = root;

await import(pathToFileURL(path.join(root, 'scripts', 'build.mjs')).href);
