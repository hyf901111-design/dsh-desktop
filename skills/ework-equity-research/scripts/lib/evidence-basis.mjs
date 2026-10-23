// Period/price basis is read from the selected metric row and selected header
// column. Text in an adjacent cumulative/adjusted column is not this fact.
export function selectedFactContext(fact){
 const e=fact.evidence??{},lines=(e.quote??'').split('\n'),loc=e.locator??{},at=(loc.valueLine??loc.lineStart)-loc.lineStart,column=loc.column
 if(!Number.isInteger(at)||at<0||at>=lines.length)return e.metricText??''
 const row=lines[at].split('\t'),pieces=[e.metricText??'',row[0]??'']
 for(const line of lines.slice(0,at)){
  const cells=line.split('\t')
  if(cells.length===1)pieces.push(line)
  else if(Number.isInteger(column)&&cells.length>=column)pieces.push(cells[column-1])
 }
 return pieces.join('\n')
}
