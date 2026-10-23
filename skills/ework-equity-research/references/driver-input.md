# driver-fcff-v2 输入与结果

与 [估值质量标准](valuation-quality.md) 配套。所有经济数值为十进制字符串，所有 `*Ref` 指向本次已核验事实、成功计算或显式参数；参数的 `refs` 只能指向已核验事实/计算/原文观察，不能自我引用或只引用另一个假设。未知字段、错量纲或未核验引用会阻断。

## 顶层与参数

`packet.dcf` 的字段：

| 字段 | 合同 |
|---|---|
| method | 固定 `driver-fcff-v2` |
| valuationAsOf / currency | 与packet统一的估值日及 `CNY` |
| businessType | `non-financial` 或 `mixed`；纯金融主体不进入工业FCFF |
| baseFY / interim | 最近完整财年及随后已披露累计期的历史输入；财务基期恰为完整财年末时可省interim |
| operatingBoundary | `{kind,reason,refs}`，非金融经营边界及可追溯依据；mixed强制non-financial-proxy |
| parameters | 显式假设/代理台账，最多五百项 |
| wacc | CAPM与资本结构引用 |
| scenarios | 恰含 `bear/base/bull` |
| bridge | 归属、现金、债务、金融股权及估值日股本/现价 |
| sensitivities | WACC/g、Beta、现金及适用金融PB压力引用 |
| reverseGrowth | 完整研究要求 `{requested:true,lowerGrowthRef,upperGrowthRef}`，显式增长求解区间 |

参数形状：

```json
{"id":"selectedBeta","label":"选定经营Beta","value":"1.1","unit":"ratio","kind":"assumption","reason":"根据有定位的行业代理选取，并说明公司适用性。","refs":["verifiedIndustryBetaObservation"],"asOf":"2026-10-22"}
```

`id` 全包唯一，`label` 可选；`kind` 为 `assumption` 或 `derived-proxy`，`reason` 非空，`refs` 非空且最多八十项。`unit` 仅 `ratio/CNY/shares/CNY_per_share`；日期敏感参数必须有 `asOf`。来源支持选值理由，不会把参数升级为披露事实。`value` 不能是 JSON Number。

## 历史基期与预测

`baseFY`、`interim` 形状均为：

```json
{"end":"2026-06-30","revenueRef":"revenue26h1","ebitRef":"industrialEbit26h1","daRef":"industrialDa26h1","capexRef":"industrialCapex26h1","tradeNwcRef":"industrialNwc26h1"}
```

`baseFY` 的 end 是完整财年末；年内财务基期时，`interim` 的 end 等于packet.financialAsOf并处于下一财年内。若financialAsOf恰为baseFY.end，可省interim，首年完整预测的零累计区间只是数学边界，不冒充未知实绩为零。五项历史输入只接受该期正确指标的已核验事实/成功计算、均为CNY且同范围；不能用参数伪造历史值。报告期间映射的期末必须等于end。EBIT/非现金贸易营运资本代理可来自有证据的成功计算，但必须披露与真实分部口径的差异。

每个 scenario 含 `id,reason,drivers,terminalGrowthRef,terminalROICRef`。drivers 恰六行，end 为 baseFY.end 后六个连续财年末；每行提供下列比例引用：

```json
{"end":"2026-12-31","volumeGrowthRef":"base26Volume","priceMixGrowthRef":"base26Mix","ebitMarginRef":"base26Margin","taxRef":"base26Tax","daRatioRef":"base26Da","capexRatioRef":"base26Capex","nwcRatioRef":"base26Nwc"}
```

未来驱动填显式研究参数，逐年/情景解释，不借历史原值隐含“已经证明未来”。驱动各率、金额与FCFF由程序推导。首年全年预测减interim实绩形成剩余期；估值日须在interim.end与首年末之间。年报基期不提供虚构中期；估值日须落在首预测财年内。当前实现限十二月年末财年。跨过首预测年末且财务基期未更新、非日历财年等尚不能适配的日期，记录方法/日期缺口。

## WACC

`operatingBoundary.kind` 为 `non-financial` 或 `non-financial-proxy`，reason和refs解释经营输入如何排除金融损益/资金。mixed必须采用proxy并保留费用分摊等估计限制；不得仅将合并营业利润改名为工业EBIT。

`wacc` 含 `riskFreeRef,betaRef,erpRef,erpIncludesCountryRisk,debtWeightRef,debtCostRef,taxRef`，均为ratio引用，ERP边界为布尔值。若 `erpIncludesCountryRisk:true`，禁止提供 `countryRiskRef`；若false，必须显式给出该引用（可为有依据的零假设）。

