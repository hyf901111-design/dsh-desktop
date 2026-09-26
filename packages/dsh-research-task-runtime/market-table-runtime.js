// Serialized into a trusted template. A stable query/sort/selection DOM makes
// these controls compatible with the existing data-only refresh state bridge.
export function marketTableRuntime() {
  const table=document.querySelector('.market-table-wrap table'),search=document.querySelector('[data-market-search]'),count=document.querySelector('[data-market-count]'),readout=document.querySelector('.terminal-table-readout');
  if(!table)return;
  const rows=[...table.querySelectorAll('tbody tr')],headers=[...table.querySelectorAll('thead th')],cells=row=>[...row.querySelectorAll('td')];
  const numeric=value=>{const text=value.trim().replace(/[,，\s]/g,'').replace(/[−]/g,'-');const valuePart=parseFloat(text);return Number.isFinite(valuePart)?valuePart*(text.includes('亿')?1e8:text.includes('万')?1e4:1):0};
  const describe=row=>{rows.forEach(item=>item.setAttribute('aria-selected',String(item===row)));readout.textContent=row?cells(row).map((cell,index)=>headers[index].textContent+' '+cell.textContent).join(' · '):'没有匹配的数据'};
  const filter=()=>{const query=search.value.trim().toLocaleLowerCase();rows.forEach(row=>row.hidden=!row.textContent.toLocaleLowerCase().includes(query));const visible=rows.filter(row=>!row.hidden);count.textContent=visible.length+' / '+rows.length+' 项';describe(visible.find(row=>row.getAttribute('aria-selected')==='true')??visible[0])};
  headers.forEach((header,index)=>header.querySelector('button').addEventListener('click',()=>{
    const ascending=header.getAttribute('aria-sort')!=='ascending';headers.forEach(item=>item.removeAttribute('aria-sort'));header.setAttribute('aria-sort',ascending?'ascending':'descending');
    const ordered=[...rows].sort((a,b)=>{const x=cells(a)[index].textContent,y=cells(b)[index].textContent;const d=header.dataset.numeric==='true'?numeric(x)-numeric(y):x.localeCompare(y,'zh-CN',{numeric:true});return ascending?d:-d});ordered.forEach(row=>table.querySelector('tbody').appendChild(row));
  }));
  rows.forEach(row=>{row.tabIndex=0;row.addEventListener('click',()=>describe(row));row.addEventListener('focus',()=>describe(row));row.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const visible=[...table.querySelectorAll('tbody tr')].filter(item=>!item.hidden),index=visible.indexOf(row);const next=event.key==='Home'?0:event.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,index+(event.key==='ArrowDown'?1:-1)));visible[next]?.focus()})});
  search.addEventListener('input',filter);filter();
}
