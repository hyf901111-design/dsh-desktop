export const SKILL_COMMAND_MENU_CSS = '.mufS8W_card[data-ework-command=skills]{width:min(360px,100%)}.mufS8W_card[data-ework-command=skills] .mufS8W_row{flex-direction:column;align-items:stretch;gap:2px;padding:7px 9px}.mufS8W_card[data-ework-command=skills] .mufS8W_label{flex:none;line-height:20px}.mufS8W_card[data-ework-command=skills] .mufS8W_detail{display:block;min-width:0;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mufS8W_card[data-ework-command=skills] .mufS8W_viewport::-webkit-scrollbar{width:4px}'
const SETTLEMENT_CSS='/* ework:skill-command-settlement:css */.mufS8W_card [data-ework-skill-applying]{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.mufS8W_card[data-ework-command=skills][aria-busy=true]{cursor:progress}.mufS8W_card[data-ework-command=skills][aria-busy=true] [aria-selected=true]{opacity:.55;pointer-events:none}'
import {patchCommandPopupSurface} from './command-popup-surface.mjs'
import {patchExpandedCommandMenu} from './expanded-command-menu.mjs'
import {patchCommandMenuSelection} from './command-menu-selection.mjs'
const replace=(source,anchor,next)=>{
 if(source.split(anchor).length!==2)throw Error('Skill command menu anchor missing or ambiguous: '+anchor.slice(0,65))
 return source.replace(anchor,next)
}
export function patchSkillCommandPopup(source){
 const marker='/* ework:skill-command-popup:v1 */'
 if(source.includes(marker))return patchCommandPopupSurface(patchSkillCommandSettlement(patchExpandedCommandMenu(source,'skills')))
 const open='this.popupFor(actx).open(name, ui, session, segment);'
 source=replace(source,open,`${marker}\nthis.popupFor(actx).open(name, ui, name === "skills" ? {...session, skillCommandSegment:segment} : session, segment);`)
 source=replace(source,'"aria-label": t("overlay.aria", { command: String(state.command) }),','"aria-label": t("overlay.aria", { command: String(state.command) }),\n"data-ework-command": state.command,')
 source=replace(source,'placeholder: t("search.placeholder"),','placeholder: state.command === "skills" ? (document.documentElement.dataset.odysseyLocale === "en" ? "Search skills…" : "搜索技能…") : t("search.placeholder"),')
 source=replace(source,'className: PopupSelectView_module_css_default.detail,','className: PopupSelectView_module_css_default.detail,\ntitle: state.command === "skills" ? option.detail : undefined,')
 const match=/const css = ("[^\n]+");/u.exec(source)
 if(!match)throw Error('Skill command popup CSS anchor missing')
 return patchCommandPopupSurface(patchSkillCommandSettlement(patchExpandedCommandMenu(source.replace(match[0],'const css = '+JSON.stringify(JSON.parse(match[1])+SKILL_COMMAND_MENU_CSS)+';'),'skills')))
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
