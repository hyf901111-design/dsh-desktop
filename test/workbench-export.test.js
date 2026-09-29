import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {serializeWorkbenchContent,isPassiveWorkbenchSvg} from '../packages/dsh-research-task-runtime/workbench-export.js'
it('导出保留当前SVG几何、宽高和图表线条，去掉画板底色与脚本',()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');root.style.backgroundColor='rgb(19, 19, 22)';doc.body.append(root)
 root.innerHTML='<svg viewBox="0 0 100 50"><rect width="100" height="50" fill="rgb(19,19,22)"/><path d="M0 20L100 30" stroke="blue"/><script>alert(1)</script></svg>'
 root.getBoundingClientRect=()=>({left:10,top:20,width:460,height:280})
 root.querySelector('svg').getBoundingClientRect=()=>({left:20,top:30,width:440,height:220})
 const result=serializeWorkbenchContent(root,460,280)
 expect(result).toContain('viewBox="0 0 460 280"');expect(result).toContain('width="440" height="220"');expect(result).toContain('d="M0 20L100 30"')
 expect(result).not.toContain('<script');expect(result).not.toContain('foreignObject');expect(result).not.toContain('fill="rgb(19, 19, 22)"')
})
it('导出保留SVG链接里的可见数据、CSS位移和内部滚动区域裁切',()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root)
 root.innerHTML='<div style="overflow:hidden"><svg viewBox="0 0 100 80"><a href="https://example.com"><g style="transform:matrix(1,0,0,1,100,50)"><path id="real-data" d="M0 0L10 10"/></g></a></svg></div>'
 root.getBoundingClientRect=()=>({left:0,top:0,width:460,height:280})
 root.querySelector('div').getBoundingClientRect=()=>({left:0,top:40,width:100,height:20})
 root.querySelector('svg').getBoundingClientRect=()=>({left:0,top:40,width:100,height:80})
 const result=serializeWorkbenchContent(root,460,280)
 expect(result).toContain('id="real-data"');expect(result).toMatch(/transform="matrix\(1,\s*0,\s*0,\s*1,\s*100,\s*50\)"/)
 expect(result).not.toContain('https://example.com');expect(result).toContain('id="ework-clip-0"');expect(result).toContain('height="20"')
 expect(isPassiveWorkbenchSvg(result,s=>new win.DOMParser().parseFromString(s,'image/svg+xml'))).toBe(true)
})
it('已加载的授权图片转成PNG内嵌，加载失败明确报错',()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);root.innerHTML='<img src="blob:https://ework.local/preview"/>'
 root.getBoundingClientRect=()=>({left:0,top:0,width:460,height:280});const img=root.querySelector('img');img.getBoundingClientRect=()=>({left:0,top:0,width:200,height:100})
 expect(()=>serializeWorkbenchContent(root,460,280)).toThrow('图片内容暂时无法导出')
})

it('图片导出遵循contain的可见比例与位置',()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);root.innerHTML='<img style="object-fit:contain;object-position:50% 50%"/>'
 root.getBoundingClientRect=()=>({left:0,top:0,width:200,height:100});const img=root.querySelector('img');img.getBoundingClientRect=()=>({left:0,top:0,width:200,height:100})
 Object.defineProperties(img,{complete:{value:true},naturalWidth:{value:100},naturalHeight:{value:200}})
 const destinations=[],create=doc.createElement.bind(doc);doc.createElement=(name,...args)=>{const el=create(name,...args);if(name==='canvas'){el.getContext=()=>({drawImage:(...values)=>destinations.push(values.slice(1))});el.toDataURL=()=> 'data:image/png;base64,iVBORw=='}return el}
 const result=serializeWorkbenchContent(root,200,100)
 expect(destinations).toEqual([[150,0,100,200]])
 expect(result).toContain('width="200" height="100"');expect(isPassiveWorkbenchSvg(result,s=>new win.DOMParser().parseFromString(s,'image/svg+xml'))).toBe(true)
})
