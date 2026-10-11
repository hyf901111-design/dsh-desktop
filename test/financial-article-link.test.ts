import {expect,it,vi} from 'vitest'
import {openFinancialArticle} from '../src/main/financial/article-link'

it('将新闻和公告的完整网页或PDF地址交给系统浏览器',async()=>{
 const open=vi.fn(async(_url:string)=>{})
 for(const url of ['https://finance.eastmoney.com/a/202610083889410028.html','https://example.org/report.pdf?download=1#page=3'])expect(await openFinancialArticle(url,open)).toEqual({ok:true})
 expect(open.mock.calls.map(([url])=>url)).toEqual(['https://finance.eastmoney.com/a/202610083889410028.html','https://example.org/report.pdf?download=1#page=3'])
})
it('拒绝非网页协议、凭据及无效参数，不调用系统浏览器',async()=>{
 const open=vi.fn(async(_url:string)=>{})
 for(const url of [null,{},'','javascript:alert(1)','file:///etc/passwd','ework://settings','https://user:password@example.org/','https://' ])await expect(openFinancialArticle(url,open)).rejects.toThrow('链接无效')
 expect(open).not.toHaveBeenCalled()
})
