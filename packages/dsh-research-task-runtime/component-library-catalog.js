import {financialWidgetDefaults} from './financial-widget-contract.js'

// One catalog for the research library and the notes submenu.
export function componentLibraryBuiltins(){
 return ['watchlist','quote','indices','news','announcements','futures','calendar'].map(widget=>({
  id:'builtin-'+widget,widget,name:widget==='calendar'?'日历':financialWidgetDefaults(widget).title
 }))
}
