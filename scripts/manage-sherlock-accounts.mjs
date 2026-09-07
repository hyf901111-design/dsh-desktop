#!/usr/bin/env node
import { randomBytes, createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const [action, value, output] = process.argv.slice(2)
const quote = (s) => `'${s.replaceAll("'", "''")}'`
let sql
if (action === 'invite') {
  const uses = Number(value ?? 1)
  if (!Number.isInteger(uses) || uses < 1 || uses > 10000)
    throw Error('使用次数必须为 1–10000')
  const invite = randomBytes(24).toString('hex'),
    hash = createHash('sha256').update(invite).digest('hex')
  sql = `INSERT INTO invites(hash,expires_at,max_uses) VALUES(${quote(hash)},unixepoch()+604800,${uses});`
  if (!output)
    throw Error(
      '用法：node scripts/manage-sherlock-accounts.mjs invite <次数> <SQL输出路径>'
    )
  writeFileSync(output, sql + '\n', { mode: 0o600, flag: 'wx' })
  console.log(
    `邀请码：${invite}\n有效期：SQL 执行后 7 天。执行生成的 SQL 后生效。`
  )
} else if (
  ['disable-user', 'revoke-sessions', 'disable-invite'].includes(action)
) {
  if (!value || !output) throw Error('需要用户 ID / 邀请码，以及 SQL 输出路径')
  sql =
    action === 'disable-user'
      ? `UPDATE users SET disabled=1 WHERE id=${quote(value)}; DELETE FROM sessions WHERE user_id=${quote(value)};`
      : action === 'revoke-sessions'
        ? `DELETE FROM sessions WHERE user_id=${quote(value)};`
        : `UPDATE invites SET disabled=1 WHERE hash=${quote(createHash('sha256').update(value).digest('hex'))};`
  writeFileSync(output, sql + '\n', { mode: 0o600, flag: 'wx' })
  console.log('管理 SQL 已生成，尚未修改远端。')
} else
  throw Error('支持 invite、disable-user、revoke-sessions、disable-invite。')
