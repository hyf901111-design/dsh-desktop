// Agent Plan enterprise aliases; IDs are an allowlist, never arbitrary endpoints.
const M = 1024000
export const ARK_TEXT_MODELS = [
  ['doubao-seed-2.1-pro', 'Doubao Seed 2.1 Pro', M, 250],
  ['doubao-seed-evolving', 'Doubao Seed Evolving', M, 250],
  ['doubao-seed-2.1-lite', 'Doubao Seed 2.1 Lite', M, 50],
  ['doubao-seed-2.0-mini', 'Doubao Seed 2.0 Mini', 256000, 25],
  ['kimi-k3.1-pro', 'Kimi K3.1 Pro', M, 700],
  ['deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', M, 250],
  ['deepseek-v4.1-flash-economy', 'DeepSeek V4.1 Flash Economy', M, 200],
  ['deepseek-v4-flash', 'DeepSeek V4 Flash', M, 50],
  ['glm-5.3', 'GLM 5.3', M, 450],
  ['glm-5.3-flash', 'GLM 5.3 Flash', M, 50],
  ['deepseek-v4-pro', 'DeepSeek V4 Pro', M, 550]
].map(([id, name, contextWindow, unitsPerToken]) => ({ id, name, contextWindow, unitsPerToken }))
export const ARK_IMAGE_MODELS = new Map([
  ['doubao-seedream-5.0-flash', { units: 40_000_000 }],
  ['doubao-seedream-5-0-pro', { units: 100_000_000 }]
])
export const ARK_PLAN_BASE = 'https://ark.cn-beijing.volces.com/api/plan/v3'
