export type FinancialWidgetSpec = {version:1;type:'financial-widget';widget:'watchlist'|'quote'|'indices'|'news'|'announcements';title:string;symbols:Array<{code:string;market:string;name:string}>;period:string;adjustment:string;indicators:string[];market:string;query:string;selectedSymbol?:string;linkedWatchlistId?:string;linkedSourceId?:string;visibleBars?:number}
export function financialWidgetDefaults(widget:string):FinancialWidgetSpec|null
export function financialWidgetSpec(value:unknown):FinancialWidgetSpec|null
export function financialWidgetDimensions(spec:unknown):{width:number;height:number}|undefined
