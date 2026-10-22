// @vitest-environment happy-dom
import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
const module=await import('../src/preload/notes/component-presentation').catch(()=>null)
it('applies the shared E Fund palette and forwards presentation to existing and newly loaded frames',()=>{
 expect(module,'note presentation renderer is absent').not.toBeNull()
 const root=document.createElement('section'),frame=document.createElement('iframe');root.append(frame);document.body.append(root)
 const send=vi.spyOn(frame.contentWindow!,'postMessage'),dispose=module!.installNotePresentation(root,{theme:'enterprise',titleBar:false},false)
 expect(root.dataset.workbenchStyle).toBe('enterprise');expect(root.dataset.noteTitlebar).toBe('hidden');expect(root.style.getPropertyValue('--sherlock-chart-1')).toBe('#005096')
 expect(send).toHaveBeenCalledWith({type:'sherlock-workbench-style',mode:'enterprise',controlTheme:'light'},'*')
 send.mockClear();frame.dispatchEvent(new Event('load'));expect(send).toHaveBeenCalled();dispose();root.remove()
})
it.each([undefined,true,false])('applies the actual outer frame style (%s) while preserving inner table rules',frame=>{
 const css=document.createElement('style');css.textContent=readFileSync('src/preload/notes/style.css','utf8');document.head.append(css)
 const root=document.createElement('section');root.className='en-research';root.innerHTML='<div class="en-research-view"><table><tbody><tr><td style="border:1px solid #222">保留内容与内部边线</td></tr></tbody></table></div>';document.body.append(root)
 root.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:400,bottom:200,width:400,height:200,toJSON(){}})
 const dispose=module!.installNotePresentation(root,frame===undefined?undefined:{frame},false)
 try{
  expect(getComputedStyle(root).borderTopWidth).toBe(frame===false?'0px':'1px')
  expect(getComputedStyle(root.querySelector('td')!).borderTopWidth).toBe('1px')
  expect(root.textContent).toContain('保留内容与内部边线')
 }finally{dispose();root.remove();css.remove()}
})
