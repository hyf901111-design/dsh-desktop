export type FinancialWidgetDataSource = 'default' | 'backup' | 'kraken' | 'bitfinex' | 'tushare' | 'datapro' | 'doubao' | 'eastmoney' | 'sina' | 'shfe'
type SourceSpec = { widget: string; dataSource?: string; symbols?: Array<{ market?: string }> }
export function financialWidgetSources(spec: SourceSpec): Array<{ id: FinancialWidgetDataSource; name: string }>
export function financialWidgetSourceId(spec: SourceSpec, query?: string): string
