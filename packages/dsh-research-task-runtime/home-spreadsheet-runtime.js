import { createWorkspaceGuideChat, registerWorkspaceGuideChat } from './home-workspace-guide-chat.js'
import { HOME_SPREADSHEET_GUIDE_PATH, HOME_SPREADSHEET_GUIDE_PROMPTS, HOME_SPREADSHEET_GUIDE_TREND_PROMPTS, HOME_SPREADSHEET_GUIDE_TREND_REFERENCE } from './home-spreadsheet-guide-contract.js'

const narration = {
  zh: [
    ['我先按公司和季度核对重复记录。', '\n\n已去掉 1 条重复记录。24 条季度数据和同比公式已写入「季度分析」，原始数据已保留。'],
    ['我会用选区里的季度作横轴，分别绘制净利润和经营现金流同比。', '\n\n趋势图已插入。澄川制造 2026 年第三季度的背离最明显，净利润同比增长 **25%**，经营现金流同比下降 **20%**。']
  ],
  en: [
    ['I’ll check for duplicate company-quarter rows.', '\n\nI removed one duplicate and wrote 24 quarterly records and year-over-year formulas to Quarterly Analysis. The source is preserved.'],
    ['I’ll plot both year-over-year series using the selected quarters.', '\n\nThe trend chart is saved. In Q3 2026 net profit rose **25%** year over year while operating cash flow fell **20%**, the widest gap.']
  ]
}

const spreadsheetGuide = {
  kind: 'spreadsheet', label: '表格', provider: 'sherlock-home-spreadsheet', path: HOME_SPREADSHEET_GUIDE_PATH,
  stages: ['analysis', 'trend'],
  summary: '表格模式示例使用固定的虚构季度财报，并在原生工作簿中保存分析结果。',
  intro: (locale, index) => narration[locale][index][0],
  update: (_input, locale, index) => narration[locale][index][1],
  matches(_turn, text, locale, index) {
    if (index === 0) return text === HOME_SPREADSHEET_GUIDE_PROMPTS[locale]
    const marker = /^〔表格选区 ("[^"\n]+")!(A1:C5) #[a-f0-9]{12}〕\s*/u.exec(text)
    return !!marker && JSON.parse(marker[1]) + '!' + marker[2] === HOME_SPREADSHEET_GUIDE_TREND_REFERENCE[locale] &&
      text.slice(marker[0].length) === HOME_SPREADSHEET_GUIDE_TREND_PROMPTS[locale]
  }
}

export const createHomeSpreadsheetRuntime = (ctx, options) => createWorkspaceGuideChat(ctx, spreadsheetGuide, options)
export const registerHomeSpreadsheetRuntime = (ctx, options) => registerWorkspaceGuideChat(ctx, spreadsheetGuide, options)
