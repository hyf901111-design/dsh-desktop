import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ResearchCanvasStorage} from '../src/main/state/research-canvas-storage'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {afterEach,it,expect,vi} from 'vitest'
import {patchResearchGridWorkbench,restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {patchCanvasCreationTools} from '../scripts/lib/canvas-creation-tools.mjs'
import {patchAttachmentClient} from '../scripts/lib/attachment-client.mjs'
import {patchDerivedPresetClient} from '../scripts/lib/derived-preset-client.mjs'
import {workbenchRefreshTooltip,measureWorkbenchContents} from '../scripts/lib/research-grid-ui.mjs'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {researchOptimalDimensions,researchCandleTemplate} from '../packages/dsh-research-task-runtime/bento-layout.js'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
const require=createRequire(import.meta.url),React=require('react'),{act,createElement}=React,{createRoot}=require('react-dom/client')
const disposals=[]
it('表格所有表头正文默认单行，用户列宽与换行选择在看板重开后保留且数据不变',async()=>{
 const f=await fixture(true),spec={version:1,type:'table',title:'原数据表',columns:['名称','日期','说明'],rows:[['迈瑞医疗','2026-02-03','原始0及-120万元']]}
 await act(async()=>f.workspace.setArtifacts([{...text('table-columns-own'),kind:'generated-container',containerPrompt:'原数据表',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 await vi.waitFor(()=>expect(f.host.querySelector('[data-workbench-column-resize="1"]')).not.toBeNull())
 let table=f.host.querySelector('[data-research-container-table]');expect([...table.querySelectorAll('th,td')].every(c=>c.dataset.columnWrap==='false')).toBe(true)
 await f.event('keydown',table.querySelector('[data-workbench-column-resize="1"]'),{key:'ArrowRight'})
 expect(table.rows[1].cells[1].dataset.columnWrap).toBe('true');const width=table.style.width
 await f.render({sessionId:'grid-other'});await f.render()
 await vi.waitFor(()=>expect(f.host.querySelector('[data-research-container-table]').style.width).toBe(width))
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
 table=f.host.querySelector('[data-research-container-table]');expect(table.rows[1].cells[1].dataset.columnWrap).toBe('true');expect(table.rows[1].cells[0].dataset.columnWrap).toBe('false')
})
it('附件列表完整保留长名称、零字节和说明，下载与移除权限独立',async()=>{
 const save=vi.fn(async()=>({status:'saved'})),f=await fixture(true,{researchCanvasExport:{save}}),spec={version:1,type:'files',title:'本人原文件',items:[{id:'csv',name:'本人虚构收入记录-这是一个超过窄卡宽度的完整文件名.csv',url:'http://127.0.0.1:58207/own.csv#original',sizeBytes:0,description:'0万元，变化-120万元，缺失原因未提供',permissions:{download:true,remove:false}}]}
 await act(async()=>f.workspace.setArtifacts([{...text('files-own'),kind:'generated-container',containerPrompt:'本人文件',generationStatus:'completed',refreshMinutes:0,containerSpec:spec}]))
 const root=f.host.querySelector('[data-research-attachment-preset=files]');expect(root).not.toBeNull();expect(root.textContent).toContain(spec.items[0].name);expect(root.textContent).toContain('0 字节');expect(root.textContent).toContain(spec.items[0].description)
 const buttons=Array.from(root.querySelectorAll('button'));expect(buttons.find(b=>b.textContent==='移除').disabled).toBe(true);await f.event('click',buttons.find(b=>b.textContent==='下载原文件'));expect(save).toHaveBeenCalledWith({kind:'remote-original',suggestedName:spec.items[0].name,url:spec.items[0].url});expect(root.textContent).toContain('原文件已保存');expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('附件图集使用完整原图与alt，失败不替换样例；只读禁止导入移除',async()=>{
 let shared=false;const f=await fixture(false,{researchBoards:{isSharedSession:()=>shared}}),spec={version:1,type:'gallery',title:'本人图集',items:[{id:'one',name:'本人原图.png',url:'http://127.0.0.1:58207/chart.png#original',alt:'本人0与-120原数据',description:'本人合成图',permissions:{download:false}},{id:'missing',name:'缺失图.png',url:null,description:'尚未提供原图'}]}
 await act(async()=>f.workspace.setArtifacts([{...text('gallery-own'),kind:'generated-container',containerPrompt:'本人图',generationStatus:'completed',refreshMinutes:0,containerSpec:spec}]));await f.render()
 let root=f.host.querySelector('[data-research-attachment-preset=gallery]');const image=root.querySelector('img');expect(image.getAttribute('src')).toBe(spec.items[0].url);expect(image.alt).toBe(spec.items[0].alt);expect(root.textContent).toContain('原图未提供');await f.event('error',image);expect(root.textContent).toContain('未替换成样例');expect(root.querySelector('img')).toBeNull()
 shared=true;await f.render();root=f.host.querySelector('[data-research-attachment-preset=gallery]');expect(Array.from(root.querySelectorAll('button')).find(b=>b.textContent==='导入图片').disabled).toBe(true);expect(Array.from(root.querySelectorAll('button')).filter(b=>b.textContent==='移除').every(b=>b.disabled)).toBe(true);expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('附件本地导入保留原名和真实字节数，保存授权后可恢复，不生成逐卡模型',async()=>{
 const admitFinderFile=vi.fn(async()=>({authorizationId:'own-authorization',capabilityToken:'own-token',contentType:'text/csv',name:'本人.csv',url:'sherlock-preview://own'})),restore=vi.fn(async()=>null),release=vi.fn(),f=await fixture(true,{researchPreview:{admitFinderFile,restore,release}}),spec={version:1,type:'files',title:'本人空文件',items:[]}
 await act(async()=>f.workspace.setArtifacts([{...text('files-import'),kind:'generated-container',containerPrompt:'本人附件',generationStatus:'completed',refreshMinutes:0,containerSpec:spec}]))
 const input=f.host.querySelector('[data-research-attachment-preset=files] input[type=file]'),file=new f.win.File(['项目,数值\n变化,-120万元'], '本人.csv',{type:'text/csv',lastModified:0});await f.event('change',input,{target:input});
 Object.defineProperty(input,'files',{configurable:true,value:[file]});await f.event('change',input)
 expect(admitFinderFile).toHaveBeenCalled();const stored=f.workspace.getSnapshot().artifacts[0].containerSpec;expect(stored.items[0]).toMatchObject({name:'本人.csv',sizeBytes:file.size,authorizationId:'own-authorization'});expect(stored.items[0]).not.toHaveProperty('path');expect(f.generation.generate).not.toHaveBeenCalled();expect(f.host.textContent).toContain('已导入 1 个原文件')
 const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('grid-test');expect(restored.getSnapshot().artifacts[0].containerSpec).toEqual(stored)
})
it('附件预览失败可重试原图，跳过禁止预览项，会话返回保留选择',async()=>{
 const f=await fixture(true),spec={version:1,type:'gallery',title:'本人图集',items:[{id:'one',name:'本人第一张.png',url:'https://example.org/one.png#original'},{id:'denied',name:'无预览权限.png',url:'https://example.org/denied.png',permissions:{preview:false}},{id:'three',name:'本人第三张.png',url:'https://example.org/three.png'}]},node={...text('gallery-state'),kind:'generated-container',containerPrompt:'本人图',generationStatus:'completed',refreshMinutes:0,containerSpec:spec}
 f.win.fetch=vi.fn(async()=>new Response(new Blob(['original image'],{type:'image/png'}),{status:200,headers:{'content-type':'image/png'}}));f.win.URL.createObjectURL=vi.fn(()=> 'blob:original-image');f.win.URL.revokeObjectURL=vi.fn();
 await act(async()=>f.workspace.setArtifacts([node]));let root=f.host.querySelector('[data-research-attachment-preset=gallery]');expect(root.querySelector('img[src="'+spec.items[1].url+'"]')).toBeNull()
 await f.event('error',root.querySelector('img'));await f.event('click',root.querySelector('[aria-label="预览 本人第一张.png"]'));let dialog=root.querySelector('dialog');expect(dialog.textContent).toContain('未替换成样例');await f.event('click',Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='重试预览'));await vi.waitFor(()=>expect(dialog.querySelector('img').getAttribute('src')).toBe('blob:original-image'))
 await f.event('click',Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='下一张'));expect(dialog.querySelector('.ew-attachment-toolbar').textContent).toContain(spec.items[2].name);expect(dialog.querySelector('img').getAttribute('src')).toBe(spec.items[2].url)
 await f.render({sessionId:'grid-other'});await f.render();root=f.host.querySelector('[data-research-attachment-preset=gallery]');dialog=root.querySelector('dialog');expect(dialog.querySelector('.ew-attachment-toolbar').textContent).toContain(spec.items[2].name);expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
 expect(await f.host.querySelector('[data-workbench-refresh="gallery-state"]').__eworkRefresh()).toEqual({message:'原图重新载入完成'});expect(f.generation.generate).not.toHaveBeenCalled();expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('图库刷新请求原网址并反馈真实进度，失败保留旧图且不重写来源',async()=>{
 const f=await fixture(true),spec={version:1,type:'gallery',title:'本人重载图集',items:[{id:'one',name:'本人原图.png',url:'https://example.org/own.png?source=own#original',alt:'0与-120原数据'}]}
 let finish;f.win.fetch=vi.fn(()=>new Promise(resolve=>{finish=resolve}));f.win.URL.createObjectURL=vi.fn(()=> 'blob:own-reloaded');f.win.URL.revokeObjectURL=vi.fn()
 await act(async()=>f.workspace.setArtifacts([{...text('gallery-reload'),kind:'generated-container',containerPrompt:'本人图',generationStatus:'completed',refreshMinutes:0,containerSpec:spec}]))
 const root=f.host.querySelector('[data-research-attachment-preset=gallery]');let pending
 await act(async()=>{pending=root.__eworkReloadAttachments();await Promise.resolve()});expect(f.win.fetch).toHaveBeenCalledWith(spec.items[0].url,expect.objectContaining({cache:'reload',credentials:'omit'}));expect(root.textContent).toContain('正在重新载入原图');expect(root.getAttribute('aria-busy')).toBe('true')
 await act(async()=>{finish(new Response(new Blob(['original image'],{type:'image/png'}),{status:200,headers:{'content-type':'image/png'}}));await pending});expect(root.querySelector('img').getAttribute('src')).toBe('blob:own-reloaded');expect(root.textContent).toContain('原图重新载入完成')
 f.win.fetch.mockResolvedValueOnce(new Response('not available',{status:404}));await act(async()=>{await root.__eworkReloadAttachments()});expect(root.querySelector('img').getAttribute('src')).toBe('blob:own-reloaded');expect(root.textContent).toContain('保留上次已载入原图');expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec);expect(f.generation.generate).not.toHaveBeenCalled();f.win.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));await act(async()=>{await root.__eworkReloadAttachments()});expect(root.textContent).toContain('无法访问原图');expect(root.textContent).not.toContain('Failed to fetch')
})
it('附件父卡移除释放原网页视图，恢复后仍保留完整来源',async()=>{
 const releaseNative=vi.fn(),f=await fixture(true,{researchLinkFrame:{releaseNative}}),spec={version:1,type:'files',title:'本人文件',items:[{id:'csv',name:'本人.csv',url:'https://example.org/own.csv#original'}]},node={...text('files-remove'),kind:'generated-container',containerPrompt:'本人文件',generationStatus:'completed',refreshMinutes:0,containerSpec:spec}
 await act(async()=>f.workspace.setArtifacts([node]));await act(async()=>f.workspace.removeNodes([node.id]));expect(releaseNative).toHaveBeenCalledWith({sessionId:'grid-test',nodeId:'files-remove:attachment:csv'});await act(async()=>f.workspace.undo());expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('附件补丁重复应用不积累类型、订阅或释放回调',async()=>{
 const source=restoreResearchGridWorkbench(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),patched=patchAttachmentClient(source)
 expect(patchAttachmentClient(patched)).toBe(patched);expect(patched.match(/ODYSSEY_ATTACHMENT_PRESET_V1/g)).toHaveLength(1)
})
it('附件原文件弹窗先授权原网址，再允许在卡片之外交互',async()=>{
 let authorized=false;const resolveEngine=vi.fn(async()=>{authorized=true;return {engine:'native'}}),updateNative=vi.fn(async()=>{if(!authorized)throw Error('Webpage not authorized');return {loading:false,snapshotPending:false}}),hideNative=vi.fn(async()=>({})),f=await fixture(true,{researchLinkFrame:{resolveEngine,updateNative,hideNative}}),spec={version:1,type:'files',title:'本人原文件',items:[{id:'txt',name:'本人.txt',url:'https://example.org/owned.txt#original'}]},node={...text('files-dialog'),kind:'generated-container',containerPrompt:'本人文件',generationStatus:'completed',refreshMinutes:0,containerSpec:spec}
 await act(async()=>f.workspace.setArtifacts([node]));const root=f.host.querySelector('[data-research-attachment-preset=files]');await f.event('click',Array.from(root.querySelectorAll('button')).find(b=>b.textContent==='预览'))
 expect(resolveEngine).toHaveBeenCalledWith({sessionId:'grid-test',nodeId:'files-dialog:attachment:txt',url:spec.items[0].url,preferNative:true});const frame=root.querySelector('[data-research-native-web]');frame.getBoundingClientRect=()=>({left:600,top:100,right:1100,bottom:500,width:500,height:400});Object.defineProperties(f.win,{innerWidth:{configurable:true,value:1200},innerHeight:{configurable:true,value:800}});f.document.elementFromPoint=()=>frame
 await vi.waitFor(async()=>{await act(async()=>{});expect(updateNative).toHaveBeenCalledWith(expect.objectContaining({nodeId:'files-dialog:attachment:txt',url:spec.items[0].url,active:true,bounds:{x:600,y:100,width:500,height:400}}))},{timeout:1000,interval:50});expect(f.workspace.getSnapshot().selection.selectedNodeIds).not.toContain(node.id)
})
it('附件导入后的文本预览读取真实文件，预览不使画布消失',async()=>{
 const restore=vi.fn(async()=>({authorizationId:'own-csv',capabilityToken:'own-token',url:'sherlock-preview://own-csv'})),f=await fixture(true,{researchPreview:{restore,release:vi.fn()}}),content='项目,数值\n收入,0万元\n变化,-120万元\n缺失原因,未提供';f.win.fetch=vi.fn(async()=>new Response(content));const spec={version:1,type:'files',title:'本人本地文件',items:[{id:'csv',name:'本人.csv',authorizationId:'own-csv',sizeBytes:101}]}
 await act(async()=>f.workspace.setArtifacts([{...text('local-file-preview'),kind:'generated-container',containerPrompt:'本人文件',generationStatus:'completed',refreshMinutes:0,containerSpec:spec}]))
 const root=f.host.querySelector('[data-research-attachment-preset=files]');await f.event('click',Array.from(root.querySelectorAll('button')).find(b=>b.textContent==='预览'));expect(root.querySelector('[data-research-text-preview]').textContent).toBe(content);expect(f.host.querySelector('[data-research-canvas]')).not.toBeNull();expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('智能组件回车换行且命令回车创建，保留组合输入与同节点生成',async()=>{
 const f=await fixture(true,{},true);let draft;await act(async()=>{draft=f.workspace.createContainerDraft()})
 const card=f.host.querySelector('[data-research-node-id="'+draft.id+'"]');expect(card.querySelector('.ew-draft-heading')).toBeNull();expect(card.querySelector('.ew-draft-note')).toBeNull()
 const input=card.querySelector('textarea');input.value='本人虚构记录：0万元，变化-120万元，原因未提供。生成预置两列表格。';await act(async()=>input.focus());await f.event('input',input);expect(input.isConnected).toBe(true);expect(card.querySelector('button[data-research-container-submit],button[data-research-link-submit]').disabled).toBe(false)
 await f.event('keydown',input,{key:'Enter',keyCode:229,isComposing:true});expect(f.generation.generate).not.toHaveBeenCalled();expect(input.isConnected).toBe(true)
 await f.event('keydown',input,{key:'Enter',keyCode:13,shiftKey:true,isComposing:false});expect(f.generation.generate).not.toHaveBeenCalled()
 expect(card.querySelector('.ew-draft-hint')).toBeNull();await f.event('keydown',input,{key:'Enter',keyCode:13,isComposing:false});expect(f.generation.generate).not.toHaveBeenCalled();await f.event('keydown',input,{key:'Enter',keyCode:13,metaKey:true,isComposing:false});expect(f.generation.generate).toHaveBeenCalledTimes(1);expect(f.generation.generate).toHaveBeenCalledWith(expect.objectContaining({targetNodeId:draft.id,prompt:input.value}))
})
it('链接草稿只保留可伸展输入与底部动作，中文组合回车不完成且同节点接纳原链接',async()=>{
 const f=await fixture(true);let draft;await act(async()=>{draft=f.workspace.createContainerDraft(null,'link')})
 const card=f.host.querySelector('[data-research-node-id="'+draft.id+'"]');expect(card.querySelector('.ew-draft-heading')).toBeNull();expect(card.querySelector('.ew-link-draft-status')).toBeNull();expect(card.textContent).toContain('支持网页与文章链接')
 const input=card.querySelector('textarea');input.value='http://127.0.0.1:58169/?source=owned#keep';await act(async()=>input.focus());await f.event('input',input);expect(input.isConnected).toBe(true);expect(card.querySelector('button[data-research-container-submit],button[data-research-link-submit]').disabled).toBe(false)
 await f.event('keydown',input,{key:'Enter',keyCode:229,isComposing:true});expect(f.workspace.getSnapshot().artifacts[0].containerPrompt).toBe('odyssey:link-draft');expect(input.isConnected).toBe(true)
 await f.event('keydown',input,{key:'Enter',keyCode:13,isComposing:false});expect(f.workspace.getSnapshot().artifacts[0]).toMatchObject({id:draft.id,kind:'web-link',url:input.value});expect(f.generation.generate).not.toHaveBeenCalled()
})
it('链接草稿按统一最小尺寸对齐网格，不受标题长度限制',async()=>{
 const f=await fixture(true);let draft;await act(async()=>{draft=f.workspace.createContainerDraft(null,'link');f.workspace.setArtifacts([{...draft,title:'短标题',width:280,height:180,sizeMode:'manual'}])})
 const short=f.workspace.getSnapshot().artifacts[0];await act(async()=>f.workspace.setArtifacts([{...draft,title:'本人用于验证标题长度的完整原题'.repeat(8),width:280,height:180,sizeMode:'manual'}]))
 const long=f.workspace.getSnapshot().artifacts[0];expect([long.width,long.height]).toEqual([short.width,short.height]);expect(long.width).toBeGreaterThanOrEqual(280);expect(long.width).toBeLessThan(304);expect(long.height).toBeGreaterThanOrEqual(180);expect(long.height).toBeLessThan(204);expect(f.host.querySelector('textarea')).not.toBeNull()
})
it('共享只读禁用智能组件及链接草稿输入和提交',async()=>{
 let shared=false;const f=await fixture(false,{researchBoards:{isSharedSession:()=>shared}});let smart,link
 await act(async()=>{smart=f.workspace.createContainerDraft();link=f.workspace.createContainerDraft(null,'link')});shared=true;await f.render()
 for(const node of [smart,link]){const card=f.host.querySelector('[data-research-node-id="'+node.id+'"]');expect(card.querySelector('textarea').disabled).toBe(true);expect(card.querySelector('[data-research-container-submit],[data-research-link-submit]').disabled).toBe(true)}
 expect(f.generation.generate).not.toHaveBeenCalled();expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
})
it('音频原生宿主校验网址和中文组合输入，同节点保存且更换音源不沿用旧转写',async()=>{
 const f=await fixture(true),spec={version:1,type:'audio',title:'本人音频',url:null,description:'保留原说明'}
 await act(async()=>f.workspace.setArtifacts([{...text('audio-input'),kind:'generated-container',containerPrompt:'音频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 const preset=f.host.querySelector('[data-research-audio-preset]');expect(preset).not.toBeNull()
 await f.event('click',Array.from(preset.querySelectorAll('button')).find(b=>b.textContent==='添加音频'))
 const input=preset.querySelector('[aria-label="音频网址"]');input.value='https://user:secret@example.com/audio.wav'
 await f.event('keydown',input,{key:'Enter',keyCode:13,isComposing:false});expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec);expect(preset.textContent).toContain('HTTP')
 input.value='http://127.0.0.1:58183/tone.wav#original';await f.event('keydown',input,{key:'Enter',keyCode:229,isComposing:true});expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
 await f.event('keydown',input,{key:'Enter',keyCode:13,isComposing:false})
 const next=f.workspace.getSnapshot().artifacts[0];expect(next.id).toBe('audio-input');expect(next.containerSpec).toEqual({...spec,url:input.value});expect(f.generation.generate).not.toHaveBeenCalled()
 expect(preset.querySelector('audio').hasAttribute('autoplay')).toBe(false);expect(preset.querySelectorAll('.ew-audio-wave i')).toHaveLength(0);expect(preset.textContent).toContain('波形未提供')
 const provided={...next,containerSpec:{...next.containerSpec,transcript:'本人旧音源转写',waveform:[0,1],source:'旧音源来源',durationSeconds:90}}
 await act(async()=>f.workspace.setArtifacts([provided]));await act(async()=>preset.__eworkEditAudio());const changed=preset.querySelector('[aria-label="音频网址"]');changed.value='https://example.org/other.wav';await f.event('keydown',changed,{key:'Enter',keyCode:13,isComposing:false})
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual({...spec,url:'https://example.org/other.wav'})
 const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('grid-test');expect(restored.getSnapshot().artifacts[0].containerSpec).toEqual({...spec,url:'https://example.org/other.wav'})
})
it('音频播放状态来自实际媒体事件，章节倍速音量及会话返回保留进度但不自动播放',async()=>{
 const f=await fixture(true),spec={version:1,type:'audio',title:'测试音频',url:'https://example.org/test.wav',waveform:[0,.5,1],transcript:'本人完整转写\n0和-120',chapters:[{title:'后半段',startSeconds:60}]},node={...text('audio-playback'),kind:'generated-container',containerPrompt:'音频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}
 await act(async()=>f.workspace.setArtifacts([node]));let preset=f.host.querySelector('[data-research-audio-preset]'),element=preset.querySelector('audio'),isPaused=true
 const play=vi.fn(async()=>{}),pause=vi.fn(()=>{isPaused=true});Object.defineProperties(element,{duration:{value:90,configurable:true},paused:{get:()=>isPaused,configurable:true},play:{value:play,configurable:true},pause:{value:pause,configurable:true}})
 expect(play).not.toHaveBeenCalled();await f.event('loadedmetadata',element);expect(preset.textContent).toContain('已暂停')
 await f.event('click',preset.querySelector('[data-audio-play]'));expect(play).toHaveBeenCalledTimes(1);expect(preset.textContent).toContain('正在加载');expect(preset.querySelector('[data-audio-play]').textContent).toBe('播放')
 isPaused=false;await f.event('playing',element);expect(preset.querySelector('[data-audio-play]').textContent).toBe('暂停');await f.event('waiting',element);expect(preset.textContent).toContain('正在缓冲')
 await f.event('click',Array.from(preset.querySelectorAll('button')).find(b=>b.textContent.includes('后半段')));expect(element.currentTime).toBe(60);expect(preset.textContent).toContain('正在缓冲')
 isPaused=true;element.currentTime=90;await f.event('ended',element);expect(preset.textContent).toContain('播放结束')
 await f.event('click',Array.from(preset.querySelectorAll('button')).find(b=>b.textContent.includes('后半段')));expect(element.currentTime).toBe(60);expect(preset.textContent).toContain('已暂停');expect(preset.textContent).not.toContain('播放结束');expect(play).toHaveBeenCalledTimes(1)
 const rate=preset.querySelector('[aria-label="播放速度"]');rate.value='1.5';await f.event('change',rate);expect(element.playbackRate).toBe(1.5)
 const volume=preset.querySelector('[aria-label="音量"]');volume.value='.25';await f.event('input',volume);expect(element.volume).toBe(.25)
 const refreshed=await f.host.querySelector('[data-workbench-refresh="audio-playback"]').__eworkRefresh();expect(refreshed).toEqual({message:'已请求重新加载音源'});expect(f.generation.generate).not.toHaveBeenCalled()
 await act(async()=>f.workspace.setArtifacts([]));expect(pause).toHaveBeenCalled();await act(async()=>f.workspace.setArtifacts([node]));preset=f.host.querySelector('[data-research-audio-preset]');element=preset.querySelector('audio');Object.defineProperty(element,'duration',{value:90,configurable:true});await f.event('loadedmetadata',element)
 expect(element.currentTime).toBe(60);expect(element.playbackRate).toBe(1.5);expect(element.volume).toBe(.25);expect(preset.querySelector('[data-audio-play]').textContent).toBe('播放')
 expect(preset.querySelector('.ew-audio-transcript').textContent).toBe(spec.transcript)
})
it('音频整理保留展开的完整转写高度，不把默认播放器高度裁切成内容高度',async()=>{
 const f=await fixture(true),spec={version:1,type:'audio',title:'长转写',url:'http://127.0.0.1:58183/tone.wav',transcript:'本人完整转写\n'.repeat(60)},node={...text('audio-fit'),kind:'generated-container',containerPrompt:'音频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}
 await act(async()=>f.workspace.setArtifacts([node]));const preset=f.host.querySelector('[data-research-audio-preset]');preset.querySelector('details').open=true
 Object.defineProperties(preset,{offsetHeight:{configurable:true,value:720},scrollHeight:{configurable:true,value:720}});f.host.querySelector('[data-research-preview-body]').style.setProperty('padding','12px','important');preset.closest('.rScV5Q_containerContent').style.setProperty('padding','8px','important')
 expect(runInNewContext('('+measureWorkbenchContents.toString().replace(/__vite_ssr_import_\d+__\.researchCandleTemplate/g,'researchCandleTemplate')+')(root,nodes)',{root:f.host,nodes:[node],CSS:f.win.CSS,researchOptimalDimensions,researchCandleTemplate}).get(node.id).height).toBe(822)
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 await vi.waitFor(async()=>{await act(async()=>{});expect(f.workspace.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(822)},{timeout:1500,interval:50})
 expect(preset.querySelector('.ew-audio-transcript').textContent).toBe(spec.transcript);expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('音频共享只读禁止更改音源但保留完整转写和浏览功能',async()=>{
 let shared=false;const f=await fixture(false,{researchBoards:{isSharedSession:()=>shared}}),spec={version:1,type:'audio',title:'只读音频',url:null,transcript:'本人提供的完整转写'}
 f.workspace.setArtifacts([{...text('audio-readonly'),kind:'generated-container',containerPrompt:'音频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]);shared=true;await f.render()
 const preset=f.host.querySelector('[data-research-audio-preset]');expect(preset).not.toBeNull();expect(Array.from(preset.querySelectorAll('button')).find(b=>b.textContent==='添加音频').disabled).toBe(true)
 await act(async()=>preset.__eworkEditAudio());expect(preset.querySelector('form')).toBeNull();expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec);expect(preset.querySelector('.ew-audio-transcript').textContent).toBe(spec.transcript)
})
afterEach(async()=>{for(const dispose of disposals.splice(0).reverse())await dispose()})
const text=(id,x=260,y=160)=>({id,kind:'pasted-text',messageId:id,title:id,excerpt:'# 真实组件\n保留正文',x,y,width:480,height:280,sizeMode:'manual'})
async function fixture(mount=false,desktop={},creation=false){
 const win=new Window({url:'https://ework.local'}),document=win.document
 const keys=['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'],original=keys.map(k=>Object.getOwnPropertyDescriptor(globalThis,k))
 keys.forEach((k,i)=>Object.defineProperty(globalThis,k,{configurable:true,value:[win,document,win.navigator,true][i]}))
 let descriptor
 win.dshDesktop=desktop;win.__ModuleLoader__={load:d=>descriptor=d};win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
 // Load the serializer through Node so Vitest does not rewrite the functions it embeds.
 let source=require('../scripts/lib/research-grid-workbench.mjs').patchResearchGridWorkbench(patchDerivedPresetClient(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))
 if(creation)source=require('../scripts/lib/canvas-creation-tools.mjs').patchCanvasCreationTools(source)
 runInNewContext(source,{window:win,document,localStorage:win.localStorage,navigator:win.navigator,CSS:win.CSS,DOMParser:win.DOMParser,HTMLElement:win.HTMLElement,HTMLTextAreaElement:win.HTMLTextAreaElement,Text:win.Text,CustomEvent:win.CustomEvent,Event:win.Event,ResizeObserver:win.ResizeObserver,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),structuredClone,AbortController,TextDecoder,TextEncoder,setTimeout,clearTimeout,setInterval,clearInterval,console})
 // Desktop preload supplies this stylesheet from the current checkout; the
 // dependency bundle can still embed a previous build's shared color tokens.
 const refinementStyle=document.createElement('style');refinementStyle.textContent=await readFile('src/preload/figma-refinements.css','utf8');document.documentElement.append(refinementStyle)
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 const bundle=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?require(id):id==='react-dom'?require(id):id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake)
 const registry=new bundle.ResearchWorkspaceRegistry(win.localStorage),workspace=registry.for('grid-test'),host=document.createElement('div');document.body.append(host)
 let root,canvas
 const generation={disabled:false,generate:vi.fn(async()=>({ok:true,taskId:'t'}))},actions={setResearchRightTab:vi.fn()}
 const render=async({measure=true,sessionId='grid-test'}={})=>{root??=createRoot(host);await act(async()=>root.render(createElement(bundle.ResearchCanvas,{sessionId,t:x=>x,researchWorkspaces:registry,selectionGeneration:generation,actions})));canvas=host.querySelector('[data-research-canvas]');canvas.getBoundingClientRect=()=>({left:0,top:0,right:1000,bottom:700,width:1000,height:700});Object.defineProperty(canvas,'clientWidth',{configurable:true,value:1000});Object.defineProperty(canvas,'clientHeight',{configurable:true,value:700});if(measure)await act(async()=>{workspace.setCanvasSize({width:1000,height:700,availableWidth:1000});workspace.setWorkbenchWidth(1000)})}
 const event=async(type,target,props={})=>{const e=new win.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,Object.fromEntries(Object.entries(props).map(([k,v])=>[k,{value:v}])));await act(async()=>{target.dispatchEvent(e);await new Promise(r=>setTimeout(r,30))});return e}
 disposals.push(async()=>{if(root)await act(async()=>root.unmount());await win.happyDOM.abort();keys.forEach((k,i)=>original[i]?Object.defineProperty(globalThis,k,original[i]):delete globalThis[k])})
 if(mount)await render()
 return {source,win,document,bundle,workspace,registry,host,get canvas(){return canvas},event,render,actions,generation}
}
it('实际客户端模块能恢复旧代码卡并带齐视区修正依赖',async()=>{
 const f=await fixture(true),spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'code',title:'研究配置',asOf:'2026-09-30 模拟',language:'json',content:'{"name":"季度经营表现分析"}'})));
 spec.html=spec.html.replace(/<style data-code-viewport="v2">[\s\S]*?<\/style>/,'');
 await act(async()=>f.workspace.setArtifacts([{...text('old-code'),kind:'generated-container',containerPrompt:'配置',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]));
 const frame=f.host.querySelector('[data-research-node-id="old-code"] iframe');
 expect(frame).not.toBeNull();expect(frame.srcdoc).toContain('data-code-viewport');expect(frame.srcdoc).toContain('请选择保存位置');
});
it('重复补丁恢复原始代码且不积累事件或样式',async()=>{
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),base=restoreResearchGridWorkbench(source),once=patchResearchGridWorkbench(base)
 expect(restoreResearchGridWorkbench(once).trim()).toBe(base.trim())
 expect(patchResearchGridWorkbench(once)).toBe(once)
},15000)
it('已有补丁客户端升级整理图标，不重复添加按钮或丢失回调',async()=>{
 const original=restoreResearchGridWorkbench(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 const start=original.indexOf("'data-research-global-arrange':''"),end=original.indexOf("className:'odyssey-tool-icon'",start)
 const legacy=original.slice(0,start)+original.slice(start,end).replace(/src:"data:image\/svg\+xml;base64,[^"]+"/,'src:"data:image/svg+xml;base64,b2xkLWFkZC1zeW1ib2w="')+original.slice(end)
 const updated=patchCanvasCreationTools(legacy),button=updated.slice(start,updated.indexOf("className:'odyssey-tool-icon'",start))
 expect(button).not.toContain('b2xkLWFkZC1zeW1ib2w=')
 const svg=Buffer.from(button.match(/src:"data:image\/svg\+xml;base64,([^"]+)"/)[1],'base64').toString()
 expect(svg.match(/<rect /g)).toHaveLength(1)
 expect(svg).toContain('M12 3.5v17M12 12h8.5')
 expect(svg).not.toContain('M4 3v18')
 expect(updated.match(/'data-research-global-arrange':''/g)).toHaveLength(1)
 expect(button).toContain('researchCanvasArrangeWithMotion')
 expect(patchCanvasCreationTools(updated)).toBe(updated)
})
it('真实工作台入口按完整面板规划初始化两列，内容返回不改变卡片框',async()=>{
 const f=await fixture(),w=f.workspace
 w.setCanvasSize({width:900,height:700});w.setWorkbenchWidth(900)
 const plan={id:'fresh-six',createdAt:Date.now(),panels:Array.from({length:6},(_,i)=>({nodeId:'fresh-'+i,title:'验收 '+i,prompt:'模拟指标',pending:true,width:656,height:i===1?352:270,x:i%2*672,y:Math.floor(i/2)*368,size:'large'}))}
 expect(w.applyWorkbench(plan)).toBe(true)
 const before=w.getWorkbenchCells().map(({freePosition,...c})=>c)
 expect(before[0]).toMatchObject({x:0,y:0,w:20});expect(before[1]).toMatchObject({x:20,y:0,w:20})
 expect(w.getSnapshot().artifacts.every(n=>n.height>=320)).toBe(true)
 const completed={...plan,panels:plan.panels.map(p=>({...p,taskId:'task-'+p.nodeId,preparedOutput:JSON.stringify({version:1,type:'table',title:p.title,columns:['项目','数值'],rows:[['模拟','123']]})}))}
 expect(w.applyWorkbench(completed)).toBe(true)
 expect(w.getWorkbenchCells().map(({freePosition,...c})=>c)).toEqual(before)
 expect(w.getSnapshot().artifacts.every(n=>n.generationStatus==='completed')).toBe(true)
})
it('对话视图先收到工作台规划时保留模板尺寸，首次打开研究画布无需整理',async()=>{
 const f=await fixture(),w=f.workspace
 const plan={id:'before-canvas',createdAt:Date.now(),panels:[
  {nodeId:'before-form',title:'需求表单',prompt:'模拟需求',pending:true,width:656,height:428,x:0,y:0,size:'large'},
  {nodeId:'before-code',title:'JSON 配置',prompt:'模拟配置',pending:true,width:656,height:328,x:672,y:0,size:'medium'}
 ]}
 expect(w.applyWorkbench(plan)).toBe(true)
 expect(w.getSnapshot().artifacts.map(n=>[n.width,n.height])).toEqual([[656,428],[656,328]])
 const specs=[{version:1,type:'form',title:'需求表单',asOf:'2026-09-30 模拟',fields:[{id:'subject',label:'研究主题',kind:'text',required:true}]},
  {version:1,type:'code',title:'JSON 配置',asOf:'2026-09-30 模拟',language:'json',content:'{"status":"draft"}'}].map(s=>acceptArtifactOutput(JSON.stringify(s)))
 expect(specs.every(s=>JSON.parse(s).type==='html')).toBe(true)
 expect(w.applyWorkbench({...plan,panels:plan.panels.map((p,i)=>({...p,taskId:'prepared-'+i,preparedOutput:specs[i]}))})).toBe(true)
 expect(w.getSnapshot().artifacts.map(n=>[n.width,n.height])).toEqual([[656,428],[656,328]])
 await f.render()
 const nodes=w.getSnapshot().artifacts
 expect(Math.abs(nodes[0].height-428)).toBeLessThan(25)
 expect(Math.abs(nodes[1].height-328)).toBeLessThan(25)
 expect(nodes.every(n=>n.width>=400&&n.containerSpec)).toBe(true)
 await vi.waitFor(async()=>{await act(async()=>{});expect(f.host.querySelectorAll('iframe[data-research-html-artifact]')).toHaveLength(2)},{timeout:2000,interval:50})
})
it.each(['generated-container','generated-mind-map','generated-summary'])('生成中的 %s 可从正文拖动，过程与停止按钮不触发拖动',async kind=>{
 const f=await fixture(true),w=f.workspace
 const node={...text('moving'),kind,generationStatus:'running',generationTaskId:'moving-task',generationStartedAt:Date.now(),generationEvents:[],sourceNodeIds:['peer'],containerPrompt:'模拟验证',refreshMinutes:0}
 await act(async()=>w.setArtifacts([node,text('peer')]))
 const card=f.host.querySelector('[data-research-node-id="moving"]'),body=card.querySelector('[data-research-generation-foreground] strong')
 expect(body).not.toBeNull()
 const before=structuredClone(w.getWorkbenchCells()),old=before.find(c=>c.id==='moving'),step=24.65
 await f.event('pointerdown',body,{button:0,pointerId:144,clientX:100,clientY:100})
 expect(f.canvas.getAttribute('data-grid-operation')).toBe('move')
 await f.event('pointerup',f.canvas,{pointerId:144,clientX:100+step*4,clientY:100+step*5})
 const moved=w.getWorkbenchCells().find(c=>c.id==='moving')
 expect(moved.x!==old.x||moved.y!==old.y).toBe(true)
 expect(moved.w).toBe(old.w);expect(moved.h).toBe(old.h)
 for(const button of card.querySelectorAll('.odyssey-generation-actions button')){
  await f.event('pointerdown',button,{button:0,pointerId:145,clientX:100,clientY:100})
  expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
 }
 const cells=w.getWorkbenchCells();expect(cells.every((a,i)=>cells.every((b,j)=>i===j||!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)))).toBe(true)
 expect(w.undo()).toBe(true);expect(w.getWorkbenchCells()).toEqual(before)
})
it.each(['generated-container','generated-mind-map','generated-summary'])('自动尺寸的 %s 在生成挂载、拖动和完成后保留原有占位',async kind=>{
 const f=await fixture(),w=f.workspace
 w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)
 const node={...text('fixed'),kind,sizeMode:'auto',width:656,height:456,generationStatus:'running',generationTaskId:'fixed-task',generationLastSeq:0,generationStartedAt:Date.now(),generationEvents:[],sourceNodeIds:['peer'],containerPrompt:'模拟验证',refreshMinutes:0}
 w.setArtifacts([node,text('peer')])
 const initial=structuredClone(w.getWorkbenchCells())
 await f.render()
 expect(w.getWorkbenchCells()).toEqual(initial)
 const body=f.host.querySelector('[data-research-node-id="fixed"] [data-research-generation-foreground] strong')
 await f.event('pointerdown',body,{button:0,pointerId:146,clientX:100,clientY:100})
 await f.event('pointerup',f.canvas,{pointerId:146,clientX:198.6,clientY:223.25})
 const moved=structuredClone(w.getWorkbenchCells()),frame=w.getSnapshot().artifacts.find(n=>n.id==='fixed')
 expect(moved.find(c=>c.id==='fixed').w).toBe(initial.find(c=>c.id==='fixed').w)
 await act(async()=>w.applyGenerationInspection('fixed',{taskId:'fixed-task',canvasNodeId:'fixed',state:'completed',lastSeq:1,finalOutput:kind==='generated-container'?JSON.stringify({version:1,type:'table',title:'模拟验证',columns:['项目','数值'],rows:[['样本','123']]}):'# 中心\n## 说明\n- 模拟内容',completedAt:Date.now(),events:[]}))
 expect(w.getSnapshot().artifacts.find(n=>n.id==='fixed')).toMatchObject({generationStatus:'completed',x:frame.x,y:frame.y,width:frame.width,height:frame.height})
 const boxes=cells=>cells.map(({freePosition,...box})=>box)
 expect(boxes(w.getWorkbenchCells())).toEqual(boxes(moved))
})
it('旧生成卡片的可见最小宽度在结果加载与重新打开后不回落',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{
  w.setArtifacts([{...text('legacy-task'),kind:'generated-container',generationStatus:'running',generationTaskId:'legacy-task-id',generationStartedAt:Date.now(),containerPrompt:'模拟验证',refreshMinutes:0}])
  w.applyWorkbenchCells([{id:'legacy-task',x:0,y:0,w:13,h:10}],true)
 })
 const old=w.getSnapshot().artifacts[0]
 await act(async()=>w.applyGenerationInspection('legacy-task',{taskId:'legacy-task-id',canvasNodeId:'legacy-task',state:'completed',lastSeq:1,events:[],finalOutput:JSON.stringify({version:1,type:'table',title:'模拟验证',columns:['项目','数值'],rows:[['样本','123']]})}))
 expect(w.getSnapshot().artifacts[0]).toMatchObject({generationStatus:'completed',x:old.x,y:old.y,width:old.width,height:old.height})
 const reopened=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('grid-test')
 reopened.setCanvasSize({width:1000,height:700,availableWidth:1000});reopened.setWorkbenchWidth(1000)
 expect(reopened.getSnapshot().artifacts[0]).toMatchObject({x:old.x,y:old.y,width:old.width,height:old.height})
})
it('规划卡片接入实际网格拖动，普通组件避让且挂载工作台释放临时占位',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setArtifacts([text('a'),text('b')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:12},{id:'b',x:20,y:0,w:20,h:12}],true)})
 const startedAt=Date.now(),intent={id:'plan',kind:'workbench',state:'planning',types:[],startedAt,description:'测试规划'}
 await f.event('odyssey:creation-progress',f.win,{detail:{sessionId:'grid-test',intent}})
 const planning=f.host.querySelector('[data-research-creation-planning]')
 expect(planning.getAttribute('data-workbench-drag-handle')).toBe('plan')
 expect(w.getWorkbenchCells().some(c=>c.id==='plan')).toBe(true)
 const step=24.65,before=w.getWorkbenchCells().find(c=>c.id==='plan')
 await f.event('pointerdown',planning,{button:0,pointerId:143,clientX:350,clientY:300})
 await f.event('pointerup',f.canvas,{pointerId:143,clientX:350-before.x*step,clientY:300-before.y*step})
 const cells=w.getWorkbenchVisibleCells();expect(cells.find(c=>c.id==='plan')).toMatchObject({x:0,y:0})
 const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y
 expect(cells.every((a,i)=>cells.every((b,j)=>i===j||!overlaps(a,b)))).toBe(true)
 const plan={id:'new-wb',createdAt:startedAt,panels:[{nodeId:'new-panel',title:'模拟数据',prompt:'模拟',pending:true,width:656,height:320,x:0,y:0,size:'large'}]}
 await act(async()=>w.applyWorkbench(plan))
 expect(w.getWorkbenchPlanningNodes()).toEqual([]);expect(w.getWorkbenchCells().some(c=>c.id==='plan')).toBe(false)
 expect(w.getSnapshot().artifacts.map(n=>n.id)).toEqual(['a','b','new-panel'])
 await f.event('odyssey:creation-progress',f.win,{detail:{sessionId:'grid-test',intent:null}})
 expect(f.host.querySelector('[data-research-creation-planning]')).toBeNull()
})
it('规划卡片可选中缩放并保留拖动落点，临时选中不保存，释放后清理手柄',async()=>{
 const f=await fixture(true),w=f.workspace,step=24.65
 const intent={id:'resizable-plan',kind:'workbench',state:'planning',types:[],startedAt:Date.now(),sawRunning:true,description:'规划交互验证'}
 await f.event('odyssey:creation-progress',f.win,{detail:{sessionId:'grid-test',intent}})
 const planning=f.host.querySelector('[data-research-creation-planning]')
 expect(planning.querySelector('[data-research-generation-toggle]')).toBeNull()
 await f.event('pointerdown',planning.querySelector('strong'),{button:0,pointerId:150,clientX:450,clientY:300})
 await f.event('pointerup',f.canvas,{pointerId:150,clientX:450,clientY:300+step*6})
 const moved=w.getWorkbenchCells().find(c=>c.id===intent.id)
 expect(moved.freePosition).toBe(true);expect(moved.y).toBeGreaterThanOrEqual(6)
 expect(w.getSnapshot().selection.selectedNodeIds).toEqual([intent.id])
 expect(planning.hasAttribute('data-selected')).toBe(true)
 const widthHandle=f.host.querySelector('[data-workbench-resize="'+intent.id+'"][data-workbench-resize-axis="x"]')
 expect(widthHandle).not.toBeNull()
 await f.event('pointerdown',widthHandle,{button:0,pointerId:151,clientX:750,clientY:400})
 await f.event('pointerup',f.canvas,{pointerId:151,clientX:750+step*3,clientY:400})
 const heightHandle=f.host.querySelector('[data-workbench-resize="'+intent.id+'"][data-workbench-resize-axis="y"]')
 await f.event('pointerdown',heightHandle,{button:0,pointerId:152,clientX:450,clientY:550})
 await f.event('pointerup',f.canvas,{pointerId:152,clientX:450,clientY:550+step*4})
 const resized=w.getWorkbenchCells().find(c=>c.id===intent.id)
 expect(resized).toMatchObject({x:moved.x,y:moved.y,w:moved.w+3,h:moved.h+4,freePosition:true})
 await act(async()=>w.undo())
 expect(w.getWorkbenchCells().find(c=>c.id===intent.id)).toMatchObject({w:resized.w,h:moved.h,y:moved.y})
 await act(async()=>w.redo())
 expect(w.getWorkbenchCells().find(c=>c.id===intent.id)).toEqual(resized)
 for(const state of ['stopping','failed','stopped']){
  await f.event('odyssey:creation-progress',f.win,{detail:{sessionId:'grid-test',intent:{...intent,state}}})
  expect(w.getWorkbenchCells().find(c=>c.id===intent.id)).toEqual(resized)
  expect(planning.querySelector('[data-research-generation-toggle]')).toBeNull()
 }
 await act(async()=>w.persist())
 expect(w.getWorkbenchDocument().artifacts).toEqual([])
 const saved=Array.from({length:f.win.localStorage.length},(_,i)=>f.win.localStorage.getItem(f.win.localStorage.key(i))).join('\n')
 expect(saved).not.toContain(intent.id)
 await f.event('odyssey:creation-progress',f.win,{detail:{sessionId:'grid-test',intent:null}})
 expect(w.getSnapshot().selection.selectedNodeIds).toEqual([])
 expect(f.host.querySelector('[data-workbench-resize="'+intent.id+'"]')).toBeNull()
})
it.each(['generated-container','generated-mind-map','generated-summary'])('%s 的过程入口只在子 Agent 已启动时显示并打开对应子会话',async kind=>{
 const f=await fixture(true),w=f.workspace
 const node={...text('process-card'),kind,generationStatus:'running',generationTaskId:'task-id',generationStartedAt:Date.now(),generationEvents:[],sourceNodeIds:['source'],containerPrompt:'模拟验证',refreshMinutes:0}
 await act(async()=>w.setArtifacts([node]))
 expect(f.host.querySelector('[data-research-generation-toggle]')).toBeNull()
 await act(async()=>w.setArtifacts([{...node,generationChildSessionId:'child-agent'}]))
 const process=f.host.querySelector('[data-research-generation-toggle]')
 expect(process).not.toBeNull()
 let opened
 f.win.addEventListener('sherlock:component-process',event=>{opened=event.detail.childSessionId;event.detail.handled=true;event.detail.resolve()})
 await f.event('click',process)
 expect(opened).toBe('child-agent')
})
it('拖动网格事务可撤销并恢复所有让位组件，重新打开保持格位',async()=>{
 const f=await fixture();f.workspace.setCanvasSize({width:1000,height:700});f.workspace.setArtifacts([text('a'),text('b',740)]);f.workspace.setWorkbenchWidth(1000)
 const before=structuredClone(f.workspace.getSnapshot().artifacts),cells=f.workspace.getWorkbenchCells()
 f.workspace.applyWorkbenchCells(cells.map(n=>({...n,x:n.id==='a'?20:0})),true)
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id==='a').x).not.toBe(before[0].x)
 expect(f.workspace.undo()).toBe(true)
 expect(f.workspace.getSnapshot().artifacts.map(n=>[n.id,n.x,n.y,n.width,n.height])).toEqual(before.map(n=>[n.id,n.x,n.y,n.width,n.height]))
 const restored=f.bundle.createResearchWorkspaceSession(f.win.localStorage,'grid-test');restored.setCanvasSize({width:1000,height:700});restored.setWorkbenchWidth(1000)
 expect(restored.getWorkbenchCells()).toEqual(f.workspace.getWorkbenchCells())
})
it('选中正文后画布撤销重做有效，输入框保留文字撤销',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a'),text('b',740)]))
 const before=f.workspace.getWorkbenchCells();await act(async()=>f.workspace.applyWorkbenchCells(before.map(c=>({...c,x:c.id==='a'?20:0})),true))
 const moved=f.workspace.getWorkbenchCells(),card=f.host.querySelector('[data-research-node-id="a"]')
 await f.event('pointerdown',card,{button:0,pointerId:21});expect(f.document.activeElement).toBe(f.canvas)
 const body=f.document.createElement('div');body.setAttribute('data-research-preview-interactive','');card.append(body);body.tabIndex=0;body.focus()
 const undo=await f.event('keydown',body,{metaKey:true,key:'z',code:'KeyZ'});expect(undo.defaultPrevented).toBe(true);expect(f.workspace.getWorkbenchCells()).toEqual(before)
 await f.event('keydown',body,{metaKey:true,shiftKey:true,key:'Z',code:'KeyZ'});expect(f.workspace.getWorkbenchCells()).toEqual(moved)
 const input=f.document.createElement('textarea');body.append(input);input.focus()
 const editing=await f.event('keydown',input,{metaKey:true,key:'z',code:'KeyZ'});expect(editing.defaultPrevented).toBe(false);expect(f.workspace.getWorkbenchCells()).toEqual(moved)
})
it('嵌入正文撤销只接受当前选中组件的受限桥接消息',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a'),text('b',740)]))
 const before=f.workspace.getWorkbenchCells();await act(async()=>f.workspace.applyWorkbenchCells(before.map(c=>({...c,x:c.id==='a'?20:0})),true))
 const moved=f.workspace.getWorkbenchCells(),card=f.host.querySelector('[data-research-node-id="a"]'),frame=f.document.createElement('iframe');frame.setAttribute('data-research-html-artifact','');card.append(frame)
 await act(async()=>f.workspace.updateSelection(['a'],'replace'))
 const data={type:'sherlock-workbench-history',action:'undo'}
 await f.event('message',f.win,{source:{},data});await f.event('message',f.win,{source:frame.contentWindow,data:{...data,extra:1}});expect(f.workspace.getWorkbenchCells()).toEqual(moved)
 await f.event('message',f.win,{source:frame.contentWindow,data});expect(f.workspace.getWorkbenchCells()).toEqual(before)
 await act(async()=>f.workspace.updateSelection(['a'],'replace'));await f.event('message',f.win,{source:frame.contentWindow,data:{...data,action:'redo'}});expect(f.workspace.getWorkbenchCells()).toEqual(moved)
 await act(async()=>f.workspace.updateSelection([],'replace'));await f.event('message',f.win,{source:frame.contentWindow,data});expect(f.workspace.getWorkbenchCells()).toEqual(moved)
})
it('整理提示固定在可见画布底部工具栏上方，滚动保持位置',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('contextmenu',f.canvas,{clientX:800,clientY:500,button:2});await f.event('click',f.document.querySelector('[data-research-context-arrange]'))
 const notice=f.document.querySelector('[data-research-arrange-feedback]'),bottom=Math.max(86,f.win.innerHeight-700+86)+'px';expect(notice).not.toBeNull();expect(notice.hasAttribute('data-ework-toolbar')).toBe(false);expect(f.canvas.contains(notice)).toBe(false);expect(notice.style.position).toBe('fixed');expect(notice.style.bottom).toBe(bottom);expect(notice.style.left).toBe('500px')
 f.canvas.scrollTop=300;await f.event('scroll',f.canvas);expect(notice.style.bottom).toBe(bottom);expect(notice.style.left).toBe('500px')
})
it('底部选择工具右侧的一键整理调用右键相同布局并补齐空隙',async()=>{
 const f=await fixture(true),toolbar=f.document.querySelector('[data-ework-toolbar]')
 const select=toolbar.querySelector('[data-research-global-select]'),arrange=toolbar.querySelector('[data-research-global-arrange]')
 expect(arrange).not.toBeNull();expect(select.nextElementSibling.querySelector('[data-research-global-arrange]')).toBe(arrange)
 expect(arrange.getAttribute('aria-label')).toBe('一键整理画布');expect(arrange.disabled).toBe(true)
 await act(async()=>{f.workspace.setArtifacts([text('a',160,120),text('b',900,1000),text('c',250,2000)])})
 const before=f.workspace.getWorkbenchCells();expect(arrange.disabled).toBe(false)
 await f.event('click',arrange)
 const cells=f.workspace.getWorkbenchCells()
 expect(cells.map(({y})=>y)).toEqual([0,0,10]);expect(cells.find(c=>c.id==='a').h).toBe(cells.find(c=>c.id==='b').h);expect(cells.find(c=>c.id==='c')).toMatchObject({x:0,w:40});expect(cells).not.toEqual(before)
 expect(f.document.querySelector('[data-research-arrange-feedback]')?.textContent).toContain('已整理 3 个组件')
 expect(f.canvas.getAttribute('data-canvas-tool')).toBe('select')
})
it('链接和语音草稿在末尾追加，保留不等大的已有组件',async()=>{
 const f=await fixture();f.workspace.setCanvasSize({width:1000,height:700});f.workspace.setArtifacts([text('a'),{...text('b',740),height:500}]);f.workspace.setWorkbenchWidth(1000)
 const bottom=Math.max(...f.workspace.getWorkbenchCells().map(n=>n.y+n.h))
 const link=f.workspace.createContainerDraft(null,'link'),voice=f.workspace.createContainerDraft(null,'voice'),cells=f.workspace.getWorkbenchCells()
 expect(cells.find(n=>n.id===link.id).y).toBe(bottom)
 expect(cells.find(n=>n.id===voice.id).y).toBeGreaterThan(cells.find(n=>n.id===link.id).y)
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===voice.id).title).toBe('语音组件')
 f.workspace.updateSelection([link.id],'replace')
 expect(f.workspace.getWorkbenchCells().find(n=>n.id===link.id).y).toBe(bottom)
})
it('整理展开菜单选择排数、标记当前选项，主按钮重复当前布局并可撤销',async()=>{
 const f=await fixture(true)
 await act(async()=>f.workspace.setArtifacts([text('a',160,120),text('b',850,120),text('c',160,1000),text('d',850,1000)]))
 const button=f.document.querySelector('[data-research-global-arrange]'),toggle=f.document.querySelector('[data-workbench-arrange-toggle]')
 expect(button.querySelector('svg').getAttribute('viewBox')).toBe('0 0 24 24');expect(button.querySelector('path').getAttribute('d')).toBe('M12 3.5v17M12 12h8.5')
 expect(toggle).not.toBeNull();expect(toggle.getAttribute('aria-expanded')).toBe('false')
 await f.event('click',toggle)
 let menu=f.document.querySelector('[data-workbench-arrange-menu]')
 expect(f.canvas.contains(menu)).toBe(false)
 expect([...menu.querySelectorAll('[role=menuitemradio]')].map(b=>b.textContent)).toEqual(['自动整理','标准整理','三排整理','双排整理','单排整理'])
 expect([...menu.querySelectorAll('.ew-arrange-layout-icon')].every(svg=>svg.getAttribute('viewBox')==='0 0 24 24'&&svg.getAttribute('stroke-width')==='1.8')).toBe(true)
 expect(menu.querySelector('[data-arrange-mode=standard]').getAttribute('aria-checked')).toBe('true')
 const before=f.workspace.getWorkbenchCells()
 await f.event('click',menu.querySelector('[data-arrange-mode=three]'))
 const three=f.workspace.getWorkbenchCells()
 expect(three.filter(c=>c.y===0).length).toBe(3)
 expect(f.document.querySelector('[data-workbench-arrange-menu]')).toBeNull()
 await f.event('keydown',f.canvas,{metaKey:true,key:'z',code:'KeyZ'})
 expect(f.workspace.getWorkbenchCells()).toEqual(before)
 await f.event('click',button);expect(f.workspace.getWorkbenchCells()).toEqual(three)
 await f.event('click',toggle);menu=f.document.querySelector('[data-workbench-arrange-menu]')
 expect(menu.querySelector('[data-arrange-mode=three]').getAttribute('aria-checked')).toBe('true')
 await f.event('click',menu.querySelector('[data-arrange-mode=one]'))
 expect(f.workspace.getWorkbenchCells().every(c=>c.w===40&&c.x===0)).toBe(true)
})
it.each(['standard','three','two','one'])('%s整理一次接纳视野外首次加载的内容尺寸并完成全画布补位',async mode=>{
 const f=await fixture(true),w=f.workspace
 const html=id=>({...text(id),kind:'generated-container',containerPrompt:'布局回归',generationStatus:'completed',refreshMinutes:0,containerSpec:{version:1,type:'html',title:id,html:'<!doctype html><html><body><p>'+id+'：保留完整内容</p></body></html>'}})
 await act(async()=>{
  w.setArtifacts(['top','middle','last'].map(html))
  w.applyWorkbenchCells([{id:'top',x:0,y:0,w:40,h:100},{id:'middle',x:0,y:100,w:40,h:100},{id:'last',x:0,y:200,w:40,h:100}],true)
 })
 expect(f.canvas.querySelector('[data-research-node-id="last"] [data-research-deferred-html]')).not.toBeNull()
 const before=w.getWorkbenchCells()
 if(mode==='standard')await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 else{
  await f.event('click',f.document.querySelector('[data-workbench-arrange-toggle]'))
  await f.event('click',f.document.querySelector('[data-arrange-mode="'+mode+'"]'))
 }
 await vi.waitFor(()=>expect(f.canvas.querySelectorAll('iframe[data-research-html-artifact]')).toHaveLength(3))
 for(const id of ['top','middle','last']){
  const frame=f.canvas.querySelector('[data-research-node-id="'+id+'"] iframe'),node=w.getSnapshot().artifacts.find(n=>n.id===id)
  // A newly mounted sandbox has its own inner width, excluding card padding.
  Object.defineProperty(frame,'clientWidth',{configurable:true,value:Math.round(node.width-20)})
  Object.defineProperty(frame,'clientHeight',{configurable:true,value:node.height-58})
  await f.event('message',f.win,{source:frame.contentWindow,data:{type:'sherlock-workbench-content-size',width:frame.clientWidth,height:120}})
 }
 await vi.waitFor(()=>expect(w.getWorkbenchCells().every(c=>c.h<12)).toBe(true))
 const settled=w.getWorkbenchCells()
 expect(settled).toHaveLength(3)
 for(const x of new Set(settled.map(c=>c.x))){
  let bottom=0
  for(const c of settled.filter(c=>c.x===x).sort((a,b)=>a.y-b.y)){expect(c.y).toBe(bottom);bottom=c.y+c.h}
 }
 await vi.waitFor(()=>expect(f.canvas.__eworkContentFit).toBeUndefined())
 f.canvas.scrollTop=500;await f.event('scroll',f.canvas)
 expect(w.getWorkbenchCells()).toEqual(settled)
 await f.event('keydown',f.canvas,{metaKey:true,key:'z',code:'KeyZ'})
 expect(w.getWorkbenchCells()).toEqual(before)
})
it('整理菜单支持键盘选择、Esc和点击外部关闭，空画布禁止展开',async()=>{
 let shared=false
 const f=await fixture(true,{researchBoards:{isSharedSession:()=>shared}}),toggle=f.document.querySelector('[data-workbench-arrange-toggle]')
 expect(toggle).not.toBeNull();expect(toggle.disabled).toBe(true)
 await act(async()=>f.workspace.setArtifacts([text('a'),text('b',750)]))
 await f.event('keydown',toggle,{key:'ArrowUp'})
 let menu=f.document.querySelector('[data-workbench-arrange-menu]')
 expect(menu).not.toBeNull()
 await f.event('keydown',menu,{key:'End'})
 expect(f.document.activeElement.getAttribute('data-arrange-mode')).toBe('one')
 await f.event('keydown',menu,{key:'Escape'})
 expect(f.document.querySelector('[data-workbench-arrange-menu]')).toBeNull();expect(f.document.activeElement).toBe(toggle)
 await f.event('click',toggle);await f.event('pointerdown',f.document.body)
 expect(f.document.querySelector('[data-workbench-arrange-menu]')).toBeNull()
 shared=true;await f.render();expect(toggle.disabled).toBe(true)
 expect(f.document.querySelector('[data-research-global-arrange]').disabled).toBe(true)
})
it('三排整理等待网页重新测高后仍保留三列，整笔只撤销一步',async()=>{
 const f=await fixture(true),w=f.workspace,n=id=>({...text(id),kind:'generated-container',containerPrompt:'文章',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:id,html:'<p>'+id+'</p>'}})
 await act(async()=>{w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000);w.setArtifacts(['a','b','c','d'].map(n))})
 const before=w.getWorkbenchCells()
 await f.event('click',f.document.querySelector('[data-workbench-arrange-toggle]'))
 await f.event('click',f.document.querySelector('[data-workbench-arrange-menu] [data-arrange-mode=three]'))
 for(const node of w.getSnapshot().artifacts){
   const frame=f.host.querySelector('[data-research-node-id="'+node.id+'"] iframe')
   await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frame.contentWindow,data:{type:'sherlock-workbench-content-size',width:Math.round(node.width),height:node.id==='b'?950:300}})))
 }
 await act(async()=>new Promise(r=>setTimeout(r,450)))
 expect(w.getWorkbenchCells().filter(c=>c.y===0).map(c=>c.x)).toEqual([0,13,27])
 const cells=w.getWorkbenchCells(),at=id=>cells.find(c=>c.id===id)
 expect(w.getWorkbenchVisibleCells().filter(c=>c.y===0).map(c=>c.x)).toEqual([0,13,27])
 expect(w.getSnapshot().artifacts.find(n=>n.id==='b').height).toBeGreaterThanOrEqual(1008)
 expect(at('d').y).toBe(Math.min(at('a').h,at('c').h));expect(at('d').y).toBeLessThan(at('b').h)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})

