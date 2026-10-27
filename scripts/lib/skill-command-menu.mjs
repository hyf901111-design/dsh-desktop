export const SKILL_COMMAND_MENU_CSS = '.mufS8W_card[data-ework-command=skills]{width:min(360px,100%)}.mufS8W_card[data-ework-command=skills] .mufS8W_row{flex-direction:column;align-items:stretch;gap:2px;padding:7px 9px}.mufS8W_card[data-ework-command=skills] .mufS8W_label{flex:none;line-height:20px}.mufS8W_card[data-ework-command=skills] .mufS8W_detail{display:block;min-width:0;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mufS8W_card[data-ework-command=skills] .mufS8W_viewport::-webkit-scrollbar{width:4px}'
const SETTLEMENT_CSS='/* ework:skill-command-settlement:css */.mufS8W_card [data-ework-skill-applying]{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.mufS8W_card[data-ework-command=skills][aria-busy=true]{cursor:progress}.mufS8W_card[data-ework-command=skills][aria-busy=true] [aria-selected=true]{opacity:.55;pointer-events:none}'
import {readFileSync} from 'node:fs'
import {patchCommandPopupSurface} from './command-popup-surface.mjs'
import {patchExpandedCommandMenu} from './expanded-command-menu.mjs'
import {patchCommandMenuSelection} from './command-menu-selection.mjs'
const replace=(source,anchor,next)=>{
 if(source.split(anchor).length!==2)throw Error('Skill command menu anchor missing or ambiguous: '+anchor.slice(0,65))
 return source.replace(anchor,next)
}
export function patchSkillCommandPopup(source){
 const marker='/* ework:skill-command-popup:v1 */'
 if(source.includes(marker))return patchCommandPopupSurface(patchSkillCommandArtwork(patchSkillCommandSettlement(patchExpandedCommandMenu(source,'skills'))))
 const open='this.popupFor(actx).open(name, ui, session, segment);'
 source=replace(source,open,`${marker}\nthis.popupFor(actx).open(name, ui, name === "skills" ? {...session, skillCommandSegment:segment} : session, segment);`)
 source=replace(source,'"aria-label": t("overlay.aria", { command: String(state.command) }),','"aria-label": t("overlay.aria", { command: String(state.command) }),\n"data-ework-command": state.command,')
 source=replace(source,'placeholder: t("search.placeholder"),','placeholder: state.command === "skills" ? (document.documentElement.dataset.odysseyLocale === "en" ? "Search skills…" : "搜索技能…") : t("search.placeholder"),')
 source=replace(source,'className: PopupSelectView_module_css_default.detail,','className: PopupSelectView_module_css_default.detail,\ntitle: state.command === "skills" ? option.detail : undefined,')
 const match=/const css = ("[^\n]+");/u.exec(source)
 if(!match)throw Error('Skill command popup CSS anchor missing')
 return patchCommandPopupSurface(patchSkillCommandArtwork(patchSkillCommandSettlement(patchExpandedCommandMenu(source.replace(match[0],'const css = '+JSON.stringify(JSON.parse(match[1])+SKILL_COMMAND_MENU_CSS)+';'),'skills'))))
}
function patchSkillCommandArtwork(source){
 const start='/* ework:skill-command-artwork:v1 */',end='/* ework:skill-command-artwork:end */'
 const attribute='"data-ework-skill-art": state.command === "skills" ? (option.id === "builtin:efund-ppt-maker" ? "ppt" : option.id === "builtin:ework-equity-research" ? "report" : undefined) : undefined,'
 const anchor='className: clsx(PopupSelectView_module_css_default.row, index === state.active && PopupSelectView_module_css_default.rowActive),'
 const css=start+'.mufS8W_card[data-ework-command=skills] .mufS8W_row[data-ework-skill-art]{position:relative;padding-left:57px}.mufS8W_row[data-ework-skill-art]>.odyssey-deliverable-preview{left:8px;top:50%;width:40px;height:40px;transform:translateY(-50%)}.mufS8W_row[data-ework-skill-art] .odyssey-deliverable-artboard{left:50%;top:50%;transform:translate(-50%,-50%) scale(.31)}'+end
 const assets=Object.fromEntries(['template','logo'].map(name=>[name,'data:image/png;base64,'+readFileSync(new URL('../../src/preload/input-deliverable-assets/efund-'+name+'.png',import.meta.url)).toString('base64')]))
 // Read the shared renderer verbatim: Vite and Node stringify functions differently.
 const renderers=[...readFileSync(new URL('./figma-composer-deliverable-preview.mjs',import.meta.url),'utf8').matchAll(/^export (function renderComposerDeliverablePreview\([\s\S]*?^\})/gm)]
 if(renderers.length!==1)throw Error('Shared skill artwork renderer drifted')
 const definitions='/* ework:skill-command-artwork:definitions */\nconst skillCommandArtworkAssets = '+JSON.stringify(assets)+';\n'+renderers[0][1]+'\n/* ework:skill-command-artwork:definitions:end */\n'
 const children='children: [\nstate.command === "skills" && (option.id === "builtin:efund-ppt-maker" || option.id === "builtin:ework-equity-research") && renderComposerDeliverablePreview(react_jsx_runtime, option.id === "builtin:efund-ppt-maker" ? "ppt" : "report", skillCommandArtworkAssets),'
 const match=/const css = ("[^\n]+");/u.exec(source)
 if(!match)throw Error('Skill artwork CSS anchor missing')
 let value=JSON.parse(match[1])
 if(source.includes('data-ework-skill-art')){
  if(source.split(attribute).length!==2||source.split('"data-ework-skill-art":').length!==2||value.split(start).length!==2||value.split(end).length!==2||!value.includes(css)||source.split(definitions).length!==2||source.split('/* ework:skill-command-artwork:definitions */').length!==2||source.split('/* ework:skill-command-artwork:definitions:end */').length!==2||source.split(children).length!==2)throw Error('Skill artwork installed source drifted')
  return source
 }
 if(value.includes(start)||value.includes(end)||source.includes('skill-command-artwork:definitions')||source.includes('skillCommandArtworkAssets'))throw Error('Skill artwork orphan CSS')
 const from=source.indexOf(anchor),label=source.indexOf('children: [',from)
 if(from<0||label<0||label>source.indexOf('children: option.label',from))throw Error('Skill artwork row children drifted')
 source=source.slice(0,label)+source.slice(label).replace('children: [',children)
 source=replace(source,anchor,anchor+'\n'+attribute)
 return replace(source.replace(match[0],'const css = '+JSON.stringify(value+css)+';'),'function PopupSelectView(',definitions+'function PopupSelectView(')
}
function patchSkillCommandSettlement(source){
 const marker='/* ework:skill-command-settlement:v1 */'
 if(source.includes(marker))return source
 source=replace(source,'"data-ework-command": state.command,','"data-ework-command": state.command,\n"aria-busy": state.command === "skills" && state.submitting || undefined,')
 source=replace(source,'state.submitting && (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\tclassName: PopupSelectView_module_css_default.status,',`${marker}\nstate.submitting && (0, react_jsx_runtime.jsx)("div", {\n                        role: state.command === "skills" ? "status" : undefined,\n                        "data-ework-skill-applying": state.command === "skills" ? "" : undefined,\n\t\t\t\t\t\tclassName: PopupSelectView_module_css_default.status,`)
 const css=/const css = ("[^\n]+");/u.exec(source)
 if(!css)throw Error('Skill settlement CSS anchor missing')
 return source.replace(css[0],'const css = '+JSON.stringify(JSON.parse(css[1])+SETTLEMENT_CSS)+';')
}
export function patchSkillCommandLabels(source){
 const marker='/* ework:skill-command-labels:v1 */'
 if(source.includes(marker))return patchCommandMenuSelection(patchExpandedCommandMenu(source,'commands'))
 source=replace(source,'"command.model.name": "模型",',`${marker}\n"command.skills.name":"技能",\n"command.skills.description":"选择在对话中使用的技能",\n"command.model.name": "模型",`)
 return patchCommandMenuSelection(patchExpandedCommandMenu(replace(source,'"command.model.name": "model",','"command.skills.name":"Skills",\n"command.skills.description":"Choose a skill for this conversation",\n"command.model.name": "model",'),'commands'))
}
