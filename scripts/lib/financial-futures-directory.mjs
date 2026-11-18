// Serialized alongside the futures chart in the trusted canvas renderer.
export function FinancialFuturesDirectory({report,directory}) {
  const {jsx,jsxs} = react_jsx_runtime
  const [search,setSearch] = react.useState(''), [selected,setSelected] = react.useState('')
  const reference = directory.rows ?? []
  const byCode = new Map(reference.map(row => [row.code,row]))
  const product = report.products.find(row => row.code === selected)
  if (product) return jsxs('div',{className:'ew-futures-directory',children:[
    jsx('button',{type:'button',className:'ew-directory-back',onClick:()=>setSelected(''),children:'‹ 品种目录'}),
    jsx(FinancialFuturesPanel,{report,initialProduct:product.code},product.code)
  ]})
  const term = search.trim().toLowerCase()
  const rows = report.products.filter(item => {
    const ref = byCode.get(item.code)
    return [item.code,item.name,ref?.name,ref?.exchange,ref?.sector].some(value => value?.toLowerCase().includes(term))
  })
  const hasExchange = reference.some(row=>row.exchange), hasSector = reference.some(row=>row.sector)
  const headers = ['品种','代码',...(hasExchange ? ['交易所'] : []),...(hasSector ? ['板块'] : []),'报价单位','在市合约']
  const columns = labels => jsx('thead',{children:jsx('tr',{children:labels.map(name=>jsx('th',{scope:'col',children:name},name))})})
  const cells = values => values.map((value,index)=>jsx('td',{children:value ?? '—'},index))
  return jsxs('div',{className:'ew-futures-directory',children:[
    jsxs('div',{className:'ew-directory-tools',children:[
      jsx('input',{type:'search','aria-label':'筛选期货品种',placeholder:'搜索品种或代码',value:search,onInput:event=>setSearch(event.currentTarget.value)}),
      jsx('span',{role:'status',children:term ? rows.length+' / '+report.products.length+' 个品种' : report.products.length+' 个品种'}),
      jsx('a',{href:report.url,onClick:financialOpenArticle,target:'_blank',rel:'noopener noreferrer',children:'交易日报 ↗'})
    ]}),
    jsx('div',{className:'ew-futures-scroll',children:rows.length ? jsxs('table',{children:[
      columns(headers),jsx('tbody',{children:rows.map(item=>{
        const ref=byCode.get(item.code)
        return jsxs('tr',{children:[
          jsx('th',{scope:'row',children:jsx('button',{type:'button',className:'ew-directory-product',
            onClick:()=>setSelected(item.code),'aria-label':'查看'+item.name+'的期限结构',children:item.name})}),
          ...cells([item.code.toUpperCase(),...(hasExchange?[ref?.exchange]:[]),...(hasSector?[ref?.sector]:[]),item.unit || ref?.unit,item.contracts.length])
        ]},item.code)
      })})
    ]}) : jsx('p',{children:'没有匹配的品种'})}),
    reference.length>0 && jsxs('details',{className:'ew-directory-reference',children:[
      jsx('summary',{children:'分类与原始参考'}),
      directory.note && jsx('p',{children:directory.note}),
      jsx('p',{children:'在市品种与合约数来自交易日报，板块等分类取自建卡时的参考资料。'}),
      ...((directory.sources ?? []).map(source=>jsx('a',{href:source.url,target:'_blank',rel:'noopener noreferrer',onClick:financialOpenArticle,children:source.label},source.url))),
      jsxs('table',{children:[columns(['代码','名称','交易所','板块','报价单位']),jsx('tbody',{children:reference.map(row=>
        jsx('tr',{children:cells([row.code.toUpperCase(),row.name,row.exchange,row.sector,row.unit])},row.code))})]})
    ]})
  ]})
}
