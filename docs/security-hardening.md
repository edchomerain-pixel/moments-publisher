# 云端收件箱依赖修复与错误脱敏

> 当前发布候选已采用用户批准的 Vitest 4.1.12；2026-10-26 全量 npm audit 为 0。以下初轮记录中的“保留/等待确认”是历史状态，已由下方最终状态取代。最新发布门禁及回滚方案见 [正式发布检查](release-readiness.md)。

本轮仅在本地分支 `fix/cloud-inbox-security-hardening` 修复和测试，基于 PR #5 的 `feat/cloud-image-inbox`。没有推送、合并、修改正式网站、重新部署 Worker 或轮换任何业务凭据。

## 依赖处理

全量审计从 5 个受影响包（2 critical、2 moderate、1 low）降至 3 个（2 critical、1 moderate）。生产依赖审计仍为 0。包数不是独立漏洞数：Vitest 的 critical 告警包含 tinypool 的传递风险。以下五包均在测试/构建工具链，不在网页应用的运行时依赖或 Worker 脚本中；开发机/CI 执行它们仍有风险。

| 包                   | 修复前 → 当前 | 实际影响及处理                                                                                                                                                                                                                                 |
| -------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fast-uri             | 3.1.8 → 3.1.9 | Workbox 构建配置经 Ajv 使用的 URI 解析器。涉及编码 scheme、host/path 规范化等问题；应用使用原生 URL，未发现图片/文案可触达该 Node 工具的路径。3.1.9 在 Ajv 的现有 ^3.0.1 范围内，已定向更新。                                                  |
| serialize-javascript | 7.1.2 → 7.1.4 | Workbox → Rollup Terser 构建工具。相关 XSS 公告要求控制序列化函数的源码/toString，并把结果嵌入 HTML script；当前不处理来自相册的函数输入，未发现该触发路径。首个相关补丁为 7.1.3，本轮选择现有 ^7.0.3 范围内的最新补丁 7.1.4，不改变主次版本。 |
| tinypool             | 1.1.1 → 保留  | Node 测试 worker 的原型污染 gadget 可导致代码执行，需要另一个原型污染等前置条件；不是网站访客上传图片即可触发。所需补丁为 2.1.2，而当前 Vitest 要求 ^1.1.1，1.x 尚无对应补丁。没有强制覆盖。                                                   |
| vitest               | 3.2.7 → 保留  | 仅执行单元测试，不进入网页或 Worker。其 critical 部分来自 tinypool，另受 mocker 公告影响。3.x 当前最新仍是 3.2.7，无同主版本修复。                                                                                                             |
| @vitest/mocker       | 3.2.7 → 保留  | 公告涉及在可访问的开发服务器 WebSocket 上启用公开 mocker/interceptor 插件。本项目未引入这些插件，也未启用 Vitest browser server，使用 vitest run src；未发现当前对应的可达路径。3.x 没有补丁，需要与 Vitest 整体升级。                         |

仅锁文件中两个包的版本、下载地址和完整性校验变化，没有改变 package.json 的版本范围、直接依赖或其他锁定包。未执行 `npm audit fix --force`、全量 update 或跨主版本 overrides。

## 等待确认的跨主版本方案

候选为 **Vitest 4.1.12**，而非审计自动建议的 5.x：

- 官方包元数据显示它配套 `@vitest/mocker` 4.1.12，并移除了对 tinypool 的直接依赖；这些版本覆盖本轮所核对的相关补丁。最终是否清零必须在实际升级后重新 npm audit，不能提前保证。
- 该版本支持 Vite 6/7/8；本项目 Vite 7 已满足。Node 支持范围为 ^20、^22、>=24；当前 CI Node 22 和用户 Mac Node 24 满足要求。
- 仍是跨主版本：mock/spy 恢复语义、默认测试文件排除规则、模块运行器、pool 和 coverage 配置存在变化。本项目虽未使用自定义 pool/coverage/browser mode，但现有 vi.spyOn/restoreAllMocks 测试仍须完整回归。
- **未安装或尝试升级到该版本**。需用户明确批准后，再只升级测试工具，重跑单元、构建、浏览器和依赖审计，确认没有扩散到运行时依赖。

保留版本期间，不启用公开 mocker/interceptor 插件，不把测试或开发服务器公开，不在含生产凭据的 runner 上执行不受信任代码。以上是临时降低暴露面的措施，不等于修复漏洞或承诺没有风险。

## 错误脱敏

