import { isFeedbackImage, MAX_FEEDBACK_IMAGE_BYTES, MAX_FEEDBACK_IMAGES } from '../../packages/dsh-research-collaboration/feedback-images.js'
import { boardButton } from './research-board-dialogs'

async function prepareImage(doc: Document, file: File): Promise<string> {
  const win = doc.defaultView!
  if (!/^image\/(png|jpeg|webp|gif|avif|bmp)$/i.test(file.type))
    throw new Error('请选择 PNG、JPEG、WebP、GIF、AVIF 或 BMP 图片。')
  if (file.size <= MAX_FEEDBACK_IMAGE_BYTES && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new win.FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('读取图片失败，请重新选择。'))
      reader.readAsDataURL(file)
    })
    if (isFeedbackImage(url)) return url
    throw new Error('无法读取这张图片。')
  }
  const bitmap = await win.createImageBitmap(file)
  try {
    const canvas = doc.createElement('canvas')
    let edge = Math.min(2560, Math.max(bitmap.width, bitmap.height))
    while (edge >= 1) {
      const scale = edge / Math.max(bitmap.width, bitmap.height)
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const url = canvas.toDataURL('image/webp', 0.9)
      if (isFeedbackImage(url)) return url
      edge = Math.floor(edge * 0.75)
    }
    throw new Error('无法处理这张图片。')
  } finally { bitmap.close() }
}

export function feedbackImagePicker(doc: Document, form: HTMLFormElement, status: HTMLElement, update: (contentChanged: boolean) => void) {
  const files = doc.createElement('input')
  files.type = 'file'
  files.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp'
  files.multiple = true
  files.hidden = true
  const images: string[] = []
  const previews = doc.createElement('div')
  previews.className = 'srb-problem-previews'
  const add = boardButton(doc, '添加图片', () => files.click())
  let busy = false
  function render() {
    previews.replaceChildren()
    images.forEach((url, index) => {
      const thumbnail = doc.createElement('img')
      thumbnail.src = url
      thumbnail.alt = '附图 ' + (index + 1)
      const item = doc.createElement('span')
      const remove = boardButton(doc, '×', () => {
        images.splice(index, 1)
        status.textContent = ''
        render()
        update(true)
      }, '移除图片 ' + (index + 1))
      item.append(thumbnail, remove)
      previews.append(item)
    })
    add.disabled = busy || images.length >= MAX_FEEDBACK_IMAGES
    previews.inert = busy
  }
  async function attach(selected: File[]) {
    if (!selected.length || busy || form.inert) return
    status.textContent = ''
    if (images.length + selected.length > MAX_FEEDBACK_IMAGES) {
      status.textContent = '每条反馈最多可添加 ' + MAX_FEEDBACK_IMAGES + ' 张图片。'
      return
    }
    busy = true
    render()
    update(false)
    let added = false
    try {
      const prepared: string[] = []
      for (const file of selected) prepared.push(await prepareImage(doc, file))
      images.push(...prepared)
      added = true
    } catch (error) {
      status.textContent = error instanceof Error && error.name === 'Error' ? error.message : '无法读取这张图片。'
    } finally {
      busy = false
      files.value = ''
      render()
      update(added)
    }
  }
  files.onchange = () => { void attach(Array.from(files.files ?? [])) }
  form.addEventListener('paste', event => {
    const pasted = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'))
    if (pasted.length) { event.preventDefault(); void attach(pasted) }
  })
  return { images, files, previews, add, get busy() { return busy } }
}
