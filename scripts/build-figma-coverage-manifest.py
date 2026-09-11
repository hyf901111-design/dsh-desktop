import json,re,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1]; O=R/'output/figma-full-acceptance'; I=json.loads((R/'docs/superpowers/plans/2026-09-11-figma-full-client-fidelity.design-index.json').read_text())
entries={
'home':['打开客户端首页','切换指定浅色或深色主题','通过右上角入口将右侧面板置为本稿的展开或收起状态'],
'01':['打开工作区中的普通对话','打开右侧 Files 文件面板','展开包含文件及目录的项目并检查文件列表'],
'02':['打开普通对话的 Files 面板','点击真实 Markdown 文档','在右侧阅读文档并切换回 Files'],
'03':['打开普通对话并选择真实电子表格','点击右侧页签加号','检查新建标签菜单并逐项打开已有类型'],
'04':['打开研究会话并保留共享对话','生成含指标与趋势的真实研究组件','核对画布和右侧对话布局'],
'05':['打开含组件的研究会话','选中组件并将其引用插入输入内容','核对工具栏及原生行内标签'],
'06':['打开普通对话与右侧文件面板','点击左侧收起入口','核对图标栏与内容重排'],
'07':['打开含组件和共享对话的研究会话','收起左侧栏','核对画布可用区域和底部输入'],
'08':['在普通对话执行有多个步骤的真实任务','打开轨迹页签','查看执行时间轴、步骤详情与真实任务状态'],
'09':['打开账户菜单并进入设置','选择通用设置','逐项切换现有通用控件并检查保存及重开状态'],
'10':['打开设置并选择模型','检查当前模型、供应商与配置字段','通过现有模型配置入口验证编辑和取消'],
'11':['使用测试账户登录','打开设置并选择账户信息','核对账户字段、用量及现有账户操作'],
'12':['打开设置并选择关于','核对产品信息和版本号','点击检查更新并验证反馈入口'],
'13':['打开普通对话','点击底部面板入口并打开终端','检查终端输入、关闭及面板尺寸'],
'14':['展开左侧导航至280px','拖动导航分隔边界至240px','检查相邻工作区重排和拖动结束持久化'],
'15':['打开宽340px的右侧浮层','拖动浮层左边界至400px','检查输入、页签和正文重新排布'],
'16':['在研究画布创建真实组件','拖动组件右下角改变宽高','检查正文按语义重排且手动尺寸保存'],
'17':['连续打开足以使右侧页签溢出的真实文件','打开溢出下拉列表','选择首尾页签并关闭当前页签'],
'18':['退出测试账户并打开登录页','在居中表单填写测试凭证','验证输入焦点、密码可见性、提交及失败反馈'],
'19':['在登录页进入注册','输入邀请码、账户及两次密码','验证必填、确认密码和现有注册提交行为'],
'20':['打开研究输入并输入普通文字','通过文件和组件引用入口插入行内标签','发送短消息与多标签消息并检查正文保持可读'],
'21':['在输入文字流中插入多个文件与组件标签','选中标签、显示完整名称提示并删除一个标签','发送短消息及多行多标签消息，检查靠右气泡与内部左对齐'],
'22':['将研究看板设为专用看板','展开左侧研究常驻列表','选择专用看板并检查与工作区层级区分'],
'23':['打开已有协作看板','选择分组目录并观察真实成员在线状态','检查共享对话和协作组件写回'],
'24':['展开研究列表并打开视图选项','分别操作搜索、排序、行悬停、右键和同组拖动','对专用与协作看板分别核对菜单及常用按钮状态'],
'25':['以所有者打开专用看板','通过共享协作入口打开创建表单','填写协作者、选择权限并验证取消与创建'],
'26':['以所有者打开正在协作的看板','点击顶栏管理','搜索成员、检查权限、变更角色与取消协作入口'],
'27':['打开协作看板的管理设置','编辑看板名称并检查副本及共享信息','保存或取消并检查已删除设置项没有恢复'],
'28':['通过真实或明确标注的受控更新服务产生可用版本','展开左侧栏','在账户上方查看版本提醒并点击现有更新入口'],
'29':['以所有者打开协作看板','点击顶栏灰色圆形加号','在添加协作者表单搜索成员、设置权限并提交或取消'],
'30':['打开超过3名成员的协作看板','点击顶栏+N头像聚合','搜索成员、滚动完整列表并检查在线状态与自身头像一致'],
'31':['通过真实或明确标注的受控协作/更新服务产生当前通知状态','展开左侧栏并打开邀请或消息列表','执行该提醒的加入、查看、关闭或重试动作并观察真实状态'],
'32':['打开包含指定更新状态的测试实例','按发现版本、下载、校验、自动继续的真实状态机推进','验证失败重试、保存状态与自动重启告知，不触发正式发布'],
'33':['在测试更新服务发现新版本后点击更新','观察左侧账户上方真实下载进度','验证完成或失败反馈与主更新状态一致'],
'34':['打开设置→关于','点击检查更新','观察请求未完成时的圆环Loading与禁用状态'],
'35':['打开设置→关于','由测试更新服务返回可用新版本','核对新版本信息与更新操作'],
'36':['在关于页已发现新版本后点击更新','由测试服务逐段下载测试包','核对真实进度与下载状态'],
'37':['在关于页启动更新并完成测试文件下载','让真实校验流程进入校验状态','验证自动重启告知和圆环Loading，完整安装仅在隔离测试实例执行'],
'38':['在研究画布提交真实组件生成任务','观察生成中组件与任务步骤同步','验证停止入口、当前步骤和加载骨架'],
'39':['在隔离研究任务分别产生生成中、成功、失败与用户停止','展开过程记录','执行停止、重新生成或查看来源并检查真实状态转换'],
'40':['生成指标、趋势、热力图、表格与结论类型组件','按默认S/M/L及内容密度显示','检查数字层级、图例、列对齐与数据边界'],
'41':['选中真实研究组件','分别打开思维导图详细程度菜单、总结提炼和基于所选创建','执行各操作并检查过程、结果、来源及新组件位置'],
'42':['将含内容的组件置为未选中默认态','移入鼠标检查悬停浮层','点击选中再点击画布取消，核对三种外框与工具栏状态'],
'43':['生成可展示指标、列表和图表的组件','手动调整为本节点标注的宽高','检查信息层级重排、无内部滚动及放大阅读完整内容'],
'44':['点击新建研究','保持新研究无组件无历史消息','检查空白点阵画布、右侧标题及底部输入框'],
'45':['创建大小规格混合且顺序已知的5个真实组件','点击整理画布','核对大卡主位、中卡双格、小卡填洞、同规格原序及整体适配'],
'46':['按不同内容密度提交生成需求','分别生成S320×220、M656×220、L656×456','验证溢出时升级规格、超过L摘要或拆分与完整阅读'],
'47':['在隔离字体服务使字体请求失败','点击组件内字体重试','恢复真实字体响应并核对失败→加载→正常及实际字体'],
'48':['向画布添加真实文件及网页','悬停闭合入口后点击放大阅读','滚动原始阅读内容并关闭，检查闭合态没有内部溢出'],
'variant':['在研究输入中插入原生文件引用标签','切换输入、选中或已发送状态','检查主题、移除操作和标签参与文字流换行']}

