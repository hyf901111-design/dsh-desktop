import {createHash, randomUUID} from 'node:crypto'
import {constants} from 'node:fs'
import {link, open, realpath, unlink} from 'node:fs/promises'
import {isAbsolute, join} from 'node:path'
import {parse} from 'parse5'
import {compactWebpageCss, compactWebpageGuidance, webpageControlGuidance} from './workbench-webpage-compact.js'

const COMPACT_PAGE_GUIDANCE = '生成网页优先选 htmlFile.stylePreset="compact-v1"。宿主将易方达官网数据页的紧凑版样式内嵌到文件。按用户操作选用 .filters 筛选行、dl.metrics 指标组、role="tablist"/"tab" 页签、.table-scroll 表格容器和 .numeric 数值列。'

export const WEBPAGE_GUIDANCE = [
  '先从用户要完成的操作选择交付形式。浏览新闻、跟踪行情、单表搜索、待办和独立刷新用合适的原生组件；原生页签、筛选、公共数据和联动足够时直接使用。用户要可带走的网页，或一个操作流程要让多步输入、情景比较、联动图解和结果共用状态且原生组件难以表达时，可以交付一份网页文件。卡片数量、信息多、提到网页来源本身都不是理由。混合需求可以把互动工具做成网页，把需定时更新的信息绑定原生数据源。',
  '网页在研究看板内直接打开，同时保留项目文件；用同一次 research_workbench_create 提交 type:"files"、title、prompt（说明用户操作）和 htmlFile:{name,html,stylePreset:"compact-v1"}，html 是完整的独立 HTML 文档，脚本和样式内嵌，使用事件监听。在页面内实现操作。让正文按卡宽自然换行排布，使用文档流撑开高度。',
  webpageControlGuidance,
  COMPACT_PAGE_GUIDANCE,
  compactWebpageGuidance,
  '用底色和字重标明选中项，保留可见的键盘焦点。图表用颜色区分数据系列，散点和环图保留表达数据所需的形状。省去装饰性渐变和阴影。',
  '背景、正文、控件、图表分别使用 --sherlock-bg、--sherlock-text、--sherlock-control-bg、--sherlock-chart-1 等看板配色变量，并为离线打开提供 CSS 回退色。脚本绘制的图表也跟随配色，Canvas 在 sherlock-presentation-change 时重绘。绑定读数及图表时核对实际元素，覆盖初始展示和参数改变后的重绘。宿主提供组件顶栏、来源底栏和 HTML 导出入口。只用用户输入或已核对的资料，不承诺联网刷新、跨次保存或把同一内容再铺成多张卡。仅要原生组件就尊重选择。'
].join('\n')

export const WEBPAGE_SCHEMA = {
  type:'object', additionalProperties:false, description:'一份直接嵌入研究看板且可下载的交互网页。适用于用户指定网页或原生控件无法表达的共享状态流程。与其他组件数据字段互斥。',
  properties:{
    name:{type:'string',required:true,description:'简短、可读的 .html 文件名，不含目录。'},
    stylePreset:{type:'string',enum:['compact-v1'],description:COMPACT_PAGE_GUIDANCE+'用户指定其他设计时可省略并自定义样式。'},
    html:{type:'string',required:true,description:'完整自包含 HTML 文档，含正文和所需内嵌脚本、样式。无需另行写文件。'+webpageControlGuidance}
  }
}

const MAX_BYTES = 256_000

function preparePageHtml(html, stylePreset) {
  if (stylePreset !== undefined && stylePreset !== 'compact-v1')
    throw Error('网页样式可使用 compact-v1，或省略 stylePreset 自定义样式。')
  if (typeof html !== 'string' || Buffer.byteLength(html) > MAX_BYTES)
    throw Error('请提供 256 KB 以内的自包含 HTML 文档。')
  const document = parse(html,{sourceCodeLocationInfo:true})
  const root = document.childNodes.find(node => node.tagName === 'html')
  const body = root?.childNodes.find(node => node.tagName === 'body')
  if (!root?.sourceCodeLocation?.endTag || !body?.sourceCodeLocation ||
      !body.childNodes.some(node => node.tagName || node.value?.trim()))
    throw Error('请提供含实际正文的完整 HTML 文档。')
  const visit = node => {
    const attr = key => node.attrs?.find(entry => entry.name === key)?.value
    if (node.tagName === 'script' && attr('src') !== undefined ||
        node.tagName === 'link' && /(?:^|\s)stylesheet(?:\s|$)/i.test(attr('rel') ?? '') ||
        ['iframe','object','embed','base'].includes(node.tagName) ||
        node.tagName === 'img' && attr('src') && !attr('src').startsWith('data:'))
      throw Error('网页需要能独立打开。请内嵌脚本、样式和图片，将需联网刷新的内容交给原生组件。')
    node.childNodes?.forEach(visit)
  }
  visit(root)
  if (!stylePreset) return html
  const head = root.childNodes.find(node => node.tagName === 'head')
  const alreadyStyled = head?.childNodes.some(node =>
    node.tagName === 'style' && node.attrs.some(attr => attr.name === 'data-workbench-page-preset' && attr.value === stylePreset))
  if (alreadyStyled) return html
  const offset = head?.sourceCodeLocation?.endTag?.startOffset ?? body.sourceCodeLocation.startTag.startOffset
  const styled = html.slice(0,offset) + '<style data-workbench-page-preset="compact-v1">' + compactWebpageCss + '</style>' + html.slice(offset)
  if (Buffer.byteLength(styled) > MAX_BYTES) throw Error('含内嵌样式的网页须在 256 KB 以内。请精简重复样式。')
  return styled
}

