# 金融数据路由：密钥配置与启用

这份说明给维护 Sherlock 云端服务和安装包的同事使用。当前客户端通过已登录账户访问统一金融查询入口，服务端自动选择数据源。

## 谁配置、配置在哪里

有 Sherlock 既有 Cloudflare 账号管理权限的人配置一次即可；如果云端环境由同事维护，就由同事完成。每次制作安装包、每位用户首次使用时都不需要配置金融数据密钥。

| 项目 | 配置 |
| --- | --- |
| Worker | `sherlock-fund-data` |
| 配置文件 | `services/fund-data/wrangler.jsonc` |
| 同花顺 secret 名称 | `TONGHUASHUN_API_KEY` |
| 盈米 secret 名称 | `YINGMI_API_KEY`，保留已有值 |
| 客户端凭证 | 用户自己的应用登录凭证，由账户桥接发送 |

同花顺 key 的原值通过 Cloudflare secret 输入框或 Wrangler 的交互提示录入。不要把值填入 `wrangler.jsonc` 的 `vars`、安装包、插件配置、Git 或共享文档。本机钥匙串中的调试凭证不会自动同步到云端。

## 配置与部署步骤

1. 确认当前 Cloudflare 账号管理既有 `sherlock-fund-data`、`sherlock-releases` 和 `updates.evanarts.com`，并与仓库 `wrangler.jsonc` 的 `account_id` 一致。
2. 在 Cloudflare 控制台进入 **Workers & Pages → sherlock-fund-data → Settings → Variables and Secrets**，新增或更新类型为 **Secret** 的 `TONGHUASHUN_API_KEY`，保存并应用配置。已有 `YINGMI_API_KEY` 保留。
3. 使用已完成集成的源码部署金融服务。客户端发行仍按项目既有集成和发布流程执行。

也可以在源码仓库根目录使用命令行，key 在命令运行后的提示中粘贴，不能作为参数写在命令里：

```bash
npx wrangler whoami
npx wrangler secret put TONGHUASHUN_API_KEY --config services/fund-data/wrangler.jsonc
npx wrangler secret list --config services/fund-data/wrangler.jsonc
```

`secret list` 只用于核对两个 secret 名称是否存在，不显示值，也不证明供应商权限有效。部署脚本要求显式设置与上述配置一致的 `CLOUDFLARE_ACCOUNT_ID`，并在写入前检查既有发布桶：

```bash
# 先把此处替换成已确认的 32 位正式账号 ID。
export CLOUDFLARE_ACCOUNT_ID='替换为已确认的正式账号ID'
npm run fund-service:deploy
```

先部署支持 `operation: financial` 的服务端，再分发启用统一查询入口的客户端。更新 secret 不会自动把本地功能分支的代码部署上去。

## 启用后的实际检查

在登录后的集成客户端依次询问：

- “同花顺这只股票现在多少钱？”：应识别 `300033.SZ`，返回证券自身行情时间、单位和时效状态。“同花顺”作为证券名称可以显示。
- “查沪深300ETF 510300 的交易价格和单位净值”：应分开显示交易价格和单位净值，保留各自日期。
- “比较这两只基金”：选择两只明确代码，验证盈米基金查询仍正常。
- “查一分钟 K 线”：当前应明确提示暂不支持，不能用日线代替。

结果和会话进度显示业务内容，不要求用户选择同花顺、盈米或 MCP 服务。若接口异常，应提示数据暂缺、过期或不可用，不能当作“无变化”。

健康检查 `/v1/fund-research/health` 返回 `ready` 只表示必要绑定及至少一个数据源凭证存在；不能用它替代股票、基金两条实际查询链路验收。

## 方舟专业数据集与豆包搜索

`sherlock-fund-data` 通过 `VOLCENGINE_AGENT_PLAN_KEY` Worker Secret 使用方舟 Agent Plan 企业版席位。席位的专业数据集和豆包搜索需开启 Harness 套餐抵扣。轮换时使用 Cloudflare 的 Secret 输入框，或在以下命令的交互提示中录入新的企业版密钥：

```bash
npx wrangler secret put VOLCENGINE_AGENT_PLAN_KEY --config services/fund-data/wrangler.jsonc
```

登录后的客户端使用 `/v1/datapro/mcp` 调用只读 `dataPro_search`，并在默认搜索模式下通过 `/v1/doubao/search` 获取可引用网页。Worker 只将检索词及必要参数发送给各自的供应商接口。两条路由沿用 EWork 登录鉴权，独立按账号限流。

轮换后用登录的客户端分别查询一个明确的证券代码和一条公开网页信息，检查工具返回数据和来源链接。匿名 POST 应收到 HTTP 401。

## 分钟数据范围

2026-09-08 使用已授权账户实际读取 A 股 MCP 工具目录，共 21 个工具；历史行情 `get_a_share_prices_historical` 的 `interval` 枚举为 `1d`、`1w`、`1mo`，没有分钟 K 线。最新行情快照可查询，并由应用检查行情时间是否满足 60 秒时效目标；它不等于历史一分钟 K 线。

同花顺的[官方项目说明](https://fuyao.aicubes.cn/docs/introduction/)也将此接口的历史 K 线范围列为日、周、月。若需要历史分钟 K 线，应由同花顺确认可授权的具体接口或产品，并提供相应接口定义；取得可用接口后再增加经过验证的路由和分钟时间戳映射。仅把当前 key 重新配置到云端不会增加这项能力。
