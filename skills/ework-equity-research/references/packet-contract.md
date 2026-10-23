# 研究包输入契约（v2；兼容 v1）

使用 UTF-8 JSON，金额和比例一律是十进制**字符串**，不可先转换为浮点数。旧版兼容算术包见 `examples/synthetic/packet.json`；它全部使用虚构数据，不符合默认 V5 完整合同，不可改公司名后充当真实研究。新包由 init 生成 v2 full 骨架，逐项补齐真实证据。

## 顶层

```json
{
  "schemaVersion": 2,
  "synthetic": false,
  "company": {"name": "公司全名", "ticker": "证券代码", "currency": "CNY"},
  "asOf": "2026-10-23",
  "financialAsOf": "2026-06-30",
  "valuationAsOf": "2026-10-22",
  "entityScopes": [],
  "sources": [],
  "facts": [],
  "calculations": [],
  "report": {"title": "{{company}}研究报告", "summary": [], "sections": []}
}
```

日期必须真实且为 ISO 日期；日期次序为 `financialAsOf ≤ valuationAsOf ≤ asOf`。估值日可与研究日不同，股本按估值日独立核对。sources/facts 必须非空；上面只是待填写骨架。ID 以英文字母开头，只含字母、数字、`_.-`，最多八十字符。当前仅支持人民币，不能混合币种。v1 包保留旧计算模式，不能标为 V5 完整。

## 来源台账

每个来源填写：`id,title,publisher,kind,textFile,sha256,publishedAt,accessedAt`；可加原始公开 `url`。`kind` 为 `text-snapshot` 或 `pdf-extract`。路径相对 packet.json 所在目录；拒绝路径穿越、越界符号链接及超过大小上限的文件。

```json
{
  "id": "annual",
  "title": "公司年度报告",
  "publisher": "公司",
  "kind": "text-snapshot",
  "textFile": "source.txt",
  "sha256": "用 hash 命令得到的完整 SHA256",
  "publishedAt": "2026-04-17",
  "accessedAt": "2026-10-23",
  "url": "https://example.com/original-report"
}
```

publishedAt 不得晚于 asOf 或 accessedAt；回溯研究允许 accessedAt 晚于研究截止日，必须保留真实访问时间。

原文可以保留来自网页的可见文本。不得编写一段“像原文”的文字作为证据。PDF 提取还必须提供 `originalFile`、`originalSha256` 与 `extraction:{method,pages:[{page,lineStart,lineEnd}]}`，保留原 PDF，并将页面映射到 textFile 的真实行号。程序核对文件哈希与提取页定位，不能证明抽取忠实度、URL 与发布者真实性；关键表格必须回看 PDF。

## 事实与原文定位

原文按 LF 分行，行、列、PDF 页号均从一开始。表格多列定位仅接受实际 Tab 分隔的 TSV，保留真实列标题；PDF 提取的连续空白表格须根据原页忠实转换并复核列对应。下面是一个**虚构**表格：

```text
范围：合并
单位：万元
指标\tFY2024\tFY2025
营业收入\t100\t120
```

其中 `\t` 表示实际 Tab，不是两个字面字符。对应当期事实：

```json
{
  "id": "revenue25", "metric": "revenue", "period": "FY2025",
  "scope": "合并", "unit": "CNY_10K", "value": "120", "sourceId": "annual",
  "evidence": {
    "quote": "范围：合并\n单位：万元\n指标\tFY2024\tFY2025\n营业收入\t100\t120",
    "locator": {"lineStart": 1, "lineEnd": 4, "valueLine": 4, "column": 3},
    "metricText": "营业收入", "periodText": "FY2025", "scopeText": "合并",
    "unitText": "万元", "valueText": "120"
  }
}
```

quote 必须与定位到的完整原文行逐字一致；valueLine 是取值所在绝对行号。多行窗口必须指定 valueLine，多期间表必须指定 column，表头期间须与数值同列。指标须绑定到数值列之前最近的指标标签，同列期间使用最近有效表头；数值行明确单位优先，否则使用最近单位表头。范围可来自窗口内明确报表标题或范围标记。窗口若同时出现两种明确报表范围标记，必须缩小到可明确判定的范围；指标中的“归属于母公司股东”可以与合并标题共存。

