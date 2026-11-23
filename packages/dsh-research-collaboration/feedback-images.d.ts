export const MAX_FEEDBACK_IMAGES: number
export const MAX_FEEDBACK_IMAGE_BYTES: number
export const MAX_FEEDBACK_IMAGE_URL: number
export function isFeedbackImage(value: unknown): value is string
export function validFeedbackImages(images: unknown): images is string[]
