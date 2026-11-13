# Sherlock 账户与云端能力

本功能基于 `sherlock-desktop` 本地 main `f54e370`（0.8.6），位于独立 `codex/feat/accounts-20260907` worktree。旧 `dsh` 工作目录不包含基金数据服务，不能从旧目录构建本功能。

## 产品行为

- 左下角未登录显示「登录 Sherlock」，菜单含「登录 / 注册」「设置」；已登录显示头像和用户名，菜单含「账户信息」「设置」「退出登录」。
- 登录和注册使用原生模态浮窗，展示 Sherlock Logo，不显示用途说明。账户信息、修改密码、用量和既有设置使用全窗口左导航 / 右内容布局；设置没有黑色遮罩，左上角「返回应用」关闭设置表面，研究界面保持挂载。
- 注册需要用户名（3–32 位文字、数字、下划线、短横线）、密码（8–128 位）和邀请码。密码修改在账户信息内，新密码同样为 8–128 位，修改后撤销所有会话并重新登录。
- 未登录不影响个人模型配置、本地内容和本地功能。基金研究请求返回明确登录提示；用户主动打开左下角账户页面登录后重新发起任务。

## 数据和边界

`services/accounts/auth.js` 提供可复用的 `authenticate`；所有未来托管查数 API 必须先调用该函数，并在服务端记录用量，禁止仅在 UI 隐藏按钮。当前精确保护 `/v1/fund-research/query`，账号端点为 `/v1/account/{register,login,me,password,logout,usage}`。不修改公开下载和更新地址。

D1 保存用户、加盐 scrypt（N=32768、r=8、p=3，约 32 MiB）的密码哈希、邀请码哈希、会话哈希、登录尝试限额及调用记录；会话为随机 256 位令牌，30 天到期。邀请码有效期、次数和停用标记由数据库触发器在用户插入事务内验证和核销。密码修改 / 禁用用户 / 撤销会话立即影响后续鉴权。登录和注册受 IP 哈希与用户名哈希双重 15 分钟尝试次数限制。

桌面主进程用 Electron safeStorage 加密持久化会话，不向渲染进程返回会话令牌。基金运行时通过仅监听 127.0.0.1、随机访问凭据保护的本地代理请求固定云端基金路径。代理不接收任意目标 URL；Cloudflare 账户凭据不传递到供应商。用户模型链路不接入该代理。

用量记录当前为研究请求事件（含缓存命中），不是供应商工具调用数或金额。先写 pending，再记 HTTP 结果；失败也有结果，异常中断可留下 pending。最近 30 天展示请求次数与成功次数。不自动扣费，不设置套餐，不声称账单精确结算；未来计费需另定缓存、失败、重试、幂等和价格规则。

## 管理与部署

2026-09-07 已核验生产账户、域名和发布桶，创建 `sherlock-accounts` D1（`1a60b58b-7926-4287-b6ff-c6e84e12827d`）并应用迁移。配置绑定该数据库；Worker 部署与线上验收记录单独保留，不修改公开客户端更新源。

1. 按既有部署工具核验 Sherlock 生产 Cloudflare Account ID、域名与 `sherlock-releases` 桶归属；不要使用当前 CLI 默认账户替代归属核验。
2. 在该账户创建 `sherlock-accounts` D1，将真实 ID 填入 `services/fund-data/wrangler.jsonc`。
3. 使用 `wrangler d1 migrations apply sherlock-accounts --remote --config services/fund-data/wrangler.jsonc` 应用迁移，再检查表与触发器。供应商密钥继续沿用该 Worker 现有 secret。
4. 创建邀请码：`node scripts/manage-sherlock-accounts.mjs invite 1 /absolute/path/invite.sql`，脚本输出一次邀请码、生成仅包含哈希的 SQL 文件（权限 0600），在生产 D1 执行 SQL 后生效。默认有效期为执行后 7 天。不要提交邀请码或管理 SQL。
5. 管理命令支持 `disable-user <用户ID> <SQL路径>`、`revoke-sessions <用户ID> <SQL路径>`、`disable-invite <邀请码> <SQL路径>`。生成后用 Wrangler 对核实的数据库执行。管理员入口是受 Cloudflare 账户权限保护的 CLI，不在用户客户端暴露管理 API。
6. 先完成本地集成和真实新客户端验收，再安排 Worker 鉴权切换及客户端发行：旧 0.8.6 没有登录功能，切换后其基金查询将无法使用。此变更不能单独无感上线；正式发行仍走项目发布手册。
7. 上线验证：无令牌 401；正确注册和登录成功；有效令牌基金请求成功；退出 / 改密 / 禁用后旧令牌 401；错误密码和过期邀请码失败；自配模型照常工作。不能用合成数据验证代替生产验收。

认证记录与用量目前不自动清理；生产应增加保留期和定期清理 expired sessions / auth_limits 的运维任务，计费记录保留期需结合业务规则确定。

## 聚焦验证

- `node scripts/test-fund-data-worker.mjs`：真实本地 workerd + D1 SQLite + Durable Object，供应商为合成数据，覆盖邀请码、会话、改密、用量、匿名阻断、缓存和密钥隔离。
- `npx vitest run test/account-service.test.ts test/fund-data-service.test.js test/fund-research-runtime.test.js test/ipc-trust.test.ts`。
- `npx tsc --noEmit -p tsconfig.node.json`。
- 页面浏览器预览复用当前安装的真实 SettingsPanel 组件和本次 account-ui.ts；账户 API 与设置内容为合成夹具，不能作为已打包客户端或生产登录通过的证据。

实现依据：[D1 batch 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/)、[Workers Crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)。

## 关于页面下载大小

更新器 progress 的 transferred / total 经主进程状态和 IPC 原样传递，关于页面在百分比旁显示已下载大小 / 本次下载总大小。按十进制 B、KB、MB、GB 显示；差分下载采用更新器本次传输量，不混入完整 ZIP 大小。未知总量或异常计数时只显示百分比，重试和状态重置清除旧计数。

## 登录浮窗细化

默认头像采用用户提供的 SVG，浮窗宽 360px、Logo 宽 136px，切换注册入口为居中文字。输入焦点使用浅灰色；关闭浏览器原生表单气泡，校验错误显示在对应输入框上方右侧。

生产 Workers 限制 PBKDF2 迭代数不超过 100000，本地 workerd 未复现此限制。采用 [OWASP scrypt 参数档位](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt)，哈希格式带 `scrypt-v1` 标记；切换前生产用户数为 0。
