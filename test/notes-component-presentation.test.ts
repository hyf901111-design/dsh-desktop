// @vitest-environment happy-dom
import {expect,it,vi} from 'vitest'
const module=await import('../src/preload/notes/component-presentation').catch(()=>null)
it('applies the shared E Fund palette and forwards presentation to existing and newly loaded frames',()=>{
 expect(module,'note presentation renderer is absent').not.toBeNull()
 const root=document.createElement('section'),frame=document.createElement('iframe');root.append(frame);document.body.append(root)
 const send=vi.spyOn(frame.contentWindow!,'postMessage'),dispose=module!.installNotePresentation(root,{theme:'enterprise',titleBar:false},false)
 expect(root.dataset.workbenchStyle).toBe('enterprise');expect(root.dataset.noteTitlebar).toBe('hidden');expect(root.style.getPropertyValue('--sherlock-chart-1')).toBe('#005096')
 expect(send).toHaveBeenCalledWith({type:'sherlock-workbench-style',mode:'enterprise',controlTheme:'light'},'*')
 send.mockClear();frame.dispatchEvent(new Event('load'));expect(send).toHaveBeenCalled();dispose();root.remove()
})
