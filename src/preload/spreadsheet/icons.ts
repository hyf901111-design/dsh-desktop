import { headerMoreIcon } from '../header-more-icon'

const paths:Record<string,string>={
 grid:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
 menu:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 9h8m-8 3h8m-8 3h8',
 edit:'m4 16-.5 4.5L8 20 20 8l-4-4L4 16Zm10-10 4 4',
 view:'M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Zm11.5 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
 'insert-row':'M3 5h18v7H3zM12 5v7m0 3v6m-3-3h6',
 'insert-column':'M5 3h7v18H5zM5 12h7m3 0h6m-3-3v6',
 merge:'M3 5h18v14H3zM12 5v3m0 8v3M5.5 12h4m-2-2 2 2-2 2m11-2h-4m2-2-2 2 2 2',
 duplicates:'M16 5H5v11m3-8h11v11H8zm3 5h5m-5 3h5',
 down:'m6 9 6 6 6-6',right:'m9 6 6 6-6 6',left:'m15 6-6 6 6 6',plus:'M12 5v14M5 12h14',minus:'M5 12h14',
 upload:'M12 16V4m-5 5 5-5 5 5M4 15v5h16v-5',
 download:'M12 4v12m-5-5 5 5 5-5M4 15v5h16v-5',
 undo:'M8 5 3 10l5 5m-5-5h10a5 5 0 0 1 0 10',
 redo:'m16 5 5 5-5 5m5-5H11a5 5 0 0 0 0 10',
 border:'M3 3h18v18H3zM3 12h18M12 3v18',align:'M4 5h16M4 10h11M4 15h16M4 20h11',
 filter:'M3 5h18l-7 8v5l-4 2v-7z',freeze:'M3 4h18v16H3zM3 9h18M9 4v16',
 search:'M15.5 15.5 21 21M17 10.5A6.5 6.5 0 1 1 4 10.5a6.5 6.5 0 0 1 13 0Z',
 focus:'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5',
 'exit-focus':'M4 9h5V4m6 0v5h5m0 6h-5v5m-6 0v-5H4',
 bold:'M7 4h6a4 4 0 0 1 0 8H7m6 0h1a4 4 0 0 1 0 8H7V4',
 italic:'M11 4h7M6 20h7M15 4l-6 16',color:'m5 16 5-12 5 12M7 12h6M5 20h14',
 currency:'m6 5 6 7 6-7M7 12h10m-10 4h10m-5-4v8',
 percent:'M5 19 19 5M9 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
 decimals:'M3 16h.1M11 8H8v8h3zm7 0h-3v8h3z',sum:'M17 4H6l7 8-7 8h11',
 close:'m6 6 12 12M18 6 6 18',
 chart:'M4 4v16h16M8 16v-4m5 4V8m5 8V5',sort:'M5 7h9m-9 5h7m-7 5h4m8-12v14m-3-3 3 3 3-3',
 link:'M5 12h14m-5-5 5 5-5 5',check:'m5 12 4 4L19 6'
}
export function sheetIcon(name:string,size:number=headerMoreIcon.size){
 if(name==='more'){
  const {viewBox,centers,centerY,radius}=headerMoreIcon
  return '<svg aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="'+viewBox+'" fill="currentColor">'+
   centers.map(x=>'<circle cx="'+x+'" cy="'+centerY+'" r="'+radius+'"/>').join('')+'</svg>'
 }
 return '<svg aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[name]+'"/></svg>'
}
