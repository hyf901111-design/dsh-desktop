import {HOME_REPORT_EVENT} from '../../packages/dsh-research-task-runtime/home-report-contract.js'

/** Recognize already-written tutorial ownership without weakening unknown-event guards. */
export function patchHomeGuideSessionCatalog(source) {
  const marker = '/* sherlock:home-guide-session-catalog:v2 */',legacy='/* sherlock:home-guide-session-catalog:v1 */'
  const anchor = /((?:export )?const KNOWN_SESSION_EVENT_TYPES = new Set\(\[)/g
  const matches=[...source.matchAll(anchor)]
  if(matches.length!==1)throw Error('无法定位首页示例事件的原生持久化目录。')
  const prefix=matches[0][1],at=matches[0].index+prefix.length,owned='\n'+marker+'\n"home-guide/presentation",\n'+JSON.stringify(HOME_REPORT_EVENT)+','
  if(source.includes('sherlock:home-guide-session-catalog:')){
    const markers=source.match(/\/\* sherlock:home-guide-session-catalog:[^*]*\*\//g)??[]
    if(markers.length!==1)throw Error('首页示例事件目录存在重复或未知补丁。')
    if(markers[0]===marker&&source.slice(at,at+owned.length)===owned)return source
    const old='\n'+legacy+'\n"home-guide/presentation",'
    if(markers[0]===legacy&&source.slice(at,at+old.length)===old)return source.slice(0,at)+owned+source.slice(at+old.length)
    throw Error('首页示例事件目录补丁已漂移。')
  }
  return source.slice(0,at)+owned+source.slice(at)
}