- Worker 原本不输出原始异常或请求日志，捕获路由/R2 异常后返回固定 503。保留 Worker 生产代码不变；增加列表、图片读取和上传三条异常路径的回归测试，验证响应及应用 console 不含模拟敏感信息。
- IndexedDB 日志只保留固定操作标签和允许列表中的异常名称，不再记录 message、stack、自定义 name 或未知操作字符串。原有配额/权限/事务错误的用户操作指引保留。
- 新增有固定错误码的收件箱异常。UI 不再直接回显 native Error.message、服务端响应体或原始异常；仍保留受控的鉴权、HTTP 状态、完整性/格式校验提示。未知错误使用通用说明。
- 增加浏览器用例：服务端返回带模拟凭据文字的无效 JSON 时，界面和日志都不显示该文字。
- 增加本机凭据文件的精确 .gitignore 规则。没有读取、复制、生成或输出真实业务凭据。
- Cloudflare 平台日志/外部监控不由本应用代码控制，本轮没有访问或修改其设置，不能把应用日志测试当作平台日志审计。

## 部署说明

已明确 `wrangler secret put` / 普通 bulk/delete 会立即发布新 Worker 版本；`versions secret put` 虽不切换流量，仍是云端写入。文档改为仅在明确决定部署后，用已支持的 `--secrets-file` 同时上传代码与仓库外的 0600 凭据文件；不把 Secret 配置命令当作只读准备。已有部署与凭据无需为本轮修复重新配置。

## 本轮验证

- 17 项单元测试通过（包括消息、异常名称、堆栈和日志的敏感信息回归）。
- 5 项 Worker 测试通过（包括三类 R2 异常无回显/无应用日志）。
- 格式检查、TypeScript、生产构建和 PWA 生成通过。
- Chromium 13 项全部通过，覆盖旧记录、九图排序、分享/PWA/离线、导入去重与敏感异常响应。不用 Chromium 代替 WebKit/iPhone 真机；WebKit 当前未安装，真机验收仍待完成。
- 额外本地浏览器测试确认导入前后旧照片字节、隐藏字段、文案、时间戳和相对排序保持不变，凭据未进入 URL、持久存储、缓存或应用日志；本地 Worker CORS 回归通过。
- 实际 CORS 已由用户 Mac 在前一阶段从正式网站来源验证通过；本轮没有改变 Worker/CORS 或发起新的真实凭据请求。

## 公告与迁移依据

- https://github.com/advisories/GHSA-5gmw-xhrv-c9v3
- https://github.com/advisories/GHSA-85c8-ppgw-ccpr
- https://github.com/advisories/GHSA-82fw-gwwq-j7x9
- https://github.com/advisories/GHSA-qxg6-89mg-rqv8
- https://github.com/advisories/GHSA-w74x-v6f9-j3xg
- https://github.com/advisories/GHSA-m5mm-p8h7-m29v
- https://v4.vitest.dev/guide/migration.html

## 2026-10-26 正式候选状态

- Vitest / @vitest/mocker 均为 4.1.12；tinypool 已移出依赖树。fast-uri 3.1.9、serialize-javascript 7.1.4 保留补丁版本；全量审计 0（含开发依赖），不是仅生产依赖审计。没有 audit fix --force、跨版本 overrides 或新的应用运行时依赖。
- Vitest 独立配置仅发现 src 的单元测试；node:test 的 Worker 与 Playwright 在独立 CI 步骤完整执行。restoreMocks 与现有 afterEach(restoreAllMocks) 同时保证 spy 恢复；单元测试数量仍为17。
- 用户已在 iPhone Safari 的独立 HTTPS 测试相册完成真实 Worker/R2 的预览、SHA-256、导入、去重、刷新、旧测试记录及隐私验收；原 Worker 已恢复且临时来源拒绝，测试证书已移除。该真机结果来自用户提供的完成截图和恢复日志，不是本环境自行执行真机测试。
- 发布候选的 src/public/Vite 应用代码与已验收的43cd75d一致；未带入局域网来源、临时CORS授权、证书服务、配对与恢复工具。正式 Worker 仍仅允许 Pages Origin，无需为本次前端发布重新部署或重传 Secrets。
- 新增官方 workerd 本地运行器发布门禁，使用模拟凭据和本地 R2；防止“Node 导入和 dry-run 通过但 Cloudflare 拒绝导出类型”的问题再漏检。该门禁不调用真实云端管理 API。
