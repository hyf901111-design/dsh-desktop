import type {HomeOperationActionContext, HomeOperationExample} from './home-operations'

/** The native guide owns session creation after the global menu has dismissed. */
export async function playHomeGuideFromExplore(
  controller: {start(kind: HomeOperationExample, options: {replay: true}): Promise<void>},
  kind: HomeOperationExample,
  context: HomeOperationActionContext
) {
  const current = () => {
    if (context.signal.aborted) throw new DOMException('操作已取消。', 'AbortError')
  }
  current()
  await context.revealComposer()
  current()
  await controller.start(kind, {replay: true})
}
