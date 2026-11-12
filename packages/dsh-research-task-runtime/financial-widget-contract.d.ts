export type FinancialQuoteSource = 'default'|'backup'|'kraken'|'bitfinex'|'tushare'|'datapro'
export type FinancialNewsSource = 'sina'|'eastmoney'|'doubao'
export type FinancialWidgetSpec = {version:1;type:'financial-widget';widget:'watchlist'|'quote'|'indices'|'news'|'announcements';title:string;symbols:Array<{code:string;market:string;name:string}>;period:string;adjustment:string;indicators:string[];market:string;query:string;selectedSymbol?:string;linkedWatchlistId?:string;linkedSourceId?:string;visibleBars?:number;dataSource?:FinancialQuoteSource|FinancialNewsSource;refreshMinutes?:number;refreshEnabled?:boolean}
export const FINANCIAL_WIDGET_GUIDANCE: string
export const historyCapabilities: Readonly<Record<FinancialQuoteSource,Readonly<{periods:readonly string[];adjustments:readonly string[]}>>>
export const financialCryptoSources: readonly ('kraken'|'bitfinex')[]
export const financialMainlandSources: readonly ('tushare'|'datapro')[]
export const financialNewsSources: readonly FinancialNewsSource[]
export function financialWidgetDefaults(widget:string):FinancialWidgetSpec|null
export function financialWidgetSpec(value:unknown):FinancialWidgetSpec|null
export function financialWidgetDimensions(spec:unknown,initial?:boolean):{width:number;height:number}|undefined

export function financialWidgetPlanSpec(value: unknown,request?:string): FinancialWidgetSpec|null
