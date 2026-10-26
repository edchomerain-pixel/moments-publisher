# 巴商相册云端同步

## 自动进入正式相册（2026-10）

本地整合候选将常规使用改为自动同步流程：首次连接成功后仅在当前设备保存只读连接。主相册打开、回到前台、恢复网络时自动遍历所有列表分页；前台每分钟检查，失败按 30 秒至 5 分钟退避重试。断开连接会停止后续同步并取消未提交的下载结果，清除凭据不会删除本地记录。iOS 不保证页面关闭后的后台运行，因此承诺是打开 PWA 自动同步，不承诺关闭期间写入设备。依据：WebKit《How Web Content Can Affect Power Usage》https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/ 。

每张图片完整性校验、解码后独立提交，失败图片下轮重试，已保存图片不重复下载。相册沿用原正式视图、编辑和分享；新图片按云端 uploaded 时间进入最近更新排序（同时间沿用稳定键顺序），已有记录和已编辑记录不覆盖。SHA256 与源 origin 构成稳定 ID。为避免用户删除后自动重现，IndexedDB 升级至 version 2，仅新增 dismissed 表，删除云记录与墓碑在同一事务提交；旧 drafts 表不重建。墓碑仅在当前设备生效，不删除云图。

不会将凭据放入 URL、源码、SW 缓存或日志。401 暂停同步并清除已失效连接，需更新只读凭据一次。旧本地数据仍可使用；系统清理网站数据可能丢失本地记录，云图仍保留。勿更换域名、卸载现有主屏应用或清除网站数据以更新版本。自动同步未改变 Telegram 裁剪器、上传凭据、上传协议或人工审核门槛。

## 服务与上传约定

原 GitHub Pages origin 继续承载 PWA；Cloudflare Worker 提供授权 API，私有 R2 桶保存图片。不更换站点、桶、图片键或上传凭据。只读凭据与上传凭据分离，CORS 仅允许正式站点 origin，所有图片数据请求仍需鉴权。

`POST /images` 使用上传凭据，二进制正文，Content-Type 为 JPEG/PNG/WebP，单张最多25 MiB；可选 X-File-Name 为 encodeURIComponent 文件名。SHA256 内容寻址保证重试不覆盖原图元数据。`GET /images?cursor=...` 和 `GET /images/{hash}` 使用只读凭据。响应 no-store，拒绝带密钥的公开图片链接。凭据轮换只变更对应 Worker secret 和本机受限凭据文件，不更换上传凭据，不将凭据加入构建产物。

## 验证

npm test、npm run test:inbox-worker、npm run build、npm run check:release、npm run test:e2e。自动同步测试涵盖分页、去重、排序、编辑保留、删除墓碑、重试、取消及401；迁移测试直接创建v1旧Blob记录后升级；浏览器测试覆盖已记住连接自动进入正式相册、重开去重、清除连接保留本地记录及旧记录编辑分享。真实iPhone主屏PWA仍需用户设备验收。
