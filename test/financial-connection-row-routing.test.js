import {beforeAll,afterAll,expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {FinancialConnections} from '../scripts/lib/financial-widget-link.mjs'

let browser,page
const body=FinancialConnections.toString(),routing=body.slice(body.indexOf(' const orthogonal='),body.indexOf(' const endpoint='))
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'});page=await browser.newPage()
},15000)
afterAll(async()=>browser?.close())
const card=(left,top,right,bottom)=>({left,top,right,bottom})
const docs={from:{...card(368,58,714,584),x:705,y:571},to:{...card(867,594,1427,977),x:877,y:962},others:[card(12,58,358,584),card(724,58,1427,584),card(12,594,857,977)]}
const overview={from:{...card(12,58,358,584),x:338,y:571},to:{...card(475,594,965,977),x:485,y:962},others:[card(368,58,1427,584),card(12,594,465,977),card(975,594,1427,977)]}
const disclosure={from:overview.from,to:{...card(12,594,465,977),x:22,y:962},others:[card(368,58,1427,584),card(475,594,965,977),card(975,594,1427,977)]}
const narrow={from:docs.from,to:{...card(861,588,1427,977),x:871,y:962},others:[card(12,58,364,584),card(718,58,1427,584),card(12,588,857,977)]}
async function sample(spec){return page.evaluate(({routing,spec})=>{
 const geometry={width:1450,height:1050,cards:[spec.from,spec.to,...spec.others]},path=new Function('geometry',routing+';return path')(geometry),d=path(spec.from,spec.to),el=document.createElementNS('http://www.w3.org/2000/svg','path');el.setAttribute('d',d)
 const length=el.getTotalLength(),crossings=[];for(let i=0;i<=4000;i++){const point=el.getPointAtLength(length*i/4000);for(let j=0;j<geometry.cards.length;j++){const c=geometry.cards[j],bottom=j<2?c.bottom-28:c.bottom;if(point.x>c.left+.5&&point.x<c.right-.5&&point.y>c.top+.5&&point.y<bottom-.5){crossings.push({card:j,x:point.x,y:point.y});break}}}
 const a=el.getPointAtLength(0),b=el.getPointAtLength(length);return {d,crossings:crossings.slice(0,3),first:[a.x,a.y],last:[b.x,b.y]}
 },{routing,spec})}
for(const [name,spec] of [['directory to analysis',docs],['watchlist to performance',overview],['watchlist to wider disclosure',disclosure],['four-pixel gutters',narrow]])it('keeps '+name+' between rows and cards, including independent cards without ports',async()=>{
 const result=await sample(spec);expect(result.crossings).toEqual([]);expect(result.first).toEqual([spec.from.x,spec.from.y]);expect(result.last).toEqual([spec.to.x,spec.to.y]);expect(result.d).toContain(' A ')
})
it('preserves the existing same-row curve and exact footer endpoints',async()=>{
 const spec={from:overview.from,to:{...card(475,58,965,584),x:485,y:571},others:[]},result=await sample(spec);expect(result.crossings).toEqual([]);expect(result.d).toContain(' C ');expect(result.first).toEqual([338,571]);expect(result.last).toEqual([485,571])
})
it('routes around a tall intervening chart after uneven cards are repacked',async()=>{
 const spec={from:{...card(12,58,476,298),x:464,y:284},
  to:{...card(968,518,1432,790),x:980,y:776},
  others:[card(486,58,958,718),card(968,58,1432,508),card(12,308,476,650)]}
 const result=await sample(spec)
 expect(result.crossings).toEqual([])
 expect(result.first).toEqual([464,284])
 expect(result.last).toEqual([980,776])
})