it('固定排数经过侧栏挤窄和重开仍保持选择，整理不会改变组件正文',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>w.setArtifacts(['a','b','c','d','e'].map(id=>text(id))))
 const original=w.getSnapshot().artifacts.map(n=>[n.id,n.excerpt]),toggle=f.document.querySelector('[data-workbench-arrange-toggle]')
 await f.event('click',toggle);await f.event('click',f.document.querySelector('[data-arrange-mode=three][role=menuitemradio]'))
 await act(async()=>{w.setCanvasSize({width:640,height:700,availableWidth:640});w.setWorkbenchWidth(640)})
 expect(w.getWorkbenchVisibleCells().filter(c=>c.y===0).map(c=>c.x)).toEqual([0,13,27])
 expect(w.getSnapshot().artifacts.map(n=>[n.id,n.excerpt])).toEqual(original)
 await act(async()=>w.persist())
 const reopened=f.bundle.createResearchWorkspaceSession(f.win.localStorage,'grid-test');reopened.setCanvasSize({width:640,height:700,availableWidth:640});reopened.setWorkbenchWidth(640)
 expect(reopened.getWorkbenchVisibleCells().filter(c=>c.y===0).map(c=>c.x)).toEqual([0,13,27])
})

it.each([{mode:'three',width:880,label:'三排整理'},{mode:'two',width:550,label:'双排整理'}])('$label宽度不足只在点击后于工具栏上方提示，保留当前布局',async({mode,width,label})=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setCanvasSize({width,height:700,availableWidth:width});w.setWorkbenchWidth(width);w.setArtifacts(['a','b','c','d'].map(id=>text(id)))})
 const before=w.getWorkbenchCells(),toggle=f.document.querySelector('[data-workbench-arrange-toggle]')
 expect(f.document.querySelector('[data-research-arrange-feedback]')).toBeNull()
 await f.event('click',toggle)
 expect(f.document.querySelector('[data-research-arrange-feedback]')).toBeNull()
 await f.event('click',f.document.querySelector('[data-arrange-mode='+mode+'][role=menuitemradio]'))
 const notice=f.document.querySelector('[data-research-arrange-feedback]')
 expect(notice).not.toBeNull();expect(notice.textContent).toContain('画布宽度不足');expect(notice.textContent).toContain(label)
 expect(f.canvas.contains(notice)).toBe(false)
 expect(parseFloat(notice.style.bottom)-parseFloat(f.document.querySelector('[data-ework-toolbar]').style.bottom)).toBe(66);expect(notice.getAttribute('role')).toBe('alert');expect(notice.querySelector('img')).toBeNull()
 expect(w.getWorkbenchCells()).toEqual(before)
 expect(f.document.querySelector('.ew-arrange-tool').getAttribute('data-arrange-mode')).toBe('standard')
 expect(f.document.querySelector('[data-workbench-arrange-menu]')).toBeNull()
})
it('未完成智能容器和链接草稿拖到空位后保留落点，生成期间及重新打开不向上吸附',async()=>{
 const f=await fixture(true),w=f.workspace,step=24.65
 for(const kind of ['container','link']){
  let draft;await act(async()=>{w.setArtifacts([]);draft=w.createContainerDraft(null,kind);w.applyWorkbenchCells([{id:draft.id,x:0,y:0,w:14,h:10}],true)})
  const handle=f.host.querySelector('[data-workbench-drag-handle="'+draft.id+'"]')
  await f.event('pointerdown',handle,{button:0,pointerId:93,clientX:80,clientY:28})
  await f.event('pointerup',f.canvas,{pointerId:93,clientX:80,clientY:28+step*10})
  expect(w.getWorkbenchCells().find(c=>c.id===draft.id).y).toBe(10)
  if(kind==='container')await act(async()=>w.beginContainerGeneration(draft.id,'保留位置生成组件'))
  await act(async()=>w.renameNode(draft.id,'位置验证'));expect(w.getWorkbenchCells().find(c=>c.id===draft.id).y).toBe(10)
  const reopened=f.bundle.createResearchWorkspaceSession(f.win.localStorage,'grid-test');reopened.setCanvasSize({width:1000,height:700});reopened.setWorkbenchWidth(1000)
  expect(reopened.getWorkbenchCells().find(c=>c.id===draft.id).y).toBe(10)
  if(kind==='container'){
   await act(async()=>w.setArtifacts(w.getSnapshot().artifacts.map(n=>({...n,generationStatus:'completed',containerSpec:{version:1,type:'table',title:'完成结果',columns:['指标','数值'],rows:[['A','1']]}}))))
   const normalHandle=f.host.querySelector('[data-workbench-drag-handle="'+draft.id+'"]')
   await f.event('pointerdown',normalHandle,{button:0,pointerId:94,clientX:80,clientY:274.5})
   await f.event('pointerup',f.canvas,{pointerId:94,clientX:80,clientY:299.15})
   expect(w.getWorkbenchCells().find(c=>c.id===draft.id).y).toBe(0)
  }
 }
})
it('点击添加链接后定位到末尾的新输入卡片，卡片完整显示在工具栏上方',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a')]);f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:55}],true)})
 Object.defineProperty(f.canvas,'scrollHeight',{configurable:true,value:2200});f.win.matchMedia=()=>({matches:true})
 await f.event('click',f.document.querySelector('[data-research-global-link]'))
 const node=f.workspace.getSnapshot().artifacts.find(n=>n.id!=='a')
 expect(f.canvas.scrollTop).toBeGreaterThan(900)
 expect(node.y-node.height/2-f.canvas.scrollTop).toBeGreaterThanOrEqual(0)
 expect(node.y+node.height/2-f.canvas.scrollTop).toBeLessThanOrEqual(614)
})
it('顶栏问答进入右侧会话，更多菜单包含三项原工具',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 expect(f.host.querySelector('[data-workbench-refresh="a"]')).not.toBeNull()
 await f.event('click',f.host.querySelector('[data-workbench-ask="a"]'))
 expect(f.actions.setResearchRightTab).toHaveBeenCalledWith('conversation');expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['a'])
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'))
 expect(f.document.querySelector('.ew-grid-menu').textContent).toContain('思维导图')
 expect(f.document.querySelector('.ew-grid-menu').textContent).toContain('总结提炼')
 expect(f.document.querySelector('.ew-grid-menu').textContent).toContain('基于所选创建')
})
it('链接组件使用隔离网页容器，顶栏刷新复用当前网页',async()=>{
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(async()=>({image:'',error:''})),hideNative:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge})
 let node;await act(async()=>{node=f.workspace.createWebLink('https://www.baidu.com/')})
 expect(bridge.resolveEngine).toHaveBeenCalledWith({sessionId:'grid-test',nodeId:node.id,url:'https://www.baidu.com/',preferNative:true})
 const element=f.host.querySelector('[data-research-native-web]'),reload=vi.fn(element.__eworkReloadWeb)
 element.__eworkReloadWeb=reload
 await f.event('click',f.host.querySelector('[data-workbench-refresh="'+node.id+'"]'))
 expect(reload).toHaveBeenCalledTimes(1);expect(bridge.releaseNative).not.toHaveBeenCalled()
})
it('链接组件更多菜单按 10% 缩放并重置当前网页，刷新沿用顶栏动作',async()=>{
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(async()=>({image:'',error:'',loading:false})),hideNative:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge});let node
 await act(async()=>{node=f.workspace.createWebLink('https://www.baidu.com/');f.workspace.updateSelection([node.id],'replace')})
 const element=f.host.querySelector('[data-research-native-web]')
 element.getBoundingClientRect=()=>({left:12,top:46,right:492,bottom:346,width:480,height:300})
 Object.defineProperties(element,{offsetWidth:{value:480},offsetHeight:{value:300}});f.document.elementFromPoint=()=>element
 await act(async()=>{await new Promise(r=>setTimeout(r,300))})
 const open=async()=>f.event('click',f.host.querySelector('[data-workbench-more="'+node.id+'"]'))
 await open()
 const groups=[[]];for(const child of f.document.querySelector('[role="menu"][aria-label="组件更多操作"]').children){if(child.getAttribute('role')==='separator')groups.push([]);else groups.at(-1).push(child.textContent.replace('›',''))}
 expect(groups).toEqual([['放大阅读','缩小10%','放大10%','重置页面大小','刷新'],['复制组件','重命名','导出'],['思维导图','总结提炼','基于所选创建'],['数据源与自动更新','组件设置'],['移除组件']])
 await f.event('keydown',f.document.body,{key:'Escape'})
 const choose=async name=>{await open();const item=f.document.querySelector('[data-workbench-web-zoom="'+name+'"]');expect(item).not.toBeNull();await f.event('click',item)}
 await choose('in');expect(f.host.querySelector('[data-research-native-web]').getAttribute('data-web-page-zoom')).toBe('1.1')
 await choose('in');expect(f.host.querySelector('[data-research-native-web]').getAttribute('data-web-page-zoom')).toBe('1.2')
 await choose('out');expect(f.host.querySelector('[data-research-native-web]').getAttribute('data-web-page-zoom')).toBe('1.1')
 await choose('reset');expect(f.host.querySelector('[data-research-native-web]').getAttribute('data-web-page-zoom')).toBe('1')
 expect(bridge.updateNative.mock.lastCall[0].pageZoom).toBe(1)
 const reload=vi.fn(f.host.querySelector('[data-research-native-web]').__eworkReloadWeb)
 f.host.querySelector('[data-research-native-web]').__eworkReloadWeb=reload
 await open();await f.event('click',f.document.querySelector('[data-workbench-web-refresh]'))
 expect(reload).toHaveBeenCalledOnce()
})
it('宿主窗口调整后即使组件尺寸未变也立即恢复原生网页，不等待一秒轮询',async()=>{
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(async()=>({image:'',error:'',loading:false})),hideNative:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge});let node
 await act(async()=>{node=f.workspace.createWebLink('https://www.baidu.com/');f.workspace.updateSelection([node.id],'replace')})
 const el=f.host.querySelector('[data-research-native-web]');el.getBoundingClientRect=()=>({left:12,top:46,right:492,bottom:346,width:480,height:300});Object.defineProperties(el,{offsetWidth:{value:480},offsetHeight:{value:300}});f.document.elementFromPoint=()=>el
 await act(async()=>{await new Promise(r=>setTimeout(r,350))})
 expect(bridge.updateNative.mock.lastCall[0].active).toBe(true)
 const count=bridge.updateNative.mock.calls.length,previous=bridge.updateNative.mock.lastCall[0].bounds
 await f.event('resize',f.win)
 expect(bridge.updateNative.mock.calls.length).toBeGreaterThan(count)
 expect(bridge.updateNative.mock.lastCall[0]).toMatchObject({active:true,bounds:previous})
 expect(bridge.releaseNative).not.toHaveBeenCalled()
})
it('链接临时离开视窗再返回时保留当前网页，只有移除组件才释放原生页面',async()=>{
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(async()=>({image:'',error:'',loading:false})),hideNative:vi.fn(async()=>{}),release:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge});let node
 await act(async()=>{node=f.workspace.createWebLink('https://www.cctv.com/');f.workspace.updateSelection([node.id],'replace')})
 const frame=f.host.querySelector('[data-research-native-web]'),viewport=f.workspace.getSnapshot().viewport
 await act(async()=>f.workspace.setViewport({...viewport,y:-3000}))
 expect(f.host.querySelector('[data-research-native-web]')).toBe(frame)
 expect(bridge.releaseNative).not.toHaveBeenCalled()
 expect(bridge.hideNative).toHaveBeenCalled()
 await act(async()=>f.workspace.setViewport(viewport))
 expect(bridge.resolveEngine).toHaveBeenCalledTimes(1)
 expect(bridge.releaseNative).not.toHaveBeenCalled()
 await act(async()=>f.workspace.removeNodes([node.id]))
 expect(bridge.release).toHaveBeenCalledExactlyOnceWith({sessionId:'grid-test',nodeId:node.id})
 expect(bridge.releaseNative).not.toHaveBeenCalled()
})
it('切出会话只隐藏链接页面，回到原会话不关闭网页或释放其登录授权',async()=>{
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(async()=>({image:'',error:'',loading:false})),hideNative:vi.fn(async()=>{}),release:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{}),releaseSession:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge});let node
 await act(async()=>{node=f.workspace.createWebLink('https://example.com/')})
 await f.render({sessionId:'other',measure:false});f.registry.release('grid-test')
 expect(bridge.hideNative).toHaveBeenCalledWith({sessionId:'grid-test',nodeId:node.id})
 expect(bridge.hideNative).toHaveBeenCalledWith({sessionId:'grid-test'})
 await f.render({measure:false})
 expect(f.host.querySelector('[data-research-node-id="'+node.id+'"]')).not.toBeNull()
 expect(bridge.release).not.toHaveBeenCalled();expect(bridge.releaseNative).not.toHaveBeenCalled();expect(bridge.releaseSession).not.toHaveBeenCalled()
})
it('首次打开组件菜单不被右侧会话自动滚动关闭，画板滚动仍关闭',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const conversation=f.document.createElement('div');f.document.body.append(conversation)
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual([])
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'))
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['a'])
 await f.event('scroll',conversation)
 expect(f.document.querySelector('.ew-grid-menu')).not.toBeNull()
 await f.event('scroll',f.canvas)
 expect(f.document.querySelector('.ew-grid-menu')).toBeNull()
})

