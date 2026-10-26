# 云端图片收件箱

## 架构与边界

GitHub Pages 继续承载原相册；Cloudflare Worker 提供鉴权 API；R2 私有桶保存图片。浏览器只持有用户手动输入的只读凭据，保存在 React 内存，不进入源码、构建变量、localStorage、URL 或 Service Worker 缓存。关闭收件箱会丢弃凭据，刷新页面需重新输入。任何网页鉴权凭据都能被当前浏览器用户看到，因此只授予查看权限。不要在网页输入上传凭据、Cloudflare API Token 或账号密码。

上传凭据仅用于将来 Mac 的本机密钥存储；本次没有修改 CleanPic AI，也没有接入 OpenClaw 或飞书。Worker 仅提供上传、列表和读取，没有删除 API。CORS 仅允许现有 Pages origin，但 CORS 不是鉴权，所有数据请求都检查凭据。

SHA-256 内容寻址：同样字节只存一份，重试不覆盖文件名或上传时间。支持 JPEG/PNG/WebP，限制 25 MiB，并检查文件头与 MIME。完整解码由导入端执行；文件头检查不等于恶意文件扫描。列表按 R2 对象键顺序分页，每页 50 张，保持接口返回顺序，不承诺按接收时间排序。预览需点击才下载原图，没有付费缩略图服务。

每次最多选择 9 张，每张新增一条独立本地记录，不合并到现有记录。所有下载、SHA-256 校验和图片解码通过后，在同一事务中使用 add 新增；失败回滚本批写入。稳定记录 ID 由服务 origin 和图片 hash 组成；重复导入跳过已有 ID，不覆盖导入后编辑的记录。本地主动删除该记录后允许再次导入。无额外去重数据库、无数据库升级；仍是 moments-publisher/version 1/drafts。旧记录字节、字段、时间戳和相对排序不变，新记录仍按原来的最近更新时间排序。

## 已有服务与正式发布

1. 用户已开通 R2，并创建 Standard 私有桶 `bashang-album-images`，公开访问关闭。本仓库配置已使用该桶；Worker 已部署并通过真实读写与 iPhone 隔离验收；本轮仅准备正式发布，不部署 Worker、不修改线上 Pages。R2 免费额度不是费用硬上限，后续使用仍按账号实际定价计费。
2. 保持桶为私有，不启用公共 r2.dev 或公开自定义域名。现有 Worker 的变量名 `INBOX` 已绑定 `bashang-album-images`，本次无需重复添加绑定。新环境首次配置时才选择该桶。使用 Wrangler 手动部署时，`wrangler.toml` 中的同名绑定会完成这一步，无需创建第二个桶，无需 R2 S3 Access Key 或 Secret Key，也无需给桶配置浏览器 CORS（浏览器只访问 Worker）。本次没有替用户执行绑定或修改桶设置。
3. 在本地可信终端安装 Wrangler（按 Cloudflare 最新文档），进入本目录，登录自己的 Cloudflare 账号。确认 wrangler.toml 中桶名和 `ALLOWED_ORIGIN`；origin 不含 `/moments-publisher/` 路径。
4. 使用本机密码学安全随机数生成器，分别生成两个至少 32 字节且不同的业务凭据。只写入仓库外、仅当前用户可读写（`0600`）的 JSON 文件，例如 `~/.bashang-cloud-inbox-secrets.json`，字段为 `READ_TOKEN` 和 `UPLOAD_TOKEN`；生成与验证程序不得打印值、完整 JSON、请求头或原始异常。不要在终端用 `cat` 查看凭据文件，也不要将文件放入仓库、聊天、截图或构建变量。`READ_TOKEN` 只用于查看，`UPLOAD_TOKEN` 只用于未来 Mac 上传；二者均不是 Cloudflare 管理 API Token。对于已经完成部署和 Secret 配置的账号，不需要重新生成、轮换或再部署。
5. 本 PR 暂不合并：当前 main 合并会自动触发 GitHub Pages 发布。等用户决定更新网站并完成 Worker 部署后，再合并 PR。保留 Worker 的 HTTPS 根地址。在现有同一个 iPhone 网站/主屏幕应用中打开「云端收件箱」，输入地址和 READ_TOKEN；不要更换现有网站域名、清除 Safari 网站数据或卸载原主屏幕应用。
6. 2026-10-26 已完成 iPhone Safari → 真实 Worker → 私有 R2 的隔离验收：已知测试图预览/校验、导入、去重、刷新保留、旧测试数据与凭据隐私均通过；未新增或删除 R2 图片。随后原 Worker 恢复并验证，临时测试来源已撤销，证书已移除。正式页面升级后的同源/PWA抽查仍作为发布后检查；不要清除网站数据。

## Secrets 与部署命令的副作用

