export const SKILL_COMMAND_MENU_CSS = '.mufS8W_card[data-ework-command=skills]{width:min(360px,100%)}.mufS8W_card[data-ework-command=skills] .mufS8W_row{flex-direction:column;align-items:stretch;gap:2px;padding:7px 9px}.mufS8W_card[data-ework-command=skills] .mufS8W_label{flex:none;line-height:20px}.mufS8W_card[data-ework-command=skills] .mufS8W_detail{display:block;min-width:0;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mufS8W_card[data-ework-command=skills] .mufS8W_viewport::-webkit-scrollbar{width:4px}'
const SETTLEMENT_CSS='/* ework:skill-command-settlement:css */.mufS8W_card [data-ework-skill-applying]{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.mufS8W_card[data-ework-command=skills][aria-busy=true]{cursor:progress}.mufS8W_card[data-ework-command=skills][aria-busy=true] [aria-selected=true]{opacity:.55;pointer-events:none}'
import {readFileSync} from 'node:fs'
import {migrateSlashFlyoutOptions} from './slash-command-flyout.mjs'
import {patchCommandPopupSurface} from './command-popup-surface.mjs'
import {patchExpandedCommandMenu} from './expanded-command-menu.mjs'
import {patchCommandMenuSelection} from './command-menu-selection.mjs'
import {categoryIcons, knowledgeDirectoryIcons} from '../../src/shared/knowledge-directory-icons.mjs'
const replace=(source,anchor,next)=>{
 if(source.split(anchor).length!==2)throw Error('Skill command menu anchor missing or ambiguous: '+anchor.slice(0,65))
 return source.replace(anchor,next)
}
export function patchSkillCommandPopup(source){
 source=migrateSlashFlyoutOptions(source)
 const marker='/* ework:skill-command-popup:v1 */'
 if(source.includes(marker))return patchSlashPopupDesign(patchKnowledgePopup(patchCommandPopupSurface(patchSkillCommandArtwork(patchSkillCommandSettlement(patchExpandedCommandMenu(source,'skills'))))))
 const open='this.popupFor(actx).open(name, ui, session, segment);'
 source=replace(source,open,`${marker}\nthis.popupFor(actx).open(name, ui, name === "skills" ? {...session, skillCommandSegment:segment} : session, segment);`)
 source=replace(source,'"aria-label": t("overlay.aria", { command: String(state.command) }),','"aria-label": t("overlay.aria", { command: String(state.command) }),\n"data-ework-command": state.command,')
 source=replace(source,'placeholder: t("search.placeholder"),','placeholder: state.command === "skills" ? (document.documentElement.dataset.odysseyLocale === "en" ? "Search skills…" : "搜索技能…") : t("search.placeholder"),')
 source=replace(source,'className: PopupSelectView_module_css_default.detail,','className: PopupSelectView_module_css_default.detail,\ntitle: state.command === "skills" ? option.detail : undefined,')
 const match=/const css = ("[^\n]+");/u.exec(source)
 if(!match)throw Error('Skill command popup CSS anchor missing')
 return patchSlashPopupDesign(patchKnowledgePopup(patchCommandPopupSurface(patchSkillCommandArtwork(patchSkillCommandSettlement(patchExpandedCommandMenu(source.replace(match[0],'const css = '+JSON.stringify(JSON.parse(match[1])+SKILL_COMMAND_MENU_CSS)+';'),'skills'))))))
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
 if(source.includes(marker))return patchSlashHover(patchKnowledgeLabels(patchCommandMenuSelection(patchExpandedCommandMenu(source,'commands'))))
 source=replace(source,'"command.model.name": "模型",',`${marker}\n"command.skills.name":"技能",\n"command.skills.description":"选择在对话中使用的技能",\n"command.model.name": "模型",`)
 return patchSlashHover(patchKnowledgeLabels(patchCommandMenuSelection(patchExpandedCommandMenu(replace(source,'"command.model.name": "model",','"command.skills.name":"Skills",\n"command.skills.description":"Choose a skill for this conversation",\n"command.model.name": "model",'),'commands'))))
}