it('链接组件在网格拖动期间隐藏原生层并暂停捕获，松手后恢复',async()=>{
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(async()=>({image:'data:image/png;base64,test',error:''})),hideNative:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge});let node
 await act(async()=>{node=f.workspace.createWebLink('https://www.baidu.com/');f.workspace.updateSelection([node.id],'replace')})
 const el=f.host.querySelector('[data-research-native-web]')
 el.getBoundingClientRect=()=>({left:12,top:46,right:492,bottom:346,width:480,height:300})
 Object.defineProperties(el,{offsetWidth:{value:480},offsetHeight:{value:300}});f.document.elementFromPoint=()=>el
 await act(async()=>{await new Promise(r=>setTimeout(r,350))})
 expect(bridge.updateNative.mock.calls.some(([value])=>value.active)).toBe(true)
 const count=bridge.updateNative.mock.calls.length
 await act(async()=>{f.canvas.setAttribute('data-grid-operation','move');await new Promise(r=>setTimeout(r,250))})
 expect(bridge.hideNative).toHaveBeenCalled();expect(bridge.updateNative).toHaveBeenCalledTimes(count)
 await act(async()=>{f.canvas.removeAttribute('data-grid-operation');await new Promise(r=>setTimeout(r,350))})
 expect(bridge.updateNative.mock.calls.length).toBeGreaterThan(count)
 expect(bridge.updateNative.mock.lastCall[0].active).toBe(true)
 const restored=bridge.updateNative.mock.calls.length
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="'+node.id+'"]'),{button:0,pointerId:90,clientX:100,clientY:24})
 expect(f.canvas.getAttribute('data-grid-operation')).toBe('move')
 await f.event('blur',f.win)
 expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
 await act(async()=>{await new Promise(r=>setTimeout(r,400))})
 expect(bridge.updateNative.mock.calls.length).toBeGreaterThan(restored)
 expect(bridge.updateNative.mock.lastCall[0].active).toBe(true)
 const afterBlur=bridge.updateNative.mock.calls.length
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="'+node.id+'"]'),{button:0,pointerId:94,clientX:100,clientY:24})
 await f.event('keydown',f.canvas,{key:'Escape',code:'Escape'})
 expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
 await act(async()=>{await new Promise(r=>setTimeout(r,400))})
 expect(bridge.updateNative.mock.calls.length).toBeGreaterThan(afterBlur)
})

it('指针在同一吸附格内移动只更新浮卡，不反复提交整份画布',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setArtifacts([text('a'),text('b',740)]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:8},{id:'b',x:20,y:0,w:20,h:8}],true)})
 const apply=vi.spyOn(w,'applyWorkbenchCells'),handle=f.host.querySelector('[data-workbench-drag-handle="a"]')
 await f.event('pointerdown',handle,{button:0,pointerId:91,clientX:200,clientY:24})
 const initial=apply.mock.calls.length
 for(let i=1;i<=5;i++)await f.event('pointermove',f.canvas,{pointerId:91,clientX:200+i,clientY:24+i})
 expect(apply.mock.calls.length).toBe(initial)
 expect(f.host.querySelector('[data-research-node-id="a"]').style.getPropertyValue('--grid-float-left')).not.toBe('')
 await f.event('pointercancel',f.canvas,{pointerId:91})
})

it('链接拖动前发出的迟到截图在松手后也不能覆盖当前快照',async()=>{
 let resolve
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(()=>new Promise(r=>{resolve=r})),hideNative:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge});let node
 await act(async()=>{node=f.workspace.createWebLink('https://www.baidu.com/');f.workspace.updateSelection([node.id],'replace')})
 const el=f.host.querySelector('[data-research-native-web]')
 el.getBoundingClientRect=()=>({left:12,top:46,right:492,bottom:346,width:480,height:300})
 Object.defineProperties(el,{offsetWidth:{value:480},offsetHeight:{value:300}});f.document.elementFromPoint=()=>el
 await act(async()=>{await new Promise(r=>setTimeout(r,350))})
 expect(resolve).toBeTypeOf('function')
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="'+node.id+'"]'),{button:0,pointerId:93,clientX:100,clientY:24})
 await f.event('pointerup',f.canvas,{pointerId:93,clientX:100,clientY:24})
 expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
 await act(async()=>resolve({image:'data:image/png;base64,STALE',error:''}))
 expect(el.querySelector('img').getAttribute('src')).not.toBe('data:image/png;base64,STALE')
})
it('组件工具在已有组件上拉框，取消恢复让位；选择工具仍框选',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const before=structuredClone(f.workspace.getSnapshot().artifacts)
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 await f.event('pointerdown',f.host.querySelector('[data-research-node-id="a"]'),{button:0,pointerId:1,clientX:20,clientY:20})
 await f.event('pointermove',f.canvas,{pointerId:1,clientX:470,clientY:280})
 expect(f.canvas.getAttribute('data-grid-operation')).toBe('draw')
 await f.event('pointercancel',f.canvas,{pointerId:1})
 expect(f.workspace.getSnapshot().artifacts).toEqual(before)
 await f.event('click',f.document.querySelector('[data-research-global-select]'))
 await f.event('pointerdown',f.canvas,{button:0,pointerId:2,clientX:0,clientY:0})
 await f.event('pointermove',f.canvas,{pointerId:2,clientX:950,clientY:650})
 await f.event('pointerup',f.canvas,{pointerId:2,clientX:950,clientY:650})
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['a'])
})
it('刷新提示基于真实成功时间，未刷新时不显示假日期',()=>{
 expect(workbenchRefreshTooltip(null)).toEqual({relative:'尚未刷新',absolute:'暂无成功刷新记录'})
 const at=new Date('2026-09-28T06:23:00Z').getTime()
 expect(workbenchRefreshTooltip(at,at+60000).relative).toBe('上次刷新：1 分钟前')
 expect(workbenchRefreshTooltip(at,at+60000).absolute).toMatch(/^2026年9月28日 \d{2}:23$/)
})

it('工作台和菜单图标统一16px视口与1.5px线宽，Figma路径离线打包',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const header=f.host.querySelector('.ew-grid-header')
 for(const name of ['refresh','ask','more','close']){
  const icon=header.querySelector('[data-workbench-icon="'+name+'"]')
  expect(icon).not.toBeNull();expect(icon.tagName).toBe('SPAN')
  const css=f.document.getElementById('ework-grid-workbench-style').textContent
  const encoded=css.match(new RegExp('\\.ew-grid-icon-'+name+'\\{mask-image:url\\("data:image/svg\\+xml;base64,([^"]+)'))[1]
  const svg=new f.win.DOMParser().parseFromString(Buffer.from(encoded,'base64').toString(),'image/svg+xml')
  expect(svg.documentElement.getAttribute('viewBox')).toBe('0 0 16 16')
  const group=svg.querySelector('[data-icon-family=workbench]')
  expect(group.getAttribute('stroke-width')).toBe('1.5')
  expect([...svg.querySelectorAll('path')].every(path=>!path.hasAttribute('stroke-width'))).toBe(true)
 }
 await f.event('click',header.querySelector('[data-workbench-more]'))
 for(const name of ['duplicate','expand','rename','download','branch','summary','plus','data','remove']){
  const icon=f.document.querySelector('.ew-grid-menu .ew-grid-icon-'+name)
  expect(icon,name).not.toBeNull()
 }
 const css=f.document.getElementById('ework-grid-workbench-style').textContent
 expect(css).not.toContain('figma.com/api/mcp/asset/')
})

it('真实桌面存储接受网格缓存，新增组件及格位在更换服务端口后仍恢复',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ework-grid-durable-')),store=new ResearchCanvasStorage(dir)
 disposals.push(()=>rm(dir,{recursive:true,force:true}))
 const f=await fixture(false,{researchCanvasStorage:{getItem:key=>store.getItem(key),setItem:(key,value)=>store.setItem(key,value)}})
 const native=new f.bundle.ResearchWorkspaceRegistry().for('native-durable')
 native.setCanvasSize({width:1000,height:700,availableWidth:1000});native.setWorkbenchWidth(1000)
 native.setArtifacts([text('source')])
 const draft=native.createContainerDraft(null),link=native.createContainerDraft(null,'link')
 native.applyWorkbenchCells(native.getWorkbenchCells(),true)
 expect(JSON.parse(new ResearchCanvasStorage(dir).getItem('sherlock.research.canvas.artifacts.v1:native-durable')).map(n=>n.id)).toEqual(['source',draft.id,link.id])
 const restored=new f.bundle.ResearchWorkspaceRegistry().for('native-durable')
 restored.setCanvasSize({width:824,height:700,availableWidth:824});restored.setWorkbenchWidth(824)
 expect(restored.getSnapshot().artifacts.map(n=>n.id)).toEqual(['source',draft.id,link.id])
 expect(restored.getWorkbenchCells()).toEqual(native.getWorkbenchCells())
})

