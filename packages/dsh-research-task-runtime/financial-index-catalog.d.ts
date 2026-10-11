export type FinancialIndexCatalogEntry = {
  group: string
  symbol: {market: 'SH' | 'SZ' | 'BJ' | 'INDEX'; code: string; name: string}
  keywords: string
}
export function financialIndexCatalog(): FinancialIndexCatalogEntry[]
