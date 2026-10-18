import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MODES,LINES} from './motion.mjs';
const root=new URL('.',import.meta.url),read=async f=>JSON.parse(await fs.readFile(new URL(f,root),'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const cfg=await read('asset-registration.json'),m=await read('manifest.json'),records=(await read('generation-records-v2.json')).records;
const used=new Set([...Object.values(cfg.motions).flatMap(s=>s.map(x=>x.source)),...Object.values(cfg.effects).map(x=>x.source),...Object.values(cfg.cinematics).map(x=>x.source),'assets/sources/fx-fracture-fixed-v2.png']);
const reason={
 'attack-a':'Right edge clipped',
 'attack-a-retry':'Right toe clipped',
 'attack-a-final':'Extra third arm in fourth pose; replaced by localized ImageGen anatomy repair',
 'pressure':'Unselected initial grid/separation candidate; opacity not independently asserted',
 'fx-crosscut':'Cross-cell stroke overlap; replaced by spacing repair',
 'fx-fracture':'Unequal source row spacing; replaced by spacing repair plus fixed-cell original-pixel packing',
 'cutin-repair':'Side boundaries still cropped; retained original stronger face and used diagonal runtime cut-in reveal'
};
const entries=[];
for(const r of records){
 const bytes=await fs.readFile(new URL(r.file,root)),prompt=await fs.readFile(new URL(r.prompt,root));
 entries.push({...r,sha256:hash(bytes),bytes:bytes.length,promptSha256:hash(prompt),selected:used.has(r.file),status:used.has(r.file)?'SELECTED_USER_VISUAL_REVIEW_PENDING':'NOT_SELECTED',reason:reason[r.key]||null});
}
const old=await read('../mercenary-leonel-sss-limited-20261018-v1/source-generation.json');
const oldFx=await read('../mercenary-leonel-sss-limited-20261018-v1/sources-fx-generation.json');
const carried=[];
for(const file of [...new Set([...Object.values(cfg.motions).flatMap(s=>s.map(x=>x.source)).filter(f=>!entries.some(e=>e.file===f)),cfg.sourceArt,cfg.effects.dash.source])]){
 const bytes=await fs.readFile(new URL(file,root));
 const previous=[...old.sources,old.supplement,...oldFx.entries.map(x=>({...x,file:x.workspacePath,prompt:x.promptPath}))].find(x=>x&&x.file===file);
 carried.push({file,sha256:hash(bytes),unchangedFrom:'../mercenary-leonel-sss-limited-20261018-v1/'+file,prompt:previous?.prompt||null,selected:true});
}
const base={version:'LEONEL_GENERATION_V2',mode:'built-in image_gen',createdAt:new Date().toISOString(),artworkGeneratedViaPython:false,technicalProcessing:'Rigid original weapon composition, alpha/pivot registration, atlas packing and QA composites only',referenceHeight:610,cellSize:1280,userVisualApproval:'PENDING',liveEnabled:false,priorVersion:'../mercenary-leonel-sss-limited-20261018-v1',notes:'Old copied source files not selected by manifest are historical. Do not treat V1 QA or approval as V2 approval.'};
await fs.writeFile(new URL('source-generation.json',root),JSON.stringify({...base,carried,sources:entries.filter(x=>!x.file.includes('/fx-'))},null,2)+'\n');
await fs.writeFile(new URL('sources-fx-generation.json',root),JSON.stringify({...base,selectedFxFrameCount:84,carriedDash:carried.find(x=>x.file===cfg.effects.dash.source),carriedDialogue:'../mercenary-leonel-sss-limited-20261018-v1/sources-fx-generation.json',fractureTechnicalPacking:'qa/fracture-packing.json',entries:entries.filter(x=>x.file.includes('/fx-'))},null,2)+'\n');
const plan=await read('production-plan.json');plan.version='LEONEL_PRODUCTION_V2';plan.bodyFramesPlanned.ultimate=12;plan.cinematicFrames=4;plan.playbackRates=m.playbackRates;plan.combatProfile=m.combatProfile;plan.motifs=['흑청·자주 검압','진주빛 날선과 절제된 금빛','인간 검술','얼굴 각성 컷인 → 육신의 일검 → 전선 단절 → 지연 파열'];plan.scope.sourceArtRefinement=false;plan.scope.balance=true;plan.scope.balancePolicy='REVIEW_PROFILE_ONLY';plan.actions=plan.actions.map(a=>({...a,name:MODES[a.id].label,quote:LINES[a.id],flow:a.id==='ultimate'?'얼굴 각성 컷인→중심 압축→육신의 일검→전선 단절→지연 파열→검 회수':a.flow}));plan.finalArtChangedInV2=false;plan.newBodies=['attack','skill','ultimate'];plan.cinematicFraming='Original four drawn portraits, intentionally diagonal masked reveal; no full illustration substitution';plan.choreography='motion.mjs';plan.runtime='source/LeonelFX.js';
await fs.writeFile(new URL('production-plan.json',root),JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({generatedEntries:entries.length,selected:entries.filter(e=>e.selected).length,carried:carried.length}));
