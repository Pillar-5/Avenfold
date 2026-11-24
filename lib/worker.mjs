import {digitize,correctOCR,refreshDigitize} from './digitize.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {extractRules,exceptions,extractionMessages,validateExtract,ruleReport,reportMessages,validateReport,sourceRows} from './engine.mjs';
import {generateOutputs} from './outputs.mjs';
import {quoteRules,quotationMessages,validateQuotes,compareQuotes,compareDocuments,documentAnalysisMessages,validateChangeAnalysis} from './comparison.mjs';
export function createWorker({store,modelPool,root,schedule=fn=>fn()}){
 let working=false,stopping=false;
 const getRaw=id=>{const f=store.get('files',id);if(!f)throw Error('Source file is unavailable.');return fs.readFile(path.join(root,'files',id));};
 async function output(job,files){const folder=path.join(root,'outputs',job.id,'r'+job.revision);job.outputs=await generateOutputs(job,files,{outputDir:folder,getRaw,getTemplate:getRaw,root});}
 async function process(job){
  const files=job.fileIds.map(id=>store.get('files',id));if(files.some(f=>!f||(job.type!=='digitize'&&!f.text)))throw Error('A source file has not finished reading.');
  const step=(progress,message)=>{job.progress=progress;job.message=message;store.put('runs',job);store.event(job.id,'progress',{progress,message});};
  job.status='running';job.startedAt=new Date().toISOString();job.revision=job.revision||1;step(10,'Reading source documents');
  const warnings=files.flatMap(f=>(f.warnings||[]).map(t=>f.name+': '+t));let method='Rules',model=null,attempts=[];
  if(job.type==='digitize'){job.result=await digitize({job,files,root,step});for(const f of files)if(!f.text){f.text=job.result.pages.filter(p=>p.fileId===f.id).map(p=>p.text).join('\n');f.parser='Local OCR';store.put('files',f);}}else if(job.type==='workbook'){
   let records=extractRules(files,job.options);step(30,'Preparing records');
   if(job.options.mode==='auto'&&modelPool.status().configured){
    if(sourceRows(files).reduce((n,r)=>n+r.text.length,0)>65000)warnings.push('This batch exceeds the interpretation limit. Rules were used without truncating the source files.');
    else try{step(42,'Interpreting source information');const result=await modelPool.generate(extractionMessages(files,job.options),raw=>validateExtract(raw,files,job.options));records=result.value;method='AI';model=result.model;attempts=result.attempts;}catch(e){warnings.push(e.message);attempts=e.attempts||[];}
   }else if(job.options.mode==='auto')warnings.push('No AI connection is configured. Rules were used.');
   job.result={records,issues:exceptions(records,job.options),warnings,method,model,attempts};
  }else if(job.type==='delivery'){
   let report=ruleReport(files,job.options);step(30,'Preparing the brief');
   if(job.options.mode==='auto'&&modelPool.status().configured){
    if(sourceRows(files).reduce((n,r)=>n+r.text.length,0)>65000)warnings.push('This batch exceeds the interpretation limit. Source passages were used without model analysis.');
    else try{step(42,'Drafting the document');const result=await modelPool.generate(reportMessages(files,job.options),raw=>validateReport(raw,files));report=result.value;method='AI';model=result.model;attempts=result.attempts;}catch(e){warnings.push(e.message);attempts=e.attempts||[];}
   }else if(job.options.mode==='auto')warnings.push('No AI connection is configured. Source passages were used.');
   job.result={...report,warnings,method,model,attempts};
  }else if(job.type==='compare'){
   const length=sourceRows(files).reduce((n,r)=>n+r.text.length,0);step(30,'Comparing source documents');
   if(job.options.comparison==='quotes'){
    let quotes=quoteRules(files,job.options);
    if(job.options.mode==='auto'&&modelPool.status().configured&&length<=65000){try{step(42,'Reading quotation items and terms');const response=await modelPool.generate(quotationMessages(files,job.options),raw=>validateQuotes(raw,files,job.options),{maxTokens:Math.min(12000,files.length*2400)});quotes=response.value;method='AI extraction';model=response.model;attempts=response.attempts;}catch(e){warnings.push(e.message);attempts=e.attempts||[];}}
    else if(job.options.mode==='auto')warnings.push(length>65000?'These quotations exceed the interpretation limit. Rules were used.':'No AI connection is configured. Rules were used.');
    job.result={...compareQuotes(quotes),warnings,method,model,attempts};
   }else{
    const result=compareDocuments(files,job.options);method='Exact text';let analysis=[];
    if(job.options.mode==='auto'&&result.changes.length){if(modelPool.status().configured&&JSON.stringify(result.changes).length<=45000){try{step(42,'Explaining the document changes');const response=await modelPool.generate(documentAnalysisMessages(result),raw=>validateChangeAnalysis(raw,result));analysis=response.value;method='Exact text with AI notes';model=response.model;attempts=response.attempts;}catch(e){warnings.push(e.message);attempts=e.attempts||[];}}else warnings.push('AI notes were not generated. The exact text comparison is complete.');}
    job.result={...result,analysis,warnings,method,model,attempts};
   }
  }else job.result={warnings,method:'File tools',files:files.length};
  step(78,'Creating output files');await output(job,files);job.status='complete';job.completedAt=new Date().toISOString();step(100,'Output files are ready');store.event(job.id,'completed',{method:job.result.method,model:job.result.model||null,outputs:job.outputs.map(o=>o.name)});
 }
 async function drain(){if(working||stopping)return;working=true;try{let job;while(!stopping&&(job=store.list('runs').reverse().find(j=>j.status==='queued'))){try{await schedule(()=>process(job));}catch(e){job.status='failed';job.error=e.message;job.message='This run needs attention';store.put('runs',job);store.event(job.id,'failed',{message:e.message});}}}finally{working=false;}}
 async function revise(job,records){if(job.status!=='complete'||job.type!=='workbook')throw Error('Only completed workbooks can be corrected.');const files=job.fileIds.map(id=>store.get('files',id));const changes=[];records.forEach((r,i)=>job.options.fields.forEach(f=>{const before=job.result.records[i].cells[f.name]?.value,after=r.cells[f.name]?.value;if(before!==after)changes.push({row:i+1,field:f.name,before,after});}));if(!changes.length)return job;job.result.records=records;job.result.issues=exceptions(records,job.options);job.revision++;store.event(job.id,'corrections',{revision:job.revision,changes});await output(job,files);store.put('runs',job);return job;}
 for(const r of store.list('runs').filter(r=>r.status==='running')){r.status='queued';r.message='Resuming after restart';store.put('runs',r);}
 async function match(job,leftItemId,rightItemId){if(job.status!=='complete'||job.type!=='compare'||job.result?.comparison!=='quotes')throw Error('Choose a completed quotation comparison.');const members=job.result.quotes.flatMap(q=>q.items.map(item=>({...item,fileId:q.fileId}))),left=members.find(i=>i.id===leftItemId),right=members.find(i=>i.id===rightItemId);if(!left||!right||left.fileId===right.fileId)throw Error('Select items from different quotations.');const matches=job.result.matches||[];if(matches.some(m=>[m.leftItemId,m.rightItemId].includes(leftItemId)&&[m.leftItemId,m.rightItemId].includes(rightItemId)))throw Error('These items are already matched.');const decision={leftItemId,rightItemId,at:new Date().toISOString(),basis:'Specifications confirmed by user'};const result=compareQuotes(job.result.quotes,[...matches,decision]);job.result={...job.result,...result};job.revision++;await output(job,job.fileIds.map(id=>store.get('files',id)));store.put('runs',job);store.event(job.id,'item match',{revision:job.revision,left:left.cells.Description.value,right:right.cells.Description.value,leftFileId:left.fileId,rightFileId:right.fileId,leftItemId,rightItemId,basis:decision.basis});return job;}
 async function unmatch(job,index){if(job.status!=='complete'||job.type!=='compare'||job.result?.comparison!=='quotes'||!Number.isInteger(index)||!job.result.matches?.[index])throw Error('Choose a recorded item match.');const removed=job.result.matches[index],matches=job.result.matches.filter((_,i)=>i!==index);job.result={...job.result,...compareQuotes(job.result.quotes,matches)};job.revision++;await output(job,job.fileIds.map(id=>store.get('files',id)));store.put('runs',job);store.event(job.id,'item match removed',{revision:job.revision,removed});return job;}
 async function reviewOCR(job,corrections){if(job.type!=='digitize'||job.status!=='complete')throw Error('Choose a completed digitisation run.');const reviewed=correctOCR(job.result,corrections);if(!reviewed.changes.length)return job;const next={...job,result:refreshDigitize(reviewed.result,job.options),revision:job.revision+1};await output(next,next.fileIds.map(id=>store.get('files',id)));store.put('runs',next);store.event(next.id,'OCR corrections',{revision:next.revision,changes:reviewed.changes});return next;}
 return {drain,revise,match,unmatch,reviewOCR,getRaw,stop:()=>{stopping=true;}};
}
