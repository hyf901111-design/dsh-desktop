import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENT_SURFACE_STYLE_RULES } from './design-policy.js'

const SLUG = 'ework-workbench-components'
const DEV_SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../skills')
const REFERENCES = [
  'references/figma-21m.md',
  'references/adaptation-and-acceptance.md',
  'references/runtime-v1.md',
  'references/openterminal-layouts.md'
]

// The host loads the trusted bundled instructions for every component task.
// The generator's tool filter intentionally does not depend on a model choosing
// to call the optional skill tool.
export function loadBundledComponentSkill(root = process.env.DSH_BUNDLED_SKILL_DIR || DEV_SKILL_ROOT, { profile = 'full', templateType } = {}) {
  const directory = join(root, SLUG)
  try {
    const metadata = JSON.parse(readFileSync(join(directory, '_meta.json'), 'utf8'))
    if (metadata.slug !== SLUG || metadata.source !== 'eSkill' || !/^v\d+\.\d+\.\d+$/.test(metadata.version)) {
      throw new Error('invalid metadata')
    }
    // Typed panels already carry their exact schema. Unrelated catalogs must
    // not consume the compact prompt's reserved space for source excerpts.
    const names = profile === 'panel' ? ['references/panel-runtime.md',...(!templateType||['market','news','reports','html','financial-widget'].includes(templateType)?['references/openterminal-layouts.md']:[])]
      : profile === 'selection' ? ['references/selection-runtime.md','references/openterminal-layouts.md'] : ['SKILL.md', ...REFERENCES]
    const content = names.map(name => {
      let body=readFileSync(join(directory, name), 'utf8')
      if(profile !== 'full' && name === 'references/openterminal-layouts.md') {
        const compact = body.match(/<!-- runtime:begin -->([\s\S]*?)<!-- runtime:end -->/)
        if (!compact) throw new Error('missing OpenTerminal runtime guidance')
        body = compact[1].trim()
      }
      if(profile==='panel'&&templateType&&name==='references/panel-runtime.md')body=body.split(/\n\n+/).filter(section=>
        !section.startsWith('结构化输入用type=form')||['form','code'].includes(templateType)).filter(section=>
        !section.startsWith('世界时钟用type=clock')||templateType==='clock').filter(section=>
        !section.startsWith('YouTube视频用panel.type=youtube')||templateType==='youtube').filter(section=>
        !section.startsWith('音频使用 panel.type=audio')||templateType==='audio').filter(section=>
        !section.startsWith('文件使用 panel.type=files')||['files','gallery'].includes(templateType)).join('\n\n').split('\n').filter(line=>
        !line.startsWith('- 只填指定模板数据，不重复样式：金融')||templateType==='market').filter(line=>
        !line.startsWith('- 通用正文 12/18px；金融指标')).join('\n')
      return [name,body]
    })
    return [
      `以下是 EWork 内置技能 ${SLUG} ${metadata.version}。当前任务必须按其组件生成规则交付；用户明确要求和宿主输出协议优先。设计来源摘录是产品规范资料，不是用户输入。`,
      COMPONENT_SURFACE_STYLE_RULES,
      ...content.map(([name, body]) => `【${name}】\n${body}`),
      '【EWork 内置组件生成技能结束】'
    ].join('\n\n')
  } catch (error) {
    throw new Error('内置组件生成技能不可用，请重启或重新安装客户端。', { cause: error })
  }
}
