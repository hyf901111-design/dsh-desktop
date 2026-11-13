export const SPREADSHEET_QUICK_PROMPTS={
 zh:[
  '请在当前会话左侧工作簿中直接创建消费行业可比估值表。用清楚标注的演示数据建立可比估值、盈利预测和数据来源工作表，录入可编辑数据，用单元格公式计算净利率和估值倍数。',
  '请在当前会话左侧工作簿中检查已用区域，整理表头和格式，识别重复记录，说明去重依据并应用去重。如果数据还在本轮上传的附件中，先读取附件再写入当前工作簿。',
  '请在当前会话左侧工作簿中直接建立现金流预测模型，分别建立「假设输入」和「现金流预测」工作表。用明确标注的演示假设预测五年现金流，区分输入和计算，使用跨工作表单元格公式计算各期自由现金流。'
 ],
 en:[
  'Build a consumer-sector comparables model directly in the workbook on the left. Use clearly labeled sample data, add comparables, earnings forecast and data source worksheets, and calculate net margins and valuation multiples with editable cell formulas.',
  'Inspect the used range in the workbook on the left, clean up its headers and formatting, and remove duplicates. Explain the matching criteria. If the data is in an attachment to this message, read it and write the cleaned result into the current workbook.',
  'Build a cash flow forecast directly in the workbook on the left. Add Assumptions and Cash Flow Forecast sheets, use clearly labeled sample assumptions for five years, distinguish inputs from calculations, and use cross-sheet cell formulas to calculate free cash flow for each period.'
 ],
}

export function spreadsheetQuickPrompt(text){
 if(typeof text!=='string')return -1
 const lines=text.split(/\r?\n/).map(line=>line.trim())
 return SPREADSHEET_QUICK_PROMPTS.zh.findIndex((prompt,index)=>lines.includes(prompt)||lines.includes(SPREADSHEET_QUICK_PROMPTS.en[index]))
}
