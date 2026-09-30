const base={version:1,type:'market',asOf:'2026-10-01（模拟数据）',note:'仅本地虚构记录，保留原收入与披露口径'}
const periods=[{label:'2024年',endDate:'2024-12-31',disclosedAt:'2025-03-01'},{label:'2025年',endDate:'2025-12-31',disclosedAt:'2026-03-01'}]
const quarter=[{label:'2026-Q1',endDate:'2026-03-31',disclosedAt:'2026-04-25'},{label:'2026-Q2',endDate:'2026-06-30',disclosedAt:'2026-08-20'}]
const company={symbol:'DEMO.CNY',name:'虚构收入公司',currency:'CNY',unit:'百万元',basis:'合并收入，来源原值',coverage:'complete'}
export const geography={...base,variant:'revenue-geography',title:'虚构地域收入',datasets:[
 {...company,periodType:'annual',periods,totals:[100,150],segments:[{id:'americas',name:'美洲',values:[50,60]},{id:'europe',name:'欧洲',values:[30,null],missing:'2025年欧洲收入未提供'},{id:'greater-china',name:'大中华区',values:[20,40]},{id:'other',name:'其他地区（来源披露）',values:[0,20]}]},
 {...company,periodType:'quarterly',periods:quarter,coverage:'partial',coverageNote:'只取得美洲与欧洲，其他地区未返回',totals:[80,100],segments:[{id:'americas',name:'美洲',values:[20,25]},{id:'europe',name:'欧洲',values:[10,15]}]}
]}
const ids=['software','services','hardware','subscriptions','licensing','maintenance','consulting','training','distribution','adjustment'],names=['软件','服务','硬件','订阅','许可','维护','咨询','培训','分销','收入冲减']
export const business={...base,variant:'revenue-business',title:'虚构业务线收入',datasets:[
 {...company,periodType:'annual',periods,totals:[100,130],segments:ids.map((id,i)=>({id,name:names[i],values:[[30,20,15,10,5,8,7,4,4,-3][i],[40,30,20,12,7,10,8,5,5,-7][i]]}))},
 {...company,periodType:'quarterly',periods:quarter,totals:[60,null],totalMissing:'第二季度总收入未提供',coverage:'partial',coverageNote:'只取得软件和服务',segments:[{id:'software',name:'软件',values:[20,25]},{id:'services',name:'服务',values:[10,0]}]}
]}
export const revenueFixtures=[geography,business]
