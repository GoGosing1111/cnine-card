import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
const root='preview/mercenary-role-attacks-v2100';
const catalog=JSON.parse(await fs.readFile(`${root}/catalog-snapshot.json`,'utf8'));
const manifest=JSON.parse(await fs.readFile(`${root}/assets/manifest.json`,'utf8'));
const fur=JSON.parse(await fs.readFile('assets/ui/project-v/characters/fur/manifest-v2.json','utf8')).characters.slice(0,5);
const cards=fur.map((c,i)=>({...c,id:String(c.cardId),title:c.member,name:c.member,rarity:'FUR',power:20000000,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],image:c.sourceArt}));
const fixtures=[];
for(const row of catalog.cards){
 let entry;
 for(let seed=1;seed<=100&&!entry;seed++){
  // Only this isolated basic-attack rehearsal omits the assigned skills.
  // Neither the CMS assignments nor any live API snapshot is modified.
  const battleV2=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:{...row,statMode:'RANK_FIXED',combat,skills:[]},seed});
  const index=battleV2.result.timeline.findIndex(e=>e.type==='TURN'&&e.actorId===`A:MERCENARY:${row.code}`&&!e.dodge);
  if(index>=0)entry={code:row.code,name:row.name,role:row.role,rank:row.rank,eventIndex:index,payload:{mode:'PVP',battlefieldMode:'PVP',battleV2}};
 }
 if(!entry)throw Error(`No authoritative basic attack for ${row.code}`);
 fixtures.push(entry);
}
await fs.writeFile(`${root}/fixtures.json`,JSON.stringify({cmsRevision:catalog.revision,purpose:'BASIC_ATTACK_REHEARSAL_SKILLS_OMITTED',fixtures}));
await build({entryPoints:[`${root}/source/review.mjs`],outfile:`${root}/review.bundle.js`,write:false,bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',define:{__CNINE_NATIVE_CONTINUOUS__:'false'},metafile:true}).then(async result=>{
 await fs.writeFile(`${root}/review.bundle.js`,result.outputFiles[0].text.replace(/[ \t]+$/gm,''));
 const inputs=Object.keys(result.metafile.inputs);await fs.writeFile(`${root}/build-report.json`,JSON.stringify({pixi:'8.20.0',gsap:'3.13.0',runtimeEnabled:manifest.runtimeEnabled,source:'preview/project-v-v3/source/battle/BattleEngine.js',inputs:inputs.filter(p=>!p.includes('node_modules')),pixiCopies:inputs.filter(p=>p.endsWith('pixi.js/lib/index.mjs')).length},null,2)+'\n');
});
console.log('Built seven-role rehearsal on the actual shared V3 renderer, with all 43 CMS card mappings.');
