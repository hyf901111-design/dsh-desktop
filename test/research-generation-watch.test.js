import { describe, expect, it, vi, afterEach } from 'vitest'
import { installResearchGenerationWatch, patchResearchGenerationWatch } from '../scripts/lib/research-generation-watch.mjs'
import { readFile } from 'node:fs/promises'
import { createSourceFile, ScriptTarget, ScriptKind, forEachChild, isMethodDeclaration } from 'typescript'
import { parseResearchContainerSpec } from '../packages/dsh-research-task-runtime/artifact-validator.js'
import { generationProgressOnly } from '../scripts/lib/generation-progress-persistence.mjs'
afterEach(() => vi.useRealTimers())
it('keeps planned cards alive during slow acquisition and attaches the eventual task',async()=>{
 vi.useFakeTimers();vi.setSystemTime(100000);
 const node={id:'card',generationStatus:'queued',generationStartedAt:90000};
 const inspect=vi.fn(async()=>({canvasNodeId:'card',state:'queued',pending:true}));
 const workspace={getSnapshot:()=>({artifacts:[node]}),subscribe:()=>()=>{},failGeneration:vi.fn(),attachGenerationTask:vi.fn((id,result)=>{Object.assign(node,{generationTaskId:result.taskId,generationStatus:result.state});return true})};
 const dispose=installResearchGenerationWatch({workspace,sessionId:'parent',inspect});
 await vi.advanceTimersByTimeAsync(120000);
 expect(workspace.failGeneration).not.toHaveBeenCalled();
 inspect.mockResolvedValue({...completed,state:'running'});
 await vi.advanceTimersByTimeAsync(400);
 expect(node.generationTaskId).toBe('task');
 expect(inspect.mock.calls[0][0].createdAfter).toBe(90000);
 dispose();
});
it('gives restored unbound cards a recovery interval before failing missing receipts',async()=>{
 vi.useFakeTimers();vi.setSystemTime(100000);
 const node={id:'card',generationStatus:'queued'},failGeneration=vi.fn();
 const dispose=installResearchGenerationWatch({workspace:{getSnapshot:()=>({artifacts:[node]}),subscribe:()=>()=>{},failGeneration},sessionId:'parent',inspect:async()=>{throw Object.assign(Error('missing'),{status:404})}});
 await vi.advanceTimersByTimeAsync(29000);
 expect(failGeneration).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1400);
 expect(failGeneration).toHaveBeenCalledWith('card',expect.any(String));
 dispose();
});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function setup(inspect, extra = {}) {
  const events = new EventTarget(), listeners = new Set()
  const snapshot = { artifacts: [{ id: 'card', generationTaskId: 'task', generationStatus: 'running', generationLastSeq: 9, containerPrompt: '保留当前业务', x: 40, width: 720 }] }
  const workspace = { getSnapshot: () => snapshot, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) }, applyGenerationInspection: vi.fn((id, result) => {
    const node = snapshot.artifacts.find(n => n.id === id)
    if (node.generationTaskId !== result.taskId || !['queued','running','retrying'].includes(node.generationStatus)) return false
    Object.assign(node, { generationStatus: result.state, generationLastSeq: result.lastSeq, containerSpec: result.finalOutput }); listeners.forEach(fn => fn()); return true
  }) }
  const dispose = installResearchGenerationWatch({ workspace, sessionId: 'festival', inspect, eventTarget: events, documentTarget: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }, ...extra })
  return { snapshot, workspace, events, dispose }
}
const completed = { taskId: 'task', canvasNodeId: 'card', state: 'completed', lastSeq: 20, events: [], finalOutput: { type: 'html', html: '<p>全部完整结果</p>' } }
function nativeApply(source, node) {
  const tree = createSourceFile('client.js', source, ScriptTarget.Latest, false, ScriptKind.JS); let method
  const visit = n => { if (!method && isMethodDeclaration(n) && n.name.getText(tree) === 'applyGenerationInspection') method = n; forEachChild(n, visit) }; visit(tree)
  const snapshot = { artifacts: [node] }
  const apply = new Function('snapshot', 'parseResearchContainerSpec', 'generationProgressOnly', `
const RESEARCH_CANVAS_TEXT_LIMIT=20000,RESEARCH_ACTIVE_GENERATION_STATUSES=new Set(['queued','running','retrying']),implicitGenerationResizes=new Map();
const boundedResearchArtifactString=v=>typeof v==='string'?v:null,researchGenerationStatus=v=>v,researchGenerationInspectionEvents=()=>[];
const researchContainerDeliveryFields=(spec,_receipt,completedAt)=>({containerSpec:spec,generationCompletedAt:completedAt,lastSuccessfulAt:completedAt});
const researchContainerPlainText=s=>s.html,researchContainerFinalGeometry=()=>({}),researchGenerationSizedNode=n=>n,researchResolvedGenerationSources=()=>({}),researchCanvasReflowGrowth=(_a,b)=>b;
const update=patch=>Object.assign(snapshot,patch);return ({${method.getText(tree)}}).applyGenerationInspection;`)(snapshot, parseResearchContainerSpec, generationProgressOnly)
  return { apply, snapshot }
}
function nativeAttach(source,node){
 const tree=createSourceFile('client.js',source,ScriptTarget.Latest,false,ScriptKind.JS);let method;
 const visit=n=>{if(!method&&isMethodDeclaration(n)&&n.name.getText(tree)==='attachGenerationTask')method=n;forEachChild(n,visit)};visit(tree);
 const snapshot={artifacts:[node]},apply=vi.fn(()=>true);
 const attach=new Function('snapshot','apply',`const RESEARCH_CANVAS_TEXT_LIMIT=20000,RESEARCH_GENERATION_MAX_PARTIAL_TEXT=20000,RESEARCH_ACTIVE_GENERATION_STATUSES=new Set(['queued','running','retrying']);
 const boundedResearchArtifactString=v=>typeof v==='string'?v:null,researchGenerationStatus=v=>v,researchGenerationInspectionEvents=()=>[],retainedResearchGenerationEvents=v=>v,researchResolvedGenerationSources=()=>({}),researchGenerationAutoGeometry=()=>({}),researchGenerationSizedNode=n=>n,update=p=>Object.assign(snapshot,p);
 return ({applyGenerationInspection:apply,${method.getText(tree)}}).attachGenerationTask;`)(snapshot,apply);
 return {snapshot,apply,attach,applyGenerationInspection:apply};
}
describe('任务检查切板恢复', () => {
  it.each(['cancelled','failed','completed'])('accepts an already %s start receipt through the normal terminal validator',async state=>{
    const source=patchResearchGenerationWatch(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
    const f=nativeAttach(source,{id:'card',generationStatus:'queued'}),receipt={...completed,state};
    expect(f.attach.call(f,'card',receipt)).toBe(true);
    expect(f.apply).toHaveBeenCalledWith('card',receipt);
    expect(f.snapshot.artifacts[0]).toMatchObject({generationTaskId:'task',generationStatus:'queued'});
    expect(f.attach.call(f,'card',{...receipt,taskId:'other'})).toBe(false);
  },15000);
  it('reconciles an unbound restored queue with the latest owned canvas task, including cancellation',async()=>{
    vi.useFakeTimers(); const inspect=vi.fn(async()=>({...completed,state:'cancelled',error:'任务已取消，可重试。'}));
    const snapshot={artifacts:[{id:'card',generationStatus:'queued'}]},listeners=new Set();
    const workspace={getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},attachGenerationTask:vi.fn((id,result)=>{Object.assign(snapshot.artifacts[0],{generationTaskId:result.taskId,generationStatus:result.state});return true}),failGeneration:vi.fn()};
    const dispose=installResearchGenerationWatch({workspace,sessionId:'parent',inspect});
    await vi.advanceTimersByTimeAsync(0);
    expect(inspect).toHaveBeenCalledWith(expect.objectContaining({parentSessionId:'parent',canvasNodeId:'card'}),expect.any(AbortSignal));
    expect(snapshot.artifacts[0]).toMatchObject({generationTaskId:'task',generationStatus:'cancelled'});
    dispose();
  });
  it('records slow application of an otherwise fast nonterminal response',async()=>{
    vi.useFakeTimers();const trace=vi.fn(),f=setup(async()=>({...completed,state:'running'}),{trace,apply(){vi.setSystemTime(Date.now()+5000);return true}})
    await vi.advanceTimersByTimeAsync(0)
    expect(trace.mock.calls.map(([value])=>value).find(v=>v.type==='inspection')).toMatchObject({state:'running',requestMs:0,applyMs:5000,accepted:true})
    f.dispose()
  })
  it('reports response/apply/delivery timing without business text and tolerates a broken diagnostic sink', async()=>{
    vi.useFakeTimers();const trace=vi.fn(),old=deferred(),f=setup(()=>old.promise,{trace});
    await vi.advanceTimersByTimeAsync(1800)
    old.resolve({...completed,completedAt:Date.now()-1500,finalOutput:'private business body',error:'private failure',prompt:'private request'})
    await vi.advanceTimersByTimeAsync(0)
    const receipt=trace.mock.calls.map(([value])=>value).find(v=>v.type==='inspection')
    expect(receipt).toMatchObject({state:'completed',requestMs:1800,completedAgoMs:1500,accepted:true})
    expect(JSON.stringify(trace.mock.calls)).not.toMatch(/private|festival|:"task"|:"card"/)
    f.dispose()
    const broken=setup(async()=>completed,{trace(){throw Error('unavailable log')}})
    await vi.advanceTimersByTimeAsync(0)
    expect(broken.snapshot.artifacts[0].generationStatus).toBe('completed');broken.dispose()
  })
  it('upgrades the actual native inspection binding and repatches idempotently', async () => {
    const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
    const patched = patchResearchGenerationWatch(source)
    expect(createSourceFile('client.js', patched, ScriptTarget.Latest, false, ScriptKind.JS).parseDiagnostics).toHaveLength(0)
    expect(patchResearchGenerationWatch(patched)).toBe(patched)
    for(const version of ['V1','V2','V3','V4','V5','V6','V7']){
      const previous=patched.replace('/* SHERLOCK_GENERATION_WATCH_RECOVERY_V8 */',`/* SHERLOCK_GENERATION_WATCH_RECOVERY_${version} */`)
      const upgraded=patchResearchGenerationWatch(previous)
      // Production's later i18n/formatter passes may rewrite the inline hook.
      // Upgrades preserve its protocol and become idempotent; byte equality
      // against a differently transformed input is not a behavioral contract.
      expect(patchResearchGenerationWatch(upgraded)).toBe(upgraded)
      expect(upgraded.split('SHERLOCK_GENERATION_WATCH_RECOVERY_V8')).toHaveLength(2)
      expect(createSourceFile('client.js',upgraded,ScriptTarget.Latest,false,ScriptKind.JS).parseDiagnostics).toHaveLength(0)
    }
    const hookStart=patched.indexOf('/* SHERLOCK_GENERATION_WATCH_RECOVERY_V8 */'),hookEnd=patched.indexOf('}, [sessionId, workspace, selectionGeneration?.inspect]);',hookStart)
    const staleHook=patched.slice(hookStart,hookEnd).replace('RECOVERY_V8','RECOVERY_V4').replace("cacheKey='__sherlockWorkbenchGenerationV1'","cacheKey='STALE_V4_INLINE_PUBLISHER'")
    const currentV4=patched.slice(0,hookStart)+staleHook+patched.slice(hookEnd)
    expect(currentV4).toContain('STALE_V4_INLINE_PUBLISHER')
    const upgradedV4=patchResearchGenerationWatch(currentV4)
    expect(upgradedV4).not.toContain('STALE_V4_INLINE_PUBLISHER')
    expect(patchResearchGenerationWatch(upgradedV4)).toBe(upgradedV4)
    expect(patched.split('SHERLOCK_GENERATION_WATCH_RECOVERY_V8')).toHaveLength(2)
    expect(patched).toContain("if (boundedString(request?.parentSessionId) !== session.sessionId) return Promise.reject(new Error('研究会话已失效'))")
    expect(patched).toContain('return sherlockBoardsAdapter.inspectShared(session.sessionId,request)')
    expect(patched).toContain('this.deps.generationInspectSink(request, options)')
    expect(patched).toContain("node.containerSpec?.type==='financial-widget'?{builtin:true}")
    expect(patched).toContain('postResearchTask(RESEARCH_TASK_INSPECT_PATH, request, options?.signal)')
    expect(patched).toContain("status='partial'")
    expect(() => patchResearchGenerationWatch('unknown native lifecycle')).toThrow('无法定位')
  },15000) // Three passes over the full 13 MB production bundle exceed 5 s on a cold run.
  it('publishes actual canvas completion for a settled parent and marks the snapshot inactive on leaving',async()=>{
    vi.useFakeTimers();const pending=deferred(),f=setup(()=>pending.promise)
    f.snapshot.artifacts[0].workbenchId='plan'
    pending.resolve(completed);await vi.advanceTimersByTimeAsync(0)
    const current=f.events.__sherlockWorkbenchGenerationV1.get('festival')
    expect(current).toMatchObject({active:true,nodes:[{id:'card',planId:'plan',status:'completed',taskId:'task'}]})
    expect(JSON.stringify(current)).not.toContain('全部完整结果')
    f.dispose();expect(f.events.__sherlockWorkbenchGenerationV1.get('festival').active).toBe(false)
  })
  it('applies a full same-watermark completion through the actual native transition, while rejecting older tasks and drafts', async () => {
    const source = patchResearchGenerationWatch(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
    const node = { id: 'card', kind: 'generated-container', generationTaskId: 'task', generationStatus: 'running', generationLastSeq: 20, sizeMode: 'manual', width: 720 }
    const finalOutput = JSON.stringify({ version: 1, type: 'html', title: '完整排期', html: '<p>全部完整结果</p>' }), receipt = { ...completed, finalOutput }
    const f = nativeApply(source, { ...node })
    expect(f.apply('card', receipt)).toBe(true)
    expect(f.snapshot.artifacts[0]).toMatchObject({ generationStatus: 'completed', generationLastSeq: 20, width: 720, containerSpec: { html: '<p>全部完整结果</p>' } })
    expect(f.apply('card', receipt)).toBe(false)
    for (const changed of [{ generationStatus: 'draft' }, { generationTaskId: 'new-task' }, { generationLastSeq: 21 }]) expect(nativeApply(source, { ...node, ...changed }).apply('card', receipt)).toBe(false)
  })
  it('replaces an old pending inspection with a full inspection when the same board is reopened', async () => {
    vi.useFakeTimers(); const old = deferred(), inspect = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(completed), f = setup(inspect)
    f.events.dispatchEvent(new CustomEvent('sherlock:conversation-initial-research', { detail: { sessionId: 'festival' } }))
    await vi.advanceTimersByTimeAsync(0)
    expect(inspect).toHaveBeenCalledTimes(2)
    expect(inspect.mock.calls[1][0]).toMatchObject({ parentSessionId: 'festival', afterSeq: 0 })
    expect(f.snapshot.artifacts[0]).toMatchObject({ generationStatus: 'completed', containerSpec: completed.finalOutput, containerPrompt: '保留当前业务', width: 720 })
    old.resolve({ ...completed, state: 'running', lastSeq: 10 }); await vi.advanceTimersByTimeAsync(0)
    expect(f.workspace.applyGenerationInspection).toHaveBeenCalledTimes(1)
    f.dispose()
  })
  it('bounds a hung local inspection and resumes polling without needing a view reload', async () => {
    vi.useFakeTimers(); const inspect = vi.fn().mockReturnValueOnce(new Promise(() => {})).mockResolvedValue(completed), f = setup(inspect, { timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(450)
    expect(f.snapshot.artifacts[0].generationStatus).toBe('completed')
    expect(inspect.mock.calls[0][1].aborted).toBe(true)
    expect(inspect.mock.calls[1][0].afterSeq).toBe(0)
    f.dispose()
  })
  it('does not overwrite a draft, removed node, or a newer retry with an old response', async () => {
    vi.useFakeTimers()
    for (const edit of [node => { node.generationStatus = 'draft'; node.containerPrompt = '刚编辑的需求' }, node => { node.generationTaskId = 'new-task' }, (_node, list) => { list.splice(0) }]) {
      const old = deferred(), f = setup(vi.fn(() => old.promise)); edit(f.snapshot.artifacts[0], f.snapshot.artifacts)
      old.resolve(completed); await vi.advanceTimersByTimeAsync(0)
      expect(f.workspace.applyGenerationInspection).not.toHaveBeenCalled(); f.dispose()
    }
  })
  it('ignores other-board wakes and ignores every completion after disposal', async () => {
    vi.useFakeTimers(); const old = deferred(), inspect = vi.fn(() => old.promise), f = setup(inspect)
    f.events.dispatchEvent(new CustomEvent('sherlock:conversation-initial-research', { detail: { sessionId: 'finance' } })); await vi.advanceTimersByTimeAsync(0)
    expect(inspect).toHaveBeenCalledTimes(1); f.dispose(); old.resolve(completed); await vi.advanceTimersByTimeAsync(1000)
    expect(f.workspace.applyGenerationInspection).not.toHaveBeenCalled()
  })
})