支持期间：`FY2025`、`2025Q1`、`2025H1`、`2025H2`、`2025-12-31`；原文 periodText 必须能对应指定期间。财务支持范围：`合并`、`母公司`；v2可用 `entityScopes:[原文实体全名]` 声明需单独核验的真实子公司等实体，事实scope可用已声明实体，但证据窗口仍须显式唯一范围。逐日行情另用 `市场`，并记录与原文一致的 `securityId`。

单位与归一化：

| 输入 unit | 归一化 |
| --- | --- |
| CNY / CNY_10K / CNY_100M | 元 / 万元×一万 / 亿元×一亿 |
| shares / shares_10K / shares_100M | 股 / 万股×一万 / 亿股×一亿 |
| ratio / percent | 比例 / 百分数×百分之一 |
| CNY_per_share | 元/股 |
| index_points | 指数点（不视为金额） |

支持指标：`revenue`营业收入、`totalRevenue`营业总收入、`costOfRevenue`营业成本、`netIncome`净利润、`netIncomeAttributableToParent`归母净利润、`adjustedNetIncome`扣非净利润、`adjustedNetIncomeAttributableToParent`归母扣非净利润、`operatingProfit`、`operatingCashFlow`、`capex`、`fcff`、`cash`、`debt`、`nonOperatingAssets`、`minorityInterest`、`shares`、`currentPrice`、`grossProfit`、`grossMargin`、`assets`、`liabilities`。指标名与原文必须对应，不能把营业总收入充作营业收入、归母净利润充作净利润。金额指标只接受 CNY 家族单位，shares 只接受股数家族，currentPrice 只接受 CNY_per_share，grossMargin 只接受 ratio/percent；收入增长率不能当作收入金额。原文负数、分组符、量级均须核对。v2另支持 `depreciationAmortization`折旧摊销、`tradeNwc`贸易营运资本、`financialNetAssets`金融实体净资产（CNY家族）、`indexLevel`指数收盘（仅index_points）、`cashDividendPerShare`每股现金红利（仅CNY_per_share）。

## 确定性计算

```json
[
  {"id": "revenueYoY", "op": "yoy", "inputs": ["revenue25", "revenue24"]},
  {"id": "grossMargin25", "op": "grossMargin", "inputs": ["revenue25", "cost25"]}
]
```

按定义顺序执行，可引用之前计算的 ID。op 支持 `yoy`、`ratio`、`difference`、`periodDifference`、`quarterFromCumulative`、`sum`、`grossProfit`、`grossMargin`。sum 至少两项，其余恰好两项。所有输入须相同报表范围和归一化量纲；除 `yoy`、`periodDifference` 与 `quarterFromCumulative` 外须同期间。`periodDifference` 只接受已核验原始金额事实，且须同指标、同范围、CNY 金额、相邻年度的相同财政频率（FY/H/Q），结果为第一个输入减第二个，结果期间取较新期；允许反向输入表达成本增加的负贡献。普通 `difference` 的同期间约束不变。同比须同指标且相隔一年同期间，基期必须为正。毛利两项依次为营业收入、营业成本。除零、缺失、混合口径均阻断；缺失值绝不自动补零。

结果内部使用 BigInt 有理数，计算链沿用未舍入值；事实与普通计算的 JSON 十进制输出保留最多二十四位小数，legacy DCF输出保留十八位，v2驱动模型输出最多二十四位，HTML展示另外舍入。普通计算不自动形成预测或填补债务；驱动预测使用下述专门模型，不声称完整财报三表联动。

## 报告叙事

```json
{
  "title": "{{company}}：盈利质量研究",
  "summary": [{"text": "{{period:revenue25}}营业收入为{{revenue25|yi}}，同比{{revenueYoY|pct}}。"}],
  "sections": [{"title": "风险与观察条件", "paragraphs": [{"text": "需要继续观察渠道和现金流改善是否持续。", "refs": ["revenue25"]}]}]
}
```

数字只能通过 `{{事实ID}}` 或 `{{计算ID}}` 引用。金额自动转亿元，比例自动转百分比；`|yi` 强制亿元、`|pct` 强制百分比、`|raw` 显示基础单位，格式量纲不符会阻断。期间用 `{{period:事实ID}}`；元数据用 `{{company}}/{{ticker}}/{{asOf}}/{{financialAsOf}}`。refs 为额外来源引用，不会让手写数字通过。程序阻止 ASCII 数字及部分中文金融数量词；自然语言中的隐藏定量判断仍须复核。