def files(g):
 a=['src/preload/figma-final-shell.css','scripts/lib/patch-figma-final-shell.mjs']
 if g=='home':a+=['src/preload/figma-home.css']
 elif g in ['09','10','11','12']:a+=['src/preload/figma-settings.css','scripts/lib/figma-settings-client.mjs']
 elif g in ['18','19']:a+=['src/preload/figma-auth.css','src/preload/account-ui.ts']
 elif g in ['20','21','variant']:a+=['scripts/lib/patch-research-board-client.mjs','src/preload/research-context.ts']
 elif g in ['22','23','24','25','26','27','29','30']:a+=['src/preload/research-board-navigation.ts','src/preload/research-board-dialogs.ts','src/preload/research-boards-ui.ts']
 elif g in ['28','31','32','33','34','35','36','37']:a+=['src/preload/sidebar-update-control.ts','src/preload/research-board-notifications-ui.ts','src/preload/update-view.ts']
 elif g in ['04','05','07','16','38','39','40','41','42','43','44','45','46','47']:a+=['scripts/lib/figma-canvas-client.mjs','scripts/lib/patch-research-board-client.mjs']
 elif g=='48':a+=['scripts/lib/figma-file-preview-client.mjs','src/preload/research-web-reader.ts']
 else:a+=['scripts/lib/patch-sherlock-better-sidebar.mjs','src/preload/figma-panels.css']
 return a

