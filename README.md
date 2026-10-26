# 巴商相册

适合 iPhone Safari 的 React + TypeScript + Vite PWA。默认无需服务器、账号、数据库服务或付费 API。图片记录、文案及原始图片字节保存在当前浏览器的 IndexedDB，不会自动上传图片。可选云端收件箱需单独部署，见文末说明。

## 本地运行

需要 Node.js 22.12+（或 20.19+）与 npm。

```bash
npm ci
npm run dev
```

打开终端显示的地址。桌面 localhost 可使用剪贴板和 Service Worker；iPhone 访问局域网 HTTP 地址不能完整测试这些能力，应使用 HTTPS 部署。

```bash
npm test           # 草稿、文案、搜索、图片排序、IndexedDB 测试
npm run build      # TypeScript 检查 + 生产构建 + PWA 预缓存
npm run preview    # 预览 dist
npm run format:check # 代码格式检查
npm run test:e2e   # 首次先运行 npx playwright install chromium webkit
```

## 使用

1. 点击「新建记录」，从相册一次选择多张商品图片，每份记录最多 9 张；支持删除及左右按钮排序。单张上限 25MB，无法解码的 HEIC 图片需先转成 JPEG/PNG。原图不压缩。
2. 直接输入或粘贴朋友圈文案，点击「保存记录」。不需要填写商品信息；允许仅图片或仅文案，不能保存完全空白的记录。不会自动生成或补写文案。
3. 相册中可按文案或图片文件名搜索、打开编辑、创建副本及删除。卡片标题取文案首行，不需要另填名称。
4. 文案区可一键复制；图片区可通过系统分享菜单分享或导出按顺序编号的 ZIP。ZIP 可在「文件」中解压后存入相册。
5. 编辑不会自动保存，退出时会提示未保存修改；iOS 强制关闭仍可能丢失未保存内容。

当前界面只包含图片和文案，没有商品字段、自动生成文案、发布准备或待发布/已发布状态管理。

旧版兼容：仍使用原 IndexedDB 名称 `moments-publisher`、版本 `1` 和 `drafts` store。旧记录的图片与文案直接可用；编辑保存时保留原商品字段及状态作为兼容数据，不展示、不校验、不用于搜索，也不清理历史记录。数据库不重置，已有文案不会被重新生成。图片继续采用 Safari 兼容的 ArrayBuffer 写入，保存前完成文件读取，事务提交后才提示成功。

## 一键分享准备（半自动）

编辑页的「一键分享准备」会在同一次点击中请求复制当前文案并打开图片系统分享菜单。图片按照当前排序编号，只向分享菜单传图片，不混入文字文件。请在 iPhone 菜单中选择「存储图像」（不同 iOS/文件类型可能显示不同名称或不提供此操作），手动确认后再打开微信朋友圈选图并粘贴文案。

Safari 网页没有静默写入相册的权限，不能自动确认图片已保存，也不能自动打开或发布微信朋友圈。菜单关闭、取消与保存成功不是同一件事。已复制的文案在取消图片分享后仍可粘贴；复制可能因权限或系统限制失败，界面会提示单独点击「复制朋友圈文案」重试或长按复制。不支持图片分享或分享失败时，仍可单独「分享图片」或导出 ZIP，在「文件」中解压后存入相册。

为保留 Safari 的点击授权，剪贴板和分享调用前不会异步保存记录、读取图片或等待另一个操作完成。即便如此，不同 iOS 版本也可能不允许两个操作都成功，因此保留单独按钮。仅有文案时只复制，只有图片时只打开分享；完全空白时按钮禁用。分享准备不会自动保存当前编辑，请先保存重要修改。

自动化用模拟系统接口验证同次点击调用顺序、多图顺序、取消/拒绝/不支持时提示和数据保留；真实系统分享菜单的「存储图像」、照片权限及微信粘贴仍需在 iPhone 上验收。WebKit 自动化不能证明系统相册已写入。

