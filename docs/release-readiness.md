# 云端收件箱正式发布检查与回滚方案

结论：整合候选具备提交最终发布审批的条件；PR #5 必须包含全部安全修复，且远端新 SHA 的完整 CI（含 WebKit）通过后才能正式合并发布。2026-10-26 已获准同步 PR 分支并修复 CI，尚未获准合并、发布 Pages、部署 Worker 或修改 Secrets。此文档和命令不是发布授权。

## 候选与范围

- 独立本地分支 `release/cloud-inbox-ready`，工作区 `/workspace/bashang-release-ready`。
- 基于已验收 `43cd75d`：PR #5 `d17361c` + 安全修复 `8256e9c` + 用户批准的 Vitest 4.1.12。保留原工作区、其未提交修改和所有基线提交。
- `src/`、`public/`、Vite 应用配置和 npm 锁文件仍与已验收版本一致。补充的修改为显式 Vitest 测试发现/mock恢复、CI审计/官方Worker运行器/敏感文件门禁、正式发布说明。
- 正式 Worker 代码与 PR 初始生产版本逐字节相同，SHA-256 `f5a973662ff0563b4670e4bac0d2e7d28507c578cafc311c310add954486cbb3`。不含 `TEST_CORS_*`、局域网例外或字符串导出。**本次仅发布网页，已有 Worker 无需重部署，Secrets 无需重新提交。**
- 排除整个临时 CORS/证书/配对/恢复工具分支；不将测试证书、私钥、会话、恢复包、本机凭据或真实照片放入提交。

## PR #5 最终审查

2026-10-26 同步前只读快照：PR仍为open/draft、未合并，head `d17361c0f4162bf107e61e0e0f55f0a38892dc5a`，base/main `879a4dee84ca9d4883e513d56a9f08818fcff1ee`，GitHub报告可合并、评论为空。该旧head的MVP checks成功（run 40071328825），**不代表本地新候选已通过远端CI**。完整本地整合以新分支为准，不修改远端PR内容或发布状态。

发现并处理：

1. 旧PR尚缺安全修复和Vitest升级：本地已整合，未直接批准旧PR合并。
2. 未限定的Vitest默认发现会包含node:test和Playwright文件：独立配置限定src单测；Worker、官方运行器和浏览器保持独立CI步骤，17项单测保留，restoreMocks与现有restoreAllMocks兼容。
3. Node单测/dry-run不能证明Worker可在Cloudflare启动：增加固定Wrangler 4.152.0附带workerd的本地运行器门禁，使用模拟Secrets及R2，确认正式来源授权读取、角色隔离和临时来源始终拒绝；无云端管理调用。
4. 旧说明仍要求初次Secret配置、显示真机待验收：已更正，现有服务不执行secret put/bulk/delete或--secrets-file。secret put会立即发布、versions secret put仍会创建云端版本，均不属于只读准备。
5. CI缺完整审计及发布配置/凭据检查：检查与Pages构建步骤增加全量npm audit和静态发布检查；不自动部署Worker。

## 验证证据

- 从锁文件执行npm ci；完整npm audit（包括开发依赖）0项，critical/high/moderate/low均0。
- Vitest/@vitest/mocker 4.1.12，tinypool不在依赖树，fast-uri 3.1.9、serialize-javascript 7.1.4；没有force修复或兼容性override。
- 17项单元测试、5项Worker测试、官方Workers运行器回归、TypeScript与生产构建通过。
- Chromium 13项通过：旧照片/文案/隐藏字段/顺序、原有编辑搜索分享ZIP/PWA/离线、云端预览导入去重、损坏图片整批不写入、刷新与敏感异常不泄露。
- Vitest独立配置实际发现5个src测试文件，不再收集Worker/Playwright。测试覆盖未删除。
- IndexedDB仍为`moments-publisher`/version 1/`drafts`；schema、旧Blob/字节读取与原有save/all/remove逻辑未改变，仅增加事务内addMissing。不会put覆盖旧记录；失败回滚本批新增。
- READ_TOKEN仅存在React/InboxClient内存；连接关闭或页面刷新后清空；fetch使用HTTPS Authorization、credentials:omit、redirect:error、cache:no-store；没有前端构建Secret、URL凭据、持久化或后台轮询。现有测试验证响应体/异常/自定义名称/堆栈不进入UI/应用日志。浏览器用户/扩展/密码管理器和平台日志不属于JS可强制控制的范围。
- 静态检查覆盖正式Origin、单一私有R2绑定、无临时来源/普通变量Secrets、已跟踪源码/构建产物常见密钥模式及敏感文件路径。匹配时仅报告文件名，不输出值；模式扫描不等于穷举证明。
- 用户已提供iPhone Safari真实云端验收全部通过截图（2026-10-26）：原生浏览器预检和读取、真实已知R2绿图校验/预览、独立相册导入/去重/刷新、旧测试记录及隐私检查。之后原Worker恢复、正式来源204/401/200和测试来源403验证通过，证书已移除。
- 已额外准备安全回退页面：发布前原相册UI + 当前已审计依赖与日志脱敏，13项单元、10项原相册Chromium通过；同一浏览器来源从候选切换回退页面后，旧Blob/隐藏字段及新导入字节记录完整保留。该额外切换测试禁用Service Worker以单独验证IndexedDB兼容，不等同于真实iOS的PWA版本切换验收。
- 本环境未安装桌面WebKit引擎；不声称本轮桌面WebKit已运行。PR CI在GitHub安装并运行Chromium/WebKit，新head通过仍是发布门禁。真实手机证据与本地测试独立记录。

