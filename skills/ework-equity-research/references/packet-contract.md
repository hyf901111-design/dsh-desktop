# 研究包输入契约（v1）

使用 UTF-8 JSON，金额和比例一律是十进制**字符串**，不可先转换为浮点数。完整可运行格式见 `examples/synthetic/packet.json`；它全部使用虚构数据，不可改公司名后充当真实研究。

## 顶层

```json
{
  "schemaVersion": 1,
  "synthetic": false,
  "company": {"name": "公司全名", "ticker": "证券代码", "currency": "CNY"},
  "asOf": "2026-10-23",
  "financialAsOf": "2025-12-31",
  "sources": [],
  "facts": [],
  "calculations": [],
  "report": {"title": "{{company}}研究报告", "summary": [], "sections": []}
}
```

日期必须真实且为 ISO 日期；财务基期不能晚于研究日。sources/facts 必须非空；上面只是待填写骨架。ID 以英文字母开头，只含字母、数字、`_.-`，最多八十字符。v1 仅支持人民币，不能混合币种。

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

支持期间：`FY2025`、`2025Q1`、`2025H1`、`2025H2`、`2025-12-31`；原文 periodText 必须能对应指定期间。支持范围：`合并`、`母公司`。

单位与归一化：

| 输入 unit | 归一化 |
| --- | --- |
| CNY / CNY_10K / CNY_100M | 元 / 万元×一万 / 亿元×一亿 |
| shares / shares_10K / shares_100M | 股 / 万股×一万 / 亿股×一亿 |
| ratio / percent | 比例 / 百分数×百分之一 |
| CNY_per_share | 元/股 |

支持指标：`revenue`营业收入、`totalRevenue`营业总收入、`costOfRevenue`营业成本、`netIncome`净利润、`netIncomeAttributableToParent`归母净利润、`adjustedNetIncome`扣非净利润、`adjustedNetIncomeAttributableToParent`归母扣非净利润、`operatingProfit`、`operatingCashFlow`、`capex`、`fcff`、`cash`、`debt`、`nonOperatingAssets`、`minorityInterest`、`shares`、`currentPrice`、`grossProfit`、`grossMargin`、`assets`、`liabilities`。指标名与原文必须对应，不能把营业总收入充作营业收入、归母净利润充作净利润。金额指标只接受 CNY 家族单位，shares 只接受股数家族，currentPrice 只接受 CNY_per_share，grossMargin 只接受 ratio/percent；收入增长率不能当作收入金额。原文负数、分组符、量级均须核对。

## 确定性计算

```json
[
  {"id": "revenueYoY", "op": "yoy", "inputs": ["revenue25", "revenue24"]},
  {"id": "grossMargin25", "op": "grossMargin", "inputs": ["revenue25", "cost25"]}
]
```

按定义顺序执行，可引用之前计算的 ID。op 支持 `yoy`、`ratio`、`difference`、`sum`、`grossProfit`、`grossMargin`。sum 至少两项，其余恰好两项。所有输入须相同报表范围和归一化量纲；非同比还须同期间。同比须同指标且相隔一年同期间，基期必须为正。毛利两项依次为营业收入、营业成本。除零、缺失、混合口径均阻断；缺失值绝不自动补零。

结果内部使用 BigInt 有理数，计算链沿用未舍入值；事实与普通计算的 JSON 十进制输出保留最多二十四位小数，DCF 结果展示保留十八位，HTML 展示另外舍入。没有自动预测、财报三表联动或填补债务的能力。

## 报告叙事

```json
{
  "title": "{{company}}：盈利质量研究",
  "summary": [{"text": "{{period:revenue25}}营业收入为{{revenue25|yi}}，同比{{revenueYoY|pct}}。"}],
  "sections": [{"title": "风险与观察条件", "paragraphs": [{"text": "需要继续观察渠道和现金流改善是否持续。", "refs": ["revenue25"]}]}]
}
```

数字只能通过 `{{事实ID}}` 或 `{{计算ID}}` 引用。金额自动转亿元，比例自动转百分比；`|yi` 强制亿元、`|pct` 强制百分比、`|raw` 显示基础单位，格式量纲不符会阻断。期间用 `{{period:事实ID}}`；元数据用 `{{company}}/{{ticker}}/{{asOf}}/{{financialAsOf}}`。refs 为额外来源引用，不会让手写数字通过。程序阻止 ASCII 数字及部分中文金融数量词；自然语言中的隐藏定量判断仍须复核。

## 可选 DCF

只在用户需要且能明确全部价值桥与假设时添加 dcf。完整虚构例子见示例包。

- `scope`、`asOf`、`currency` 与研究包一致；`forecastTiming` 固定 `year-end-fixed-periods`。
- `scenarios` 必须恰含 `bear/base/bull`。每项含 `id,fcff,wacc,terminalGrowth,assumption`。fcff 是未来一至十个完整年期的手工金额字符串序列；使用元，非负。wacc 为比例且大于零、小于一；terminalGrowth 大于负一且小于 wacc。assumption 必须解释假设来源与理由。
- `bridge` 包含 `cash,debt,nonOperatingAssets,minorityInterest,shares`，每项是**已核对事实ID**；均须与 financialAsOf 日期及 scope 完全一致，非负、股本为正。缺失任何项都不估值，明确披露的零可以用原文零事实。
- `currentPrice` 可选，引用经核对 `currentPrice` 指标，元/股且为正，事实中必须有 `asOf` 价格时点且与研究日同日。否则不计算相对现价差异。
- 模型输出 `perShareValue`，不自动评级；完整未来期末折现未处理研究日至财年末的 stub period，不能冒充交易日目标价。含金融子公司的现金/资产、经营性与非经营性划分必须研究复核，避免重复加回。
