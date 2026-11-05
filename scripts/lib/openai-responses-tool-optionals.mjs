// Responses may normalize omitted `strict` into required properties. The SDK
// must send strict:false to retain DSH's optional arguments on the official API.
// https://developers.openai.com/api/docs/guides/function-calling#strict-mode
const marker = '/* sherlock:openai-responses-tool-optionals:v1 */'
const anchor = 'supportsStrictMode: model.compat?.supportsStrictMode ?? false,'
function officialOpenAIResponses(model) {
  try { return new URL(model.baseUrl).hostname === 'api.openai.com' }
  catch { return false }
}
export function patchOpenAIResponsesToolOptionals(source) {
  const patched = 'supportsStrictMode: model.compat?.supportsStrictMode ?? officialOpenAIResponses(model),'
  if (source.startsWith(marker) && source.includes(patched)) return source
  if (source.split(anchor).length !== 2) throw Error('OpenAI Responses optional-argument patch anchor missing or ambiguous')
  return `${marker}\n${officialOpenAIResponses.toString()}\n${source.replace(anchor, patched)}`
}
