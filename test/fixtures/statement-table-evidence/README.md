# 财务表真实观察 fixture

`compute-b-observed.json` 是 `/tmp/compute-b-finance-observed-business-20261021.json` 的逐字节副本，SHA-256：

`9d2199213832a0788914f531b937884f6d9af48a14783400652d336947cb780c`

来源：2026-10-21 本地真实 B 子会话 `e4e5a1d6-30c4-484b-92aa-6af1e4ca649e` 的公开业务工具调用、工具结果及最终 artifact；由 root 从安全工具 journal / artifact 包整理。无 private reasoning、认证秘密或本轮重新联网取数。

- 三次 `getFdmtMainDataLt`：分别 6 行，完整包含中际旭创、新易盛、工业富联的本期/比较期指标。
- 三次 `getFdmtISLT2018`：分别 28 / 24 / 20 行。
- 中际旭创利润表是已有 `ework-lossless-records-1` 无损传输表示，测试通过生产 `expandBusinessEvidence` 恢复 defaults；不使用请求 ticker 补齐缺失证券身份，不手动补造任何源字段。
- 没有 `getFdmtCFLT` 成功调用或响应。artifact 中该 API 的成功声明和现金流金额是待拒绝的原始错误输出，不能当成来源事实。
- 原始 artifact 的所有公司、列、数据与说明原样保留，包括错误同比、毛利率、ROE和来源声明。

`statement-table-evidence.test.js` 的 `corrected()` 是人工确定的修复期望，不是新模型交付或新取数。`singleSources()` 与其它手工变体用于单一边界的合成回归，均与原始观察 fixture 分离。金额换算/精度期望是手工给定字面量；不由受测 guard 生成期望。