function patchSlashHover(source) {
 const marker = '/* ework:slash-hover:v1 */'
 if (source.includes(marker)) return source
 const ref = 'const listRef = (0, react.useRef)(null);'
 source = replace(source, ref, ref + `
 ${marker}
 const hoverTimer = (0, react.useRef)();
 const cancelHover = () => { clearTimeout(hoverTimer.current); hoverTimer.current = undefined; };
 (0, react.useEffect)(() => cancelHover, [state.open, state.generation]);
 const hoverCommand = (event, group, item, index) => {
  cancelHover();
  if (event.nativeEvent.sourceCapabilities?.firesTouchEvents || state.hit?.trigger !== "/" || group.source !== "command" ||
      !["model","permission","skills","knowledge"].includes(item.name)) return;
  const row = event.currentTarget;
  hoverTimer.current = setTimeout(() => {
   hoverTimer.current = undefined;
   const latest = menu.getSnapshot();
   if (row.isConnected && latest.open && latest.generation === state.generation &&
       latest.groups.find(group => group.source === "command")?.items[index]?.name === item.name) {
    onPick(group.source, index);
   }
  }, 220);
 };
 `)
 const row = 'id: optionId(group.source, index),'
 source = replace(source, row, row + `
 "aria-haspopup": state.hit?.trigger === "/" && group.source === "command" &&
    ["model","permission","skills","knowledge"].includes(item.name) ? "listbox" : undefined,
 onMouseEnter: event => hoverCommand(event, group, item, index),
 onMouseLeave: cancelHover,
 `)
 const click = 'ev.preventDefault();\n\t\t\t\t\t\t\t\tonPick(group.source, index);'
 source = replace(source, click, 'ev.preventDefault();\n cancelHover();\n onPick(group.source, index);')
 const css = /const css = ("[^\n]+");/u.exec(source)
 if (!css) throw Error('Primary slash menu CSS anchor missing')
 const styles = `
 [data-ework-command-menu-selection][data-ework-expanded-command]{border-radius:12px!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:#f9f9fa!important}
 body[data-ds-dark-theme] [data-ework-command-menu-selection][data-ework-expanded-command]{background:rgba(41,42,45,.97)!important;border-color:#444549!important}
 `
 return source.replace(css[0], 'const css = ' + JSON.stringify(JSON.parse(css[1]) + styles) + ';')
}

