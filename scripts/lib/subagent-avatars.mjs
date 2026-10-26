import {readFileSync} from 'node:fs'
import {copyFile,mkdir,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {dirname,join,resolve} from 'node:path'

const assetRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../build/brand/subagent-avatars')
const manifest=JSON.parse(readFileSync(join(assetRoot,'manifest.json'),'utf8'))
if(manifest.version!==1||manifest.characters?.length!==30||new Set(manifest.characters.map(r=>r.key)).size!==30||manifest.characters.some(r=>!/^[a-z-]+\.png$/.test(r.file)||typeof r.name!=='string'||typeof r.englishName!=='string'))throw Error('Subagent avatar asset manifest drifted')
if(manifest.decorations?.length!==4||manifest.decorations.some(r=>! /^(track|arc)-(20|24)\.svg$/.test(r.file))||new Set(manifest.decorations.map(r=>r.file)).size!==4)throw Error('Subagent ring asset manifest drifted')
const roles=manifest.characters.map(({key,name,englishName,file})=>({key,name,englishName,file}))
const prefix='sherlock:subagent-avatars'
// A literal generated block has identical bytes under Node and test transforms.
// Every native entry receives this same stateless implementation.
const definition='/* '+prefix+':definition:v1 */\nconst ODYSSEY_SUBAGENT_ROLES = '+JSON.stringify(roles)+';\n'+String.raw`function odysseySubagentRole(id) {
  if (typeof id !== 'string' || !id || id.length > 256) return null;
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  return ODYSSEY_SUBAGENT_ROLES[hash % ODYSSEY_SUBAGENT_ROLES.length];
}
function OdysseySubagentAvatar({sessionId, activity, size = 32, statusLabel}) {
  const role = odysseySubagentRole(sessionId);
  if (!role) return null;
  const compact = size === 24, running = activity === 'running';
  return react_jsx_runtime.jsx('span', {
    className: 'odyssey-subagent-avatar-slot',
    'data-odyssey-subagent-avatar': '', 'data-child-session-id': sessionId,
    'data-avatar-role': role.key, 'data-avatar-size': compact ? '24' : '32',
    'data-avatar-state': running ? 'running' : 'idle', 'aria-hidden': true,
    title: role.name + ' / ' + role.englishName + (statusLabel ? ' · ' + statusLabel : ''),
    children: react_jsx_runtime.jsxs('span', {className: 'odyssey-subagent-avatar-art', children: [
      react_jsx_runtime.jsx('img', {className: 'odyssey-subagent-avatar-image', src: '/subagent-avatars/' + role.file, width: 32, height: 32, alt: '', draggable: false, decoding: 'async'}),
      running ? react_jsx_runtime.jsxs('span', {className: 'odyssey-subagent-avatar-ring', children: [
        react_jsx_runtime.jsx('span', {className: 'odyssey-subagent-avatar-track'}),
        react_jsx_runtime.jsx('span', {className: 'odyssey-subagent-avatar-arc'})
      ]}) : null
    ]})
  });
}
`+'/* '+prefix+':definition:end */\n'
const hooks={
 catalog:{anchor:'function CatalogRows(',before:'(0, react_jsx_runtime.jsx)("span", { "data-odyssey-subagent-activity": entry.activity === "running" ? "running" : "idle", "aria-hidden": "true" })',after:'/* sherlock:subagent-avatars:catalog:v1 */(0, react_jsx_runtime.jsx)(OdysseySubagentAvatar, { sessionId: entry.id, activity: entry.activity, size: 32, statusLabel: activity })/* sherlock:subagent-avatars:catalog:end */'},
 detail:{anchor:'function OdysseySubagentPanelHeader(',before:"react_jsx_runtime.jsx('span',{'data-odyssey-subagent-activity':session.running?'running':'idle','aria-hidden':true})",after:"/* sherlock:subagent-avatars:detail:v1 */react_jsx_runtime.jsx(OdysseySubagentAvatar, { sessionId: sessionId, activity: session.running ? 'running' : 'inactive', size: 24, statusLabel: session.running ? '正在运行' : '当前未运行' })/* sherlock:subagent-avatars:detail:end */"},
 'task-tree':{anchor:'function CatalogLoadingRows(',replacements:[
  {before:'(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {\n\t\t\t\t\tstate: summary.running === true ? "ongoing" : "done",\n\t\t\t\t\tclassName: SubagentView_module_css_default.subagentDot\n\t\t\t\t})',after:'/* sherlock:subagent-avatars:task-tree-loading:v1 */(0, react_jsx_runtime.jsx)(OdysseySubagentAvatar, { sessionId: summary.id, activity: summary.running === true ? "running" : "inactive", size: 24, statusLabel: summary.running === true ? t("subagentRunning") : t("subagentInactive") })/* sherlock:subagent-avatars:task-tree-loading:end */'},
  {before:'(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {\n\t\t\t\t\t\t\t\tstate: entry.activity === "running" ? "ongoing" : "done",\n\t\t\t\t\t\t\t\tclassName: SubagentView_module_css_default.subagentDot\n\t\t\t\t\t\t\t})',after:'/* sherlock:subagent-avatars:task-tree-child:v1 */(0, react_jsx_runtime.jsx)(OdysseySubagentAvatar, { sessionId: entry.id, activity: entry.activity, size: 24, statusLabel: entry.activity === "running" ? t("subagentRunning") : t("subagentInactive") })/* sherlock:subagent-avatars:task-tree-child:end */'}
 ]}
}
function hookFor(kind){const hook=hooks[kind];if(!hook)throw Error('Subagent avatar kind drifted');return hook}
function replacementsFor(hook){return hook.replacements??[hook]}
function count(source,token){return source.split(token).length-1}
export function stripSubagentAvatars(source,kind){
 const hook=hookFor(kind),replacements=replacementsFor(hook)
 if(!source.includes(prefix))return source
 if(count(source,definition)!==1||replacements.some(value=>count(source,value.after)!==1))throw Error('Subagent avatar installed source drifted')
 let stripped=source.replace(definition,'')
 for(const value of replacements)stripped=stripped.replace(value.after,value.before)
 if(stripped.includes(prefix))throw Error('Subagent avatar duplicate or unknown marker drifted')
 return stripped
}
export function patchSubagentAvatars(source,kind){
 const hook=hookFor(kind),bare=stripSubagentAvatars(source,kind),replacements=replacementsFor(hook)
 if(count(bare,hook.anchor)!==1||replacements.some(value=>count(bare,value.before)!==1))throw Error('Subagent avatar native hook drifted: '+kind)
 let installed=bare.replace(hook.anchor,definition+hook.anchor)
 for(const value of replacements)installed=installed.replace(value.before,value.after)
 return installed
}
export async function copySubagentAvatarAssets(destination){
 const directory=join(destination,'subagent-avatars');await mkdir(directory,{recursive:true})
 for(const role of manifest.characters){
  const source=join(assetRoot,role.file),bytes=await readFile(source)
  if(!bytes.length||createHash('sha256').update(bytes).digest('hex')!==role.sha256)throw Error('Subagent avatar asset drifted: '+role.file)
  await copyFile(source,join(directory,role.file))
 }
 for(const layer of manifest.decorations){
  const source=join(assetRoot,layer.file),bytes=await readFile(source)
  if(!bytes.length||createHash('sha256').update(bytes).digest('hex')!==layer.sha256)throw Error('Subagent ring asset drifted: '+layer.file)
  await copyFile(source,join(directory,layer.file))
 }
 await copyFile(join(assetRoot,'manifest.json'),join(directory,'manifest.json'))
}
