import fs from 'node:fs';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const tag='blackcrown-balance-60-20261031-v1',cache='blackcrownBalance=20261031-v1',read=f=>fs.readFileSync(f,'utf8'),write=(f,s)=>fs.writeFileSync(f,s);
const previousReport=JSON.parse(execFileSync('git',['show','HEAD:preview/project-v-v3/grid-build-report.json'],{encoding:'utf8',windowsHide:true,maxBuffer:5e6}));
const old=read('js/battle-v3-live.js').match(/const BATTLE_RUNTIME = '([^']+)'/)[1],version=old.endsWith('-'+tag)?old:old+'-'+tag;
for(const file of ['js/battle-v3-live.js','js/app.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'])write(file,read(file).replaceAll(old,version));
for(const file of ['js/app.js','js/battle-v3-live.js']){
 let s=read(file);if(!s.includes(cache))s=s.replaceAll('battle-v3-live.js?','battle-v3-live.js?'+cache+'&').replaceAll('project-v-pixi-battle.bundle.js?','project-v-pixi-battle.bundle.js?'+cache+'&');
 if(file==='js/app.js'&&!s.includes('mercenary-blackcrown-pack-live.bundle.mjs?'+cache))s=s.replaceAll('mercenary-blackcrown-pack-live.bundle.mjs?','mercenary-blackcrown-pack-live.bundle.mjs?'+cache+'&');write(file,s);
}
let html=read('index.html'),key=html.match(/js\/app\.js\?v=([^&"]+)/)[1];
if(!key.startsWith(tag+'-')){const next=tag+'-'+key;html=html.replaceAll(key,next);key=next;write('index.html',html);}
write('service-worker.js',read('service-worker.js').replace(/const SHELL_CACHE='[^']+'/,'const SHELL_CACHE=\'soop-card-shell-v'+key+'\''));
for(const file of ['mercenary-codex/index.html','mercenary-codex/shell.mjs']){let s=read(file);if(!s.includes(cache))s=s.replaceAll('app.mjs?','app.mjs?'+cache+'&');write(file,s);}
let app=read('mercenary-codex/app.mjs');if(!app.includes(cache))write('mercenary-codex/app.mjs',app.replace('model.mjs?','model.mjs?'+cache+'&'));
for(const file of ['defense/index.html','preview/coop-defense-v1/index.html']){let s=read(file);if(!s.includes(cache))s=s.replace('defense.bundle.js?','defense.bundle.js?'+cache+'&');write(file,s);}
await import('./build-v3-grid-consumers.mjs');
const defense='preview/coop-defense-v1/defense.bundle.js';await build({entryPoints:['preview/coop-defense-v1/source/defense-app.js'],outfile:defense,bundle:true,minify:true,format:'iife',target:'es2022',legalComments:'none'});
const file='preview/project-v-v3/grid-build-report.json',report=JSON.parse(read(file)),hash=f=>createHash('sha256').update(read(f).replaceAll('\r\n','\n')).digest('hex');
report.outputs.push({file:defense,sha256:hash(defense),commonGrid:true,standaloneEngine:true});
const currentSources=new Map(report.sources.map(r=>[r.file,r]));
report.sources=previousReport.sources.map(r=>{const next=currentSources.get(r.file)||r;currentSources.delete(r.file);return next;}).concat([...currentSources.values()]);
write(file,JSON.stringify(report,null,2)+'\n');
await import('./build-blackcrown-pack-20261027.mjs');
// Refresh only the existing store entry's battle/cache references. Rebuilding
// every store variant here would also absorb unrelated pending UI changes.
const previousVersion=version.slice(0,-('-'+tag).length);
let storeApp=read('onestore/js/app.js').replaceAll(version,previousVersion).replaceAll(previousVersion,version);
if(!storeApp.includes(cache))storeApp=storeApp.replaceAll('battle-v3-live.js?','battle-v3-live.js?'+cache+'&').replaceAll('project-v-pixi-battle.bundle.js?','project-v-pixi-battle.bundle.js?'+cache+'&');
if(!storeApp.includes('mercenary-blackcrown-pack-live.bundle.mjs?'+cache))storeApp=storeApp.replaceAll('mercenary-blackcrown-pack-live.bundle.mjs?','mercenary-blackcrown-pack-live.bundle.mjs?'+cache+'&');
write('onestore/js/app.js',storeApp);
let storeHtml=read('onestore/index.html'),storeKey=storeHtml.match(/js\/app\.js\?v=([^&"]+)/)[1];
if(!storeKey.startsWith(tag+'-'))storeHtml=storeHtml.replaceAll(storeKey,tag+'-'+storeKey);write('onestore/index.html',storeHtml);
write('shared/onestore-web-assets-v1.mjs',read('shared/onestore-web-assets-v1.mjs').replace(/("\/onestore\/js\/app\.js":")[^"]+/,(_,prefix)=>prefix+hash('onestore/js/app.js').slice(0,12)));
const manifest=JSON.parse(read('packaging/onestore/web-build.json'));
for(const source of ['index.html','js/app.js'])manifest.sourceHashes[source]=hash(source);
for(const output of ['onestore/index.html','onestore/js/app.js','shared/onestore-web-assets-v1.mjs'])manifest.outputs[output]=hash(output);
write('packaging/onestore/web-build.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({tag,bundles:report.outputs.length,approvedArtChanged:false}));
