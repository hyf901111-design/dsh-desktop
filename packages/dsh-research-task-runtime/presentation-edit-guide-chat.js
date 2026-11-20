import { createWorkspaceGuideChat, registerWorkspaceGuideChat } from './home-workspace-guide-chat.js'

const serializedReference = /^〔演示引用 ("(?:[^"\\\n]|\\.)*") #[a-f0-9]{12}〕\s*/u
const shortText = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit

const presentationEditGuide = {
  kind: 'presentation-edit', label: '演示编辑', provider: 'sherlock-home-presentation-edit',
  path: '/sherlock/home-guide/presentation-edit', stages: ['notes', 'chart', 'title', 'notes-selection'],
  summary: '从研究简报准备投委会演讲稿，并根据选区编辑图表和标题。',
  armFields: ['prompt', 'referenceLabel'], advanceFields: ['reply'],
  arm(turn, { prompt, referenceLabel }, index) {
    if (!shortText(prompt, 1024) || (index === 0 ? referenceLabel !== undefined : !shortText(referenceLabel, 256))) {
      throw Error('演示请求缺少当前步骤对应的选区或文字。')
    }
    if (turn.armed && (prompt !== turn.prompt || referenceLabel !== turn.referenceLabel)) throw Error('演示草稿已变化。')
    Object.assign(turn, { prompt, referenceLabel })
  },
  matches(turn, text) {
    if (!turn.referenceLabel) return text === turn.prompt
    const marker = serializedReference.exec(text)
    return !!marker && JSON.parse(marker[1]) === turn.referenceLabel && text.slice(marker[0].length) === turn.prompt
  },
  intro: (_locale, index) => [
    '我会逐页阅读标题、图表与数据口径，写成能直接照着讲的备注，并补好翻页衔接。\n\n正在准备 20 页演讲稿…\n\n',
    '已定位第 10 页的框选图表。我会保留原位置、尺寸和八个数据，只切换为横向条形图，继续使用易方达深蓝与浅蓝。\n\n正在更新框选区域…\n\n',
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