程序公式为 `(Rf + Beta×ERP + explicitCRP)×(1−D/V) + Kd×(1−tax)×D/V`。总ERP已含国家风险时explicitCRP为零；成熟市场ERP另加CRP时披露其方法。无风险代理的国债收益率/评级违约利差、Beta选择与原始ERP均保留来源和研究判断，不能只给最终WACC。

## 归属与股权桥

`bridge` 字段：

| 字段 | 合同 |
|---|---|
| ownershipMode / ownershipRef | `attributable` 或 `enterprise-minus-nci`；后者归属比例必须一，前者NCI扣项必须零 |
| cashRef / cashBasis | 最近财务期现金；`parent-cash-subset`（真实母公司）或 `nonfinancial-consolidated` |
| cashExclusionReason | mixed且采用非金融合并现金时必填，说明金融现金排除依据 |
| debtRef / debtBasis | 最近财务期工业有息债，basis固定 `industrial-interest-bearing` |
| nonOperatingAssetsRef / minorityInterestRef | 最近财务期可核对资产及尚未归属经营NCI；不能重复计入金融少数权益 |
| minorityExclusionReason | mixed使用enterprise-minus-nci且非零NCI时，解释如何排除金融NCI；输入须成功计算或derived-proxy，不能直接用集团NCI |
| sharesRef / shareAsOf | 已核验发行股本及估值日；历史股本须逐事件滚动，不能用参数或EPS加权平均股数 |
| shareBasis / shareEventsReviewedThrough | 固定 `issued-at-valuation` / 已核对股本事件至估值日 |
| priceRef | 同估值日有报价时点的正现价 |
| postBalanceCashRef | 财务期后其他现金净变化，参数日期为估值日；未知设零只能明确为assumption |
| operatingReserveRef | 非负备用现金金额（CNY）或首预测年收入比例（ratio）；研究参数日期为估值日；比例仅决定一次初始储备，不隐含逐年追加 |
| cashTransferRef | 已过期间FCFF转为可用现金的比例假设 |
| financialEntities | 最多八项；non-financial必须空，mixed必须非空 |

cash/debt/nonOperatingAssets/NCI/金融NAV若用参数，其asOf必须financialAsOf，事实/计算也须该期末。postBalanceCash/reserve若用参数，其asOf必须valuationAsOf。现价不接受研究参数，必须是真实核验同证券、完整未复权收盘。股本只接受已核验发行股本；历史日期输入需 `shareRollForward:{events:[{date,deltaRef}],reviewRefs:[已核验原文观察ID],reviewedThrough:估值日,reason}`。events按日期升序，不能重复包含基期股数已反映的事件；sharesCancelled原文正数量由程序取负、sharesIssued取正、sharesChange保留原有符号。空的已知事件数组与覆盖声明不证明不存在未披露事件，限制仍保留。现金、债务、资产、NCI非负，股本/现价为正。未知资产或债务不能自动补零。

每个金融分部为 `{id,navRef,ownershipRef,pbRef}`：NAV为最近财务期净资产，所有权与PB为ratio。分部ID和NAV引用不能重复；PB是研究选值，所有权来自该公司证据，不是样例常量。已按所有权估值的金融NAV不能再次加金融现金或扣同一金融NCI。

## 敏感性与输出

`sensitivities` 含 `waccRefs,growthRefs,betaRefs,cashShiftRefs,financialPBRefs`，每数组唯一且最多九项；前四项至少各两项，financialPB仅无金融分部时可空。现金压力为CNY且参数需估值日，其余为ratio。WACC/g组合仍须满足终值边界。

输出 `calculations.json.dcf` 含 method/status、WACC分解、assumptions、三情景forecastRows/h2/discountRows/terminal/bridgeRows、每股价值/现价差异、currentPrice/shares时点、敏感性与限制。所有计算链用未舍入值；v2模型十进制输出最多二十四位，分数指数折现采用七十二位定点计算，绘图坐标才可用浮点。

`reverseGrowth:{requested:true,lowerGrowthRef,upperGrowthRef}` 的边界是有依据的ratio引用。程序重算基准情景第二至第六年统一收入增长，其他经营率/投入驱动保持不变，使每股价值对现价求解；首年及区间、固定条件、残差保留。输出 `calculated` 或 `unavailable`，后者须说明区间内无可行解/求解限制，不伪造答案。仅 `not-requested` 或未执行不满足完整研究；真实尝试无可行解也不能声称已找到现价隐含增长。
