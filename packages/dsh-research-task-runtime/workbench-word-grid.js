import { derivedOutline,parseDerivedSpec } from './derived-template-contract.js';

const layouts=['cells','paragraph','name-list'];
const blockId=/^[PT][1-9]\d{0,3}$/u;
const exact=(value,required,optional=[])=>value&&typeof value==='object'&&!Array.isArray(value)&&
 required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const fail=message=>{throw Error('Word 原文记录：'+message);};
const field=(key,label)=>({key,label});
export const isWordDocument=document=>/\.docx$/iu.test(document?.name??'')&&Array.isArray(document?.blocks)&&
 (document.format===undefined||document.format==='docx');

const outlineName=value=>value.normalize('NFKC').replace(/\[[PT]\d+\]/gu,'').trim()
 .replace(/^(?:[A-Za-z][A-Za-z0-9_-]*\d\s*·\s*|\d+(?:\s*[.、]\s*|\s+))/u,'')
 .replace(/\s+/gu,'').replaceAll('证券监管局','证监局');
const uniqueNames=names=>names.length>0&&names.every(Boolean)&&new Set(names).size===names.length;

function documentOutlineGroups(document){
 const groups=[];
 for(const [index,block] of document.blocks.entries()){
  if(block.rows?.length){
   const previous=document.blocks[index-1];
   const caption=previous?.rows?.length===1&&previous.rows[0].length===1?previous.rows[0][0]:previous?.text;
   const heading=/^([^\n。；：:]{2,36}?)\s*(\d+)\s*个(?:\s*[·+＋及]\s*([\p{L}]+))?\s*$/u.exec(caption??'');
   if(heading){
    const [,label,count,extra]=heading;
    const members=block.rows.flat().filter(cell=>cell?.trim()).map(cell=>cell.trim().split(/\n|\s{2,}/u,1)[0]);
    const names=members.map(outlineName);
    if(names.length===Number(count)+(extra?1:0)&&uniqueNames(names)&&
       (!extra||names.some(name=>name===outlineName(extra)||name.startsWith(outlineName(extra)+'('))))
     groups.push({block:block.id,label,count:Number(count),names,members,caption:true});
   }
   const first=block.rows[0],label=/^(.+?)名称$/u.exec(first?.[1]??'')?.[1];
   if(label&&first.length%2===0&&first.every((value,i)=>value===first[i%2])&&first[0]==='序号'){
    const numbered=block.rows.slice(1).flatMap(row=>row.flatMap((cell,i)=>i%2===0&&/^\d+$/u.test(cell)&&row[i+1]?.trim()
     ?[[Number(cell),row[i+1].trim()]]:[]));
    const members=numbered.map(([,name])=>name),names=members.map(outlineName);
    if(uniqueNames(names)&&new Set(numbered.map(([n])=>n).filter(n=>n>=1&&n<=names.length)).size===names.length)
     groups.push({block:block.id,label,count:names.length,names,members});
   }
  }
  for(const [,count,label,members] of (block.text??'').matchAll(/(\d+)\s*个\s*([\p{L}]{2,20})[：:]([^。；\n]+)(?=[。；\n]|$)/gu)){
   const entries=members.split('、').map(member=>member.trim()),names=entries.map(outlineName);
   if(names.length===Number(count)&&uniqueNames(names))
    groups.push({block:block.id,label,count:Number(count),names,members:entries,list:true});
  }
  const offices=/(?:^|。)另设\s*([^。；\n]+(?:专员办事处|派驻办公室))。?$/u.exec(block.text??'');
  if(offices){
   const members=offices[1].split('、').map(member=>member.trim()),names=members.map(outlineName);
   if(names.length>1&&uniqueNames(names)&&names.every(name=>name.endsWith('专员办事处')))
    groups.push({block:block.id,label:'专员办事处',count:names.length,names,members,list:true});
  }
 }
 return groups;
}

function outlineGroupHeading(label,group){
 const title=outlineName(group.label),heading=label.split(/\d+个|:/u,1)[0];
 return label.includes(title)||heading.length>=3&&title.endsWith(heading);
}

