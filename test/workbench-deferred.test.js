import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { componentPromptSource } from '../scripts/lib/figma-generation-client.mjs'
import { validateWorkbench, workbenchPanelPrompt,prepareSimulatedArtifact } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js'
import { ResearchTaskRuntime, buildResearchTaskPrompt } from '../packages/dsh-research-task-runtime/index.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'

const original = '生成一个海边3天夜间艺术节工作台，预算80万元，每日2500人，两座舞台和装置区，筹备21天。需要排期、人员、物资、预算、预售、天气预案，使用自洽模拟数据。'
const common = '总预算800000元；舞台300000、人员150000、物资100000、预售150000、天气备用100000元。每日2500人，3天共7500人次；两舞台和装置区；筹备2026-11-01至11-21，活动11-22至11-24；共同模拟情景。'
const panels = [
  { title: '预算明细', type: 'table', prompt: '分类预算、金额和预算占比；保留筛选及完整明细。' },
  { title: '筹备排期', type: 'gantt', prompt: '21天筹备的阶段、经办人和里程碑。' },
  { title: '执行分工', type: 'tasks', prompt: '两舞台与装置区任务、负责人、截止日期。' },
  { title: '物资清单', type: 'table', prompt: '展示采购物资、预算分类、需求数量与负责人。' },
  { title: '三日节目安排', type: 'timeline', prompt: '三天夜间节目、场地、时间、每日容量。' },
  { title: '天气预案', type: 'note', prompt: '恶劣天气触发条件、撤场路线及100000元备用金使用原则。' }
].map(p => ({ ...p, size: 'large' }))
const input = () => ({ requestId: 'festival-deferred', title: '海边夜间艺术节', dataMode: 'simulated', generationMode: 'deferred', sharedContext: common, panels: structuredClone(panels) })
const artifact = query => {
  const title = query.match(/本面板：([^\n]+)/u)[1]
  const base = { version: 1, title, asOf: '2026-11-01' }
  if (title === '筹备排期') return { ...base, type: 'gantt', asOf: '2026-11-01', items: [{ label: '21天筹备', start: '2026-11-01', end: '2026-11-21', progress: 0, owner: '筹备组' }] }
  if (title === '执行分工') return { ...base, type: 'tasks', items: [{ id: 'stages', title: '两座舞台交付', completed: false, owner: '舞台组', due: '2026-11-21' }] }
  if (title === '三日节目安排') return { ...base, type: 'timeline', items: [{ id: 'night1', title: '首夜开场', time: '2026-11-22T18:00:00+08:00', summary: '每日2500人，3天7500人次' }] }
  if (title === '天气预案') return { ...base, type: 'note', asOf: '2026-11-01', content: '# 天气预案\n预备金100000元，按审批后使用。' }
  return { ...base, type: 'table', columns: ['预算分类', '金额 / 元'], rows: [['舞台', '300000'], ['人员', '150000'], ['物资', '100000'], ['预售', '150000'], ['天气备用', '100000']] }
}
async function setup(start) {
  const dir = await mkdtemp(join(tmpdir(), 'deferred-workbench-'))
  const saved = [], adapter = { start: vi.fn(start) }, runtime = new ResearchTaskRuntime({ adapter, storage: { save: async value => saved.push(structuredClone(value)) }, retryDelayMs: 0 })
  let tool
  const ctx = { agents: { get: () => ({}) }, tools: { register: value => { tool = value; return () => {} } }, webServer: { register: () => () => {} } }
  const filePath = join(dir, 'plans.json'), dispose = await registerWorkbench(ctx, runtime, { filePath })
  const exec = { agent: { session: { id: 'parent', events: [{ type: 'user/message', data: { id: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: original }] } }] } }, signal: new AbortController().signal }
  return { adapter, runtime, saved, exec, tool, filePath, close: async () => { await runtime.dispose(); await dispose(); await rm(dir, { recursive: true, force: true }) } }
}

