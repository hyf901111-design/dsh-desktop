// Selection guidance only: tool visibility, authentication and user constraints
// remain enforced by their existing runtime boundaries.
export const SOURCE_SELECTION_GUIDANCE = '用户需求与指定来源、已有资料、联网限制优先。按所需字段、覆盖范围、时间口径、更新频率及实际可用性选择已授权来源，不以是否免费固定排序，也不先试完一类再用另一类。国内金融的财报、基金、ETF规模份额等适合时直接使用已登录可用的Tushare；行情或其他领域采用更匹配的已授权接口。同类来源无需逐个比选，已有有效数据复用，失败只对缺项采用合适备选；不能为迁就来源更换标的、字段或日期。选源规则、模式判断、能力发现均为内部步骤，不向用户宣讲；组件仍须标明实际来源、时点、单位和影响使用的缺失。';