it('连续正方形网格与吸附共用原点，拉框无尺寸文字且保留真实组件间距',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 const layer=f.canvas.querySelector('[data-research-content-layer]'),step=(1000-14)/40,gap=10
 const pattern=layer.style.getPropertyValue('--grid-pattern')
 expect(pattern).toContain('data:image/svg+xml')
 const svg=new f.win.DOMParser().parseFromString(decodeURIComponent(pattern.match(/data:image\/svg\+xml,([^"']+)/)[1]),'image/svg+xml')
 const tile=svg.documentElement,lines=svg.querySelector('path')
 expect(Number(tile.getAttribute('width'))).toBeCloseTo(step)
 expect(Number(tile.getAttribute('height'))).toBeCloseTo(step)
 expect(svg.querySelector('rect')).toBeNull()
 expect(lines.getAttribute('d')).toBe('M '+step+' 0 H 0 V '+step)
 expect(layer.style.getPropertyValue('--grid-gap')).toBe(gap+'px')
 const start={x:12+step*4+(step-gap)*.9,y:12+step*20+(step-gap)*.9},end={x:12+step*20+2,y:12+step*31+2}
 f.canvas.scrollTop=step*18;await f.event('scroll',f.canvas)
 await f.event('pointerdown',f.canvas,{button:0,pointerId:68,clientX:start.x,clientY:start.y-f.canvas.scrollTop})
 await f.event('pointermove',f.canvas,{pointerId:68,clientX:end.x,clientY:end.y-f.canvas.scrollTop})
 const preview=f.canvas.querySelector('.ew-grid-placeholder'),left=parseFloat(preview.style.left),top=parseFloat(preview.style.top)
 expect(left).toBeCloseTo(12+step*4);expect(top).toBeCloseTo(12+step*20)
 expect(left+parseFloat(preview.style.width)).toBeCloseTo(12+step*21-gap)
 expect(top+parseFloat(preview.style.height)).toBeCloseTo(12+step*32-gap)
 expect(preview.hasAttribute('data-grid-span')).toBe(false)
 expect(f.document.getElementById('ework-grid-workbench-style').textContent).not.toContain('attr(data-grid-span)')
 expect(preview.style.getPropertyValue('--grid-gap')).toBe(gap+'px')
 await f.event('pointercancel',f.canvas,{pointerId:68})
})

it('工作台底部来源与时间只展示信息，点击空白或文字不打开数据设置',async()=>{
 const f=await fixture(true),node={...text('footer'),kind:'generated-container',containerPrompt:'资讯',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'资讯',html:'<p>内容</p>'}}
 await act(async()=>f.workspace.setArtifacts([node]))
 const footer=f.host.querySelector('.odyssey-data-stamp')
 expect(footer.tagName).toBe('DIV');expect(footer.getAttribute('aria-label')).not.toContain('设置刷新频率')
 await f.event('pointerdown',footer,{button:0,pointerId:69})
 await f.event('click',footer)
 await f.event('click',footer.querySelector('.odyssey-data-frequency'))
 expect(f.document.querySelector('.odyssey-data-dialog')).toBeNull()
 expect(f.document.querySelector('[role=dialog]')).toBeNull()
 expect(footer.textContent).toContain('尚未刷新')
})

it('只给选中的组件显示外置调宽调高手柄，单轴拖动不触发底栏或更改另一尺寸',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const card=f.host.querySelector('[data-research-node-id="a"]')
 expect(f.canvas.querySelector('[data-workbench-resize]')).toBeNull()
 await act(async()=>f.workspace.updateSelection(['a'],'replace'))
 const handle=axis=>f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="'+axis+'"]')
 expect(card.contains(handle('x'))).toBe(false);expect(card.contains(handle('y'))).toBe(false)
 const before=f.workspace.getSnapshot().artifacts[0],step=(1000-14)/40
 expect(parseFloat(handle('x').style.left)).toBeCloseTo(before.x+before.width/2)
 expect(parseFloat(handle('y').style.top)).toBeCloseTo(before.y+before.height/2)
 await f.event('pointerdown',handle('x'),{button:0,pointerId:70,clientX:500,clientY:180})
 await f.event('pointerup',f.canvas,{pointerId:70,clientX:500+step*2,clientY:180+step*3})
 const wider=f.workspace.getSnapshot().artifacts[0]
 expect(wider.width).toBeCloseTo(before.width+step*2);expect(wider.height).toBe(before.height)
 await f.event('pointerdown',handle('y'),{button:0,pointerId:71,clientX:260,clientY:300})
 await f.event('pointerup',f.canvas,{pointerId:71,clientX:260+step*3,clientY:300+step*2})
 const taller=f.workspace.getSnapshot().artifacts[0]
 expect(taller.width).toBe(wider.width);expect(taller.height).toBeCloseTo(wider.height+step*2)
 await act(async()=>f.workspace.undo());expect(f.workspace.getSnapshot().artifacts[0].height).toBe(before.height)
 await act(async()=>f.workspace.undo());expect(f.workspace.getSnapshot().artifacts[0].width).toBe(before.width)
 await act(async()=>{f.workspace.setCanvasSize({width:240,height:700,availableWidth:240});f.workspace.setWorkbenchWidth(240)})
 expect(parseFloat(handle('x').style.width)).toBeLessThanOrEqual((240-24-40*4)/39)
 expect(parseFloat(handle('y').style.height)).toBeLessThanOrEqual((240-24-40*4)/39)
 expect(f.win.getComputedStyle(handle('x').querySelector('span')).pointerEvents).toBe('none')
 await act(async()=>{card.setAttribute('data-research-geometry-blocked','');await new Promise(r=>setTimeout(r,30))})
 expect(handle('x')).toBeNull();expect(handle('y')).toBeNull()
})
it('更多菜单先就地插入关联草稿，提交调用原生成流程且保留同一节点与来源',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'))
 const button=[...f.document.querySelectorAll('.ew-grid-menu button')].find(n=>n.textContent==='基于所选创建')
 await f.event('click',button)
 const draft=f.workspace.getSnapshot().artifacts.find(n=>n.creationMode==='selection'),cell=f.workspace.getWorkbenchCells().find(c=>c.id===draft.id)
 const card=f.host.querySelector('[data-research-node-id="'+draft.id+'"]')
 expect(draft).toMatchObject({generationStatus:'draft',sourceNodeIds:['a'],generationSources:[{id:'a',title:'a'}]})
 expect(card.closest('[data-research-content-layer]')).not.toBeNull()
 expect(f.host.querySelector('[data-research-create-popover]')).toBeNull()
 expect(card.querySelector('[data-workbench-selected-create-context]').textContent).toContain('基于：a')
 const input=f.host.querySelector('[aria-label="创建需求"]');expect(input).not.toBeNull()
 expect(f.document.activeElement).toBe(input)
 input.value='基于这些材料创建趋势分析';await f.event('input',input)
 await f.event('click',f.host.querySelector('[data-research-create-submit]'))
 expect(f.generation.generate).toHaveBeenCalledWith(expect.objectContaining({kind:'create',selectedNodeIds:['a'],targetNodeId:draft.id,prompt:'基于这些材料创建趋势分析'}))
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
 const queued=f.workspace.getSnapshot().artifacts.find(n=>n.id===draft.id)
 expect(queued).toMatchObject({generationStatus:'queued',containerPrompt:'基于这些材料创建趋势分析',sourceNodeIds:['a']})
 expect(queued.generationSources[0].text).toBe('# 真实组件\n保留正文')
 expect(f.workspace.getWorkbenchCells().find(c=>c.id===draft.id)).toEqual(cell)
})
it('恢复录音胶囊不改变工具栏链接按钮的尺寸、图标或隐藏文字',async()=>{
 const f=await fixture(true),toolbar=f.document.querySelector('[data-ework-toolbar]')
 for(const name of ['select','arrange','container','link','voice']){
  const button=toolbar.querySelector('[data-research-global-'+name+']'),style=f.win.getComputedStyle(button)
  expect(style.width,name).toBe(name==='arrange'?'34px':'36px');expect(style.height,name).toBe('34px')
  const icon=button.querySelector('svg,img,.odyssey-global-icon')
  expect(f.win.getComputedStyle(icon).width,name).toBe('20px')
  for(const label of button.querySelectorAll('span:not(.odyssey-global-icon)'))expect(f.win.getComputedStyle(label).display,name).toBe('none')
 }
})
it('语音先显示工具栏上方的原录音胶囊，识别完成才追加一次组件并执行',async()=>{
 let subscriber
 const bridge={subscribe:fn=>{subscriber=fn;return()=>{}},setActive:vi.fn(async()=>({ok:true})),start:vi.fn(async()=>({ok:true})),stop:vi.fn(async()=>({ok:true})),cancel:vi.fn(async()=>({ok:true}))}
 const f=await fixture(true,{researchVoice:bridge});await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.document.querySelector('[data-research-global-voice]'))
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
 const feedback=f.document.querySelector('[data-research-voice-feedback]')
 expect(feedback.closest('[data-ework-toolbar]')).not.toBeNull()
 expect(feedback.closest('[data-research-node-id]')).toBeNull()
 expect(f.win.getComputedStyle(feedback).height).toBe('44px')
 expect(f.win.getComputedStyle(feedback.querySelector('[data-research-voice-cancel]')).width).toBe('32px')
 expect(f.win.getComputedStyle(feedback.querySelector('[data-research-voice-finish]')).borderRadius).toBe('50%')
 const request=bridge.start.mock.calls[0][0]
 await act(async()=>{subscriber({...request,type:'state',state:'listening'});subscriber({...request,type:'partial',text:'分析这些金融指标'});subscriber({...request,type:'level',level:.8})})
 expect(feedback.querySelector('[data-research-voice-wave]').getAttribute('data-level')).toBe('0.8')
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
 await f.event('click',feedback.querySelector('[data-research-voice-finish]'))
 expect(bridge.stop).toHaveBeenCalledWith(request)
 expect(f.document.querySelector('[data-research-voice-feedback]').textContent).toContain('识别中')
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
 await act(async()=>{subscriber({...request,type:'final',text:'分析这些金融指标'});subscriber({...request,type:'final',text:'分析这些金融指标'});await new Promise(r=>setTimeout(r,30))})
 const voice=f.workspace.getSnapshot().artifacts.find(n=>n.id!=='a')
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
 expect(f.document.querySelector('[data-research-voice-feedback]')).toBeNull()
 expect(f.generation.generate).toHaveBeenCalledTimes(1)
 expect(f.generation.generate).toHaveBeenCalledWith(expect.objectContaining({kind:'container',targetNodeId:voice.id,prompt:'分析这些金融指标'}))
 const cells=f.workspace.getWorkbenchCells(),existing=cells.find(n=>n.id==='a')
 expect(cells.find(n=>n.id===voice.id).y).toBeGreaterThanOrEqual(existing.y+existing.h)
})
it('拉框松手只创建一次并保持目标格位，缩放更新真实渲染尺寸',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 await f.event('pointerdown',f.canvas,{button:0,pointerId:5,clientX:20,clientY:20})
 await f.event('pointermove',f.canvas,{pointerId:5,clientX:490,clientY:290})
 await f.event('pointerup',f.canvas,{pointerId:5,clientX:490,clientY:290})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
 const draft=f.workspace.getSnapshot().artifacts.find(n=>n.id!=='a'),beforeWidth=draft.width
 expect(f.workspace.getWorkbenchCells().find(n=>n.id===draft.id)).toMatchObject({x:0,y:0})
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="'+draft.id+'"][data-workbench-resize-axis="x"]'),{button:0,pointerId:6,clientX:490,clientY:290})
 await f.event('pointerup',f.canvas,{pointerId:6,clientX:735,clientY:395})
 const after=f.workspace.getSnapshot().artifacts.find(n=>n.id===draft.id),card=f.host.querySelector('[data-research-node-id="'+draft.id+'"]')
 expect(after.width).toBeGreaterThan(beforeWidth);expect(parseFloat(card.style.width)).toBe(after.width)
})
it('默认智能组件在排队、运行、失败、重试、重新打开和完成时保持同一尺寸',async()=>{
 const f=await fixture(true),w=f.workspace
 let draft;await act(async()=>{draft=w.createContainerDraft()})
 const geometry=n=>({width:n.width,height:n.height,x:n.x,y:n.y}),box=c=>({id:c.id,x:c.x,y:c.y,w:c.w,h:c.h})
 const before=geometry(w.getSnapshot().artifacts[0]),cells=w.getWorkbenchVisibleCells().map(box)
 const same=()=>{expect(geometry(w.getSnapshot().artifacts[0])).toEqual(before);expect(w.getWorkbenchVisibleCells().map(box)).toEqual(cells)}
 await act(async()=>w.beginContainerGeneration(draft.id,'生成两列数据表'));same()
 await act(async()=>w.attachGenerationTask(draft.id,{taskId:'default-task',canvasNodeId:draft.id,state:'running',lastSeq:0}));same()
 await act(async()=>w.applyGenerationInspection(draft.id,{taskId:'default-task',canvasNodeId:draft.id,state:'failed',lastSeq:1,events:[],error:'模型响应超时',completedAt:Date.now()}));same()
 expect(w.getSnapshot().artifacts[0].generationStatus).toBe('failed')
 await act(async()=>w.retryGeneration(draft.id));same()
 await act(async()=>w.attachGenerationTask(draft.id,{taskId:'retry-task',canvasNodeId:draft.id,state:'running',lastSeq:0}));same()
 await act(async()=>w.applyGenerationInspection(draft.id,{taskId:'retry-task',canvasNodeId:draft.id,state:'retrying',lastSeq:1,events:[]}));same()
 const reopened=f.bundle.createResearchWorkspaceSession(f.win.localStorage,'grid-test');reopened.setCanvasSize({width:1000,height:700});reopened.setWorkbenchWidth(1000)
 expect(geometry(reopened.getSnapshot().artifacts[0])).toEqual(before);expect(reopened.getWorkbenchVisibleCells().map(box)).toEqual(cells)
 await act(async()=>w.applyGenerationInspection(draft.id,{taskId:'retry-task',canvasNodeId:draft.id,state:'completed',lastSeq:2,events:[],finalOutput:JSON.stringify({version:1,type:'table',title:'完成',columns:['指标','数值'],rows:[['A','1']]}),completedAt:Date.now()}));same()
 expect(w.getSnapshot().artifacts[0].generationStatus).toBe('completed')
})
it('工作台拉框智能组件在排队、运行、重试、重新打开和完成时保持自定义尺寸',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>w.setArtifacts([text('peer')]))
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 await f.event('pointerdown',f.canvas,{button:0,pointerId:81,clientX:20,clientY:20})
 await f.event('pointerup',f.canvas,{pointerId:81,clientX:480,clientY:250})
 const box=c=>({id:c.id,x:c.x,y:c.y,w:c.w,h:c.h}),draft=w.getSnapshot().artifacts.find(n=>n.id!=='peer'),before=w.getSnapshot().artifacts.map(n=>({id:n.id,width:n.width,height:n.height,x:n.x,y:n.y})),cells=w.getWorkbenchCells().map(box)
 const same=()=>{expect(w.getSnapshot().artifacts.map(n=>({id:n.id,width:n.width,height:n.height,x:n.x,y:n.y}))).toEqual(before);expect(w.getWorkbenchVisibleCells().map(box)).toEqual(cells)}
 await act(async()=>w.beginContainerGeneration(draft.id,'生成表格，保留用户框选尺寸'));same()
 await act(async()=>w.attachGenerationTask(draft.id,{taskId:'drawn-task',canvasNodeId:draft.id,state:'running',lastSeq:0}));same()
 await act(async()=>w.applyGenerationInspection(draft.id,{taskId:'drawn-task',canvasNodeId:draft.id,state:'retrying',lastSeq:1,events:[]}));same()
 const reopened=f.bundle.createResearchWorkspaceSession(f.win.localStorage,'grid-test');reopened.setCanvasSize({width:1000,height:700});reopened.setWorkbenchWidth(1000)
 expect(reopened.getSnapshot().artifacts.find(n=>n.id===draft.id)).toMatchObject({width:draft.width,height:draft.height,preserveGenerationSize:true})
 await act(async()=>w.applyGenerationInspection(draft.id,{taskId:'drawn-task',canvasNodeId:draft.id,state:'completed',lastSeq:2,events:[],finalOutput:JSON.stringify({version:1,type:'table',title:'完成',columns:['指标','数值'],rows:[['A','1']]}),completedAt:Date.now()}));same()
 expect(w.getSnapshot().artifacts.find(n=>n.id===draft.id).generationStatus).toBe('completed')
})
it('智能草稿短拉框保留输入尺寸，手动可缩至统一最小尺寸，窄窗不污染规范布局',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 await f.event('pointerdown',f.canvas,{button:0,pointerId:71,clientX:910,clientY:50})
 await f.event('pointerup',f.canvas,{pointerId:71,clientX:915,clientY:55})
 const draft=w.getSnapshot().artifacts[0]
 expect(draft.width).toBeGreaterThanOrEqual(320);expect(draft.height).toBeGreaterThanOrEqual(220)
 expect(draft.x+draft.width/2).toBeLessThanOrEqual(988)
 const cells=w.getWorkbenchCells()
 for(const axis of ['x','y']){
  const handle=f.canvas.querySelector('[data-workbench-resize="'+draft.id+'"][data-workbench-resize-axis="'+axis+'"]')
  await f.event('pointerdown',handle,{button:0,pointerId:72,clientX:900,clientY:240})
  await f.event('pointerup',f.canvas,{pointerId:72,clientX:900-step*30,clientY:240-step*30})
 }
 const resized=w.getSnapshot().artifacts[0]
 expect(resized.width).toBeGreaterThanOrEqual(280);expect(resized.height).toBeGreaterThanOrEqual(160)
 expect(resized.width).toBeLessThan(draft.width);expect(resized.height).toBeLessThan(draft.height)
 expect(w.getWorkbenchCells()[0]).toMatchObject({x:cells[0].x,y:cells[0].y})
 let existing;await act(async()=>{existing=w.createContainerDraft()});await act(async()=>w.applyWorkbenchCells([{id:draft.id,x:0,y:0,w:20,h:10},{id:existing.id,x:32,y:10,w:4,h:3}],true))
 const canonical=w.getWorkbenchDocument(),saved=w.getWorkbenchCells()
 for(const width of [1000,500,240]){
  await act(async()=>{w.setCanvasSize({width,height:700,availableWidth:width});w.setWorkbenchWidth(width)})
  const shown=w.getSnapshot().artifacts.find(n=>n.id===existing.id)
  expect(shown.width).toBeGreaterThanOrEqual(Math.min(280,width-24)-.001)
  expect(shown.height).toBeGreaterThanOrEqual(160)
  expect(shown.x-shown.width/2).toBeGreaterThanOrEqual(12-.001)
  expect(shown.x+shown.width/2).toBeLessThanOrEqual(width-12+.001)
  expect(w.getWorkbenchDocument()).toEqual(canonical)
 }
 await act(async()=>{w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)})
 expect(w.getWorkbenchCells()).toEqual(saved)
})
it('改变窗口宽度后撤销和重做保持列跨度',async()=>{
 const f=await fixture();f.workspace.setCanvasSize({width:1000,height:700});f.workspace.setArtifacts([text('a'),text('b',740)]);f.workspace.setWorkbenchWidth(1000)
 const before=f.workspace.getWorkbenchCells()
 f.workspace.applyWorkbenchCells(before.map(c=>({...c,x:c.id==='a'?20:0})),true)
 const moved=f.workspace.getWorkbenchCells()
 f.workspace.setCanvasSize({width:500,height:700});f.workspace.setWorkbenchWidth(500)
 f.workspace.undo();expect(f.workspace.getWorkbenchCells()).toEqual(before)
 f.workspace.redo();expect(f.workspace.getWorkbenchCells()).toEqual(moved)
})
it('共享固定逻辑布局在不同宽度 hydrate、选择与 resize 后不漂移',async()=>{
 const f=await fixture(false,{researchBoards:{isSharedSession:()=>true}});f.workspace.setCollaborationAccess(true)
 f.workspace.setCanvasSize({width:1000,height:700});f.workspace.setArtifacts([text('a'),text('b',740)]);f.workspace.setWorkbenchWidth(1000)
 const cells=f.workspace.getWorkbenchCells(),document=f.workspace.getWorkbenchDocument()
 f.workspace.setCanvasSize({width:500,height:700});f.workspace.setWorkbenchWidth(500)
 expect(f.workspace.getWorkbenchDocument()).toEqual(document)
 f.workspace.applyRemoteCanvas(document,{revision:1});f.workspace.updateSelection(['a'],'replace')
 expect(f.workspace.getWorkbenchCells()).toEqual(cells);expect(f.workspace.getWorkbenchDocument()).toEqual(document)
})
it('失焦取消拖动，受协作占用的让位组件不会移动',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a'),text('b',740)]))
 await act(async()=>f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:9},{id:'b',x:20,y:0,w:20,h:9}],true))
 const before=structuredClone(f.workspace.getSnapshot().artifacts)
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="a"]'),{button:0,pointerId:7,clientX:200,clientY:24})
 await f.event('pointermove',f.canvas,{pointerId:7,clientX:400,clientY:120})
 await f.event('blur',f.win)
 expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false);expect(f.workspace.getSnapshot().artifacts).toEqual(before)
 f.host.querySelector('[data-research-node-id="b"]').setAttribute('data-research-geometry-blocked','')
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="a"]'),{button:0,pointerId:8,clientX:200,clientY:24})
 f.host.querySelector('[data-research-node-id="b"]').setAttribute('data-research-geometry-blocked','')
 await f.event('pointerup',f.canvas,{pointerId:8,clientX:680,clientY:170})
 // Crossing the midpoint may place the active card below the locked peer;
 // that is allowed when the peer's own geometry remains untouched.
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id==='b')).toEqual(before.find(n=>n.id==='b'))
 expect(f.workspace.getWorkbenchCells().find(n=>n.id==='a').y).toBeGreaterThanOrEqual(f.workspace.getWorkbenchCells().find(n=>n.id==='b').h)
})
it('语音取消、空识别和错误不创建草稿，重试拒绝迟到的旧识别',async()=>{
 let subscriber
 const bridge={subscribe:fn=>{subscriber=fn;return()=>{}},setActive:async()=>({ok:true}),start:vi.fn(async()=>({ok:true})),cancel:vi.fn(async()=>({ok:true}))}
 const f=await fixture(true,{researchVoice:bridge})
 await f.event('click',f.document.querySelector('[data-research-global-voice]'))
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(0)
 const first=bridge.start.mock.calls[0][0]
 await f.event('click',f.document.querySelector('[data-research-voice-cancel]'))
 expect(bridge.cancel).toHaveBeenCalledWith(first)
 await act(async()=>subscriber({...first,type:'final',text:'取消后不得创建'}))
 expect(f.document.querySelector('[data-research-voice-feedback]')).toBeNull()
 expect(f.generation.generate).not.toHaveBeenCalled()
 await f.event('click',f.document.querySelector('[data-research-global-voice]'))
 const second=bridge.start.mock.calls[1][0]
 await act(async()=>subscriber({...second,type:'final',text:'  '}))
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(0)
 expect(f.document.querySelector('[role=alert]').textContent).toContain('没有识别到语音')
 await f.event('click',f.document.querySelector('[data-research-voice-finish]'))
 const third=bridge.start.mock.calls[2][0]
 await act(async()=>{subscriber({...second,type:'final',text:'旧识别不得创建'});subscriber({...third,type:'error',message:'请允许麦克风访问'})})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(0)
 expect(f.generation.generate).not.toHaveBeenCalled()
 expect(f.document.querySelector('[role=alert]').textContent).toContain('请允许麦克风访问')
})
it.each(['toggle','hold-start'])('语音 Fn %s 不提前创建，自动结束后只提交一次',async gesture=>{
 let subscriber
 const bridge={subscribe:fn=>{subscriber=fn;return()=>{}},setActive:async()=>({ok:true}),start:vi.fn(async()=>({ok:true})),stop:vi.fn(async()=>({ok:true})),cancel:async()=>({ok:true})}
 const f=await fixture(true,{researchVoice:bridge})
 await act(async()=>{subscriber({sessionId:'grid-test',type:gesture});await new Promise(r=>setTimeout(r,30))})
 const request=bridge.start.mock.calls[0][0]
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(0)
 await act(async()=>{subscriber({...request,type:'finish'});subscriber({...request,type:'finish'})})
 expect(bridge.stop).toHaveBeenCalledTimes(1)
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(0)
 await act(async()=>{subscriber({...request,type:'final',text:'创建营收趋势图'});subscriber({...request,type:'final',text:'创建营收趋势图'});await new Promise(r=>setTimeout(r,30))})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
 expect(f.generation.generate).toHaveBeenCalledTimes(1)
 expect(f.generation.generate).toHaveBeenCalledWith(expect.objectContaining({prompt:'创建营收趋势图'}))
})
it('失败完成时间不作为成功刷新时间',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([{...text('a'),generationStatus:'failed',generationCompletedAt:Date.now()}]))
 await f.event('mouseover',f.host.querySelector('.ew-grid-refresh'))
 expect(f.document.querySelector('[role=tooltip]')?.textContent).toBe('尚未刷新暂无成功刷新记录')
})
it('RSS刷新提示只使用实际读取时点，失败或管理操作不重置成功时间',async()=>{
 const fetchedAt='2026-10-01T08:09:52.137Z',rss={version:1,type:'rss',title:'订阅',asOf:'本地初始化',feeds:[{id:'source',url:'https://example.com/rss.xml',title:'源',format:'rss',fetchedAt,error:'HTTP 503',entries:[]}]};
 const f=await fixture(true),containerSpec=JSON.parse(acceptArtifactOutput(JSON.stringify(rss)));
 await act(async()=>f.workspace.setArtifacts([{...text('rss'),kind:'generated-container',containerPrompt:'RSS订阅',generationLastSeq:1,refreshMinutes:0,containerSpec,generationStatus:'completed',generationCompletedAt:Date.now(),lastSuccessfulAt:Date.now()}]));
 await f.event('mouseover',f.host.querySelector('.ew-grid-refresh'));
 expect(f.document.querySelector('[role=tooltip] time')?.textContent).toBe(workbenchRefreshTooltip(fetchedAt).absolute);
 const empty=JSON.parse(acceptArtifactOutput(JSON.stringify({...rss,feeds:[]})));
 await act(async()=>f.workspace.setArtifacts([{...text('rss'),kind:'generated-container',containerPrompt:'RSS订阅',generationLastSeq:1,refreshMinutes:0,containerSpec:empty,generationStatus:'completed',generationCompletedAt:Date.now()}]));
 expect(f.document.querySelector('[role=tooltip]')?.textContent).toBe('尚未刷新暂无成功刷新记录');
})
it('滚动后的框选覆盖层保留可见坐标，就地衍生卡使用稳定工作台格位与来源',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a')]);f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:60}],true)})
 f.canvas.scrollTop=600;await f.event('scroll',f.canvas)
 await f.event('pointerdown',f.canvas,{button:0,pointerId:9,clientX:0,clientY:100})
 await f.event('pointermove',f.canvas,{pointerId:9,clientX:900,clientY:250})
 expect(parseFloat(f.host.querySelector('[data-research-marquee]').style.top)).toBe(700)
 await f.event('pointerup',f.canvas,{pointerId:9,clientX:900,clientY:250})
 const baselineCell=f.workspace.getWorkbenchCells().find(c=>c.id==='a')
 const more=f.host.querySelector('[data-workbench-more="a"]');more.getBoundingClientRect=()=>({left:800,top:100,right:820,bottom:124,width:20,height:24})
 await f.event('click',more)
 await f.event('click',[...f.document.querySelectorAll('.ew-grid-menu button')].find(n=>n.textContent==='基于所选创建'))
 const draft=f.workspace.getSnapshot().artifacts.find(n=>n.creationMode==='selection'),cell=f.workspace.getWorkbenchCells().find(c=>c.id===draft.id),card=f.host.querySelector('[data-research-node-id="'+draft.id+'"]')
 expect(f.host.querySelector('[data-research-create-popover]')).toBeNull()
 expect(draft.sourceNodeIds).toEqual(['a'])
 expect(card.querySelector('[data-workbench-selected-create-context]').textContent).toContain('基于：a')
 expect(f.workspace.getWorkbenchCells().find(c=>c.id==='a')).toEqual(baselineCell)
 expect(cell).toMatchObject({x:baselineCell.x+baselineCell.w,y:baselineCell.y})
 const top=parseFloat(card.style.top),left=parseFloat(card.style.left)
 expect(top-draft.height/2).toBeCloseTo(12+cell.y*((1000-14)/40))
 f.canvas.scrollTop=200;await f.event('scroll',f.canvas)
 expect(parseFloat(card.style.top)).toBe(top);expect(parseFloat(card.style.left)).toBe(left)
 expect(f.workspace.getWorkbenchCells().find(c=>c.id===draft.id)).toEqual(cell)
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===draft.id).sourceNodeIds).toEqual(['a'])
})

it('拖动期间窗口缩窄后失焦取消仍恢复原跨度',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const cells=f.workspace.getWorkbenchCells()
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="a"]'),{button:0,pointerId:10,clientX:200,clientY:24})
 await f.event('pointermove',f.canvas,{pointerId:10,clientX:400,clientY:140})
 await act(async()=>{f.workspace.setCanvasSize({width:500,height:700,availableWidth:500});f.workspace.setWorkbenchWidth(500)})
 await f.event('blur',f.win)
 expect(f.workspace.getWorkbenchCells()).toEqual(cells)
})

it('历史过小的普通组件显示补足最小尺寸并让位，规范布局不被被动改写',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a'),text('b')]);f.workspace.setCanvasSize({width:500,height:700,availableWidth:500});f.workspace.setWorkbenchWidth(500);f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:4,h:7},{id:'b',x:4,y:0,w:4,h:7}],true)})
 const [a,b]=f.workspace.getSnapshot().artifacts
 expect(parseFloat(f.host.querySelector('[data-research-node-id="a"]').style.width)).toBeCloseTo(a.width,5)
 expect(parseFloat(f.host.querySelector('[data-research-node-id="b"]').style.width)).toBeCloseTo(b.width,5)
 expect(a.x-a.width/2).toBeGreaterThanOrEqual(12)
 expect(a.width).toBeGreaterThanOrEqual(280);expect(a.height).toBeGreaterThanOrEqual(160)
 expect(b.width).toBeGreaterThanOrEqual(280);expect(b.height).toBeGreaterThanOrEqual(160)
 expect(a.y+a.height/2).toBeLessThan(b.y-b.height/2)
 expect(f.workspace.getWorkbenchCells().map(c=>c.w)).toEqual([4,4])
})

it('普通组件单轴及多选缩小都限制280×160，整笔撤销恢复',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await act(async()=>{w.setArtifacts([text('a'),text('b')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:12},{id:'b',x:20,y:0,w:20,h:12}],true);w.updateSelection(['a'],'replace')})
 const before=w.getWorkbenchCells(),handle=axis=>f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="'+axis+'"]')
 await f.event('pointerdown',handle('x'),{button:0,pointerId:120,clientX:480,clientY:150})
 await f.event('pointerup',f.canvas,{pointerId:120,clientX:480-step*30,clientY:150})
 expect(w.getSnapshot().artifacts.find(n=>n.id==='a').width).toBeGreaterThanOrEqual(280)
 expect(w.getSnapshot().artifacts.find(n=>n.id==='a').width).toBeLessThan(310)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
 await act(async()=>w.updateSelection(['a','b'],'replace'))
 await f.event('pointerdown',handle('y'),{button:0,pointerId:121,clientX:250,clientY:300})
 await f.event('pointerup',f.canvas,{pointerId:121,clientX:250,clientY:300-step*30})
 expect(w.getSnapshot().artifacts.every(n=>n.height>=160&&n.height<185)).toBe(true)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})

it('滚动后的导出子菜单在可见区域打开',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 f.canvas.scrollTop=600;await f.event('scroll',f.canvas)
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'),{clientX:800,clientY:110})
 const parent=f.document.querySelector('.ew-grid-menu'),trigger=parent.querySelector('[aria-label="导出"]')
 parent.getBoundingClientRect=()=>({left:400,top:110,right:606,bottom:505,width:206,height:395})
 trigger.getBoundingClientRect=()=>({left:408,top:210,right:598,bottom:243,width:190,height:33})
 await f.event('click',trigger)
 const menu=f.document.querySelector('[aria-label="导出格式"]')
 expect(menu.parentElement).toBe(f.document.body);expect(parseFloat(menu.style.top)).toBe(210)
 expect(parseFloat(menu.style.left)).toBe(610)
})

it('底部工具栏通过 React 挂载到页面，避开滚动容器的固定定位边界',async()=>{
 const f=await fixture(true),toolbar=f.document.querySelector('[data-ework-toolbar]')
 expect(toolbar.parentElement).toBe(f.document.body)
 f.canvas.getBoundingClientRect=()=>({left:88,top:68,right:988,bottom:828,width:900,height:760})
 await act(async()=>f.workspace.setCanvasSize({width:900,height:760,availableWidth:900}))
 expect(parseFloat(toolbar.style.left)).toBe(538)
 await f.event('click',toolbar.querySelector('[data-research-global-container]'))
 expect(f.canvas.getAttribute('data-canvas-tool')).toBe('component')
 f.canvas.focus();await f.event('keydown',f.win,{code:'KeyV',key:'v'})
 expect(f.canvas.getAttribute('data-canvas-tool')).toBe('select')
 await f.event('keydown',f.win,{code:'KeyF',key:'f'})
 expect(f.canvas.getAttribute('data-canvas-tool')).toBe('component')
})

it('缓存宽度与窗口一致的首次挂载仍量测并显示工具栏',async()=>{
 const f=await fixture()
 const cached={width:1000,height:700,availableWidth:1000,visibleHeight:700}
 f.workspace.setCanvasSize(cached)
 f.workspace.setArtifacts([text('a')]);f.workspace.updateSelection(['a'],'replace')
 f.workspace.setWorkbenchWidth(1000)
 const bounds=f.win.HTMLElement.prototype.getBoundingClientRect
 f.win.HTMLElement.prototype.getBoundingClientRect=()=>({left:88,top:68,right:1088,bottom:768,width:1000,height:700})
 await f.render({measure:false})
 const toolbar=f.document.querySelector('[data-ework-toolbar]')
 expect(toolbar.style.visibility).toBe('visible')
 expect(f.host.querySelector('[data-workbench-drag-handle="a"]')).not.toBeNull()
 expect(f.host.querySelector('.ew-grid-selection-ring')).not.toBeNull()
 f.win.HTMLElement.prototype.getBoundingClientRect=bounds
})

