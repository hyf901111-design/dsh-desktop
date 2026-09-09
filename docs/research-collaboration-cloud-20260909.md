# 研究看板协作首次云端部署

2026-09-09，用户在本地客户端启动后明确要求“云端服务弄一下我要测协作功能”，据此执行本次云端部署。没有发布或升级桌面客户端，没有接受或提升集成批次。

## 来源与资源

- 部署源码：干净集成分支 `codex/integration/20260909-01`，提交 `030712ee21a5a50a63232a48c0106251c85b5390`；与当前打开的 0.9.5 本地协作测试包相同。
- 功能代码：`4a0a5153e535149e6b0bdccfea45e7e2387babda`；本次部署没有修改服务实现或客户端二进制。
- 已核对 Cloudflare 账户 `d5e49bcb8e44fb51208bd0023bb9ee01`、`evanarts.com` zone、既有 `sherlock-releases` 桶、账户数据库和已有 Worker 路由。
- 新 Worker：`sherlock-research-collaboration`，版本 `ee681785-05a9-4379-a555-db66ffc2e352`。
- 路由：`updates.evanarts.com/v1/collaboration/*`。
- 既有 D1 `sherlock-accounts` 仅新增 `0002_research_boards.sql`；迁移前仅 `0001_accounts.sql` 已应用。迁移前 Time Travel bookmark：`00000074-00000000-000050e1-86f806b4eafcdaf990e7e9a7ffda6c6f`。回滚数据库会影响此后登录和研究写入，不能作为日常撤销部署的默认操作。
- 新私有 R2 桶 `sherlock-research-private`：r2.dev 公开访问关闭，无自定义域名。
- SQLite Durable Objects：`ResearchBoardRoom`、`ResearchNotifications`；每五分钟运行原配置回收任务。未修改账户套餐、现有基金服务及其 Secret。

## 已验证的真实路径

部署干运行、远端迁移、创建私有桶及真实部署均成功。远端绑定、路由及计划任务已回读核对。

使用两个临时注册账户，通过既有账号服务获取令牌，在真实公网协作服务完成：10 位公开 ID 分配；精确 ID 查询；WebSocket 邀请通知及接受；两个画板连接显示在线成员；从同一基线并发修改文字和位置，双方收到合并结果并通过 HTTP 重新读取持久状态；受邀成员读取相同私有文件字节；取消共享即时撤销成员连接、内容读取、写入和文件访问，同时所有者保留共同成果。

2026-09-09 11:39:16–11:39:47 UTC 的最终检查退出 0。首次检查的测试谓词错误地读取顶层 invitationId，未匹配实际协议中的 notification.invitation.invitationId；修正测试谓词后重新执行全部本次云端检查，服务代码没有调整。保留首次失败日志。

临时注册账户、令牌、邀请、测试画板及其私有文件已清理；未向现有真实用户发送邀请，未调用模型。部署前后账号匿名请求保持 401，基金健康端点保持 ready，新增协作匿名请求为 401。

真实 EWork Odyssey 窗口中，hyf90 的消息中心已显示正常“暂无消息”，账户信息展示云端分配的 ID，研究页的常用画板及共享入口可见。应用保持打开。两位测试者都需要使用包含协作功能的测试客户端；公开 0.9.5 安装包不包含本次功能。

## 证据与边界

本机详细证据位于集成工作树的 ignored `output/research-collaboration-cloud-20260909/`：`deploy.log`、`migration.log`、`remote-bindings.json`、`live-smoke-result.json`、`live-smoke.log`、`database-final.json`、`public-probes.json`。不保存登录口令、Cloudflare OAuth Token 或云会话 Token。

本轮验证的是真实云端双账户协议与当前本机原生客户端连通；没有冒称完成两台原生客户端的人工操作、付费模型调用或 10 人容量实测。保留操作文档中不支持的历史附件类型和大小上限。当前 Workers、D1、R2、DO 资源使用会按现有 Cloudflare 套餐计量，未进行订阅升级。
