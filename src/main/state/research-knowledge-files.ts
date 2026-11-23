import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isKnowledgeFileId } from '../../shared/knowledge-drag'
import { sharedKnowledgeSessionFile } from '../../shared/knowledge-sessions'
import type { KnowledgeDocument } from '../../shared/knowledge-library'
import type { ResearchFilePreviewRegistry } from './research-file-preview'
import { copyResearchFile } from './research-owned-files'

type Source = { document: Pick<KnowledgeDocument, 'name'|'source'> } & ({ path: string } | { data: Uint8Array })
type Options = {
  read(fileId: string): Promise<Source>
  directory(sessionId: string): Promise<string>
  guard(sessionId: string): () => void
  registry: Pick<ResearchFilePreviewRegistry,'admitFinder'|'revokeAuthorization'>
}

export async function admitKnowledgeResearchFile(input: { fileId?: unknown; sessionId?: unknown; nodeId?: unknown }, options: Options) {
  const { fileId, sessionId, nodeId } = input ?? {}
  if (!isKnowledgeFileId(fileId) || typeof sessionId !== 'string' || !/^[-\w:.]{1,256}$/.test(sessionId) ||
      sessionId.startsWith('knowledge-view:') || typeof nodeId !== 'string' || !/^[-\w]{1,128}$/.test(nodeId)) throw Error('画布文件标识无效。')
  const check = options.guard(sessionId)
  check()
  const file = await options.read(fileId)
  check()
  const name = file.document.name
  if ('data' in file && sharedKnowledgeSessionFile(name, file.document.source)) throw Error('请在知识库中打开对应的只读会话。')
  const directory = await options.directory(sessionId)
  check()
  let staged: string | undefined, copy: string | undefined, authorization: string | undefined
  try {
    let source: string
    if ('data' in file) {
      staged = await mkdtemp(join(tmpdir(), 'odyssey-board-file-'))
      source = join(staged, 'received')
      await writeFile(source, file.data, { flag: 'wx', mode: 0o600 })
    } else source = file.path
    check()
    copy = await copyResearchFile(source, directory, { name })
    check()
    const descriptor = await options.registry.admitFinder({ path: copy, sessionId, nodeId }, true)
    if (!descriptor) throw Error('原文件暂时无法添加到画布。')
    authorization = descriptor.authorizationId
    check()
    return { ...descriptor, path: copy }
  } catch (error) {
    if (authorization) options.registry.revokeAuthorization(authorization)
    if (copy) await rm(copy, { force: true })
    throw error
  } finally {
    if (staged) await rm(staged, { recursive: true, force: true })
  }
}