## 默认驱动 DCF 与旧版兼容

v2完整经营研究采用 `dcf.method: "driver-fcff-v2"`；质量、方法适用性及必须展示的推导见 [驱动预测与估值](valuation-quality.md)。必须具备六年保守/基准/乐观经营驱动、CAPM/WACC、实际日期余期与现金滚动、终值再投资、归属/股权桥、独立估值日股本、敏感性及反向估值。不能以手工 FCFF 数列替代。

金融主体或其他 DCF 不适用对象显式记录 `methodGap`，说明适用方法、未执行部分、结论影响和补证动作；缺口状态不构成完整估值。混业公司金融股权、所有权比例和现金边界是公司输入，不内置个案常量。`methodGap` 放 packet 顶层，形状为 `{method,reason,missing,impact,nextStep,refs}`；refs引用已核验原ID，完整性仍为false。精确字段见 [驱动模型输入](driver-input.md)；经济判断仍需研究复核。

v1 `year-end-fixed-periods` 仍可兼容旧包：三情景手填未来完整年期 FCFF 与同财务基期现金/债务/非经营资产/少数权益/股本桥；仅做固定年期算术检查。它不处理估值日 stub 或现金滚动，不满足 V5 完整合同，不是交易日目标价。旧事实/结果缺失不能填零补齐。

## 市场日序列（v2）

`market` 使用已核验事实引用，不接受手填归一化路径或收益率：

```json
{
  "valuationAsOf": "2026-10-22",
  "windowStart": "2025-10-22", "windowEnd": "2026-10-22",
  "priceBasis": "unadjusted-price", "currency": "CNY",
  "benchmark": {"name": "真实基准名称", "ticker": "真实基准代码"},
  "rows": [{"date": "2025-10-23", "stockRef": "stockDailyFirst", "benchmarkRef": "indexDailyFirst", "stockCrossCheckRef": "stockDailyFirstControl"}],
  "dividends": [{"date": "2026-06-30", "amountRef": "dividendCashPerShare"}],
  "completeness": {"expectedDates": ["实际共同交易日期"], "calendarObservationRef": "verifiedCalendar", "method": "日期覆盖核对方法", "note": "停牌/节假日/差异说明"},
  "limitations": ["来源与权限等残余限制"]
}
```

上例是字段形状，不是可运行的完整日序列。`rows` 实际包含整个窗口的共同日期；每行日期严格递增/唯一，`stockRef` 引用 `currentPrice`、`benchmarkRef` 引用 `indexLevel`，`scope:"市场"`、`securityId` 匹配原文。可选交叉引用必须是同证券同日同口径核验值。基准的 `indexLevel` 不得当人民币金额或股价。金额/点数与日期均从快照绑定，窗口向前一日历年，实际共同交易日边界允许合理休市偏差（引擎上限五日）。`expectedDates` 为有原文观察支持的真实共同交易日列表，不生成工作日冒充交易日；原文观察的quote必须包含全部expectedDates，与 rows 对照缺漏；完整序列受引擎一百八十至四百共同日边界约束、末日必须为valuationAsOf，但绝不固定某个案交易日数量。未复权价格表现与总回报、分红边界及权限限制见 [市场标准](market-quality.md)。

## 最近已披露四季度（v2）

```json
{
  "latest": "2026Q2",
  "quarters": [{"period": "2026Q2", "revenueRef": "revenue26q2", "parentNetIncomeRef": "parentProfit26q2", "operatingCashFlowRef": "cfo26q2", "priorRevenueRef": "revenue25q2", "priorParentNetIncomeRef": "parentProfit25q2"}],
  "disclosureSearch": {"asOf": "2026-10-23", "refs": ["disclosureSearchObservation"], "note": "最新已披露期间与检索范围"}
}
```

`quarters` 实际为截止 `latest` 的连续四季，金额引用原始事实或受控 `quarterFromCumulative` 结果；prior 对上年同季且同指标/范围。`disclosureSearch.refs` 引用已核验 observation，说明已检查的披露范围，不因当前年份/季度自动判断已披露。

