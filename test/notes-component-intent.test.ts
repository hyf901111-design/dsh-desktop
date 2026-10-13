import {expect,it} from 'vitest'
import {noteComponentRequest} from '../src/shared/workspace-notes'
for(const prompt of ['只写正文，不创建组件。','不要生成图表，请撰写新内容。','无需创建表格','不需要帮我添加新闻组件'])it('keeps text writing when the request negates component creation: '+prompt,()=>expect(noteComponentRequest(prompt)).toBe(false))
for(const prompt of ['根据收入10、20、15生成折线图表','不要写解释，创建一个表格组件','帮我画一张时间线','做一个新闻组件'])it('reserves a component for affirmative creation: '+prompt,()=>expect(noteComponentRequest(prompt)).toBe(true))
