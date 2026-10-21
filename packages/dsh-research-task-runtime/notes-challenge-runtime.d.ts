import type { IncomingMessage } from 'node:http'
import type { ChallengeRequest, ChallengeResult } from '../../src/shared/notes-challenge'

export function generateNoteChallenge(ctx: any, input: ChallengeRequest, signal?: AbortSignal): Promise<ChallengeResult>
export function registerNotesChallenge(ctx: any, options: { isTrustedRequest: (request: IncomingMessage, mutation?: boolean) => boolean }): () => void
