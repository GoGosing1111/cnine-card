import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
export {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';export {cloud} from '../avatar-santa-joeun-replace-20261116/state.mjs';
export const out=import.meta.dirname,source=path.resolve(out,'../coop-pc-performance-20261108/source');
export const git=(...a)=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...a],{cwd:source,encoding:'utf8',windowsHide:true,maxBuffer:40000000}).trim();
export const save=(n,v)=>fs.writeFileSync(path.join(out,n+'.json'),JSON.stringify(v,null,2)+'\n'),read=n=>JSON.parse(fs.readFileSync(path.join(out,n+'.json'),'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
