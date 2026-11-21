import { Buffer } from 'node:buffer'

export const speechUrl = 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional'
const voice = 'zh_male_yuanboxiaoshu_uranus_bigtts'
// Seed TTS 2.0 costs 1350 AFP per 10,000 billable characters.
const unitsPerCharacter = 135000

export function speechInput(input) {
  if (typeof input?.text !== 'string' || !input.text.trim() || input.text.length > 600) throw Error('speech text')
  const text = input.text.trim()
  return {
    // The provider can count a non-ASCII character as two billing characters.
    amountUnits: Array.from(text).reduce((n, c) => n + (c.codePointAt(0) > 127 ? 2 : 1), 0) * unitsPerCharacter,
    wire: JSON.stringify({ req_params: { text, speaker: voice, audio_params: { format: 'mp3', sample_rate: 24000 } } })
  }
}

export function decodeSpeech(body, reserved) {
  const chunks = []
  let complete = false, billed
  for (const line of body.toString('utf8').split('\n')) {
    if (!line.trim()) continue
    const frame = JSON.parse(line)
    if (complete) throw Error('unexpected speech frame')
    if (frame.code === 20000000) complete = true
    else if (frame.code !== 0) throw Error('speech synthesis failed')
    if (Number.isSafeInteger(frame.usage?.text_words) && frame.usage.text_words > 0)
      billed = frame.usage.text_words * unitsPerCharacter
    if (frame.data) chunks.push(Buffer.from(frame.data, 'base64'))
  }
  const audio = Buffer.concat(chunks)
  if (!complete || !audio.length) throw Error('incomplete speech')
  return { audio, units: billed !== undefined && billed <= reserved ? billed : undefined }
}
