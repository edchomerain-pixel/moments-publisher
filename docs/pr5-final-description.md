# 建议 PR 标题

新增私有云端图片收件箱，保留旧相册数据并修复开发依赖安全告警

# PR 正文模板（实际 head SHA 和 CI 结果以 PR 页面为准）

新增可选云端收件箱：私有 Worker/R2 图片可分页查看、按需预览和导入。SHA-256 与解码全部通过后才在单事务中新增，重复导入跳过，旧照片、文案、隐藏字段、相对排序和 IndexedDB v1 保留；查看凭据只保存在当前页面内存，不进入URL、构建变量、日志或持久存储。

整合错误脱敏和依赖补丁，Vitest/@vitest/mocker升级到4.1.12、移除tinypool，fast-uri/serialize-javascript补丁已纳入锁文件，全量npm audit为0。单元测试发现及mock恢复规则显式配置；CI增加完整审计、官方Workers运行器与发布敏感信息/配置门禁。未包含临时局域网CORS或配对工具；现有Worker兼容，不需要重部署或写Secrets。

验证：17项单元、5项Worker、官方运行器、构建/格式与13项Chromium全部通过；用户已完成独立iPhone Safari直连真实Worker/R2的预览、导入、去重、刷新、旧测试记录和隐私验收，并恢复原Worker、撤销临时来源、移除证书。本环境未安装桌面WebKit，新head的GitHub Chromium/WebKit CI通过仍为合并前提。

main合并会自动发布GitHub Pages。只有用户批准正式发布、候选同步后的新SHA CI通过、发布前云端/备份复核完成后才合并；目前仍保持draft，不更改正式网站。发布与回退步骤见docs/release-readiness.md。
