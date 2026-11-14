// Allow the gateway to report a timed-out request before its downstream
// consumers abort. Each deadline applies to one paid model call.
export const hostedChatUpstreamTimeoutMs = 10 * 60_000
export const hostedChatBridgeTimeoutMs = hostedChatUpstreamTimeoutMs + 15_000
export const hostedChatIdleTimeoutMs = hostedChatBridgeTimeoutMs + 15_000
