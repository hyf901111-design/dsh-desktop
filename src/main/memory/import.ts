/** Keep complete paragraphs/sentences; never silently truncate an imported fact. */
export function splitMemoryImport(content:string):string[] {
  const paragraphs=content.trim().split(/\n\s*\n/u).map(value=>value.trim()).filter(Boolean)
  const units:string[]=[]
  for(const paragraph of paragraphs){
    if(paragraph.length<=600){units.push(paragraph);continue}
    const sentences=paragraph.match(/[^。！？.!?\n]+(?:[。！？.!?]+|\n|$)/gu)??[paragraph]
    if(sentences.some(value=>value.trim().length>600))throw Error('旧记忆包含过长的单条内容，请先精简或拆分原文。')
    units.push(...sentences.map(value=>value.trim()).filter(Boolean))
  }
  const chunks:string[]=[];let pending=''
  for(const unit of units){const next=pending?pending+'\n\n'+unit:unit;if(next.length>600){chunks.push(pending);pending=unit}else pending=next}
  if(pending)chunks.push(pending)
  if(chunks.length>50)throw Error('旧记忆内容较多，请先按项目拆分后导入。')
  return chunks
}
