const titles=Object.freeze({spreadsheet:'利润涨了，现金去哪了？',workbench:'白酒龙头研究工作台',board:'自选行情示例看板',note:'AI 护航研究笔记示例',ppt:'公司风格演示示例',report:'研究报告示例'})
const suffix='（演示案例）'

export function legacyHomeGuideSessionTitle(kind,replay=false){
 if(!Object.hasOwn(titles,kind))throw new TypeError('未知演示类型。')
 return titles[kind]+(replay?' · 练习副本':'')
}

export function homeGuideSessionTitle(kind){
 return legacyHomeGuideSessionTitle(kind)+suffix
}

export function isHomeGuideSessionTitle(kind,title){
 if(!Object.hasOwn(titles,kind)||typeof title!=='string')return false
 return [false,true].some(replay=>title===legacyHomeGuideSessionTitle(kind,replay)||title===legacyHomeGuideSessionTitle(kind,replay)+suffix)
}
