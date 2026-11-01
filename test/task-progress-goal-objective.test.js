import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {parse} from '@babel/parser'
import {expect,it} from 'vitest'
import {patchFigmaReadingConversation} from '../scripts/lib/figma-reading-client.mjs'
import {patchTaskProgressClient} from '../scripts/lib/task-progress-client.mjs'

const require=createRequire(import.meta.url)
const {applyGoalProjection}=require('@deepseek-ai/dsh-goal')
const raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
const source=patchTaskProgressClient(patchFigmaReadingConversation(raw))
const declarations=new Map()
const visit=node=>{
 if(!node||typeof node!=='object')return
 if(node.type==='FunctionDeclaration')declarations.set(node.id.name,source.slice(node.start,node.end))
 if(node.type==='VariableDeclarator'&&node.id.name==='messageDefinition')declarations.set('messageDefinition',source.slice(node.init.start,node.init.end))
 for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)
}
visit(parse(source,{sourceType:'script'}).program)
const classifier=runInNewContext('('+declarations.get('messageDefinition')+')',{_deepseek_ai_dsh_client_runtime_client:{contextProvenance:()=>null,contextForm:()=>null}})
// Use the same public Research codec and actual visible-text/getter functions as TodoDock.
let descriptor
runInNewContext(source,{AbortController,TextEncoder,TextDecoder,URL,setTimeout,clearTimeout,document:undefined,window:{__ModuleLoader__:{load:value=>descriptor=value}}})
let fallback
fallback=new Proxy(function(){},{get:()=>fallback,apply:()=>fallback,construct:()=>({})})
const client=descriptor.factory(id=>['react','react/jsx-runtime','react-dom'].includes(id)?require(id):fallback)
const jsx=(type,props)=>({type,props})
const names=['projectChatFileText','projectUserText','projectResearchUserText','researchPromptBasename','researchArtifactReferenceLabel','contentParts','odysseyTaskVisibleText','odysseyTaskObjective','odysseyTaskHeaderObjective','continueUnfinishedTask','TodoDock']
const code=names.filter(name=>declarations.has(name)).map(name=>declarations.get(name)).join('\n')
const dock=runInNewContext(code+';TodoDock',{
 react:{Fragment:'fragment',useRef:current=>({current}),useEffect:()=>{}},react_jsx_runtime:{jsx,jsxs:jsx,Fragment:'fragment'},
 TodoPanel:'panel',document:{documentElement:{dataset:{odysseyLocale:'zh'}}},parseResearchPrompt:client.parseResearchPrompt,
 RESEARCH_PROMPT_PREFIX:'␞SHERLOCK_RESEARCH_FILES_V1 ',ResearchMessageFileChip:function FileChip(){},ResearchMessageArtifactChip:function ArtifactChip(){},
 MessageItem_module_css_default:{refChip:'reference'},projectConversationComponentUserText:()=>null
})
function goal(phase){
 const goal={id:'test-goal',revision:phase==='active'?1:2,objective:'旧目标：整理年报',phase,maxGoalRounds:4,...(phase==='blocked'?{blockedReason:{code:'round-limit',message:'round limit reached'}}:{})}
 const projection=applyGoalProjection(null,{type:'goal/change',data:{kind:'goal/change',version:1,operation:phase==='active'?'create':phase==='paused'?'pause':phase==='blocked'?'block':'complete',goal,roundsStarted:1,createdAt:1,updatedAt:2}})
 expect(projection?.goal.phase).toBe(phase)
 return projection
}
function message(id,text,source={kind:'user'},steering=false){
 const data=classifier.start({}, {event:{type:'user/message',seq:1,time:1,data:{id,source,content:[{type:'text',text}]}}},{previous:()=>({state:{claimed:new Set(steering?[id]:[])}})})
 return [id,{kind:data.kind,data}]
}
function snapshot(extra=[]){
 const entries=[message('original','原始用户要求'),message('latest','核对现金流并交付两句结论'),...extra]
 return {running:true,hasMore:false,chat:{order:entries.map(([id])=>id),nodes:new Map(entries)}}
}
function render(projection,state=snapshot()){
 const todos=[{content:'读取现金流',status:'completed'},{content:'输出两句结论',status:'in_progress'}]
 const rendered=dock({useSession:select=>select(state),useProjection:key=>key==='goal'?projection:key==='todos'?todos:null,useInput:select=>select({phase:'plain',draft:'',draftRev:0,imageIds:[],occurrences:[]}),inputActions:{},t:key=>key})
 const panel=rendered.props.children[0]
 expect(panel.type).toBe('panel');expect(panel.props.todos).toBe(todos);expect(panel.props.running).toBe(state.running)
 return panel.props.objective
}
it.each(['complete','paused','blocked'])('does not use the %s Goal as an unrelated current task title',phase=>{
 const state=snapshot([message('auto','自动目标续轮',{kind:'goal',goal:{id:'test-goal',revision:2}}),message('plugin','插件补充说明',{kind:'plugin',plugin:'test'}),message('steer','中途补充约束',{kind:'user'},true)])
 expect(state.chat.nodes.get('auto').kind).toBe('context');expect(state.chat.nodes.get('steer').kind).toBe('steering')
 expect(render(goal(phase),state)).toBe('核对现金流并交付两句结论')
})
it('retains the active Goal title while preserving the no-Goal original-request continuation contract',()=>{
 expect(render(goal('active'))).toBe('旧目标：整理年报')
 const state=snapshot([message('continue','继续')])
 expect(render(null,state)).toBe('原始用户要求')
 expect(render(undefined,state)).toBe('原始用户要求')
})
it('projects only visible human content and does not invent a new title from a partial history',()=>{
 const state=snapshot([message('latest-file','请检查 📎 文件：`/private/goal-title/budget.xlsx`'),message('plugin','内部上下文',{kind:'plugin',plugin:'test'})])
 expect(render(goal('complete'),state)).toBe('请检查 budget.xlsx')
 expect(render(goal('complete'),{...state,hasMore:true})).toBeUndefined()
 expect(render(goal('complete'),{running:false,hasMore:false,chat:{order:[],nodes:new Map()}})).toBeUndefined()
 expect(render(goal('complete'),snapshot([message('malformed','␞SHERLOCK_RESEARCH_FILES_V1 {"files":"/private/broken"')]))).toBeUndefined()
})
it('migrates the prior v3 client once and preserves its continuation guards',()=>{
 const helper='/* sherlock:task-goal-objective:v1 */\n'+declarations.get('odysseyTaskHeaderObjective')+'\n'
 const previous=source.replace(helper,'').replace('const goal=useProjection("goal")?.goal,objective=useSession(snapshot=>odysseyTaskHeaderObjective(snapshot,goal)),running=','const objective=useSession(odysseyTaskObjective),running=').replace('TodoPanel,{todos,running,objective,t}','TodoPanel,{todos,running,objective:odysseyTaskVisibleText(useProjection("goal")?.goal?.objective)||objective,t}')
 expect(previous).not.toContain('function odysseyTaskHeaderObjective(')
 const patched=patchTaskProgressClient(previous)
 expect(patched).toBe(source);expect(patchTaskProgressClient(patched)).toBe(source)
 expect(patched.match(/function odysseyTaskHeaderObjective\(/g)).toHaveLength(1)
 expect(patched).toContain('input.draftRev!==clicked.current.revision')
 expect(patched).toContain('if(clicked.current||blocked)return')
})

it('rejects a partial or drifted owned objective install instead of silently leaving an incorrect title',()=>{
 expect(()=>patchTaskProgressClient(source.replace('goal?.phase==="active"','goal?.phase==="complete"'))).toThrow('installation drifted')
 expect(()=>patchTaskProgressClient(source.replace('/* sherlock:task-goal-objective:v1 */',''))).toThrow('installation is incomplete')
 expect(()=>patchTaskProgressClient(source+'\n/* sherlock:task-goal-objective:v1 */')).toThrow('installation drifted')
})