export function prepareWorkbenchWebpages(args, sessionId, request) {
  const pages = []
  if (!Array.isArray(args?.panels)) return {args, pages}
  const panels = args.panels.map(panel => {
    if (panel?.htmlFile === undefined) {
      if (panel?.artifact?.presentation === 'webpage') throw Error('生成看板网页请提供 htmlFile 的完整文件内容。')
      return panel
    }
    if (/(?:只(?:用|要|使用)|仅(?:用|要|使用))原生组件|(?:不要|不用|禁止|别)(?:生成|制作|做成|嵌入|用)?(?:独立|交互|HTML)?网页(?:文件|组件|卡片|[，。！；\s]|$)/iu.test(request ?? ''))
      throw Error('用户已指定原生交付，请按原始需求选择组件。')
    const {htmlFile, ...rest} = panel
    if (rest.type !== 'files' || ['content','artifact','publicData','library','view','sourceView','profile','requests','intervalMinutes','hierarchy'].some(key => rest[key] !== undefined))
      throw Error('网页文件用 type:"files" 和 htmlFile；需持续更新的信息放在绑定数据源的原生卡上。')
    const {name, stylePreset} = htmlFile ?? {}
    if (!htmlFile || Object.keys(htmlFile).some(key => !['name','html','stylePreset'].includes(key)) || typeof name !== 'string' ||
        name !== name.trim() || !/^[^./\\:\p{Cc}\p{Cf}][^/\\:\p{Cc}\p{Cf}]*\.html?$/iu.test(name) || Buffer.byteLength(name) > 150)
      throw Error('网页文件名须是当前项目中的一个 .html 文件名，不含目录。')
    const html = preparePageHtml(htmlFile.html, stylePreset)
    const digest = createHash('sha256').update(sessionId).update('\0').update(args.requestId ?? '').update('\0').update(html).digest('hex').slice(0,16)
    const relativePath = name.replace(/\.html?$/iu, '') + '-' + digest + '.workbench.html'
    const item = {id:'page', name, relativePath, mimeType:'text/html', sizeBytes:Buffer.byteLength(html)}
    pages.push({relativePath, html})
    return {size:'large',layout:'wide',...rest,prompt:rest.prompt ?? rest.title,artifact:{version:1,type:'files',presentation:'webpage',title:rest.title,items:[item]}}
  })
  return {args:pages.length ? {...args,panels} : args, pages}
}

export async function saveWorkbenchWebpages(ctx, exec, pages) {
  if (!pages.length) return
  const {agent, signal} = exec
  const session = agent.session, cwd = session.header?.cwd
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw Error('当前看板缺少可保存网页的项目目录。')
  const root = await realpath(cwd)
  const workspace = await ctx.workspaceRegistry?.resolveByPath(cwd)
  const policy = await ctx.get?.('sandboxPolicy')?.resolve({session})
  if (!workspace?.path || await realpath(workspace.path) !== root || !['workspace-write','danger-full-access'].includes(policy?.mode) ||
      typeof policy.workspaceRoot !== 'string' || await realpath(policy.workspaceRoot) !== root || policy.sessionId !== undefined && policy.sessionId !== session.id)
    throw Error('当前项目没有写入网页文件的权限。')
  const check = () => {
    signal?.throwIfAborted()
    if (ctx.agents.get(session.id) !== agent || agent.session !== session || session.header?.cwd !== cwd)
      throw Error('研究会话或项目已切换，请在原工作台重试。')
  }
  for (const {relativePath, html} of pages) {
    check()
    const target = join(root,relativePath), temp = join(root,'.workbench-' + randomUUID() + '.tmp')
    const staging = await open(temp,'wx',0o600)
    try {
      await staging.writeFile(html,{encoding:'utf8',signal})
      check()
      try { await link(temp,target) }
      catch (error) {
        if (error.code !== 'EEXIST') throw error
        const file = await open(target,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
        try {
          const stat = await file.stat()
          if (!stat.isFile() || stat.size !== Buffer.byteLength(html) || await file.readFile('utf8') !== html)
            throw Error('同名网页内容已改变，已保留原文件。请换一个文件名。')
        } finally { await file.close() }
      }
    } finally { try { await staging.close() } finally { await unlink(temp) } }
  }
  check()
}
