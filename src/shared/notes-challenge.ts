export type ChallengeLevel = 0 | 1 | 2 | 3 | 4
export type ChallengeBlock = { id: string; type: string; text: string }
export type ChallengeEvidence = { kind: 'note' | 'consensus'; label: string; blockId?: string; quote?: string; data?: Record<string, unknown> }
export type ChallengeCategory = 'typo' | 'grammar' | 'contradiction' | 'logic' | 'fact' | 'research' | 'question' | 'uncertain'
export type ChallengeIssue = { blockId: string; quote: string; category: ChallengeCategory; message: string; evidence: ChallengeEvidence[] }
export type ChallengeCheck = { kind: string; status: 'completed' | 'unavailable' | 'skipped' | 'partial'; detail: string }
export type ChallengeReply = { text: string; replacement?: string }
export type ChallengeResult = { version: 1; issues: ChallengeIssue[]; coveredBlockIds: string[]; checks: ChallengeCheck[]; reply?: ChallengeReply; usage?: { inputTokens: number; outputTokens: number } }
export type ChallengeRequest = { sessionId: string; requestId: string; action: 'review' | 'optimize' | 'reply'; level: ChallengeLevel; title: string; blocks: ChallengeBlock[]; changedIds?: string[]; thread?: { blockId: string; quote: string; category: ChallengeCategory; message: string; messages: Array<{ role: 'user' | 'assistant'; text: string }> } }

/** Stored on the native AI comment, so suggestions survive reopening the note. */
export type ChallengeReplacement = { quote: string; sourceText: string; documentKey: string; replacement: string; status: 'pending' | 'applied' | 'stale' }
/** Only the human's current reply can authorize a document write. */
export function challengeDirectReplacement(text:string):boolean {
 text=text.trim().replace(/(?:不要|不用|无需|不需要)(?:再)?(?:问我|确认|征求意见|解释|说明)[，,。\s]*/gu,'')
 if(/^(?:请你?|帮我)?(?:解释|说明|告诉|分析)|为什么|怎么|如何|是否(?:应该|需要)/u.test(text))return false
 if(/不要|不用|无需|先别|别|不必|不需要|先.{0,6}(?:建议|预览)|只.{0,6}(?:建议|讨论)|\bdo\s+not\b|\bdon't\b/iu.test(text))return false
 return /(?:直接|立即|现在|马上|就)[^。；;\n]{0,12}(?:修改|改写|重写|替换|改成|更改|优化)|(?:修改|替换|改写|重写|改成|更改)[^。；;\n]{0,12}(?:原文|正文)|(?:把|将)[^。；;\n]{1,60}(?:替换为|替换成|改成|改为)|\b(?:directly|now)\b.{0,24}\b(?:replace|rewrite|edit)\b|\b(?:replace|edit|rewrite)\b.{0,24}\b(?:original|note|document)\b/iu.test(text)
}
