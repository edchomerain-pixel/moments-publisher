# 巴商相册

适合 iPhone Safari 的 React + TypeScript + Vite PWA。无需服务器、账号、数据库服务或付费 API。商品、文案及原始图片字节保存在当前浏览器的 IndexedDB，不会上传图片。

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

1. 新建商品，填写品牌、名称（必填）、货号、尺码、人民币价格和备注。
2. 从相册一次选择多张图片，每条最多 9 张；支持删除及左右按钮排序。单张上限 25MB，无法解码的 HEIC 图片需先转成 JPEG/PNG。图片保持原文件，不压缩。
3. 按商品信息生成中文文案，再按需编辑；不会编造真伪、成色、库存等承诺。重新生成前提示确认。
4. 点击「保存草稿」。编辑不会自动保存，未保存退出时会提示；iOS 强制关闭应用仍可能丢失未保存内容。
5. 在发布准备区域复制文案，通过 iOS 系统分享菜单分享图片，或导出按顺序编号的 ZIP。ZIP 在「文件」中解压后可存入相册。分享目标由系统与已安装应用决定，朋友圈未必在分享菜单中；图片顺序请在微信发布页再次核对。
6. 手动打开微信朋友圈，选择图片、粘贴文案并完成发布，再自行标记「已发布」。应用不调用微信自动化接口、不读取微信数据、不自动判断发布成功。
7. 草稿箱可搜索品牌、名称、货号、尺码、备注或文案，按发布状态筛选，编辑、复制或删除。复制品重置为待发布。

## iPhone 安装与离线

使用 Safari 打开 HTTPS 网站 → 底部「分享」→「添加到主屏幕」。已提供 manifest、192/512px 图标、Apple Touch 图标、独立窗口和安全区适配。首次联网加载成功、Service Worker 激活后，可离线打开和管理已保存草稿。新版本在关闭现有应用窗口、重新打开后加载。

剪贴板和文件分享需 HTTPS 与用户点击触发。无法自动复制时会选中文案，请长按复制；不支持文件分享时使用 ZIP 导出。分享取消不会改动发布状态。

## GitHub Pages 自动部署

生产路径固定为 `/moments-publisher/`（`vite.config.ts`），开发和预览也使用这个子路径。manifest 的启动地址、应用范围、Service Worker 范围、离线回退页及图标均位于该路径。`index.html` 的 Apple Touch 图标通过 `%BASE_URL%` 跟随配置，构建后的 JS/CSS 也使用该前缀。

预期访问网址：**https://edchomerain-pixel.github.io/moments-publisher/**（请保留末尾斜杠）。

部署步骤：

1. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**（已设置时无需重复操作）。
2. 审核并将本部署 PR 合并到 `main`。
3. `main` 更新会自动触发 **Deploy to GitHub Pages**，依次执行 `npm ci`、格式检查、单元测试、构建，然后上传 `dist/` 并发布。也可在 Actions 中选择该工作流 → **Run workflow** → 选择 `main` 手动部署。
4. 等待 `build` 和 `deploy` 均成功，在 `github-pages` 环境或工作流部署摘要中打开网站。如果该环境配置了审核人，需要批准部署任务。
5. 在 iPhone Safari 打开上述 HTTPS 地址，确认商品编辑、图片、离线重开正常，再通过分享菜单添加到主屏幕。

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

- `src/main.tsx`：草稿箱、商品编辑、图片和分享流程
- `src/model.ts`：类型、IndexedDB、文案及搜索逻辑
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
