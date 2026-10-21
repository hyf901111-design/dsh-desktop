export function challengeReplacementScope(source: string, anchorQuote: string): { from: number; to: number; quote: string } | { error: 'anchor' | 'too-long' }
