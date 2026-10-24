import fs from 'node:fs/promises';
async function edit(file,fn){const before=await fs.readFile(file,'utf8'),after=fn(before);if(before===after)throw Error('NO_CHANGE '+file);await fs.writeFile(file,after);}
function rep(s,a,b){if(!s.includes(a))throw Error('PATCH_NOT_FOUND '+a.slice(0,100));return s.replace(a,b);}
await edit('shared/mercenary-limited-deployment-v1.mjs',s=>"import {RAZAK_CODE,razakDeploymentSnapshot} from './mercenary-razak-v1.mjs';\n"+rep(s,'export function limitedDeploymentSnapshot(code){','export function limitedDeploymentSnapshot(code){\n if(code===RAZAK_CODE)return razakDeploymentSnapshot();'));
await edit('shared/mercenary-acquisition-release-v1.mjs',s=>"import {RAZAK_CODE} from './mercenary-razak-v1.mjs';\n"+rep(s,'=>code!==EUNSEOL_CODE','=>code!==RAZAK_CODE&&code!==EUNSEOL_CODE'));
await edit('functions/_mercenary_account.js',s=>"import {RAZAK_CODE,RAZAK_ART} from '../shared/mercenary-razak-v1.mjs';\n"+rep(s,'const limited=row.mercenary_code===EUNSEOL_CODE?','const limited=row.mercenary_code===RAZAK_CODE?RAZAK_ART:row.mercenary_code===EUNSEOL_CODE?'));
await edit('functions/_mercenary_level.js',s=>"import {RAZAK_CODE} from '../shared/mercenary-razak-v1.mjs';\n"+rep(s,'...LIMITED_MERCENARIES.map(c=>c.code),JINMU_CODE','...LIMITED_MERCENARIES.map(c=>c.code),RAZAK_CODE,JINMU_CODE'));
await edit('functions/_mercenary_codex.js',s=>"import {RAZAK_ART} from '../shared/mercenary-razak-v1.mjs';\n"+rep(s,'  for(const card of projection.cards)','  projection.cards.push({...RAZAK_ART,skills:structuredClone(RAZAK_ART.skills)});\n  for(const card of projection.cards)'));
await edit('functions/_mercenary_combat.js',s=>{
 s="import {RAZAK_CODE,RAZAK_COMBAT,RAZAK_SKILLS,RAZAK_MECHANIC,isRazak} from '../shared/mercenary-razak-v1.mjs';\nimport {razakTargets,resolveRazakCast} from './_mercenary_razak.js';\n"+s;
 s=rep(s,' const valter=snapshot.code===VALTER_CODE;'," const razak=snapshot.code===RAZAK_CODE;\n if(razak)snapshot={...snapshot,rank:'SSS',statMode:'RANK_FIXED',position:'MIDDLE',role:'ASSASSIN',attackStyle:'MELEE',skills:structuredClone(RAZAK_SKILLS.filter(s=>!s.pveOnly||mode==='PVE')),counterImmune:false,controlImmune:false,poisonImmune:false};\n const valter=snapshot.code===VALTER_CODE;");
 s=rep(s,'const rankPower=isImperialArcher(snapshot)?','const rankPower=razak?RAZAK_COMBAT.basePower:isImperialArcher(snapshot)?');
 s=rep(s,'  if(s.mechanic===NAMSUDAENG_MECHANIC)', '  if(s.mechanic===RAZAK_MECHANIC)return razakTargets(a,s,en);\n  if(s.mechanic===NAMSUDAENG_MECHANIC)');
 s=rep(s,'   case NAMSUDAENG_MECHANIC:{',`   case RAZAK_MECHANIC:{
    const damageScale=offensiveSkillScale(a,s);
    resolveRazakCast({actor:a,skill:s,targets:ts,hit,damage:(t,n)=>damage(t,s.pveOnly?n:interceptDamage(a,t,n),{actor:a,direct:true}),knockout,emit,damageScale,capActions:mercenarySkillCapActions(a,s,false)*(a.battleMode==='PVP'?damageScale:1)});
    finish(a,s);break;}
   case NAMSUDAENG_MECHANIC:{`);
 s=rep(s,'st.energy-=s.balance.cost;if(isBloodmoonNamsudaeng','st.energy-=s.balance.cost;if(isRazak(a)&&s.mechanic===RAZAK_MECHANIC)for(const other of skills.filter(k=>k.mechanic===RAZAK_MECHANIC))st.cooldown.set(other.id,a.actions+Math.max(1,s.balance.cooldownTurns));if(isBloodmoonNamsudaeng');
 return s;
});
await edit('mercenary-codex/model.mjs',s=>"import {RAZAK_CODE,RAZAK_COMBAT,RAZAK_SKILLS} from '../shared/mercenary-razak-v1.mjs';\n"+rep(s,"    if(c.edition==='LIMITED'){",`    if(c.code===RAZAK_CODE&&(c.name!=='라자크'||c.rank!=='SSS'||c.edition!=='STANDARD'||c.basePower!==RAZAK_COMBAT.basePower||c.acquisition!=='LOCKED'||c.acquisitionEnabled!==false||c.packAcquisitionEnabled!==false||c.skills.length!==3||c.skills.some((s,i)=>s.id!==RAZAK_SKILLS[i].id)))throw Error('라자크의 승인 등급·전투력·획득 잠금을 확인하세요.');
    if(c.edition==='LIMITED'){`));
