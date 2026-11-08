export function workbenchRequestedStyle(request) {
 // Only the host's original user request is eligible; not panel prompts,
 // fetched pages, or attachment text. Require an explicit mode selection.
 if(typeof request!=='string')return null
 const modes=[...request.matchAll(/(?:使用|采用|切换(?:为|到)?|设为|用)\s*[「“"]?(易方达|深色|浅色|彭博)模式/g)].filter(match=>!/(?:不要|不用|不能|禁止|不再)\s*$/u.test(request.slice(Math.max(0,match.index-6),match.index))).map(match=>({mode:({易方达:'enterprise',深色:'dark',浅色:'light',彭博:'openterminal'})[match[1]]}))
 return modes.at(-1)?.mode??null
}
