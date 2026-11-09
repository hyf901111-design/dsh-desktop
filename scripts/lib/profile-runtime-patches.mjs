import {patchCanvasTaskNotices} from './canvas-task-notices.mjs'
import {patchTaskProgressRuntime} from './task-progress-runtime.mjs'
import {patchPlanPendingReplay} from './plan-mode-pending-replay.mjs'
import {patchGoalToolGuidance,patchGoalRoundGuidance} from './goal-stage-guidance.mjs'
import {patchBashBackgroundLifecycle} from './bash-background-lifecycle.mjs'
import {patchMemoryRequestContext} from './memory-request-context.mjs'
import {patchHumanSteeringYield} from './human-steering-yield.mjs'
import {patchNoteFeedbackHost} from './notes-reply-actions.mjs'
import {patchOpenAIResponsesToolOptionals} from './openai-responses-tool-optionals.mjs'
import {readFile,writeFile,readdir,realpath} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'

// These packages also exist in the independent plugin dependency tree. Copy
// only the patched entry, and fail on version drift instead of mixing APIs.
const entries = [
  ['@earendil-works/pi-ai', '/* sherlock:openai-responses-tool-optionals:v1 */', true, 'dist/api/openai-responses.js'],
  ['@deepseek-ai/dsh-agent-loop', '/* ework:memory-request-context:rc7:v1 */', true],
  ['@deepseek-ai/dsh-subagent', '/* CANVAS_TASK_OWNED_SETTLEMENT */', true],
  ['@deepseek-ai/dsh-tool-todo', '/* sherlock:task-progress-sync:v1 */', true],
  ['@deepseek-ai/dsh-plan-mode', '/* sherlock:plan-pending-replay:rc7:v1 */', true],
  ['@deepseek-ai/dsh-tool-goal', '/* sherlock:goal-tool-stage-guidance:rc7:v1 */', true],
  ['@deepseek-ai/dsh-goal-round-driver', '/* sherlock:goal-round-identity:rc7:v1 */', true],
  ['@deepseek-ai/dsh-tool-bash', '/* sherlock:bash-background-lifecycle:v1 */', true],
  ['@deepseek-ai/dsh-message-feedback', '/* ework:note-feedback-target:v1 */', true],
  ['@deepseek-ai/dsh-llm', 'function toolImagesAsText(message)'],
  ['@deepseek-ai/dsh-tool-fs', 'The LLM boundary handles text-only model projection.', true],
  ['@deepseek-ai/dsh-skill', 'registerCandidatePolicy(policy)']
]
// pnpm may place peer-dependent copies beside the top-level link. The policy must
// exist in every registry copy used by a preset, not only in the app's tree.
async function skillCopies(modulesRoot, packageName='@deepseek-ai/dsh-skill') {
  const pending=[modulesRoot],seenRoots=new Set(),targets=new Set()
  const boundary=await realpath(modulesRoot)
  const addTarget=async target=>{const resolved=await realpath(target);if(!resolved.startsWith(boundary+path.sep))throw Error('Plugin runtime patch target escapes the profile');targets.add(resolved)}
  while(pending.length){
    const root=pending.pop()
    let canonical
    try{canonical=await realpath(root)}catch(error){if(error.code==='ENOENT')continue;throw error}
    if(seenRoots.has(canonical))continue
    seenRoots.add(canonical)
    if(canonical!==boundary&&!canonical.startsWith(boundary+path.sep))throw Error('Plugin runtime dependency tree escapes the profile')
    try{await addTarget(path.join(root,packageName))}catch(error){if(error.code!=='ENOENT')throw error}
    let stores=[]
    try{stores=await readdir(path.join(root,'.pnpm'))}catch(error){if(error.code!=='ENOENT')throw error}
    for(const name of stores)if(name.startsWith(packageName.replace('/','+')+'@')){
      try{await addTarget(path.join(root,'.pnpm',name,'node_modules',packageName))}catch(error){if(error.code!=='ENOENT')throw error}
    }
    for(const entry of await readdir(root,{withFileTypes:true})){
      if(entry.name.startsWith('.'))continue
      const packageRoot=path.join(root,entry.name)
      if(entry.name.startsWith('@')){
        for(const child of await readdir(packageRoot))pending.push(path.join(packageRoot,child,'node_modules'))
      }else pending.push(path.join(packageRoot,'node_modules'))
    }
  }
  return [...targets].sort()
}
async function sources(projectRoot, modulesRoot) {
  return (await Promise.all(entries.map(async ([name, marker, optional, entry = 'lib/index.js']) => {
    const sourceRoot = path.join(projectRoot, 'node_modules', name)
    const targetRoot = path.join(modulesRoot, name)
    // The host driver is optional in a preset, but a legal nested dependency
    // can shadow the patched host fallback even without a top-level link.
    const goalRoundTargets = name === '@deepseek-ai/dsh-goal-round-driver' ? await skillCopies(modulesRoot, name) : null
    if (optional && goalRoundTargets?.length === 0) return null
    let targetManifest
    try { targetManifest = await readFile(path.join(goalRoundTargets?.[0] ?? targetRoot, 'package.json'), 'utf8') }
    catch (error) { if (optional && goalRoundTargets === null && error.code === 'ENOENT') return null; throw error }
    const [sourceManifest, originalSource] = await Promise.all([
      readFile(path.join(sourceRoot, 'package.json'), 'utf8'),
      readFile(path.join(sourceRoot, entry), 'utf8')
    ])
    const source = name === '@earendil-works/pi-ai' ? patchOpenAIResponsesToolOptionals(originalSource) : name === '@deepseek-ai/dsh-agent-loop' ? patchHumanSteeringYield(patchMemoryRequestContext(originalSource)) : name === '@deepseek-ai/dsh-goal-round-driver' ? patchGoalRoundGuidance(originalSource) : name === '@deepseek-ai/dsh-tool-goal' ? patchGoalToolGuidance(originalSource) : name === '@deepseek-ai/dsh-tool-todo' ? patchTaskProgressRuntime(originalSource) : name === '@deepseek-ai/dsh-plan-mode' ? patchPlanPendingReplay(originalSource) : name === '@deepseek-ai/dsh-tool-bash' ? patchBashBackgroundLifecycle(originalSource) : name === '@deepseek-ai/dsh-subagent' ? patchCanvasTaskNotices(originalSource) : name === '@deepseek-ai/dsh-message-feedback' ? patchNoteFeedbackHost(originalSource) : originalSource
    if (JSON.parse(sourceManifest).version !== JSON.parse(targetManifest).version) throw Error(`Plugin runtime version mismatch: ${name}`)
    if (!source.includes(marker)) throw Error(`Required runtime patch missing: ${name}`)
    const targets=goalRoundTargets??(['@earendil-works/pi-ai','@deepseek-ai/dsh-skill','@deepseek-ai/dsh-agent-loop','@deepseek-ai/dsh-tool-bash','@deepseek-ai/dsh-plan-mode','@deepseek-ai/dsh-tool-goal','@deepseek-ai/dsh-goal-round-driver'].includes(name)?await skillCopies(modulesRoot,name):[targetRoot])
    const files=[]
    for(const target of targets){
      if(JSON.parse(await readFile(path.join(target,'package.json'),'utf8')).version!==JSON.parse(sourceManifest).version)throw Error(`Plugin runtime version mismatch: ${name}`)
      files.push({name,source,target:path.join(target,entry)})
    }
    return files
  }))).filter(Boolean).flat()
}
export async function syncProfileRuntimePatches(projectRoot, profileRoot) {
  const files = await sources(projectRoot, path.join(profileRoot, 'node_modules'))
  const hash = createHash('sha256')
  for (const file of files) {
    await writeFile(file.target, file.source)
    hash.update(file.name + '\0').update(file.source)
  }
  return hash.digest('hex')
}
export async function verifyProfileRuntimePatches(projectRoot, modulesRoot) {
  for (const file of await sources(projectRoot, modulesRoot)) {
    if (await readFile(file.target, 'utf8') !== file.source) throw Error(`Plugin runtime patch parity failed: ${file.name}`)
  }
}
