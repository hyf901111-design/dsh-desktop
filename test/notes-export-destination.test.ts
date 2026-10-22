import {expect,it} from 'vitest'
const module=await import('../src/main/notes/export-destination').catch(()=>null)
it('extracts exact full absolute paths, preserving spaces and punctuation inside quotes',()=>{
 expect(module,'host destination parser is missing').not.toBeNull()
 for(const [prompt,path] of [
  ['导出到 /tmp/report.pdf.bak。','/tmp/report.pdf.bak'],
  ['导出到/tmp/report.pdf','/tmp/report.pdf'],
  ['保存到 "/tmp/report final.pdf"。','/tmp/report final.pdf'],
  ['保存到 “/tmp/report,final.pdf”。','/tmp/report,final.pdf'],
  ["保存到 '/tmp/report (final).pdf'",'/tmp/report (final).pdf'],
  ['保存到 `/tmp/报告.pdf`；不要改名','/tmp/报告.pdf'],
  ['不要显示顶栏，然后导出到 /tmp/report.pdf','/tmp/report.pdf'],
  ['保存到 /tmp/report final.pdf','/tmp/report final.pdf'],
  ['保存到 /tmp/report,final.pdf','/tmp/report,final.pdf'],
 ] as [string,string][])expect(module!.explicitNoteExportPaths(prompt)).toEqual([path])
 for(const text of ['不要导出到 /tmp/report.pdf','示例里提到 /tmp/report.pdf','引用路径为 /tmp/report.pdf','请参考“导出到 /tmp/report.pdf”再导出 PDF','保存到 /tmp/a.pdf，或者保存到 /tmp/b.pdf'])expect(module!.explicitNoteExportPaths(text)).toEqual([])
 expect(module!.explicitNoteExportPaths('https://example.com/tmp/report.pdf 或 relative/tmp/report.pdf')).toEqual([])
 expect(module!.explicitNoteExportPaths('"/tmp/report final.pdf"')).not.toContain('/tmp/report')
})
it.each(['/tmp/报告，最终版.pdf','/tmp/报告。终稿.pdf','/tmp/报告.pdf，最终版.pdf'])('does not grant a truncated unquoted destination from %s',path=>{
 expect(module!.explicitNoteExportPaths('导出到 '+path)).toEqual([])
 expect(module!.explicitNoteExportPaths('导出到“'+path+'”')).toEqual([path])
})
it('treats unquoted punctuation followed by prose as ambiguous but allows a final sentence mark',()=>{
 expect(module!.explicitNoteExportPaths('导出到 /tmp/report.pdf，完成后告诉我')).toEqual([])
 expect(module!.explicitNoteExportPaths('导出到 /tmp/report.pdf。\n')).toEqual(['/tmp/report.pdf'])
 expect(module!.explicitNoteExportPaths('导出到 /tmp/report.pdf，“最终版”')).toEqual([])
})
