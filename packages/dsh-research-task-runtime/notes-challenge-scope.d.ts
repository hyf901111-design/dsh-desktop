export function challengeReplacementScope(source: string, anchorQuote: string): { from: number; to: number; quote: string } | { error: 'anchor' | 'too-long' }
export function challengeReplacementBody(before:string,after:string): {replacement:string;removed:boolean;error?:undefined}|{error:'review-reminder';replacement?:undefined;removed?:undefined}
