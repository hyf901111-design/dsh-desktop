import {expect,it,vi} from 'vitest'
import {createNoteDataRefreshGuard,noteCapabilityFingerprint} from '../src/preload/notes/data-refresh-guard'

function fixture(){
 const node={id:'node',kind:'generated-container',notePresentation:{theme:'enterprise'},noteSize:{width:320,height:240},containerSpec:{version:1,type:'table',columns:['值'],rows:[[100]]}}
 const block:any={id:'block',type:'research',props:{payload:JSON.stringify(node)}}
 const content:any={title:'保留标题',blocks:[{id:'p',type:'paragraph',content:'保留正文',children:[block]},{id:'other',type:'research',props:{payload:JSON.stringify({...node,id:'other-node'})}}],yjs:''}
 const guard=createNoteDataRefreshGuard(),listener=vi.fn();guard.begin('g',content);guard.subscribe(listener)
 const update=(target=block)=>{target.props.payload=JSON.stringify({...JSON.parse(target.props.payload),containerSpec:{version:1,type:'table',columns:['值'],rows:[[101]]}})}
 return{content,block,guard,listener,update,node}
}
it.each(['block','other'])('advances only the exact host containerSpec delta for nested/other target %s',id=>{
 const f=fixture(),target=id==='block'?f.block:f.content.blocks[1],nodeId=JSON.parse(target.props.payload).id,ticket=f.guard.before(f.content,id,nodeId)
 f.update(target)
 expect(f.guard.applied('g',ticket,f.content)).toBe(true);expect(f.guard.expected('g')).toBe(noteCapabilityFingerprint(f.content))
 expect(f.listener).toHaveBeenCalledOnce();expect(f.listener.mock.calls[0]![0]).toMatchObject({generationId:'g',blockId:id,nodeId,beforePayload:ticket!.beforePayload,afterPayload:target.props.payload})
 expect(f.content.title).toBe('保留标题');expect(f.content.blocks[0].content).toBe('保留正文')
})
it.each(['text','title','geometry','presentation','source','manual-spec'])('does not launder a preceding human %s edit through a later host update',change=>{
 const f=fixture(),baseline=f.guard.expected('g')
 if(change==='text')f.content.blocks[0].content='用户新正文'
 else if(change==='title')f.content.title='用户新标题'
 else{const node=JSON.parse(f.block.props.payload);if(change==='geometry')node.noteSize.width=700;if(change==='presentation')node.notePresentation.theme='dark';if(change==='source')node.sourceText='改来源';if(change==='manual-spec')node.containerSpec.rows=[[999]];f.block.props.payload=JSON.stringify(node)}
 const ticket=f.guard.before(f.content,'block','node');f.update()
 expect(f.guard.applied('g',ticket,f.content)).toBe(false);expect(f.guard.expected('g')).toBe(baseline);expect(f.listener).not.toHaveBeenCalled()
})
it.each(['other-text','title','node','geometry','presentation','block-props','duplicate'])('rejects %s changed inside the proposed transaction',change=>{
 const f=fixture(),baseline=f.guard.expected('g'),ticket=f.guard.before(f.content,'block','node');f.update()
 if(change==='other-text')f.content.blocks[0].content='并发正文'
 else if(change==='title')f.content.title='并发标题'
 else if(change==='block-props')f.block.props.textAlignment='right'
 else if(change==='duplicate')f.content.blocks.push(structuredClone(f.block))
 else{const node=JSON.parse(f.block.props.payload);if(change==='node')node.id='new-node';if(change==='geometry')node.noteSize.width=700;if(change==='presentation')node.notePresentation.theme='dark';f.block.props.payload=JSON.stringify(node)}
 expect(f.guard.applied('g',ticket,f.content)).toBe(false);expect(f.guard.expected('g')).toBe(baseline);expect(f.listener).not.toHaveBeenCalled()
})
it('does not replay old-generation tickets even when a newer generation has the same baseline',()=>{
 const f=fixture(),ticket=f.guard.before(f.content,'block','node');f.guard.begin('g2',f.content);f.update()
 expect(f.guard.applied('g',ticket,f.content)).toBe(false);expect(f.guard.applied('g2',ticket,f.content)).toBe(false);expect(f.guard.expected('g')).toBeUndefined();expect(f.listener).not.toHaveBeenCalled()
})
it('does not publish unchanged, invalid, absent or already-consumed transitions',()=>{
 const f=fixture(),ticket=f.guard.before(f.content,'block','node')
 expect(f.guard.before(f.content,'block','wrong-node')).toBeUndefined();expect(f.guard.before(f.content,'missing','node')).toBeUndefined()
 expect(f.guard.applied('g',ticket,f.content)).toBe(false);expect(f.guard.applied('g',undefined,f.content)).toBe(false)
 f.update();expect(f.guard.applied('g',ticket,f.content,'own-request')).toBe(true);expect(f.guard.applied('g',ticket,f.content)).toBe(false);expect(f.listener).toHaveBeenCalledOnce()
})
it('advances known own mutations only from their exact prior baseline and releases listeners',()=>{
 const f=fixture(),baseline=f.guard.expected('g')!,next='known-own-snapshot'
 f.guard.advanceOwn('wrong',baseline,next);f.guard.advanceOwn('g','wrong',next);expect(f.guard.expected('g')).toBe(baseline)
 const listener=vi.fn(),off=f.guard.subscribe(listener);off();const ticket=f.guard.before(f.content,'block','node');f.update();expect(f.guard.applied('g',ticket,f.content)).toBe(true);expect(listener).not.toHaveBeenCalled()
 f.guard.advanceOwn('g',f.guard.expected('g')!,next);expect(f.guard.expected('g')).toBe(next)
})
