import {readFileSync} from 'node:fs'
/** Read-only 9b compatibility fixture for the strict pre-integration 20ba feature.
 * After integration the real full guard is used directly, never replaced. */
export function notesChartNavigationCompatibilitySource(){
 const product=readFileSync('src/preload/notes/chart-navigation.ts','utf8')
 if(product.includes('const readOnlyDataDisclosure='))return product
 let source=readFileSync('test/fixtures/notes-chart-navigation-9b.source','utf8')
 for(const start of ['const fixed=','  const script=','  if(chartDataIssue(model)||','  const display=']){
  const lines=product.split('\n'),replacement=lines.find(line=>start==='  if(chartDataIssue(model)||'?line.trimStart().startsWith('if(!!program.precise'):line.startsWith(start))
  const old=source.split('\n').find(line=>line.startsWith(start))
  if(!old||!replacement)throw Error('Missing exact chart compatibility boundary: '+start)
  source=source.replace(old,replacement)
 }
 const imports=product.split('\n').filter(line=>line.startsWith('import ')&&line.includes('chart-navigation-display'))
 return imports.join('\n')+'\n'+source
}
