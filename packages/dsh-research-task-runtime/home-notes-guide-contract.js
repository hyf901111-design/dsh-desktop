/** Fixed local Notes replay; Microsoft 2025 annual report, STOCK PERFORMANCE. */
export const HOME_NOTES_TASK_PROMPT="用两三句话总结这篇笔记，先给我预览。"
export const HOME_NOTES_RESEARCH_AS_OF="2025-06-30"
export const HOME_NOTES_RESEARCH_FACTS={"period":["2020-06-30","2021-06-30","2022-06-30","2023-06-30","2024-06-30","2025-06-30"],"values":{"微软":[100,134.41,128.48,172.01,227.51,255.13],"标普500":[100,140.79,125.85,150.51,187.47,215.89],"NASDAQ Computer":[100,150.44,117.59,154.73,223.97,254.97]}}
export const HOME_NOTES_REPORT_SOURCES=[{"label":"微软2025年报 · STOCK PERFORMANCE","period":"2020-06-30至2025-06-30","section":"COMPARISON OF 5 YEAR CUMULATIVE TOTAL RETURN","url":"https://www.microsoft.com/investor/reports/ar25/index.html"}]
export const HOME_NOTES_CHART_PROMPT="画一张年度业绩回测折线图，和基准比较。"
export const HOME_NOTES_GUIDE_STOCK={"code":"MSFT","market":"US","name":"微软"}
export const HOME_NOTES_CHART_SPEC={"version":1,"type":"chart","variant":"line","title":"年度持有回报回测｜微软与基准","subtitle":"含分红再投资 · 2020-06-30＝100 · 每年6月末","unit":"总回报指数","labels":["2020","2021","2022","2023","2024","2025"],"series":[{"name":"微软","values":[100,134.41,128.48,172.01,227.51,255.13]},{"name":"标普500","values":[100,140.79,125.85,150.51,187.47,215.89]},{"name":"NASDAQ Computer","values":[100,150.44,117.59,154.73,223.97,254.97]}],"asOf":"2020-06-30—2025-06-30","note":"来源：Microsoft 2025 Annual Report · STOCK PERFORMANCE。买入持有、分红再投资；非主动策略收益。年度采样不代表日频最大回撤。"}
export const HOME_NOTES_REWRITE_PROMPT="改写选中文字，保留原意并让表达更清晰。"
export const HOME_NOTES_GUIDE_SELECTION="后续将持续密切关注相关业务及各项指标的进一步变化情况。"
export const HOME_NOTES_TASK_RESULT="微软五年含分红年化回报约20.60%，但跑赢标普还不足以证明个股优势，科技行业对照同样重要。接下来补核资本开支、现金回报和估值，不把历史曲线直接当成未来判断。"
export const HOME_NOTES_REWRITE_RESULT="下次复盘先核对云业务增长、资本开支和现金回款，证据变了再调整判断。"
