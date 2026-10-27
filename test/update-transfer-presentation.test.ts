import{expect,it}from'vitest'
import{initialUpdateStatus,reduceUpdateStatus}from'../src/main/update/update-state'
import{updateMessage,updateTransferMessage}from'../src/preload/update-view'
import{normalizeUpdateNotification}from'../src/preload/update-notification-store'
const progress={type:'progress' as const,percent:50,transferredBytes:41_000_000,totalBytes:82_000_000,bytesPerSecond:1_000_000,downloadKind:'differential' as const,archiveBytes:545_000_000,reusedBytes:463_000_000,resumedBytes:10_000_000}
it('preserves planned network, reused and resumed byte counts from the updater without substituting archive size',()=>{
 const state=reduceUpdateStatus({...initialUpdateStatus('1.3.4'),availableVersion:'1.4.1'},progress)
 expect(state).toMatchObject({totalBytes:82_000_000,archiveBytes:545_000_000,reusedBytes:463_000_000,resumedBytes:10_000_000,downloadKind:'differential'})
 expect(normalizeUpdateNotification(state)).toMatchObject({totalBytes:82_000_000,archiveBytes:545_000_000,reusedBytes:463_000_000,resumedBytes:10_000_000,downloadKind:'differential'})
 expect(updateTransferMessage(state,'zh')).toContain('差分');expect(updateTransferMessage(state,'zh')).toContain('41 / 82 MB');expect(updateTransferMessage(state,'zh')).toContain('463 MB');expect(updateTransferMessage(state,'zh')).toContain('10 MB')
 expect(updateMessage(state,'en')).toContain('41 / 82 MB');expect(updateTransferMessage(state,'en')).toContain('Differential');expect(updateTransferMessage(state,'en')).toContain('resumed')
})
it('clearly distinguishes a necessary full download without a reusable old archive from differential network size',()=>{
 const state=reduceUpdateStatus({...initialUpdateStatus('1.3.4'),availableVersion:'1.4.1'},{...progress,downloadKind:'full',fallbackReason:'no-cache',totalBytes:545_000_000,reusedBytes:0,resumedBytes:0})
 expect(updateTransferMessage(state,'zh')).toContain('完整');expect(updateTransferMessage(state,'zh')).toContain('/ 545 MB');expect(updateTransferMessage(state,'zh')).toContain('缓存')
 expect(updateTransferMessage(state,'en')).toContain('Full');expect(updateTransferMessage(state,'en')).toContain('cache')
})
