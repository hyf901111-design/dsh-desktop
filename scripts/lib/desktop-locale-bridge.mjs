/** Publish the selected application locale to the isolated preload presentation layer. */
export function patchDesktopLocaleBridge(source) {
 const marker='/* odyssey:desktop-locale-bridge */'
 if(source.includes(marker))return source
 const anchor='const sync = (snapshot) => {'
 if(source.split(anchor).length!==2)throw Error('Locale sync anchor drifted')
 source=source.replace(anchor,anchor+`\n ${marker}\n if(typeof document!=='undefined')document.documentElement.dataset.odysseyLocale=snapshot.active==='en'?'en':'zh';`)
 return source.replace('ctx.on("locale/change", sync);','ctx.on("locale/change", sync);\n sync(locale.getSnapshot());')
}

export function patchDesktopResearchDefaults(source) {
 const before='title: "智能容器",'
 const after='title: typeof document!=="undefined" && document.documentElement.dataset.odysseyLocale==="en" ? "Smart container" : "智能容器",'
 if(source.includes(after))return source
 if(source.split(before).length!==2)throw Error('Container default-title anchor drifted')
 return source.replace(before,after)
}
export function patchEmptyHeaderTitles(source) {
 const marker='/* odyssey:localized-empty-header:v1 */'
 if(source.includes(marker))return source
  .replace("research:'New Research',notes:", "research:'New Board',notes:")
  .replace("research:'新研究',notes:", "research:'新看板',notes:")
 const before='{ chat: "新会话", research: "新研究", trajectory: "新轨迹" }[active?.id]'
 if(source.split(before).length!==2)throw Error('Empty header title anchor missing')
 return source.replace(before,`(document.documentElement.dataset.odysseyLocale==='en'?{chat:'New Session',research:'New Board',trajectory:'New Trajectory'}:{chat:'新会话',research:'新看板',trajectory:'新轨迹'})[active?.id] ${marker}`)
}
