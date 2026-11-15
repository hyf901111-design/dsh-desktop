export const HOME_SPREADSHEET_GUIDE_PATH = '/sherlock/home-guide/spreadsheet'
export const HOME_SPREADSHEET_GUIDE_PROMPTS = Object.freeze({
  zh: '整理这三家公司的季度财报。按公司和季度去重，保留原表，在新工作表计算净利润和经营现金流同比。',
  en: 'Clean these quarterly results. Deduplicate by company and quarter, preserve the source, and calculate year-over-year profit and cash flow on a new sheet.'
})
export const HOME_SPREADSHEET_GUIDE_TREND_PROMPTS = Object.freeze({
  zh: '给选区画两条同比趋势线，指出利润与经营现金流背离最明显的一季。',
  en: 'Plot the two year-over-year trends in this selection and identify the quarter with the widest gap.'
})
export const HOME_SPREADSHEET_GUIDE_TREND_REFERENCE = Object.freeze({
  zh: '季度分析!A1:C5',
  en: 'Quarterly Analysis!A1:C5'
})
export const HOME_SPREADSHEET_GUIDE_FILE = Object.freeze({
  zh: '三家公司季度财报.xlsx',
  en: 'Quarterly results for three companies.xlsx'
})
