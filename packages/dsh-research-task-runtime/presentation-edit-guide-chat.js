import { createWorkspaceGuideChat, registerWorkspaceGuideChat } from './home-workspace-guide-chat.js'

const serializedReference = /^〔演示引用 ("(?:[^"\\\n]|\\.)*") #[a-f0-9]{12}〕\s*/u
const shortText = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit

const presentationEditGuide = {
  kind: 'presentation-edit', label: '演示编辑', provider: 'sherlock-home-presentation-edit',
  path: '/sherlock/home-guide/presentation-edit', stages: ['notes', 'chart', 'title', 'notes-selection'],
  summary: '从研究简报准备投委会演讲稿，并根据选区编辑图表和标题。',
  armFields: ['prompt', 'referenceLabel', 'marks'], advanceFields: ['reply'],
  arm(turn, { prompt, referenceLabel, marks }, index) {
    if (marks !== undefined) {
      if (index !== 1 || referenceLabel || !Array.isArray(marks) || marks.length !== 2 ||
          !marks.every(label => shortText(label, 256)) || !shortText(prompt, 2048) ||
          prompt.split('\n').length !== marks.length || new Set(marks).size !== marks.length) throw Error('两条标注与意见不匹配。')
      if (turn.armed && (turn.prompt !== prompt || JSON.stringify(turn.marks) !== JSON.stringify(marks))) throw Error('演示草稿已变化。')
      Object.assign(turn, { prompt, marks })
      return
    }
    if (!shortText(prompt, 1024) || (index === 0 ? referenceLabel !== undefined : !shortText(referenceLabel, 256))) {
      throw Error('演示请求缺少当前步骤对应的选区或文字。')
    }
    if (turn.armed && (prompt !== turn.prompt || referenceLabel !== turn.referenceLabel)) throw Error('演示草稿已变化。')
    Object.assign(turn, { prompt, referenceLabel })
  },
  matches(turn, text) {
    if (turn.marks) {
      const comments = turn.prompt.split('\n')
      let remaining = text.trim()
      for (const [i, label] of turn.marks.entries()) {
        const marker = serializedReference.exec(remaining)
        if (!marker || JSON.parse(marker[1]) !== label) return false
        remaining = remaining.slice(marker[0].length)
        if (!remaining.startsWith(comments[i])) return false
        remaining = remaining.slice(comments[i].length).trimStart()
      }
      return remaining === ''
    }
    if (!turn.referenceLabel) return text === turn.prompt
    const marker = serializedReference.exec(text)
    return !!marker && JSON.parse(marker[1]) === turn.referenceLabel && text.slice(marker[0].length) === turn.prompt
  },
  intro: (_locale, index) => [
    '我会逐页阅读标题、图表与数据口径，写成能直接照着讲的备注，并补好翻页衔接。\n\n正在准备 20 页演讲稿…\n\n',
    '已定位两处标注。我会把第 12 页的表格文字上下居中，同时把第 10 页图表改为横向条形图，保留原数据和配色。\n\n正在更新框选区域…\n\n',
    '已定位所选标题。我会核对本页五种情景的结果，将标题改为一句结论，保留字号、位置和页面布局。\n\n正在修改标题…\n\n',
    '已读取这段备注。我会保留 10% 和 4.1 万亿美元等数字与条件，改成更自然的口头表达，并保留选区前后的原文。\n\n正在优化选中逐字稿…\n\n'
  ][index],
  textChunkSize: 5, textChunkMs: 28,
  update({ reply }) {
    if (!shortText(reply, 4096)) throw Error('演示回复为空或过长。')
    return reply
  }
}

export const createPresentationEditGuideChat = (ctx, options) => createWorkspaceGuideChat(ctx, presentationEditGuide, options)
export const registerPresentationEditGuideChat = (ctx, options) => registerWorkspaceGuideChat(ctx, presentationEditGuide, options)
