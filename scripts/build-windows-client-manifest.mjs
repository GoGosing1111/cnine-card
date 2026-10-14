import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {GAME_ORIGIN,safePublicPath} from '../packaging/windows-client/lib/policy.mjs';

// Generated from the exact staged files for every production deployment. No
// account responses, operations files, source maps or secrets enter this list.
export async function buildClientManifest({root=process.cwd(),files,writeTo}={}) {
  files ||= execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:40e6}).toString().split('\0').filter(Boolean);
  const rows=[];
  for(const file of files.sort()) {
    if(!safePublicPath('/'+file) || /(?:^|\/)(?:qa|sources?|prompts?|node_modules)(?:\/|$)/i.test(file) || /(?:\.test|\.browser)\.[cm]?js$/.test(file))continue;
    const bytes=await readFile(path.join(root,file));
    const essential=/\.(?:html|js|mjs|css|wasm|woff2?|ttf|otf)$/.test(file) || file==='manifest.webmanifest';
    rows.push({path:'/'+file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,essential});
  }
  const releaseId=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const result={schema:1,releaseId,origin:GAME_ORIGIN,minimumClientVersion:'0.1.0',files:rows};
  if(writeTo){await mkdir(path.dirname(writeTo),{recursive:true});await writeFile(writeTo,JSON.stringify(result));}
  return result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const writeTo=process.argv[2];if(!writeTo)throw new Error('Supply an output manifest path outside the source tree.');
  const result=await buildClientManifest({writeTo});
  console.log(JSON.stringify({releaseId:result.releaseId,files:result.files.length,essential:result.files.filter(f=>f.essential).length,essentialBytes:result.files.filter(f=>f.essential).reduce((n,f)=>n+f.bytes,0),totalBytes:result.files.reduce((n,f)=>n+f.bytes,0)}));
}
