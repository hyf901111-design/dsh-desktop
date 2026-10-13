import {expect,it} from 'vitest'
import {readFile,readdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {loadBundledSkills,readBundledSkill} from '../src/main/integrations/bundled-skills'

it('ships the real finance framework and complete references/scripts as a trusted builtin',async()=>{
 const bundled=(await loadBundledSkills(resolve('skills'))).find(s=>s.skill.id==='builtin:ework-finance-analysis')
 expect(bundled?.skill).toMatchObject({name:'基础金融分析逻辑',enabled:true,version:'v1.7.3'})
 const content=await readBundledSkill(bundled)
 expect(content).toContain('references/ework-runtime.md')
 expect(content).toContain('stock-deep-research')
 const refs=await readdir(join(bundled.skill.resourceRoot,'references'))
 expect(refs).toHaveLength(47)
 for(const script of ['scripts/run_signal.py','scripts/price-action/basic_indicators.py','scripts/quant/factor_multi.py','scripts/ib/validate_dcf.py'])expect((await readFile(join(bundled.skill.resourceRoot,script),'utf8')).length).toBeGreaterThan(100)
 const data=(await loadBundledSkills(resolve('skills'))).find(s=>s.skill.id==='builtin:ework-free-data-sources')
 expect(data.skill.name).toBe('基础数据源')
})
