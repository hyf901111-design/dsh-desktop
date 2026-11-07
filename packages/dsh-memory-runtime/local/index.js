import {DatabaseSync} from 'node:sqlite'
import * as sqliteVec from 'sqlite-vec'
import {createHash} from 'node:crypto'
import {MODEL_ID} from './manifest.js'
const hash=value=>createHash('sha256').update(value).digest('hex')
const segmenter=new Intl.Segmenter('zh-CN',{granularity:'word'})
const stop=new Set(['的','了','吗','呢','和','与','是','在','我','你','我们','这个','那个'])
function tokens(text){
  const normalized=text.normalize('NFKC').toLowerCase(),result=new Set([...segmenter.segment(normalized)].filter(x=>x.isWordLike&&!stop.has(x.segment)).map(x=>x.segment))
  for(const run of normalized.match(/[\p{Script=Han}]+/gu)??[])for(let i=0;i<run.length-1;i++)result.add(run.slice(i,i+2))
  return [...result].slice(0,256)
}
function buffer(vector){return Buffer.from(vector.buffer,vector.byteOffset,vector.byteLength)}
function decoded(value){
  if(typeof value!=='string')return
  const bytes=Buffer.from(value,'base64');if(bytes.length!==384*4)return
  const v=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))
  if(!v.every(Number.isFinite)||Math.abs(Math.hypot(...v)-1)>.01)return
  return v
}
export class LocalSemanticIndex{
  constructor(){
    this.db=new DatabaseSync(':memory:',{allowExtension:true});sqliteVec.load(this.db);this.db.enableLoadExtension(false)
    this.db.exec(`PRAGMA temp_store=MEMORY;
      CREATE TABLE records(id TEXT PRIMARY KEY,revision INTEGER,scope TEXT,project TEXT,status TEXT,expires REAL,embedding BLOB);
      CREATE VIRTUAL TABLE lexical USING fts5(id UNINDEXED,title,content,tokenize='unicode61');`)
  }
  async index(rows,cache,embed){
    const items={},indexed=[]
    for(const row of rows){
      const signature=hash(JSON.stringify([row.id,row.revision,row.title,row.content]))
      const cached=cache?.model===MODEL_ID&&cache.items?.[row.id]?.signature===signature?decoded(cache.items[row.id].vector):undefined
      const vector=cached??await embed(row.title+'\n'+row.content,'passage')
      items[row.id]={signature,vector:buffer(vector).toString('base64')};indexed.push({row,vector})
    }
    this.db.exec('BEGIN')
    try{
      this.db.exec('DELETE FROM records; DELETE FROM lexical')
      const record=this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)'),lexical=this.db.prepare('INSERT INTO lexical VALUES(?,?,?)')
      for(const {row,vector} of indexed){record.run(row.id,row.revision,row.scope,row.projectId??'',row.status,row.expiresAt??null,buffer(vector));lexical.run(row.id,tokens(row.title).join(' '),tokens(row.content).join(' '))}
      this.db.exec('COMMIT')
    }catch(error){this.db.exec('ROLLBACK');throw error}
    return {model:MODEL_ID,items}
  }
  search(query,vector,projectId,now){
    if(/^(?:你好|您好|嗨|hello|hi|谢谢|thanks)[！!。.\s]*$/iu.test(query.trim()))return []
    const where="(scope='global' OR (scope='project' AND project=?)) AND status='active' AND (expires IS NULL OR expires>?)",params=[projectId??'',now]
    const semantic=this.db.prepare(`WITH eligible AS MATERIALIZED (SELECT id,revision,embedding FROM records WHERE ${where})
      SELECT id,revision,vec_distance_cosine(embedding,?) AS distance FROM eligible ORDER BY distance,id LIMIT 15`).all(...params,buffer(vector))
    const phrase=tokens(query).slice(0,64).map(t=>'"'+t.replaceAll('"','""')+'"').join(' OR ')
    const lexical=!phrase?[]:this.db.prepare(`SELECT records.id,records.revision,bm25(lexical,0,2,1) AS distance FROM lexical JOIN records ON records.id=lexical.id WHERE lexical MATCH ? AND ${where} ORDER BY distance,records.id LIMIT 15`).all(phrase,...params)
    return [...new Map([...semantic,...lexical].map(row=>[row.id,{id:row.id,revision:row.revision}])).values()]
  }
  close(){this.db.close()}
}