export function completeWordOutline(artifact,documents){
 if(artifact?.type!=='mind-map'||!Array.isArray(documents))return artifact;
 const sources=documents.filter(isWordDocument),outline=derivedOutline(artifact.content);
 if(!outline||sources.length!==1||!JSON.stringify(artifact.source??{}).includes(sources[0].name))return artifact;
 const groups=documentOutlineGroups(sources[0]),matches=new Map();
 const visit=node=>{
  for(const group of groups){
   const label=outlineName(node.label),name=label.replace(/^\d+个/u,'').replace(/\d+个.*$|[:(].*$/gu,'');
   const title=outlineName(group.label),counted=label.includes(`${group.count}个`);
   const unambiguous=(name===title||name.length>=3&&title.endsWith(name)||counted&&title.length>=3&&name.endsWith(title))&&
    (group.caption||counted);
   if(!outlineGroupHeading(label,group)||!node.label.includes(`[${group.block}]`)&&!unambiguous)continue;
   matches.set(group,[...(matches.get(group)??[]),node]);
  }
  node.children.forEach(visit);
 };
 outline.children.forEach(visit);
 const additions=new Map(),citations=[];
 for(const [group,branches] of matches){
  if(branches.length!==1)continue;
  const [node]=branches;
  if(group.list&&outlineName(node.label).includes(':')&&
     group.names.every(name=>outlineName(node.label).split(':').at(-1).split('、').includes(name)))continue;
  const present=new Set(node.children.map(child=>outlineName(child.label).split(':',1)[0]));
  const missing=group.members.filter((_,i)=>!present.has(group.names[i]));
  if(!missing.length)continue;
  additions.set(node.line,{block:group.block,members:missing});
  citations.push(`[${group.block}] ${group.label}：${group.members.join('、')}`);
 }
 if(!additions.size)return artifact;
 const content=artifact.content.split(/\r?\n/u).flatMap((line,i)=>{
  const addition=additions.get(i);
  if(!addition)return [line];
  const {block,members}=addition;
  const indent=line.match(/^ */u)[0].length+2;
  const citation=`[${block}]`;
  return [line.includes(citation)?line:line+' '+citation,...members.map(member=>' '.repeat(indent)+'- '+member+' '+citation)];
 }).join('\n');
 return parseDerivedSpec({...artifact,content,source:{...artifact.source,text:[artifact.source.text,...citations].join('\n')}})??artifact;
}

// Count a named source group only in the cited branch that actually presents it.
export function wordOutlineCoverage(artifact,documents,prompt=''){
 if(artifact?.type!=='mind-map'||!Array.isArray(documents))return;
 const outline=derivedOutline(artifact.content);
 const sources=documents.filter(isWordDocument);
 if(!outline||sources.length!==1)return;
 const groups=documentOutlineGroups(sources[0]),verified=[];
 const visit=node=>{
  const label=outlineName(node.label);
  for(const group of groups){
   if(!node.label.includes(`[${group.block}]`)||!outlineGroupHeading(label,group))continue;
   if(!node.children.length&&!(group.list&&label.includes(`${group.count}个`)&&label.includes(':')))continue;
   const children=new Set(node.children.map(child=>outlineName(child.label).split(':',1)[0]));
   if(group.list){
    for(const member of label.split(/[：:]/u).at(-1).split('、'))children.add(member);
   }
   const matched=group.names.filter(name=>children.has(name)).length;
   verified.push({...group,actual:matched===group.names.length?group.count:Math.min(matched,group.count-1)});
  }
  node.children.forEach(visit);
 };
 visit(outline);
 const intended=outlineName(prompt);
 const chapterIds=new Set(organizationChapters(sources[0],prompt).filter(chapter=>
  outline.children.some(branch=>branch.children.length>0&&branch.label.includes('['+chapter.id+']')&&
   [chapter.heading,shortOrganization(chapter.heading)].some(name=>outlineName(branch.label)===outlineName(name))))
  .map(chapter=>chapter.id));
 return ({expected,entity,unit})=>{
  if(unit==='家'&&/^(?:监管)?机构$/u.test(entity)&&chapterIds.size)return chapterIds.size;
  if(unit!=='个')return;
  const name=outlineName(entity);
  const found=verified.filter(group=>{
   if(group.count!==expected)return false;
   const title=outlineName(group.label);
   return name?name.includes(title)||title.includes(name):group.caption||
    intended.includes(title+`${expected}个`)||intended.includes(title+`(${expected}个`);
  });
  if(found.length)return Math.min(...found.map(group=>group.actual));
 };
}
const uncertainty=/待核(?:实|验)?|尚未核实|本次未核实|未确认|未掌握|现职需复核|不代表岗位空缺/u;
const officer=/^(?:主席|副主席|会长|(?:专职|兼职)?副会长|秘书长|副秘书长|理事长|监事长|董事长|驻[^\n：:]{1,16}纪检监察组组长)(?:[：:]\s*|\s+)(?=\p{L})/u;

export function completeWordReadingPanel(panel,documents,request=''){
 const artifact=panel?.artifact;
 if(artifact?.type==='mind-map'){
  const completed=completeWordOutline(artifact,documents);
  return completed===artifact?panel:{...panel,artifact:completed};
 }
 if(artifact?.type!=='markdown'||!Array.isArray(documents)||typeof artifact.content!=='string')return panel;
 const sources=documents.filter(isWordDocument);
 if(sources.length!==1||!artifact.content.includes(sources[0].name))return panel;
 const [document]=sources;
 if(/待核|待复核|未确认/u.test(panel.title)&&/待核|待复核|未确认/u.test(request)){
  const additions=document.blocks.filter(block=>block.id.startsWith('P')&&uncertainty.test(block.text??'')&&
   !artifact.content.includes(`[${block.id}]`)&&!artifact.content.includes(block.text));
  if(!additions.length)return panel;
  const content=[artifact.content,'## 补充原文',...additions.map(block=>`- [${block.id}] ${block.text}`)].join('\n\n');
  if(content.length>32_000)return panel;
  return {...panel,artifact:{...artifact,content}};
 }
 if(!/(?:组织|监管|机构).{0,12}(?:关系|架构|结构|层级)/u.test(panel.title)||
    !/(?:组织|监管|机构).{0,24}(?:关系|架构|结构|层级)/u.test(request))return panel;
 const headings=new Map(document.blocks.flatMap(block=>block.id.startsWith('P')&&block.text?
  [[outlineName(block.text),block.id]]:[]));
 const tree=['# '+panel.title.replace(/[\r\n]+/gu,' ')],observed=new Set();
 let active=false;
 for(const line of artifact.content.split(/\r?\n/u)){
  const heading=/^#{1,4}\s+(.+)$/u.exec(line)?.[1];
  if(heading){
   const id=headings.get(outlineName(heading));
   active=Boolean(id)&&!observed.has(id);
   if(active){observed.add(id);tree.push(`- ${heading} [${id}]`);}
   continue;
  }
  if(active&&/^(?: {2})*[-+*] \S/u.test(line))tree.push('  '+line);
 }
 if(observed.size<2||tree.length<5)return panel;
 const outline=parseDerivedSpec({version:1,type:'mind-map',title:panel.title,content:tree.join('\n'),
  ...(artifact.asOf?{asOf:artifact.asOf}:{}),source:{title:document.name,text:artifact.content}});
 if(!outline)return panel;
 return {...panel,type:'mind-map',artifact:completeWordOutline(outline,documents)};
}

const orgScope=/(?:组织|监管|机构).{0,24}(?:关系|架构|结构|层级)/u;
const chapterTitle=/^[一二三四五六七八九十]+(?:[、.．]\s*|[\s　]+)([^。；\n]{2,60})$/u;
const shortOrganization=title=>title.replace(/^中国(?:证券投资)?/u,'');

function organizationChapters(document,request){
 const chapters=[];
 for(const block of document.blocks){
  const heading=chapterTitle.exec(block.text??'')?.[1];
  if(heading){chapters.push({heading,id:block.id,blocks:[]});continue;}
  chapters.at(-1)?.blocks.push(block);
 }
 return chapters.filter(({heading})=>[heading,shortOrganization(heading)].some(name=>name.length>=3&&request.includes(name)));
}

function chapterOrganizationTree(chapter,groups){
 const node=(label,block)=>({label:label.replace(/\s+/gu,' ').trim()+` [${block}]`,children:[]});
 const root=node(chapter.heading,chapter.id),cards=new Map();
 for(const [i,block] of chapter.blocks.entries()){
  const matched=groups.filter(group=>group.block===block.id);
  if(matched.length){
   for(const group of matched){
    const branch=node(`${group.label}（${group.count}个）`,block.id);
    branch.children=group.members.map(member=>node(member,block.id));
    root.children.push(branch);
   }
   continue;
  }
  const row=block.rows?.length===1&&block.rows[0];
  if(row&&row.length>1&&row.every(cell=>cell.includes('\n'))){
   const relation=chapter.blocks[i-1]?.text?.match(/^([^，、。\n]{2,30})选举/u);
   const parent=cards.get(relation?.[1])??root;
   for(const cell of row){
    const [name,...details]=cell.split('\n'),card=node(name,block.id);
    card.children=details.filter(detail=>detail.trim()).map(detail=>node(detail,block.id));
    parent.children.push(card);
    cards.set(name.trim(),card);
   }
   continue;
  }
  const text=block.text??'';
  if(/^第[一二三四五六七八九十\d]+届[^。；\n]{2,40}(?:理事会|监事会)$/u.test(text)){
   const branch=node(text,block.id),detail=chapter.blocks[i+1];
   if(/^\d{4}年\d{1,2}月\d{1,2}日/u.test(detail?.text??''))branch.children.push(node(detail.text,detail.id));
   root.children.push(branch);
   continue;
  }
  if(officer.test(text)){
   root.children.push(...text.split(/\s*\|\s*/u).filter(Boolean).map(role=>node(role,block.id)));
   continue;
  }
  const units=/^((?:直属|派出)[^。；：:\n]{2,45})[：:]([^。；\n]+)\.?。?$/u.exec(text);
  if(units){
   const branch=node(units[1],block.id);
   branch.children=units[2].split('、').map(name=>node(name,block.id));
   root.children.push(branch);
  }else if(/筹建/u.test(text)&&uncertainty.test(text)){
   root.children.push(node(text,block.id));
  }
 }
 return root;
}

// A generated lookup that consists only of source block identifiers loses the
// surrounding institutional relationships. Recover those relationships from
// the explicitly requested chapters and the actual adjoining Word blocks.
export function completeWordOrganizationPanels(panels,documents,request=''){
 const sources=documents.filter(isWordDocument);
 if(sources.length!==1||sources[0].truncated||!orgScope.test(request))return panels;
 const [document]=sources,chapters=organizationChapters(document,request);
 if(chapters.length<2||chapters.length>5)return panels;
 const groups=documentOutlineGroups(document);
 const index=panels.findIndex(panel=>{
  const artifact=panel.artifact;
  if(panel.type!=='mind-map'||!orgScope.test(panel.title))return false;
  if(!artifact)return true;
  if(artifact.type!=='mind-map')return false;
  const outline=derivedOutline(artifact.content);
  if(!outline)return false;
  const cited=JSON.stringify(artifact.source).includes(document.name)&&/\[(?:P|T)\d+\]/u.test(artifact.source?.text??'');
  const onlyIdentifiers=outline.children.every(child=>blockId.test(child.label.trim()));
  return !cited||onlyIdentifiers;
 });
 if(index<0)return panels;
 const title=chapters.map(({heading})=>shortOrganization(heading)).join('与')+'组织关系';
 if(title.length>80||panels.some((panel,i)=>i!==index&&panel.title===title))return panels;
 const lines=['# '+title];
 const visit=(node,depth)=>{
  lines.push('  '.repeat(depth)+'- '+node.label);
  node.children.forEach(child=>visit(child,depth+1));
 };
 const trees=chapters.map(chapter=>chapterOrganizationTree(chapter,groups));
 if(trees.some(tree=>tree.children.length<2))return panels;
 trees.forEach(tree=>visit(tree,0));
 const original=panels[index].artifact??{version:1,type:'mind-map'};
 const text=chapters.flatMap(chapter=>[chapter.heading+' ['+chapter.id+']',...chapter.blocks.map(block=>
  `[${block.id}] ${block.text??JSON.stringify(block.rows)}`)]).join('\n');
 const artifact=parseDerivedSpec({...original,title,content:lines.join('\n'),source:{title:document.name,text}});
 return artifact?panels.map((panel,i)=>i===index?{...panel,title,artifact}:panel):panels;
}

function completeWordScopes(plan,documents){
 const request=plan.originalRequest??'';
 if(!Array.isArray(plan.panels))return plan;
 const pendingIds=new Set(/待核|未确认|待确认|待复核/u.test(request)?plan.panels.flatMap(panel=>
  panel?.type==='view'&&/待核|待确认|待复核/u.test(panel.title)?[panel.view?.dataset]:[]):[]);
 const sharedDatasets=plan.sharedDatasets.map(draft=>{
  const grid=draft?.documentGrid;
  if(!grid||!Array.isArray(grid.blocks)||!pendingIds.has(draft.id))return draft;
  const doc=documents.find(document=>isWordDocument(document)&&document.name===grid.document);
  const additions=doc?.blocks.filter(block=>block.id.startsWith('P')&&uncertainty.test(block.text??'')&&!grid.blocks.some(entry=>entry?.block===block.id))??[];
  return additions.length&&grid.blocks.length+additions.length<=24?{...draft,documentGrid:{...grid,blocks:[...grid.blocks,
   ...additions.map(block=>({block:block.id,layout:'paragraph'}))]}}:draft;
 });
 const prepared={...plan,sharedDatasets};
 if(!/人员不漏|完整(?:保留|展示|列出)?[^。；\n]{0,8}(?:人员|负责人|名单)|全部(?:人员|负责人)/u.test(request)||
    plan.panels.length>=30||sharedDatasets.length>=16)return prepared;
 const index=plan.panels.findIndex(panel=>panel?.type==='view'&&/负责人|人员|理事|监事/u.test(panel.title)&&
  sharedDatasets.some(dataset=>dataset?.documentGrid&&dataset.id===panel.view?.dataset));
 if(index<0)return prepared;
 const roster=sharedDatasets.find(dataset=>dataset.id===plan.panels[index].view.dataset).documentGrid;
 const doc=documents.find(document=>isWordDocument(document)&&document.name===roster.document);
 const personnelViews=new Set(plan.panels.filter(panel=>panel?.type==='view'&&/负责人|人员|理事|监事|任职/u.test(panel.title)).map(panel=>panel.view?.dataset));
 const covered=new Set(sharedDatasets.filter(dataset=>dataset?.documentGrid?.document===roster.document&&personnelViews.has(dataset.id)).flatMap(dataset=>
  Array.isArray(dataset.documentGrid.blocks)?dataset.documentGrid.blocks.map(block=>block?.block):[]));
 const additions=doc?.blocks.filter(block=>block.id.startsWith('P')&&officer.test(block.text??'')&&!covered.has(block.id))??[];
 if(!additions.length||additions.length>24)return prepared;
 const tabIndex=Array.isArray(plan.tabs)?plan.tabs.findIndex(tab=>tab?.panelIndexes?.includes(index)):-1;
 if(Array.isArray(plan.tabs)&&tabIndex<0)return prepared;
 let id='word-officer-paragraphs',suffix=2;
 while(sharedDatasets.some(dataset=>dataset?.id===id))id=`word-officer-paragraphs-${suffix++}`;
 const title=plan.panels.some(panel=>panel?.title==='负责人原文补充')?'领导人员原文':'负责人原文补充';
 return {...prepared,sharedDatasets:[...sharedDatasets,{id,label:title,documentGrid:{document:roster.document,
  blocks:additions.map(block=>({block:block.id,layout:'paragraph'}))}}],panels:[...plan.panels,{title,type:'view',prompt:'保留附件原文中的领导职务、姓名及出处，支持搜索。',
  view:{dataset:id,sections:[{kind:'records',fields:['text','citation']}]}}],...(tabIndex>=0?{tabs:plan.tabs.map((tab,i)=>
   i===tabIndex?{...tab,panelIndexes:[...tab.panelIndexes,plan.panels.length]}:tab)}:{})};
}

function projectBlock(document,selection){
 if(!exact(selection,['block','layout'],['skipHeader','columns'])||!blockId.test(selection.block)||!layouts.includes(selection.layout))
  fail('请声明本轮附件中的实际 P/T 编号及段落、名单或表格单元布局。');
 const original=document.blocks.find(block=>block.id===selection.block);
 const location=`${document.name} [${selection.block}]`;
 const record=(key,name,text,group,citation=location)=>({id:`word-${selection.block[0].toLowerCase()}_${selection.block.slice(1)}_${key}`,name,text,group,citation});
 if(selection.layout==='cells'){
  if(!Array.isArray(original?.rows)||selection.skipHeader!==undefined&&typeof selection.skipHeader!=='boolean')
   fail(`附件 [${selection.block}] 没有可读取的表格单元。`);
  const columns=selection.columns;
  if(columns!==undefined&&(!Array.isArray(columns)||!columns.length||columns.length>24||new Set(columns).size!==columns.length||
      !columns.every(column=>Number.isInteger(column)&&column>0&&original.rows.every(row=>column<=row.length))))
   fail(`附件 [${selection.block}] 的列选择必须对应实际列。`);
  const first=(original.rows[0]??[]).filter(cell=>cell.trim());
  const header=original.headerRows?.includes(0)||first.length>1&&first.every(cell=>
   /^(?:序号|编号|姓名|性别|职务|职位|状态|部门|机构|日期|(?:部门|机构|委员会|人员|项目|产品)?名称|name|role|date|no\.?)$/iu.test(cell.trim()));
  const rows=[];
  for(let i=selection.skipHeader&&header?1:0;i<original.rows.length;i++){
   for(const [index,text] of original.rows[i].entries()){
    const j=index+1;
    if(!text?.trim()||columns&&!columns.includes(j))continue;
    rows.push(record(`${i+1}-${j}`,text.trim().split(/\r?\n/u,1)[0],text,selection.block,`${location} 第${i+1}行第${j}列`));
   }
  }
  if(!rows.length)fail(`附件 [${selection.block}] 的选择没有原始记录。`);
  return rows;
 }
 if(typeof original?.text!=='string'||!original.text.trim()||selection.skipHeader!==undefined||selection.columns!==undefined)
  fail(`附件 [${selection.block}] 必须引用实际段落；列选择仅用于表格。`);
 if(selection.layout==='paragraph')return [record('1',original.text.trim().split(/[。\r\n]/u,1)[0],original.text,selection.block)];
 const lines=original.text.trim().split(/\r?\n/u);
 const names=lines[1]?.replace(/[。；;]\s*$/u,'').split('、').map(name=>name.trim());
 if(lines.length!==2||!names?.length||names.length<2||new Set(names).size!==names.length||
    !names.every(name=>/^\p{L}[\p{L}\p{M}·・.'’ -]{1,50}$/u.test(name)))
  fail(`附件 [${selection.block}] 没有明确的标题和顿号分隔名单，请保留完整段落。`);
 return names.map((name,index)=>record(String(index+1),name,lines[0],lines[0]));
}

function mergeWordCellSelections(blocks,document){
 const byBlock=new Map();
 for(const entry of blocks)byBlock.set(entry?.block,[...(byBlock.get(entry?.block)??[]),entry]);
 return [...byBlock.values()].flatMap(entries=>{
  const [first]=entries;
  if(entries.length===1||!entries.every(entry=>exact(entry,['block','layout','columns'],['skipHeader'])&&
     entry.layout==='cells'&&(entry.skipHeader??false)===(first.skipHeader??false)&&Array.isArray(entry.columns)&&
     entry.columns.length&&entry.columns.every(column=>Number.isInteger(column)&&column>0)))return entries;
  const rows=document.blocks.find(block=>block.id===first.block)?.rows;
  const width=rows?.[0]?.length;
  if(!width||!rows.every(row=>row.length===width))return entries;
  const columns=new Set(entries.flatMap(entry=>entry.columns));
  // Repeated whole-table declarations may include a guessed spacer column.
  // The full source already covers every actual column in that case.
  if(Array.from({length:width},(_,i)=>i+1).every(column=>columns.has(column))){
   const {columns:unused,...whole}=first;
   return [whole];
  }
  if([...columns].some(column=>column>width))return entries;
  return [{...first,columns:[...columns]}];
 });
}

export function resolveWordDocumentGrids(plan,documents){
 if(!Array.isArray(plan.sharedDatasets))return plan;
 plan=completeWordScopes(plan,documents);
 const grids=new Map();
 const sharedDatasets=plan.sharedDatasets.map(draft=>{
  if(draft?.documentGrid===undefined)return draft;
  const {id,label,documentGrid}=draft;
  if(!exact(draft,['id','label','documentGrid'],['asOf','note'])||!exact(documentGrid,['document','blocks'])||!Array.isArray(documentGrid.blocks)||
     !documentGrid.blocks.length||documentGrid.blocks.length>24)
   fail('只声明本轮附件和不重复的实际段落/表格，省略自行改写的 records、fields 或来源。');
  const matches=documents.filter(document=>isWordDocument(document)&&document.name===documentGrid.document);
  if(matches.length!==1)fail('只能唯一引用本轮附件中的 Word 原文件。');
  const [document]=matches;
  const selections=mergeWordCellSelections(documentGrid.blocks,document);
  if(new Set(selections.map(block=>block?.block)).size!==selections.length)
   fail('同一原文编号的重复选列须使用一致表头和实际列。');
  const rawRecords=selections.flatMap(selection=>projectBlock(document,selection));
  const dashExplanation=document.blocks.flatMap(block=>[...(block.text??'').matchAll(
   /[“「]?—[”」]?\s*表示(未掌握可确认的负责人信息[^。\n]*)/gu)].map(match=>({id:block.id,text:match[1]})))[0];
  const records=rawRecords.map(row=>{
   if(!dashExplanation||!/(?:\s|^)—\s*$/u.test(row.text))return row;
   return {...row,status:dashExplanation.text,
    citation:`${row.citation}；状态说明 [${dashExplanation.id}]`};
  });
  const hasStatus=records.some(row=>row.status);
  const date=document.blocks.flatMap(block=>[...(block.text??'').matchAll(/核查日期\s*[:：]?\s*(\d{4})[年-](\d{1,2})[月-](\d{1,2})日?/gu)])
   .map(([,year,month,day])=>`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`);
  const asOf=new Set(date).size===1?`${date[0]}（原文核查日期）`:'附件原文，资料时点按各条出处';
  const note=`${document.name} ${selections.map(selection=>`[${selection.block}]`).join('、')}`;
  grids.set(id,hasStatus);
  return {id,label,asOf,note,fields:[field('id','原文记录编号'),field('name','名称'),field('group','原文分组'),
   field('text','原文与状态'),...(hasStatus?[field('status','负责人核查状态')]:[]),field('citation','出处')],
   records:hasStatus?records.map(row=>({status:null,...row})):records};
 });
 const panels=Array.isArray(plan.panels)?plan.panels.map(panel=>{
  const view=panel?.view;
  if(panel?.type!=='view'||!grids.has(view?.dataset))return panel;
  const sections=grids.get(view.dataset)&&Array.isArray(view.sections)?view.sections.map(section=>
   section?.kind==='records'&&section.fields?.includes('text')&&!section.fields.includes('status')&&section.fields.length<12
    ?{...section,fields:[...section.fields,'status']}:section):view.sections;
  if(!Array.isArray(view.groupBy)||view.filters!==undefined&&!Array.isArray(view.filters)||
     view.groupBy.some(key=>!['id','name','group','text','citation'].includes(key)))return {...panel,view:{...view,sections}};
  const {groupBy,...scope}=view;
  const filters=[...new Set([...(scope.filters??[]),...groupBy])];
  return {...panel,view:filters.length>4?{...view,sections}:{...scope,sections,filters}};
 }):plan.panels;
 return {...plan,sharedDatasets,panels};
}