it('工作台顶栏下的组件拖动使用滚动区域原点进行格位换算',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 f.canvas.getBoundingClientRect=()=>({left:88,top:68,right:1088,bottom:768,width:1000,height:700})
 await act(async()=>f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:8}],true))
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="a"]'),{button:0,pointerId:11,clientX:200,clientY:90})
 await f.event('pointermove',f.canvas,{pointerId:11,clientX:200,clientY:160})
 expect(f.workspace.getWorkbenchCells()[0]).toMatchObject({x:0,y:0,w:20,h:8})
 await f.event('pointerup',f.canvas,{pointerId:11,clientX:200,clientY:160})
 expect(f.workspace.getWorkbenchCells()[0]).toMatchObject({x:0,y:0,w:20,h:8})
})

it('浮卡按像素连续跟手，预览补位与松手完全一致，撤销恢复邻居',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await act(async()=>{w.setArtifacts([text('a'),text('b',260,500),text('c',740)]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:6},{id:'b',x:0,y:6,w:20,h:9},{id:'c',x:20,y:0,w:20,h:5}],true)})
 const before=w.getWorkbenchCells(),card=f.host.querySelector('[data-research-node-id="a"]'),handle=card.querySelector('[data-workbench-drag-handle]')
 await f.event('pointerdown',handle,{button:0,pointerId:81,clientX:200,clientY:24})
 await f.event('pointermove',f.canvas,{pointerId:81,clientX:207,clientY:24+step*12+7})
 const floatLeft=()=>parseFloat(card.style.getPropertyValue('--grid-float-left'))-parseFloat(card.style.width)/2
 const floatTop=()=>parseFloat(card.style.getPropertyValue('--grid-float-top'))-parseFloat(card.style.height)/2
 expect(floatLeft()).toBeCloseTo(19)
 expect(floatTop()).toBeCloseTo(12+step*12+7)
 // Float and resting nodes share centre coordinates, avoiding a half-card
 // offset while dragging and a coordinate-system jump when released.
 expect(f.win.getComputedStyle(card).transform).toBe('translate(-50%, -50%)')
 const neighbour=f.host.querySelector('[data-research-node-id="b"]')
 expect(f.win.getComputedStyle(neighbour).transition).toContain('top 180ms')
 const resolved=w.getWorkbenchCells(),preview=f.canvas.querySelector('.ew-grid-placeholder'),destination=resolved.find(c=>c.id==='a')
 expect(destination.y).toBe(9)
 expect(parseFloat(preview.style.top)).toBeCloseTo(12+destination.y*step)
 expect(parseFloat(preview.style.top)).not.toBeCloseTo(floatTop())
 expect(w.getWorkbenchCells().find(c=>c.id==='b').y).toBe(0)
 await f.event('pointerup',f.canvas,{pointerId:81,clientX:207,clientY:24+step*12+7})
 expect(w.getWorkbenchCells()).toEqual(resolved)
 expect(card.style.getPropertyValue('--grid-float-top')).toBe('')
 expect(f.win.getComputedStyle(card).transform).toBe('translate(-50%, -50%)')
 expect(preview.hidden).toBe(true)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})

it('窄窗补高后的可见中线决定换位，不提前按保存高度换位',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setArtifacts([text('a'),text('b')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5},{id:'b',x:0,y:5,w:20,h:5}],true);w.setCanvasSize({width:240,height:700,availableWidth:240});w.setWorkbenchWidth(240)})
 const before=w.getWorkbenchCells(),visible=w.getWorkbenchVisibleCells(),h=visible[0].h
 const cellStep=(240-24+(240-24-40*4)/39)/40
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="a"]'),{button:0,pointerId:82,clientX:40,clientY:24})
 await f.event('pointermove',f.canvas,{pointerId:82,clientX:40,clientY:24+cellStep*h/2})
 expect(w.getWorkbenchCells()).toEqual(before)
 await f.event('pointermove',f.canvas,{pointerId:82,clientX:40,clientY:24+cellStep*(h*1.5+1)})
 expect(w.getWorkbenchCells().find(c=>c.id==='a')).toMatchObject({y:5,h:5})
 const resolved=w.getWorkbenchCells()
 await f.event('pointerup',f.canvas,{pointerId:82,clientX:40,clientY:24+cellStep*(h*1.5+1)})
 expect(w.getWorkbenchCells()).toEqual(resolved)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})

it('滚动后跨列拖动长文章按抓取点挤开邻居，预览、松手、取消和撤销一致',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await act(async()=>{w.setArtifacts(['top','article','b','c'].map(id=>text(id)));w.applyWorkbenchCells([{id:'top',x:0,y:0,w:40,h:20},{id:'article',x:0,y:20,w:20,h:44},{id:'b',x:20,y:20,w:20,h:10},{id:'c',x:20,y:30,w:20,h:14}],true)})
 const before=w.getWorkbenchCells(),scroll=12+20*step-100
 f.canvas.scrollTop=scroll;await f.event('scroll',f.canvas)
 const handle=f.host.querySelector('[data-workbench-drag-handle="article"]'),card=handle.closest('[data-research-node-id]')
 await f.event('pointerdown',handle,{button:0,pointerId:83,clientX:200,clientY:112})
 await f.event('pointermove',f.canvas,{pointerId:83,clientX:200+20*step,clientY:126})
 const preview=w.getWorkbenchCells(),a=preview.find(c=>c.id==='article'),b=preview.find(c=>c.id==='b')
 expect(a).toMatchObject({x:20,y:20,h:44});expect(b.y).toBe(64)
 expect(f.win.getComputedStyle(f.host.querySelector('[data-research-node-id="b"]')).transition).toContain('top 180ms')
 expect(parseFloat(card.style.getPropertyValue('--grid-float-top'))-parseFloat(card.style.height)/2).toBeCloseTo(scroll+114)
 expect(parseFloat(f.canvas.querySelector('.ew-grid-placeholder').style.top)).toBeCloseTo(12+a.y*step)
 await f.event('pointerup',f.canvas,{pointerId:83,clientX:200+20*step,clientY:126})
 expect(w.getWorkbenchCells()).toEqual(preview)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
 await f.event('pointerdown',handle,{button:0,pointerId:84,clientX:200,clientY:112})
 await f.event('pointermove',f.canvas,{pointerId:84,clientX:200+20*step,clientY:126})
 expect(w.getWorkbenchCells().find(c=>c.id==='b').y).toBe(64)
 await f.event('pointercancel',f.canvas,{pointerId:84});expect(w.getWorkbenchCells()).toEqual(before)
})

it('未选中时组件滚轮交给工作台，选中后仅在内部可滚时消费',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a')]);f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:60}],true)})
 const preview=f.host.querySelector('[data-research-preview-body]');preview.style.overflowY='auto'
 Object.defineProperty(preview,'clientHeight',{configurable:true,value:100});Object.defineProperty(preview,'scrollHeight',{configurable:true,value:600})
 Object.defineProperty(f.canvas,'scrollHeight',{configurable:true,value:2500})
 preview.scrollTop=100
 const wheel=await f.event('wheel',preview,{deltaX:0,deltaY:3,deltaMode:1})
 expect(wheel.defaultPrevented).toBe(true);expect(f.canvas.scrollTop).toBe(48);expect(preview.scrollTop).toBe(100)
 await act(async()=>f.workspace.updateSelection(['a'],'replace'))
 const inner=await f.event('wheel',preview,{deltaX:0,deltaY:80,deltaMode:0})
 expect(inner.defaultPrevented).toBe(false);expect(f.canvas.scrollTop).toBe(48)
 preview.scrollTop=500
 const boundary=await f.event('wheel',preview,{deltaX:0,deltaY:80,deltaMode:0})
 expect(boundary.defaultPrevented).toBe(true);expect(f.canvas.scrollTop).toBe(128)
 const relayed=await f.event('wheel',preview,{deltaX:0,deltaY:80,deltaMode:0,__sherlockCanvasPan:true})
 expect(relayed.defaultPrevented).toBe(true);expect(f.canvas.scrollTop).toBe(208)
})
it('标准整理保留当前同行关系且后续独行铺满，可撤销并保持重复稳定',async()=>{
 const f=await fixture();f.workspace.setCanvasSize({width:1000,height:700});f.workspace.setArtifacts([text('a',160,120),text('b',900,1000),text('c',250,2000)]);f.workspace.setWorkbenchWidth(1000)
 const before=f.workspace.getWorkbenchCells()
 expect(f.workspace.organizeCanvas()).toBe(true)
 const arranged=f.workspace.getWorkbenchCells(),a=arranged.find(c=>c.id==='a'),b=arranged.find(c=>c.id==='b'),c=arranged.find(c=>c.id==='c')
 expect(a).toMatchObject({x:0,y:0,w:20});expect(b).toMatchObject({x:20,y:0,w:20,h:a.h});expect(c).toMatchObject({x:0,w:40,y:a.h})
 expect(Math.min(...arranged.map(c=>c.x))).toBe(0);expect(Math.max(...arranged.map(c=>c.x+c.w))).toBe(40)
 const grid=(await import('../packages/dsh-research-task-runtime/research-grid.js')).createResearchGrid()
 expect(arranged.every((a,i)=>arranged.every((b,j)=>i===j||!grid.overlap(a,b)))).toBe(true)
 f.workspace.organizeCanvas();expect(f.workspace.getWorkbenchCells()).toEqual(arranged)
 f.workspace.undo();expect(f.workspace.getWorkbenchCells()).toEqual(before)
})

it('延迟挂载的HTML预览收到真实选择状态，取消选择和载入同步恢复',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('html')]))
 const frame=f.document.createElement('iframe'),post=vi.fn();frame.setAttribute('data-research-html-artifact','')
 Object.defineProperty(frame,'contentWindow',{configurable:true,value:{postMessage:post}})
 await act(async()=>{f.host.querySelector('[data-research-preview-body]').appendChild(frame);await new Promise(r=>setTimeout(r,30))})
 await act(async()=>f.workspace.updateSelection(['html'],'replace'))
 expect(post).toHaveBeenCalledWith({type:'sherlock-workbench-selection',selected:true},'*')
 await act(async()=>f.workspace.updateSelection([],'replace'))
 expect(post).toHaveBeenLastCalledWith({type:'sherlock-workbench-selection',selected:false},'*')
 post.mockClear();await f.event('load',frame)
 expect(post).toHaveBeenLastCalledWith({type:'sherlock-workbench-selection',selected:false},'*')
 expect(f.host.querySelector('.ew-grid-selection-ring')).toBeNull()
 await act(async()=>f.workspace.updateSelection(['html'],'replace'))
 expect(f.host.querySelector('.ew-grid-selection-ring')).not.toBeNull()
})

it.each(['price-performance','valuation-multiples','price-target','company-profile','financial-statements','revenue-geography','revenue-business','dividends','stock-splits','insider-trading','institutional-ownership','stock-ownership','company-filings','historical-price','charting'])('金融序列及资料 %s 初次完成后按可信内容报告补足高度，无需整理',async variant=>{
 const f=await fixture(true),w=f.workspace,{seriesFixtures}=await import('./fixtures/financial-series.js'),{fundamentalFixtures}=await import('./fixtures/financial-fundamentals.js'),{revenueFixtures}=await import('./fixtures/financial-revenue.js'),{actionFixtures}=await import('./fixtures/financial-actions.js'),{ownershipFixtures}=await import('./fixtures/financial-ownership.js'),{recordsFixtures}=await import('./fixtures/financial-records.js'),{technical}=await import('./fixtures/financial-charting.js')
 const panel={nodeId:'series',title:'序列',prompt:variant,pending:true,width:656,height:456,x:0,y:0,size:'large'}
 const plan={id:'series-workbench',createdAt:Date.now(),panels:[panel]}
 await act(async()=>w.applyWorkbench(plan))
 const before=w.getWorkbenchCells().map(({freePosition,...c})=>c)
 await act(async()=>w.applyWorkbench({...plan,panels:[{...panel,taskId:'prepared-series',preparedOutput:acceptArtifactOutput(JSON.stringify([...seriesFixtures,...fundamentalFixtures,...revenueFixtures,...actionFixtures,...ownershipFixtures,...recordsFixtures,technical].find(s=>s.variant===variant)))}]}))
 await vi.waitFor(async()=>{await act(async()=>{});expect(f.host.querySelector('iframe[data-research-html-artifact]')).not.toBeNull()},{timeout:2000,interval:50})
 const frame=f.host.querySelector('iframe[data-research-html-artifact]')
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frame.contentWindow,data:{type:'sherlock-workbench-content-size',width:520,height:570}})))
 expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(638)
 expect(w.getWorkbenchCells()).toEqual(before)
})

it('首次批量完成的金融序列保持半栏并按实际宽度补高',async()=>{
 const f=await fixture(true),w=f.workspace,{seriesFixtures}=await import('./fixtures/financial-series.js')
 const plan={id:'first-prepared-series',createdAt:Date.now(),panels:seriesFixtures.map((s,i)=>({nodeId:'ready-'+i,title:s.variant,prompt:s.variant,taskId:'prepared-'+i,preparedOutput:acceptArtifactOutput(JSON.stringify(s)),width:656,height:456,x:i%2*672,y:Math.floor(i/2)*472,size:'large'}))}
 await act(async()=>{w.setCanvasSize({width:880,height:700,availableWidth:880});w.setWorkbenchWidth(880);w.applyWorkbench({...plan,panels:plan.panels.map(({taskId,preparedOutput,...p})=>({...p,pending:true}))})})
 await act(async()=>w.applyWorkbench(plan))
 const canonical=w.getWorkbenchCells(),before=structuredClone(canonical),node=w.getSnapshot().artifacts[0]
 expect(canonical[0].w).toBe(20)
 expect(node.width).toBeGreaterThan(400);expect(node.width).toBeLessThan(480)
 const frame=f.host.querySelector('[data-research-node-id="ready-0"] iframe[data-research-html-artifact]')
 expect(frame).not.toBeNull()
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frame.contentWindow,data:{type:'sherlock-workbench-content-size',width:Math.round(node.width-40),height:570}})))
 expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(638)
 expect(w.getWorkbenchCells()).toEqual(before)
})

it.each(['calendar','kpi','timeline'])('$0首次完成按可信内容报告补足说明高度，保留逻辑布局',async type=>{
 const f=await fixture(true),w=f.workspace;
 const spec=type==='timeline'?{version:1,type,title:'时间线',asOf:'用户提供的虚构记录',items:[{id:'original',title:'来源事件',summary:'完整原摘要',time:'2026-10-01T14:18:00+08:00'}]}:type==='calendar'?{version:1,type,title:'日历',asOf:'用户提供的虚构记录',note:'完整来源说明',items:[{title:'会议',summary:'原摘要',date:'2026-09-28'}]}:{version:1,type,title:'指标',asOf:'用户提供的虚构记录',items:[{label:'数量',value:0,detail:'完整来源口径'}]};
 const plan={id:'calendar-first',createdAt:Date.now(),panels:[{nodeId:'calendar-first-card',title:spec.title,prompt:'日历',taskId:'calendar-first-task',preparedOutput:acceptArtifactOutput(JSON.stringify(spec)),width:656,height:424,x:0,y:0,size:'large'}]};
 await act(async()=>w.applyWorkbench(plan));
 const before=structuredClone(w.getWorkbenchCells()),frame=f.host.querySelector('iframe[data-research-html-artifact]');
 expect(frame).not.toBeNull();
 const message={type:'sherlock-workbench-content-size',width:640,height:570};
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:{},data:message})));
 expect(w.getSnapshot().artifacts[0].height).toBeLessThan(628);
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frame.contentWindow,data:message})));
 expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(628);
 expect(w.getWorkbenchCells()).toEqual(before);
})

it('金融快照在侧栏挤窄后按可信内容报告补足显示高度，保持逻辑布局',async()=>{
 const f=await fixture(true),w=f.workspace,html='<body data-sherlock-market="share-statistics"></body>'
 await act(async()=>{w.setArtifacts([{...text('snapshot'),kind:'generated-container',containerPrompt:'股本统计',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'快照',html}}]);w.applyWorkbenchCells([{id:'snapshot',x:0,y:0,w:40,h:12}],true)})
 const canonical=w.getWorkbenchDocument()
 await act(async()=>{w.setCanvasSize({width:600,height:700,availableWidth:600});w.setWorkbenchWidth(600)})
 const frame=f.host.querySelector('iframe[data-research-html-artifact]')
 const send=async source=>act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source,data:{type:'sherlock-workbench-content-size',width:584,height:240}})))
 await send({});expect(w.getSnapshot().artifacts[0].height).toBeLessThan(308)
 await send(frame.contentWindow);expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(308)
 expect(w.getWorkbenchDocument()).toEqual(canonical)
})

it('整理给行情指标及来源留足高度，不把视口余量灌入指标卡',async()=>{
 const f=await fixture();f.workspace.setCanvasSize({width:1000,height:700});
 const {renderMarketArtifact}=await import('../packages/dsh-research-task-runtime/market-artifact.js')
 const spec=renderMarketArtifact({version:1,type:'market',variant:'metrics',title:'行情',asOf:'模拟数据',items:[{label:'现价',value:'1478.60'},{label:'涨幅',value:'+0.45%'}]})
 f.workspace.setArtifacts([{...text('metrics'),kind:'generated-container',containerPrompt:'行情',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:spec}]);f.workspace.setWorkbenchWidth(1000)
 expect(f.workspace.organizeCanvas()).toBe(true)
 expect(f.workspace.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(233)
 expect(f.workspace.getSnapshot().artifacts[0].height).toBeLessThan(260)
 expect(f.workspace.getWorkbenchCells()[0]).toMatchObject({x:0,y:0,w:40})
})

it.each([{count:3,legacy:false},{count:4,legacy:false},{count:5,legacy:true},{count:6,legacy:true}])('整理不会用裁切高度覆盖 $count 个指标的可读尺寸，旧模板 $legacy',async({count,legacy})=>{
 const f=await fixture(true),w=f.workspace
 const {renderMarketArtifact}=await import('../packages/dsh-research-task-runtime/market-artifact.js')
 const {researchMarketDimensions}=await import('../packages/dsh-research-task-runtime/bento-layout.js')
 const spec=renderMarketArtifact({version:1,type:'market',variant:'metrics',title:'整理回归',asOf:'2026-09-30 收盘 · 指定来源',note:'说明实际数据单位和换算口径，失败保留旧值，仅手动刷新。',items:Array.from({length:count},(_,i)=>({label:'指标 '+i,value:'3842.19 点',detail:'完整单位与来源说明'}))})
 if(legacy)spec.html=spec.html.replace(/ data-sherlock-design="[^"]*"| data-metrics-footer-lines="\d+"/g,'')
 const node={...text('metrics'),kind:'generated-container',containerPrompt:'行情',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:spec}
 await act(async()=>{w.setArtifacts([node]);w.applyWorkbenchCells([{id:'metrics',x:0,y:5,w:40,h:30}],true)})
 const before=w.getWorkbenchCells(),frame=f.host.querySelector('iframe[data-research-html-artifact]')
 const send=async height=>act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frame.contentWindow,data:{type:'sherlock-workbench-content-size',width:974,height}})))
 await send(120)
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 await send(129)
 await act(async()=>new Promise(r=>setTimeout(r,750)))
 const expected=researchMarketDimensions(node,true,974).height
 const arranged=w.getWorkbenchCells()
 expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(expected)
 expect(w.getSnapshot().artifacts[0].height).toBeLessThan(expected+25)
 expect(w.getSnapshot().artifacts[0].height).toBeLessThan(456)
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 await act(async()=>new Promise(r=>setTimeout(r,750)))
 expect(w.getWorkbenchCells()).toEqual(arranged)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})

it('完整指标自然高度取代保守预留，重复整理不留下过高空白',async()=>{
 const f=await fixture(true),w=f.workspace
 const {renderMarketArtifact}=await import('../packages/dsh-research-task-runtime/market-artifact.js')
 const spec=renderMarketArtifact({version:1,type:'market',variant:'metrics',title:'完整指标',asOf:'2026-09-30',items:Array.from({length:6},(_,i)=>({label:'指标 '+i,value:'123'}))})
 const node={...text('metrics'),kind:'generated-container',containerPrompt:'行情',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:spec}
 await act(async()=>w.setArtifacts([node]))
 const frame=f.host.querySelector('iframe[data-research-html-artifact]')
 const send=async()=>act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frame.contentWindow,data:{type:'sherlock-workbench-content-size',width:974,height:230,intrinsicMetrics:true}})))
 await send();await f.event('click',f.document.querySelector('[data-research-global-arrange]'));await send()
 await act(async()=>new Promise(r=>setTimeout(r,750)))
 expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(288)
 expect(w.getSnapshot().artifacts[0].height).toBeLessThan(313)
 const arranged=w.getWorkbenchCells()
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 await act(async()=>new Promise(r=>setTimeout(r,750)))
 expect(w.getWorkbenchCells()).toEqual(arranged)
})

it('整理使用当前HTML的内容测量收紧尺寸，拒绝其他窗口的测量',async()=>{
 const f=await fixture(true),n={...text('html'),kind:'generated-container',containerPrompt:'图表',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'图表',html:'<svg height="200"></svg>'}}
 await act(async()=>f.workspace.setArtifacts([n]))
 const previousHeight=f.workspace.getSnapshot().artifacts[0].height
 const frame=f.host.querySelector('iframe[data-research-html-artifact]'),source=frame.contentWindow
 const size={type:'sherlock-workbench-content-size',width:481,height:230}
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:{},data:size})))
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 const fallbackHeight=f.workspace.getSnapshot().artifacts[0].height
 expect(fallbackHeight).toBe(previousHeight)
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source,data:size})))
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 expect(f.workspace.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(288)
 expect(f.workspace.getSnapshot().artifacts[0].height).toBeLessThan(315)
 await act(async()=>f.workspace.undo())
 expect(f.workspace.getSnapshot().artifacts[0].height).toBe(fallbackHeight)
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source,data:{...size,height:900,html:'extra'}})))
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 expect(f.workspace.getSnapshot().artifacts[0].height).toBeLessThan(315)
})

it('整理菜单关闭后焦点返回画布，立即按Command Z能撤销整理',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setArtifacts([text('a'),text('b',740)]);w.applyWorkbenchCells([{id:'a',x:0,y:10,w:20,h:18},{id:'b',x:20,y:0,w:20,h:10}],true)})
 const before=w.getWorkbenchCells()
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2})
 const button=[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布');button.focus()
 await f.event('click',button)
 expect(f.document.activeElement).toBe(f.canvas)
 expect(w.getWorkbenchCells()).not.toEqual(before)
 await f.event('keydown',f.document.activeElement,{key:'z',code:'KeyZ',metaKey:true})
 expect(w.getWorkbenchCells()).toEqual(before)
})

it('原生表格按完整行内容整理，不使用大号默认高度',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('table')]))
 const card=f.host.querySelector('[data-research-node-id="table"]'),body=card.querySelector('[data-research-preview-body]'),table=f.document.createElement('table')
 body.appendChild(table);card.getBoundingClientRect=()=>({left:12,top:12,width:483,height:700,right:495,bottom:712})
 table.getBoundingClientRect=()=>({left:22,top:74,width:463,height:182,right:485,bottom:256})
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 const height=f.workspace.getSnapshot().artifacts[0].height
 expect(height).toBeGreaterThanOrEqual(252);expect(height).toBeLessThan(280)
})

it('整理原生柱状图不把当前拉伸的 SVG 高度当成自然内容高度',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{
  w.setArtifacts([{...text('bar'),kind:'generated-container',containerPrompt:'研究产出',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'chart',variant:'bar',title:'研究产出',labels:['医药','科技'],series:[{name:'报告 / 篇',values:[12,9]}]}}])
  w.applyWorkbenchCells([{id:'bar',x:15,y:0,w:15,h:90}],true)
 })
 const card=f.host.querySelector('[data-research-node-id="bar"]'),svg=card.querySelector('.odyssey-native-chart svg')
 card.getBoundingClientRect=()=>({left:380,top:12,width:360,height:2208,right:740,bottom:2220})
 svg.getBoundingClientRect=()=>({left:400,top:112,width:320,height:2000,right:720,bottom:2112})
 for(let i=0;i<2;i++){
  await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
  await act(async()=>new Promise(r=>setTimeout(r,700)))
  expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(320)
  expect(w.getSnapshot().artifacts[0].height).toBeLessThan(350)
 }
 const details=card.querySelector('.odyssey-native-chart-data');details.open=true
 details.querySelector('div').getBoundingClientRect=()=>({left:400,top:2120,width:320,height:180,right:720,bottom:2300})
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 await act(async()=>new Promise(r=>setTimeout(r,700)))
 expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(500)
 expect(w.getSnapshot().artifacts[0].height).toBeLessThan(530)
})

it('一次整理等待改宽后的HTML自然高度，整次操作只撤销一步',async()=>{
 const f=await fixture(true),w=f.workspace,n=id=>({...text(id),kind:'generated-container',containerPrompt:'文章',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:id,html:'<p>文章 '+id+'</p>'}})
 await act(async()=>{w.setArtifacts([n('a'),n('b')]);w.applyWorkbenchCells([{id:'a',x:2,y:0,w:15,h:20},{id:'b',x:23,y:0,w:15,h:20}],true)})
 const before=w.getWorkbenchCells(),frames=['a','b'].map(id=>f.host.querySelector('[data-research-node-id="'+id+'"] iframe'))
 const send=async(frame,width,height)=>act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frame.contentWindow,data:{type:'sherlock-workbench-content-size',width,height}})))
 for(const frame of frames)await send(frame,358,300)
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 expect(w.getSnapshot().artifacts.every(n=>n.width<600)).toBe(true)
 for(const frame of frames)await send(frame,481,600)
 await act(async()=>new Promise(r=>setTimeout(r,450)))
 expect(w.getSnapshot().artifacts.every(n=>n.height>=658&&n.height<690)).toBe(true)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
 await send(frames[0],481,900)
 expect(w.getWorkbenchCells()).toEqual(before)
})
it('整板整理挂载尚未滑动到的HTML并收齐自然高度，一步撤销恢复全部组件',async()=>{
 const f=await fixture(true),w=f.workspace,n=id=>({...text(id),kind:'generated-container',containerPrompt:'原始内容',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:{version:1,type:'html',title:id,html:'<p>原始内容 '+id+'</p>'}})
 const filler=Array.from({length:8},(_,i)=>'filler-'+i),ids=['visible-card',...filler,'unseen-card']
 await act(async()=>{w.setArtifacts(ids.map(n));w.applyWorkbenchCells(ids.map((id,i)=>({id,x:i%2*20,y:i*30,w:20,h:id==='unseen-card'?60:20})),true)})
 const before=w.getWorkbenchCells(),source=w.getSnapshot().artifacts.map(n=>n.containerSpec)
 expect(f.host.querySelector('[data-research-node-id="unseen-card"] iframe')).toBeNull()
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 const frames=new Map(w.getSnapshot().artifacts.map(n=>[n.id,f.host.querySelector('[data-research-node-id="'+n.id+'"] iframe')]))
 expect(frames.get('unseen-card')).not.toBeNull()
 const unseen=w.getSnapshot().artifacts.find(n=>n.id==='unseen-card');expect(unseen.y-unseen.height/2).toBeGreaterThan(700)
 for(const n of w.getSnapshot().artifacts)await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frames.get(n.id).contentWindow,data:{type:'sherlock-workbench-content-size',width:Math.round(n.width),height:n.id==='unseen-card'?600:220}})))
 await act(async()=>new Promise(r=>setTimeout(r,700)))
 expect(w.getSnapshot().artifacts.find(n=>n.id==='unseen-card').height).toBeGreaterThanOrEqual(658)
 expect(w.getSnapshot().artifacts.find(n=>n.id==='unseen-card').height).toBeLessThan(690)
 expect(f.canvas.__eworkContentFit).toBeUndefined()
 expect(w.getSnapshot().artifacts.map(n=>n.containerSpec)).toEqual(source)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})
