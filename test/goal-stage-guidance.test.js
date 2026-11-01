import {afterEach,expect,it} from 'vitest'
import {createRequire} from 'node:module'
import {readFile,mkdtemp,writeFile,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const {patchGoalToolGuidance,patchGoalRoundGuidance,stripGoalToolGuidance,stripGoalRoundGuidance}=createRequire(import.meta.url)('../scripts/lib/goal-stage-guidance.mjs')
const {foldGoal}=createRequire(import.meta.url)('@deepseek-ai/dsh-goal')
const baseline=process.env.SHERLOCK_GOAL_GUIDANCE_BASELINE==='1'
const roots=[]
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function actual(){
 const root=await mkdtemp(join(tmpdir(),'goal-guidance-sdk-'));roots.push(root)
 await symlink(join(process.cwd(),'node_modules'),join(root,'node_modules'))
 const sourceTool=stripGoalToolGuidance(await readFile('node_modules/@deepseek-ai/dsh-tool-goal/lib/index.js','utf8'))
 const sourceRound=stripGoalRoundGuidance(await readFile('node_modules/@deepseek-ai/dsh-goal-round-driver/lib/index.js','utf8'))
 await writeFile(join(root,'tool.mjs'),baseline?sourceTool:patchGoalToolGuidance(sourceTool))
 await writeFile(join(root,'round.mjs'),baseline?sourceRound:patchGoalRoundGuidance(sourceRound))
 const tool=await import(pathToFileURL(join(root,'tool.mjs')).href),driver=await import(pathToFileURL(join(root,'round.mjs')).href)
 const sections=[],tools=[]
 return{sourceTool,sourceRound,driver,policy(blockedAfter=3){
  sections.length=0;tools.length=0
  tool.apply({systemPrompt:{section:s=>sections.push(s)},tools:{register:t=>tools.push(t)}},{blockedAfterConsecutiveRounds:blockedAfter})
  expect(sections).toHaveLength(1);expect(sections[0].name).toBe('tool:goal')
  expect(tools.map(t=>t.name)).toEqual(['get_goal','create_goal','update_goal'])
  return sections[0].text
 }}
}
function actualGoal(){
 return foldGoal([{type:'goal/change',seq:1,time:1,data:{kind:'goal/change',version:1,operation:'create',goal:{id:'goal-guidance-qa',revision:1,objective:'先登记目标；后续每个自动轮只推进当前允许的一项。',phase:'active',maxGoalRounds:6},roundsStarted:0,createdAt:1,updatedAt:1}},{type:'user/message',seq:2,time:2,data:{source:{kind:'goal',goalId:'goal-guidance-qa',revision:1,round:1},content:[]}}]).goal
}
it('emits setup-only and normal immediate-work boundaries once from the actual registered Goal policy',async()=>{
 const f=await actual(),text=f.policy()
 expect(text).toContain('Creating or configuring a goal does not make the current human turn an automatic goal round')
 expect(text).toContain('If the human asks only to establish the goal in this turn, finish that setup without starting objective work')
 expect(text).toContain('If the human permits immediate work, proceed normally')
 expect(text.match(/Goal phases and truthful reporting:/g)).toHaveLength(1)
 expect(text).toContain('do not describe a violated execution constraint as satisfied')
})
it.each([3,5])('uses deployment threshold %i for the same missing-human-input blocker without allowing early blocking',async threshold=>{
 const f=await actual(),text=f.policy(threshold)
 expect(text).toContain(`Mark blocked only after the same blocking condition persists for at least ${threshold} consecutive goal rounds`)
 expect(text).toContain(`Once it has persisted for at least ${threshold} consecutive goal rounds, call get_goal and mark blocked`)
 expect(text).toContain('Before that threshold, do not block early or mark an unmet goal complete')
 expect(text).toContain('Do not manufacture work or repeatedly re-read unchanged known results merely to stay active')
 expect(text).toContain('the only remaining action needs missing human information or approval, and no permitted independent work can advance the objective')
})
it('keeps useful unfinished analysis and difficult or slow work eligible to continue',async()=>{
 const f=await actual(),text=f.policy()
 expect(text).toContain('difficulty, uncertainty, or useful remaining work is not blocked')
 expect(text).toContain('Useful analysis, permitted read-only research, difficult work, elapsed time, and a lack of file writes are not by themselves a blocker or lack of progress')
 expect(text).toContain('If useful permitted work remains, continue it')
 expect(text).toContain("Preserve the user's pause, stop, permissions, and scope")
})
it('renders the real admitted Goal round identity separately from human setup or model/tool steps',async()=>{
 const f=await actual(),goal=actualGoal(),source={kind:'goal',goalId:goal.id,revision:goal.revision,round:2}
 const text=f.driver.renderGoalRoundPrompt(goal,source.round)[0].text
 expect(text).toContain(`Objective: ${JSON.stringify(goal.objective)}`)
 expect(text).toContain('Round: 2/6')
 expect(text).toContain('Admission: this is automatic goal round 2; human setup turns and model/tool steps are not automatic rounds')
 expect(text).toContain('This prompt does not override explicit user phase or per-round constraints')
 expect(text).toContain('Make permitted concrete progress and verify the result')
 expect(text).toContain('If work remains, leave the goal active for the next round')
 expect(text).toContain('read the current goal, and mark it complete')
 // Detailed rules remain solely in tool:goal, not repeated in each round prompt.
 expect(text).not.toContain('Goal phases and truthful reporting:')
 expect(text).not.toContain('Waiting for human input:')
})
it('changes only the two textual policy producers, preserves strict rc7 inverse/idempotence, and rejects drift',async()=>{
 const f=await actual()
 for(const[clean,patch,strip,marker]of[[f.sourceTool,patchGoalToolGuidance,stripGoalToolGuidance,'sherlock:goal-tool-stage-guidance:rc7:v1'],[f.sourceRound,patchGoalRoundGuidance,stripGoalRoundGuidance,'sherlock:goal-round-identity:rc7:v1']]){
  const next=patch(clean)
  expect(patch(next)).toBe(next);expect(strip(next)).toBe(clean)
  expect(()=>patch(next.replace(marker,''))).toThrow(/partial|drift/)
  expect(()=>patch(next+'\n/* '+marker+' */')).toThrow(/partial|drift/)
  expect(()=>patch(clean+'\n// unknown vendor edit')).toThrow(/drift/)
  const apply=clean.slice(clean.indexOf('function apply('))
  expect(next).toContain(apply)
 }
})
