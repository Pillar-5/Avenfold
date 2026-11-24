import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createApp} from './server.mjs';
import {createModelPool} from './lib/models.mjs';

// One browser receives one private workspace. No local catalogue is published.
export async function createWeb({dataRoot=process.env.AVENFOLD_DATA||path.join(import.meta.dirname,'data','web'),publicOrigin=process.env.RENDER_EXTERNAL_URL||process.env.AVENFOLD_PUBLIC_URL||'',startChecks=true}={}){
 await fs.mkdir(dataRoot,{recursive:true});const sessions=new Map(),pending=new Map();let origin=publicOrigin,queue=Promise.resolve();
 const schedule=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
 const pool=createModelPool({cachePath:path.join(dataRoot,'model-checks.json'),key:()=>process.env.OPENROUTER_API_KEY});
 const reply=(res,status,error)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error}));};
 async function session(id){if(sessions.has(id))return sessions.get(id);if(pending.has(id))return pending.get(id);if(sessions.size+pending.size>=40)throw Error('The preview is busy. Please return shortly.');const loading=createApp({dataRoot:path.join(dataRoot,'sessions',id),startChecks:false,publicOrigin:origin,web:true,modelPool:pool,schedule}).then(app=>{const entry={app,lastSeen:Date.now(),requests:[]};sessions.set(id,entry);return entry;}).finally(()=>pending.delete(id));pending.set(id,loading);return loading;}
 const server=http.createServer(async(req,res)=>{try{
  res.setHeader('Cache-Control','no-store');const route=new URL(req.url,'http://localhost').pathname;
  if(route==='/api/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,name:'Avenfold',mode:'web'}));return;}
  if(req.headers.host!==new URL(origin).host){reply(res,403,'Use the application address.');return;}
  if(req.headers.origin&&req.headers.origin!==origin){reply(res,403,'This request is not from Avenfold.');return;}
  let id=req.headers.cookie?.match(/(?:^|;\s*)avenfold_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!id){id=crypto.randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`avenfold_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${origin.startsWith('https:')?'; Secure':''}`);}
  const entry=await session(id);entry.lastSeen=Date.now();
  if(!['GET','HEAD'].includes(req.method)){entry.requests=entry.requests.filter(t=>Date.now()-t<60000);if(entry.requests.length>=60){reply(res,429,'Please wait a minute before starting more work.');return;}entry.requests.push(Date.now());}
  entry.app.server.emit('request',req,res);
 }catch(error){reply(res,503,error.message);}});
 // Release idle database handles without removing stored files.
 const cleanup=setInterval(()=>{for(const [id,entry]of sessions)if(Date.now()-entry.lastSeen>1800000&&!entry.app.store.list('runs').some(r=>['running','queued'].includes(r.status))){sessions.delete(id);entry.app.close().catch(()=>{});}},60000);cleanup.unref();
 return {server,async listen(port=Number(process.env.PORT)||10000){await new Promise(r=>server.listen(port,'0.0.0.0',r));if(!origin)origin='http://127.0.0.1:'+server.address().port;if(startChecks)pool.check().catch(()=>{});console.log('Avenfold web is ready.');return origin;},async close(){clearInterval(cleanup);await queue;for(const entry of sessions.values())await entry.app.close();await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){const app=await createWeb();await app.listen();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));}