it('整理的二次测高保留组件统一基础最小尺寸',async()=>{
 const f=await fixture(true),w=f.workspace;let node
 await act(async()=>{node=w.createContainerDraft()})
 const before=w.getWorkbenchCells(),card=f.host.querySelector('[data-research-node-id="'+node.id+'"]')
 card.getBoundingClientRect=()=>({left:12,top:12,width:500,height:300,right:512,bottom:312})
 for(const element of card.querySelectorAll('textarea,input,p'))element.getBoundingClientRect=()=>({left:22,top:60,width:400,height:25,right:422,bottom:85})
 await f.event('contextmenu',f.canvas,{clientX:650,clientY:500,button:2})
 await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 await act(async()=>new Promise(r=>setTimeout(r,700)))
 expect(w.getWorkbenchDocument().artifacts[0].height).toBeGreaterThanOrEqual(160)
 expect(f.canvas.__eworkContentFit).toBeUndefined()
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})
it('标准整理自然测高后保留原行并铺满独行，整次整理仍只撤销一步',async()=>{
 const f=await fixture(true),w=f.workspace,grid=(await import('../packages/dsh-research-task-runtime/research-grid.js')).createResearchGrid(),m=grid.metrics(1000)
 const before=[{id:'gold',x:0,y:0,w:20,h:8},{id:'chart',x:20,y:0,w:20,h:15},{id:'derived',x:0,y:8,w:20,h:14},{id:'pharma',x:0,y:22,w:20,h:8},{id:'table',x:0,y:30,w:40,h:9}]
 await act(async()=>{w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setArtifacts(before.map(c=>({...text(c.id),kind:'generated-container',containerPrompt:'内容',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:c.id,html:'<p>'+c.id+'</p>'},...(c.id==='derived'?{creationMode:'selection',sourceNodeIds:['gold']}:{})})));w.applyWorkbenchCells(before,true)})
 const frames=new Map(before.map(c=>[c.id,f.host.querySelector('[data-research-node-id="'+c.id+'"] iframe')]))
 for(const c of before)await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frames.get(c.id).contentWindow,data:{type:'sherlock-workbench-content-size',width:Math.round(c.w*m.step-m.gap-2),height:Math.floor(c.h*m.step-m.gap-58)}})))
 await f.event('contextmenu',f.canvas,{clientX:600,clientY:500,button:2});await f.event('click',[...f.document.querySelectorAll('button')].find(b=>b.textContent==='整理画布'))
 for(const c of w.getWorkbenchCells()){const original=before.find(value=>value.id===c.id);await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frames.get(c.id).contentWindow,data:{type:'sherlock-workbench-content-size',width:Math.round(c.w*m.step-m.gap-2),height:Math.floor(original.h*m.step-m.gap-58)}})))}
 await act(async()=>new Promise(r=>setTimeout(r,700)))
 const packed=w.getWorkbenchCells(),at=id=>packed.find(c=>c.id===id)
 expect(at('gold').h).toBe(at('chart').h);expect(at('derived')).toMatchObject({x:0,w:40,y:at('gold').h})
 expect(at('pharma')).toMatchObject({x:0,w:40,y:at('derived').y+at('derived').h});expect(at('table')).toMatchObject({x:0,w:40,y:at('pharma').y+at('pharma').h})
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})
it('导出向右展开仅三个格式，SVG按当前内容区比例并拒收非所属窗口回复',async()=>{
 const save=vi.fn(async()=>({status:'saved'})),f=await fixture(true,{researchCanvasExport:{save}})
 await act(async()=>f.workspace.setArtifacts([{...text('export'),kind:'generated-container',containerPrompt:'图表',refreshMinutes:0,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'图表',html:'<svg></svg>'}}]))
 await f.event('click',f.host.querySelector('[data-workbench-more="export"]'))
 const menu=f.document.querySelector('.ew-grid-menu'),trigger=menu.querySelector('[aria-label="导出"]')
 expect(menu.textContent).not.toContain('编辑与导出')
 menu.getBoundingClientRect=()=>({left:210,top:80,right:416,bottom:475,width:206,height:395})
 trigger.getBoundingClientRect=()=>({left:218,top:170,right:408,bottom:203,width:190,height:33})
 await f.event('mouseover',trigger)
 const popup=f.document.querySelector('[aria-label="导出格式"]');expect(popup.textContent).toBe('SVGPNGJPG');expect(parseFloat(popup.style.left)).toBeGreaterThanOrEqual(420)
 const frame=f.host.querySelector('iframe[data-research-html-artifact]'),post=vi.spyOn(frame.contentWindow,'postMessage')
 await f.event('click',popup.querySelector('button'))
 const request=post.mock.calls.find(([d])=>d.type==='sherlock-workbench-export')[0],svg='<svg xmlns="http://www.w3.org/2000/svg" width="460" height="280" viewBox="0 0 460 280"><text x="1" y="10">当前筛选数据</text></svg>'
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:f.win,data:{type:'sherlock-workbench-export-result',id:request.id,svg}})))
 expect(save).not.toHaveBeenCalled()
 await act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source:frame.contentWindow,data:{type:'sherlock-workbench-export-result',id:request.id,svg}})))
 expect(save).toHaveBeenCalledWith({kind:'text',format:'svg',suggestedName:'export.svg',content:svg})
 expect(f.document.querySelector('.ew-grid-menu')).toBeNull()
})

it('思维导图在右侧独立展开二级菜单，菜单图标不再用列表图标代替',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'))
 const menu=f.document.querySelector('.ew-grid-menu'),mind=menu.querySelector('[aria-label="思维导图"]')
 menu.getBoundingClientRect=()=>({left:210,top:80,right:416,bottom:475,width:206,height:395})
 mind.getBoundingClientRect=()=>({left:218,top:226,right:408,bottom:259,width:190,height:33})
 await f.event('mouseover',mind)
 const child=f.document.querySelector('[aria-label="思维导图详细度"]')
 expect(child).not.toBeNull();expect(menu.contains(child)).toBe(false)
 expect(parseFloat(child.style.left)).toBeGreaterThanOrEqual(416)
 expect([...child.querySelectorAll('button')].map(n=>n.textContent)).toEqual(['简要','常规','详细'])
 const paths=['重命名','导出','数据源与自动更新'].map(label=>{const button=[...menu.querySelectorAll('button')].find(n=>n.textContent===label||n.getAttribute('aria-label')===label);return button.querySelector('[data-workbench-icon]')?.getAttribute('data-workbench-icon')||button.querySelector('path')?.getAttribute('d')})
 expect(new Set(paths).size).toBe(3)
 expect(paths).not.toContain(menu.querySelector('[aria-label="思维导图"] [data-workbench-icon]').getAttribute('data-workbench-icon'))
})

it('原生窗口仍处于缩放过程中时实时使用新的可见宽度，保留格位和内容',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a')]);f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:40,h:8}],true)})
 const cells=f.workspace.getWorkbenchCells(),excerpt=f.workspace.getSnapshot().artifacts[0].excerpt
 f.document.documentElement.setAttribute('data-odyssey-window-resizing','')
 Object.defineProperty(f.canvas,'clientWidth',{configurable:true,value:1500})
 f.canvas.getBoundingClientRect=()=>({left:0,top:0,right:1500,bottom:700,width:1500,height:700})
 await f.event('resize',f.win)
 const node=f.workspace.getSnapshot().artifacts[0]
 expect(f.workspace.getSnapshot().canvasSize).toMatchObject({width:1500,availableWidth:1500})
 expect(node.x+node.width/2).toBeCloseTo(1488)
 expect(parseFloat(f.host.querySelector('[data-research-node-id="a"]').style.width)).toBe(node.width)
 expect(f.workspace.getWorkbenchCells()).toEqual(cells);expect(node.excerpt).toBe(excerpt)
})

it('点击HTML控件的选择消息不改变层级或宿主DOM，避免关闭下拉框或重载内容',async()=>{
 const f=await fixture(true),html={...text('html'),kind:'generated-container',containerPrompt:'筛选新闻',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'新闻',html:'<select><option>全部</option><option>行业</option></select><button>展开全部</button>'}}
 await act(async()=>f.workspace.setArtifacts([html,text('other')]))
 const card=f.host.querySelector('[data-research-node-id="html"]'),frame=card.querySelector('iframe')
 const stackOrder=f.workspace.getSnapshot().artifacts[0].stackOrder
 expect(frame).not.toBeNull()
 const moved=[];const observer=new f.win.MutationObserver(records=>{for(const record of records)for(const removed of record.removedNodes)if(removed===card||removed.contains?.(frame))moved.push(removed)})
 observer.observe(f.host,{childList:true,subtree:true})
 await act(async()=>f.workspace.updateSelection(['html'],'replace'))
 await f.event('sherlock-research-content-select',frame,{detail:{metaKey:false,shiftKey:false}})
 expect(f.workspace.getSnapshot().artifacts[0].stackOrder).toBe(stackOrder)
 expect(f.workspace.getSnapshot().artifacts.map(n=>n.id)).toEqual(['html','other'])
 expect(moved).toHaveLength(0);observer.disconnect()
 expect(card.querySelector('iframe')).toBe(frame)
})

it('Shift多选顶栏与正文只切换组件，阻止文本选区且不启动拖动',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a'),text('b')]))
 const a=f.host.querySelector('[data-research-node-id="a"]'),b=f.host.querySelector('[data-research-node-id="b"]')
 const range=f.document.createRange();range.selectNodeContents(a.querySelector('[data-research-preview-body]'));f.win.getSelection().addRange(range)
 await act(async()=>f.workspace.updateSelection(['a'],'replace'))
 const down=await f.event('pointerdown',b.querySelector('[data-workbench-drag-handle]'),{button:0,pointerId:17,shiftKey:true,clientX:300,clientY:30})
 expect(down.defaultPrevented).toBe(true)
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['a','b'])
 expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
 expect(f.win.getSelection().toString()).toBe('')
 const remove=await f.event('pointerdown',a.querySelector('[data-research-preview-body]'),{button:0,pointerId:18,shiftKey:true})
 expect(remove.defaultPrevented).toBe(true);expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['b'])
 const ordinary=await f.event('pointerdown',b.querySelector('[data-research-preview-body]'),{button:0,pointerId:19})
 expect(ordinary.defaultPrevented).toBe(false)
})

it('空画布及顶部少量内容不增加滚动，接近底栏可继续滑动，长画布保留15格仍可创建',async()=>{
 const f=await fixture(true),layer=f.host.querySelector('[data-research-content-layer]')
 expect(parseFloat(layer.style.height)).toBe(700)
 await act(async()=>f.workspace.setArtifacts([text('a')]))
 expect(parseFloat(layer.style.height)).toBe(700)
 await act(async()=>f.workspace.setViewport({x:0,y:-500,scale:1}))
 expect(f.canvas.scrollTop).toBe(0);expect(f.workspace.getSnapshot().viewport.y).toBe(0)
 await act(async()=>f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:34}],true))
 const before=f.workspace.getSnapshot().artifacts[0],bottom=before.y+before.height/2
 const step=(1000-14)/40
 expect(parseFloat(layer.style.height)).toBe(Math.ceil(bottom+15*step))
 f.canvas.scrollTop=bottom;await f.event('scroll',f.canvas)
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 await f.event('pointerdown',f.canvas,{button:0,pointerId:20,clientX:12,clientY:450})
 await f.event('pointerup',f.canvas,{pointerId:20,clientX:490,clientY:650})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(2)
 const added=f.workspace.getSnapshot().artifacts.find(n=>n.id!=='a')
 expect(added.y-added.height/2).toBeGreaterThan(bottom)
 await act(async()=>f.workspace.setArtifacts([]))
 expect(parseFloat(layer.style.height)).toBe(700);expect(f.canvas.scrollTop).toBe(0)
 await act(async()=>{f.workspace.setArtifacts([text('edge')]);f.workspace.applyWorkbenchCells([{id:'edge',x:0,y:0,w:20,h:28}],true);f.workspace.updateSelection(['edge'],'replace')})
 const handle=f.document.querySelector('[data-workbench-resize="edge"][data-workbench-resize-axis="y"]')
 expect(parseFloat(handle.style.top)+parseFloat(handle.style.height)).toBeLessThanOrEqual(700)
 const edge=f.workspace.getSnapshot().artifacts[0]
 expect(parseFloat(layer.style.height)).toBe(875)
 await act(async()=>f.workspace.setViewport({x:0,y:-500,scale:1}))
 expect(f.canvas.scrollTop).toBe(175)
 expect(edge.y+edge.height/2-f.canvas.scrollTop).toBeLessThan(614)
 expect(f.workspace.getSnapshot().artifacts[0]).toEqual(edge)
})


it('组件设置向右展开，复用原编辑和定时任务操作而不弹出旧菜单',async()=>{
 const f=await fixture(true),node={...text('settings'),kind:'generated-container',containerPrompt:'研究行情',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'markdown',title:'行情',content:'# 行情\n真实内容'}}
 await act(async()=>f.workspace.setArtifacts([node]))
 const open=async()=>{
  await f.event('click',f.host.querySelector('[data-workbench-more="settings"]'))
  const main=f.document.querySelector('[aria-label="组件更多操作"][role="menu"]'),trigger=[...main.querySelectorAll('button')].find(n=>n.textContent.includes('组件设置'))
  main.getBoundingClientRect=()=>({left:210,top:80,right:416,bottom:475,width:206,height:395})
  trigger.getBoundingClientRect=()=>({left:218,top:390,right:408,bottom:423,width:190,height:33})
  await f.event('click',trigger)
  const child=f.document.querySelector('[aria-label="组件设置"][role="menu"]')
  expect(child).not.toBeNull();expect(main.contains(child)).toBe(false);expect(parseFloat(child.style.left)).toBeGreaterThanOrEqual(416)
  expect(f.document.querySelector('[data-odyssey-container-menu]')).toBeNull()
  expect([...child.querySelectorAll('button')].map(n=>n.textContent)).toEqual(['编辑需求','刷新数据','数据源与自动更新'])
  return child
 }
 let child=await open()
 await f.event('click',[...child.querySelectorAll('button')].find(n=>n.textContent==='编辑需求'))
 expect(f.host.querySelector('[role="dialog"][aria-label="编辑需求"]')).not.toBeNull()
 await f.event('keydown',f.host.querySelector('[role="dialog"][aria-label="编辑需求"]'),{key:'Escape'})
 child=await open();const schedule=vi.fn();f.win.addEventListener('sherlock:component-schedule-open',schedule)
 const main=f.document.querySelector('[aria-label="组件更多操作"][role=menu]'),items=[...main.querySelectorAll('button')].map(n=>n.textContent);expect(items.indexOf('设定定时任务')).toBe(items.indexOf('数据源与自动更新')-1)
 await f.event('click',[...main.querySelectorAll('button')].find(n=>n.textContent==='设定定时任务'))
 expect(schedule).toHaveBeenCalledOnce();expect(schedule.mock.calls[0][0].detail).toMatchObject({sessionId:'grid-test',nodeId:'settings'})
})

it('内置组件主菜单提供定时任务与数据设置',async()=>{
 const f=await financialClientFixture({},{refreshState:true}),schedule=vi.fn(),data=vi.fn();disposals.push(f.dispose);f.win.addEventListener('sherlock:component-schedule-open',schedule);f.win.addEventListener('sherlock:component-data-open',data)
 for(const widget of ['quote','watchlist','indices','news','announcements']){
  let node;await f.act(async()=>{f.workspace.setArtifacts([]);node=f.workspace.createFinancialWidget(widget)})
  await f.event('click',f.host.querySelector('[data-workbench-more="'+node.id+'"]'))
  const main=f.document.querySelector('[role=menu][aria-label="组件更多操作"]'),buttons=[...main.querySelectorAll('button')],labels=buttons.map(b=>b.textContent)
  expect(labels.indexOf('设定定时任务')).toBe(labels.indexOf('数据源与自动更新')-1)
  await f.event('click',buttons.find(b=>b.textContent==='设定定时任务'));expect(schedule.mock.calls.at(-1)[0].detail).toMatchObject({nodeId:node.id,sessionId:'financial-test'})
  await f.event('click',f.host.querySelector('[data-workbench-more="'+node.id+'"]'))
  await f.event('click',[...f.document.querySelector('[role=menu][aria-label="组件更多操作"]').querySelectorAll('button')].find(b=>b.textContent==='数据源与自动更新'))
  expect(data.mock.calls.at(-1)[0].detail).toMatchObject({nodeId:node.id,kind:'financial-widget'})
  const close=f.document.querySelector('[aria-label="关闭数据设置"]');if(close)await f.event('click',close)
 }

},15000)

it('斜移经过相邻行再进入右侧子菜单时保持展开，离开后关闭',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 await f.event('click',f.host.querySelector('[data-workbench-more="a"]'))
 const main=f.document.querySelector('[role="menu"][aria-label="组件更多操作"]'),mind=main.querySelector('[aria-label="思维导图"]')
 main.getBoundingClientRect=()=>({left:210,top:80,right:416,bottom:475,width:206,height:395})
 mind.getBoundingClientRect=()=>({left:218,top:226,right:408,bottom:259,width:190,height:33})
 await f.event('mouseover',mind)
 await f.event('mouseover',[...main.querySelectorAll('button')].find(n=>n.textContent==='总结提炼'))
 const child=f.document.querySelector('[aria-label="思维导图详细度"]');expect(child).not.toBeNull()
 await f.event('mouseover',child)
 await act(async()=>new Promise(r=>setTimeout(r,200)))
 expect(f.document.querySelector('[aria-label="思维导图详细度"]')).not.toBeNull()
 await f.event('mouseout',child)
 await act(async()=>new Promise(r=>setTimeout(r,200)))
 expect(f.document.querySelector('[aria-label="思维导图详细度"]')).toBeNull()
})


it('共享只读组件的设置菜单仍允许浏览器阅读，禁止编辑和刷新',async()=>{
 let shared=false
 const f=await fixture(false,{researchBoards:{isSharedSession:()=>shared}})
 f.workspace.setArtifacts([{...text('link'),kind:'web-link',url:'https://example.com/',title:'只读链接'}])
 shared=true;await f.render()
 await f.event('click',f.host.querySelector('[data-workbench-more="link"]'))
 const main=f.document.querySelector('[role="menu"][aria-label="组件更多操作"]'),trigger=main.querySelector('[aria-label="组件设置"]')
 main.getBoundingClientRect=()=>({left:210,top:80,right:416,bottom:475,width:206,height:395})
 trigger.getBoundingClientRect=()=>({left:218,top:390,right:408,bottom:423,width:190,height:33})
 await f.event('click',trigger)
 const child=f.document.querySelector('[role="menu"][aria-label="组件设置"]'),buttons=[...child.querySelectorAll('button')]
 expect(buttons.find(n=>n.textContent==='浏览器打开').disabled).toBe(false)
 expect(buttons.find(n=>n.textContent==='浏览器打开').querySelector('[data-workbench-icon="globe"]')).toBeTruthy()
 expect(buttons.find(n=>n.textContent==='刷新').disabled).toBe(true)
 expect(buttons.find(n=>n.textContent==='修改名称').disabled).toBe(true)
})


it('组件选择变化不重复发送相同的共享上下文，避免重绘正在使用的下拉框',async()=>{
 const f=await fixture(true),html={...text('html'),kind:'generated-container',containerPrompt:'新闻',refreshMinutes:0,generationLastSeq:1,generationStatus:'completed',containerSpec:{version:1,type:'html',title:'新闻',html:'<select><option>全部</option><option>行业</option></select>'}}
 await act(async()=>f.workspace.setArtifacts([html]))
 const frame=f.host.querySelector('iframe[data-research-html-artifact]'),post=vi.fn()
 Object.defineProperty(frame,'contentWindow',{configurable:true,value:{postMessage:post}})
 await act(async()=>f.workspace.updateSelection(['html'],'replace'))
 expect(post.mock.calls.filter(([m])=>m.type==='sherlock-component-context')).toHaveLength(0)
 await act(async()=>f.workspace.updateSelection([],'replace'))
 expect(post.mock.calls.filter(([m])=>m.type==='sherlock-component-context')).toHaveLength(0)
 f.win.dshDesktop.researchBoards={isSharedSession:()=>true}
 await act(async()=>f.workspace.updateSelection(['html'],'replace'))
 expect(post.mock.calls.filter(([m])=>m.type==='sherlock-component-context')).toEqual([[expect.objectContaining({readOnly:true,shared:true}),'*']])
})


it('改变组件大小时只显示吸附预览蓝框，松手或取消恢复单层选中描边',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a'),text('b',740)]);f.workspace.updateSelection(['a'],'replace')})
 const card=f.host.querySelector('[data-research-node-id="a"]'),other=f.host.querySelector('[data-research-node-id="b"]'),ring=card.querySelector('.ew-grid-selection-ring'),preview=f.canvas.querySelector('.ew-grid-placeholder')
 const down=async id=>f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]'),{button:0,pointerId:id,clientX:480,clientY:250})
 await down(29);await f.event('pointermove',f.canvas,{pointerId:29,clientX:620,clientY:320})
 expect(preview.hidden).toBe(false)
 expect(f.win.getComputedStyle(ring).display).toBe('none')
 expect(other.querySelector('.ew-grid-selection-ring')).toBeNull()
 expect(Number(f.win.getComputedStyle(preview).zIndex)).toBeGreaterThan(Number(f.win.getComputedStyle(card).zIndex))
 await f.event('pointerup',f.canvas,{pointerId:29,clientX:620,clientY:320})
 expect(preview.hidden).toBe(true);expect(f.win.getComputedStyle(ring).display).not.toBe('none')
 await down(30);await f.event('pointercancel',f.canvas,{pointerId:30})
 expect(preview.hidden).toBe(true);expect(f.win.getComputedStyle(ring).display).not.toBe('none')
})

it('多选拖动一个高度手柄时一起缩放、单步撤销、取消恢复整组',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await act(async()=>{w.setArtifacts([text('a'),text('b',740),text('c')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:8},{id:'b',x:20,y:0,w:20,h:10},{id:'c',x:0,y:10,w:40,h:6}],true);w.updateSelection(['a','b'],'replace')})
 const before=w.getWorkbenchCells(),handle=()=>f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="y"]')
 const down=id=>f.event('pointerdown',handle(),{button:0,pointerId:id,clientX:200,clientY:200})
 await down(91);await f.event('pointermove',f.canvas,{pointerId:91,clientX:200,clientY:200+3*step})
 expect(w.getWorkbenchCells().find(c=>c.id==='a').h).toBe(11)
 expect(w.getWorkbenchCells().find(c=>c.id==='b').h).toBe(13)
 expect(w.getWorkbenchCells().find(c=>c.id==='c').y).toBe(13)
 expect([...f.canvas.querySelectorAll('.ew-grid-placeholder:not([hidden])')]).toHaveLength(2)
 for(const id of ['a','b'])expect(f.win.getComputedStyle(f.host.querySelector('[data-research-node-id="'+id+'"] .ew-grid-selection-ring')).display).toBe('none')
 await f.event('pointerup',f.canvas,{pointerId:91,clientX:200,clientY:200+3*step})
 expect(w.getSnapshot().selection.selectedNodeIds).toEqual(['a','b'])
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
 await down(92);await f.event('pointermove',f.canvas,{pointerId:92,clientX:200,clientY:200+4*step});await f.event('pointercancel',f.canvas,{pointerId:92})
 expect(w.getWorkbenchCells()).toEqual(before)
 expect(f.canvas.querySelectorAll('.ew-grid-placeholder:not([hidden])')).toHaveLength(0)
})

it('窄窗多选调高从实际显示高度同步增量，未操作宽度与取消仍保留规范值',async()=>{
 const f=await fixture(true),w=f.workspace,step=(500-14)/40
 await act(async()=>{w.setArtifacts([text('a'),text('b',740)]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5},{id:'b',x:20,y:0,w:20,h:12}],true);w.setCanvasSize({width:500,height:700,availableWidth:500});w.setWorkbenchWidth(500);w.updateSelection(['a','b'],'replace')})
 const canonical=w.getWorkbenchCells(),visible=w.getWorkbenchVisibleCells(),a=visible.find(c=>c.id==='a'),b=visible.find(c=>c.id==='b')
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="y"]'),{button:0,pointerId:93,clientX:100,clientY:100})
 await f.event('pointermove',f.canvas,{pointerId:93,clientX:100,clientY:100+step})
 expect(w.getWorkbenchVisibleCells().find(c=>c.id==='a').h).toBe(a.h+1)
 expect(w.getWorkbenchVisibleCells().find(c=>c.id==='b').h).toBe(b.h+1)
 expect(w.getWorkbenchCells().map(c=>c.w)).toEqual(canonical.map(c=>c.w))
 await f.event('pointercancel',f.canvas,{pointerId:93})
 expect(w.getWorkbenchCells()).toEqual(canonical)
})

it('窄窗多选调宽从草稿实际宽度同步增量，边界限制不会反向缩小',async()=>{
 const f=await fixture(true),w=f.workspace,step=(500-14)/40;let draft
 await act(async()=>{w.setArtifacts([text('b')]);draft=w.createContainerDraft();w.applyWorkbenchCells([{id:draft.id,x:0,y:0,w:10,h:10},{id:'b',x:0,y:10,w:20,h:12}],true);w.setCanvasSize({width:500,height:700,availableWidth:500});w.setWorkbenchWidth(500);w.updateSelection([draft.id,'b'],'replace')})
 const canonical=w.getWorkbenchCells(),visible=w.getWorkbenchVisibleCells()
 const handle=()=>f.canvas.querySelector('[data-workbench-resize="'+draft.id+'"][data-workbench-resize-axis="x"]')
 await f.event('pointerdown',handle(),{button:0,pointerId:94,clientX:100,clientY:100})
 await f.event('pointermove',f.canvas,{pointerId:94,clientX:100+step,clientY:100})
 for(const id of [draft.id,'b'])expect(w.getWorkbenchVisibleCells().find(c=>c.id===id).w).toBe(visible.find(c=>c.id===id).w+1)
 expect(w.getWorkbenchCells().map(c=>c.h)).toEqual(canonical.map(c=>c.h))
 await f.event('pointercancel',f.canvas,{pointerId:94});expect(w.getWorkbenchCells()).toEqual(canonical)
 await act(async()=>w.applyWorkbenchCells(canonical.map(c=>c.id===draft.id?{...c,x:20}:c),true))
 const edge=w.getWorkbenchCells(),edgeVisible=w.getWorkbenchVisibleCells()
 await f.event('pointerdown',handle(),{button:0,pointerId:95,clientX:100,clientY:100})
 await f.event('pointermove',f.canvas,{pointerId:95,clientX:100+step,clientY:100})
 expect(w.getWorkbenchCells()).toEqual(edge)
 expect(w.getWorkbenchVisibleCells()).toEqual(edgeVisible)
 await f.event('pointercancel',f.canvas,{pointerId:95})
})

it('窄窗多选调宽不保存未选草稿的被动补宽，恢复宽窗及撤销取消不漂移',async()=>{
 const f=await fixture(true),w=f.workspace,step=(700-14)/40;let draft
 await act(async()=>{w.setArtifacts([text('a'),text('c')]);draft=w.createContainerDraft();w.applyWorkbenchCells([{id:'a',x:0,y:0,w:17,h:10},{id:draft.id,x:17,y:0,w:8,h:10},{id:'c',x:0,y:10,w:17,h:10}],true);w.updateSelection(['a','c'],'replace')})
 const canonical=w.getWorkbenchCells(),wideWidth=w.getSnapshot().artifacts.find(n=>n.id===draft.id).width
 await act(async()=>{w.setCanvasSize({width:700,height:700,availableWidth:700});w.setWorkbenchWidth(700)})
 expect(w.getWorkbenchVisibleCells().find(c=>c.id===draft.id).w).toBe(17)
 const handle=()=>f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]')
 await f.event('pointerdown',handle(),{button:0,pointerId:96,clientX:100,clientY:100})
 await f.event('pointerup',f.canvas,{pointerId:96,clientX:100+step,clientY:100})
 expect(w.getWorkbenchCells().filter(c=>['a','c'].includes(c.id)).map(c=>c.w)).toEqual([18,18])
 expect(w.getWorkbenchCells().find(c=>c.id===draft.id)).toMatchObject({x:18,w:8,h:10})
 await act(async()=>{w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)})
 expect(w.getSnapshot().artifacts.find(n=>n.id===draft.id).width).toBe(wideWidth)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(canonical)
 await act(async()=>{w.setCanvasSize({width:700,height:700,availableWidth:700});w.setWorkbenchWidth(700)})
 await f.event('pointerdown',handle(),{button:0,pointerId:97,clientX:100,clientY:100})
 await f.event('pointermove',f.canvas,{pointerId:97,clientX:100+step*2,clientY:100})
 await f.event('pointercancel',f.canvas,{pointerId:97});expect(w.getWorkbenchCells()).toEqual(canonical)
})

it('滚动条占宽时缩放预览四边与实际组件使用同一可用宽度',async()=>{
 const f=await fixture(true)
 await act(async()=>{f.workspace.setArtifacts([text('a')]);f.workspace.applyWorkbenchCells([{id:'a',x:8,y:6,w:24,h:8}],true);f.workspace.updateSelection(['a'],'replace')})
 Object.defineProperty(f.canvas,'clientWidth',{configurable:true,value:984})
 await f.event('resize',f.win)
 const card=f.host.querySelector('[data-research-node-id="a"]'),preview=f.canvas.querySelector('.ew-grid-placeholder')
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]'),{button:0,pointerId:67,clientX:780,clientY:320})
 await f.event('pointermove',f.canvas,{pointerId:67,clientX:850,clientY:365})
 const node=f.workspace.getSnapshot().artifacts[0]
 expect(preview.hidden).toBe(false)
 expect(parseFloat(preview.style.left)).toBeCloseTo(node.x-node.width/2)
 expect(parseFloat(preview.style.top)).toBeCloseTo(node.y-node.height/2)
 expect(parseFloat(preview.style.width)).toBeCloseTo(node.width)
 expect(parseFloat(preview.style.height)).toBeCloseTo(node.height)
 expect(f.workspace.getSnapshot().canvasSize).toMatchObject({width:1000,availableWidth:984})
 await f.event('pointerup',f.canvas,{pointerId:67,clientX:850,clientY:365})
 expect(preview.hidden).toBe(true)
 expect(parseFloat(card.style.width)).toBeCloseTo(f.workspace.getSnapshot().artifacts[0].width)
})

it('画板菜单挂到页面前景，靠近底部时完整避开全局工具栏',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const original=f.win.HTMLElement.prototype.getBoundingClientRect
 f.win.HTMLElement.prototype.getBoundingClientRect=function(){
  if(this.matches('.rScV5Q_contextMenu'))return {left:0,top:0,right:260,bottom:160,width:260,height:160}
  if(this.matches('[data-ework-toolbar]'))return {left:395,top:630,right:605,bottom:684,width:210,height:54}
  return original.call(this)
 }
 f.canvas.scrollTop=350;await f.event('scroll',f.canvas)
 await f.event('contextmenu',f.canvas,{clientX:450,clientY:650,button:2})
 const menu=f.document.querySelector('.rScV5Q_contextMenu')
 expect(menu.parentElement).toBe(f.document.body)
 expect(f.win.getComputedStyle(menu).position).toBe('fixed')
 expect(Number(f.win.getComputedStyle(menu).zIndex)).toBeGreaterThan(Number(f.win.getComputedStyle(f.document.querySelector('[data-ework-toolbar]')).zIndex))
 expect(parseFloat(menu.style.top)+160).toBeLessThanOrEqual(622)
 expect(menu.textContent).toContain('整理画布')
 await f.event('keydown',menu,{key:'Escape',code:'Escape'})
 expect(f.document.querySelector('.rScV5Q_contextMenu')).toBeNull()
 f.win.HTMLElement.prototype.getBoundingClientRect=original
})

