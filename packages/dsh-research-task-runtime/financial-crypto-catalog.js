const pairs = [
 {base:'BTC', name:'比特币', krakenCode:'XBTUSD', aliases:['BITCOIN','比特幣','XBT','XBT/USD','XBT-USD','XBTUSD']},
 {base:'ETH', name:'以太坊', krakenCode:'ETHUSD', aliases:['ETHEREUM','以太币','以太幣']},
 {base:'SOL', name:'Solana', krakenCode:'SOLUSD', aliases:['索拉纳','索拉納']}
].map(({base,name,krakenCode,aliases}) => {
 const quote = 'USD'
 const code = `${base}/${quote}`
 const symbol = Object.freeze({code, market:'CRYPTO', name})
 return Object.freeze({symbol, base, quote, krakenCode, aliases:Object.freeze([code,base,name.toUpperCase(),`${base}-${quote}`,`${base}${quote}`,...aliases])})
})

export const financialCryptoIntervals = Object.freeze({'1m':1, '1h':60, '1d':1440, '1w':10080})
export const financialCryptoPeriods = Object.freeze(Object.keys(financialCryptoIntervals))
export const financialCryptoCodes = Object.freeze(pairs.map(({symbol}) => symbol.code))

export function financialCryptoPair(code) {
 return pairs.find(pair => pair.symbol.code === code)
}

export function findFinancialCryptoSymbol(query) {
 if(typeof query !== 'string')return undefined
 const alias = query.normalize('NFKC').trim().toUpperCase().replace(/\s*([/-])\s*/g,'$1')
 return pairs.find(pair => pair.aliases.includes(alias))?.symbol
}
