export function projectSkillText(text,labels=globalThis.window?.__eworkSkillPresentationV1?.skills) {
 if(typeof text!=='string')return text
 return text.replace(/(^|\s)\/((?:ework-skill-)[a-f0-9]{16})(?=\s|$)/g,(_match,prefix,name)=>prefix+'/'+(labels?.get(name)?.label||'removed-skill'))
}
