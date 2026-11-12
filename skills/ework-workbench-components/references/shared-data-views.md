# 共用记录与组合视图 v1

工具 `research_workbench_create` 提交 `dataMode:"simulated"`，不要设置parallel或preset。`sharedDatasets:[{id,label,asOf,note,fields:[{key,label,unit?}],records:[{id,...每个声明字段}]}]`。每条记录必须有唯一稳定id，直接用业务编号；id的显示字段省略时宿主补标签，不推断编号。每条记录完整填写全部声明字段，缺失填null，零、负数、false保留原值；标量和字符串数组可用。每组最多200条、24字段、48KB；总5组/192KB。所有跨卡共同事实只确定一次，各卡不再重写数据。

各panel保持title/prompt/size，可选layout:standard|wide，type:"view"，添加view：

```json
{"dataset":"items","filters":["owner","stage"],"details":["description","handover"],"navigation":"tabs","layout":"stack","reorder":false,"sections":[{"kind":"records","title":"档案","fields":["id","owner","stage"]},{"kind":"compare","title":"两项比较","fields":["description","handover"]}]}
```

sections最多4个。records/compare必须有fields。schedule配置 `{"kind":"schedule","label":"id","start":"start","end":"end","owner":"owner","resource":"resource"}`；owner/resource可省略，其他为实际字段引用。日内时间使用含Z/偏移的ISO；可用YYYY-MM-DD。未知时间null保留待排期，结束早于开始会拒绝；同资源真实重叠会显示警告，不自动改时间。资源冲突只依据提供的resource字段。reorder:true需要records区域，只改本卡优先级，不改起止时间或其他卡。

宿主独立安排标题、筛选、正文、点选详情和来源备注区域。flow连续展开，tabs分区切换；split宽框并排详情，窄框上下排列。选择与筛选状态保存并恢复。首次不要填panel.artifact；宿主从共用数据解析后生成；重新提交同一requestId保留全部原值与配置。其他超出能力的面板可同时用deferred原路径，但不能声称独立生成的业务记录也受同一快照一致性保证。

完整panels清单与sharedDatasets必须同次提交，先列面板与view，再写共同数据。不要先单独提交数据集；宿主不会猜面板。相同对象的负责人、作业时间、等待原因、验收等共同事实放在同一主数据集，不在不同数据集独立重写。只有确实一对多的独立事件才另建记录集，关联信息不能相互矛盾。reorder提供上移/下移按钮，不是拖拽排序；不要重复造会过时的priority数字列。

## 创建前的一致性检查

HTML 原型的内嵌表用 `sharedDatasets[].prototypeTable` 引用。其他受支持的附件表用 `sharedDatasets[].sourceTable` 引用。通过 `type:"view"` 和 `sections:[{kind:"records",fields:[…]}]` 声明明细列。客户端分页渲染，搜索和筛选覆盖完整记录。

同一批对象使用一个完整主记录集，由各卡引用。每份共同数据必须有实际消费方；没有视图引用且没有后续生成组件消费的数据会在创建前报错。跨数据集确为同一批对象时，给各数据集显式设置相同 recordScope（如 book）。同一范围内相同记录 id 的同名字段代表同一事实，值和单位必须完全一致（null 不会由另一份数据静默补齐）。省略时编号只在本数据集内唯一；员工001与设备001不会合并身份，不重写用户编号。真正独立的一对多事件使用独立事件范围，并用业务字段记录归属。不要复制主记录后为排程或验收另填矛盾事实。宿主列表始终显示稳定编号，优先级变化不改变编号。旧保存文档仍可读取，这些校验只拦截新创建；旧请求原样重试先复用原结果。

字段键支持中英文名称，引用使用原键，不必为技术格式翻译业务字段。完整共同记录可与 sharedContext 同时直接提交，宿主将共同场景备注原文保留在每张直接生成卡片中，无需改为 deferred。view 即使在 deferred 中也必须有完整共同记录和 view 配置，不能用于无内容占位。用户明确时间范围后不得自动延长；容量不足如实保留未排期与等待原因。
