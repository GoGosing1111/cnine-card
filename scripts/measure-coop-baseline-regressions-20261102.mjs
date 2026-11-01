import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),file=process.argv[2];
if(!['tests/cooperative-cms.test.mjs','tests/cooperative-roster-v3.test.mjs','tests/content-energy-20261020.test.mjs'].includes(file))throw Error('Select a known read-only baseline test');
const original=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8',windowsHide:true});
const result=await build({stdin:{contents:original,resolveDir:path.dirname(path.join(root,file)),sourcefile:path.join(root,file)},bundle:true,platform:'node',format:'esm',packages:'external',write:false,define:{'import.meta.url':JSON.stringify(pathToFileURL(path.join(root,file)).href)},plugins:[{name:'head-only',setup(b){b.onLoad({filter:/\.(mjs|js|json)$/},args=>{const rel=path.relative(root,args.path).replaceAll('\\','/');if(rel.startsWith('..')||rel.includes('node_modules/'))return;return {contents:execFileSync('git',['show','HEAD:'+rel],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),loader:rel.endsWith('.json')?'json':'js'};});}}]});
// Reuse one isolated diagnostic bundle outside the release checkout.
const {writeFile}=await import('node:fs/promises');
const target=path.resolve(root,'../../../operations/coop-transcend-20261102/baseline-runtime.mjs');
await writeFile(target,result.outputFiles[0].text);
await import(pathToFileURL(target).href);
