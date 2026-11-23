export const MAX_FEEDBACK_IMAGES = 4
export const MAX_FEEDBACK_IMAGE_BYTES = 768 * 1024
export const MAX_FEEDBACK_IMAGE_URL = 32 + 4 * Math.ceil(MAX_FEEDBACK_IMAGE_BYTES / 3)

export function isFeedbackImage(value) {
  if (typeof value !== 'string' || value.length > MAX_FEEDBACK_IMAGE_URL) return false
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || match[2].length % 4 !== 0 || match[2].length > 4 * Math.ceil(MAX_FEEDBACK_IMAGE_BYTES / 3)) return false
  const prefix = atob(match[2].slice(0, 16))
  if (match[1] === 'png') return prefix.startsWith('\x89PNG\r\n\x1a\n')
  if (match[1] === 'jpeg') return prefix.startsWith('\xff\xd8\xff')
  return prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP'
}

export function validFeedbackImages(images) {
  return Array.isArray(images) && images.length <= MAX_FEEDBACK_IMAGES && images.every(isFeedbackImage)
}
