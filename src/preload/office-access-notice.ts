import { installSidebarNoticeStyles, positionSidebarNotice } from './sidebar-notice'

export function showOfficeAccessNotice(doc: Document, reason: string) {
  if (doc.getElementById('ework-office-access-notice')) return
  installSidebarNoticeStyles(doc)
  const notice = doc.createElement('section')
  notice.id = 'ework-office-access-notice'
  notice.className = 'ework-sidebar-notice'
  notice.role = 'status'
  const en = doc.documentElement.dataset.odysseyLocale === 'en'
  const message = doc.createElement('p')
  message.textContent = reason === 'guest'
    ? en ? 'This document is in the guest workspace on this device. Sign out to open it.' : '这份文档保存在本机访客空间。退出当前账号后即可打开。'
    : reason === 'unavailable'
    ? en ? 'Document ownership is unavailable. Reopen the workspace and try again.' : '暂时无法读取文档归属，请重新打开工作区后再试。'
    : reason === 'loading'
    ? en ? 'Your account is loading. Reopen the document in a moment.' : '账号正在切换，请稍后重新打开文档。'
    : en ? 'This document belongs to another account. Sign in with the account that created it.' : '这份文档属于其他账号。请登录创建文档时使用的账号。'
  const close = doc.createElement('button')
  close.type = 'button'
  close.textContent = en ? 'Got it' : '知道了'
  close.onclick = () => notice.remove()
  notice.append(message, close)
  doc.body.append(notice)
  positionSidebarNotice(doc, notice)
}