it('创建背景网格与内容层共用吸附格距，滚动后绘制框仍对应真实格位',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const layer=f.canvas.querySelector('[data-research-content-layer]'),step=(1000-14)/40
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 expect(parseFloat(layer.style.getPropertyValue('--grid-step'))).toBe(step)
 expect(f.win.getComputedStyle(layer).backgroundSize).toBe(step+'px '+step+'px')
 f.canvas.scrollTop=step*18;await f.event('scroll',f.canvas)
 const start={x:12+step*4,y:12+step*20},end={x:12+step*21-10,y:12+step*32-10}
 await f.event('pointerdown',f.canvas,{button:0,pointerId:52,clientX:start.x,clientY:start.y-f.canvas.scrollTop})
 await f.event('pointermove',f.canvas,{pointerId:52,clientX:end.x,clientY:end.y-f.canvas.scrollTop})
 const preview=f.canvas.querySelector('.ew-grid-placeholder')
 expect(parseFloat(preview.style.left)).toBeCloseTo(start.x)
 expect(parseFloat(preview.style.top)).toBeCloseTo(start.y)
 expect((parseFloat(preview.style.width)+10)/step).toBeCloseTo(17)
 expect((parseFloat(preview.style.height)+10)/step).toBeCloseTo(12)
 await f.event('pointercancel',f.canvas,{pointerId:52})
 await act(async()=>{f.workspace.setCanvasSize({width:800,height:700,availableWidth:800});f.workspace.setWorkbenchWidth(800)})
 expect(parseFloat(layer.style.getPropertyValue('--grid-step'))).toBe((800-14)/40)
})

it('旧35px行布局一次换算到正方形格位，重新打开不重复迁移',async()=>{
 const f=await fixture(),id='legacy-square',key='ework.research.grid.v1:'+id
 f.win.localStorage.setItem(key,JSON.stringify({version:1,cells:[{id:'a',x:0,y:0,w:20,h:8},{id:'b',x:0,y:8,w:20,h:10}]}))
 const w=f.bundle.createResearchWorkspaceSession(f.win.localStorage,id)
 w.setArtifacts([text('a'),text('b')]);w.setCanvasSize({width:1000,height:700});w.setWorkbenchWidth(1000)
 const cells=w.getWorkbenchCells(),step=(1000-14)/40
 expect(cells[0]).toMatchObject({x:0,y:0,w:20})
 expect(cells[0].h*step).toBeGreaterThanOrEqual(8*35)
 expect(cells[0].h*step).toBeLessThan(8*35+step)
 expect(cells[1].y).toBeGreaterThanOrEqual(cells[0].h)
 expect(JSON.parse(f.win.localStorage.getItem(key)).version).toBe(2)
 const reopened=f.bundle.createResearchWorkspaceSession(f.win.localStorage,id);reopened.setCanvasSize({width:500,height:700});reopened.setWorkbenchWidth(500)
 expect(reopened.getWorkbenchCells()).toEqual(cells)
})

it('窄窗口保留组件最小可操作高度并让位，恢复宽度与只读规范文档不漂移',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setCanvasSize({width:1000,height:700});w.setArtifacts([text('a'),text('b')]);w.setWorkbenchWidth(1000);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5},{id:'b',x:0,y:5,w:20,h:5}],true)})
 const cells=w.getWorkbenchCells(),canonical=w.getWorkbenchDocument()
 for(const width of [500,240]){
  await act(async()=>{w.setCanvasSize({width,height:700,availableWidth:width});w.setWorkbenchWidth(width)})
  const [a,b]=w.getSnapshot().artifacts
  expect(a.height).toBeGreaterThanOrEqual(95)
  expect(a.y+a.height/2).toBeLessThan(b.y-b.height/2)
  expect(w.getWorkbenchDocument()).toEqual(canonical)
 }
 const card=f.host.querySelector('[data-research-node-id="a"]')
 await f.event('pointerdown',card.querySelector('[data-workbench-drag-handle]'),{button:0,pointerId:61,clientX:40,clientY:20})
 await f.event('pointermove',f.canvas,{pointerId:61,clientX:80,clientY:80})
 await f.event('pointercancel',f.canvas,{pointerId:61})
 expect(w.getWorkbenchDocument()).toEqual(canonical)
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="y"]'),{button:0,pointerId:62,clientX:110,clientY:100})
 await f.event('pointerup',f.canvas,{pointerId:62,clientX:110,clientY:100})
 expect(w.getWorkbenchDocument()).toEqual(canonical)
 await act(async()=>{w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)})
 expect(w.getWorkbenchCells()).toEqual(cells)
 f.win.dshDesktop.researchBoards={isSharedSession:id=>id==='readonly-square'}
 const peer=f.bundle.createResearchWorkspaceSession(f.win.localStorage,'readonly-square')
 peer.applyRemoteCanvas(canonical,{revision:1});peer.setCanvasSize({width:240,height:700,availableWidth:240});peer.setWorkbenchWidth(240)
 expect(peer.getSnapshot().artifacts.every(n=>n.height>=95)).toBe(true)
 expect(peer.getWorkbenchDocument()).toEqual(canonical)
})

it('下载格式子菜单独立置于页面前景，跨越间隙与点击时主菜单保持打开',async()=>{
 const save=vi.fn(async()=>({ok:true})),f=await fixture(true,{researchCanvasExport:{save}})
 await act(async()=>f.workspace.setArtifacts([{...text('mind'),kind:'generated-mind-map',generationStatus:'completed',generationDetail:'standard',generationLastSeq:1,sourceNodeIds:['source']}]))
 const card=f.host.querySelector('[data-research-node-id="mind"]')
 await f.event('contextmenu',card,{button:2,clientX:450,clientY:610})
 const download=f.document.querySelector('[data-research-context-download]'),group=download.parentElement
 await f.event('click',download)
 const popup=f.document.querySelector('.rScV5Q_contextDownloadFormats')
 expect(popup.parentElement).toBe(f.document.body)
 expect(f.win.getComputedStyle(popup).position).toBe('fixed')
 expect(popup.textContent).toBe('SVGPNGJPG')
 await f.event('mouseout',group,{relatedTarget:f.document.body});await f.event('mouseover',popup,{relatedTarget:f.document.body})
 await act(async()=>new Promise(r=>setTimeout(r,240)))
 expect(f.document.querySelector('.rScV5Q_contextDownloadFormats')).toBe(popup)
 await f.event('pointerdown',popup.querySelector('button'),{button:0})
 expect(f.document.querySelector('.rScV5Q_contextMenu')).not.toBeNull()
})

it('窄窗口移动不写回本地补高，缩放仅改变目标尺寸且可撤销',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setArtifacts([text('a'),text('b')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5},{id:'b',x:0,y:5,w:20,h:5}],true);w.setCanvasSize({width:500,height:700,availableWidth:500});w.setWorkbenchWidth(500)})
 const card=f.host.querySelector('[data-research-node-id="a"]'),step=(500-14)/40
 await f.event('pointerdown',card.querySelector('[data-workbench-drag-handle]'),{button:0,pointerId:65,clientX:40,clientY:20})
 await f.event('pointerup',f.canvas,{pointerId:65,clientX:40+step,clientY:20})
 expect(w.getWorkbenchCells().map(c=>c.h)).toEqual([5,5])
 const afterMove=w.getWorkbenchCells()
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="y"]'),{button:0,pointerId:66,clientX:230,clientY:100})
 await f.event('pointerup',f.canvas,{pointerId:66,clientX:230,clientY:100+step})
 expect(w.getWorkbenchCells().find(c=>c.id==='a').h).toBe(15)
 expect(w.getWorkbenchCells().find(c=>c.id==='b').h).toBe(5)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(afterMove)
 await act(async()=>{w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)})
 expect(w.getWorkbenchCells().map(c=>c.h)).toEqual([5,5])
})

it('单轴缩放保留未操作轴的规范尺寸，窄窗补高和小草稿补宽不写回',async()=>{
 const f=await fixture(true),w=f.workspace
 await act(async()=>{w.setArtifacts([text('a')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5}],true);w.setCanvasSize({width:500,height:700,availableWidth:500});w.setWorkbenchWidth(500);w.updateSelection(['a'],'replace')})
 const step=parseFloat(f.canvas.querySelector('[data-research-content-layer]').style.getPropertyValue('--grid-step'))
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize-axis=x]'),{button:0,pointerId:74,clientX:230,clientY:100})
 await f.event('pointerup',f.canvas,{pointerId:74,clientX:230+step,clientY:100+step*3})
 expect(w.getWorkbenchCells()[0]).toMatchObject({x:0,y:0,w:25,h:5})
 await act(async()=>{w.undo();w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)})
 let draft;await act(async()=>{draft=w.createContainerDraft();w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:5},{id:draft.id,x:32,y:10,w:4,h:3}],true);w.updateSelection([draft.id],'replace')})
 const wideStep=parseFloat(f.canvas.querySelector('[data-research-content-layer]').style.getPropertyValue('--grid-step'))
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize-axis=y]'),{button:0,pointerId:75,clientX:800,clientY:500})
 await f.event('pointerup',f.canvas,{pointerId:75,clientX:800+wideStep*3,clientY:500+wideStep})
 expect(w.getWorkbenchCells().find(c=>c.id===draft.id)).toMatchObject({x:32,w:4,h:8})
 await act(async()=>w.undo())
 expect(w.getWorkbenchCells().find(c=>c.id===draft.id)).toMatchObject({x:32,w:4,h:3})
 await f.event('pointerdown',f.host.querySelector('[data-workbench-drag-handle="'+draft.id+'"]'),{button:0,pointerId:76,clientX:800,clientY:500})
 await f.event('pointerup',f.canvas,{pointerId:76,clientX:800,clientY:500+wideStep*2})
 expect(w.getWorkbenchCells().find(c=>c.id===draft.id)).toMatchObject({x:32,w:4,h:3})
})

it('调宽预览压缩同排组件，松手使用预览并一次撤销恢复双方',async()=>{
 const f=await fixture(true);await act(async()=>{f.workspace.setArtifacts([text('a'),text('b')]);f.workspace.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:10},{id:'b',x:20,y:0,w:20,h:10}],true);f.workspace.updateSelection(['a'],'replace')})
 const before=f.workspace.getWorkbenchCells(),step=(1000-14)/40,handle=f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]')
 await f.event('pointerdown',handle,{button:0,pointerId:87,clientX:490,clientY:200})
 await f.event('pointermove',f.canvas,{pointerId:87,clientX:490+step*6,clientY:200})
 await act(async()=>new Promise(r=>setTimeout(r,40)))
 const preview=f.workspace.getWorkbenchCells()
 expect(preview.find(c=>c.id==='b')).toMatchObject({x:26,y:0,w:14,h:10})
 await f.event('pointerup',f.canvas,{pointerId:87,clientX:490+step*6,clientY:200})
 expect(f.workspace.getWorkbenchCells()).toEqual(preview)
 await act(async()=>f.workspace.undo());expect(f.workspace.getWorkbenchCells()).toEqual(before)
})

it.each(['x','y'])('调%s时先丢失指针捕获仍继续到窗口松手，保持预览且只生成一次撤销',async axis=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await act(async()=>{w.setArtifacts([text('a')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:20}],true);w.updateSelection(['a'],'replace')})
 const before=w.getWorkbenchCells(),point=delta=>({pointerId:105,clientX:490+(axis==='x'?step*delta:0),clientY:500+(axis==='y'?step*delta:0)})
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="'+axis+'"]'),{button:0,buttons:1,...point(0)})
 await f.event('pointermove',f.canvas,{buttons:1,...point(2)})
 const preview=w.getWorkbenchCells()
 // Electron can release capture before delivering the final move / mouse-up.
 // Losing capture does not mean that the user cancelled the gesture.
 await f.event('lostpointercapture',f.canvas,{buttons:0,...point(4)})
 expect(w.getWorkbenchCells()).toEqual(preview)
 expect(f.canvas.getAttribute('data-grid-operation')).toBe('resize')
 await f.event('pointermove',f.win,{buttons:0,...point(4)})
 await f.event('pointerup',f.document.body,{buttons:0,...point(4)})
 expect(w.getWorkbenchCells()[0][axis==='x'?'w':'h']).toBe(24)
 expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
})

it('缩放捕获丢失后仍允许真正的指针取消和窗口失焦恢复原尺寸',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await act(async()=>{w.setArtifacts([text('a')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:20}],true);w.updateSelection(['a'],'replace')})
 const before=w.getWorkbenchCells()
 for(const kind of ['pointercancel','blur']){
  await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]'),{button:0,pointerId:106,clientX:490,clientY:200})
  await f.event('pointermove',f.canvas,{pointerId:106,clientX:490+step*3,clientY:200})
  await f.event('lostpointercapture',f.canvas,{pointerId:106,buttons:1})
  expect(f.canvas.getAttribute('data-grid-operation')).toBe('resize')
  await f.event(kind,f.win,kind==='blur'?{}:{pointerId:106})
  expect(w.getWorkbenchCells()).toEqual(before)
  expect(f.canvas.hasAttribute('data-grid-operation')).toBe(false)
 }
})

it('调高后的画布滚动夹紧不在原地松手时重新计算尺寸',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await act(async()=>{w.setArtifacts([text('a')]);w.applyWorkbenchCells([{id:'a',x:0,y:20,w:20,h:20}],true);w.updateSelection(['a'],'replace')})
 f.canvas.scrollTop=300
 const before=w.getWorkbenchCells()
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="y"]'),{button:0,pointerId:101,clientX:250,clientY:500})
 await f.event('pointermove',f.canvas,{pointerId:101,clientX:250,clientY:500-step*4})
 const preview=w.getWorkbenchCells()
 expect(preview[0].h).toBe(16)
 // Chromium can clamp scrollTop when the just-resized content becomes shorter.
 // Releasing at the same screen coordinate must commit the visible preview.
 f.canvas.scrollTop=180
 await f.event('pointerup',f.canvas,{pointerId:101,clientX:250,clientY:500-step*4})
 expect(w.getWorkbenchCells()).toEqual(preview)
 await act(async()=>w.undo());expect(w.getWorkbenchCells()).toEqual(before)
 f.canvas.scrollTop=300
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="y"]'),{button:0,pointerId:103,clientX:250,clientY:500})
 await f.event('pointermove',f.canvas,{pointerId:103,clientX:250,clientY:500-step*4})
 f.canvas.scrollTop=180
 await f.event('pointerup',f.canvas,{pointerId:103,clientX:250,clientY:500-step*3})
 expect(w.getWorkbenchCells()[0].h).toBe(17)
})

it('调宽后的可用宽度变化不在原地松手时覆盖预览',async()=>{
 const f=await fixture(true),w=f.workspace,step=(1000-14)/40
 await act(async()=>{w.setArtifacts([text('a')]);w.applyWorkbenchCells([{id:'a',x:0,y:0,w:20,h:10}],true);w.updateSelection(['a'],'replace')})
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]'),{button:0,pointerId:102,clientX:490,clientY:200})
 await f.event('pointermove',f.canvas,{pointerId:102,clientX:490+step*4,clientY:200})
 const preview=w.getWorkbenchCells()
 expect(preview[0].w).toBe(24)
 await act(async()=>{w.setCanvasSize({width:700,height:700,availableWidth:700});w.setWorkbenchWidth(700)})
 await f.event('pointerup',f.canvas,{pointerId:102,clientX:490+step*4,clientY:200})
 expect(w.getWorkbenchCells()).toEqual(preview)
 await act(async()=>{w.undo();w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000)})
 await f.event('pointerdown',f.canvas.querySelector('[data-workbench-resize="a"][data-workbench-resize-axis="x"]'),{button:0,pointerId:104,clientX:490,clientY:200})
 await f.event('pointermove',f.canvas,{pointerId:104,clientX:490+step*4,clientY:200})
 await act(async()=>{w.setCanvasSize({width:700,height:700,availableWidth:700});w.setWorkbenchWidth(700)})
 await f.event('pointerup',f.canvas,{pointerId:104,clientX:490+step*5,clientY:200})
 expect(w.getWorkbenchCells()[0].w).toBe(25)
})

it('宿主原生滚动条一直不占位，选中仅改变覆盖层颜色并保留滚动能力',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('a')]))
 const style=f.document.createElement('style');style.textContent='body [data-research-artifact-card]:not(:has(.rScV5Q_webFrame)) :is(.rScV5Q_previewBody,.rScV5Q_artifactBody,.odyssey-component-primary,.rScV5Q_containerMarkdown,.rScV5Q_containerTableScroll,.rScV5Q_mindMap,.odyssey-generation-records,textarea){scrollbar-width:none!important}';f.document.head.append(style)
 const scroller=f.host.querySelector('[data-research-preview-body]')
 // HappyDOM omits cascade layers; Chromium acceptance checks the computed
 // gutter and scrollbar against the real legacy stylesheet.
 const css=f.document.querySelector('#ework-grid-workbench-style').textContent
 expect(css).toContain('@layer ework-workbench{\nbody [data-research-canvas][data-ework-grid] [data-research-node-id] :is(')
 expect(css).toContain('scrollbar-gutter:auto!important;scrollbar-width:none!important')
 expect(f.win.getComputedStyle(scroller).overflow).toBe('auto')
 const card=scroller.closest('[data-research-node-id]'),thumb=()=>f.win.getComputedStyle(card).getPropertyValue('--grid-scroll-thumb')
 expect(thumb()).toBe('transparent')
 expect(f.win.getComputedStyle(card).getPropertyValue('--grid-scroll-width')).toBe('none')
 expect(f.win.getComputedStyle(card).getPropertyValue('--grid-scroll-size')).toBe('0px')
 await act(async()=>f.workspace.updateSelection(['a'],'replace'))
 expect(thumb()).toBe('#0000001a')
 expect(f.win.getComputedStyle(card).getPropertyValue('--grid-scroll-width')).toBe('none')
 expect(f.win.getComputedStyle(card).getPropertyValue('--grid-scroll-size')).toBe('0px')
 await act(async()=>f.workspace.updateSelection([],'replace'))
 expect(thumb()).toBe('transparent')
 expect(f.win.getComputedStyle(card).getPropertyValue('--grid-scroll-width')).toBe('none')
 expect(f.win.getComputedStyle(card).getPropertyValue('--grid-scroll-size')).toBe('0px')
})
it('选中超宽表格后在表格下方显示水平滚动条，拖动和键盘滚动不改变内容',async()=>{
 const f=await fixture(true),spec={version:1,type:'table',title:'原始宽表',columns:['名称','日期','完整说明'],rows:[['迈瑞医疗','2026-02-03','完整0与-120万元']]}
 await act(async()=>f.workspace.setArtifacts([{...text('wide-table'),kind:'generated-container',containerPrompt:'原始宽表',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 const card=f.host.querySelector('[data-research-node-id="wide-table"]'),body=card.querySelector('[data-research-preview-body]'),port=card.querySelector('.odyssey-native-table-grid')
 const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height})
 card.getBoundingClientRect=()=>rect(12,100,500,550);body.getBoundingClientRect=()=>rect(12,134,500,480);port.getBoundingClientRect=()=>rect(22,184,480,180)
 Object.defineProperties(port,{clientWidth:{value:480},scrollWidth:{value:900},clientHeight:{value:180},scrollHeight:{value:180}})
 port.style.overflowX='auto';f.canvas.__eworkScrollbars();await act(async()=>new Promise(r=>setTimeout(r,40)))
 expect(card.querySelector('[data-workbench-scroll-overlay]').hidden).toBe(true)
 await act(async()=>f.workspace.updateSelection(['wide-table'],'replace'));f.canvas.__eworkScrollbars();await act(async()=>new Promise(r=>setTimeout(r,60)))
 const bar=card.querySelector('[data-workbench-scrollbar="x"]');expect(bar).not.toBeNull();expect(bar.hidden).toBe(false);expect(bar.closest('[data-workbench-scroll-overlay]').hidden).toBe(false)
 expect(bar.style.top).toBe('254px');expect(bar.style.width).toBe('468px')
 await f.event('keydown',bar,{key:'ArrowRight'});expect(port.scrollLeft).toBe(40)
 bar.getBoundingClientRect=()=>rect(28,354,468,10)
 await f.event('pointerdown',bar,{button:0,pointerId:301,clientX:70,clientY:358});await f.event('pointermove',bar,{pointerId:301,clientX:160,clientY:358});await f.event('pointerup',bar,{pointerId:301,clientX:160,clientY:358})
 expect(port.scrollLeft).toBeGreaterThan(100);expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
 await act(async()=>f.workspace.updateSelection([],'replace'));await act(async()=>new Promise(r=>setTimeout(r,50)));expect(bar.closest('[data-workbench-scroll-overlay]').hidden).toBe(true)
})
it('三种看板样式仅保存本看板展示偏好，不改变内容、布局、选择或撤销记录',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('style-a')]))
 await act(async()=>f.workspace.updateSelection(['style-a'],'replace'))
 const before=structuredClone(f.workspace.getSnapshot()),cells=f.workspace.getWorkbenchCells(),theme=f.document.body.getAttribute('data-ds-dark-theme')
 for(const mode of ['light','enterprise','dark']){
  await f.event('click',f.document.querySelector('[data-workbench-style-option="'+mode+'"]'))
  expect(f.canvas.dataset.workbenchStyle).toBe(mode);expect(f.document.body.getAttribute('data-ds-dark-theme')).toBe(theme)
  expect(f.workspace.getSnapshot().artifacts).toEqual(before.artifacts);expect(f.workspace.getSnapshot().selection).toEqual(before.selection);expect(f.workspace.getWorkbenchCells()).toEqual(cells)
  expect(f.document.querySelector('[data-workbench-style-option="'+mode+'"]').getAttribute('aria-checked')).toBe('true')
 }
 const restored=f.bundle.createResearchWorkspaceSession(f.win.localStorage,'grid-test');expect(restored.getWorkbenchStyle()).toBe('dark')
 const other=f.bundle.createResearchWorkspaceSession(f.win.localStorage,'other-board');expect(other.getWorkbenchStyle()).toBeNull()
 expect(f.workspace.setWorkbenchStyle('unknown')).toBe(false)
 await act(async()=>f.workspace.undo());expect(f.workspace.getSnapshot().artifacts).toEqual([])
})
it('看板样式在新组件与嵌入页面载入时继承，切换不替换iframe',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('style-a')]))
 const card=f.host.querySelector('[data-research-node-id="style-a"]'),frame=f.document.createElement('iframe');frame.dataset.researchHtmlArtifact='';card.append(frame)
 const messages=[],send=vi.spyOn(frame.contentWindow,'postMessage').mockImplementation(d=>messages.push(d));await act(async()=>f.workspace.setWorkbenchStyle('enterprise'))
 expect(messages).toContainEqual({type:'sherlock-workbench-style',mode:'enterprise',controlTheme:'light'})
 const parent=frame.parentElement;await act(async()=>f.workspace.setWorkbenchStyle('dark'));expect(frame.parentElement).toBe(parent)
 messages.length=0;await f.event('load',frame);expect(messages).toContainEqual({type:'sherlock-workbench-style',mode:'dark',controlTheme:'light'})
 await act(async()=>f.workspace.createContainerDraft());expect(f.canvas.dataset.workbenchStyle).toBe('dark');send.mockRestore()
})
it('主题扫光只在实际切换时出现，连续切换替换旧动效并清理，减少动态效果时静止切换',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('motion-a')]))
 const overlays=()=>f.document.querySelectorAll('.ew-workbench-style-transition')
 expect(overlays()).toHaveLength(0)
 await act(async()=>f.workspace.setWorkbenchStyle('dark'));expect(overlays()).toHaveLength(1)
 const first=overlays()[0];expect(first.getAttribute('aria-hidden')).toBe('true');expect(first.style.pointerEvents).toBe('none');expect(first.style.left).toBe('0px');expect(first.style.width).toBe('1000px')
 await act(async()=>f.workspace.setWorkbenchStyle('dark'));expect(overlays()[0]).toBe(first)
 await act(async()=>f.workspace.setWorkbenchStyle('enterprise'));expect(overlays()).toHaveLength(1);expect(first.isConnected).toBe(false);expect(f.canvas.dataset.workbenchTransition).toBe('enterprise')
 await vi.waitFor(()=>expect(overlays()).toHaveLength(0),{timeout:1000});expect(f.canvas.hasAttribute('data-workbench-transition')).toBe(false)
 f.win.matchMedia=query=>({matches:query==='(prefers-reduced-motion: reduce)',addEventListener(){},removeEventListener(){}})
 await act(async()=>f.workspace.setWorkbenchStyle('light'));expect(f.canvas.dataset.workbenchStyle).toBe('light');expect(overlays()).toHaveLength(0);expect(f.canvas.hasAttribute('data-workbench-transition')).toBe(false)
})
it('模式组支持方向键且与组件工具选中相互独立，英文新增菜单与提示随语言变化',async()=>{
 const f=await fixture(true);await act(async()=>f.workspace.setArtifacts([text('style-a')]))
 await f.event('click',f.document.querySelector('[data-research-global-container]'))
 const tool=f.canvas.dataset.canvasTool
 await f.event('keydown',f.document.querySelector('[data-workbench-style-option=light]'),{key:'ArrowRight'})
 expect(f.canvas.dataset.workbenchStyle).toBe('dark');expect(f.canvas.dataset.canvasTool).toBe(tool)
 await act(async()=>{f.document.documentElement.dataset.odysseyLocale='en';await new Promise(r=>setTimeout(r,20))})
 expect(f.document.querySelector('[data-workbench-style-option=enterprise]').getAttribute('aria-label')).toBe('EFund mode')
 await f.event('click',f.document.querySelector('[data-workbench-more="style-a"]'),{clientX:600,clientY:100})
 const menu=f.document.querySelector('.ew-grid-menu');expect(menu.textContent).toContain('Duplicate component');expect(menu.textContent).toContain('Create from selection');expect(menu.textContent).not.toMatch(/[\u4e00-\u9fff]/)
})

