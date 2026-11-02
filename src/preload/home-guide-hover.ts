// A DOM cursor cannot activate the browser's :hover pseudo class. Extend the
// existing selectors in place instead of copying their declarations to a later
// stylesheet: specificity, cascade order, themes and nested media rules remain
// exactly the same as for a physical pointer.
export function createHomeGuideHover(document:Document,runId:string){
 const win=document.defaultView!,attribute='data-home-guide-hover',token=JSON.stringify(runId)
 const rules=new Map<CSSStyleRule,{before:string;after:string}>(),marked=new Map<Element,string|null>()
 let current:Element|null=null,closed=false,dirty=true
 const selector=(source:string)=>{
  let result='',quote='',brackets=0
  for(let i=0;i<source.length;i++){
   const ch=source[i]
   if(ch==='\\'){result+=ch+(source[++i]??'');continue}
   if(quote){result+=ch;if(ch===quote)quote='';continue}
   if(ch==='"'||ch==="'"){quote=ch;result+=ch;continue}
   if(ch==='[')brackets++;else if(ch===']')brackets--
   if(!brackets&&source.slice(i,i+6).toLowerCase()===':hover'&&!/[\w-]/.test(source[i+6]??'')){result+=':is(:hover,['+attribute+'='+token+'])';i+=5}else result+=ch
  }
  return result
 }
 const refresh=()=>{
  if(!dirty||closed)return;dirty=false
  const visit=(list:CSSRuleList)=>{for(const rule of list){
   if('selectorText' in rule){const style=rule as CSSStyleRule;if(rules.has(style))continue;const before=style.selectorText,after=selector(before);if(after!==before)try{style.selectorText=after;if(style.selectorText!==before)rules.set(style,{before,after:style.selectorText})}catch{/* Unsupported selectors keep their native behavior. */}}
   try{if('cssRules' in rule)visit((rule as CSSGroupingRule).cssRules)}catch{/* Cross-origin imports are not readable. */}
  }}
  for(const sheet of [...document.styleSheets,...(document.adoptedStyleSheets??[])])try{visit(sheet.cssRules)}catch{/* Skip inaccessible stylesheets. */}
 }
 const restoreMarks=()=>{for(const[node,prior]of marked)if(node.getAttribute(attribute)===runId){if(prior===null)node.removeAttribute(attribute);else node.setAttribute(attribute,prior)}marked.clear()}
 const mouse=(node:Element,type:string,relatedTarget:Element|null,x:number,y:number)=>node.dispatchEvent(new win.MouseEvent(type,{bubbles:true,cancelable:true,composed:true,relatedTarget,clientX:x,clientY:y}))
 const update=(x:number,y:number)=>{
  if(closed)return
  refresh()
  const hit=document.elementFromPoint?.(x,y)??null
  if(current!==hit){restoreMarks();for(let node=hit;node;node=node.parentElement){
    // Attribute writes inside a contenteditable host are document mutations to
    // ProseMirror, even when the attribute is only a visual hover token. Keep
    // text/marks and their SVG descendants untouched; non-editable NodeView
    // controls and ancestors outside the editing host still mirror real hover.
    let html:Element|null=node;while(html&&!(html instanceof win.HTMLElement))html=html.parentElement
    if(html instanceof win.HTMLElement&&html.isContentEditable)continue
    marked.set(node,node.getAttribute(attribute));node.setAttribute(attribute,runId)}const previous=current;current=hit;if(previous?.isConnected)mouse(previous,'mouseout',hit,x,y);if(hit?.isConnected)mouse(hit,'mouseover',previous,x,y)}
 }
 const clear=()=>{const previous=current;current=null;restoreMarks();if(previous?.isConnected)mouse(previous,'mouseout',null,0,0)}
 const observer=new win.MutationObserver(records=>{if(records.some(record=>record.target instanceof win.HTMLStyleElement||record.target instanceof win.HTMLLinkElement||[...record.addedNodes].some(node=>node instanceof win.Element&&(node.matches('style,link[rel=stylesheet]')||node.querySelector('style,link[rel=stylesheet]')))))dirty=true})
 observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true})
 const loaded=()=>{dirty=true};document.addEventListener('load',loaded,true)
 return{update,clear,dispose(){if(closed)return;clear();closed=true;observer.disconnect();document.removeEventListener('load',loaded,true);for(const[rule,value]of rules)try{if(rule.selectorText===value.after)rule.selectorText=value.before}catch{}rules.clear()}}
}
