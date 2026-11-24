import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Document,Packer,Paragraph,TextRun} from 'docx';
import ExcelJS from 'exceljs';
import {CATEGORIES,extractLibraryFields} from './library-core.mjs';
import {safeCell} from './engine.mjs';

const exec=promisify(execFile),base=path.resolve(import.meta.dirname,'..');
const runtime=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const python=process.env.AVENFOLD_PYTHON||(fss.existsSync(path.join(runtime,'python/python.exe'))?path.join(runtime,'python/python.exe'):'python');
const poppler=process.env.AVENFOLD_PDFTOPPM||(process.platform==='win32'?path.join(runtime,'native/poppler/Library/bin/pdftoppm.exe'):'pdftoppm');
const font=process.env.AVENFOLD_OCR_FONT||(process.platform==='win32'?'C:/Windows/Fonts/segoeui.ttf':'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
export const DIGITIZE_FORMATS=['searchable','editable','template'];
export function validateDigitizeFiles(files){if(!files.length||files.length>10)throw Error('Use between 1 and 10 scans or PDFs.');if(files.some(f=>!f||! /\.(pdf|png|jpe?g|webp|bmp|tiff?)$/i.test(f.name)))throw Error('Digitisation accepts PDF, PNG, JPEG, WebP, BMP and TIFF files.');}
async function helper(command,spec,folder){const input=path.join(folder,command+'.json');await fs.writeFile(input,JSON.stringify(spec));try{const {stdout}=await exec(python,['-X','utf8',path.join(base,'lib/digitize_pages.py'),command,input],{timeout:180000,maxBuffer:4000000,windowsHide:true});return JSON.parse(stdout);}catch(e){throw Error((e.stderr||e.message).trim().slice(0,500));}finally{await fs.unlink(input).catch(()=>{});}}
export function pageText(page){const lines=new Map();for(const word of page.words){if(!lines.has(word.line))lines.set(word.line,[]);lines.get(word.line).push(word.text);}return [...lines.values()].map(words=>words.join(' ')).join('\n');}
export function refreshDigitize(result,options){for(const page of result.pages)page.text=pageText(page);result.wordCount=result.pages.reduce((n,p)=>n+p.words.length,0);result.reviewCount=result.pages.reduce((n,p)=>n+p.words.filter(w=>w.confidence<70&&!w.reviewed).length,0);if(options.format==='template'){const category=CATEGORIES.find(c=>c.id===options.category);result.template={id:category.id,name:category.name,fields:category.fields};const ids=[...new Set(result.pages.map(p=>p.fileId))];result.records=ids.map(id=>{const pages=result.pages.filter(p=>p.fileId===id),file={id,name:pages[0].sourceName,text:pages.map(p=>p.text).join('\n')};return {fileId:id,name:file.name,...extractLibraryFields(file,category)};});}return result;}
export async function digitize({job,files,root,step}){
 validateDigitizeFiles(files);const folder=path.join(root,'digitization',job.id);await fs.mkdir(folder,{recursive:true});
 const sources=files.map(f=>({id:f.id,name:f.name,path:path.join(root,'files',f.id)}));step(16,'Preparing original pages');
 const prepared=await helper('prepare',{folder,sources,poppler},folder);
 const {createWorker}=await import('tesseract.js');const worker=await createWorker(job.options.language,1,{langPath:path.join(base,'public/vendor/ocr-data'),cacheMethod:'none',logger:()=>{}});
 const pages=[],warnings=[];try{for(const [i,page]of prepared.entries()){step(20+Math.floor(i/prepared.length*50),`Reading page ${i+1} of ${prepared.length}`);const {data}=await worker.recognize(page.image,{}, {blocks:true,text:true});const words=[];let line=0;for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const row of paragraph.lines||[]){for(const word of row.words||[])if(word.text.trim())words.push({text:word.text,bbox:word.bbox,confidence:Math.round(word.confidence),line,reviewed:false});line++;}const {image,...publicPage}=page;pages.push({...publicPage,id:'P'+(i+1),confidence:Math.round(data.confidence||0),words});if(!words.length)warnings.push(`${page.sourceName}, page ${page.sourcePage}: no readable text found. The page image is retained.`);if(page.nativeText)warnings.push(`${page.sourceName}, page ${page.sourcePage}: the existing PDF text layer is retained. OCR corrections affect editable outputs only on this page.`);}
 }finally{await worker.terminate();}
 await fs.writeFile(path.join(folder,'pages.json'),JSON.stringify(prepared));
 return refreshDigitize({pages,warnings,method:'Local OCR',language:job.options.language,wordCount:0,reviewCount:0},job.options);
}
export function correctOCR(result,corrections){if(!Array.isArray(corrections)||corrections.length>2000)throw Error('Use at most 2,000 word corrections.');const copy=structuredClone(result),changes=[],seen=new Set();for(const c of corrections){const page=copy.pages.find(p=>p.id===c.pageId),word=page?.words[c.wordIndex],key=c.pageId+':'+c.wordIndex;if(!Number.isInteger(c.wordIndex)||!word||seen.has(key)||typeof c.text!=='string'||c.text.length>100||/[\x00-\x1f]/.test(c.text))throw Error('Choose valid OCR words and single line corrections.');seen.add(key);const after=c.text.trim();if(after!==word.text||!word.reviewed){changes.push({pageId:page.id,wordIndex:c.wordIndex,before:word.text,after});word.originalText??=word.text;word.text=after;word.reviewed=true;}}return {result:copy,changes};}
export async function digitizeFiles(job,{root,getRaw}){
 const folder=path.join(root,'digitization',job.id),prepared=JSON.parse(await fs.readFile(path.join(folder,'pages.json'),'utf8'));
 const pages=job.result.pages.map((p,i)=>({...p,image:prepared[i].image})),output=path.join(folder,'searchable.pdf');
 await helper('searchable',{pages,sources:Object.fromEntries(job.fileIds.map(id=>[id,path.join(root,'files',id)])),title:job.options.title,font,output},folder);
 const outputs=[{name:'Searchable document.pdf',bytes:await fs.readFile(output),type:'pdf'}, {name:'Recognised text.txt',bytes:Buffer.from(job.result.pages.map(p=>`${p.sourceName} | Page ${p.sourcePage}\n${p.text}`).join('\n\n')),type:'txt'}];
 if(job.options.format==='editable'){
  const sections=pages.map(p=>{const lines=new Map();for(const w of p.words){if(!lines.has(w.line))lines.set(w.line,[]);lines.get(w.line).push(w);}return {properties:{page:{size:{width:Math.round(p.width*20),height:Math.round(p.height*20)},margin:{top:360,bottom:360,left:360,right:360}}},children:[new Paragraph({text:`${p.sourceName} | Page ${p.sourcePage}`,spacing:{after:140},style:'Caption'}),...[...lines.values()].map(words=>{const box=words[0].bbox;return new Paragraph({indent:{left:Math.max(0,Math.min(8000,Math.round(box.x0/p.pixelWidth*p.width*20)-360))},spacing:{after:80},children:[new TextRun({text:words.map(w=>w.text).join(' '),font:'Calibri',size:22})]});})]};});
  outputs.push({name:'Editable document.docx',bytes:await Packer.toBuffer(new Document({creator:'Avenfold',title:job.options.title,description:'OCR reconstruction. Page breaks and approximate indentation retained. Check against the originals.',sections})),type:'docx'});
 }
 const wb=new ExcelJS.Workbook(),review=wb.addWorksheet('OCR review');review.addRow(['Page','Source','Source page','Word','Recognised text','OCR confidence','Review state','Original OCR','Left','Top','Right','Bottom']);for(const p of pages)for(const [i,w]of p.words.entries())review.addRow([p.id,p.sourceName,p.sourcePage,i+1,safeCell(w.text),w.confidence,w.reviewed?'Reviewed':w.confidence<70?'Check original':'Not reviewed',safeCell(w.originalText??w.text),w.bbox.x0,w.bbox.y0,w.bbox.x1,w.bbox.y1]);
 if(job.result.records){const sourceSheet=wb.addWorksheet('OCR transcript');sourceSheet.addRow(['Source','Reference','Recognised line']);for(const id of job.fileIds){const own=pages.filter(p=>p.fileId===id),text=own.map(p=>p.text).join('\n');text.split('\n').forEach((line,i)=>sourceSheet.addRow([own[0].sourceName,'D1:L'+(i+1),safeCell(line)]));}const fields=job.result.template.fields,records=wb.addWorksheet(job.result.template.name);records.addRow(['Source',...fields.map(f=>f.name)]);for(const r of job.result.records)records.addRow([r.name,...fields.map(f=>safeCell(r.fields[f.name]?.value??''))]);const evidence=wb.addWorksheet('Template sources');evidence.addRow(['Source','Field','Value','OCR line references']);for(const r of job.result.records)for(const f of fields)evidence.addRow([r.name,f.name,safeCell(r.fields[f.name]?.value??''),(r.fields[f.name]?.sourceIds||[]).join(', ')]);}
 for(const sheet of wb.worksheets){sheet.views=[{state:'frozen',ySplit:1}];sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF182B3C'}};sheet.columns.forEach((c,i)=>c.width=i===1||i===4?36:20);sheet.autoFilter={from:'A1',to:{row:Math.max(1,sheet.rowCount),column:sheet.columnCount}};}
 outputs.push({name:job.result.records?'Digitised records.xlsx':'OCR review.xlsx',bytes:Buffer.from(await wb.xlsx.writeBuffer()),type:'xlsx'});
 return outputs;
}