def nodes(n,parents=(),visible=True):
 v=visible and n.get('visible',True)
 yield n,parents,v
 for c in n.get('children',[]):yield from nodes(c,parents+(n,),v)

def candidates(f,t):
 alln=list(nodes(t));apps=[n for n,p,v in alln if len(p)==1 and v and n['type']=='FRAME' and n.get('width')==1380 and n.get('height')==900]
 if apps:
  r=[(apps[0],'app-state')]
  for n,p,v in alln:
   if not p or n['id']==apps[0]['id'] or not v or n['type']!='FRAME' or n.get('width',0)<90 or n.get('height',0)<45:continue
   if (re.search('菜单|对话框|成员列表|创建协作|管理协作|画板设置|添加协作|新建面板|溢出列表|弹层|输入浮层|登录.*浮窗|注册.*浮窗',n['name']) or (n['name'].startswith('协作成员 ·') and '展开' in n['name']) or n['name'].endswith('协作占用提示')) and not n['name'].startswith(('左侧菜单 ·','整理前 · 对比缩略图')):r.append((n,'nested-state'))
   elif f['group']=='38' and n['name'].startswith(('组件生成中 ·','任务管理 · 与生成卡片同步')):r.append((n,'nested-state'))
   elif f['group']=='45' and n['name'].startswith('整理结果 · 便当盒'):r.append((n,'nested-state'))
  for n,p,v in alln:
   if v and n['type']=='FRAME' and f['group']=='45' and n['name'].startswith('整理完成 · 短暂提示'):r.append((n,'nested-state'))
  return r
 g=f['group'];r=[]
 for n,p,v in alln:
  if not p or not v or n['type'] not in ['FRAME','GROUP','COMPONENT','INSTANCE']:continue
  name=n['name'];depth=len(p);yes=False
  if g=='21':yes=bool(re.search('输入中 ·|选中标签 ·|完整名称提示|短消息 ·|多标签消息',name))
  elif g=='24':yes=depth==2 and name!='入口迁移说明'
  elif g in ['31','32']:yes=name.startswith('侧栏底部提醒 /') or (g=='31' and name in ['已拒绝','已撤销','已过期'])
  elif g in ['39','40']:yes=depth==1 and not name.startswith('中性背景遮罩')
  elif g=='41':yes=bool(re.search('详细程度菜单|总结提炼 · 已触发|输入浮层|原位附近的新组件|保留出处的结果|新组件开始生成',name))
  elif g=='42':yes=name.startswith('组件外框 /') or (name.startswith('组件悬浮功能栏') and any(a['name']=='选中' for a in p))
  elif g=='43':yes=name.startswith('组件适配 /')
  elif g=='46':yes=name.startswith('组件外框 / 默认生成')
  elif g=='47':yes=name.startswith('S 组件 ·')
  elif g=='48':yes=name.startswith(('文件入口 S','网页摘要 M','完整阅读器 ·'))
  if yes:r.append((n,'component-state'))
 if not r:raise Exception('No product state candidates '+f['nodeId'])
 return r

existing={}; exportmeta={}
p=O/'figma/priority-app-exports.json'
if p.exists():
 for d in json.loads(p.read_text()):existing[d['id']]=('output/figma-full-acceptance/figma/'+Path(d['file']).name if Path(d['file']).is_absolute() else d['file']);exportmeta[d['id']]=d
metadata_path=O/'figma/reference-exports.json'
if metadata_path.exists():
 for d in json.loads(metadata_path.read_text()):existing[d['id']]=d['file'];exportmeta[d['id']]=d