## iPhone 安装与离线

使用 Safari 打开 HTTPS 网站 → 底部「分享」→「添加到主屏幕」。已提供 manifest、192/512px 图标、Apple Touch 图标、独立窗口和安全区适配。首次联网加载成功、Service Worker 激活后，可离线打开和管理已保存草稿。新版本在关闭现有应用窗口、重新打开后加载。

剪贴板和文件分享需 HTTPS 与用户点击触发。无法自动复制时会选中文案，请长按复制；不支持文件分享时使用 ZIP 导出。分享取消不会改动记录。

## GitHub Pages 自动部署

生产路径固定为 `/moments-publisher/`（`vite.config.ts`），开发和预览也使用这个子路径。manifest 的启动地址、应用范围、Service Worker 范围、离线回退页及图标均位于该路径。`index.html` 的 Apple Touch 图标通过 `%BASE_URL%` 跟随配置，构建后的 JS/CSS 也使用该前缀。

预期访问网址：**https://edchomerain-pixel.github.io/moments-publisher/**（请保留末尾斜杠）。

部署步骤：

1. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**（已设置时无需重复操作）。
2. 审核并将本部署 PR 合并到 `main`。
3. `main` 更新会自动触发 **Deploy to GitHub Pages**，依次执行 `npm ci`、格式检查、单元测试、构建，然后上传 `dist/` 并发布。也可在 Actions 中选择该工作流 → **Run workflow** → 选择 `main` 手动部署。
4. 等待 `build` 和 `deploy` 均成功，在 `github-pages` 环境或工作流部署摘要中打开网站。如果该环境配置了审核人，需要批准部署任务。
5. 在 iPhone Safari 打开上述 HTTPS 地址，确认图片与文案编辑、离线重开正常，再通过分享菜单添加到主屏幕。

工作流使用 GitHub 官方 `configure-pages@v5`、`upload-pages-artifact@v3`、`deploy-pages@v4`。构建仅需 `contents: read` 与 `pages: read`；部署任务使用 `pages: write` 和 `id-token: write`，发布到 `github-pages` 环境，不需要自建 Token 或付费服务。部署只允许 `main`，PR 与开发分支不会发布。并发部署排队，避免中断已开始的发布。

本地验证：

```bash
npm ci
npm run build
npm test
npm run preview
# 打开 http://localhost:4173/moments-publisher/
npm run test:e2e
```

浏览器测试以同一子路径运行，检查 manifest、JS/CSS、图标、Service Worker 资源均可访问，验证缓存范围及断网重载；CI 同时验证 Chromium 和 WebKit。若改用其他域名根目录或仓库名，需要同步调整 Vite base、PWA 范围和测试地址。

构建结果在 `dist/`，只发布该目录，不需要 `gh-pages` 分支或后端。首次真实 Pages 发布需在本 PR 合并后验证；分支上的构建检查不会提前发布网站。

## 本地数据与限制

- 数据绑定当前设备、浏览器及站点来源；HTTP/HTTPS、域名、端口或 Safari/主屏幕应用上下文的变化可能影响可见数据，不提供跨设备同步。
- 清除网站数据、卸载、隐私模式、系统回收存储可能导致数据丢失。请求持久存储不保证浏览器批准。重要图片请导出、文案请另存。
- 保存等待 IndexedDB 事务完成后才提示成功，读写失败会按空间不足、权限、图片读取、事务中断或未知异常分别提示；没有服务器备份。
- 为兼容 WebKit 的 Blob/File 写入限制，图片在开启写事务前读取为 ArrayBuffer，文件名与 MIME 类型单独保存，重开时还原为 Blob。保留原始字节和顺序，兼容旧版 Blob 草稿，不清空数据库；旧草稿下次保存时采用新格式。
- 第一版未包含整库备份/恢复、云同步、图片裁剪压缩、拖拽排序、批量发布和 AI 联网生成。没有微信自动发布功能。
- 自动浏览器测试不能替代真机验证。iOS 相册选择、系统分享、添加主屏幕和实际微信发布需在真实 iPhone 上验收。

