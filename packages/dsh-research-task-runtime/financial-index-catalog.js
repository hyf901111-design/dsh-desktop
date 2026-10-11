// Public identifiers only. Configuration stores the symbol, never a provider URL.
export function financialIndexCatalog(){
 return [
  ['A股','SH','000300','沪深300','CSI 300'],['A股','SH','000001','上证指数','SSE Composite'],
  ['A股','SZ','399001','深证成指','Shenzhen Component'],['A股','SZ','399006','创业板指','ChiNext'],
  ['A股','SH','000688','科创50','STAR 50'],['A股','SH','000016','上证50','SSE 50'],
  ['A股','SH','000905','中证500','CSI 500'],['A股','SH','000852','中证1000','CSI 1000'],
  ['A股','SH','000010','上证180','SSE 180'],['A股','SZ','399330','深证100','SZSE 100'],
  ['A股','SZ','399673','创业板50','ChiNext 50'],['A股','SH','000698','科创100','STAR 100'],
  ['A股','BJ','899050','北证50','BSE 50'],
  ['港股','INDEX','^HSI','恒生指数','Hang Seng HSI'],['港股','INDEX','^HSCE','恒生国企指数','Hang Seng China Enterprises HSCEI'],
  ['港股','INDEX','HSTECH.HK','恒生科技指数','Hang Seng TECH HSTECH'],
  ['美股','INDEX','^DJI','道琼斯工业指数','Dow Jones DJI'],['美股','INDEX','^GSPC','标普500','S&P 500 SPX'],
  ['美股','INDEX','^IXIC','纳斯达克综合指数','NASDAQ Composite'],['美股','INDEX','^NDX','纳斯达克100','NASDAQ 100'],
  ['美股','INDEX','^RUT','罗素2000','Russell 2000'],['美股','INDEX','^VIX','波动率指数','CBOE VIX'],
  ['亚太','INDEX','^N225','日经225','Nikkei Japan'],['亚太','INDEX','^KS11','韩国综合指数','KOSPI Korea'],
  ['亚太','INDEX','^TWII','台湾加权指数','Taiwan Weighted'],['亚太','INDEX','^STI','新加坡海峡时报指数','Straits Times Singapore'],
  ['亚太','INDEX','^AXJO','澳大利亚标普200','S&P ASX 200 Australia'],['亚太','INDEX','^BSESN','印度孟买30','SENSEX India'],
  ['欧洲','INDEX','^FTSE','英国富时100','FTSE 100 UK'],['欧洲','INDEX','^GDAXI','德国DAX','Germany'],
  ['欧洲','INDEX','^FCHI','法国CAC40','France'],['欧洲','INDEX','^STOXX50E','欧洲斯托克50','EURO STOXX 50'],
  ['其他','INDEX','^GSPTSE','加拿大TSX综合指数','Canada S&P TSX'],['其他','INDEX','^BVSP','巴西圣保罗指数','Brazil BOVESPA']
 ].map(([group,market,code,name,keywords])=>({group,symbol:{market,code,name},keywords}))
}
