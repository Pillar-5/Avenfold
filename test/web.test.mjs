import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWeb} from '../web.mjs';

test('public hosting isolates browser workspaces and protects managed connections',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'avenfold-web-')),web=await createWeb({dataRoot:root,startChecks:false}),url=await web.listen(0);
 try{
  const first=await fetch(url+'/api/bootstrap'),a=await first.json(),cookieA=first.headers.get('set-cookie').split(';')[0];
  const second=await fetch(url+'/api/bootstrap'),b=await second.json(),cookieB=second.headers.get('set-cookie').split(';')[0];
  assert.equal(a.deployment,'web');assert.notEqual(cookieA,cookieB);assert.notEqual(a.token,b.token);assert.equal(a.inbox,null);
  const upload=await fetch(url+'/api/files',{method:'POST',headers:{cookie:cookieA,'X-Avenfold-Token':a.token,'X-File-Name':'private.txt'},body:'Private workspace content'}),file=await upload.json();assert.ok(upload.ok,file.error);
  const own=await fetch(url+'/api/files/'+file.id+'/original',{headers:{cookie:cookieA}});assert.equal(await own.text(),'Private workspace content');
  const other=await fetch(url+'/api/files/'+file.id+'/original',{headers:{cookie:cookieB}});assert.notEqual(other.status,200);
  const blocked=await fetch(url+'/api/connection',{method:'POST',headers:{cookie:cookieA,'X-Avenfold-Token':a.token,'Content-Type':'application/json'},body:'{}'});assert.equal(blocked.status,403);
  const forged=await fetch(url+'/api/settings',{method:'POST',headers:{cookie:cookieB,'X-Avenfold-Token':a.token,'Content-Type':'application/json'},body:'{}'});assert.equal(forged.status,403);
  const settings=await fetch(url+'/api/settings',{method:'POST',headers:{cookie:cookieA,'X-Avenfold-Token':a.token,'Content-Type':'application/json'},body:JSON.stringify({organisation:'Example company',watchEnabled:true})});assert.equal((await settings.json()).watchEnabled,false);
  const resumed=await(await fetch(url+'/api/bootstrap',{headers:{cookie:cookieA}})).json();assert.equal(resumed.settings.organisation,'Example company');assert.equal((await(await fetch(url+'/api/bootstrap',{headers:{cookie:cookieB}})).json()).settings.organisation,'');
  const cross=await fetch(url+'/api/bootstrap',{headers:{origin:'https://unrelated.example'}});assert.equal(cross.status,403);
  const health=await(await fetch(url+'/api/health')).json();assert.equal(health.mode,'web');
 }finally{await web.close();await fs.rm(root,{recursive:true,force:true});}
});
