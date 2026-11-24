import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),vendor=path.join(root,'public/vendor');
fs.mkdirSync(vendor,{recursive:true});
await build({stdin:{contents:"export * as XLSX from 'xlsx'; export * as mammoth from 'mammoth'; export {default as PostalMime} from 'postal-mime';",resolveDir:root},outfile:path.join(vendor,'tools.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
for(const [src,dst] of [['pdfjs-dist/build/pdf.min.mjs','pdf.mjs'],['pdfjs-dist/build/pdf.worker.min.mjs','pdf.worker.mjs'],['fflate/esm/browser.js','fflate.mjs'],['tesseract.js/dist/tesseract.esm.min.js','ocr.mjs'],['tesseract.js/dist/tesseract.min.js','tesseract.min.js'],['tesseract.js/dist/worker.min.js','ocr-worker.js']])fs.copyFileSync(path.join(root,'node_modules',src),path.join(vendor,dst));
fs.mkdirSync(path.join(vendor,'ocr-core'),{recursive:true});
for(const f of fs.readdirSync(path.join(root,'node_modules/tesseract.js-core')).filter(x=>/\.wasm(?:\.js)?$/.test(x)))fs.copyFileSync(path.join(root,'node_modules/tesseract.js-core',f),path.join(vendor,'ocr-core',f));
fs.mkdirSync(path.join(vendor,'ocr-data'),{recursive:true});
for(const lang of ['eng','deu','fra'])fs.copyFileSync(path.join(root,'node_modules/@tesseract.js-data',lang,'4.0.0',lang+'.traineddata.gz'),path.join(vendor,'ocr-data',lang+'.traineddata.gz'));
const notices=[];
for(const name of ['xlsx','mammoth','pdfjs-dist','postal-mime','fflate','tesseract.js','tesseract.js-core','docx','docxtemplater','exceljs','pdf-lib','pizzip','diff','archiver']){const dir=path.join(root,'node_modules',name),f=fs.readdirSync(dir).find(x=>/^licen[sc]e(?:\.md|\.txt)?$/i.test(x));if(f)notices.push(name+'\n'+fs.readFileSync(path.join(dir,f),'utf8'));}
fs.writeFileSync(path.join(vendor,'licenses.txt'),notices.join('\n\n'));
console.log('Local document tools built.');