`quarterFromCumulative` 恰好两个同公司/财年/范围/单位/指标的累计金额输入，按较晚累计减较早累计：`[H1,Q1]→Q2`、`[Q3累计,H1]→Q3`、`[FY,Q3累计]→Q4`。Q3累计事实显式 `periodBasis:"cumulative"`；季度单列事实显式 `periodBasis:"standalone"`，不能将九个月金额混入Q3单季。该运算不放宽普通 `difference` 同期间限制。未取得同比基期或经营现金时标缺口，不把未披露季预测补成实绩。

## 正式出版元数据

`report.title` 为观点主标题。可选 `report.publication` 只允许 `companyShortName`、`reportType`、`industry`；简称和行业为最多八十 Unicode 字符的纯文本。reportType 只允许“公司研究报告”“财报点评报告”“公司研究简报”，full 缺省公司研究报告、brief 缺省公司研究简报。财务期别从 financialAsOf 推导，研究日期取 asOf；引擎计算正式副标题及安全双文件名，不接收自定义路径。

```json
{"title":"渠道重塑中的盈利与现金再验证","publication":{"companyShortName":"贵州茅台","reportType":"公司研究报告","industry":"白酒"},"summary":[{"label":"中期业绩","text":"{{period:revenue26h1}}营业收入{{revenue26h1|yi}}。"}]}
```

summary 的可选 label 也进入原有数字模板校验，不得隐藏手填数字。新增可核验披露指标 `basicEarningsPerShare`、`dilutedEarningsPerShare`、`netAssetsPerShare` 只接受 CNY_per_share；`returnOnEquity` 只接受 ratio/percent。指标必须匹配原文受控别名和实际单位，不能将每股收益当现价或任意比率当ROE。

`run.json.artifacts` 将 html/pdf/evidence/calculations/validation/quality/manifest 映射到实际 basename，仅列实际文件；`outputs` 以实际 basename 为键保存 hash。辅助 JSON 名稳定，双报告名是正式名称。客户端回执给实际绝对路径；成功须显式映射、必需摘要与 PDF 字节记录一致，失败/取消恢复的入口不构成已验证交付。


## 完整研究与专题展示（引擎版本起始于一代增强版）

`report.profile` 默认由 init 写为 `full`（schemaVersion:2）；旧输入缺省为 `brief` 并显式标记非完整研究。完整输入需 `summary`、`theses` 及唯一覆盖 `business/industry/performance/profitability/balance/cashflow/forecast/valuation/risks/monitoring` 的章节。

`theses` 每项：`statement/inference/assumption/falsifier/monitoring` 为研究文字字符串，`evidenceRefs` 引用已核验事实、计算或原文观察。全部定量仍使用数值token。

`sections` 每项增加 `kind` 与 `status: supported|partial|missing`。已支持章节需有证据支持正文；partial/missing 需 `gap: {missing,impact,nextStep}`。支持与否由作者声明，程序检查引用与范围，不能替代分析师判断。v2 full 缺 DCF、市场或四季度时，对应 forecast/valuation、performance 等章节必须 partial/missing 并写 gap，不能声明 supported 冒充完整。

`observations` 为逐字披露摘录：`{id,sourceId,quote,locator:{lineStart,lineEnd,page}}`。最多三百项、每项窗口最多四十一行；PDF需正确页码且窗口位于同一提取页。与facts/calculations共用唯一ID。正文用refs引用，或用 `{{observation:ID}}` 展示原文。其数字是披露摘录，不能作为算术输入；需要计算时另建严格的fact。

专题表：章节内 `tables:[{title,columns:[文字],rows:[[{text,refs?},...],...]}]`，最多八列八十行，单元格使用与段落一致的token与引用。

兼容的专题柱图（缺省 kind 为 bar）：`charts:[{title,series:[{name,refs:[fact或calcID,...]}]}]`。每系列两个至八个同指标、同单位、同口径、同频率期间；最多四系列，各系列期间对齐。禁止混画全年与半年，数据标签与来源自动生成。

新增金额指标：`sellingExpenses` 销售费用、`administrativeExpenses` 管理费用、`taxesAndSurcharges` 税金及附加、`inventory` 存货、`contractLiabilities` 合同负债、`researchExpenses` 研发费用、`financeExpenses` 财务费用。资产负债表原文中文年月日可归一化为ISO事实期间，禁止伪造原文表头。

