import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
export function createStore(root){fs.mkdirSync(root,{recursive:true});const db=new DatabaseSync(path.join(root,'avenfold.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT,run TEXT,at TEXT,type TEXT,data TEXT);');
 db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS document_search USING fts5(id UNINDEXED, content, tokenize="unicode61 remove_diacritics 2");');
 const indexDocument=(id,content)=>{db.prepare('DELETE FROM document_search WHERE id=?').run(id);db.prepare('INSERT INTO document_search(id,content) VALUES (?,?)').run(id,content);};
 const searchDocuments=query=>{const words=String(query).trim().split(/\s+/).filter(Boolean).slice(0,12);if(!words.length)return null;const match=words.map(w=>'"'+w.replaceAll('"','""')+'"*').join(' AND ');return new Set(db.prepare('SELECT id FROM document_search WHERE document_search MATCH ?').all(match).map(r=>r.id));};
 const put=(kind,item)=>{db.prepare('INSERT INTO records VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data, updated=excluded.updated').run(kind,item.id,JSON.stringify(item),new Date().toISOString());return item;};
 const get=(kind,id)=>{const r=db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind,id);return r?JSON.parse(r.data):null;};
 const list=kind=>db.prepare('SELECT data FROM records WHERE kind=? ORDER BY updated DESC').all(kind).map(r=>JSON.parse(r.data));
 const event=(run,type,data)=>db.prepare('INSERT INTO events(run,at,type,data) VALUES(?,?,?,?)').run(run,new Date().toISOString(),type,JSON.stringify(data));
 const events=run=>db.prepare('SELECT * FROM events WHERE run=? ORDER BY seq').all(run).map(r=>({...r,data:JSON.parse(r.data)}));
 return {put,get,list,event,events,indexDocument,searchDocuments,close:()=>db.close()};
}
