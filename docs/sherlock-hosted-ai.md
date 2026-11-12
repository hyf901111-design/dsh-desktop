# Odyssey 托管方舟与探索用量

桌面将已登录用户的会话发往固定的 Cloudflare 账号网关。运行时只持有随登录代际撤销的 loopback 凭据。火山推理 Key 与 OpenViking User Key 由独立 Worker Secret 注入，从不进入客户端、配置、目录响应或日志。游客的现有自配模型和搜索路径保留，托管路由要求有效会话，停用、退出和会话失效都会阻断后续调用。

- 目录包含图 1 的 11 个语言模型（不含 Kimi K2.7 Code），由服务端提供；图像不进入语言模型目录。支持图片输入的模型按企业版能力清单显示「视觉」，图片以内嵌附件发送。选择器按 Doubao、Kimi、DeepSeek、GLM 分组。
- Seedream 5.0 Flash 和 Pro 复用原生 `image_generate`、会话进度及 PNG 附件。仅 Agent 判断用户需要生成或修改图片时调用。未开启视频。
- 「探索 → 管理用量」读取管理后台同一张 D1 账本的 5 小时及周剩余百分比与重置时间。单位沿用后台 AFP；模型按上游返回的输入/输出 token 结算，并未把 AFP 误标成 token 数。5 小时从首条获准扣费请求开始；悬停从 12 点顺时针长到剩余比例，低于 10% 显示红色，0% 只保留底环；无数据隐藏，减少动态效果立即显示最终值。
- EWork 的周池和 5 小时池分别按后台配置的上限分配，月总池单独校验，个人上限继续生效。席位控制台展示上游整席位用量；方舟将 Seedream 记入日与月限额，EWork 同时将托管生图计入个人使用预算。
- 托管模型请求结束后，客户端立即重新读取该账号的账本。用量页在前台打开时每 15 秒刷新，接收后台调整和其他设备产生的用量。
- OpenViking 默认跟随客户端记忆开关及私有会话范围。每个开通账号必须有独立 OpenViking User Key，Agent ID 不是权限边界。仅发送当前用户输入进行检索，只有明确独立的「请记住…」指令才写入对应内容，不上传历史会话。云端候选作为参考数据，永不当作指令；首版云端记忆清理由库管理员完成，客户端本地记忆删除不影响云库。OpenViking 的存储和模型费用独立由供应商管理，未混入文本/生图 AFP 账本。
- Evolve 未启用。公开的 [Evolve 文档](https://docs.volcengine.com/docs/ark/agent-plan-enterprise-evolve?lang=zh) 仅列出 Claude Code、OpenClaw、TraeCode 连接器；等待 DSH 受支持的服务端协议和按用户隔离的授权后再接入。会话学习、差异预览和用户确认应用须分别验证。

## Cloudflare 部署

使用 `services/hosted-ai/wrangler.jsonc`。与管理后台共用 `sherlock-accounts` D1 及其 0005 迁移（取自管理台 c253f6c93，未经改写）。与公开更新和既有搜索、数据源 Worker 使用不同路由。默认只开放已登录用户的个人额度查询；目录为空，模型、图片和记忆关闭。不要在 Worker vars、本地设置或 Git 中保存密钥。

仅在火山明确授权目标应用、网关及使用账号之后，方可为该授权范围写入：

| Secret / 配置 | 用途 |
| --- | --- |
| `ARK_HOSTED_MODE=authorized-agent-plan` | 显式开启获准的推理路线 |
| `ARK_AUTHORIZED_ACCOUNT_IDS` | 逗号分隔的已授权 EWork 账号 ID，登录不等同于加入名单 |
| `ARK_AGENT_PLAN_KEY` | 获准用于该代理及账号范围的 Agent Plan 专属 Key |
| `ARK_ENABLE_SEEDREAM=true` | 文生图与改图获准后单独开启 |
| `ARK_ENABLE_OPENVIKING=true` 与 `OPENVIKING_USER_KEYS` | 获准后开启云记忆；后者为账号 ID 到独立 User Key 的 Secret JSON，拒绝跨账号复用同一 Key |

上线推理前，核对项目席位范围、关闭超额后付费、当前 AFP 系数、图片大小计费、D1 池限额和供应商账单。缺少可信完成用量或上游执行结果不明时保留预留，未自动重试；对账后由后台处理。模型接入及费用依据：[企业版兼容接口](https://docs.volcengine.com/docs/ark/agent-plan-enterprise-other-tools?lang=zh)、[企业版抵扣规则](https://docs.volcengine.com/docs/ark/agent-plan-enterprise-afp-credits-billing-rules?lang=zh)、[订阅套餐条款](https://docs.volcengine.com/docs/ark/subscription-package-service-terms-conditions?lang=zh)、[Seedream 接口](https://docs.volcengine.com/docs/ark/agent-plan-enterprise-visual-models?lang=zh)、[OpenViking 用户隔离](https://docs.volcengine.com/docs/vector_database_vikingdb/Databasesspaceandusers?lang=en)。

Seedream Pro 从第二张参考图起的扣减按企业版专门计费页的 6.5 AFP/张执行。视觉模型能力页另列 6.6 AFP/张，待供应商账单可见时核对。

聚焦验证：`node scripts/test-hosted-ai-worker.mjs` 运行本地 workerd + D1，模拟方舟与 OpenViking。客户端浏览器夹具加载现有探索模块并模拟 5 小时、周用量，签名客户端和真实供应商调用另行验收。

按本地构建手册启动签名测试包后，可运行 `node scripts/start-native-acceptance-services.mjs --hosted-ai`，将隔离客户端连接到脚本输出的本地服务。使用 `fixture.json` 里的「验收所有者」查看 11 个模型和 29% 的初始 5 小时余量，再用未开通的验收账号和退出状态核对模型菜单。这套服务使用真实登录与额度处理器、本地 D1 和合成数据，实际供应商调用需在线单独验收。
