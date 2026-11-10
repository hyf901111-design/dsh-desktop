import {ImageView,nativeImage,screen,type BrowserWindow} from 'electron'

// Native View only accepts a uniform radius. Two small composited cutouts keep
// the website square at the toolbar without moving its viewport or hit area.
export function createBrowserCorners(getWindow:()=>BrowserWindow){
 let owner:BrowserWindow|undefined,views:ImageView[]=[],signature=''
 const dispose=()=>{if(owner&&!owner.isDestroyed())for(const view of views)owner.contentView.removeChildView(view);owner=undefined;views=[];signature=''}
 const layout=(bounds:{x:number;y:number;width:number;height:number}|undefined,visible:boolean,color:number[],zoom:number)=>{
  if(!visible||!bounds){for(const view of views)view.setVisible(false);return}
  const win=getWindow();if(owner!==win){dispose();owner=win}
  if(!views.length)views=[new ImageView(),new ImageView()];
  const radius=Math.max(1,Math.min(Math.round(16*zoom),Math.floor(bounds.width/2),Math.floor(bounds.height/2))),scale=screen.getDisplayMatching(win.getBounds()).scaleFactor,key=JSON.stringify([radius,scale,color])
  if(signature!==key){
   const size=Math.ceil(radius*scale)
   views.forEach((view,side)=>{
    const pixels=Buffer.alloc(size*size*4),[red=17,green=17,blue=17]=color
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
     const dx=side?x+.5:size-x-.5,alpha=Math.max(0,Math.min(1,Math.hypot(dx,y+.5)-size+.5)),i=(y*size+x)*4
     pixels[i]=Math.round(blue*alpha);pixels[i+1]=Math.round(green*alpha);pixels[i+2]=Math.round(red*alpha);pixels[i+3]=Math.round(255*alpha)
    }
    view.setBackgroundBlur(0) // Allocate a composited layer above the native page.
    view.setImage(nativeImage.createFromBitmap(pixels,{width:size,height:size,scaleFactor:scale}))
   });signature=key
  }
  views.forEach((view,side)=>{view.setBounds({x:side?bounds.x+bounds.width-radius:bounds.x,y:bounds.y+bounds.height-radius,width:radius,height:radius});win.contentView.addChildView(view);view.setVisible(true)})
 }
 return {layout,dispose}
}
