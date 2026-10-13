/** Use the actual reading column, including its stable scrollbar gutters. */
export function alignNotesComposer(surface: HTMLElement, composer: HTMLElement): void {
  if (surface.hidden) return
  const content = surface.querySelector('.en-document')?.getBoundingClientRect(), root = surface.getBoundingClientRect()
  if (!content?.width) return
  composer.style.left = content.left - root.left + 'px'
  composer.style.width = content.width + 'px'
  composer.style.transform = 'none'
}
