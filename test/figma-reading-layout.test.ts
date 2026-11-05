import { readFile, readdir } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { patchFigmaReadingConversation, patchFigmaReadingTables, patchFigmaReadingWeb } from '../scripts/lib/figma-reading-client.mjs'
const source = patchFigmaReadingConversation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
function fn(name: string) {
  const a=source.indexOf(`function ${name}(`), b=source.indexOf('\n\t\t}',a)
  return source.slice(a,b+5)
}
describe('Figma long-content reading contract',()=>{
  it('detaches the composer when Research has no connected sidebar and reuses it on reopening',()=>{
    const destination=/const destination = (research|sidebarMode) \? researchSidebarSnapshot\.composerHost/.exec(source);
    expect(destination).not.toBeNull();
    const start=destination!.index;
    const end=source.indexOf('const active = document.activeElement;',start);
    const place=runInNewContext('(function('+destination![1]+',researchSidebarSnapshot,centerComposerHostRef,composerPortalHost,publishComposerHeight){const activeView="chat",sessionId="reading-test";'+source.slice(start,end)+'destination.appendChild(composerPortalHost);})');
    const draft={value:'保留的草稿',dataset:{},parentElement:null,remove(){this.parentElement=null}};
    const host={isConnected:true,appendChild(node:any){node.parentElement=this}};
    const center={...host};
    place(false,{}, {current:center},draft,()=>{}); expect(draft.parentElement).toBe(center);
    place(true,{composerHost:null},{current:center},draft,()=>{}); expect(draft.parentElement).toBeNull();
    place(true,{composerHost:host},{current:center},draft,()=>{}); expect(draft.parentElement).toBe(host);
    place(true,{composerHost:{isConnected:false}},{current:center},draft,()=>{}); expect(draft.parentElement).toBeNull();
    expect(draft.value).toBe('保留的草稿');
  });
  it('keeps the reader in history for remote changes and follows only the tail or an explicit submission',()=>{
    const follow=runInNewContext(fn('shouldFollowConversationBottom')+'\nshouldFollowConversationBottom')
    for(const key of ['runningStarted','appendedSteering','tipMoved']) {
      expect(follow({[key]:true,atBottom:false})).toBe(false)
      expect(follow({[key]:true,atBottom:true})).toBe(true)
    }
    expect(follow({appendedUser:true,atBottom:false})).toBe(true)
  })
  it('uses the inner Research message viewport for follow and the central sibling viewport on send',()=>{
    const scroller=runInNewContext(fn('scrollerOf')+'\nscrollerOf')
    const messages={}, outer={}
    expect(scroller({closest:(selector:string)=>selector.includes('.sRp_messages')?messages:outer})).toBe(messages)
    const targets=runInNewContext(fn('composerScrollTargets')+'\ncomposerScrollTargets')
    const port={querySelector:()=>null},pane={querySelector:()=>port}
    expect(targets({closest:(selector:string)=>selector.includes('.wSkVaW_root')?pane:null})).toEqual([port])
  })
  it('installs once in both real bundles and fails visibly on missing renderer anchors',async()=>{
    expect(patchFigmaReadingConversation(source)).toBe(source)
    const primitive=await readFile('node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js','utf8')
    expect(patchFigmaReadingTables(primitive)).toBe(primitive)
    const dir='node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'
    const file=(await readdir(dir)).find(f=>/^index-.*\.js$/.test(f))!
    const web=await readFile(dir+'/'+file,'utf8')
    expect(web).toContain('return f.jsx(OdysseyReadingTable,{children:')
    expect(patchFigmaReadingWeb(web,primitive)).toBe(web)
    expect(()=>patchFigmaReadingConversation('')).toThrow('anchor')
    expect(()=>patchFigmaReadingTables('')).toThrow('renderer')
  })
})