await edit('mercenary-codex/app.mjs',s=>{
 s=rep(s,"model.mjs?","model.mjs?razak=20261024-v1&");
 s=rep(s,'function deploymentHtml(c){',`function deploymentHtml(c){
  if(c.acquisition==='LOCKED'&&c.edition!=='LIMITED'&&!ownedCard(c.code))return '<section class="deployment-card unavailable"><div><span>획득 상태</span><strong>현재 획득 불가</strong></div><p>'+esc(c.acquisitionDescription)+'</p></section>';`);
 return rep(s,"c.season==='BLOODMOON'?bloodmoonSprite(c)","c.battleSpriteViewport?bloodmoonSprite(c)");
});
await edit('mercenary-codex/shell.mjs',s=>rep(s,'/mercenary-codex/app.mjs?','/mercenary-codex/app.mjs?razak=20261024-v1&amp;'));
await edit('mercenary-codex/index.html',s=>rep(s,'/mercenary-codex/app.mjs?','/mercenary-codex/app.mjs?razak=20261024-v1&amp;'));
await edit('preview/project-v-v3/source/battle/MercenaryCombatPlayback.js',s=>{
 s="import {RAZAK_CODE,RAZAK_EVENT} from '../../../../shared/mercenary-razak-v1.mjs';\nimport {razakBattleArt,setupRazakActor,warmRazakActor,clearRazakActors,cancelRazakPlayback,resumeRazakPlayback,playRazakBasic,playRazakSkill} from './RazakCombatPlayback.js';\n"+s;
 s=s.replaceAll('namsudaengBattleArt(code)||','razakBattleArt(code)||namsudaengBattleArt(code)||');
 s=rep(s,' if(a.cardId===NAMSUDAENG_CODE)return setupNamsudaengActor',' if(a.cardId===RAZAK_CODE)return setupRazakActor(engine,a);\n if(a.cardId===NAMSUDAENG_CODE)return setupNamsudaengActor');
 s=s.replaceAll('clearNamsudaengActors(engine);','clearRazakActors(engine);clearNamsudaengActors(engine);').replaceAll('clearNamsudaengActors(this);','clearRazakActors(this);clearNamsudaengActors(this);').replaceAll('resumeNamsudaengPlayback(this);','resumeRazakPlayback(this);resumeNamsudaengPlayback(this);').replaceAll('cancelNamsudaengPlayback(this);','cancelRazakPlayback(this);cancelNamsudaengPlayback(this);');
 s=rep(s,' normalAttack(index,options){',' normalAttack(index,options){\n  if(options?.attacker?.isMercenary&&options.attacker.cardId===RAZAK_CODE)return playRazakBasic(this,options,()=>super.normalAttack(index,options));');
 s=rep(s,'  for(const a of this.mercenaries.filter(a=>a.cardId===NAMSUDAENG_CODE))','  for(const a of this.mercenaries.filter(a=>a.cardId===RAZAK_CODE))warmRazakActor(this,a);\n  for(const a of this.mercenaries.filter(a=>a.cardId===NAMSUDAENG_CODE))');
 return rep(s,'  if(limitedActor?.cardId===NAMSUDAENG_CODE){',`  if(limitedActor?.cardId===RAZAK_CODE){
   if(['MERCENARY_WINDUP','MERCENARY_CAST','MERCENARY_FINISH'].includes(event.type))return true;
   if(event.type===RAZAK_EVENT)return playRazakSkill(this,event);
  }
  if(limitedActor?.cardId===NAMSUDAENG_CODE){`);
});
await edit('scripts/build-v3-grid-consumers.mjs',s=>rep(s,"const layoutClient =",`for(const file of ['shared/mercenary-razak-v1.mjs','preview/project-v-v3/source/battle/RazakCombatPlayback.js','preview/project-v-v3/source/battle/razak/AssassinFX.js','preview/project-v-v3/source/battle/razak/skills.mjs'])sources.push({file,sha256:hash(await readFile(file,'utf8'))});
const layoutClient =`));
// Keep the existing release/cache token and append this local feature revision.
const runtimeFiles=['js/app.js','js/battle-v3-live.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'];
for(const file of runtimeFiles)await edit(file,s=>rep(s,'-octa-contact-20261024-v1','-octa-contact-20261024-v1-razak-20261024-v1'));
await edit('index.html',s=>rep(s,'src="js/app.js?','src="js/app.js?razak=20261024-v1&amp;'));
console.log('Razak server, codex, acquisition and V3 connections updated.');
