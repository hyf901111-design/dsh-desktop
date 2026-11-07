// Synthetic identity HTTP service for topology tests, never a production IdP.
import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const file=process.argv[2],port=Number(process.argv[3]??19080)
const server=createServer((req,res)=>{
  const respond=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body))}
  if(req.url!=='/v1/account/me'||req.method!=='GET'){respond(404,{error:'NOT_FOUND'});return}
  const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  const db=JSON.parse(readFileSync(file,'utf8'))
  const hash=token?createHash('sha256').update(token).digest('hex'):''
  const session=db.sessions.find(s=>s.hash===hash&&!s.revoked&&s.expiresAt>Date.now())
  if(!session){respond(401,{error:'LOGIN_REQUIRED'});return}
  respond(200,{user:{id:session.userId,username:'synthetic-'+session.userId}})
})
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({stage:'fixture-identity-ready',port})))
const stop=()=>{server.closeAllConnections();server.close(()=>process.exit(0))}
process.on('SIGINT',stop);process.on('SIGTERM',stop)