describe('领域自适应模拟工作台延后生成', () => {
  it('requests one shared simulated cohort before mounting a legacy board whose fixed samples are short',async()=>{
    const f=await setup(()=>{throw Error('inconsistent plans must not start')})
    const request='用模拟数据建立交付工作台，准备32项任务。概览统计要和明细一致。'
    f.exec.agent.session.events[0].data.content[0].text=request
    const payload={title:'交付工作台',dataMode:'simulated',panels:[
      {title:'交付概览',type:'dashboard',prompt:'按状态统计同一批任务。'},
      {title:'任务明细',type:'table',prompt:'展示全部32项任务，保留编号、任务名称、状态和负责人。'}
    ]}
    try {
      await expect(f.tool.execute(payload,f.exec)).rejects.toThrow(/同一份完整模拟记录集.*sharedDatasets/su)
      expect(f.runtime.tasks.size).toBe(0);expect(f.adapter.start).not.toHaveBeenCalled()
      await expect(readFile(f.filePath,'utf8')).rejects.toMatchObject({code:'ENOENT'})
    }finally{await f.close()}
  })

  it('recovers an isolated simulated quantity shortfall through deferred generation and keeps the request id',async()=>{
    const f=await setup(async request=>({childSessionId:request.taskId,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify({version:1,type:'table',title:'任务明细（模拟）',columns:['编号','任务名称'],rows:Array.from({length:32},(_,i)=>['T'+i,'模拟任务'+i])})}]}),dispose:async()=>{}}))
    const request='创建任务工作台，用模拟数据展示全部32项任务。'
    f.exec.agent.session.events[0].data.content[0].text=request
    const payload={title:'任务工作台',dataMode:'simulated',panels:[{title:'任务明细',type:'table',prompt:'展示全部32项任务，保留编号和任务名称。'}]}
    try {
      const receipt=await f.tool.execute(payload,f.exec);expect(receipt.status).toBe('accepted')
      await expect.poll(()=>[...f.runtime.tasks.values()][0].state).toBe('completed')
      const task=[...f.runtime.tasks.values()][0]
      expect(task.prompt).toContain('【宿主延后模拟生成】');expect(task.prompt).toContain(request)
      expect(readTemplateModel(JSON.parse(task.finalOutput)).data.rows).toHaveLength(32)
      expect((await f.tool.execute(payload,f.exec)).planId).toBe(receipt.planId);expect(f.adapter.start).toHaveBeenCalledOnce()
    }finally{await f.close()}
  })

  it('retains available simulated rows as a partial result when deferred generation is unavailable',async()=>{
    const f=await setup(()=>{throw Error('deferred generation is unavailable')})
    f.runtime.startBatch=undefined
    f.exec.agent.session.events[0].data.content[0].text='创建模拟市场工作台，展示全部32条观察样本。'
    const payload={title:'模拟市场工作台',dataMode:'simulated',panels:[{title:'样本明细',type:'table',prompt:'展示全部32条观察样本，包含数值和变化。'}]}
    try {
      const receipt=await f.tool.execute(payload,f.exec);expect(receipt.status).toBe('incomplete');expect(receipt.detail).toContain('实际交付5，尚缺27')
      const [task]=f.runtime.tasks.values();expect(task.deliveryStatus).toBe('partial')
      expect(readTemplateModel(JSON.parse(task.finalOutput)).data.rows).toHaveLength(5)
      expect((await f.tool.execute(payload,f.exec)).planId).toBe(receipt.planId);expect(f.adapter.start).not.toHaveBeenCalled()
    }finally{await f.close()}
  })

  it('keeps the type parameter aligned with the shared-context custom interaction route',async()=>{
    const f=await setup(()=>{throw Error('metadata only')});
    try{const schema=JSON.stringify(f.tool.parameters);expect(schema).not.toContain('省略dataMode/generationMode/sharedContext/originalRequest');expect(schema).toContain('保留deferred与sharedContext')}finally{await f.close()}
  });
  it('keeps offline custom content separate from invented links and external resources',()=>{
    const prepare=html=>prepareSimulatedArtifact({type:'html',title:'演练交互',artifact:{version:1,type:'html',title:'演练交互',html}});
    expect(prepare('<main><svg xmlns="http://www.w3.org/2000/svg"><circle r="3"/></svg><p>演练记录</p><a href="#detail">详情</a><section id="detail">原有说明</section></main>').html).toContain('原有说明');
    for(const html of ['<a href="https://example.com/fake">虚构出处</a>','<img src="//example.com/image.png">','<a href="&#104;ttps://example.com/fake">出处</a>','<style>div{background:url(https://example.com/image.png)}</style>'])expect(()=>prepare(html)).toThrow(/离线模拟HTML/);
  });
  it('creates a declared custom interaction without discarding shared facts or making another planning round',async()=>{
    const html='<main><p>演练记录 · 两舞台</p><label>场地<select id="venue"><option>全部</option><option>舞台A</option></select></label><details><summary>场地交接</summary><p>每日2500人，备用金100000元，完整交接说明。</p></details></main>';
    const f=await setup(async request=>({childSessionId:request.taskId,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify({version:1,type:'html',title:'场地交接（模拟）',html})}]}),dispose:async()=>{}}));
    try{
      await f.tool.execute({...input(),panels:[{...panels[0],title:'场地交接',type:'html',layout:'wide',prompt:'按场地筛选并逐项展开完整交接，不联网。'}]},f.exec);
      await vi.waitFor(()=>expect([...f.runtime.tasks.values()][0].state).toBe('completed'));
      expect(f.adapter.start).toHaveBeenCalledTimes(1);expect(f.adapter.start.mock.calls[0][0].query).toContain(common);
      const output=JSON.parse([...f.runtime.tasks.values()][0].finalOutput);expect(output.type).toBe('html');expect(output.html).toContain('完整交接说明');expect(output.title).toContain('模拟');
    }finally{await f.close()}
  });
  it('accepts the observed same-type artifact envelope without a second generation and preserves all timeline records', async () => {
    const f=await setup(async request=>{const data=artifact(request.query);return {childSessionId:request.taskId,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify({version:1,type:data.type,title:data.title,artifact:data})}]}),dispose:async()=>{}}})
    try{
      await f.tool.execute({...input(),panels:[panels[4]]},f.exec)
      await vi.waitFor(()=>expect([...f.runtime.tasks.values()][0].state).toBe('completed'))
      const task=[...f.runtime.tasks.values()][0],data=readTemplateModel(JSON.parse(task.finalOutput)).data
      expect(data.items).toEqual(artifact(task.prompt).items)
      expect(data.title).toContain('模拟');expect(f.adapter.start).toHaveBeenCalledTimes(1)
    }finally{await f.close()}
  })
  it('preserves a nested timeline business title as its subject under the known host panel title',async()=>{
    const f=await setup(async request=>{const data={...artifact(request.query),title:'潜器作业·仪器与样品流转记录'};return {childSessionId:request.taskId,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify({version:1,type:data.type,title:request.query.match(/本面板：([^\n]+)/u)[1],artifact:data})}]}),dispose:async()=>{}}})
    try{await f.tool.execute({...input(),panels:[panels[4]]},f.exec);await vi.waitFor(()=>expect([...f.runtime.tasks.values()][0].state).toBe('completed'));const data=readTemplateModel(JSON.parse([...f.runtime.tasks.values()][0].finalOutput)).data;expect(data.subject).toBe('潜器作业·仪器与样品流转记录');expect(data.items).toHaveLength(1);expect(data.title).toContain('三日节目安排');expect(f.adapter.start).toHaveBeenCalledTimes(1)}finally{await f.close()}
  })
  it('does not overwrite an existing timeline subject to resolve a conflicting nested title',async()=>{
    const f=await setup(async request=>{const data={...artifact(request.query),title:'业务标题',subject:'另一个必须保留的正文标题'};return {childSessionId:request.taskId,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify({version:1,type:data.type,title:request.query.match(/本面板：([^\n]+)/u)[1],artifact:data})}]}),dispose:async()=>{}}})
    try{await f.tool.execute({...input(),panels:[panels[4]]},f.exec);await vi.waitFor(()=>expect([...f.runtime.tasks.values()][0].state).toBe('failed'));expect([...f.runtime.tasks.values()][0].finalOutput).toBeUndefined()}finally{await f.close()}
  })
  it.each(['url','extra','type','title'])('does not unwrap a conflicting or additional %s envelope field',async field=>{
    const f=await setup(async request=>{const data=artifact(request.query),envelope={version:1,type:data.type,title:data.title,artifact:data};envelope[field]=field==='type'?'note':field==='title'?'不相同标题':field==='url'?'https://example.com/invented':'不应丢弃的信息';return {childSessionId:request.taskId,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(envelope)}]}),dispose:async()=>{}}})
    try{await f.tool.execute({...input(),panels:[panels[4]]},f.exec);await vi.waitFor(()=>expect([...f.runtime.tasks.values()][0].state).toBe('failed'));expect([...f.runtime.tasks.values()][0].finalOutput).toBeUndefined()}finally{await f.close()}
  })
  it('does not silently drop per-record detail interactions into a flat deferred table', () => {
    const panel = { ...panels[0], title: '古籍修复交接', prompt: '8册模拟古籍，含病害、修复阶段、负责人和预计交接时间；点击任一行展开查看病害详情、修复方案与交接注意事项。' }
    expect(() => validateWorkbench({ ...input(), panels: [panel] })).toThrow(/table.*详情/u)
    for (const prompt of ['8册古籍的平面交接表，按负责人搜索，按日期排序。', '无需点击行展开详情；全部说明直接展示在列中。']) {
      expect(validateWorkbench({ ...input(), panels: [{ ...panel, prompt }] }).panels[0].type).toBe('table')
    }
    expect(validateWorkbench({ ...input(), panels: [{ ...panel, type: 'timeline' }] }).panels[0].type).toBe('timeline')
  })

  it('rejects the unsupported interaction before accepting a plan or launching any child', async () => {
    const f = await setup(() => { throw Error('unsupported table must not start') })
    try {
      await expect(f.tool.execute({ ...input(), panels: [{ ...panels[0], prompt: '点击每行展开详情和完整交接说明。' }] }, f.exec)).rejects.toThrow(/table.*详情/u)
      expect(f.adapter.start).not.toHaveBeenCalled()
      expect(f.runtime.tasks.size).toBe(0)
      await expect(readFile(f.filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally { await f.close() }
  })

  it('dispatches the suggested custom HTML correction through the ordinary model path while retaining simulation and offline constraints', async () => {
    const f = await setup(async request => ({ childSessionId: request.taskId, result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify({ version: 1, type: 'html', title: '古籍交接（模拟）', html: '<main><p>模拟记录8册</p><details><summary>查看详情</summary><p>模拟病害与修复方案完整说明</p></details></main>' }) }] }), dispose: async () => {} }))
    const prompt = '8册古籍的模拟交接记录，禁止联网，不引用真实来源；点击记录展开完整说明。共同约束：2026-11交接，负责人均为虚构。'
    const authored = '创建古籍交接模拟工作台。' + prompt
    f.exec.agent.session.events[0].data.content[0].text = authored
    try {
      const receipt = await f.tool.execute({ title: '古籍交接（模拟）', panels: [{ ...panels[0], title: '古籍交接（模拟）', type: 'html', prompt }] }, f.exec)
      expect(receipt.status).toBe('accepted')
      await vi.waitFor(() => expect(f.adapter.start).toHaveBeenCalledTimes(1))
      expect(f.adapter.start.mock.calls[0][0].query).toContain(prompt)
      const plan = JSON.parse(await readFile(f.filePath, 'utf8'))[0]
      expect(plan.input).not.toHaveProperty('dataMode')
      expect(plan.input).not.toHaveProperty('generationMode')
      expect(plan.input).not.toHaveProperty('sharedContext')
      expect(plan.input.originalRequest).toBe(authored)
      await vi.waitFor(() => expect([...f.runtime.tasks.values()][0].state).toBe('completed'))
      const output = [...f.runtime.tasks.values()][0].finalOutput
      expect(output).toContain('查看详情')
      expect(output).toContain('模拟病害与修复方案完整说明')
      expect(buildResearchTaskPrompt({ kind: 'container', parentSessionId: 'p', canvasNodeId: 'n', prompt: plan.panels[0].prompt })).toContain('禁止联网')
    } finally { await f.close() }
  })

  it('accepts the observed null optional artifact at the real tool boundary without inventing data or duplicating a retry', async () => {
    const f = await setup(async request => ({ childSessionId: request.taskId, result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(artifact(request.query)) }] }), dispose: async () => {} }))
    const payload = { ...input(), panels: [{ ...panels[4], artifact: null }] }, before = structuredClone(payload)
    try {
      const receipt = await f.tool.execute(payload, f.exec)
      expect(receipt.status).toBe('accepted')
      expect(receipt.templateIds).toEqual(['timeline'])
      expect(f.runtime.tasks.size).toBe(1)
      const plan = JSON.parse(await readFile(f.filePath, 'utf8'))[0]
      expect(Object.hasOwn(plan.input.panels[0], 'artifact')).toBe(false)
      expect(plan.input.originalRequest).toBe(original)
      expect(plan.input.sharedContext).toBe(common)
      const { artifact: omitted, ...panel } = payload.panels[0]
      expect((await f.tool.execute({ ...payload, panels: [panel] }, f.exec)).planId).toBe(receipt.planId)
      expect(f.runtime.tasks.size).toBe(1)
      expect(payload).toEqual(before)
    } finally { await f.close() }
  })

  it('treats a source null slot as absent while keeping simulated artifact validation strict', () => {
    const source = validateWorkbench({ ...input(), dataMode: 'source', generationMode: undefined, sharedContext: undefined, panels: [{ ...panels[4], artifact: null }] })
    expect(source.panels[0].artifact).toBeUndefined()
    for (const mode of [{ generationMode: 'parallel' }, { generationMode: undefined }]) {
      expect(() => validateWorkbench({ ...input(), ...mode, sharedContext: undefined, panels: [{ ...panels[4], artifact: null }] })).toThrow()
    }
    for (const artifact of [{}, false, '']) expect(() => validateWorkbench({ ...input(), panels: [{ ...panels[4], artifact }] })).toThrow()
  })

  it('validates metadata-first plans while preserving their shared facts and refusing unsupported or mixed paths', () => {
    const plan = validateWorkbench(input())
    expect(plan.generationMode).toBe('deferred')
    expect(plan.sharedContext).toBe(common)
    expect(plan.title).toContain('模拟')
    expect(plan.panels.map(p => p.type)).toEqual(['table', 'gantt', 'tasks', 'table', 'timeline', 'note'])
    expect(plan.panels.every(p => !p.artifact)).toBe(true)
    expect(validateWorkbench(plan)).toEqual(plan)
    for (const invalid of [
      { ...input(), dataMode: 'source' }, { ...input(), generationMode: 'unknown' }, { ...input(), preset: 'medical-21h', panels: [] },
      ...['financial-widget', 'gallery', 'unknown'].map(type => ({ ...input(), panels: [{ ...panels[0], type }] })),
      { ...input(), panels: [{ ...panels[0], artifact: { version: 1, type: 'table', title: '已有记录', columns: ['a'], rows: [['b']] } }] },
      { ...input(), sharedContext: 'x'.repeat(3001) }
    ]) expect(() => validateWorkbench(invalid)).toThrow()
  })

  it('preserves each panel question and complete shared facts under the content-first delivery contract', () => {
    const plan = validateWorkbench({ ...input(), originalRequest: original + '；另一个图表参考chart.bar，不要让所有面板变成图表。' })
    for (const p of plan.panels) {
      const prompt = workbenchPanelPrompt(plan, p)
      expect(prompt).toContain(original)
      expect(prompt).toContain(common)
      const built = buildResearchTaskPrompt({ kind: 'container', parentSessionId: 'p', canvasNodeId: p.title, prompt })
      expect(built).toContain(`本面板：${p.title}`)
      expect(built).toContain(p.prompt)
      expect(built).toContain(original)
      expect(built).toContain(common)
      expect(built).toContain('component_presentation_schema')
      expect(built).toMatch(/理解需求[\s\S]*收集与处理内容[\s\S]*可视化交付/u)
      expect(built).toMatch(/(?:完整内容模型[^。]*搜索[^。]*排序[^。]*分页[^。]*计数|搜索[^。]*排序[^。]*分页[^。]*计数[^。]*完整内容模型)/u)
      expect(built).toMatch(/submit_component_data[^\n]*content/u)
      expect(built).toMatch(/(?:不得[^。]*样例[^。]*缺失值[^。]*真实(?:业务)?数据|样例[^。]*缺失值[^。]*不能充当真实(?:业务)?数据)/u)
      if(p.type==='timeline')expect(built).not.toContain('同次提供artifact:')
      expect(built).not.toContain('唯一交付格式：undefined')
    }
  })

  it('accepts before model results, starts one bounded batch, preserves user facts and deduplicates a tool retry', async () => {
    const pending = [], f = await setup(async request => ({ childSessionId: `child-${pending.length}`, result: new Promise(resolve => { pending.push({ request, resolve }); request.signal.addEventListener('abort', () => resolve({ stopReason: 'aborted', output: [] }), { once: true }) }), dispose: async () => {} }))
    try {
      const prepared = vi.spyOn(f.runtime, 'startPreparedBatch')
      const receipt = await f.tool.execute(input(), f.exec)
      expect(receipt.status).toBe('accepted')
      expect(receipt.templateIds).toEqual(['table', 'gantt', 'tasks', 'table', 'timeline', 'note'])
      expect(prepared).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(pending).toHaveLength(3))
      expect([...f.runtime.tasks.values()].map(t => t.state).sort()).toEqual(['queued', 'queued', 'queued', 'running', 'running', 'running'])
      expect((await f.tool.execute(input(), f.exec)).planId).toBe(receipt.planId)
      expect(f.runtime.tasks.size).toBe(6)
      const plan = JSON.parse(await readFile(f.filePath, 'utf8'))[0]
      expect(plan.input.originalRequest).toBe(original)
      expect(plan.input.sharedContext).toBe(common)
      for (let i = 0; i < 6; i++) {
        await vi.waitFor(() => expect(pending.length).toBeGreaterThan(i))
        const { request, resolve } = pending[i]
        expect(request.query).toContain(original)
        expect(request.query).toContain(common)
        resolve({ stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(artifact(request.query)) }] })
      }
      await vi.waitFor(() => expect([...f.runtime.tasks.values()].map(t => ({ state: t.state, error: t.error }))).toEqual(Array.from({ length: 6 }, () => ({ state: 'completed', error: undefined }))))
      expect([...f.runtime.tasks.values()].map(t => readTemplateModel(JSON.parse(t.finalOutput))?.templateId ?? JSON.parse(t.finalOutput).type)).toEqual(['market.table', 'gantt', 'tasks', 'market.table', 'timeline', 'note'])
      for(const index of [0,3]){
        const delivered=readTemplateModel(JSON.parse([...f.runtime.tasks.values()][index].finalOutput)).data
        expect(delivered.asOf).toBe('2026-11-01')
        expect(delivered.rows).toEqual(artifact([...f.runtime.tasks.values()][index].prompt).rows)
      }
      expect([...f.runtime.tasks.values()].every(t => t.finalOutput.includes('模拟'))).toBe(true)
      expect(f.adapter.start).toHaveBeenCalledTimes(6)
    } finally { await f.close() }
  }, 10000)

  it('keeps cancellation, wrong-type failure and unchanged-card retry inside the existing owned task lifecycle', async () => {
    let mode = 'wait'
    const f = await setup(async request => ({ childSessionId: 'child-' + request.taskId,
      result: mode === 'wait' ? new Promise(resolve => request.signal.addEventListener('abort', () => resolve({ stopReason: 'aborted', output: [] }), { once: true })) : Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(mode === 'wrong' ? { version: 1, type: 'dashboard', title: '通用示例', asOf: '模拟', items: [{ label: '无关', value: '1' }] } : artifact(request.query)) }] }), dispose: async () => {} }))
    try {
      const receipt = await f.tool.execute(input(), f.exec)
      const tasks = [...f.runtime.tasks.values()]
      await f.runtime.cancel({ parentSessionId: 'parent', taskId: tasks[5].taskId })
      expect(f.runtime.inspect({ parentSessionId: 'parent', taskId: tasks[5].taskId }).state).toBe('cancelled')
      expect(f.adapter.start.mock.calls.some(([request]) => request.taskId === tasks[5].taskId)).toBe(false)
      await f.runtime.cancel({ parentSessionId: 'parent', taskId: tasks[0].taskId })
      expect(f.runtime.inspect({ parentSessionId: 'parent', taskId: tasks[0].taskId }).state).toBe('cancelled')
      mode = 'wrong'
      const failed = await f.runtime.start({ parentSessionId: 'parent', canvasNodeId: tasks[0].canvasNodeId, kind: 'container', prompt: tasks[0].prompt })
      // Free existing slots; a failed generation may repair at most once.
      for (const task of tasks.slice(1, 5)) await f.runtime.cancel({ parentSessionId: 'parent', taskId: task.taskId })
      await vi.waitFor(() => expect(f.runtime.inspect({ parentSessionId: 'parent', taskId: failed.taskId }).state).toBe('failed'))
      expect(f.runtime.inspect({ parentSessionId: 'parent', taskId: failed.taskId }).finalOutput).toBeUndefined()
      mode = 'good'
      const retry = await f.runtime.start({ parentSessionId: 'parent', canvasNodeId: tasks[0].canvasNodeId, kind: 'container', prompt: panels[0].prompt })
      await vi.waitFor(() => expect(f.runtime.inspect({ parentSessionId: 'parent', taskId: retry.taskId }).state).toBe('completed'))
      expect(f.runtime.tasks.get(retry.taskId).prompt).toContain(common)
      expect(f.runtime.tasks.get(retry.taskId).prompt).toContain(original)
      expect((await f.tool.execute(input(), f.exec)).planId).toBe(receipt.planId)
      await expect(f.runtime.cancel({ parentSessionId: 'foreign', taskId: retry.taskId })).rejects.toThrow()
    } finally { await f.close() }
  }, 10000)

  it('reuses the mounted identities after an atomic batch startup failure instead of claiming acceptance or duplicating cards', async () => {
    const f = await setup(async request => ({ childSessionId: request.taskId, result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(artifact(request.query)) }] }), dispose: async () => {} }))
    try {
      const save = f.runtime.storage.save
      f.runtime.storage.save = vi.fn().mockRejectedValueOnce(Error('storage unavailable')).mockImplementation(save)
      await expect(f.tool.execute(input(), f.exec)).rejects.toThrow('storage unavailable')
      const failedPlan = JSON.parse(await readFile(f.filePath, 'utf8'))[0]
      expect(failedPlan.panels.every(p => p.error && !p.taskId)).toBe(true)
      expect(f.runtime.tasks.size).toBe(0)
      expect(f.adapter.start).not.toHaveBeenCalled()
      const receipt = await f.tool.execute(input(), f.exec)
      expect(receipt).toMatchObject({ planId: failedPlan.id, status: 'accepted' })
      const savedPlans = JSON.parse(await readFile(f.filePath, 'utf8'))
      expect(savedPlans).toHaveLength(1)
      expect(savedPlans[0].panels.map(p => p.nodeId)).toEqual(failedPlan.panels.map(p => p.nodeId))
      await vi.waitFor(() => expect([...f.runtime.tasks.values()].every(t => t.state === 'completed')).toBe(true))
    } finally { await f.close() }
  }, 10000)

  it('never converts a timeout or an unrelated readable HTML result into a completed deferred card', async () => {
    for (const mode of ['timeout', 'html']) {
      const adapter = { start: vi.fn(async () => ({ childSessionId: mode, result: Promise.resolve(mode === 'timeout'
        ? { stopReason: 'timeout', localDeadlineExceeded: true, output: [] }
        : { stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify({ version: 1, type: 'html', title: '错误类型', html: '<h1>预算已完成</h1><p>未经验证的通用说明，不能代替预算数据。</p>' }) }] }), dispose: async () => {} })) }
      const runtime = new ResearchTaskRuntime({ adapter, storage: { save: async () => {} }, retryDelayMs: 0 })
      try {
        const plan = validateWorkbench(input()), prompt = workbenchPanelPrompt(plan, plan.panels[0])
        const receipt = (await runtime.startBatch({ parentSessionId: 'p', panels: [{ kind: 'container', canvasNodeId: mode, prompt }] }))[0]
        await vi.waitFor(() => expect(runtime.inspect({ parentSessionId: 'p', taskId: receipt.taskId }).state).toBe('failed'))
        expect(runtime.inspect({ parentSessionId: 'p', taskId: receipt.taskId }).finalOutput).toBeUndefined()
        expect(adapter.start).toHaveBeenCalledTimes(2)
      } finally { await runtime.dispose() }
    }
  })

  it.each(['安排三天节目', '按用户指定的三天夜间艺术节安排完整节目场地与容量'])('restores unchanged requirement %s through the actual auto/manual retry wrappers while preserving edits and broken wrappers', async requirement => {
    const wrap = runInNewContext('(' + componentPromptSource + ')', { researchComponentSize: () => 'large', RESEARCH_BENTO_SIZES: { large: { width: 656, height: 456 } } })
    const own = { ...panels[0], prompt: requirement }, plan = validateWorkbench({ ...input(), originalRequest: original, panels: [own] })
    const adapter = { start: vi.fn(async request => ({ childSessionId: request.taskId, result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: JSON.stringify(artifact(request.query.includes('本面板：') ? request.query : '本面板：预算明细\n')) }] }), dispose: async () => {} })) }
    const runtime = new ResearchTaskRuntime({ adapter, storage: { save: async () => {} } })
    const wait = async receipt => vi.waitFor(() => expect(runtime.inspect({ parentSessionId: 'p', taskId: receipt.taskId }).state).toBe('completed'))
    try {
      await wait((await runtime.startBatch({ parentSessionId: 'p', panels: [{ kind: 'container', canvasNodeId: 'wrapped', prompt: workbenchPanelPrompt(plan, plan.panels[0]) }] }))[0])
      for (const sizeMode of ['auto', 'manual']) {
        const node = { sizeMode, x: 40, y: 60, width: 720, height: 540 }
        const prompt = wrap(node, own.prompt)
        const retried = await runtime.start({ kind: 'container', parentSessionId: 'p', canvasNodeId: 'wrapped', prompt })
        await wait(retried)
        const query = adapter.start.mock.calls.at(-1)[0].query
        expect(query).toContain('【宿主延后模拟生成】')
        expect(query).toContain(original)
        expect(query).toContain(common)
        expect(query).toContain(prompt.slice(own.prompt.length))
        for (const edited of [own.prompt + '；改为四天且不沿用原预算', own.prompt.slice(2), wrap(node, own.prompt + '；改为四天且不沿用原预算'), wrap(node, own.prompt.slice(2)), prompt.replace('唯一尺寸依据', '大致尺寸依据').replace('自动布局按内容密度选择规格', '按其他方式布局')]) {
          const task = await runtime.start({ kind: 'container', parentSessionId: 'p', canvasNodeId: 'wrapped', prompt: edited })
          await wait(task)
          expect(runtime.tasks.get(task.taskId).prompt).toBe(edited)
          expect(runtime.tasks.get(task.taskId).prompt).not.toContain('【宿主延后模拟生成】')
        }
      }
    } finally { await runtime.dispose() }
  })
})