function patchSlashPopupDesign(source) {
 const marker = '/* ework:slash-popup-design:v1 */'
 if (source.includes(marker)) return source
 const backButton = '"data-ework-command-back":true,onClick:goBack,'
 source = replace(source, backButton, backButton + '"aria-label":document.documentElement.dataset.odysseyLocale==="en"?"Back to commands":"返回命令",')
 const back = 'children:document.documentElement.dataset.odysseyLocale==="en"?"‹ Back":"‹ 返回"'
 source = replace(source, back, `children:[directoryIcon('previous'), knowledgeEnglish?'Knowledge Base':isKnowledge?'知识库':
  document.documentElement.dataset.odysseyLocale==="en"?({model:"Model",permission:"Permission",skills:"Skills"})[state.command]:
  ({model:"模型",permission:"权限",skills:"技能"})[state.command]]`)
 const css = /const css = ("[^\n]+");/u.exec(source)
 if (!css) throw Error('Secondary slash menu CSS anchor missing')
 const styles = `
 ${marker}
 body{--ework-slash-surface:#f9f9fa;--ework-slash-line:#dcdcdf}
 body[data-ds-dark-theme]{--ework-slash-surface:#28282a;--ework-slash-line:#454547}
 body .mufS8W_card[data-ework-command=knowledge][data-ework-command-surface][popover]{
   padding:4px!important;border:1px solid var(--ework-slash-line)!important;border-radius:12px!important;
   background:var(--ework-slash-surface)!important;box-shadow:0 8px 12px #0004!important;
   backdrop-filter:none!important;-webkit-backdrop-filter:none!important
 }
 .mufS8W_card[data-ework-command=knowledge]{width:360px!important;min-width:0!important;max-width:min(360px,calc(100vw - 16px))}
 [data-ework-command-back]{display:flex;gap:8px;width:100%;min-height:36px;padding:0 10px;
   border-radius:8px;color:var(--dsw-alias-label-primary);font-size:14px;align-items:center;text-align:start}
 [data-ework-command-back] svg{width:16px;height:16px;flex:none;color:var(--dsw-alias-label-secondary)}
 [data-ework-command=knowledge] .mufS8W_search{margin:3px 10px 0;min-height:28px;width:calc(100% - 20px)}
 [data-ework-command=knowledge] .mufS8W_viewport{scrollbar-width:thin}
 [data-ework-command=knowledge] [data-knowledge-slash-group]{height:26px;padding:0 10px;display:flex;align-items:center;font-size:12px}
 [data-ework-command=knowledge] .mufS8W_row{min-height:34px;padding:0 10px;gap:8px;border-radius:8px;font-size:14px}
 [data-knowledge-shared-parent=true]>svg:last-child{margin-inline-start:auto}
 [data-knowledge-cascading-options]{display:flex;flex-direction:column;width:min(198px,calc(100vw - 16px));
   max-height:min(248px,calc(100vh - 16px));border:1px solid var(--ework-slash-line);border-radius:12px;
   background:var(--ework-slash-surface);scrollbar-width:thin;box-shadow:0 8px 12px #0004}
 [data-knowledge-cascading-options]>button{flex:0 0 34px;min-height:34px;padding:0 10px;gap:8px;border-radius:8px;font-size:14px}
 [data-knowledge-cascading-options]>button[data-knowledge-shared-back]{flex-basis:36px;margin:0;border:0;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:400}
 `
 return source.replace(css[0], 'const css = ' + JSON.stringify(JSON.parse(css[1]) + styles) + ';')
}

function patchKnowledgeLabels(source){
 const marker='/* ework:knowledge-slash-labels */'
 const previous=`children: [commandMenuText(group.source, item, "name", t), group.source==="command" && ["model","permission","skills","knowledge"].includes(item.name) && react_jsx_runtime.jsx('span',{'aria-hidden':true,style:{marginInlineStart:6,opacity:.6},children:'›'})]`
 if(source.includes(marker))source=source.replace(previous,'children: commandMenuText(group.source, item, "name", t)')
 else {
 source=replace(source,'"command.model.name": "模型",',marker+'\n"command.knowledge.name":"知识库",\n"command.model.name": "模型",')
 source=replace(source,'"command.model.name": "model",','"command.knowledge.name":"Knowledge Base",\n"command.model.name": "model",')
 }
 const chevron='data-ework-command-chevron'
 if(source.includes(chevron))return source
 const key='children: commandMenuText(group.source, item, "description", t)\n\t\t\t\t\t\t\t\t})'
 return replace(source,key,key+`, group.source==="command" && ["model","permission","skills","knowledge"].includes(item.name)
   && react_jsx_runtime.jsx('span',{'aria-hidden':true,'${chevron}':true,style:{marginInlineStart:'auto',opacity:.6,flex:'none'},children:'›'})`)
}

const oldKnowledgeSharedPosition = `  style:{position:'fixed',inset:'auto',zIndex:10},
  ref:element=>{if(!element)return;const card=cardRef.current,anchor=card?.querySelector('[data-knowledge-shared-parent=true]');if(!anchor||!card)return;
   const {right,left}=card.getBoundingClientRect(),{top}=anchor.getBoundingClientRect();element.style.left=(right+188<window.innerWidth?right-1:Math.max(8,left-184))+'px';element.style.top=Math.max(8,Math.min(top,window.innerHeight-240))+'px';},`