## 主要文件

- `src/main.tsx`：相册列表、图片与文案编辑、分享流程
- `src/model.ts`：类型、IndexedDB、记录标题及搜索逻辑
- `src/style.css`：移动端优先布局及 iPhone 安全区
- `vite.config.ts`、`public/icons/`：PWA 与离线预缓存
- `src/model.test.ts`、`src/storage-errors.test.ts`、`tests/`：存储兼容性、错误分类及 Chromium/WebKit 浏览器流程
- CI 失败时保留浏览器错误名称、截图及 Playwright trace（Actions 附件，保留 7 天）；诊断日志不输出商品内容或图片数据

受限环境若无法下载 Playwright 浏览器，但已安装 Chromium，可运行 `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e -- --project=chromium`。这不替代 WebKit 与 iPhone 真机检查。

## 巴商相册品牌及图标更新

正式原图为 `public/branding/bashang-logo.png`（用户上传的 1024×1024 白底绿色渐变 B 形 PNG）。网页顶部、32px favicon、180px Apple Touch Icon、192/512px PWA 图标均直接按原图缩放，没有重新设计、裁切或添加文字。manifest 图标声明为 `any`，避免系统按 maskable 安全区裁切原有图案。

图标 URL 使用源文件 SHA-256 前 8 位作为版本：`icons/bashang-24e3ccde-{尺寸}.png`。更换图标时先用 ImageMagick 运行 `bash scripts/generate-icons.sh`，然后同步更新 `src/main.tsx`、`index.html`、`vite.config.ts` 中的版本路径；图标在 Git 中提交，生产构建不依赖 ImageMagick。原来的三个安装图标 URL 也已替换为正式原图的缩放版本，兼容旧引用。

保留 IndexedDB 名称和版本、manifest id/start_url/scope 及部署路径。Service Worker 通过新图标的路径和内容修订下载并预缓存新资源，不清除 IndexedDB。更新仍采用现有等待激活机制，避免编辑时强制刷新：

1. 保存尚未保存的草稿，然后联网打开网站。
2. 关闭该站点所有 Safari 标签页及主屏幕应用窗口，再重新打开，让已下载的新版本激活。一般无需重新安装。
3. 网页 LOGO 和新安装时的图标应显示新版本；已安装主屏幕图标和名称由 iOS 管理，可能仍保留安装快照。网页无法保证或强制刷新系统图标，也无法通过 JavaScript 修改既有快捷方式名称。
4. 若系统始终保留旧图标，最后才考虑重新添加主屏幕快捷方式。**不要清除 Safari 网站数据。不要在未另行备份前删除已安装的主屏幕应用**，不同 iOS 版本可能将它视为独立存储上下文，删除后无法保证本地草稿仍可恢复。单独从 Safari 新增快捷方式也不保证能看到原主屏幕应用的数据。

自动化检查覆盖 Chromium/WebKit 的图标解码、尺寸与版本 URL、主屏幕名称元数据、离线图标及原有草稿持久化流程。桌面 WebKit 不等于真实 iPhone；iOS 系统桌面图标、安装快照更新与分享菜单仍需在实际手机上验收。

## 可选云端图片收件箱

新增独立「云端收件箱」入口，配置服务前原有本地相册照常使用。收件箱只从用户指定的私有服务查看、预览和导入图片，不上传本机已有数据。云端架构、凭据隔离、费用边界、部署及手动验收步骤见 [cloud-inbox/README.md](cloud-inbox/README.md)。代码不内置云端业务凭据；已有私有 Worker/R2 已通过独立 iPhone 验收。正式发布准备和回滚步骤见 [发布检查](docs/release-readiness.md)。原有 IndexedDB 名称、版本、记录和图片排序保留。
