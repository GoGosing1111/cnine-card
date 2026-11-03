import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));let sparse;
function committed(file,error){
 if(error.code!=='ENOENT')throw error;
 const relative=path.relative(root,file instanceof URL?fileURLToPath(file):path.resolve(root,file)).replaceAll('\\','/');
 assert(relative&&!relative.startsWith('../')&&!path.isAbsolute(relative));
 sparse??=new Set(execFileSync('git',['ls-files','-v','-z'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:20000000}).split('\0').filter(s=>s.startsWith('S ')).map(s=>s.slice(2)));
 assert(sparse.has(relative),'only unchanged sparse assets can come from Git');
 return execFileSync('git',['cat-file','blob','HEAD:'+relative],{cwd:root,windowsHide:true,maxBuffer:40000000});
}
export function readCommittedAssetSync(file){try{return readFileSync(file);}catch(error){return committed(file,error);}}
export async function readCommittedAsset(file){try{return await readFile(file);}catch(error){return committed(file,error);}}
