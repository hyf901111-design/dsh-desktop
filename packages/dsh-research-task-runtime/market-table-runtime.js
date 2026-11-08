// Serialized into a trusted template. A stable query/sort/selection DOM makes
// these controls compatible with the existing data-only refresh state bridge.
export function marketTableRuntime() {
  const table=document.querySelector('.market-table-wrap table'),search=document.querySelector('[data-market-search]'),count=document.querySelector('[data-market-count]'),readout=document.querySelector('.terminal-table-readout');
  if(!table)return;
  const rows=[...table.querySelectorAll('tbody tr')],headers=[...table.querySelectorAll('thead th')],cells=row=>[...row.querySelectorAll('td')];
  const pageSize=20,paginated=rows.length>30;let page=0,pager,select,range,previous,next;
  if(paginated){
    pager=document.createElement('nav');pager.className='terminal-table-pagination';pager.setAttribute('aria-label','表格分页');
    range=document.createElement('span');range.setAttribute('aria-live','polite');
    const button=(name,right)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',name);const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');Object.entries({width:'14',height:'14',viewBox:'0 0 16 16',fill:'none',stroke:'currentColor','stroke-width':'1.3','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}).forEach(([key,value])=>svg.setAttribute(key,value));path.setAttribute('d',right?'M6 4l4 4-4 4':'M10 4l-4 4 4 4');svg.append(path);b.append(svg);return b};
    previous=button('上一页',false);next=button('下一页',true);select=document.createElement('select');select.setAttribute('aria-label','表格页码');
    pager.append(range,previous,select,next);table.closest('.market-table-wrap').after(pager);
    previous.addEventListener('click',()=>{page--;filter(false)});next.addEventListener('click',()=>{page++;filter(false)});select.addEventListener('change',()=>{page=Number(select.value);filter(false)});
  }
  const numeric=value=>{const text=value.trim().replace(/[,，\s]/g,'').replace(/[−]/g,'-');const valuePart=parseFloat(text);return Number.isFinite(valuePart)?valuePart*(text.includes('亿')?1e8:text.includes('万')?1e4:1):0};
  const describe=row=>{rows.forEach(item=>item.setAttribute('aria-selected',String(item===row)));readout.textContent=row?cells(row).map((cell,index)=>headers[index].textContent+' '+cell.textContent).join(' · '):'没有匹配的数据'};
  const filter=(reset=true)=>{
    if(reset)page=0;
    const query=search.value.trim().toLocaleLowerCase(),matched=[...table.querySelectorAll('tbody tr')].filter(row=>row.textContent.toLocaleLowerCase().includes(query));
    const pages=Math.max(1,Math.ceil(matched.length/pageSize));page=Math.max(0,Math.min(pages-1,page));
    const shown=paginated?matched.slice(page*pageSize,(page+1)*pageSize):matched,set=new Set(shown);rows.forEach(row=>row.hidden=!set.has(row));
    count.textContent=matched.length+' / '+rows.length+' 项';
    if(pager){select.replaceChildren(...Array.from({length:pages},(_,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=(i+1)+' / '+pages;return o}));select.value=String(page);previous.disabled=page===0;next.disabled=page>=pages-1;range.textContent=matched.length?(page*pageSize+1)+'–'+Math.min(matched.length,(page+1)*pageSize)+' / '+matched.length+' 条':'0 条'}
    describe(shown.find(row=>row.getAttribute('aria-selected')==='true')??shown[0]);
    window.dispatchEvent(new Event('sherlock-presentation-change'));
  };
  headers.forEach((header,index)=>header.querySelector('button').addEventListener('click',()=>{
    const ascending=header.getAttribute('aria-sort')!=='ascending';headers.forEach(item=>item.removeAttribute('aria-sort'));header.setAttribute('aria-sort',ascending?'ascending':'descending');
    const ordered=[...rows].sort((a,b)=>{const x=cells(a)[index].textContent,y=cells(b)[index].textContent;const d=header.dataset.numeric==='true'?numeric(x)-numeric(y):x.localeCompare(y,'zh-CN',{numeric:true});return ascending?d:-d});ordered.forEach(row=>table.querySelector('tbody').appendChild(row));filter();
  }));
  rows.forEach(row=>{row.tabIndex=0;row.addEventListener('click',()=>describe(row));row.addEventListener('focus',()=>describe(row));row.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const visible=[...table.querySelectorAll('tbody tr')].filter(item=>!item.hidden),index=visible.indexOf(row);const next=event.key==='Home'?0:event.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,index+(event.key==='ArrowDown'?1:-1)));visible[next]?.focus()})});
  search.addEventListener('input',filter);filter();
}

export const MARKET_TABLE_PAGINATION_CSS=`
.terminal-table-pagination{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex:none;min-height:28px;font:11px/18px var(--sherlock-font-sans,inherit);color:inherit}
.terminal-table-pagination>span{margin-right:auto;white-space:nowrap}
.terminal-table-pagination :is(button,select){box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:24px;min-height:24px;padding:2px 5px;border:1px solid var(--sherlock-control-border,#8885);border-radius:2px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.terminal-table-pagination button{width:26px}.terminal-table-pagination button:disabled{opacity:.35;cursor:default}.terminal-table-pagination :is(button,select):focus-visible{outline:1px solid currentColor;outline-offset:2px}
`;
