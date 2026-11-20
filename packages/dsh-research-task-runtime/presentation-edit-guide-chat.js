import { createWorkspaceGuideChat, registerWorkspaceGuideChat } from './home-workspace-guide-chat.js'

const serializedReference = /^〔演示引用 ("(?:[^"\\\n]|\\.)*") #[a-f0-9]{12}〕\s*/u
const shortText = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit

const presentationEditGuide = {
  kind: 'presentation-edit', label: '演示编辑', provider: 'sherlock-home-presentation-edit',
  path: '/sherlock/home-guide/presentation-edit', stages: ['notes', 'chart', 'title'],
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
  intro: () => '',
  update({ reply }) {
    if (!shortText(reply, 4096)) throw Error('演示回复为空或过长。')
    return reply
  }
}

export const createPresentationEditGuideChat = (ctx, options) => createWorkspaceGuideChat(ctx, presentationEditGuide, options)
export const registerPresentationEditGuideChat = (ctx, options) => registerWorkspaceGuideChat(ctx, presentationEditGuide, options)