`run` 默认输出HTML+PDF，`--format html` 为明确的单格式选项。PDF导出失败时仍保留HTML与诊断但非零退出，manifest status为pdf-failed；不能把快照/算术通过说成双格式已交付。


客户端调用入口为 `research_report`，参数只允许 `{command:"doctor"}`、`{command:"validate",input:"相对packet路径"}`、`{command:"run",input:"相对packet路径",out:"工作区根下一层新目录名"}`。不接受自定义脚本、env、format、工作区或会话身份。该工具在可信运行时内把PDF连接仅注入固定内置CLI；Bash的敏感环境过滤保持有效。


多期 `line`、收入与同比 `combo`、严格闭合 `waterfall` 的结构和证据边界见 [研究图表标准](chart-quality.md)。不要给 report 或 chart 传入任意 SVG、脚本、图片路径、URL 或自定义 Logo；官方 Logo 由固定内置资源提供，计入 engineSha256。


## V5 完整性与双格式状态

`report-quality.json` 与 `run.json` 的 `researchRequirements` 为 `{standard:"ework-equity-v5",complete,missing:[{area,missing,impact,nextStep}]}`。完整性要求见 [完整研究合同](research-quality.md)；缺项显式进入对应章节/封面状态。`delivery.completed:["html","pdf"]` 只表示同源文件生成，不能代替 `researchRequirements.complete:true`。缺资料可保留 `rendered-with-gaps` 双格式中间稿，继续补证；v1/brief/legacy固定年期成功不构成 V5 完整。


## 受控模型文字引用（v2）

报告正文/摘要可用程序发布的受控ID，不能手填模型数值：`{{dcf.base.perShareValue}}`、`{{dcf.base.wacc|pct}}`；市场使用 `{{market.stockReturn|pct}}`、`{{market.benchmarkReturn|pct}}`、`{{market.relativeReturn|pct}}` 与 `{{market.excessPercentagePoints}}`；单季如 `{{quarter.2026Q2.revenue|yi}}`，季度按真实期间变化。仅引用同次成功结果，实际已发布ID/单位以计算输出为准；相对收益与两者收益差的百分点含义不同，不能混标。图表与自动模型表仍从同次结构化结果渲染。

## 原财报表头与上下文（v2）

原文的“本期金额/上期金额”和股份变动多层表头不能改写成日期再冒充原件。可在`evidence`使用受控映射，仍保存原quote、PDF及提取hash、实际页/行/列：

- `periodMapping:{kind:"report-current-prior",reportTitleLine,reportPeriodText,headerLine,role:"current"|"prior"}`：真实报告标题和同列原表头须在本证据窗口、目标值之前；仅从本期/上期受控字面映至该报告期/同频上一年。不能借此映射期初余额。
- `periodMapping:{kind:"share-capital-period-end",reportTitleLine,reportPeriodText,groupHeaderLine,subHeaderLine}`：只适用股份总数、最后“本次变动后”的数量列。选中列必须与原数量/比例子表头对应，原单位为股；报告期末由程序推导，不能拿实收资本人民币元当股数。
- `scopeContext:{quote,locator:{lineStart,lineEnd,page},scopeText}`：同源原文明确范围标题的逐字有界窗口。标题须在目标之前；到值行不能跨越母公司/合并等范围切换，PDF中间各页必须连续完整映射。公司页眉不改变合并报表范围；发行人股本/股利的公司全名须在`entityScopes`声明并有真实标题。
- `unitMapping:{kind:"per-share-currency"}`：仅当受控每股股利/EPS/每股净资产指标原文已明确“每股”、字面单位为元/人民币元时，将原值解释为CNY_per_share。不支持普通财务金额或报价借用，不支持万元等倍率。

这些映射验证声明与原文结构一致，仍不证明PDF抽取忠实性。关键页面必须目视核对。未知映射字段、错误角色/单位/数量列、跨源或不连续页均阻断。

`market`与DCF的估值日和收盘价须一致；选择的单季收入能够加总为同年度/累计财务基期时，必须与DCF收入基数精确勾稽。所选原文明确复权或累计时，不能靠metadata重标为未复权/单季；相邻列有不同口径时，只检查目标行与所选列。
