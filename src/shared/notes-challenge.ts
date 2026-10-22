export type ChallengeLevel = 0 | 1 | 2 | 3 | 4
export type ChallengeBlock = { id: string; type: string; text: string }
export type ChallengeReviewAnchor = { blockId: string; quote: string }
export type ChallengeEvidence = { kind: 'note' | 'consensus'; label: string; blockId?: string; quote?: string; data?: Record<string, unknown> }
export type ChallengeCategory = 'typo' | 'grammar' | 'contradiction' | 'logic' | 'fact' | 'research' | 'question' | 'uncertain'
export type ChallengeIssue = { blockId: string; quote: string; category: ChallengeCategory; message: string; evidence: ChallengeEvidence[] }
export type ChallengeCheck = { kind: string; status: 'completed' | 'unavailable' | 'skipped' | 'partial'; detail: string }
export type ChallengeReply = { text: string; replacement?: string }
export type ChallengeResult = { version: 1; issues: ChallengeIssue[]; coveredBlockIds: string[]; checks: ChallengeCheck[]; reply?: ChallengeReply; usage?: { inputTokens: number; outputTokens: number } }
export type ChallengeRequest = { sessionId: string; requestId: string; action: 'review' | 'optimize' | 'reply'; level: ChallengeLevel; title: string; blocks: ChallengeBlock[]; changedIds?: string[]; existingAnchors?: ChallengeReviewAnchor[]; thread?: { blockId: string; quote: string; category: ChallengeCategory; message: string; messages: Array<{ role: 'user' | 'assistant'; text: string }> } }

/** Stored on the native AI comment, so suggestions survive reopening the note. */
export type ChallengeReplacement = { scopeVersion?: 2; anchorQuote?: string; blockId?: string; quote: string; sourceText: string; documentKey: string; replacement: string; status: 'pending' | 'applied' | 'stale' | 'reverted' }
export {challengeDirectReplacement} from '../../packages/dsh-research-task-runtime/notes-challenge-intent.js'

export {challengeReplacementBody,challengeReplacementScope} from '../../packages/dsh-research-task-runtime/notes-challenge-scope.js'
export {challengeReviewAnchors} from '../../packages/dsh-research-task-runtime/notes-challenge-review-context.js'
