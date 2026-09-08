# 基金研究能力扩展

本次把已审阅清单中的 58 个新增工具及原有 2 个工具纳入同一只读能力目录。数据来源为[盈米官方 MCP 目录](https://github.com/yingmi-dev/Yingmi-MCP)（2026-09-08）。本页描述代码实现；不代表已部署或真实账户的全部能力已经试调用成功。

## 用户如何使用

用户在原研究对话或研究画布中提出基金问题即可，不需要配置数据源密钥。模型可使用三个已注册工具：

- fund_research：保留单基金、2—6 只基金比较、资产/行业配置、净值近期变化四任务。类型校验扩展到主动权益、混合、债基、货币、FOF、QDII；基础标准化结果仍要求有日期的人民币单位净值。外币份额、缺少单位净值或未知类型不能强行套用；需要通过能力目录查询原始披露口径。
- fund_research_catalog：无参数返回 60 项能力摘要；category 按分类筛选；capability 返回该工具当前账户的参数定义、说明和 schema_hash。
- fund_research_query：输入 capability、schema_hash 和 arguments_json。参数以实时 Schema 为准，结果中的 data_json 可解析为数据、文本、多段文本或保留来源链接的混合内容。模型按具体结果组织研究表格或分析。

例如“查找机器人主题基金并比较风险”应先查询 discovery 目录、获取搜索参数定义、核对候选代码，再调用 performance 类能力。不能把搜索返回的候选集合说成全市场完整名单；有歧义时先核对份额、基金类型和名称。

组合权重、投资期限、风险目标等只从用户明确输入取得。不得为了凑齐参数而自行编造。股票相关能力以基金权益持仓为对象，不承诺独立个股行情、K 线、财务报表和交易。

## 服务端与结果契约

复用已登录账户的本机桥接和 POST /v1/fund-research/query，未新增公网路由或匿名入口。旧请求形状不变，新请求使用 operation=catalog 或 execute，字段必须严格匹配。

- 静态映射限制为下表 60 项；动态发现不能扩张授权范围，不包含交易、家庭财务、图表或文件工具。
- 参数定义从固定数据端点的 tools/list 获取，支持分页；目录失败不使用虚构的静态参数。显示 available、unavailable、incompatible，available 仅说明工具定义可用。
- 使用 @cfworker/json-schema 4.1.1 解释器验证 Schema，支持嵌套、数组、必填、枚举、数值范围和本地引用。拒绝外部引用和过大/过深的定义，不在 Worker 中执行动态代码生成。
- schema_hash 将调用绑定到读取的定义；首次调用和会话重建后定义变化均拒绝执行，需重新查定义。新目录不持久缓存，避免重新查询仍拿到旧定义。
- 请求上限 16 KiB，旧任务仍保留 2 KiB 限制；输出上限 64 KiB，上游单响应上限 1 MiB。超大结果返回缩小范围提示，不截断后伪装完整。
- 保留账户鉴权、每分钟限流、并发限制与持久每日预算。新目录与新查询均占用预算；新增查询不写入持久结果缓存，组合金额/权重等也不写入存储；同参数并发只在本次内存中共享。旧任务保留原缓存。
- 工具自身错误、参数错误、定义变化、账户工具缺失、格式不兼容、结果过大分别返回错误。tools/call 的 JSON-RPC 参数错误（-32602）和 isError 工具错误均只影响当前请求；初始化、目录获取或上游内部故障仍沿用全局冷却策略。上游错误正文和诊断数据不向客户端透传。
- 结果保留接收时间、原始响应哈希和请求哈希。received/empty 与 quality_state=unverified 明确区分“已收到资料”和“已核验事实”；接收时间不是数据日期。标准化的旧任务继续使用原有证据、日期与质量结构。
- 结构化 JSON、单段 JSON 文本、普通文本（含 TOON）、多段文本继续使用原返回形状。混合内容使用 `{ content: [...] }`，同时有结构化数据时使用 `{ structuredContent, content: [...] }`；保留资源链接、嵌入资源的文本、补充说明和注释。只去除没有额外元数据的结构化 JSON 重复文本。不加载资源链接、不执行 HTML 或输出中的指令。
- 混合结果包含不支持的图片、音频或二进制资源时，limitations 明确说明缺失，不能当作完整资料；仅有不支持内容的结果仍返回错误。脱敏只处理凭据字段、凭据文本和 URL 中的敏感参数，保留公开机构名称、正文、字段名称与来源域名。

## 能力映射

| 分类 | 产品能力 ID | 名称 | 服务端工具 |
|---|---|---|---|
| basic | fund_detail | 基金详情 | `BatchGetFundsDetail` |
| basic | fund_nav_history | 基金历史净值 | `BatchGetFundNavHistory` |
| discovery | search_funds | 搜索基金 | `SearchFunds` |
| discovery | guess_fund_code | 基金名称匹配代码 | `GuessFundCode` |
| discovery | popular_funds | 近期热门基金 | `GetPopularFund` |
| discovery | screen_equity_turnover | 按基金持股换手率筛选 | `filterStockFundByStockTurnover` |
| performance | fund_performance | 基金业绩比较 | `GetBatchFundPerformance` |
| performance | fund_risk | 基金风险分析 | `AnalyzeFundRisk` |
| performance | fund_diagnosis | 基金综合诊断 | `GetFundDiagnosis` |
| performance | drawdown_recovery | 回撤修复能力 | `fund-recovery-ability` |
| performance | fund_benchmark | 合同业绩基准 | `getFundBenchmarkInfo` |
| holdings | equity_position | 权益仓位偏好 | `fund-equity-position` |
| holdings | industry_allocation | 行业配置 | `getFundIndustryAllocation` |
| holdings | fund_turnover | 基金换手率 | `getFundTurnoverRate` |
| holdings | equity_valuation | 基金持股估值与盈利 | `getStockAllocationAndMetricsByFundCode` |
| holdings | fund_asset_classes | 基金资产大类分布 | `GetFundAssetClassAnalysis` |
| holdings | industry_concentration | 行业集中度 | `getFundIndustryConcentration` |
| holdings | industry_preference | 行业偏好 | `getFundIndustryPreference` |
| holdings | sector_preference | 板块偏好 | `fund-sector-preference` |
| holdings | qdii_regions | QDII 地区配置 | `getQdFundAreaAllocation` |
| attribution | brinson_attribution | Brinson 收益归因 | `getFundBrinsonIndicator` |
| attribution | industry_returns | 行业收益 | `getFundIndustryReturns` |
| attribution | market_timing | 权益仓位择时 | `getMarketTimingIndicator` |
| portfolio | portfolio_risk | 组合风险 | `AnalyzePortfolioRisk` |
| portfolio | fund_correlation | 基金相关性 | `GetFundsCorrelation` |
| portfolio | portfolio_allocation | 组合资产配置 | `GetAssetAllocation` |
| portfolio | portfolio_backtest | 基金组合回测 | `GetFundsBackTest` |
| portfolio | portfolio_simulation | 组合情景模拟 | `MonteCarloSimulate` |
| portfolio | portfolio_diagnosis | 基金组合诊断 | `DiagnoseFundPortfolio` |
| portfolio | portfolio_nav_history | 组合历史净值 | `GetPortfolioNavHistory` |
| rules | trade_rules | 基金申赎规则 | `BatchGetFundTradeRules` |
| rules | trade_limits | 基金交易限制 | `BatchGetFundTradeLimit` |
| rules | fund_dividends | 基金分红记录 | `BatchGetFundsDividendRecord` |
| rules | fund_splits | 基金拆分记录 | `BatchGetFundsSplitHistory` |
| bonds | bond_risk | 债基风险指标 | `getBondIndicator` |
| bonds | campisi_attribution | Campisi 债券归因 | `getFundCampisiIndicator` |
| bonds | bond_allocation | 券种配置 | `getBondAllocationByFundCode` |
| bonds | bond_dive_count | 债基净值异动统计 | `getFundDiveCount` |
| bonds | bond_credit_ratings | 信用评级分布 | `getBondFundCreditRatingLevel` |
| bonds | bond_alerts | 净值异动债基查询 | `getBondFundWithAlertRecord` |
| bonds | screen_bond_type | 按券种筛选债基 | `filterBondFundByBondType` |
| bonds | screen_bond_credit | 按信用评级筛选债基 | `filterBondFundByCreditRating` |
| news | financial_news | 财经新闻 | `SearchFinancialNews` |
| news | manager_views | 基金经理观点 | `SearchManagerViewpoint` |
| news | hot_topics | 热点财经话题 | `SearchHotTopic` |
| news | news_analysis | 资讯 AI 解读 | `searchRealtimeAiAnalysis` |
| news | advisor_content | 投顾内容 | `searchInvestAdvisorContent` |
| news | market_temperature | 市场温度计 | `GetLatestQuotations` |
| strategies | strategy_detail | 投顾策略详情 | `GetStrategyDetails` |
| strategies | strategy_asset_classes | 策略资产分布 | `GetStrategyAssetClassAnalysis` |
| strategies | strategy_holdings | 策略持仓 | `BatchGetStrategiesComposition` |
| strategies | strategy_risk | 策略风险 | `GetStrategyRiskInfo` |
| strategies | strategy_benchmark | 策略基准 | `GetStrategyBenchmark` |
| strategies | strategy_trade_composition | 策略交易成分查询 | `BatchGetPoTradeComposition` |
| strategies | fund_related_strategies | 按重仓基金查找策略 | `GetFundRelatedStrategies` |
| strategies | search_strategies | 搜索投顾策略 | `StrategySearchByKeyword` |
| strategies | strategy_risk_matching | 策略风险匹配 | `BatchGetStrategyRiskInfo` |
| planning | asset_allocation_plan | 资产配置方案 | `GetAssetAllocationPlan` |
| planning | fund_investment_plan | 基金投资方案 | `GetCompositeModel` |
| planning | investment_performance | 投资方案表现分析 | `AnalyzeInvestmentPerformance` |

## 验证与部署顺序

1. 安装新增依赖：npm ci。不要只复制新 JS 文件而遗漏 package-lock.json 和运行时依赖。
2. 运行 npm run test:fund-service、npm run typecheck 和 npm run fund-service:check。测试上游均为合成数据；Workers 测试使用真实 workerd、D1 和 SQLite Durable Object，账户测试运行本地回环端口。
3. 如当前进程已安全配置 YINGMI_API_KEY，运行 npm run fund-service:capabilities。此命令仅发现目录，不调用业务工具、不输出密钥或原始返回。未配置时明确返回 not_verified；目录可用也不能替代业务样本验证。
4. 在已授权的服务端发布流程中先升级 Worker，保持既有 secret 和账户绑定，再用实际账户验证代表性搜索、业绩风险、归因、组合、债基、资讯、策略和规划样本。之后按仓库流程集成、验收并分发客户端。旧 Worker 不认识新 operation 时应显示不可用，不能用旧能力假冒新结果。

本次开发验证：全部 60 项映射的协议测试；真实 Workers 中 8 类代表性调用、复杂 Schema、超过 2 KiB 的请求、账户认证、全局预算和错误隔离；旧四任务回归。当前进程未配置数据源凭据，真实账户目录和真实业务数据仍未核验。

上游目录采用 MIT License（Copyright (c) 2026 yingmi-dev）；[原许可](https://github.com/yingmi-dev/Yingmi-MCP/blob/main/LICENSE)。JSON Schema 校验库依赖按其 MIT 许可分发。
