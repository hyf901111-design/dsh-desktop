import {expect,it} from 'vitest'
import {readFile,readdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createExploreBrowserFixture} from './helpers/explore-menu-browser-fixture'
const {evidence,fixture,uiExpect}=createExploreBrowserFixture()
const {PNG}=createRequire(import.meta.url)('pngjs') as {PNG:{sync:{read(buffer:Buffer):{width:number;data:Buffer}}}}

async function mountProductionCardCss(page:any){
 const assets='node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'
 const frontend=(await Promise.all((await readdir(assets)).filter(name=>/^index-.*\.css$/.test(name)).map(name=>readFile(assets+'/'+name,'utf8')))).join('\n')
 const libraries=await Promise.all(['layout','conversation','agent-preset'].map(name=>readFile('node_modules/@deepseek-ai/dsh-client-ui-'+name+'/lib/client.js','utf8')))
 const native=libraries.flatMap(source=>[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1]!))).join('\n')
 const portal=[...libraries[1]!.matchAll(/tag\.textContent \+?= ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1]!)).filter(css=>css.includes('.wSkVaW_root')).join('\n')
 await page.evaluate((css:string)=>{const style=document.createElement('style');style.textContent=css;document.head.prepend(style)},frontend+'\n'+native+'\n'+portal)
}

it.each([true,false])('keeps the complete production Explore card edges and gaps free of clipped shadow bands through hover, carousel and reopen (dark=%s)',async dark=>{
 const f=await fixture({dark,width:1380,height:900,reduced:false});try{
  await mountProductionCardCss(f.page)
  const enter=async()=>{await f.page.locator('[data-explore-trigger]').evaluate((node:HTMLElement)=>node.click());await uiExpect(f.page.locator('dialog.odyssey-explore')).toBeVisible();await f.page.locator('.odyssey-explore-content').evaluate((node:HTMLElement)=>Promise.all(node.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished)));await f.page.mouse.move(8,800)}
  await enter()
  // Keep the wallpaper and the original interior effects on an identical frame
  // for the visible-card / bare-backdrop pixel comparison.
  await f.page.evaluate(()=>{for(const animation of document.getAnimations())if(animation.effect?.getTiming().iterations===Infinity){animation.pause();animation.currentTime=800}})
  const viewport=await f.page.locator('.odyssey-explore-quick').boundingBox();expect(viewport).not.toBeNull()
  const clip={x:Math.floor(viewport!.x)-32,y:Math.floor(viewport!.y)-32,width:Math.ceil(viewport!.width)+64,height:Math.ceil(viewport!.height)+64}
  const cards=f.page.locator('.odyssey-explore :is(.odyssey-operations-usecase,.odyssey-operations-quick-card)')
  await f.page.screenshot({path:evidence+'/card-edges-'+dark+'-full.png'})
  const bands:any[]=[]
  const verify=async(state:string)=>{
   const points=await f.page.locator('.odyssey-explore :is(.odyssey-operations-usecase,.odyssey-operations-quick-card)').evaluateAll((nodes:Element[])=>{
    const cards=nodes.map(node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}}),hero=cards[0]!,board=cards[1]!,note=cards[2]!,ppt=cards[3]!,report=cards[4]!,points:{name:string,x:number,y:number}[]=[]
    const add=(name:string,x:number,y:number)=>{if(cards.every(card=>x<card.left-1||x>card.right+1||y<card.top-1||y>card.bottom+1))points.push({name,x:Math.floor(x),y:Math.floor(y)})}
    for(const y of [hero.top+48,(hero.top+hero.bottom)/2,hero.bottom-48]){add('outer-left',hero.left-4,y);add('outer-right',note.right+4,y)}
    for(const [left,right]of [[hero,board],[board,note],[ppt,report]] as const)if(right.left-left.right>4){const x=(left.right+right.left)/2;for(const y of [right.top+36,(right.top+right.bottom)/2,right.bottom-36])add('column-gap',x,y)}
    for(const card of cards){add('under-card',(card.left+card.right)/2,card.bottom+4)}return points
   })
   expect(points.length).toBeGreaterThanOrEqual(8)
   expect(points.every((point:any)=>point.x>=clip.x&&point.x<clip.x+clip.width&&point.y>=clip.y&&point.y<clip.y+clip.height)).toBe(true)
   // The backdrop compositor can vary slightly with the current hover plane;
   // compare a fresh bare frame in the same small clip for every state.
   await cards.evaluateAll((nodes:Element[])=>nodes.forEach(node=>(node as HTMLElement).style.visibility='hidden'))
   const bare=PNG.sync.read(await f.page.screenshot({clip}))
   await cards.evaluateAll((nodes:Element[])=>nodes.forEach(node=>(node as HTMLElement).style.removeProperty('visibility')))
   const rendered=PNG.sync.read(await f.page.screenshot({clip,path:evidence+'/card-edges-'+dark+'-'+state+'.png'}))
   const samples=points.map((point:any)=>{const index=((point.y-clip.y)*rendered.width+point.x-clip.x)*4,delta=Math.max(...[0,1,2].map(channel=>Math.abs(rendered.data[index+channel]!-bare.data[index+channel]!)));return{...point,delta}})
   bands.push({state,samples});await writeFile(evidence+'/card-edge-pixels-'+dark+'.json',JSON.stringify(bands,null,2))
   // Chromium may round the blurred backdrop by two levels between composites.
   expect(Math.max(...samples.map((sample:any)=>sample.delta))).toBeLessThanOrEqual(2)
  }
  await verify('rest')
  const settle=()=>f.page.locator('.odyssey-explore .odyssey-home-operations').evaluate((node:HTMLElement)=>Promise.allSettled(node.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished)))
  const anchors=f.page.locator('.odyssey-explore .odyssey-operations-tilt-anchor')
  for(let index=0;index<5;index++){await anchors.nth(index).hover({position:{x:20,y:20}});await f.page.waitForTimeout(330);await verify('hover-'+index)}
  await f.page.mouse.move(8,800);await f.page.waitForTimeout(330)
  for(let index=1;index<5;index++){await f.page.locator('.odyssey-explore .odyssey-operations-pagination button').nth(index).click();await f.page.waitForTimeout(180);await verify('carousel-'+index);await settle()}
  await f.page.locator('[data-explore-close]').click();await uiExpect(f.page.locator('dialog.odyssey-explore')).not.toBeVisible();await enter();await settle();await verify('reopened')
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},45000)
