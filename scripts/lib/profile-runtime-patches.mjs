import {patchCanvasTaskNotices} from './canvas-task-notices.mjs'
import {patchTaskProgressRuntime} from './task-progress-runtime.mjs'
import {patchNoteFeedbackHost} from './notes-reply-actions.mjs'
import {readFile,writeFile,readdir,realpath} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'

// These packages also exist in the independent plugin dependency tree. Copy
// only the patched entry, and fail on version drift instead of mixing APIs.
const entries = [
  ['@deepseek-ai/dsh-subagent', '/* CANVAS_TASK_OWNED_SETTLEMENT */', true],
  ['@deepseek-ai/dsh-tool-todo', '/* sherlock:task-progress-sync:v1 */', true],
  ['@deepseek-ai/dsh-message-feedback', '/* ework:note-feedback-target:v1 */', true],
  ['@deepseek-ai/dsh-llm', 'function toolImagesAsText(message)'],
  ['@deepseek-ai/dsh-tool-fs', 'The LLM boundary handles text-only model projection.', true],
  ['@deepseek-ai/dsh-skill', 'registerCandidatePolicy(policy)']
]
// pnpm may place peer-dependent copies beside the top-level link. The policy must
// exist in every registry copy used by a preset, not only in the app's tree.
async function skillCopies(modulesRoot) {
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
    try{await addTarget(path.join(root,'@deepseek-ai/dsh-skill'))}catch(error){if(error.code!=='ENOENT')throw error}
    let stores=[]
    try{stores=await readdir(path.join(root,'.pnpm'))}catch(error){if(error.code!=='ENOENT')throw error}
    for(const name of stores)if(name.startsWith('@deepseek-ai+dsh-skill@')){
      try{await addTarget(path.join(root,'.pnpm',name,'node_modules/@deepseek-ai/dsh-skill'))}catch(error){if(error.code!=='ENOENT')throw error}
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
  return (await Promise.all(entries.map(async ([name, marker, optional]) => {
    const sourceRoot = path.join(projectRoot, 'node_modules', name)
    const targetRoot = path.join(modulesRoot, name)
    let targetManifest
    try { targetManifest = await readFile(path.join(targetRoot, 'package.json'), 'utf8') }
    catch (error) { if (optional && error.code === 'ENOENT') return null; throw error }
    const [sourceManifest, originalSource] = await Promise.all([
      readFile(path.join(sourceRoot, 'package.json'), 'utf8'),
      readFile(path.join(sourceRoot, 'lib/index.js'), 'utf8')
    ])
    const source = name === '@deepseek-ai/dsh-tool-todo' ? patchTaskProgressRuntime(originalSource) : name === '@deepseek-ai/dsh-subagent' ? patchCanvasTaskNotices(originalSource) : name === '@deepseek-ai/dsh-message-feedback' ? patchNoteFeedbackHost(originalSource) : originalSource
    if (JSON.parse(sourceManifest).version !== JSON.parse(targetManifest).version) throw Error(`Plugin runtime version mismatch: ${name}`)
    if (!source.includes(marker)) throw Error(`Required runtime patch missing: ${name}`)
    const targets=name==='@deepseek-ai/dsh-skill'?await skillCopies(modulesRoot):[targetRoot]
    const files=[]
    for(const target of targets){
      if(JSON.parse(await readFile(path.join(target,'package.json'),'utf8')).version!==JSON.parse(sourceManifest).version)throw Error(`Plugin runtime version mismatch: ${name}`)
      files.push({name,source,target:path.join(target,'lib/index.js')})
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
