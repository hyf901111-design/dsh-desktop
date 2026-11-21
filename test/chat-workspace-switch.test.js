import {expect,it,vi} from 'vitest'
import {createChatWorkspaceSwitch} from '../scripts/lib/chat-workspace-switch.mjs'
import {createPendingConversation} from '../scripts/lib/pending-conversation.mjs'

function fixture(initial) {
  const views=new Map([['sheet','spreadsheet'],['deck','presentation'],['image','image-factory'],['old','chat']])
  const folders=[{workspaceId:'A',path:'/A',sessionIds:['old']},{workspaceId:'B',path:'/B',sessionIds:['sheet','deck','image']}]
  const state={current:initial,byId:{}},sources=new Map(),ownership=new Map(),archived=[]
  const shell=()=>({snapshot:{draft:'',draftRev:0,imageIds:[],occurrences:[]},
    restoreDraftState(input){this.snapshot={...input,imageIds:this.snapshot.imageIds}},
    addImages(images){this.snapshot.imageIds=[...images];return true},
    commitSend(){this.snapshot={draft:'',draftRev:0,imageIds:[],occurrences:[]}},
    submit:vi.fn(),setResearchContextPreparing(){},notify:vi.fn()})
  function editor(id){if(!sources.has(id))sources.set(id,shell());return sources.get(id)}
  let count=0
  const sessions={list:{getSnapshot:()=>state},create:vi.fn(async({workspaceId})=>{
    const id='new-'+(++count);ownership.set(id,workspaceId);state.byId[id]={id,blank:true};return id
  }),open:vi.fn(id=>{state.current=id})}
  const workspaces={list:{getSnapshot:()=>({items:folders,recentWorkspaceId:'A',phase:'ready'})},
    refresh:vi.fn(async()=>{for(const [id,owner] of ownership){const group=folders.find(x=>x.workspaceId===owner);if(!group.sessionIds.includes(id))group.sessionIds.push(id)}}),
    archiveSession:vi.fn(async id=>{archived.push(id)})}
  const pending=createPendingConversation({makeShell:shell,sessions,workspaces,getInput:editor,setView:(id,view)=>views.set(id,view),onCreated:()=>{}})
  const hooks={sessions,workspaces,pending:()=>pending,shellFor:editor,viewFor:id=>views.get(id),
    isChat:id=>id===undefined||views.get(id)==='chat',beforeCreate:vi.fn(async()=>{}),openChat:id=>views.set(id,'chat')}
  return {state,sessions,workspaces,views,folders,editor,pending,hooks,select:createChatWorkspaceSwitch(hooks)}
}
it('explicitly materializes the chosen folder from a sideless Chat, uses one ID for first send, and creates a new Chat when switching again',async()=>{
 const f=fixture(undefined)
 const draft={draft:'核对原字段',draftRev:7,imageIds:['picture'],occurrences:[{trigger:'@',occurrenceId:2,offset:1}]}
 f.pending.shell.snapshot=structuredClone(draft)
 expect(f.sessions.create).not.toHaveBeenCalled()
 const [first,same]=await Promise.all([f.select(undefined,'B'),f.select(undefined,'B')])
 expect(first).toBe('new-1');expect(same).toBe(first);expect(f.folders[1].sessionIds).toEqual(['sheet','deck','image',first])
 expect(f.editor(first).snapshot).toEqual(draft)
 expect(f.views.get(first)).toBe('chat');expect(f.sessions.open).toHaveBeenCalledExactlyOnceWith(first)
 expect(await f.select(first,'B')).toBe(first);expect(f.sessions.create).toHaveBeenCalledTimes(1)
 const next=await f.select(first,'A')
 expect(f.folders[0].sessionIds).toEqual(['old',next])
 expect(f.views.get(next)).toBe('chat');expect(f.editor(next).snapshot).toEqual(draft);expect(f.editor(first).snapshot.draft).toBe('')
 f.editor(next).submit('queue');expect(f.editor(next).submit).toHaveBeenCalledExactlyOnceWith('queue')
 expect(f.sessions.create.mock.calls).toEqual([[{workspaceId:'B'}],[{workspaceId:'A'}]])
 expect(f.views.get('sheet')).toBe('spreadsheet');expect(f.views.get('deck')).toBe('presentation');expect(f.views.get('image')).toBe('image-factory')
})
it('leaves the source and other pages alone when the user navigates away before creation resolves',async()=>{
 const f=fixture('old');const create=f.sessions.create.getMockImplementation();let resume
 f.sessions.create.mockImplementation(async input=>{await new Promise(resolve=>{resume=resolve});return create(input)})
 f.editor('old').snapshot.draft='应留在源会话'
 const selecting=f.select('old','B')
 await vi.waitFor(()=>expect(resume).toBeTypeOf('function'))
 f.state.current='sheet';resume();expect(await selecting).toBeUndefined()
 expect(f.sessions.open).not.toHaveBeenCalled();expect(f.editor('old').snapshot.draft).toBe('应留在源会话')
 expect(f.views.get('sheet')).toBe('spreadsheet');expect(f.workspaces.archiveSession).toHaveBeenCalledExactlyOnceWith('new-1')
})

it('serializes adjacent selections against their actual destination and keeps subsequent user navigation authoritative',async()=>{
 const f=fixture('old')
 const first=f.select('old','B')
 const second=f.select('old','A')
 expect(await first).toBe('new-1');expect(await second).toBe('new-2')
 expect(f.state.current).toBe('new-2')
 expect(f.sessions.create.mock.calls).toEqual([[{workspaceId:'B'}],[{workspaceId:'A'}]])
 expect(f.workspaces.archiveSession).not.toHaveBeenCalled()
})