const knowledgeSharedPosition = `  style:{position:'absolute',inset:'auto',zIndex:10},
  ref:element=>{
   if(!element)return;
   const card=cardRef.current??element.closest('[data-ework-command=knowledge]');
   const anchor=card?.querySelector('[data-knowledge-shared-parent=true]');
   if(!anchor)return;
   const box=card.getBoundingClientRect(),width=element.offsetWidth,height=element.offsetHeight;
   const left=box.right+width-1<=window.innerWidth-8?box.right-1:Math.max(8,box.left-width+1);
   const top=Math.max(8,Math.min(anchor.getBoundingClientRect().top,window.innerHeight-height-8));
   element.style.left=(left-box.left-card.clientLeft)+'px';
   element.style.top=(top-box.top-card.clientTop)+'px';
  },`

function patchKnowledgePopup(source){
 const marker='/* ework:knowledge-slash-options */'
 if(source.includes(marker)){
  if(source.includes(oldKnowledgeSharedPosition))source=replace(source,oldKnowledgeSharedPosition,knowledgeSharedPosition)
  return patchKnowledgeDirectory(patchSlashBack(source))
 }
 const ctx='name === "skills" ? {...session, skillCommandSegment:segment} : session'
 source=replace(source,ctx,ctx.replace(': session',': name === "knowledge" ? {...session,knowledgeCommandSegment:segment} : session'))
 const consume='this.deps.consume(binding.segment);'
 source=replace(source,consume,marker+'\nif(binding.command!=="knowledge")'+consume)
 const ref='const searchRef = (0, react.useRef)(null);'
 source=replace(source,ref,ref+`
 const [shared,setShared]=react.useState(false);
 react.useEffect(()=>{if(!state.open||state.command!=="knowledge")setShared(false)},[state.open,state.command]);
 const isSharedOption=option=>{try{return JSON.parse(option.id).kind==="shared-menu"}catch{return false}};
 const sharedChild=option=>{try{return JSON.parse(option.id).kind==="shared-category"}catch{return false}};
 `)
 const key='popup.select(state.active);'
 source=replace(source,key,`if(state.command==="knowledge"&&isSharedOption(rows[state.active]||{}))setShared(true);else `+key)
 const selected='onClick: () => {\n\t\t\t\t\t\t\t\tpopup.select(index);'
 source=replace(source,selected,selected.replace('popup.select(index);',`if(state.command==="knowledge"&&isSharedOption(option))setShared(true);else popup.select(index);`))
 const mouse='popup.highlight(index);'
 source=replace(source,mouse,mouse+`if(state.command==="knowledge")setShared(isSharedOption(option)||sharedChild(option));`)
 const label='children: option.label'
 source=replace(source,label,`children: [option.label,state.command==="knowledge"&&isSharedOption(option)&&react_jsx_runtime.jsx('span',{'aria-hidden':true,style:{marginInlineStart:8},children:'›'})]`)
 const row='role: "option",\n\t\t\t\t\t\t\t"aria-selected": index === state.active,'
 source=replace(source,row,row+`\n"data-knowledge-shared-option":state.command==="knowledge"&&sharedChild(option)?'true':undefined,
 style:state.command==="knowledge"&&sharedChild(option)&&!state.search?{display:'none'}:undefined,`)
 const sharedPortal=`}), state.command==="knowledge" && shared && !state.search && rows.some(sharedChild) && react_jsx_runtime.jsx('div',{
  role:'group','aria-label':'他人共享分类','data-knowledge-cascading-options':true,
  onPointerDown:event=>event.stopPropagation(),
${knowledgeSharedPosition}
  children:rows.map((option,index)=>sharedChild(option)&&react_jsx_runtime.jsx('button',{
   type:'button',onClick:()=>popup.select(index),onMouseEnter:()=>popup.highlight(index),children:option.label
  },option.id))
 }), confirmation !== void 0 &&`
 // Keep the menu inside the native top-layer popover so outside-click handling
 // treats moving into the shared categories as part of the same interaction.
 const within='})\n\t\t\t\t]\n\t\t\t}), confirmation !== void 0 &&'
 const sharedChildren=sharedPortal.slice('}), '.length,-', confirmation !== void 0 &&'.length)
 source=replace(source,within,within.replace('\n\t\t\t\t]',' , '+sharedChildren+'\n\t\t\t\t]'))
 source=replace(source,'"data-knowledge-shared-option":', '"data-knowledge-shared-parent":state.command==="knowledge"&&isSharedOption(option)?true:undefined,\n"data-knowledge-shared-option":')
 const css=/const css = ("[^\n]+");/u.exec(source)
 if(!css)throw Error('Knowledge cascading menu styles missing')
 source=source.replace(css[0],'const css = '+JSON.stringify(JSON.parse(css[1])+`
 [data-ework-command=knowledge]{overflow:visible!important}
 [data-knowledge-cascading-options]{display:grid;width:184px;max-height:232px;overflow:auto;padding:4px;border:1px solid var(--dsw-alias-border-l1,#6666);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);box-shadow:0 6px 18px #0003;color:var(--dsw-alias-label-primary,#333)}
 [data-knowledge-cascading-options]>button{text-align:left;border:0;border-radius:6px;padding:5px 8px;color:inherit;background:transparent;cursor:pointer;font:inherit}
 [data-knowledge-cascading-options]>button:is(:hover,:focus-visible){background:var(--dsw-alias-interactive-bg-hover,#8882)}
 ` )+';')
 const close='popup.dismiss({ focusComposer: true });'
 return patchKnowledgeDirectory(patchSlashBack(replace(source,close,`if(state.command==="knowledge"&&shared)setShared(false);else `+close)))
}

