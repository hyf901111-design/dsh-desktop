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
