# 拾光 · 朋友圈商品发布助手

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

## 部署

构建结果在 `dist/`，将目录整体部署到任意 HTTPS 静态托管（如 GitHub Pages、Cloudflare Pages、Netlify），无需后端。Service Worker 与资源应位于同一站点。

根域名：

```bash
npm ci
npm run build
```

GitHub Pages 仓库子路径：

```bash
VITE_BASE_PATH=/moments-publisher/ npm run build
```

将生成的 `dist/` 发布到 Pages（仓库设置启用 Pages，使用静态站点构建/上传流程）。仓库提供 CI 基础检查工作流，未自动发布网站。请不要将源码目录直接当作生产站点发布。

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