## 正式发布（待用户批准）

1. 同步本地整合提交到PR #5分支，仅修复该PR，不推main；将本地准备的最终PR说明替换旧说明。复核GitHub base/head，若main或PR有并发变化，先本地整合并重新执行必要测试，不能强行覆盖。
2. 等新head的MVP checks全部通过：npm ci、完整audit、格式、17单测、5Worker、官方运行器、构建、敏感信息门禁、Chromium/WebKit。只接受对应SHA结果，不沿用旧绿灯。
3. 发布前只读确认线上Worker仍为原基线`22d78efc-ed81-413e-a623-002bc4f69ebd`、R2 INBOX→bashang-album-images、两个Secret名称、正式Origin仍为https://edchomerain-pixel.github.io，临时Origin返回403。若不一致停止重新审查，不读取值或自动轮换。当前文档使用用户最近恢复证据，不伪称本环境刚完成Cloudflare读取。
4. 记录当时main SHA、成功的Pages workflow run和发布产物；确认原Pages产物仍可恢复。本地已准备并验证安全回退产物，见下方文件与SHA；将其作为审批时需保留的恢复材料，不把“重跑旧workflow”当作保证可用的备份。用户在原Safari/主屏幕上下文保留或导出重要图文，不清除站点存储。
5. **获得同步及正式发布授权后**才将PR转为ready并合并。现有main push自动触发Pages构建/部署，合并就是正式发布操作；不另行创建Worker发布、不写Secrets、不改R2。
6. 发布后从原正式URL访问，保留原域名/路径/PWA上下文。检查旧照片文案排序、原功能；确认收件箱入口，安全手动输入READ_TOKEN后检查已知测试图的预览/导入/去重/刷新。不要在真实来源自动脚本里清空数据库、替换旧数据或删除现有照片。发现异常立即按下方回退。

## Pages回退

- 已准备本地`/workspace/scratch/bashang-release-artifacts/rollback-pages.tar`，SHA-256 `72c73290c917eabc7558776b7cfc6c0c40a70d8bdb224378ea674079b22fffee`，原相册界面与安全工具链/脱敏，16个静态文件。候选产物`candidate-pages.tar`，SHA-256 `e1667bb9ffeaf71eb1852783480a21ff99901f5700d19bba16fc526b3c4a77a5`。清单位于同目录`manifest.json`；均仅本地保存，未上传。
- 首选重新发布发布前确认可用的上一个成功Pages产物（记录对应run、源码SHA与产物完整性）。不依赖重新安装含旧漏洞的Vitest 3工具链，也不盲目重跑旧workflow。
- 如果产物无法使用，准备前向回退：恢复发布前的main.tsx入口/界面，保留已修复开发依赖、日志脱敏、原IndexedDB v1读写兼容及CI安全门禁；不清空数据库、不卸载PWA。回退候选先运行原相册单元/浏览器和安全检查，再经已批准的应急发布授权更新Pages。撤去入口后导入记录仍是普通v1草稿，不删除任何数据。
- 简单revert整个PR会把易受影响的开发依赖和旧部署说明一并带回，不能作为无需检查的首选回退。
- Worker本次不变，无需回滚。若发布前发现Worker已被其他人修改，停止，不擅自回滚他人的版本。只有另行批准Worker变更时，才沿用既有指定版本原生恢复+备用基线恢复流程；保留当前Secrets/R2绑定，恢复失败不能声称成功。
- 回退后检查原入口、旧数据、正式API及临时来源拒绝；不重设Secrets，不操作R2对象。平台网络、权限或产物不可用会影响恢复，不能承诺无条件成功。

## 剩余限制

当前没有本地审计/测试阻塞；最终发布必须以同步候选后的实际 PR head SHA 及其完整 CI 结果为准，不沿用旧 SHA 的绿灯。桌面WebKit本地缺失、正式PWA升级后用户实际存储上下文检查、发布时产物保存/发布通道可用性和云端状态复核仍属最终发布门禁。iPhone隔离验收不会读取或证明所有正式相册数据，浏览器存储被系统清理的风险无法靠本代码消除。本任务未推送、未合并、未更新Pages、未部署Worker、未修改Secrets或R2。

## 已批准发布时的自动线上复核

2026-10-26 用户已批准合并和 Pages 发布，仍禁止修改 Worker/Secrets/R2。因为当前执行环境无法直接访问正式域名，main 的检查工作流在完整测试后从 GitHub runner 运行 `scripts/check-live-pages.cjs`：最多等待180秒让CDN资源一致，逐一验证正式站点16个文件与已构建产物的SHA-256；然后验证Worker正式来源的真实预检204、无/错误凭据401、其他来源403。浏览器在全新隔离上下文打开真实正式URL，检查原编辑入口、收件箱入口、真实跨域401及关闭后凭据清空；不拦截请求，不使用真实Secret，不保存草稿、不清空任何数据库。此项只在main push运行，PR阶段不发布、不运行该线上检查。用户现有Safari/PWA数据库无法由云端读取，不能将隔离浏览器检查说成已经逐条核验用户原机照片；发布后仅需用户在原上下文刷新确认。
