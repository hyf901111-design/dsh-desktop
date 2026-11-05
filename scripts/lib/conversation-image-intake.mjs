// The paperclip must register browser Files with the same owner as pasted images.
// In particular, a native filesystem path alone is not a vision attachment.
export function acceptComposerImageFiles(shell, conversation, files) {
  if (shell.disposed || ['adjudicating', 'submitting'].includes(shell.snapshot.phase)) {
    return '输入正在提交，请稍后再添加图片。'
  }
  if (!conversation) return '图片附件尚未就绪，请重试。'
  let images
  try {
    images = conversation.createDraftImages(files)
    if (!shell.addImages(images.map(image => image.id))) {
      conversation.releaseDraftImages(images)
      return '输入正在提交，请稍后再添加图片。'
    }
    return null
  } catch (error) {
    if (images) conversation.releaseDraftImages(images)
    return error instanceof Error ? error.message : String(error)
  }
}

export function patchConversationImageIntake(source) {
  const marker = '/* odyssey:composer-image-file-intake:v1 */'
  if (source.includes(marker)) return source
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw Error('Image intake anchor drifted: ' + before)
    source = source.replace(before, after)
  }
  replace('var SessionInputShell = class {', marker + '\n' + acceptComposerImageFiles.toString() + '\nvar SessionInputShell = class {')
  replace('addImages: (ids) => this.addImages(ids),', 'addImages: (ids) => this.addImages(ids),\n                addImageFiles: files => acceptComposerImageFiles(this, this.deps.imageConversation?.(), files),')
  replace('actx, conversationComponentSessionId:id,', 'actx, conversationComponentSessionId:id,\n                    imageConversation: () => this.rootCtx.get("conversation"),')
  return source
}
