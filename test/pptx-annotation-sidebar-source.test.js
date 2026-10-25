import{readFileSync,existsSync}from'node:fs'
import{homedir}from'node:os'
import{join}from'node:path'
import{createRequire}from'node:module'
import{Script}from'node:vm'
import{expect,it,vi}from'vitest'
import{openPptxAnnotationPreview}from'../scripts/lib/pptx-annotation-reveal.mjs'
import{sidebarPptxAnnotationProps}from'../scripts/lib/sidebar-pptx-toolbar.mjs'
const require=createRequire(import.meta.url),{patchSidebarPptxToolbar}=require('../scripts/lib/sidebar-pptx-toolbar.mjs')
const built='build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js',file=existsSync(built)?built:join(homedir(),'Library/Application Support/sherlock-desktop/harness/profiles/web/node_modules/dsh-better-sidebar/lib/client.js')
const source={sessionId:'central',source:{kind:'note-file',authorizationId:'auth',nodeId:'node'}},value={path:'/managed/original.pptx',name:'原文件.pptx',source,sourceUrl:'sherlock-preview://trusted_token/'}
it('keeps the native editor path and ownership while giving only the Office child its authorized managed reader',()=>{
 const tab={id:'editor:existing',type:'editor',path:value.path,meta:{treeWidth:281,sherlockPanel:'right'}},state={splits:{kind:'leaf',tabs:[tab]}},service={openTab:vi.fn(),getSnapshot:()=>({sessionId:'central',state}),updateTab:vi.fn((id,patch)=>Object.assign(tab,patch)),setPanelState:vi.fn()}
 openPptxAnnotationPreview({service},{sessionId:'central'},value)
 expect(service.openTab.mock.calls[0][0]).toMatchObject({path:value.path,title:value.name,type:'editor'});expect(service.updateTab).toHaveBeenCalledWith('editor:existing',expect.anything(),{sessionId:'central'});expect(tab.meta.treeWidth).toBe(281)
 expect(sidebarPptxAnnotationProps(tab,{sessionId:'central',cwd:'/work'})).toEqual({path:value.sourceUrl,annotationSource:source,annotationCanonicalPath:value.path})
 expect(service.setPanelState).toHaveBeenCalledWith({open:true},{sessionId:'central'})
})
it.each([
 {source:{...source,sessionId:'other'},sourceUrl:value.sourceUrl},
 {source,sourceUrl:'file:///managed/original.pptx'},
 {source},
 {source:{sessionId:'central',source:{kind:'workspace',relativePath:'../outside.pptx'}}},
])('rejects missing/cross-owner/sourceUrl substitutions without inventing a reader scope',preview=>{
 expect(sidebarPptxAnnotationProps({path:value.path,meta:{sherlockPptAnnotationPreview:preview}},{sessionId:'central'})).toBeNull()
})
it('upgrades the real pinned sidebar twice without changing normal file opening and rejects tampered metadata forwarding',()=>{
 const raw=readFileSync(file,'utf8'),installed=patchSidebarPptxToolbar(raw)
 expect(patchSidebarPptxToolbar(installed)).toBe(installed);expect(()=>new Script(installed)).not.toThrow()
 expect(installed).toContain('path: annotationPreview?.path ?? path,');expect(installed).toContain('annotationSource: annotationPreview?.annotationSource,')
 expect(installed).toContain('apply(planFirstMatch(ctx.betterSidebar?.matchFileViewer(path), mediaUrlOf));')
 expect(()=>patchSidebarPptxToolbar(installed.replace('annotationSource: annotationPreview?.annotationSource,','annotationSource: {sessionId:"fake"},'))).toThrow(/drifted/)
})
it('refuses a different authorization on the same persisted original instead of resetting a live editor',()=>{
 const original={...source,source:{...source.source,authorizationId:'previous-auth'}},tab={id:'editor:original',type:'editor',path:value.path,meta:{sherlockPptAnnotationPreview:{source:original,sourceUrl:'sherlock-preview://previous/'},editorDirty:true}},service={getSnapshot:()=>({sessionId:'central',state:{splits:{kind:'leaf',tabs:[tab]}}}),openTab:vi.fn(),updateTab:vi.fn(),setPanelState:vi.fn()}
 expect(()=>openPptxAnnotationPreview({service},{sessionId:'central'},value,{reuse:false})).toThrow(/授权已变化/)
 expect(service.openTab).not.toHaveBeenCalled();expect(service.updateTab).not.toHaveBeenCalled();expect(tab.meta.sherlockPptAnnotationPreview.source).toBe(original);expect(tab.meta.editorDirty).toBe(true)
})
