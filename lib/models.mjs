import fs from 'node:fs';
import path from 'node:path';
export function isFreeModel(m){
  if(!m||typeof m.id!=='string'||!m.architecture?.output_modalities?.includes('text'))return false;
  const p=m.pricing;if(!p||!['prompt','completion'].every(k=>typeof p[k]!=='boolean'&&String(p[k]??'').trim()!==''&&Number(p[k])===0))return false;
  return Object.values(p).every(v=>v===null||v===undefined||typeof v!=='boolean'&&String(v).trim()!==''&&Number(v)===0)&&!/guard|safety|moderation|lyria/i.test(m.id);
}
export function readJSON(raw){if(typeof raw!=='string')throw Error('Empty model response');let s=raw.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');return JSON.parse(s);}
export function createModelPool({cachePath,key,fetcher=fetch,clock=Date.now,onChange=()=>{}}){
  let state={catalog:[],models:[],checkedAt:null,checking:false,message:'',quota:null},catalogAt=0,checkPromise=null,blockedUntil=0;
  try{const saved=JSON.parse(fs.readFileSync(cachePath,'utf8'));state={...state,...saved,checking:false};}catch{}
  const save=()=>{if(cachePath){fs.mkdirSync(path.dirname(cachePath),{recursive:true});fs.writeFileSync(cachePath,JSON.stringify({...state,checking:false},null,2));}onChange();};
  const update=(id,patch)=>{let m=state.models.find(x=>x.id===id);if(!m){m={id,status:'untested',successes:0,failures:0,latencyMs:null,score:0,cooldownUntil:0};state.models.push(m);}Object.assign(m,patch);return m;};
  async function catalog(){if(state.catalog.length&&clock()-catalogAt<300000)return state.catalog;const r=await fetcher('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('The model catalogue could not be reached.');const x=await r.json();state.catalog=(x.data||[]).filter(isFreeModel).map(m=>({id:m.id,name:m.name||m.id,context:m.context_length||0,parameters:m.supported_parameters||[],pricing:m.pricing}));catalogAt=clock();for(const m of state.catalog)update(m.id,{});state.models=state.models.filter(m=>state.catalog.some(c=>c.id===m.id));return state.catalog;}
  async function call(model,messages,maxTokens=3200){
    if(!key())throw Error('Add an OpenRouter key in Connections.');
    const started=clock();const r=await fetcher('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key(),'HTTP-Referer':'http://localhost:4317','X-Title':'Avenfold'},body:JSON.stringify({model:model.id,messages,temperature:0,max_tokens:maxTokens,provider:{max_price:{prompt:0,completion:0},allow_fallbacks:true},...(model.parameters.includes('response_format')?{response_format:{type:'json_object'}}:{}),...(model.parameters.includes('reasoning')?{reasoning:{enabled:false,exclude:true}}:{})}),signal:AbortSignal.timeout(35000)});
    if(!r.ok){const e=Error(r.status===401?'The key was not accepted. Update it in Connections.':r.status===429?'This model is at its request limit.':`The model returned status ${r.status}.`);e.status=r.status;if(r.status===401)blockedUntil=clock()+60000;throw e;}
    const data=await r.json();if(data.error)throw Error('The provider did not complete this request.');
    if(!state.catalog.some(m=>m.id===data.model)||Number(data.usage?.cost||0)>0)throw Error('The response did not confirm a free model.');
    return {raw:data.choices?.[0]?.message?.content,model:data.model,latencyMs:clock()-started};
  }
  async function check({force=false,limit=6}={}){
    if(checkPromise)return checkPromise;
    if(!force&&state.checkedAt&&clock()-Date.parse(state.checkedAt)<21600000)return publicState();
    checkPromise=(async()=>{state.checking=true;state.message='Checking available models';onChange();try{
      await catalog();if(!key()){state.message='Add your key to enable document interpretation.';return;}
      const prior=new Map(state.models.map(m=>[m.id,m.score]));const candidates=[...state.catalog].sort((a,b)=>(prior.get(b.id)||0)-(prior.get(a.id)||0)||b.context-a.context).slice(0,Math.min(12,limit));
      for(const m of candidates){if(clock()<blockedUntil)break;update(m.id,{status:'checking'});onChange();try{
        const v=await call(m,[{role:'system',content:'Return only valid JSON. Extract the supplied fields without adding information.'},{role:'user',content:'Supplier: Avenfold Test\nTotal: 37.50\nCurrency: EUR\nReturn {"supplier":string,"total":number,"currency":string}.'}],180);
        const j=readJSON(v.raw),correct=j.supplier==='Avenfold Test'&&Number(j.total)===37.5&&j.currency==='EUR';if(!correct)throw Error('The extraction check did not match.');const old=state.models.find(x=>x.id===m.id);update(m.id,{status:'ready',latencyMs:v.latencyMs,score:Math.max(1,100-Math.round(v.latencyMs/10)/100),testedAt:new Date(clock()).toISOString(),successes:old.successes+1,cooldownUntil:0,error:''});
      }catch(e){const old=state.models.find(x=>x.id===m.id);update(m.id,{status:'unavailable',testedAt:new Date(clock()).toISOString(),score:0,failures:old.failures+1,error:e.message,cooldownUntil:clock()+(e.status===429?300000:60000)});}onChange();}
      state.checkedAt=new Date(clock()).toISOString();state.message=state.models.some(m=>m.status==='ready')?'Model checks complete.':'No model passed. File tools and rules remain available.';
    }catch(e){state.message=e.message;}finally{state.checking=false;try{save();}catch{} }return publicState();})();try{return await checkPromise;}finally{checkPromise=null;}
  }
  async function generate(messages,validate,{maxTokens=3200}={}){
    if(clock()<blockedUntil)throw Error('Update the connection key or try again shortly.');await catalog();
    const ranked=[...state.models].filter(m=>m.cooldownUntil<=clock()&&m.status!=='checking').sort((a,b)=>(b.status==='ready')-(a.status==='ready')||b.score-a.score);let attempts=[];
    for(const r of ranked.slice(0,5)){const m=state.catalog.find(x=>x.id===r.id);try{const v=await call(m,messages,Math.min(12000,Math.max(1000,maxTokens))),value=validate(readJSON(v.raw));update(m.id,{status:'ready',successes:r.successes+1,latencyMs:v.latencyMs,score:Math.max(1,100-Math.round(v.latencyMs/10)/100),error:'',cooldownUntil:0});save();return {...v,value,attempts};}catch(e){attempts.push({model:m.id,message:e.message});update(m.id,{status:'unavailable',failures:r.failures+1,cooldownUntil:clock()+120000,error:e.message,score:0});if(e.status===401)break;}}
    save();const e=Error('Document interpretation is unavailable. Rules were used where possible.');e.attempts=attempts;throw e;
  }
  function publicState(){return {configured:!!key(),checking:state.checking,checkedAt:state.checkedAt,message:state.message,freeOnly:true,models:[...state.models].sort((a,b)=>b.score-a.score).map(({id,status,latencyMs,score,testedAt,error,successes,failures})=>({id,status,latencyMs,score,testedAt,error,successes,failures})),selected:state.models.filter(m=>m.status==='ready'&&m.cooldownUntil<=clock()).sort((a,b)=>b.score-a.score)[0]?.id||null};}
  return {check,generate,status:publicState,catalog};
}
