import {Window} from 'happy-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {openResearchFromImage} from '../scripts/lib/sidebar-new-note.mjs'

let win
afterEach(async()=>{vi.unstubAllGlobals();await win?.happyDOM.abort()})
function setup(project) {
  win=new Window({url:'http://localhost'});const doc=win.document
  vi.stubGlobal('window',win);vi.stubGlobal('document',doc);vi.stubGlobal('CustomEvent',win.CustomEvent)
  doc.body.dataset.workspaceSurface='image-factory'
  const id='image-task-254db677-469d-48a1-8419-479164ca5466'
  const state={ids:[id,'blank-board','ordinary'],byId:{[id]:{title:'新图像'},'blank-board':{title:'新看板'},ordinary:{title:'工作纪要'}},current:id}
  let finish, resolveTask=new Promise(resolve=>{finish=resolve}), latest=0
  const sessions={list:{getSnapshot:()=>state},create:vi.fn(()=>resolveTask),open:vi.fn(s=>{state.current=s})}
  const workspaces={list:{getSnapshot:()=>({items:[{workspaceId:'A',sessionIds:[id]}]})},connectWorkspace:vi.fn(()=>resolveTask)}
  const archived=vi.fn();doc.addEventListener('sherlock:sidebar-home-opened',()=>{
    delete doc.body.dataset.workspaceSurface
    queueMicrotask(()=>{archived(id);state.ids=state.ids.filter(s=>s!==id);if(state.current===id)state.current=undefined})
  });const opened=vi.fn();win.addEventListener('sherlock:conversation-initial-research',e=>opened(e.detail))
  win.dshDesktop={standaloneConversationDirectory:vi.fn(async()=>'/isolated/outputs')}
  const permission=vi.fn(async()=>()=>true);win[Symbol.for('sherlock:conversation-permission-default')]={prepareReuse:permission}
  const start=()=>{const n=++latest;return openResearchFromImage({sessions,workspaces},project,()=>project,()=>latest===n)}
  return {start,state,id,archived,opened,sessions,workspaces,permission,finish(s){state.ids.push(s);finish(s)},cancel(){latest++}}
}
it.each([null,'A',undefined])('opens the board before temporary image cleanup can undo the selected workspace %s',async project=>{
  const f=setup(project),pending=f.start();await Promise.resolve();await Promise.resolve()
  expect(win.document.body.dataset.workspaceSurface).toBe('image-factory');expect(f.archived).not.toHaveBeenCalled()
  if(project===null)expect(f.sessions.create).toHaveBeenCalledWith({cwd:'/isolated/outputs'})
  else {const [projectId,canReuse,permits]=f.workspaces.connectWorkspace.mock.calls[0];expect(projectId).toBe('A');expect([f.id,'blank-board','ordinary'].map(canReuse)).toEqual([false,true,false]);expect(permits()).toBe(true)}
  f.finish('new-board');await pending;await Promise.resolve()
  expect(f.state.current).toBe('new-board');expect(f.archived).toHaveBeenCalledWith(f.id)
  expect(f.opened).toHaveBeenCalledExactlyOnceWith({sessionId:'new-board',newResearch:true})
})
it.each(['later-home','later-session','later-app'])('gives priority to %s when resolving an earlier board request',async action=>{
  const f=setup(null),pending=f.start();await Promise.resolve();await Promise.resolve()
  if(action==='later-home')f.cancel()
  if(action==='later-session')f.state.current='ordinary'
  if(action==='later-app')win.document.body.dataset.workspaceSurface='browser'
  f.finish('late-board');await pending
  expect(f.sessions.open).not.toHaveBeenCalled();expect(f.opened).not.toHaveBeenCalled();expect(f.archived).not.toHaveBeenCalled()
})