allcases=[];queue=[];annotations=[];inventory=[]
for f in I['frames']+[dict(v,nodeId=v['id'],group='variant',theme='dark' if 'Dark' in v['name'] else 'light') for v in I['variants']]:
 snapfile='output/figma-full-acceptance/figma/nodes/'+f['nodeId'].replace(':','-')+'.json';snap=R/snapfile;raw=json.loads(snap.read_text());t=raw['tree'];ns=list(nodes(t));selected=[(t,'variant')] if f['group']=='variant' else candidates(f,t)
 inventory.append({'frameId':f['nodeId'],'group':f['group'],'name':f['name'],'nodeCount':raw['count'],'visibleNodeCount':sum(v for n,p,v in ns),'readErrors':[{'id':n['id'],'errors':n.get('readErrors')} for n,p,v in ns if n.get('readErrors')],'productStateIds':[n['id'] for n,r in selected]})
 selectedids={n['id'] for n,r in selected}
 for n,p,v in ns:
  if n['type']=='TEXT' and n.get('characters'):
   outside=not any(a['id'] in selectedids for a in (n,)+p)
   if outside or re.search('规则|说明|边界|提示',n['name']):annotations.append({'nodeId':n['id'],'frameId':f['nodeId'],'name':n['name'],'characters':n['characters'],'visible':v,'role':'presentation-annotation' if outside else 'ui-copy-or-local-guidance','nameDiffersFromText':n['name']!=n['characters']})
 for n,role in selected:
  caseid='figma-'+f['nodeId'].replace(':','-')+'--'+n['id'].replace(':','-');g=f['group'];ev=[{'packageCommit':None,'appPath':None,'captureKind':'figma-node-attributes','viewport':{'width':t['width'],'height':t['height']},'deviceScaleFactor':1,'file':snapfile,'sha256':hashlib.sha256(snap.read_bytes()).hexdigest(),'nodeId':n['id']}]
  ref=existing.get(n['id']);status='indexed'
  if ref and (R/ref).exists():ev.append({'packageCommit':None,'appPath':None,'captureKind':'figma-node-export','viewport':{'width':exportmeta.get(n['id'],{}).get('pixelSize',[n['width'],n['height']])[0],'height':exportmeta.get(n['id'],{}).get('pixelSize',[n['width'],n['height']])[1]},'applicationRegion':exportmeta.get(n['id'],{}).get('applicationRegion'),'exportBoundary':exportmeta.get(n['id'],{}).get('exportBoundary','absolute-node-bounds'),'deviceScaleFactor':1,'file':ref,'sha256':hashlib.sha256((R/ref).read_bytes()).hexdigest(),'nodeId':n['id']});status='measured'
  else:queue.append({'id':n['id'],'frameId':f['nodeId'],'name':n['name'],'width':n['width'],'height':n['height'],'file':'output/figma-full-acceptance/figma/references/'+g+'-'+f['theme']+'-'+n['id'].replace(':','-')+'.png'})
  allcases.append({'caseId':caseid,'frameId':f['nodeId'],'subnodeId':n['id'],'role':role,'theme':f['theme'],'page':g+' '+f['name'],'name':n['name'],'preconditions':['使用可溯源的本地测试包，禁止正式发布','窗口基准1380×900，deviceScaleFactor单独记录','主题为'+f['theme']+'；业务数据由真实服务或透明标记的隔离状态服务提供'],'steps':entries[g]+['复现“'+n['name']+'”并记录实际交互、字体与截图'],'expected':['按当前节点及祖先链精确比对尺寸、材料、文字与状态','仅产品节点进入客户端；外层背景、说明与状态标题不进入产品','该状态的操作必须绑定既有真实业务逻辑，不以静态图替代'],'implementationFiles':files(g),'status':status,'designEvidence':ev,'runtimeEvidence':[],'differences':[{'status':'open','category':'runtime-unverified','description':'尚无当前包此独立状态的真实截图、交互、实际字体及视觉对照证据。'}],'relationships':{'frameContainsState':f['nodeId'],'parentId':n.get('parentId'),'annotationNodeIds':[a['nodeId'] for a in annotations if a['frameId']==f['nodeId']]},'geometry':{k:n.get(k) for k in ['x','y','width','height','absoluteBoundingBox','absoluteRenderBounds']}})
