export type ArchiveFormat = 'pptx' | 'pdf'

export function openPresentationArchiveDialog(
  doc: Document, sessionName: string, save: (name: string, format: ArchiveFormat) => Promise<void>
) {
  const dialog = doc.createElement('dialog')
  dialog.className = 'presentation-archive-dialog'
  dialog.setAttribute('aria-labelledby', 'presentation-archive-heading')
  dialog.innerHTML = `<form>
    <h2 id="presentation-archive-heading">保存至知识库</h2>
    <label>文件名<input name="filename" type="text" autocomplete="off" required maxlength="250"></label>
    <label>文件格式<select name="format">
      <option value="pptx">PowerPoint 演示文稿（.pptx）</option>
      <option value="pdf">PDF 文档（.pdf）</option>
    </select></label>
    <p>文稿会自动保存在当前会话。再次使用相同名称和格式保存，会更新这份知识库副本。</p>
    <div role="alert" hidden></div>
    <footer><button type="button">取消</button><button type="submit">保存</button></footer>
  </form>`
  const form = dialog.querySelector('form')!
  const name = dialog.querySelector('input')!
  const format = dialog.querySelector('select')!
  const error = dialog.querySelector<HTMLElement>('[role=alert]')!
  const cancel = dialog.querySelector<HTMLButtonElement>('[type=button]')!
  const submit = dialog.querySelector<HTMLButtonElement>('[type=submit]')!
  name.value = sessionName.replace(/\.(?:pptx?|pdf)$/iu, '').replace(/[\\/:*?"<>|\p{Cc}]/gu, ' ').trim() || '新演示'
  let busy = false
  const close = () => { if (dialog.open) dialog.close(); dialog.remove() }
  cancel.onclick = close
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) close() })
  dialog.addEventListener('click', event => { if (event.target === dialog && !busy) close() })
  form.onsubmit = async event => {
    event.preventDefault()
    if (busy) return
    const filename = name.value.trim().replace(/\.(?:pptx?|pdf)$/iu, '').trim()
    if (!filename || /^[.]{1,2}$/u.test(filename) || /[\\/:*?"<>|\p{Cc}]/u.test(filename) || new TextEncoder().encode(filename).length > 235) {
      error.textContent = '请输入有效的文件名，避免路径符号或过长的名称。'
      error.hidden = false
      name.focus()
      return
    }
    busy = true
    error.hidden = true
    name.disabled = format.disabled = cancel.disabled = submit.disabled = true
    submit.textContent = '正在保存…'
    try {
      await save(filename, format.value as ArchiveFormat)
      close()
    } catch (reason) {
      error.textContent = String(reason instanceof Error ? reason.message : reason).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
      error.hidden = false
      name.disabled = format.disabled = cancel.disabled = submit.disabled = false
      submit.textContent = '保存'
      submit.focus()
    } finally { busy = false }
  }
  doc.body.append(dialog)
  dialog.showModal()
  name.focus()
  name.select()
  return close
}
