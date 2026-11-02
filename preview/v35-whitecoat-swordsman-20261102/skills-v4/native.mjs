import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('../',import.meta.url)),file=p=>path.join(dir,p),hash=b=>createHash('sha256').update(b).digest('hex');
const inputBytes=await fs.readFile(file('whitecoat-skills-v4.input.json')),inputHash=hash(inputBytes),tag=inputHash.slice(0,12),nativeName='whitecoat-skills-v4-'+tag+'.spine',native=file(nativeName),runtimeDir='runtime-skills-v4-'+tag;
let prior;try{prior=JSON.parse(await fs.readFile(file('skills-v4/qa/native.json'),'utf8'));if(hash(await fs.readFile(file(prior.native)))!==prior.nativeSha256)throw Error('Newer native edits detected; preserve .spine');}catch(e){if(e.code!=='ENOENT')throw e;}
let exists=false;try{await fs.access(native);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
if(exists&&(!prior||prior.inputSha256!==inputHash||prior.native!==nativeName))throw Error('Existing candidate lacks matching receipt; preserve it');
const commands=[...exists?[]:[['import',['-i',file('whitecoat-skills-v4.input.json'),'-o',native,'-r','whitecoat']]],['reopen',['-i',native]],['export',['-i',native,'-o',file(runtimeDir),'-e','json+pack']]];
for(const [name,args] of commands){
 const p=spawnSync('C:/Program Files/Spine/Spine.com',['-u','4.3.26',...args],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:120000});
 const log=(String(p.stdout||'')+'\n'+String(p.stderr||'')).replace(/^Licensed to:.*$/gm,'Licensed to: [redacted]');await fs.writeFile(file('skills-v4/qa/native-'+name+'.log'),log);
 if(p.error||p.status!==0)throw Error(name+': '+(p.error?.message||log));console.log('Native '+name+' complete');
 if(name==='reopen'&&(log.match(/^\s*Skeleton:/gm)||[]).length!==1)throw Error('Expected exactly one skeleton; import must use a fresh candidate');
}
const out=JSON.parse(await fs.readFile(file(runtimeDir+'/whitecoat.json'),'utf8')),input=JSON.parse(inputBytes);
for(const name of Object.keys(input.animations))if(!out.animations[name])throw Error('Animation lost during native round trip: '+name);
const report={editor:'4.3.26 Professional',native:nativeName,nativeSha256:hash(await fs.readFile(native)),inputSha256:inputHash,runtimeDir,atlas:'whitecoat-skills-v4-'+tag+'.atlas',skeletonJson:'whitecoat.json',skeletonCount:1,save:true,reopen:true,export:true,bones:out.bones.length,slots:out.slots.length,animations:Object.keys(out.animations),visualReview:'pending',userMotionApproval:false,production:false};
await fs.writeFile(file('skills-v4/qa/native.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