`wrangler secret put`（以及普通 `secret bulk` / `secret delete`）会创建并立即发布一个新的 Worker 版本，**不是只做部署前配置**。控制台中保存 Secrets 时的 Deploy 也会发布。`wrangler versions secret put` 只创建版本、不切换当前流量，但仍是云端写入；只读检查阶段不执行这些命令。

当前服务已配置好两个 Secrets。**本次正式网站发布不需要 Worker 部署，也不需要重新提交或轮换 Secrets。** 不运行 secret put、bulk、delete 或任何 --secrets-file 命令来“准备”发布。

未来若明确批准更新 Worker，固定 Wrangler 4.152.0，先只读确认账号、当前版本、绑定和 Secrets 名称、准备回滚，再部署不含 Secret 值的配置，并使用 `--experimental-auto-create=false` 禁止意外创建资源。普通部署保留已有 Secrets，不使用 --keep-vars 保留意外的临时变量。`--secrets-file` 仅用于另行批准的首次配置或凭据变更，不是本次发布步骤。

`deploy --help`、不带凭据文件的 `deploy --dry-run` 是本地检查；`secret list` 是云端只读查询，仅显示名称和类型。遇到额外资源、权限或付费提示停止，不自动扩大权限。完整顺序见 [发布及回滚方案](../docs/release-readiness.md)。

业务凭据只经 HTTPS Authorization 头发送。不要启用带敏感请求细节的调试/抓包/trace，也不要在控制台、CI 或测试附件中保存真实凭据。轮换凭据属于独立的云端变更，需另行决定。

## 错误诊断与敏感信息

Worker 捕获 R2 和其他路由异常后仅返回固定的 `Service unavailable` 与 503；应用不记录原始异常、请求头、URL、响应体或 Secrets。测试覆盖列表、图片读取和上传时的 R2 异常，确保不会回显到响应或应用日志。该策略不等于确认 Cloudflare 平台侧日志配置；如果另行启用 Workers Logs、Tail、Logpush 或外部监控，需要独立核查字段与访问权限。

网页仅展示应用定义的收件箱错误提示和经验证的 HTTP 状态数字，不回显服务器响应体或底层异常消息。IndexedDB 诊断日志仅保留允许列表中的操作名称和异常类别，不记录 message、stack 或自定义异常名称；配额/权限/事务错误的原有操作指引保留。不要把真实业务凭据放进自动化测试参数、截图、录像或 trace；回归测试只使用模拟值。

## 上传协议（仅供未来 Mac 接入）

`POST /images`，请求体为图片原始字节，`Authorization: Bearer <UPLOAD_TOKEN>`，`Content-Type: image/jpeg|image/png|image/webp`，可选 `X-File-Name` 为 encodeURIComponent 后的文件名。成功返回 `{ "id": "sha256" }`。客户端应对 503/网络失败进行有限重试，切勿无限循环。示例不写实际凭据；未来上传程序应从 macOS Keychain 读取。

`GET /images?cursor=...` 使用 READ_TOKEN，返回 `{items:[{id,name,size,type,uploaded}],cursor:null|string}`。`GET /images/{id}` 同样使用 READ_TOKEN 返回私有原图。GET 响应 no-store，不使用公开图片 URL 或 URL 查询密钥。GET 的上传凭据被拒绝，只读凭据不能 POST。管理层删除和轮换密钥需在 Cloudflare 控制台进行。

## 成本与运维

没有订阅图片处理 API、额外数据库或常驻服务器。费用取决于 R2 存储、读写次数和 Worker 请求额度；一次预览、一次导入都会读取原图，没有后台轮询。控制台建议配置费用通知；通知通常不是硬上限。服务没有无限免费承诺，也未提供服务端每日总上传配额，上传凭据持有者可持续占用空间，应妥善保存并定期检查容量。凭据遗失时轮换对应 secret；不需要更换网页构建。共享只读凭据适合个人使用；若将来多人使用需改为独立用户认证。

## 测试

仓库根目录执行 `npm test`、`npm run test:inbox-worker`、`npm run build` 与 `npm run test:e2e`。Worker 单测使用 R2 mock，验证权限隔离、来源、缓存、类型、体积及幂等写入参数；不能代替真实 R2 条件写入和 Cloudflare 部署验收。浏览器测试使用模拟云 API，不会请求真实云服务。

最新正式候选执行17项单元测试、5项Worker测试、官方Workers运行器、构建及Chromium完整回归。Worker运行器使用私有模拟R2和模拟凭据，任何局域网测试Origin始终拒绝。本地WebKit引擎未安装，不把Chromium等同Safari；上述用户真机结果与本地自动化分别记录。发布结论和已知限制见[正式发布检查](../docs/release-readiness.md)。
