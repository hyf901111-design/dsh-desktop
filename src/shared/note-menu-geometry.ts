import type {NoteMenuState} from './notes-menu'
export type NoteMenuRectangle={x:number;y:number;width:number;height:number}

export function noteMenuBounds(anchor: NoteMenuState['anchor'], work: NoteMenuRectangle, desiredHeight: number, zoom = 1, desiredWidth = 264, shadowInset = 0): NoteMenuRectangle {
  const margin = 8, inset = Math.ceil(shadowInset * zoom), width = Math.min(Math.ceil(desiredWidth * zoom), work.width - margin * 2), height = Math.min(Math.ceil(desiredHeight * zoom), work.height - margin * 2)
  const below = work.y + work.height - anchor.y - anchor.height - margin - 6 + inset, above = anchor.y - work.y - margin - 6 + inset
  const y = below >= height || below >= above ? anchor.y + anchor.height + 6 - inset : anchor.y - height - 6 + inset
  return { x: Math.round(Math.max(work.x + margin, Math.min(anchor.x - inset, work.x + work.width - width - margin))),
    y: Math.round(Math.max(work.y + margin, Math.min(y, work.y + work.height - height - margin))), width, height }
}

export function noteSubmenuBounds(pane:NoteMenuRectangle,item:NoteMenuRectangle,work:NoteMenuRectangle,desiredHeight:number,desiredWidth:number,zoom=1,shadowInset=24):NoteMenuRectangle {
  const inset=shadowInset*zoom,margin=8,gap=4*zoom,width=Math.min(Math.ceil(desiredWidth*zoom),work.width-margin*2),height=Math.min(Math.ceil(desiredHeight*zoom),work.height-margin*2)
  const right=pane.x+pane.width+gap-inset,left=pane.x-gap-(width-inset*2)-inset
  const x=right+width<=work.x+work.width-margin?right:left
  return {x:Math.round(Math.max(work.x+margin,Math.min(x,work.x+work.width-width-margin))),y:Math.round(Math.max(work.y+margin,Math.min(item.y-inset,work.y+work.height-height-margin))),width,height}
}
