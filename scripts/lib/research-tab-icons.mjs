// A quiet 16px outline family shared by tabs and both tab menus.
export function researchTabIconKind(tab) {
 const type=String(tab?.type ?? tab?.id ?? '').toLowerCase()
 if(/conversation/.test(type)&&!/subagent/.test(type))return 'conversation'
 if(/schedul/.test(type))return 'schedule'
 if(/subagent|task/.test(type))return 'task'
 if(/terminal/.test(type))return 'terminal'
 if(/browser|web/.test(type))return 'browser'
 if(type==='sherlock-knowledge-library')return 'knowledge'
 if(/image/.test(type))return 'image'
 if(/diff|git/.test(type))return 'diff'
 if(/editor|folder|explorer/.test(type))return 'folder'
 if(/pdf|markdown|html|text|file|preview|document|office/.test(type))return 'document'
 return 'panel'
}
export function researchTabIcon(tab, jsx) {
 const kind=researchTabIconKind(tab)
 const paths={
 conversation:'M13.5 7.5a5.5 5.5 0 0 1-5.5 5.5H3l-1 1V7.5a5.75 5.75 0 0 1 11.5 0Z',
 folder:'M1.5 6V4.5A1.5 1.5 0 0 1 3 3h2.5L7 4.5h6A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V6Z',
 schedule:'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0ZM8 4v4l3 2',
 task:'M5 2.5H3.5v11h9v-11H11M6 1.5h4v2H6v-2ZM5 6l1 1 2-2M9 6h2M5 10h6',
 terminal:'M2 2.5h12v11H2v-11ZM4 5.5l2.5 2L4 9.5M8 10h3',
 knowledge:'M8 3.5C6 2.3 4 2.3 1.75 3.5v9.75c2.25-1.2 4.25-1.2 6.25 0 2-1.2 4-1.2 6.25 0V3.5C12 2.3 10 2.3 8 3.5Zm0 0v9.75M4 6h1.75M4 8.5h1.75M10.25 6H12m-1.75 2.5H12',
 browser:'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0ZM2 8h12M8 2c-4 4-4 8 0 12M8 2c4 4 4 8 0 12',
 image:'M2 2.5h12v11H2v-11ZM2 11l4-4 3 3 2-2 3 3M10 5h.01',
 diff:'M5 2H3v12h10V2h-2M6 5h4M8 3v4M6 10h4',
 document:'M3.5 1.5h6l3 3v10h-9v-13ZM9.5 1.5v3h3M6 8h4M6 11h4',
 panel:'M2 2.5h12v11H2v-11ZM2 6h12M6 6v7.5'
 }
 return jsx('svg',{width:16,height:16,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',strokeWidth:1.25,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,'data-odyssey-tab-icon':kind,children:jsx('path',{d:paths[kind]})})
}
export function patchResearchTabIcons(source) {
 if(source.includes('/* odyssey:unified-tab-icons */')) {
  const start=source.indexOf('/* odyssey:unified-tab-icons */'),end=source.indexOf('function buildNewTabOptions(state, ctx, scope) {',start)
  if(end<start)throw Error('Unified tab helpers boundary drifted')
  return source.slice(0,start)+`/* odyssey:unified-tab-icons */\n${researchTabIconKind.toString()}\n${researchTabIcon.toString()}\n`+source.slice(end)
 }
 const start=source.indexOf('const tabIconOf = (tab) => {'),end=source.indexOf('\n\t\t\t};',start)
 if(start<0||end<start)throw Error('Tab registry icon boundary drifted')
 source=source.slice(0,start)+`const tabIconOf = tab => researchTabIcon(tab,react_jsx_runtime.jsx);`+source.slice(end+'\n\t\t\t};'.length)
 const anchor='function buildNewTabOptions(state, ctx, scope) {'
 if(!source.includes(anchor))throw Error('New tab registry boundary drifted')
 source=source.replace(anchor,`/* odyssey:unified-tab-icons */\n${researchTabIconKind.toString()}\n${researchTabIcon.toString()}\n${anchor}`)
 source=source.replace('icon: typeof d.icon === "function" ? d.icon(16) : d.icon', 'icon: researchTabIcon({type:d.id},react_jsx_runtime.jsx)')
 return source
}