substatefile='output/figma-full-acceptance/figma/reviewed-substates.json'
substates={'schemaVersion':1,'fileKey':I['fileKey'],'frames':[{'frameId':i['frameId'],'productStateIds':i['productStateIds']} for i in inventory]}
(R/substatefile).write_text(json.dumps(substates,ensure_ascii=False,indent=2))
substatehash=hashlib.sha256((R/substatefile).read_bytes()).hexdigest()
assets={e['file']:e['sha256'] for c in allcases for e in c['designEvidence']}
assets[substatefile]=substatehash
fingerprint=hashlib.sha256(json.dumps(sorted(assets.items()),ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
partial=[{'frames':[x['nodeId'] for x in I['frames'] if x['group'] in ['04','05','07','16']],'scope':'旧研究导航与协作入口；保留旧图中未冲突的正文、文件及交互局部','replacesBy':['284:397','284:764','286:515','286:1174'],'authority':'用户明确以22–30组最终导航与协作状态为准'}, {'frames':[x['nodeId'] for x in I['frames'] if x['group'] in ['04','05','07','16','38','39','40','41','42','43','45']],'scope':'默认生成规格与整理规则；43手动宽高不是默认规格，内容语义层级仍适用','replacesBy':['379:644','379:759'],'authority':'用户明确S320×220/M656×220/L656×456、间距16、边距32；废弃32间距及行内居中'}, {'frames':['375:588','375:814'],'scope':'陈旧图层名不得覆盖当前characters说明正文','replacesBy':['375:811'],'authority':'当前Figma text.characters已为16间距、32外边距；name仍残留旧规则'}]
for c in allcases:
 c['propertyAuthority']=[{k:v for k,v in rule.items() if k!='frames'} for rule in partial if c['frameId'] in rule['frames']]
 if c['propertyAuthority']:c['expected'][0]='先应用propertyAuthority列出的局部替代；精确比对其余尺寸、材料、文字与状态，保留原节点证据。'
manifest={'schemaVersion':1,'fileKey':I['fileKey'],'capturedDate':'2026-09-11','scope':'100画板+6变体以及逐板可见独立产品状态；统计不是客户端验收','sourceIndex':'docs/superpowers/plans/2026-09-11-figma-full-client-fidelity.design-index.json','sourceIndexSha256':hashlib.sha256((R/'docs/superpowers/plans/2026-09-11-figma-full-client-fidelity.design-index.json').read_bytes()).hexdigest(),'designFingerprint':fingerprint,'substateIndex':{'file':substatefile,'sha256':substatehash},'designAssets':[{'file':p,'sha256':h} for p,h in sorted(assets.items())],'inventory':inventory,'annotations':annotations,'partialReplacements':partial,'additionalCombinationRequirements':['浅深色×侧栏展开/收起×首页/对话/研究/设置转换','权限所有者/可编辑/只读×专用/协作菜单与成员操作','长标题/多页签首尾/多标签消息/狭小视区与面板拖宽','生成中/完成/失败/停止×默认/悬停/选中×S/M/L及手动宽高','真实字体失败/加载/恢复×原生卡/HTML双层iframe/完整阅读器','设置打开期间后台任务完成；右侧面板不得覆盖设置','当前包冷启动、持久化后重开与组件放大阅读关闭恢复','设置内通用下拉、模型提供方配置及账户改密展开：焦点、取消、保存、重开与原业务状态保持；无独立开放态画板，不以设置整页截图代验' ],'cases':allcases}
(O/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));(O/'figma/export-queue.json').write_text(json.dumps(queue,ensure_ascii=False,indent=2));print(json.dumps({'cases':len(allcases),'frames':len(I['frames']),'variants':len(I['variants']),'nodes':sum(i['nodeCount'] for i in inventory),'referencesPending':len(queue),'annotations':len(annotations),'readErrors':sum(len(i['readErrors']) for i in inventory)},ensure_ascii=False))
