// Reference buttons are per-message host settings. Mode and user-authored chips
// alone cannot distinguish an untagged current-document request from an opt-out.
const chip = /〔(?:表格选区|演示引用) "(?:[^"\\]|\\.)*"(?:![A-Z0-9:]+)? #[a-f0-9]{12}〕/gu

export function workspaceAuthoredText(mode, text) {
  return ['spreadsheet','presentation'].includes(mode) ? text.replace(chip,' ').trim() : text
}
const selection = /选(?:中|区)|框选|\b(?:selection|selected)\b/iu
const onlySelection = /(?:只|仅|仅限|仅仅|只需)[^，。；;\n]{0,16}(?:选中|选区|标注)|\b(?:only|just)\b.{0,30}\b(?:selection|selected)\b|\bselection only\b/iu
const implicitRead = /^(?:(?:麻烦(?:你)?|请|帮我|帮忙|能否|可以|先|简单|简短|简要|再|只|仅)\s*)*(?:(?:把|将)?(?:这些|这(?:里|个|份|张|页|段)|上面|其中|它)(?:的)?(?:内容|数据|数字|文字)?\s*)?(?:总结|概括|归纳|概述|分析|解释|解读|提炼|提取|列出|看看|核对|检查)(?:一[下遍]|下|出|成|这(?:个|些))?(?:其中的|一下|的)?(?:(?:[一二三四五六七八九十\d]+个?)?(?:关键信息|关键点|核心内容|主要结论|主要内容|要点|重点|结论|异常|趋势|内容))?(?:吧|吗|即可)?[\s。！？.!?]*$|^(?:(?:please |quickly |briefly )*(?:summari[sz]e|review|explain|analy[sz]e|check|list (?:the )?key points)(?: (?:this|these|it|the above|the key points))?)[\s.!?]*$/iu

export function workspaceReferenceIntent(turn) {
  if (!['spreadsheet','presentation'].includes(turn.mode)) return
  const authored = turn.text
  const tagged = turn.workspaceTagged
  const selectedOnly = onlySelection.test(authored)
  const implicit = implicitRead.test(authored) || /^(?:这(?:一?[批组]|些)|以上)(?:数据|数字|内容|材料)(?:中|里)?(?:有(?:哪些|什么)|说明了什么|反映了什么|意味着什么)[^。！？?]{0,15}[。！？?]?$/u.test(authored)
  if (tagged || implicit || selectedOnly || turn.appRead || turn.appEdit)
    return {tagged, implicit, selectedOnly, selectionRead:!turn.appEdit && (selectedOnly || selection.test(authored) && turn.appRead)}
}

export function scopedModeTurn(turn, intent, reference) {
  const sheet = turn.mode === 'spreadsheet'
  const scope = reference?.mode === turn.mode ? reference.scope : undefined
  const selected = scope === (sheet ? 'ranges' : 'selection')
  const current = scope === (sheet ? 'workbook' : 'slide')
  const refCount = reference?.count
  const defaultRead = intent.implicit || intent.tagged || intent.selectionRead
  const noTarget = !turn.appEdit && (intent.selectionRead || intent.tagged ? !selected : intent.implicit && !current && !selected)
  if (noTarget) return {...turn, appRead:false, create:null, simple:true,
    scopeGuidance:scope==='none' ? '用户已关闭当前内容参考。本轮没有可默认读取的内容，请直接说明需要提供内容或选择引用。' :
      '本轮没有已受理的相应选区或默认内容。请用户提供需要读取的内容或选区。'}
  const scoped = {...turn, appRead:turn.appRead || defaultRead && (current || selected),
    simple:defaultRead && (current || selected) ? false : turn.simple}
  if (selected) {
    scoped.selectedRead = !turn.appEdit && (defaultRead || intent.selectedOnly)
    if(sheet){
      scoped.scopeGuidance='本轮已受理'+(refCount ? refCount+'个' : '')+'表格选区。默认只使用这些选区，直接调用 spreadsheet.inspect，arguments={scope:"reference",referenceIndex:1}；按顺序逐个读取，referenceIndex 从 1 开始。'
      scoped.referenceCount=refCount
    }else scoped.scopeGuidance='本轮已受理演示选区。直接用 presentation.inspect，arguments={scope:"reference"}，一次读取已提交的全部引用，包括跨页对象、备注原文和标注。按返回的 slideId 和引用顺序定位。'
  } else if (current) {
    scoped.scopeGuidance=sheet?'本轮默认参考当前工作簿。直接用 spreadsheet.inspect 查看工作簿和已用区域，再按实际范围读取用户所需的数据。':
      '本轮默认参考发送时的当前幻灯片。直接以空参数调用 presentation.inspect，依据返回的当前页正文和备注回答。'
  } else if (scope==='none') {
    scoped.scopeGuidance='用户关闭了本轮的默认内容参考。仅按其本轮明确指定的对象和操作使用原生能力。'
  }
  return scoped
}

export function selectedReadIssue(turn, args) {
  if (!turn.selectedRead) return
  const read = args?.arguments ?? {}
  if (args?.capability === 'presentation.inspect') {
    if (read.scope !== 'reference' || read.startPage !== undefined || read.slideId !== undefined)
      return '请使用 scope=reference 仅读取本轮已受理的演示选区。'
    return
  }
  if (args?.capability !== 'spreadsheet.inspect') return
  if (read.scope === 'selected' && turn.referenceCount === 1) return
  if (read.scope === 'reference' && Number.isInteger(read.referenceIndex) && read.referenceIndex >= 1 && (!turn.referenceCount || read.referenceIndex <= turn.referenceCount)) return
  return '请仅读取本轮已受理的表格选区，使用 scope=reference 和对应的 referenceIndex。'
}
