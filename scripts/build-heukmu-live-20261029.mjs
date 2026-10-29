import fs from 'node:fs';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
const tag='heukmu-live-20261029-v1',read=f=>fs.readFileSync(f,'utf8'),write=(f,s)=>fs.writeFileSync(f,s);
const old=read('js/battle-v3-live.js').match(/const BATTLE_RUNTIME = '([^']+)'/)[1],version=old.endsWith('-'+tag)?old:old+'-'+tag;
for(const f of ['js/battle-v3-live.js','js/app.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'])write(f,read(f).replaceAll(old,version));
for(const f of ['js/app.js','js/battle-v3-live.js']){let s=read(f);if(!s.includes('heukmu=20261029-live-v1'))s=s.replaceAll('battle-v3-live.js?','battle-v3-live.js?heukmu=20261029-live-v1&').replaceAll('project-v-pixi-battle.bundle.js?','project-v-pixi-battle.bundle.js?heukmu=20261029-live-v1&');write(f,s);}
let html=read('index.html'),key=html.match(/js\/app\.js\?v=([^&"]+)/)[1];
if(!key.startsWith(tag+'-')){const next=tag+'-'+key;html=html.replaceAll(key,next);key=next;write('index.html',html);}
write('service-worker.js',read('service-worker.js').replace(/const SHELL_CACHE='[^']+'/,'const SHELL_CACHE=\'soop-card-shell-v'+key+'\''));
for(const f of ['mercenary-codex/index.html','mercenary-codex/shell.mjs']){let s=read(f);if(!s.includes('heukmu=20261029-live-v1'))s=s.replaceAll('app.mjs?','app.mjs?heukmu=20261029-live-v1&');write(f,s);}
let codex=read('mercenary-codex/app.mjs');if(!codex.includes('heukmu=20261029-live-v1'))write('mercenary-codex/app.mjs',codex.replace('model.mjs?','model.mjs?heukmu=20261029-live-v1&'));
for(const f of ['defense/index.html','preview/coop-defense-v1/index.html']){let s=read(f);if(!s.includes('heukmu=20261029-live-v1'))s=s.replace('defense.bundle.js?','defense.bundle.js?heukmu=20261029-live-v1&');write(f,s);}
await import('./build-v3-grid-consumers.mjs');
const defense='preview/coop-defense-v1/defense.bundle.js';await build({entryPoints:['preview/coop-defense-v1/source/defense-app.js'],outfile:defense,bundle:true,minify:true,format:'iife',target:'es2022',legalComments:'none'});
const hash=f=>createHash('sha256').update(read(f).replaceAll('\r\n','\n')).digest('hex'),file='preview/project-v-v3/grid-build-report.json',r=JSON.parse(read(file));
r.outputs.push({file:defense,sha256:hash(defense),commonGrid:true,standaloneEngine:true});
for(const f of ['shared/mercenary-heukmu-v1.mjs','preview/project-v-v3/source/battle/HeukmuCombatPlayback.js',...['HeukmuFX.js','NeonPurpleRim.js','DragonAuraTint.js','AreaSkillFX.js','skills.mjs','spec.json'].map(n=>'preview/project-v-v3/source/battle/heukmu/'+n)])r.sources.push({file:f,sha256:hash(f)});
write(file,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({tag,bundles:r.outputs.length}));
