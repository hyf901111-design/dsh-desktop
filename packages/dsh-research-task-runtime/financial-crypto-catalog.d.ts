export type FinancialCryptoPeriod = '1m'|'1h'|'1d'|'1w'
export type FinancialCryptoBase = 'BTC'|'ETH'|'SOL'
export type FinancialCryptoSymbol = Readonly<{code:`${FinancialCryptoBase}/USD`;market:'CRYPTO';name:string}>
export type FinancialCryptoPair = Readonly<{symbol:FinancialCryptoSymbol;base:FinancialCryptoBase;quote:'USD';krakenCode:string;aliases:readonly string[]}>
export const financialCryptoIntervals: Readonly<Record<FinancialCryptoPeriod,number>>
export const financialCryptoPeriods: readonly FinancialCryptoPeriod[]
export const financialCryptoCodes: readonly FinancialCryptoSymbol['code'][]
export function financialCryptoPair(code:unknown):FinancialCryptoPair|undefined
export function findFinancialCryptoSymbol(query:unknown):FinancialCryptoSymbol|undefined
