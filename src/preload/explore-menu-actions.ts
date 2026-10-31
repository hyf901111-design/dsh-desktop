import type {HomeOperationActionContext, HomeOperationExample} from './home-operations'

/** Let the guide show its owned close/navigation path before creating the demo. */
export async function playHomeGuideFromExplore(
  controller: {start(kind: HomeOperationExample, options: {replay: true; entry: HomeOperationActionContext}): Promise<void>},
  kind: HomeOperationExample,
  context: HomeOperationActionContext
) {
  const current = () => {
    if (context.signal.aborted) throw new DOMException('操作已取消。', 'AbortError')
  }
  current()
  await controller.start(kind, {replay: true,entry:context})
}
