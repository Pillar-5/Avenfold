import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),exec=promisify(execFile);
const root=path.resolve(import.meta.dirname,'..');
const runtime=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
const python=process.env.AVENFOLD_PYTHON||(fss.existsSync(path.join(runtime,'python/python.exe'))?path.join(runtime,'python/python.exe'):'python');
const poppler=process.env.AVENFOLD_PDFTOPPM||path.join(runtime,'native/poppler/Library/bin/pdftoppm.exe');
async function ocr(file){const {createWorker}=await import('tesseract.js');const worker=await createWorker('eng+deu+fra',1,{langPath:path.join(root,'public/vendor/ocr-data'),logger:()=>{}});try{const {data}=await worker.recognize(file);return {text:data.text,confidence:data.confidence};}finally{await worker.terminate();}}
export async function parseServerFile(file){const ext=path.extname(file).toLowerCase();let text='',parser='',warnings=[],tables=[];
 if(ext==='.pdf'){const r=await exec(python,['-X','utf8',path.join(root,'lib/read_pdf.py'),file],{timeout:45000,maxBuffer:2000000,windowsHide:true});const result=JSON.parse(r.stdout);text=result.text;parser='PDF text';if(result.scanPages.length){if(result.scanPages.length>15)throw Error('Split scans into at most 15 pages.');const temp=await fs.mkdtemp(path.join(os.tmpdir(),'avenfold-ocr-'));try{for(const page of result.scanPages){const stem=path.join(temp,'page');await exec(poppler,['-f',String(page),'-l',String(page),'-r','140','-singlefile','-png',file,stem],{timeout:45000,windowsHide:true});const r=await ocr(stem+'.png');text+='\n'+r.text.split(/\r?\n/).filter(Boolean).map(x=>`Page ${page} [OCR] | ${x}`).join('\n');warnings.push(`Page ${page}: OCR confidence ${Math.round(r.confidence)}%. Check the original.`);await fs.unlink(stem+'.png');}parser='PDF and OCR';}finally{await fs.rmdir(temp).catch(()=>{});}}}
 else if(ext==='.docx'){const {extractRawText}=await import('mammoth');const r=await extractRawText({path:file});text=r.value;parser='Word text';warnings=['Pictures and tracked changes require checking against the original.'];}
 else if(['.xlsx','.xls','.xlsb','.ods','.csv','.tsv'].includes(ext)){const XLSX=require('xlsx'),wb=XLSX.readFile(file,{cellDates:true});let count=0;for(const name of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:true,range:0}).map(r=>r.map(v=>v instanceof Date?v.toISOString().slice(0,10):v));if(rows.length>1000||rows.some(r=>r.length>40))throw Error('Use worksheets with at most 1000 rows and 40 columns.');tables.push({name,rows});text+=rows.map((row,i)=>`${name} row ${i+1} | `+row.map((v,c)=>`${XLSX.utils.encode_col(c)}${i+1}: ${v}`).join(' | ')).join('\n')+'\n';count+=rows.length;}parser='Spreadsheet rows';}
 else if(['.png','.jpg','.jpeg','.webp','.bmp'].includes(ext)){const r=await ocr(file);text=r.text;parser='Image OCR';warnings=[`OCR confidence ${Math.round(r.confidence)}%. Check the original.`];}
 else if(ext==='.eml'){const {default:PostalMime}=await import('postal-mime');const r=await PostalMime.parse(await fs.readFile(file));text=`From: ${r.from?.address||''}\nSubject: ${r.subject||''}\n${r.text||''}`;parser='Email text';}
 else if(['.txt','.md','.json','.html','.htm'].includes(ext)){text=new TextDecoder('utf-8',{fatal:true}).decode(await fs.readFile(file));if(ext==='.json')text=JSON.stringify(JSON.parse(text),null,2);if(['.html','.htm'].includes(ext))text=text.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ');parser='Text';}
 else throw Error('For the local inbox, use PDF, Word, Excel, CSV, text, email or image files. Other formats can be uploaded in the workspace.');
 text=text.replace(/\0/g,'').trim();if(!text)throw Error('No readable text was found.');if(text.length>100000)throw Error('Split documents with more than 100,000 characters.');return {text,parser,warnings,tables};
}
