export const SKILL_REFERENCE_SOURCE='ework-managed-skill'
export type SkillReference={id:string;revision:number;invocationName:string;label:string}
export function decodeSkillReference(value:string):SkillReference {
 const reference=JSON.parse(value) as SkillReference
 if(!reference || typeof reference.id!=='string' || reference.id.length>256 || !/^[a-zA-Z0-9_.:-]+(?:\/[a-zA-Z0-9_.:-]+)*$/.test(reference.id) || reference.id.split('/').some(p=>['.','..','__proto__','constructor','prototype'].includes(p)) || !Number.isSafeInteger(reference.revision) || reference.revision<0 || !/^ework-skill-[a-f0-9]{16}$/.test(reference.invocationName) || typeof reference.label!=='string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/.test(reference.label))throw Error('技能引用无效，请重新选择技能。')
 return {id:reference.id,revision:reference.revision,invocationName:reference.invocationName,label:reference.label}
}
export function encodeSkillReference(reference:SkillReference):string {
 return JSON.stringify(decodeSkillReference(JSON.stringify(reference)))
}
