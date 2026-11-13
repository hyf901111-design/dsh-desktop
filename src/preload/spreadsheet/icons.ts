const paths:Record<string,string>={
 grid:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
 down:'m6 9 6 6 6-6',plus:'M12 5v14M5 12h14',minus:'M5 12h14',
 upload:'M12 16V4m-5 5 5-5 5 5M4 15v5h16v-5',
 download:'M12 4v12m-5-5 5 5 5-5M4 15v5h16v-5',
 undo:'M8 5 3 10l5 5m-5-5h10a5 5 0 0 1 0 10',
 redo:'m16 5 5 5-5 5m5-5H11a5 5 0 0 0 0 10',
 border:'M3 3h18v18H3zM3 12h18M12 3v18',align:'M4 5h16M4 10h11M4 15h16M4 20h11',
 filter:'M3 5h18l-7 8v5l-4 2v-7z',freeze:'M3 4h18v16H3zM3 9h18M9 4v16',
 search:'M15.5 15.5 21 21M17 10.5A6.5 6.5 0 1 1 4 10.5a6.5 6.5 0 0 1 13 0Z',
 focus:'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5',
 close:'m6 6 12 12M18 6 6 18',more:'M5 12h.2m6.7 0h.2m6.7 0h.2',
 chart:'M4 4v16h16M8 16v-4m5 4V8m5 8V5',sort:'M5 7h9m-9 5h7m-7 5h4m8-12v14m-3-3 3 3 3-3',
 link:'M5 12h14m-5-5 5 5-5 5',check:'m5 12 4 4L19 6'
}
export function sheetIcon(name:string,size=16){
 return '<svg aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[name]+'"/></svg>'
}
