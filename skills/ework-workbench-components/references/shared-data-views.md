# 共用记录与组合视图 v1

工具 `research_workbench_create` 提交 `dataMode:"simulated"`，不要设置parallel或preset。`sharedDatasets:[{id,label,asOf,note,fields:[{key,label,unit?}],records:[{id,...每个声明字段}]}]`。字段必须声明id，记录ID唯一；每条记录完整填写全部声明字段，缺失填null，零、负数、false保留原值；标量和字符串数组可用。每组最多200条、24字段、48KB；总5组/192KB。所有跨卡共同事实只确定一次，各卡不再重写数据。

各panel保持title/prompt/size，可选layout:standard|wide，type:"view"，添加view：

```json
{"dataset":"items","filters":["owner","stage"],"details":["description","handover"],"navigation":"tabs","layout":"stack","reorder":false,"sections":[{"kind":"records","title":"档案","fields":["id","owner","stage"]},{"kind":"compare","title":"两项比较","fields":["description","handover"]}]}
```

sections最多4个。records/compare必须有fields。schedule配置 `{"kind":"schedule","label":"id","start":"start","end":"end","owner":"owner","resource":"resource"}`；owner/resource可省略，其他为实际字段引用。日内时间使用含Z/偏移的ISO；可用YYYY-MM-DD。未知时间null保留待排期，结束早于开始会拒绝；同资源真实重叠会显示警告，不自动改时间。资源冲突只依据提供的resource字段。reorder:true需要records区域，只改本卡优先级，不改起止时间或其他卡。

宿主独立安排标题、筛选、正文、点选详情和来源备注区域。flow连续展开，tabs分区切换；split宽框并排详情，窄框上下排列。选择与筛选状态保存并恢复。首次不要填panel.artifact；宿主从共用数据解析后生成；重新提交同一requestId保留全部原值与配置。其他超出能力的面板可同时用deferred原路径，但不能声称独立生成的业务记录也受同一快照一致性保证。
