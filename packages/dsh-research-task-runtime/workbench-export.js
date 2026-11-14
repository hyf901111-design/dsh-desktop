// Serialize the visible content viewport to passive SVG, keeping charts as
// vectors and reading the current DOM state (filters, values and scroll).
export function serializeWorkbenchContent(root,width,height,includeBackground=false) {
  const doc=root.ownerDocument,view=doc.defaultView,origin=root===doc.body?{left:0,top:0}:root.getBoundingClientRect(),parts=[],clips=[]
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))
  const n=v=>Math.round(v*100)/100,style=el=>view.getComputedStyle(el)
  const background=style(root).backgroundColor
  const transparent=c=>!c||c==='transparent'||c==='rgba(0, 0, 0, 0)'||c===background
  const box=el=>{const r=el.getBoundingClientRect();return {x:r.left-origin.left,y:r.top-origin.top,w:r.width,h:r.height}}
  let characters=0
  const text=(value,x,y,css)=>{
    if(!value.trim())return
    parts.push('<text x="'+n(x)+'" y="'+n(y)+'" fill="'+escape(css.color)+'" font-family="'+escape(css.fontFamily)+'" font-size="'+escape(css.fontSize)+'" font-weight="'+escape(css.fontWeight)+'" font-style="'+escape(css.fontStyle)+'" xml:space="preserve">'+escape(value)+'</text>')
  }
  const walkContent=el=>{
    const css=style(el),r=box(el)
    if(css.display==='none'||css.visibility==='hidden'||r.y>=height||r.x>=width||r.y+r.h<=0||r.x+r.w<=0||el.matches('script,style,link,meta,iframe,input[type=password],input[type=hidden],input[type=file]'))return
    if(el.tagName.toLowerCase()==='svg'){
      const clone=el.cloneNode(true),originals=[el,...el.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')]
      for(let i=0;i<copies.length;i++){
        const c=copies[i],s=style(originals[i]);c.removeAttribute('class');c.removeAttribute('style')
        for(const a of [...c.attributes])if(/^on/i.test(a.name)||['role','tabindex','focusable','cursor'].includes(a.name)||/^(?:href|xlink:href|src)$/i.test(a.name)&&!a.value.startsWith('#'))c.removeAttribute(a.name)
        if(c.matches('script,foreignObject,image,style,animate,animateTransform,set')){c.remove();continue}
        for(const k of ['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','opacity','font-family','font-size','font-weight','text-anchor','dominant-baseline']){const value=s.getPropertyValue(k);c.setAttribute(k,/url\(/.test(value)?(/#[a-zA-Z][\w-]*/.exec(value)?.[0]?('url('+/#[a-zA-Z][\w-]*/.exec(value)[0]+')'):'none'):value)}
        if(c.tagName.toLowerCase()==='rect'&&transparent(s.fill))c.setAttribute('fill','none')
        if(s.transform&&s.transform!=='none')c.setAttribute('transform',s.transform)
      }
      clone.setAttribute('x',n(r.x));clone.setAttribute('y',n(r.y));clone.setAttribute('width',n(r.w));clone.setAttribute('height',n(r.h));clone.setAttribute('xmlns','http://www.w3.org/2000/svg')
      parts.push(new view.XMLSerializer().serializeToString(clone));return
    }
    if(el.matches('canvas,img')){
      let source='';try{
        if(el.tagName.toLowerCase()==='canvas')source=el.toDataURL('image/png')
        else{if(!el.complete||!el.naturalWidth)throw Error('图片尚未加载');const canvas=doc.createElement('canvas');canvas.width=Math.max(1,Math.ceil(r.w*2));canvas.height=Math.max(1,Math.ceil(r.h*2));if(canvas.width*canvas.height>24000000)throw Error('图片过大');const ctx=canvas.getContext('2d'),nw=el.naturalWidth,nh=el.naturalHeight,fit=css.objectFit||'fill';let dw=r.w,dh=r.h
          if(fit!=='fill'){let scale=fit==='cover'?Math.max(r.w/nw,r.h/nh):Math.min(r.w/nw,r.h/nh);if(fit==='none')scale=1;if(fit==='scale-down')scale=Math.min(1,scale);dw=nw*scale;dh=nh*scale}
          const position=(css.objectPosition||'50% 50%').split(/\s+/),offset=(token,space)=>token?.endsWith('%')?space*parseFloat(token)/100:token==='left'||token==='top'?0:token==='right'||token==='bottom'?space:token==='center'?space/2:parseFloat(token)||0
          ctx.drawImage(el,offset(position[0],r.w-dw)*2,offset(position[1]||position[0],r.h-dh)*2,dw*2,dh*2);source=canvas.toDataURL('image/png')}
      }catch{throw Error('图片内容暂时无法导出，请等待加载完成后重试')}
      if(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(source))parts.push('<image x="'+n(r.x)+'" y="'+n(r.y)+'" width="'+n(r.w)+'" height="'+n(r.h)+'" href="'+source+'"/>')
      return
    }
    if(el!==root&&!transparent(css.backgroundColor))parts.push('<rect x="'+n(r.x)+'" y="'+n(r.y)+'" width="'+n(r.w)+'" height="'+n(r.h)+'" rx="'+(parseFloat(css.borderRadius)||0)+'" fill="'+escape(css.backgroundColor)+'"/>')
    if(el.matches('input,textarea,select')){text(el.tagName.toLowerCase()==='select'?el.selectedOptions[0]?.textContent||'':el.value||el.placeholder||'',r.x+(parseFloat(css.paddingLeft)||0)+2,r.y+r.h/2+(parseFloat(css.fontSize)||13)*.35,css);return}
    for(const child of el.childNodes){
      if(child.nodeType===1){walk(child);continue}
      if(child.nodeType!==3||!child.textContent.trim())continue
      const range=doc.createRange(),value=child.textContent;let run='',lastY=null,startX=0
      const flush=()=>{if(run)text(run,startX,lastY,css);run=''}
      for(let i=0;i<value.length;i++){
        if(++characters>100000)throw Error('组件内容过长，请缩小导出范围')
        range.setStart(child,i);range.setEnd(child,i+1);const b=range.getBoundingClientRect()
        if(!b.width||!b.height)continue
        const y=n(b.top-origin.top+b.height*.8),x=b.left-origin.left
        if(lastY!==y){flush();startX=x;lastY=y}
        run+=value[i]
      }
      flush()
    }
  }
  const walk=el=>{
    const css=style(el),r=box(el),clipped=el!==root&&/(hidden|auto|scroll|clip)/.test(css.overflow+' '+css.overflowX+' '+css.overflowY)
    if(clipped){const id='ework-clip-'+clips.length;clips.push('<clipPath id="'+id+'"><rect x="'+n(r.x)+'" y="'+n(r.y)+'" width="'+n(el.clientWidth||r.w)+'" height="'+n(el.clientHeight||r.h)+'"/></clipPath>');parts.push('<g clip-path="url(#'+id+')">')}
    walkContent(el)
    if(clipped)parts.push('</g>')
  }
  walk(root)
  const backdrop=includeBackground?'<rect width="100%" height="100%" fill="'+escape(background)+'"/>':''
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+n(width)+'" height="'+n(height)+'" viewBox="0 0 '+n(width)+' '+n(height)+'"><defs><clipPath id="ework-viewport"><rect width="100%" height="100%"/></clipPath>'+clips.join('')+'</defs><g clip-path="url(#ework-viewport)">'+backdrop+parts.join('')+'</g></svg>'
}
export async function workbenchImageExportRequest(doc,svg,title,format) {
  const view=doc.defaultView
  if(!view||!isPassiveWorkbenchSvg(svg,s=>new view.DOMParser().parseFromString(s,'image/svg+xml')))throw Error('组件导出内容无效')
  const suggestedName=title.slice(0,120)+'.'+format
  if(format==='svg')return {kind:'text',format,suggestedName,content:svg}
  const image=new view.Image(),source='data:image/svg+xml;base64,'+view.btoa(unescape(encodeURIComponent(svg)))
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('组件图片生成失败'));image.src=source})
  const canvas=doc.createElement('canvas'),scale=Math.min(2,Math.sqrt(24000000/(image.width*image.height)))
  if(!Number.isFinite(scale)||image.width<1||image.height<1||image.width>16384||image.height>16384)throw Error('组件导出尺寸过大')
  canvas.width=Math.floor(image.width*scale);canvas.height=Math.floor(image.height*scale)
  const context=canvas.getContext('2d');if(!context)throw Error('组件图片生成失败')
  if(format==='jpg'){context.fillStyle=doc.body.hasAttribute('data-ds-dark-theme')?'#131316':'#ffffff';context.fillRect(0,0,canvas.width,canvas.height)}
  context.drawImage(image,0,0,canvas.width,canvas.height)
  return {kind:'binary',format,suggestedName,base64:canvas.toDataURL(format==='jpg'?'image/jpeg':'image/png',.94).split(',')[1]}
}
export function isPassiveWorkbenchSvg(value,parse) {
  if(typeof value!=='string'||value.length>8*1024*1024||/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(value))return false
  try{
    const doc=parse(value),root=doc.documentElement
    if(root?.localName!=='svg')return false
    const tags=new Set(['svg','g','defs','clipPath','mask','rect','path','line','polyline','polygon','circle','ellipse','text','tspan','linearGradient','radialGradient','stop','title','desc','image','use','a'])
    const attributes=new Set(('id x y x1 y1 x2 y2 cx cy r rx ry width height d points viewBox preserveAspectRatio transform opacity fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset clip-path clip-rule mask font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline textLength lengthAdjust gradientUnits gradientTransform spreadMethod clipPathUnits maskUnits maskContentUnits color offset stop-color stop-opacity href xlink:href xmlns xmlns:xlink xml:space version').split(' '))
    const local=v=>/^#[A-Za-z_][\w:.-]*$/.test(v)
    for(const el of [root,...Array.from(doc.getElementsByTagName('*')).filter(n=>n!==root)]){
      if(!tags.has(el.localName)||el.namespaceURI&&el.namespaceURI!=='http://www.w3.org/2000/svg')return false
      for(const attr of Array.from(el.attributes)){
        const name=attr.name,v=attr.value
        if(!attributes.has(name)&&!/^data-[\w-]+$|^aria-[\w-]+$/.test(name))return false
        if(name==='xmlns'&&v!=='http://www.w3.org/2000/svg'||name==='xmlns:xlink'&&v!=='http://www.w3.org/1999/xlink')return false
        if(/^(?:href|xlink:href)$/.test(name)&&!local(v)){
          if(el.localName!=='image'||!/^data:image\/(?:png|jpeg);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v)||!/^data:image\/(?:png;base64,iVBOR|jpeg;base64,\/9j\/)/.test(v))return false
        }
        if(/^(?:fill|stroke|clip-path|mask|color|stop-color)$/.test(name)&&/[\\@]/.test(v))return false
        for(const match of v.matchAll(/url\(([^)]*)\)/gi))if(!local(match[1].trim().replace(/^["']|["']$/g,'')))return false
      }
    }
    return true
  }catch{return false}
}
export function installWorkbenchExport(serialize) {
  addEventListener('message',event=>{
    const d=event.data
    if(event.source!==parent||!d||Object.keys(d).length!==2||d.type!=='sherlock-workbench-export'||typeof d.id!=='string'||!/^export-[a-z0-9-]{1,80}$/.test(d.id))return
    try{const svg=serialize(document.body,document.documentElement.clientWidth,document.documentElement.clientHeight);parent.postMessage({type:'sherlock-workbench-export-result',id:d.id,svg},'*')}
    catch{parent.postMessage({type:'sherlock-workbench-export-result',id:d.id,svg:''},'*')}
  })
}
