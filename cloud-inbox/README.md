# 云端图片收件箱

## 架构与边界

GitHub Pages 继续承载原相册；Cloudflare Worker 提供鉴权 API；R2 私有桶保存图片。浏览器只持有用户手动输入的只读凭据，保存在 React 内存，不进入源码、构建变量、localStorage、URL 或 Service Worker 缓存。关闭收件箱会丢弃凭据，刷新页面需重新输入。任何网页鉴权凭据都能被当前浏览器用户看到，因此只授予查看权限。不要在网页输入上传凭据、Cloudflare API Token 或账号密码。

上传凭据仅用于将来 Mac 的本机密钥存储；本次没有修改 CleanPic AI，也没有接入 OpenClaw 或飞书。Worker 仅提供上传、列表和读取，没有删除 API。CORS 仅允许现有 Pages origin，但 CORS 不是鉴权，所有数据请求都检查凭据。

SHA-256 内容寻址：同样字节只存一份，重试不覆盖文件名或上传时间。支持 JPEG/PNG/WebP，限制 25 MiB，并检查文件头与 MIME。完整解码由导入端执行；文件头检查不等于恶意文件扫描。列表按 R2 对象键顺序分页，每页 50 张，保持接口返回顺序，不承诺按接收时间排序。预览需点击才下载原图，没有付费缩略图服务。

每次最多选择 9 张，每张新增一条独立本地记录，不合并到现有记录。所有下载、SHA-256 校验和图片解码通过后，在同一事务中使用 add 新增；失败回滚本批写入。稳定记录 ID 由服务 origin 和图片 hash 组成；重复导入跳过已有 ID，不覆盖导入后编辑的记录。本地主动删除该记录后允许再次导入。无额外去重数据库、无数据库升级；仍是 moments-publisher/version 1/drafts。旧记录字节、字段、时间戳和相对排序不变，新记录仍按原来的最近更新时间排序。

## 连接现有 R2 桶（后续手动操作）

1. 用户已开通 R2，并创建 Standard 私有桶 `bashang-album-images`，公开访问关闭。本仓库配置已使用该桶；此次仅提交代码，不部署 Worker、不修改线上 Pages。R2 免费额度不是费用硬上限，后续使用仍按账号实际定价计费。
2. 保持桶为私有，不启用公共 r2.dev 或公开自定义域名。在 Worker 的 **Bindings → Add binding → R2 bucket** 中，变量名必须为 `INBOX`，选择现有桶 `bashang-album-images`。使用 Wrangler 手动部署时，`wrangler.toml` 中的同名绑定会完成这一步，无需创建第二个桶，无需 R2 S3 Access Key 或 Secret Key，也无需给桶配置浏览器 CORS（浏览器只访问 Worker）。本次没有替用户执行绑定或修改桶设置。
3. 在本地可信终端安装 Wrangler（按 Cloudflare 最新文档），进入本目录，登录自己的 Cloudflare 账号。确认 wrangler.toml 中桶名和 `ALLOWED_ORIGIN`；origin 不含 `/moments-publisher/` 路径。
4. 分别生成两个至少 32 字节的随机凭据（例如各运行一次 `openssl rand -hex 32`），通过密码管理器分别保存。用 `wrangler secret put READ_TOKEN` 和 `wrangler secret put UPLOAD_TOKEN` 交互输入到 Worker secrets；两个值必须不同，不写入 wrangler.toml、Vite 环境变量、仓库、截图或聊天。然后在你确认可以使用相关云服务之后运行 `wrangler deploy`（首次部署若 secrets 命令要求先创建 Worker，先通过控制台创建同名 Worker 并绑定桶，再设置 secrets 和部署）。不要自动把账号管理 Token 当作业务凭据。
5. 本 PR 暂不合并：当前 main 合并会自动触发 GitHub Pages 发布。等用户决定更新网站并完成 Worker 部署后，再合并 PR。保留 Worker 的 HTTPS 根地址。在现有同一个 iPhone 网站/主屏幕应用中打开「云端收件箱」，输入地址和 READ_TOKEN；不要更换现有网站域名、清除 Safari 网站数据或卸载原主屏幕应用。
6. 初次联调：从可信 Mac 终端手动上传测试图，再在 iPhone 中连接、预览、选择导入、重开相册确认图片仍在，再次导入确认跳过。现有相册无需云服务即可使用。真实云端联调及 iPhone 验收尚未完成。

## 上传协议（仅供未来 Mac 接入）

`POST /images`，请求体为图片原始字节，`Authorization: Bearer <UPLOAD_TOKEN>`，`Content-Type: image/jpeg|image/png|image/webp`，可选 `X-File-Name` 为 encodeURIComponent 后的文件名。成功返回 `{ "id": "sha256" }`。客户端应对 503/网络失败进行有限重试，切勿无限循环。示例不写实际凭据；未来上传程序应从 macOS Keychain 读取。

`GET /images?cursor=...` 使用 READ_TOKEN，返回 `{items:[{id,name,size,type,uploaded}],cursor:null|string}`。`GET /images/{id}` 同样使用 READ_TOKEN 返回私有原图。GET 响应 no-store，不使用公开图片 URL 或 URL 查询密钥。GET 的上传凭据被拒绝，只读凭据不能 POST。管理层删除和轮换密钥需在 Cloudflare 控制台进行。

## 成本与运维

没有订阅图片处理 API、额外数据库或常驻服务器。费用取决于 R2 存储、读写次数和 Worker 请求额度；一次预览、一次导入都会读取原图，没有后台轮询。控制台建议配置费用通知；通知通常不是硬上限。服务没有无限免费承诺，也未提供服务端每日总上传配额，上传凭据持有者可持续占用空间，应妥善保存并定期检查容量。凭据遗失时轮换对应 secret；不需要更换网页构建。共享只读凭据适合个人使用；若将来多人使用需改为独立用户认证。

## 测试

仓库根目录执行 `npm test`、`npm run test:inbox-worker`、`npm run build` 与 `npm run test:e2e`。Worker 单测使用 R2 mock，验证权限隔离、来源、缓存、类型、体积及幂等写入参数；不能代替真实 R2 条件写入和 Cloudflare 部署验收。浏览器测试使用模拟云 API，不会请求真实云服务。

本次本地验证记录：生产构建、格式检查、14 项单元测试及 4 项 Worker 权限/上传测试通过。Chromium 使用系统浏览器执行，12 项全部通过；WebKit 安装下载被环境网络策略返回 403，未完成 Safari 引擎测试。真实 R2、iPhone 和未来 Mac 上传流程仍需按上述步骤验收。
