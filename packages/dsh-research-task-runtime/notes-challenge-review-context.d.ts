export const REVIEW_ANCHOR_LIMITS: Readonly<{ count: 64; chars: 8000; quote: 2000 }>
export function challengeReviewAnchors(anchors: readonly { blockId: string; quote: string }[], blocks: readonly { id: string; text: string }[]): Array<{ blockId: string; quote: string }>
