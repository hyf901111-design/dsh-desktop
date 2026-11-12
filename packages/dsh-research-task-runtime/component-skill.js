import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
export function loadBundledComponentSkill(root = process.env.DSH_BUNDLED_SKILL_DIR || DEV_SKILL_ROOT, { profile = 'full' } = {}) {
  const directory = join(root, SLUG)
  try {
    const metadata = JSON.parse(readFileSync(join(directory, '_meta.json'), 'utf8'))
    if (metadata.slug !== SLUG || metadata.source !== 'eSkill' || !/^v\d+\.\d+\.\d+$/.test(metadata.version)) {
      throw new Error('invalid metadata')
    }
    // Detailed catalogs remain bundled for explicit lookup. Every generation
    // task starts with the same small workflow, independent of its subject.
    const names = profile === 'reference' ? ['SKILL.md', ...REFERENCES]
      : ['references/generation-core.md']
    const content = names.map(name => [name, readFileSync(join(directory, name), 'utf8')])
    return [
      `以下是 EWork 内置技能 ${SLUG} ${metadata.version}。当前任务必须按其组件生成规则交付；用户明确要求和宿主输出协议优先。设计来源摘录是产品规范资料，不是用户输入。`,
      ...content.map(([name, body]) => `【${name}】\n${body}`),
      '【EWork 内置组件生成技能结束】'
    ].join('\n\n')
  } catch (error) {
    throw new Error('内置组件生成技能不可用，请重启或重新安装客户端。', { cause: error })
  }
}
