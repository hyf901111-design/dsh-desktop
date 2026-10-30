import first from './explore-assets/orb-0.svg?inline'
import second from './explore-assets/orb-1.svg?inline'
import third from './explore-assets/orb-2.svg?inline'

/** Three original Figma phases blend continuously, including without hover. */
export function createExploreOrb(doc:Document) {
  const orb=doc.createElement('i');orb.className='odyssey-explore-orb';orb.setAttribute('aria-hidden','true');orb.style.cssText='position:relative;display:block;width:40px;height:40px;flex:none;border-radius:50%;overflow:hidden'
  for(const source of [first,second,third]){const image=doc.createElement('img');image.src=source;image.alt='';image.width=40;image.height=40;image.draggable=false;image.style.cssText='position:absolute;inset:0;display:block';orb.append(image)}
  return orb
}
