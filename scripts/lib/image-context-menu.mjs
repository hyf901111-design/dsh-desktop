/** The desktop conversation plugin mounts this once for the main window. */
export function mountImageContextMenu({ jsx, Menu, createRoot, createPortal }) {
  const imageAction = window.dshDesktop?.imageAction
  if (window.top !== window || typeof imageAction !== 'function') return

  const maxBytes = 20 * 1024 * 1024
  const preview = 'button[data-variant="single"],button[data-variant="tile"],[aria-modal="true"],[data-image-preview-image],[data-research-image-preview],[data-media-kind="image"]'
  let root, selection, notice, noticeTimer
  let busy = false

  function render() {
    if (!root) return
    const target = selection
    const status = notice
    root.render([
      target && createPortal(jsx(Menu, {
        open: true, anchor: null, portal: true, className: 'odyssey-image-menu-anchor',
        items: target.items,
        onSelect: action => applyAction(target, action),
        onClose: () => close(target),
        getAnchorRect: () => ({ left: target.x, right: target.x, top: target.y, bottom: target.y, width: 0, height: 0 })
      }), target.host, 'image-menu'),
      status && createPortal(jsx('div', {
        role: 'status', className: 'odyssey-image-action-notice', children: status.text
      }), status.host.isConnected ? status.host : document.body, 'image-notice')
    ])
  }

  function close(target = selection) {
    if (!target || selection !== target) return
    selection = undefined
    render()
  }

  function notify(host, text) {
    if (!root) return
    window.clearTimeout(noticeTimer)
    notice = { host, text }
    render()
    noticeTimer = window.setTimeout(() => {
      notice = undefined
      render()
    }, 2800)
  }

  async function applyAction(target, action) {
    if (target !== selection || (action !== 'copy' && action !== 'download')) return
    close(target)
    if (busy) return
    busy = true
    const { english, host, image, src, name } = target
    try {
      const response = await fetch(src)
      if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) throw Error('Image unavailable')
      let blob = await response.blob()
      if (!blob.type.startsWith('image/') || !blob.size || blob.size > maxBytes) throw Error('Invalid image')
      if (action === 'download' && blob.type !== 'image/png') {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        const extension = blob.type.slice(6).split('+')[0].replace(/^x-/, '').replace(/^jpeg$/, 'jpg')
        link.download = /\.[a-z0-9]+$/i.test(name) ? name : `${name}.${extension}`
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
        return
      }
      if (blob.type !== 'image/png') {
        if ((image.currentSrc || image.src) !== src || image.naturalWidth * image.naturalHeight > 32_000_000) throw Error('Image changed')
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        canvas.getContext('2d').drawImage(image, 0, 0)
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        if (!blob || blob.size > maxBytes) throw Error('Invalid image')
      }
      const result = await imageAction({ action, name, data: new Uint8Array(await blob.arrayBuffer()) })
      if (!result?.ok) throw Error('Image action failed')
      if (!result.cancelled) notify(host, english
        ? (action === 'copy' ? 'Image copied' : 'Image downloaded')
        : (action === 'copy' ? '已复制图片' : '已下载图片'))
    } catch {
      notify(host, english ? 'Image action failed. Please try again.' : '图片操作失败，请重试。')
    } finally {
      busy = false
    }
  }

  function open(event) {
    const image = event.target
    if (!(image instanceof HTMLImageElement) || !image.complete || !image.naturalWidth ||
      image.closest('[aria-hidden="true"],[role="menu"],.ew-attachment') ||
      (!image.closest(preview) && (!image.alt || image.closest('button,[role="button"]')))) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const english = document.documentElement.dataset.odysseyLocale === 'en' ||
      document.documentElement.lang.startsWith('en')
    const icon = d => jsx('svg', {
      viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor',
      strokeWidth: 1.5, 'aria-hidden': true, children: jsx('path', { d })
    })
    selection = {
      image, src: image.currentSrc || image.src, name: image.alt || (english ? 'Image' : '图片'),
      x: event.clientX, y: event.clientY, host: image.closest('[aria-modal="true"]') ?? document.body,
      english, items: [
        { id: 'copy', label: jsx('span', { 'data-odyssey-image-action': 'copy', children: english ? 'Copy Image' : '复制图片' }), icon: icon('M8 8h12v12H8zM4 16V4h12') },
        { id: 'download', label: jsx('span', { 'data-odyssey-image-action': 'download', children: english ? 'Download Image' : '下载图片' }), icon: icon('M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5') }
      ]
    }
    root ??= createRoot(document.createDocumentFragment())
    render()
  }

  function keydown(event) {
    if (!selection) return
    if (!selection.image.isConnected || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      close()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    }
  }

  document.addEventListener('contextmenu', open, true)
  window.addEventListener('keydown', keydown, true)
  return () => {
    document.removeEventListener('contextmenu', open, true)
    window.removeEventListener('keydown', keydown, true)
    window.clearTimeout(noticeTimer)
    root?.unmount()
    root = undefined
  }
}