function patchSlashBack(source){
 const marker='/* ework:slash-submenu-back */'
 if(source.includes(marker))return source
 const rows='const rows = filterOptions(state.options, state.search);'
 const view=source.indexOf('function PopupSelectView(')
 const before=source.slice(0,view), after=source.slice(view)
 const children='children: [\n\t\t\t\t\t(0, react_jsx_runtime.jsx)("input", {\n\t\t\t\t\t\tref: searchRef,'
 let update=replace(after,rows,rows+`
 ${marker}
 const isKnowledge=state.command==="knowledge";
 const sharedIndex=rows.findIndex(isSharedOption);
 const childIndices=isKnowledge&&!state.search?rows.flatMap((row,index)=>sharedChild(row)?[index]:[]):[];
 const primaryIndices=rows.map((_row,index)=>index).filter(index=>!childIndices.includes(index));
 const go=(direction)=>{
  if(!childIndices.length){popup.move(direction);return}
  const candidates=shared?childIndices:primaryIndices,index=candidates.indexOf(state.active);
  popup.highlight(candidates[(index<0?(direction===1?0:candidates.length-1):index+direction+candidates.length)%candidates.length]);
 };
 const enterShared=()=>{setShared(true);if(childIndices.length)popup.highlight(childIndices[0]);};
 const showBack=["knowledge","model","permission","skills"].includes(state.command);
 const goBack=()=>{
  if(isKnowledge&&shared){setShared(false);popup.highlight(sharedIndex);searchRef.current?.focus();return}
  const launcher=cardRef.current?.closest('[data-composer-card]')?.querySelector('[data-odyssey-command-launcher]');
  popup.dismiss({focusComposer:true});
  if(launcher?.isConnected&&!launcher.disabled)launcher.click();
 };
 `)
 update=replace(update,'popup.move(1);','go(1);')
 update=replace(update,'popup.move(-1);','go(-1);')
 update=replace(update,'case "Enter":\n\t\t\t\t\t\tev.preventDefault();',`case "ArrowRight":
      if(isKnowledge&&!state.search&&state.active===sharedIndex&&childIndices.length){ev.preventDefault();enterShared();}
      return;
     case "ArrowLeft":
      if(isKnowledge&&shared&&!state.search){ev.preventDefault();goBack();}
      return;
     case "Enter":
      ev.preventDefault();
      if(ev.target.closest?.('[data-ework-command-back]')){goBack();return;}`)
 update=replace(update,'if(state.command==="knowledge"&&isSharedOption(rows[state.active]||{}))setShared(true);else', 'if(isKnowledge&&!state.search&&state.active===sharedIndex)enterShared();else')
 update=replace(update,children,children.replace('children: [','children: [\n                    showBack && react_jsx_runtime.jsx("button",{type:"button","data-ework-command-back":true,onClick:goBack,disabled:state.submitting,children:document.documentElement.dataset.odysseyLocale==="en"?"‹ Back":"‹ 返回"}),'))
 update=replace(update,"type:'button',onClick:()=>popup.select(index),onMouseEnter:()=>popup.highlight(index),children:option.label", "type:'button',onClick:()=>popup.select(index),onMouseEnter:()=>popup.highlight(index),'data-active':index===state.active,children:option.label")
 const css=/const css = ("[^\n]+");/u.exec(before)
 if(!css)throw Error('Submenu return styles missing')
 const styles='[data-ework-command-back]{display:flex;width:max-content;align-items:center;min-height:26px;padding:1px 6px;color:var(--dsw-alias-label-secondary);font:inherit;background:none;border:0;border-radius:5px;cursor:pointer}[data-ework-command-back]:is(:hover,:focus-visible),[data-knowledge-cascading-options]>button[data-active=true]{background:var(--dsw-alias-interactive-bg-hover,#8882)}'
 return before.replace(css[0],'const css = '+JSON.stringify(JSON.parse(css[1])+styles)+';')+update
}

