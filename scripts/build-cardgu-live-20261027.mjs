import fs from 'node:fs';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
const tag='cardgu-live-20261027-v1';
for(const file of ['preview/project-v-v3/source/project-v-pixi-battle.src.js','js/battle-v3-live.js']){
 let s=fs.readFileSync(file,'utf8');if(!s.includes('-'+tag+"'"))s=s.replace(/revan-live-20261027-v1'/g,"revan-live-20261027-v1-"+tag+"'");fs.writeFileSync(file,s);
}
for(const file of ['js/app.js','index.html','service-worker.js','mercenary-codex/index.html','mercenary-codex/shell.mjs']){
 let s=fs.readFileSync(file,'utf8');if(!s.includes('cardgu=20261027-live-v1')&&!s.includes(tag)){
  if(file==='js/app.js')s=s.replaceAll('revan=20261027-live-v1&','revan=20261027-live-v1&cardgu=20261027-live-v1&');
  else if(file.startsWith('mercenary-codex/'))s=s.replaceAll('app.mjs?revan=','app.mjs?cardgu=20261027-live-v1&amp;revan=');
  else s=s.replaceAll('age-ratings-20261027-v1-',tag+'-age-ratings-20261027-v1-');
 }fs.writeFileSync(file,s);
}
const report='preview/project-v-v3/grid-build-report.json';
// Shell cache must use the exact main entry key even after concurrent releases.
const entryKey=fs.readFileSync('index.html','utf8').match(/js\/app\.js\?v=([^&"]+)/)[1];
fs.writeFileSync('service-worker.js',fs.readFileSync('service-worker.js','utf8').replace(/const SHELL_CACHE='[^']+'/,'const SHELL_CACHE=\'soop-card-shell-v'+entryKey+'\''));
for(const file of ['defense/index.html','preview/coop-defense-v1/index.html']){
 let s=fs.readFileSync(file,'utf8');if(!s.includes('cardgu=20261027-live-v1'))s=s.replace('defense.bundle.js?','defense.bundle.js?cardgu=20261027-live-v1&');fs.writeFileSync(file,s);
}
await import('./build-v3-grid-consumers.mjs');
const defense='preview/coop-defense-v1/defense.bundle.js';
const d=await build({entryPoints:['preview/coop-defense-v1/source/defense-app.js'],outfile:defense,bundle:true,minify:true,format:'iife',target:'es2022',legalComments:'none',metafile:true});
const hash=p=>createHash('sha256').update(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n')).digest('hex');
const r=JSON.parse(fs.readFileSync(report));r.outputs.push({file:defense,sha256:hash(defense),commonGrid:true,standaloneEngine:true});
for(const file of ['shared/mercenary-cardgu-v1.mjs','preview/project-v-v3/source/battle/CardguCombatPlayback.js',...['CardguFX.js','CardguAura.js','LiveGoldenRim.js','skills.mjs','manifest.json'].map(f=>'preview/project-v-v3/source/battle/cardgu/'+f)])r.sources.push({file,sha256:hash(file)});
fs.writeFileSync(report,JSON.stringify(r,null,2)+'\n');
console.log(JSON.stringify({runtime:tag,bundles:r.outputs.length,pixiCopies:Object.keys(d.metafile.inputs).filter(p=>p.endsWith('/pixi.js/lib/index.mjs')).length}));