it('笔记完整长草稿随所属卡片保留，仅当前版本正文链接进入宿主来源面板',async()=>{
 const {researchInteractionVersion}=await import('../packages/dsh-research-task-runtime/html-artifact.js'),f=await fixture(true);
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'note',title:'研究笔记',asOf:'本地虚构材料',content:'原始材料'})));
 const state={content:'中'.repeat(10000)+'\n[新来源](https://example.com/new)',view:'preview',align:'left'};
 await act(async()=>f.workspace.setArtifacts([{...text('owned-note'),kind:'generated-container',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerPrompt:'可编辑Markdown笔记',containerSpec:spec,config:{sharedComponentState:{version:researchInteractionVersion(spec.html),state,revision:1}}}]));
 expect(f.workspace.getSnapshot().artifacts[0].config.sharedComponentState.state.content).toBe(state.content);
 const frame=f.host.querySelector('[data-research-html-artifact]'),ownWindow={postMessage:vi.fn()};Object.defineProperty(frame,'contentWindow',{configurable:true,value:ownWindow});
 const request=async(url,source=ownWindow)=>act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source,data:{type:'sherlock-source-request',url}})));
 await request('https://attacker.invalid');expect(f.host.textContent).not.toContain('打开来源：');
 await request('https://example.com/new',f.win);expect(f.host.textContent).not.toContain('打开来源：');
 await request('https://example.com/new');expect(f.host.textContent).toContain('打开来源：新来源');
 const restored=f.bundle.createResearchWorkspaceSession(f.win.localStorage,'grid-test');expect(restored.getSnapshot().artifacts[0].config.sharedComponentState.state.content).toBe(state.content);
})
it('YouTube与嵌入网页最小表单优先使用内部滚动，不被画布截获',async()=>{
 for(const type of ['youtube','iframe']){
  const f=await fixture(true),id=type+'-scroll',spec={version:1,type,title:'最小表单',url:null}
  await act(async()=>{f.workspace.setArtifacts([{...text(id),kind:'generated-container',containerPrompt:'网址',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]);f.workspace.updateSelection([id],'replace')})
  if(type==='iframe')await f.event('click',f.host.querySelector('[data-iframe-add]'))
  const preset=f.host.querySelector('[data-research-'+type+'-preset]')
  Object.defineProperties(preset,{scrollHeight:{value:220},clientHeight:{value:142}});preset.style.overflowY='auto'
  const e=await f.event('wheel',preset.querySelector('form'),{deltaX:0,deltaY:24})
  expect(e.defaultPrevented,type+'内部滚动').toBe(false)
 }
})
it('YouTube客户端等待现有网页授权桥后才挂载官方播放器，失败可重试',async()=>{
 let resolve,failed=false;const authorize=vi.fn(()=>failed?Promise.reject(Error('blocked')):new Promise(r=>resolve=r)),release=vi.fn(async()=>({ok:true}))
 const f=await fixture(true,{researchLinkFrame:{authorize,release}}),spec={version:1,type:'youtube',title:'原生授权视频',url:'https://youtu.be/M7lc1UVf-VE'}
 await act(async()=>f.workspace.setArtifacts([{...text('youtube-authorized'),kind:'generated-container',containerPrompt:'视频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 expect(authorize).toHaveBeenCalledWith({sessionId:'grid-test',nodeId:'youtube-authorized',url:'https://www.youtube.com/embed/M7lc1UVf-VE?autoplay=0&controls=1&playsinline=1'})
 expect(f.host.querySelector('iframe[data-youtube-player]')).toBeNull()
 await act(async()=>resolve({url:'https://www.youtube.com/embed/M7lc1UVf-VE?autoplay=0&controls=1&playsinline=1',frameName:'sherlock-research-link-'+'a'.repeat(32)}))
 expect(f.host.querySelector('iframe[data-youtube-player]').name).toBe('sherlock-research-link-'+'a'.repeat(32))
 failed=true;await f.event('click',Array.from(f.host.querySelectorAll('button')).find(b=>b.textContent==='重试载入'))
 expect(f.host.querySelector('iframe[data-youtube-player]')).toBeNull()
 expect(f.host.textContent).toContain('视频载入授权失败，请重试或打开原视频。')
 expect(release).toHaveBeenCalledWith({sessionId:'grid-test',nodeId:'youtube-authorized'})
 failed=false;await f.event('click',Array.from(f.host.querySelectorAll('button')).find(b=>b.textContent==='重试载入'))
 await act(async()=>resolve({url:'https://attacker.invalid/',frameName:'sherlock-research-link-'+'b'.repeat(32)}))
 expect(f.host.querySelector('iframe[data-youtube-player]')).toBeNull()
 expect(f.host.textContent).toContain('视频载入授权失败，请重试或打开原视频。')
})
it('YouTube实际宿主输入原视频后保留同一节点，官方播放器不自动播放且允许重试',async()=>{
 const f=await fixture(true),spec={version:1,type:'youtube',title:'原视频标题',url:null,description:'用户原说明'}
 await act(async()=>f.workspace.setArtifacts([{...text('youtube-own'),kind:'generated-container',containerPrompt:'视频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 const input=f.host.querySelector('[aria-label="YouTube视频网址"]');expect(input).not.toBeNull();input.focus()
 input.value='https://youtube.com.attacker.invalid/watch?v=M7lc1UVf-VE';await f.event('keydown',input,{key:'Enter',keyCode:13,isComposing:false})
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
 expect(f.host.textContent).toContain('完整YouTube视频网址')
 input.value='https://www.youtube.com/watch?v=M7lc1UVf-VE&t=1m30s#original'
 await f.event('keydown',input,{key:'Enter',keyCode:229,isComposing:true});expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
 await f.event('keydown',input,{key:'Enter',keyCode:13,isComposing:false})
 const frame=f.host.querySelector('iframe[data-youtube-player]');expect(frame).not.toBeNull()
 expect(frame.src).toBe('https://www.youtube.com/embed/M7lc1UVf-VE?autoplay=0&controls=1&playsinline=1&start=90')
 expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin')
 expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-presentation')
 expect(frame.hasAttribute('allowfullscreen')).toBe(true)
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual({...spec,url:input.value})
 const refresh=await f.host.querySelector('[data-workbench-refresh="youtube-own"]').__eworkRefresh()
 expect(refresh).toEqual({message:'已请求重新载入视频'});expect(f.generation.generate).not.toHaveBeenCalled()
 const settings=f.host.querySelector('[data-research-container-more]').__eworkWorkbenchSettings
 expect(settings.map(a=>a.label)).toEqual(['修改视频网址','重新载入视频','打开原视频'])
 const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('grid-test');expect(restored.getSnapshot().artifacts).toHaveLength(1);expect(restored.getSnapshot().artifacts[0].containerSpec.url).toBe(input.value)
})
it('YouTube观看与浏览器登录分别打开原视频和Google帐号选择，保留同一视频时点',async()=>{
 const f=await fixture(true),url='https://www.youtube.com/watch?v=M7lc1UVf-VE&t=1m30s#original',spec={version:1,type:'youtube',title:'登录复验',url};
 const opened=[];f.win.open=(target)=>{opened.push(target);return null};
 await act(async()=>f.workspace.setArtifacts([{...text('youtube-login'),kind:'generated-container',containerPrompt:'视频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]));
 const buttons=Array.from(f.host.querySelectorAll('.ew-youtube-actions button'));
 expect(buttons.map(b=>b.textContent)).toEqual(['重试载入','在浏览器观看','在浏览器登录']);
 await f.event('click',buttons.find(b=>b.textContent==='在浏览器观看'));expect(opened.pop()).toBe(url);
 await f.event('click',buttons.find(b=>b.textContent==='在浏览器登录'));
 const login=new URL(opened.pop());expect(login.origin).toBe('https://accounts.google.com');expect(login.pathname).toBe('/AccountChooser');
 const resume=new URL(login.searchParams.get('continue'));expect(resume.pathname).toBe('/signin');expect(resume.searchParams.get('next')).toBe('/watch?v=M7lc1UVf-VE&t=90s');
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec);
 expect(f.host.querySelector('iframe[data-youtube-player]').src).toContain('start=90');
})
it('YouTube系统播放器在同一组件打开登录窗口，不把浏览器登录或返回导航当成已登录',async()=>{
 const authorize=vi.fn(async value=>({url:value.url,frameName:'sherlock-research-link-'+'b'.repeat(32)})),login=vi.fn(async()=>({opened:true})),hide=vi.fn(async()=>({ok:true})),update=vi.fn(async()=>({loading:false,error:'',image:'',imageRevision:0,loginStatus:'returned'}));
 const f=await fixture(true,{researchLinkFrame:{authorize,release:vi.fn()},researchYoutube:{available:async()=>({available:true}),login,hide,update}}),spec={version:1,type:'youtube',title:'本人原视频',url:'https://youtu.be/M7lc1UVf-VE?t=90s'};
 await act(async()=>f.workspace.setArtifacts([{...text('youtube-system'),kind:'generated-container',containerPrompt:'视频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]));
 await act(async()=>{});expect(f.host.querySelector('iframe[data-youtube-player]')).toBeNull();expect(f.host.querySelector('[data-youtube-system-player]')).not.toBeNull();
 const surface=f.host.querySelector('[data-youtube-system-player]'),card=surface.closest('[data-research-node-id]');surface.getBoundingClientRect=()=>({left:100,top:100,right:580,bottom:370,width:480,height:270});card.setAttribute('data-selected','true');f.document.elementFromPoint=()=>surface;
 await vi.waitFor(async()=>{await act(async()=>{});expect(update).toHaveBeenCalledWith(expect.objectContaining({nodeId:'youtube-system',url:'https://www.youtube.com/embed/M7lc1UVf-VE?autoplay=0&controls=1&playsinline=1&start=90',active:true,bounds:{x:100,y:100,width:480,height:270}}))},{timeout:1000,interval:50});
 const button=Array.from(f.host.querySelectorAll('.ew-youtube-actions button')).find(b=>b.textContent==='登录 YouTube');expect(button).toBeDefined();await f.event('click',button);expect(login).toHaveBeenCalledWith({sessionId:'grid-test',nodeId:'youtube-system'});
 expect(f.host.textContent).toContain('同一系统会话');expect(f.host.textContent).not.toContain('已登录');expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec);
 await act(async()=>f.workspace.setArtifacts([]));expect(hide).toHaveBeenCalledWith({sessionId:'grid-test',nodeId:'youtube-system'});
})
it('YouTube共享只读可播放但不进入编辑，刷新不冒充数据更新',async()=>{
 let shared=false;const f=await fixture(false,{researchBoards:{isSharedSession:()=>shared}}),spec={version:1,type:'youtube',title:'只读原视频',url:'https://youtu.be/M7lc1UVf-VE',subtitles:'已取得的完整字幕'}
 f.workspace.setArtifacts([{...text('youtube-readonly'),kind:'generated-container',containerPrompt:'视频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]);shared=true;await f.render()
 expect(f.host.querySelector('iframe[data-youtube-player]')).not.toBeNull()
 expect(f.host.querySelector('.odyssey-data-stamp')).toBeNull()
 await act(async()=>f.host.querySelector('[data-research-youtube-preset]').__eworkEditYoutube());expect(f.host.querySelector('form')).toBeNull()
 expect(f.host.textContent).toContain('已取得的完整字幕');expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('YouTube控件跟随实际画布三种主题，不继承应用深色控件背景',async()=>{
 const f=await fixture(true),spec={version:1,type:'youtube',title:'视频主题复验',url:null}
 f.win.document.body.setAttribute('data-ds-dark-theme','')
 await act(async()=>f.workspace.setArtifacts([{...text('youtube-style'),kind:'generated-container',containerPrompt:'视频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 for(const [mode,expected] of [['dark','#25242a'],['light','#e9ebef'],['enterprise','#e9ebef']]){
  await act(async()=>f.workspace.setWorkbenchStyle(mode))
  const styles=new Window();styles.document.body.setAttribute('data-ds-dark-theme','');styles.document.body.innerHTML=f.host.innerHTML
  expect(styles.getComputedStyle(styles.document.querySelector('.ew-youtube-preset')).getPropertyValue('--youtube-control').trim(),mode).toBe(expected)
  await styles.happyDOM.abort()
 }
})
it('YouTube整理按播放器实际宽度恢复16比9可读高度，并保留原视频',async()=>{
 const f=await fixture(true),spec={version:1,type:'youtube',title:'视频宽度复验',url:'https://youtu.be/M7lc1UVf-VE'}
 await act(async()=>f.workspace.setArtifacts([{...text('youtube-arrange'),kind:'generated-container',containerPrompt:'视频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 f.host.querySelector('[data-youtube-player]').getBoundingClientRect=()=>({left:0,top:38,right:900,bottom:180,width:900,height:142})
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 await act(async()=>new Promise(resolve=>setTimeout(resolve,700)))
 expect(f.workspace.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(597)
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('派生预置整理测量包含完整分支盒与展开原文，不仅测量叶节点',async()=>{
 const f=await fixture(true),spec={version:1,type:'mind-map',title:'导图高度复验',content:'# 来源\n- 事实\n  - 0\n- 局限\n  - 原因未提供',source:{title:'本人材料',text:'来源完整原文'}}
 await act(async()=>f.workspace.setArtifacts([{...text('derived-fit'),kind:'generated-container',generationStatus:'completed',containerPrompt:'导图',refreshMinutes:0,containerSpec:spec}]))
 const preset=f.host.querySelector('[data-research-derived-preset]');Object.defineProperties(preset,{offsetHeight:{configurable:true,value:600},scrollHeight:{configurable:true,value:600}})
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 await vi.waitFor(async()=>{await act(async()=>{});expect(f.workspace.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(638)},{timeout:1500,interval:50})
})
it('YouTube整理保留展开说明和字幕的实际高度，不按固定摘要高度截断',async()=>{
 const f=await fixture(true),spec={version:1,type:'youtube',title:'完整字幕复验',url:'https://youtu.be/M7lc1UVf-VE',subtitles:'第一行原字幕\n第二行原字幕'}
 await act(async()=>f.workspace.setArtifacts([{...text('youtube-details'),kind:'generated-container',containerPrompt:'视频',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 const loaded=f.host.querySelector('.ew-youtube-loaded');Object.defineProperty(loaded,'offsetHeight',{configurable:true,value:720})
 f.host.querySelector('details').open=true
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 await act(async()=>new Promise(resolve=>setTimeout(resolve,700)))
 expect(f.workspace.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(758)
 expect(f.host.querySelector('pre').textContent).toBe(spec.subtitles)
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('YouTube补丁重复安装不重复原生类型，不放开生成HTML的iframe限制',async()=>{
 const {patchYoutubeClient}=await import('../scripts/lib/youtube-client.mjs'),{patchIframeClient}=await import('../scripts/lib/iframe-client.mjs')
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const once=patchYoutubeClient(patchIframeClient(source)),twice=patchYoutubeClient(patchIframeClient(once));expect(twice).toBe(once)
 const types=once.match(/const RESEARCH_CONTAINER_TYPES = [^;]+;/)?.[0]
 expect(types.match(/"youtube"/g)).toHaveLength(1);expect(types.match(/"iframe"/g)).toHaveLength(1)
 expect(once).toContain('/<(?:iframe|frame|object|embed)\\b/i')
})
it('嵌入网页在实际宿主空状态添加网址，保存后仍是同一组件且会话重建保留',async()=>{
 const f=await fixture(true),spec={version:1,type:'iframe',title:'网页原标题',url:null,description:'原始说明'}
 await act(async()=>f.workspace.setArtifacts([{...text('iframe-own'),kind:'generated-container',containerPrompt:'嵌入网页',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 expect(f.host.textContent).toContain('尚未添加网址')
 await f.event('click',f.host.querySelector('[data-iframe-add]'))
 const input=f.host.querySelector('[aria-label="网页网址"]');expect(input).not.toBeNull()
 input.value='javascript:alert(1)';await f.event('submit',f.host.querySelector('form'))
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec);expect(f.host.textContent).toContain('HTTP')
 input.value='https://example.org/demo?q=0#original';await f.event('submit',f.host.querySelector('form'))
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual({...spec,url:input.value})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1);expect(f.generation.generate).not.toHaveBeenCalled()
 const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('grid-test');expect(restored.getSnapshot().artifacts[0].containerSpec).toEqual({...spec,url:input.value})
 const card=f.host.querySelector('[data-research-node-id="iframe-own"]'),trigger=card.querySelector('[data-research-container-more]')
 expect(trigger.__eworkWorkbenchSettings.map(a=>a.label)).toContain('修改网址')
 expect(trigger.__eworkWorkbenchSettings.map(a=>a.label)).not.toContain('编辑需求')
})
it('嵌入网页整理后恢复可读高度，不将原生网页截图的旧视口当成内容尺寸',async()=>{
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(async()=>({image:'',error:''})),hideNative:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge})
 await act(async()=>f.workspace.setArtifacts([{...text('iframe-arrange'),kind:'generated-container',containerPrompt:'网页',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,width:280,height:180,containerSpec:{version:1,type:'iframe',title:'已缩小的网页',url:'https://example.org/'}}]))
 const card=f.host.querySelector('[data-research-node-id="iframe-arrange"]'),image=card.querySelector('[data-research-native-web] img')
 expect(image).not.toBeNull()
 card.getBoundingClientRect=()=>({left:0,top:0,right:280,bottom:180,width:280,height:180})
 image.getBoundingClientRect=()=>({left:0,top:38,right:280,bottom:180,width:280,height:142})
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'))
 // The delayed second content-fit pass must also ignore the old viewport.
 await act(async()=>new Promise(resolve=>setTimeout(resolve,700)))
 const node=f.workspace.getSnapshot().artifacts[0]
 expect(node.height).toBeGreaterThanOrEqual(340)
 expect(node.containerSpec.url).toBe('https://example.org/')
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
})
it('嵌入网页网址输入支持回车校验与保存，中文组合输入不提前提交',async()=>{
 const f=await fixture(true),spec={version:1,type:'iframe',title:'键盘网页复验',url:null,description:'保留原说明'}
 await act(async()=>f.workspace.setArtifacts([{...text('iframe-keyboard'),kind:'generated-container',containerPrompt:'网页',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 await f.event('click',f.host.querySelector('[data-iframe-add]'))
 const input=f.host.querySelector('[aria-label="网页网址"]')
 input.value='javascript:alert(1)';await f.event('keydown',input,{key:'Enter',keyCode:13,nativeEvent:{isComposing:false}})
 expect(f.host.textContent).toContain('HTTP');expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
 input.value='https://EXAMPLE.org/keyboard?q=0#original'
 await f.event('keydown',input,{key:'Enter',keyCode:229,isComposing:true})
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
 const event=await f.event('keydown',input,{key:'Enter',keyCode:13,isComposing:false})
 expect(event.defaultPrevented).toBe(true)
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual({...spec,url:input.value})
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1);expect(f.generation.generate).not.toHaveBeenCalled()
})
it('嵌入网页共享只读禁止网址修改但仍允许查看与浏览器打开',async()=>{
 let shared=false;const f=await fixture(false,{researchBoards:{isSharedSession:()=>shared}}),spec={version:1,type:'iframe',title:'只读网页',url:null}
 f.workspace.setArtifacts([{...text('iframe-readonly'),kind:'generated-container',containerPrompt:'网页',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]);shared=true;await f.render()
 expect(f.host.querySelector('[data-iframe-add]').disabled).toBe(true)
 await act(async()=>f.host.querySelector('[data-research-iframe-preset]').__eworkEditIframe());expect(f.host.querySelector('form')).toBeNull()
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('嵌入网页按钮跟随画布三种模式而非应用深色主题',async()=>{
 const f=await fixture(true),spec={version:1,type:'iframe',title:'主题切换复验',url:null}
 f.win.document.body.setAttribute('data-ds-dark-theme','')
 await act(async()=>f.workspace.setArtifacts([{...text('iframe-style'),kind:'generated-container',containerPrompt:'网页',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 for(const [mode,expected] of [['dark','#25242a'],['light','#e9ebef'],['enterprise','#e9ebef']]){
  await act(async()=>f.workspace.setWorkbenchStyle(mode))
  expect(f.canvas.dataset.workbenchStyle).toBe(mode)
  // Reparse the rendered snapshot to avoid happy-dom selector caches across React updates.
  const styles=new Window();styles.document.body.setAttribute('data-ds-dark-theme','')
  styles.document.body.innerHTML=f.host.innerHTML
  expect(styles.getComputedStyle(styles.document.querySelector('.ew-iframe-preset')).getPropertyValue('--iframe-control').trim(),mode).toBe(expected)
  await styles.happyDOM.abort()
 }
})
it('嵌入网页生产补丁幂等且不解除HTML沙盒限制',async()=>{
 const {patchIframeClient}=await import('../scripts/lib/iframe-client.mjs'),f=await fixture(),once=patchIframeClient(f.source)
 expect(patchIframeClient(once)).toBe(once);expect(once.match(/const researchIframeSinks=new Map/g)).toHaveLength(1)
 expect(once).toContain('/<(?:iframe|frame|object|embed)');expect(once).toContain('ODYSSEY_RETAIN_WEB_SESSION')
})
it('嵌入网页刷新只报告重载请求，往返会话隐藏原生网页而不销毁',async()=>{
 const bridge={resolveEngine:vi.fn(async()=>({engine:'native'})),updateNative:vi.fn(async()=>({image:'',error:''})),hideNative:vi.fn(async()=>{}),releaseNative:vi.fn(async()=>{}),releaseSession:vi.fn(async()=>{}),release:vi.fn(async()=>{})}
 const f=await fixture(true,{researchLinkFrame:bridge}),spec={version:1,type:'iframe',title:'网页原来源',url:'https://example.org/demo'}
 await act(async()=>f.workspace.setArtifacts([{...text('iframe-live'),kind:'generated-container',containerPrompt:'网页',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,containerSpec:spec}]))
 expect(bridge.resolveEngine).toHaveBeenCalledWith({sessionId:'grid-test',nodeId:'iframe-live',url:spec.url,preferNative:true})
 const native=f.host.querySelector('[data-research-native-web]'),reload=vi.fn(native.__eworkReloadWeb);native.__eworkReloadWeb=reload
 let result;await act(async()=>{result=await f.host.querySelector('[data-workbench-refresh]').__eworkRefresh()})
 expect(result).toEqual({message:'已请求重新载入网页'});expect(reload).toHaveBeenCalledOnce();expect(f.host.querySelector('.odyssey-data-stamp')).toBeNull()
 await f.render({sessionId:'other',measure:false});f.registry.release('grid-test');await f.render({measure:false})
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec);expect(bridge.hideNative).toHaveBeenCalled();expect(bridge.releaseNative).not.toHaveBeenCalled();expect(bridge.releaseSession).not.toHaveBeenCalled()
})
it.each(['generated-container','generated-mind-map'])('派生导图恢复 %s 的根主题、层级节点与连线，节点编辑不丢来源',async kind=>{
 const f=await fixture(true),content='# 市场资讯\n- 科技\n  - 半导体走弱\n- 宏观\n  - 中间价6.7253',source={title:'加密货币市场资讯',text:'原始冻结资讯',nodeId:'news'}
 const spec={version:1,type:'mind-map',title:'思维导图',content,source}
 const node={...text('restored-map'),kind,generationStatus:'completed',...(kind==='generated-container'?{containerPrompt:'生成导图',refreshMinutes:0,containerSpec:spec}:{excerpt:content,sourceNodeIds:['news'],generationSources:[{id:'news',type:'artifact',title:source.title,text:source.text}]})}
 await act(async()=>f.workspace.setArtifacts([text('news'),node]))
 const map=f.host.querySelector('[data-research-derived-preset] [data-research-mind-map]')
 expect(map).not.toBeNull();expect(map.querySelector('[data-research-mind-map-depth="0"]').textContent).toBe('市场资讯')
 expect(map.querySelectorAll('[data-research-mind-map-branch]')).toHaveLength(4)
 expect(map.querySelector('[data-research-mind-map-edges] path')).not.toBeNull();expect(f.host.querySelector('.ew-derived-branches')).toBeNull()
 const leaf=[...map.querySelectorAll('[data-research-mind-map-node]')].find(n=>n.textContent==='半导体走弱')
 await f.event('dblclick',leaf);const input=f.host.querySelector('[data-research-mind-map-node-input]');expect(input).not.toBeNull();input.value='半导体回升'
 await f.event('keydown',input,{key:'Enter',keyCode:13})
 const stored=f.workspace.getSnapshot().artifacts.find(n=>n.id===node.id)
 expect(kind==='generated-container'?stored.containerSpec.content:stored.excerpt).toContain('半导体回升')
 expect(kind==='generated-container'?stored.containerSpec.source.text:stored.generationSources[0].text).toBe(source.text)
 const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('grid-test').getSnapshot().artifacts.find(n=>n.id===node.id)
 expect(restored).toEqual(stored)
})
it('派生导图长节点完整显示，双击后未修改不丢失尾部或原格式',async()=>{
 const f=await fixture(true),label='完整研究证据'.repeat(40)+'最后证据END',content='# 根主题\n- **'+label+'**',source={title:'冻结材料',text:'不可改变的原文'},spec={version:1,type:'mind-map',title:'长节点',content,source}
 await act(async()=>f.workspace.setArtifacts([{...text('long-map'),kind:'generated-container',generationStatus:'completed',containerPrompt:'导图',refreshMinutes:0,containerSpec:spec}]))
 const leaf=f.host.querySelector('[data-research-mind-map-depth="1"]');expect(leaf.textContent).toContain('最后证据END')
 await f.event('dblclick',leaf);const input=f.host.querySelector('textarea');expect(input.value).toContain('最后证据END')
 await f.event('keydown',input,{key:'Enter',keyCode:13})
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
 await f.event('dblclick',f.host.querySelector('[data-research-mind-map-depth="1"]'));const edit=f.host.querySelector('textarea');edit.value=label+'已修订';await f.event('keydown',edit,{key:'Enter',keyCode:13})
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec.content).toContain('最后证据END已修订')
})
it('派生预置完整呈现超过48个导图节点，编辑保留来源和同一节点',async()=>{
 const f=await fixture(true),content='# 本人材料\n'+Array.from({length:60},(_,i)=>'- 分支'+i+'\n  - 原数值 '+(i===0?'0':-i)).join('\n')
 const spec={version:1,type:'mind-map',title:'本人材料导图',content,source:{title:'原始材料',text:'原始冻结正文，不被结果编辑覆盖'}}
 await act(async()=>f.workspace.setArtifacts([{...text('derived-own'),kind:'generated-container',generationStatus:'completed',containerPrompt:'仅根据原始材料创建',refreshMinutes:0,containerSpec:spec}]))
 expect(f.host.querySelectorAll('[data-research-mind-map-depth="1"]')).toHaveLength(60)
 expect(f.host.querySelectorAll('[data-research-mind-map-node]')).toHaveLength(121)
 expect(f.host.textContent).toContain('分支59');expect(f.host.textContent).toContain('原数值 0');expect(f.host.textContent).toContain('原数值 -59')
 const settings=f.host.querySelector('[data-research-container-more]').__eworkWorkbenchSettings
 expect(settings[0].label).toBe('编辑结果');await act(async()=>settings[0].run())
 const editor=f.host.querySelector('[aria-label="编辑派生结果"]');expect(editor.value).toBe(content)
 editor.value='# 修订结果\n- 保留来源\n  - 完整原文';await f.event('keydown',editor,{key:'Enter',metaKey:true})
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual({...spec,content:editor.value})
 const restored=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('grid-test');expect(restored.getSnapshot().artifacts[0].containerSpec.source).toEqual(spec.source)
})
it('派生预置摘要保留标题、最后证据、来源导航以及取消后的原结果',async()=>{
 const f=await fixture(true),content='# 原结论标题\n\n'+('完整来源、日期与事实。\n'.repeat(60))+'\n最后证据END'
 const spec={version:1,type:'summary',title:'总结复验',content,source:{title:'冻结材料',text:'本人提供的冻结正文',nodeId:'source-own'}}
 await act(async()=>f.workspace.setArtifacts([{...text('source-own')},{...text('summary-own'),kind:'generated-container',generationStatus:'completed',containerPrompt:'总结所选组件',refreshMinutes:0,containerSpec:spec}]))
 const preset=f.host.querySelector('[data-research-derived-preset]');expect(preset.textContent).toContain('原结论标题');expect(preset.textContent).toContain('最后证据END')
 expect(preset.querySelector('[data-research-reference-node-id]').getAttribute('data-research-reference-node-id')).toBe('source-own')
 await act(async()=>preset.__eworkEditDerived());const editor=f.host.querySelector('textarea');editor.value='取消修改';await f.event('keydown',editor,{key:'Escape'})
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id==='summary-own').containerSpec).toEqual(spec)
})
it.each(['generated-summary','generated-mind-map'])('派生预置复用一键生成的 %s 冻结来源，整篇编辑不丢最后分支',async kind=>{
 const f=await fixture(true),content=kind==='generated-summary'?'# 结论\n\n2026年收入为0，变化-120。原因未提供。':'# 收入记录\n- 事实\n  - 2026年收入0\n- 待验证\n  - 原因未提供'
 const source={id:'source-own',type:'artifact',title:'本人提供的收入记录',text:'2025年120万元；2026年0万元；变化-120万元。原因未提供。'}
 await act(async()=>f.workspace.setArtifacts([{...text('legacy-derived'),kind,excerpt:content,generationStatus:'completed',generationSources:[source],sourceNodeIds:[source.id]}]))
 const host=f.host.querySelector('[data-research-derived-preset]');expect(host).not.toBeNull();expect(host.textContent).toContain('原因未提供')
 await act(async()=>host.__eworkEditDerived());const input=host.querySelector('textarea');expect(input.value).toBe(content)
 input.value=content+'\n'+(kind==='generated-summary'?'本人补充的复验标记':'- 本人补充的复验标记')
 await f.event('keydown',input,{key:'Enter',metaKey:true})
 const stored=f.workspace.getSnapshot().artifacts[0];expect(stored.excerpt).toContain('本人补充的复验标记');expect(stored.generationSources).toEqual([source]);expect(stored.sourceNodeIds).toEqual([source.id])
})
it('派生预置只读画布拒绝双击与旧编辑入口，但保留来源原文阅读',async()=>{
 let shared=false
 const f=await fixture(true,{researchBoards:{isSharedSession:()=>shared}}),spec={version:1,type:'summary',title:'只读摘要',content:'0 与 -120，原因未提供。',source:{title:'本人材料',text:'0 与 -120，原因未提供。'}}
 await act(async()=>f.workspace.setArtifacts([{...text('derived-readonly'),kind:'generated-container',containerPrompt:'摘要',generationStatus:'completed',refreshMinutes:0,containerSpec:spec}]))
 shared=true;await act(async()=>f.workspace.setCollaborationAccess(false))
 const host=f.host.querySelector('[data-research-derived-preset]');await f.event('dblclick',host);await act(async()=>host.__eworkEditDerived())
 expect(host.querySelector('textarea')).toBeNull();expect(host.querySelector('pre').textContent).toBe(spec.source.text)
 expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('派生预置原生摘要可再次一键总结，冻结当前完整正文而不读取图表字段',async()=>{
 const f=await fixture(true),spec={version:1,type:'summary',title:'收入摘要',content:'# 当前结果\n\n收入0、变化-120；原因未提供。最后证据END',source:{title:'本人材料',text:'旧来源原文'}}
 await act(async()=>f.workspace.setArtifacts([{...text('summary-source'),title:spec.title,kind:'generated-container',generationStatus:'completed',containerPrompt:'总结',refreshMinutes:0,containerSpec:spec}]))
 await f.event('click',f.host.querySelector('[data-workbench-more="summary-source"]'))
 await f.event('click',[...f.document.querySelectorAll('.ew-grid-menu button')].find(n=>n.textContent==='总结提炼'))
 expect(f.generation.generate).toHaveBeenCalledOnce()
 const derived=f.workspace.getSnapshot().artifacts.find(n=>n.kind==='generated-summary')
 expect(derived.generationSources).toEqual([{id:'summary-source',type:'artifact',title:'收入摘要',text:spec.content}])
})
it.each([false,true])('派生预置来源按钮在只读%s时直接聚焦来源，不依赖对话区事件捕获',async readOnly=>{
 let shared=false
 const f=await fixture(true,{researchBoards:{isSharedSession:()=>shared}}),spec={version:1,type:'summary',title:'收入摘要',content:'收入0，变化-120。',source:{title:'本人来源',text:'原文保持',nodeId:'source-own'}}
 await act(async()=>f.workspace.setArtifacts([text('source-own'),{...text('derived-own'),kind:'generated-container',generationStatus:'completed',containerPrompt:'摘要',refreshMinutes:0,containerSpec:spec}]))
 shared=readOnly;if(readOnly)await act(async()=>f.workspace.setCollaborationAccess(false))
 await act(async()=>f.workspace.updateSelection(['derived-own'],'replace'))
 await f.event('click',f.host.querySelector('[data-research-reference-node-id="source-own"]'))
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['source-own'])
 expect(f.workspace.getSnapshot().artifacts.find(n=>n.id==='derived-own').containerSpec).toEqual(spec)
 if(!readOnly){
  await act(async()=>f.workspace.removeNodes(['source-own']))
  await f.event('click',f.host.querySelector('[data-research-reference-node-id="source-own"]'))
  expect(f.host.querySelector('[role="alert"]').textContent).toContain('来源组件已删除或不可用')
  expect(f.host.querySelector('.ew-derived-original pre').textContent).toBe(spec.source.text)
 }
})
