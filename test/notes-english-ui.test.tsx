import React from 'react'
import {afterEach,expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import {mountMemoryUi} from '../src/preload/memory/view'
import {NotesOutline} from '../src/preload/notes/outline'
import {renderToStaticMarkup} from 'react-dom/server'
import {noteUiText} from '../packages/dsh-research-task-runtime/notes-locale.js'
const windows:Window[]=[]
afterEach(async()=>{delete (globalThis as any).document;for(const w of windows.splice(0))await w.happyDOM.close()})
it('switches memory chrome and metadata live without translating saved content or its actual filename',async()=>{
 const w=new Window();windows.push(w);const d=w.document;d.documentElement.dataset.odysseyLocale='en';d.body.innerHTML='<section class="VOzbGW_panel"><nav><div class="VOzbGW_navList"></div></nav><main class="VOzbGW_content"></main></section>'
 const request=vi.fn(async()=>({owner:'local',revision:1,settings:{use:true,auto:true},document:{directory:'/my/记忆',file:'/my/记忆/记忆.md'},summary:{state:'ready',text:'用户写的中文记忆：目录、文件、链接',count:1,model:'model-1',updatedAt:Date.now()}}))
 const ui=mountMemoryUi(d as any,{request} as any)
 d.querySelector<HTMLButtonElement>('[data-memory-nav]')!.click();await new Promise(r=>setTimeout(r,20))
 expect(d.querySelector('h1')?.textContent).toBe('Memory');expect(d.querySelector('[role=switch]')?.getAttribute('aria-label')).toBe('Enable memory')
 expect(d.querySelector('.ew-memory-summary-meta')?.textContent).toMatch(/1 memory.*Updated.*Summarized by model-1/)
 expect(d.querySelector('.ew-memory-summary-text')?.textContent).toBe('用户写的中文记忆：目录、文件、链接')
 expect(d.querySelector('[data-memory-directory]')?.textContent).toContain('记忆.md')
 d.documentElement.dataset.odysseyLocale='zh';await new Promise(r=>setTimeout(r,20));expect(d.querySelector('h1')?.textContent).toBe('记忆');expect(request).toHaveBeenCalledTimes(1)
 d.documentElement.dataset.odysseyLocale='en';await new Promise(r=>setTimeout(r,20));expect(d.querySelector('h1')?.textContent).toBe('Memory');ui.dispose()
})
it('uses the app locale for note controls while leaving user headings untouched',()=>{
 const w=new Window();windows.push(w);(globalThis as any).document=w.document;w.document.documentElement.dataset.odysseyLocale='en'
 const html=renderToStaticMarkup(<NotesOutline headings={[{id:'h',text:'用户的中文标题',level:1}]} active="" onLocate={()=>{}}/>);expect(html).toContain('Show outline');expect(html).not.toContain('展开目录')
 expect(noteUiText('智能组件','en')).toBe('Smart component');expect(noteUiText('用户中文正文','en')).toBe('用户中文正文');expect(noteUiText('智能组件','zh')).toBe('智能组件')
})
