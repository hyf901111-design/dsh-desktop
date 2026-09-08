// Reviewed read-only scope. Never register arbitrary tools from upstream discovery.
// Source: https://github.com/yingmi-dev/Yingmi-MCP (2026-09-08, MIT).
const groups = {
  basic: [
    ['fund_detail', 'BatchGetFundsDetail', '基金详情'],
    ['fund_nav_history', 'BatchGetFundNavHistory', '基金历史净值']
  ],
  discovery: [
    ['search_funds', 'SearchFunds', '搜索基金'],
    ['guess_fund_code', 'GuessFundCode', '基金名称匹配代码'],
    ['popular_funds', 'GetPopularFund', '近期热门基金'],
    ['screen_equity_turnover', 'filterStockFundByStockTurnover', '按基金持股换手率筛选']
  ],
  performance: [
    ['fund_performance', 'GetBatchFundPerformance', '基金业绩比较'],
    ['fund_risk', 'AnalyzeFundRisk', '基金风险分析'],
    ['fund_diagnosis', 'GetFundDiagnosis', '基金综合诊断'],
    ['drawdown_recovery', 'fund-recovery-ability', '回撤修复能力'],
    ['fund_benchmark', 'getFundBenchmarkInfo', '合同业绩基准']
  ],
  holdings: [
    ['equity_position', 'fund-equity-position', '权益仓位偏好'],
    ['industry_allocation', 'getFundIndustryAllocation', '行业配置'],
    ['fund_turnover', 'getFundTurnoverRate', '基金换手率'],
    ['equity_valuation', 'getStockAllocationAndMetricsByFundCode', '基金持股估值与盈利'],
    ['fund_asset_classes', 'GetFundAssetClassAnalysis', '基金资产大类分布'],
    ['industry_concentration', 'getFundIndustryConcentration', '行业集中度'],
    ['industry_preference', 'getFundIndustryPreference', '行业偏好'],
    ['sector_preference', 'fund-sector-preference', '板块偏好'],
    ['qdii_regions', 'getQdFundAreaAllocation', 'QDII 地区配置']
  ],
  attribution: [
    ['brinson_attribution', 'getFundBrinsonIndicator', 'Brinson 收益归因'],
    ['industry_returns', 'getFundIndustryReturns', '行业收益'],
    ['market_timing', 'getMarketTimingIndicator', '权益仓位择时']
  ],
  portfolio: [
    ['portfolio_risk', 'AnalyzePortfolioRisk', '组合风险'],
    ['fund_correlation', 'GetFundsCorrelation', '基金相关性'],
    ['portfolio_allocation', 'GetAssetAllocation', '组合资产配置'],
    ['portfolio_backtest', 'GetFundsBackTest', '基金组合回测'],
    ['portfolio_simulation', 'MonteCarloSimulate', '组合情景模拟'],
    ['portfolio_diagnosis', 'DiagnoseFundPortfolio', '基金组合诊断'],
    ['portfolio_nav_history', 'GetPortfolioNavHistory', '组合历史净值']
  ],
  rules: [
    ['trade_rules', 'BatchGetFundTradeRules', '基金申赎规则'],
    ['trade_limits', 'BatchGetFundTradeLimit', '基金交易限制'],
    ['fund_dividends', 'BatchGetFundsDividendRecord', '基金分红记录'],
    ['fund_splits', 'BatchGetFundsSplitHistory', '基金拆分记录']
  ],
  bonds: [
    ['bond_risk', 'getBondIndicator', '债基风险指标'],
    ['campisi_attribution', 'getFundCampisiIndicator', 'Campisi 债券归因'],
    ['bond_allocation', 'getBondAllocationByFundCode', '券种配置'],
    ['bond_dive_count', 'getFundDiveCount', '债基净值异动统计'],
    ['bond_credit_ratings', 'getBondFundCreditRatingLevel', '信用评级分布'],
    ['bond_alerts', 'getBondFundWithAlertRecord', '净值异动债基查询'],
    ['screen_bond_type', 'filterBondFundByBondType', '按券种筛选债基'],
    ['screen_bond_credit', 'filterBondFundByCreditRating', '按信用评级筛选债基']
  ],
  news: [
    ['financial_news', 'SearchFinancialNews', '财经新闻'],
    ['manager_views', 'SearchManagerViewpoint', '基金经理观点'],
    ['hot_topics', 'SearchHotTopic', '热点财经话题'],
    ['news_analysis', 'searchRealtimeAiAnalysis', '资讯 AI 解读'],
    ['advisor_content', 'searchInvestAdvisorContent', '投顾内容'],
    ['market_temperature', 'GetLatestQuotations', '市场温度计']
  ],
  strategies: [
    ['strategy_detail', 'GetStrategyDetails', '投顾策略详情'],
    ['strategy_asset_classes', 'GetStrategyAssetClassAnalysis', '策略资产分布'],
    ['strategy_holdings', 'BatchGetStrategiesComposition', '策略持仓'],
    ['strategy_risk', 'GetStrategyRiskInfo', '策略风险'],
    ['strategy_benchmark', 'GetStrategyBenchmark', '策略基准'],
    ['strategy_trade_composition', 'BatchGetPoTradeComposition', '策略交易成分查询'],
    ['fund_related_strategies', 'GetFundRelatedStrategies', '按重仓基金查找策略'],
    ['search_strategies', 'StrategySearchByKeyword', '搜索投顾策略'],
    ['strategy_risk_matching', 'BatchGetStrategyRiskInfo', '策略风险匹配']
  ],
  planning: [
    ['asset_allocation_plan', 'GetAssetAllocationPlan', '资产配置方案'],
    ['fund_investment_plan', 'GetCompositeModel', '基金投资方案'],
    ['investment_performance', 'AnalyzeInvestmentPerformance', '投资方案表现分析']
  ]
}

export const RESEARCH_CATEGORIES = Object.freeze(Object.keys(groups))
export const RESEARCH_CAPABILITIES = Object.freeze(Object.entries(groups).flatMap(([category, rows]) =>
  rows.map(([id, tool, title]) => Object.freeze({ id, tool, title, category }))
))
export function researchCapability(id) { return RESEARCH_CAPABILITIES.find(item => item.id === id) }
export function isResearchTool(name) { return RESEARCH_CAPABILITIES.some(item => item.tool === name) }
