// Deterministic IPC substitute for renderer tests only; production uses the Host bridge.
export function homeGuideFinancialBridgeFixture(record=()=>{}) {
 const symbols=[['US','AAPL','苹果'],['SH','600900','长江电力'],['SH','601138','工业富联'],['SZ','000858','五粮液'],['SZ','000425','徐工机械']].map(([market,code,name])=>({market,code,name}))
 return {async request(input){
  record(input)
  const source='行情桥测试服务',receivedAt='2026-10-25T01:00:00Z'
  if(input.action==='search')return{symbols:symbols.filter(s=>(s.market+s.code+s.name).toLowerCase().includes(input.query.toLowerCase())),source}
  if(input.action==='quotes')return{source,receivedAt,quotes:(input.symbols??[]).map(s=>({...s,price:98+Math.max(0,symbols.findIndex(t=>t.market===s.market&&t.code===s.code)),priceChange:1,changePercent:1.03,quotedAt:receivedAt,asOf:'2026-10-25'}))}
  if(input.action==='history')return{source,receivedAt,nativePeriod:true,bars:Array.from({length:80},(_,i)=>({date:new Date(Date.UTC(2026,6,1+i)).toISOString().slice(0,10),open:97+i/100,high:99+i/100,low:96+i/100,close:98+i/100,volume:10000+i}))}
  if(input.action==='news')return{source,receivedAt,news:[{id:'fixture-news',title:'行情桥测试新闻',summary:input.query,time:receivedAt,source}]}
  if(input.action==='announcements')return{source,receivedAt,announcements:[{id:'fixture-announcement',title:'行情桥测试公告',date:'2026-10-25',url:'https://fixture.invalid/announcement',source}]}
  throw Error('Unexpected financial action: '+input.action)
 }}
}