function patchKnowledgeDirectory(source) {
 const marker = '/* ework:knowledge-slash-directory */'
 if (source.includes(marker)) return source
 const anchor = 'const primaryIndices=rows.map((_row,index)=>index).filter(index=>!childIndices.includes(index));'
 source = replace(source, anchor, anchor + `
 ${marker}
 const knowledgeEnglish = isKnowledge && document.documentElement.dataset.odysseyLocale === "en";
 const directoryIcons = ${JSON.stringify(knowledgeDirectoryIcons)};
 const categoryIcons = ${JSON.stringify(categoryIcons)};
 const directoryEntry = option => { try { return JSON.parse(option.id); } catch { return {}; } };
 const directoryIcon = name => react_jsx_runtime.jsx('svg',{
  'aria-hidden':true,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',
  strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round',
  children:react_jsx_runtime.jsx('path',{d:directoryIcons[name]})
 });
 const firstFolder = isKnowledge && !state.search ? rows.findIndex(option=>directoryEntry(option).kind==='folder') : -1;
 const directoryHeading = text => react_jsx_runtime.jsx('div',{'data-knowledge-slash-group':true,role:'presentation','aria-hidden':true,children:text});
 const renderDirectoryRow = (index,row) => {
  if(!isKnowledge || state.search) return row;
  if(index===0 || index===firstFolder) return react_jsx_runtime.jsxs(react_jsx_runtime.Fragment,{
   children:[directoryHeading(index===firstFolder ? (knowledgeEnglish?'Folders':'文件夹') : (knowledgeEnglish?'Categories':'分类')),row]
  },row.key);
  return row;
 };
 `)
 source = replace(source, 'rows.map((option, index) => (0, react_jsx_runtime.jsxs)("div", {',
  'rows.map((option, index) => renderDirectoryRow(index,(0, react_jsx_runtime.jsxs)("div", {')
 source = replace(source, '}, option.id))\n\t\t\t\t\t})', '}, option.id)))\n\t\t\t\t\t})')
 source = replace(source, `children: [option.label,state.command==="knowledge"&&isSharedOption(option)&&react_jsx_runtime.jsx('span',{'aria-hidden':true,style:{marginInlineStart:8},children:'›'})]`,
  'children: option.label')
 const skillArtwork = '&& renderComposerDeliverablePreview(react_jsx_runtime, option.id === "builtin:efund-ppt-maker" ? "ppt" : "report", skillCommandArtworkAssets),'
 source = replace(source, skillArtwork, skillArtwork + `
 isKnowledge && directoryIcon(categoryIcons[directoryEntry(option).id] ?? (isSharedOption(option) ? 'received' : 'folder')),`)
 const check = 'option.active === true && (0, react_jsx_runtime.jsx)("span", {'
 source = replace(source, check, `isKnowledge && isSharedOption(option) && directoryIcon('next'),\n` + check)
 source = replace(source, 'option.detail !== void 0 && (0, react_jsx_runtime.jsx)("span", {',
  '(!isKnowledge || state.search) && option.detail !== void 0 && (0, react_jsx_runtime.jsx)("span", {')
 const sharedRows = 'children:rows.map((option,index)=>sharedChild(option)&&react_jsx_runtime.jsx(\'button\',{'
 source = replace(source, sharedRows, `children:[
  react_jsx_runtime.jsxs('button',{type:'button','data-knowledge-shared-back':true,
   onClick:goBack,children:[directoryIcon('previous'),knowledgeEnglish?'Shared with me':'他人共享']},'shared-back'),
  ...rows.map((option,index)=>sharedChild(option)&&react_jsx_runtime.jsxs('button',{`)
 source = replace(source, "'data-active':index===state.active,children:option.label\n  },option.id))",
  "'data-active':index===state.active,children:[directoryIcon('folder'),option.label]\n  },option.id))]")
 source = replace(source,"ev.target.closest?.('[data-ework-command-back]')",
  "ev.target.closest?.('[data-ework-command-back],[data-knowledge-shared-back]')")
 source = replace(source, 'const enterShared=()=>{setShared(true);if(childIndices.length)popup.highlight(childIndices[0]);};', `
 const enterShared=()=>{
  const firstChild=state.options.findIndex(sharedChild);
  if(firstChild<0)return;
  if(state.search)popup.setSearch('');
  setShared(true);
  popup.highlight(firstChild);
 };`)
 source = replace(source, 'if(isKnowledge&&!state.search&&state.active===sharedIndex)enterShared();else popup.select(state.active);',
  'if(isKnowledge&&state.active===sharedIndex)enterShared();else popup.select(state.active);')
 source = replace(source, 'if(isKnowledge&&!state.search&&state.active===sharedIndex&&childIndices.length){ev.preventDefault();enterShared();}',
  'if(isKnowledge&&state.active===sharedIndex){ev.preventDefault();enterShared();}')
 source = replace(source, 'if(state.command==="knowledge"&&isSharedOption(option))setShared(true);else popup.select(index);',
  'if(isKnowledge&&isSharedOption(option))enterShared();else popup.select(index);')
 const css = /const css = ("[^\n]+");/u.exec(source)
 if (!css) throw Error('Knowledge directory CSS anchor missing')
 const styles = `
 [data-ework-command=knowledge] [data-knowledge-slash-group]{padding:5px 8px 3px;font-size:11px;color:var(--dsw-alias-label-secondary)}
 [data-ework-command=knowledge] .mufS8W_row+[data-knowledge-slash-group]{margin-top:3px;border-top:1px solid var(--dsw-alias-border-l1,#6666)}
 [data-ework-command=knowledge] .mufS8W_row>svg,[data-knowledge-cascading-options]>button>svg{width:16px;height:16px;flex:none;color:var(--dsw-alias-label-secondary)}
 [data-knowledge-cascading-options]>button{display:flex;align-items:center;gap:7px;min-height:28px}
 [data-knowledge-cascading-options]>button[data-knowledge-shared-back]{margin-bottom:3px;border-bottom:1px solid var(--dsw-alias-border-l1,#6666);font-weight:500}
 `
 return source.replace(css[0], 'const css = ' + JSON.stringify(JSON.parse(css[1]) + styles) + ';')
}
