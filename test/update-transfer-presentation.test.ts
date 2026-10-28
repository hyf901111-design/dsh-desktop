import{expect,it}from'vitest'
import{initialUpdateStatus,reduceUpdateStatus}from'../src/main/update/update-state'
import{updateMessage,updateTransferMessage}from'../src/preload/update-view'
import{normalizeUpdateNotification}from'../src/preload/update-notification-store'
const progress={type:'progress' as const,percent:50,transferredBytes:41_000_000,totalBytes:82_000_000,bytesPerSecond:1_000_000,downloadKind:'differential' as const,archiveBytes:545_000_000,reusedBytes:463_000_000,resumedBytes:10_000_000}
it('preserves planned network, reused and resumed byte counts from the updater without substituting archive size',()=>{
 const state=reduceUpdateStatus({...initialUpdateStatus('1.3.4'),availableVersion:'1.4.1'},progress)
 expect(state).toMatchObject({totalBytes:82_000_000,archiveBytes:545_000_000,reusedBytes:463_000_000,resumedBytes:10_000_000,downloadKind:'differential'})
 expect(normalizeUpdateNotification(state)).toMatchObject({totalBytes:82_000_000,archiveBytes:545_000_000,reusedBytes:463_000_000,resumedBytes:10_000_000,downloadKind:'differential'})
 expect(updateTransferMessage(state,'zh')).toBe('41 / 82 MB · 1 MB/s')
 expect(updateTransferMessage(state,'en')).toBe('41 / 82 MB · 1 MB/s')
 expect(updateMessage(state,'zh')).toBe('正在下载更新 50% · 41 / 82 MB · 1 MB/s')
 expect(updateMessage(state,'en')).toBe('Downloading update 50% · 41 / 82 MB · 1 MB/s')
})
it('shows the actual full transfer size and speed without exposing cache implementation details',()=>{
 const state=reduceUpdateStatus({...initialUpdateStatus('1.3.4'),availableVersion:'1.4.1'},{...progress,downloadKind:'full',fallbackReason:'no-cache',totalBytes:545_000_000,reusedBytes:0,resumedBytes:0})
 expect(updateTransferMessage(state,'zh')).toBe('41 / 545 MB · 1 MB/s')
 expect(updateTransferMessage(state,'en')).toBe('41 / 545 MB · 1 MB/s')
})
