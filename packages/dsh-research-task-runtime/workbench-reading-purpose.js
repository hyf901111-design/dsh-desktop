// Use the narrative outside the source tables. A row label is evidence,
// not an instruction to rank, filter or chart the rest of the disclosure.
export function workbenchReadingPurpose(request = '') {
 const text = request.replace(/https?:\/\/\S+/gu, '')
 if (/逐(?:笔|行|项|条).{0,45}(?:核对|复核|核账|稽核)|(?:核对|对账|稽核).{0,30}(?:逐笔|逐行|原序)|reconcil\w*.{0,36}(?:row|ledger|line item)/iu.test(text)) return 'reconcile'
 if (/(?:例外|异常|净流出|为负|负数|低于).{0,70}(?:先|追问|扭转|恢复|优先)|(?:先|优先).{0,32}(?:例外|异常|净流出|为负|低于)|exceptions? first|outflows?.{0,30}revers/iu.test(text)) return 'exceptions'
 if (/交接便签|(?:一句话|一句交接|one sentence|one-line).{0,40}(?:交接|收盘|说明|读懂|handoff|close)|(?:交接|收盘|handoff|close).{0,80}(?:一句话|one sentence|one-line)/iu.test(text)) return 'handoff'
 return ''
}

export function workbenchReadingGuidance(request, blocks = []) {
 const purpose = workbenchReadingPurpose(request)
 const choice = '优先以实际数据组织组件。保留用户明确要求的图、独立卡、原表和顺序。每张卡的主内容、占宽和先后由读者当前要完成的动作决定。'
 if (purpose === 'reconcile') return choice+'逐笔核对以可直接读的完整明细为入口，保留原始行序、业务编号、金额小数位与单位。显式声明 records.fields 的原列顺序，对账必读的多列可用 layout:"wide"。'
 if (purpose === 'handoff') return choice+'交接便签优先用一张紧凑的正文卡。将所问时点、实值、变化方向和按原单位换算的差额写入 panel.content.body；提供 content.title、asOf 和 sources 的公开出处。仅在用户另有要求时增加图或明细。'
 if (purpose === 'exceptions') {
  const signedHeaders = blocks.flatMap(block => block[0].filter((_,i) =>
   block.slice(1).some(row => /^-\d+(?:\.\d+)?$/u.test(row[i]) && Number(row[i]) < 0)
  )).slice(0,12)
  return choice+'按用户指定的基期、阈值或状态先列出命中的对象，再呈现需要的其余对照。标题点明例外或扭转；在同一对象旁排两期有符号的可比指标，余额与流量分开。数值筛选可用 view.where:[{field:基期字段键,op:"lt",value:0}]；严格遵循原始阈值和期间。'+
   (signedHeaders.length?'原表中实际含负值的列名为 '+JSON.stringify(signedHeaders)+'。':'')
 }
 return choice
}
