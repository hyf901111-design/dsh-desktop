import {it,expect} from 'vitest'
import {financialPopoverPosition} from '../scripts/lib/financial-widget-client.mjs'

it('底部联想向上展开，避开输入框和看板外的聊天面板',()=>{
 const anchor={left:630,right:780,top:560,bottom:584},bounds={left:300,right:800,top:60,bottom:600}
 const p=financialPopoverPosition(anchor,{width:300,height:220},bounds)
 expect(p.left).toBeGreaterThanOrEqual(308);expect(p.left+p.width).toBeLessThanOrEqual(792)
 expect(p.top+p.maxHeight).toBeLessThanOrEqual(anchor.top-8)
})
it('狭窄和低矮看板中的菜单仍在安全边距内，内容可滚动',()=>{
 const bounds={left:400,right:600,top:80,bottom:280},p=financialPopoverPosition({left:570,right:592,top:240,bottom:264},{width:264,height:216},bounds,false)
 expect(p.width).toBe(184);expect(p.top).toBeGreaterThanOrEqual(88)
 expect(p.top+p.maxHeight).toBeLessThanOrEqual(232)
})
