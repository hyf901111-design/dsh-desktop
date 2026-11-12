import {expect,it} from 'vitest'
import {preparedReleaseCohortIssue} from '../packages/dsh-research-task-runtime/observed-dated-feed.js'

const originalRequest = '分别整理两个项目最近2个正式版本的日期、主要变化与升级注意事项。'
const repoA = 'scope/first'
const repoB = 'scope/second'
const tag = (repo, version, day, prerelease = false) => ({
  tag_name: version, published_at: `2026-11-${day}T12:00:00Z`,
  draft: false, prerelease, html_url: `https://github.com/${repo}/releases/tag/${version}`
})
const observed = (repo, records, page = 1) => {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=3&page=${page}`
  return {tool:'web_fetch',purpose:'snapshot',args:{url},response:{sourceUrl:url,records}}
}
const first = [tag(repoA,'v4.2.1','08'),tag(repoA,'v5.0.0-rc.1','10',true),tag(repoA,'v3.9.4','09')]
const second = [tag(repoB,'v2.0.3','07'),tag(repoB,'v2.0.2','06'),tag(repoB,'v2.0.1','05')]
const observedSources = [observed(repoA,first),observed(repoB,second)]
const row = item => [item.tag_name.replace(/^v/u,''),item.published_at.slice(0,10),item.html_url]
const artifact = rows => ({type:'table',columns:['版本','发布日期','官方链接'],rows})
const issue = fields => preparedReleaseCohortIssue({originalRequest,observedSources,...fields})

it('checks one card against its linked repository and uses stable publication chronology',()=>{
  const rows = [row(first[2]),row(first[0])]
  expect(issue({panelRequest:'最近2个正式版本与发布日期',artifact:artifact(rows)})).toBeUndefined()
  expect(issue({panelRequest:'最近2个正式版本与发布日期',artifact:artifact([rows[0],row(first[1])])})).toMatch(/正式发布/u)
  expect(issue({panelRequest:`${repoA} 发布记录`,artifact:artifact(rows.toReversed())})).toMatch(/发布.*顺序/u)
  expect(issue({panelRequest:`${repoA} 发布记录`,artifact:artifact([row(first[1]),rows[0]])})).toMatch(/正式发布/u)
  const wrongDate = [rows[0].with(1,'2026-11-08'),rows[1]]
  expect(issue({panelRequest:`${repoA} 发布记录`,artifact:artifact(wrongDate)})).toMatch(/日期/u)
})

it('checks each explicit repository cohort in a combined release table',()=>{
  const fields = {panelRequest:`${repoA}、${repoB} 的发布记录对照表`}
  const rows = [row(first[2]),row(second[0]),row(first[0]),row(second[1])]
  expect(issue({...fields,artifact:artifact(rows)})).toBeUndefined()
  expect(issue({...fields,artifact:artifact(rows.slice(0,3))})).toMatch(/正式发布/u)
  expect(issue({...fields,artifact:artifact(rows.with(3,row(second[2])))})).toMatch(/正式发布/u)
})

it('leaves a scope ungraded when the repo is ambiguous or the collection is incomplete',()=>{
  const rows = [['1.0.0','2026-11-01'],['0.9.0','2026-10-30']]
  expect(issue({panelRequest:'最近正式版本与发布日期',artifact:artifact(rows)})).toBeUndefined()
  expect(issue({panelRequest:`${repoA} 发布记录`,artifact:artifact(rows),observedSources:[observed(repoA,first.slice(0,2))]})).toBeUndefined()
  expect(issue({panelRequest:`${repoA} 发布记录`,artifact:artifact(rows),observedSources:[observed(repoA,first,2)]})).toBeUndefined()
  expect(issue({panelRequest:`${repoA}、${repoB} 发布记录`,artifact:artifact(rows),observedSources:[observed(repoA,first)]})).toBeUndefined()
  expect(issue({panelRequest:`${repoA} 发布记录`,artifact:artifact(rows),originalRequest:'比较主版本升级里程碑'})).toBeUndefined()
})

it('routes an explicitly required official cohort back to bounded acquisition when the exact repo is known',()=>{
  const rows = [['1.0.0','2026-11-01'],['0.9.0','2026-10-30']]
  const linked = {...artifact(rows),sources:[{url:`https://github.com/${repoA}/blob/main/CHANGELOG.md`}]}
  const fields = {panelRequest:'最近2个正式版本',artifact:linked,observedSources:[],verifyOfficialCohort:true}
  expect(issue(fields)).toContain(`https://api.github.com/repos/${repoA}/releases?per_page=2&page=1`)
  expect(issue(fields)).not.toMatch(/交付版本.*不一致/u)
  expect(issue({...fields,artifact:artifact(rows)})).toBeUndefined()
  expect(issue({...fields,originalRequest:'比较项目历代正式版本'})).toBeUndefined()
})
