import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));let sparse;
function relativeAsset(file){return path.relative(root,file instanceof URL?fileURLToPath(file):path.resolve(root,file)).replaceAll('\\','/');}
function sparseAssets(){return sparse??=new Set(execFileSync('git',['ls-files','-v','-z'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:20000000}).split('\0').filter(s=>s.startsWith('S ')).map(s=>s.slice(2)));}
function committed(file,error){
 if(error.code!=='ENOENT')throw error;
 const relative=relativeAsset(file);
 assert(relative&&!relative.startsWith('../')&&!path.isAbsolute(relative));
 assert(sparseAssets().has(relative),'only unchanged sparse assets can come from Git');
 return execFileSync('git',['cat-file','blob','HEAD:'+relative],{cwd:root,windowsHide:true,maxBuffer:40000000});
}
const decode=(bytes,options)=>{const encoding=typeof options==='string'?options:options?.encoding;return encoding?bytes.toString(encoding):bytes;};
export function readCommittedAssetSync(file,options){try{return readFileSync(file,options);}catch(error){return decode(committed(file,error),options);}}
export async function readCommittedAsset(file,options){try{return await readFile(file,options);}catch(error){return decode(committed(file,error),options);}}
export function existsCommittedAssetSync(file){if(existsSync(file))return true;const relative=relativeAsset(file);if(!sparseAssets().has(relative))return false;return readCommittedAssetSync(file).length>=0;}
// Git blobs have exact byte sizes; callers only inspect size/file-kind for omitted media.
export function statCommittedAssetSync(file,options){try{return statSync(file,options);}catch(error){const bytes=committed(file,error);return {size:bytes.length,isFile:()=>true,isDirectory:()=>false};}}
export function readCommittedDirectorySync(dir){
 let disk=[],missing;try{disk=readdirSync(dir);}catch(error){if(error.code!=='ENOENT')throw error;missing=error;}
 const relative=relativeAsset(dir).replace(/\/$/,'');
 if(relative.startsWith('../')||path.isAbsolute(relative)){if(missing)throw missing;return disk;}
 const prefix=relative?relative+'/':'',entries=[...sparseAssets()].filter(file=>file.startsWith(prefix)).map(file=>file.slice(prefix.length).split('/')[0]);
 if(missing&&!entries.length)throw missing;
 return [...new Set([...disk,...entries])].sort();
}
export async function readCommittedDirectory(dir){return readCommittedDirectorySync(dir);}

export async function statCommittedAsset(file,options){return statCommittedAssetSync(file,options);}
