import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {HEUKWOL_BALANCE,HEUKWOL_IMPACTS} from '../shared/mercenary-heukwol-v1.mjs';
import {resolveHeukwolCombo} from '../functions/_mercenary_heukwol.js';
import {heukwolPlaybackPlan} from '../preview/project-v-v3/source/battle/HeukwolCombatPlayback.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {openMercenaryCards,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryGradePools} from '../shared/mercenary-draw-policy-v1.mjs';
import {mercenaryPackResults} from '../shared/mercenary-pack-contract-v1.mjs';
const art=seed.catalog.cards.find(c=>c.code==='V-048'),skill=seed.document.skills.find(s=>s.id==='MS-048');
const snapshot={code:art.code,name:art.name,rank:'SS',role:'VANGUARD',position:'FRONT',level:1,basePower:120000,stats:{hp:100000,attack:1000,defense:100,speed:100},skills:[skill],combat,sourceArt:art.sourceArt,battleSprite:art.battleSprite};
test('previous complete CMS expands once, preserving every prior operator edit and later unassignment',()=>{
 const old=structuredClone(seed.document);old.mercenaries.pop();old.assignments.pop();old.skills.pop();
 old.mercenaries[0].name='운영 이름';old.skills[0].balance.cost=37;old.assignments[0].skillIds=['MS-004'];
 const before=structuredClone(old),next=expandMercenarySkillCatalog(old,seed.document,seed.catalog);
 for(const key of ['mercenaries','skills','assignments'])assert.deepEqual(next[key].slice(0,-1),before[key]);
 assert.deepEqual(old,before);assert.deepEqual(next.settings,old.settings);assert.deepEqual(next.skills.at(-1).balance,HEUKWOL_BALANCE);assert.deepEqual(next.assignments.at(-1).skillIds,['MS-048']);
 next.skills.at(-1).balance.cost=31;next.assignments.at(-1).skillIds=[];assert.deepEqual(expandMercenarySkillCatalog(next,seed.document,seed.catalog),next);
 old.mercenaries.pop();assert.throws(()=>expandMercenarySkillCatalog(old,seed.document,seed.catalog));
});
test('live originals match approval and card art never becomes the SD',()=>{
 const m=JSON.parse(fs.readFileSync(new URL('../preview/mercenary-black-moon-swordsman-ss-v1/manifest.json',import.meta.url)));
 for(const [file,hash]of [[art.sourceArt,art.sourceArtSha256],[art.battleSprite,art.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../'+file,import.meta.url))).digest('hex').toUpperCase(),hash);
 assert.equal(art.name,'흑월');assert.equal(art.rank,'SS');assert.equal(art.sourceArtSha256,m.sourceArtInfo.sha256);assert.notEqual(art.sourceArt,art.battleSprite);
});
test('three authoritative contacts share one budget; dodge, knockout and control cannot create spare hits',()=>{
 for(const mode of ['normal','dodge','kill','stunned','lost']){
  const actor=buildMercenaryFighter(snapshot,'A','PVP'),target={...actor,id:'B:target',side:'B',hp:mode==='kill'?1:100000},events=[],rolls=[];let kos=0;
  if(mode==='stunned')actor.stunned=true;if(mode==='lost')target.hp=0;
  const impacts=resolveHeukwolCombo({actor,skill,target,hit:(_a,_t,ratio,opts)=>{rolls.push({ratio,...opts});return{damage:1000*ratio,dodge:mode==='dodge'};},damage:(t,n)=>{const taken=Math.min(t.hp,n);t.hp-=taken;return{hpDamage:taken,absorbed:0};},knockout:()=>{kos++;},emit:(type,data)=>events.push({type,...data})});
  const expected=['stunned','lost'].includes(mode)?0:mode==='kill'?1:3;assert.equal(rolls.length,expected);assert.equal(impacts.length,expected);assert.equal(kos,expected?1:0);
  if(expected===3){assert.ok(Math.abs(rolls.reduce((n,h)=>n+h.ratio,0)-4.2)<1e-9);assert.equal(rolls.reduce((n,h)=>n+h.capScale,0),1);assert.equal(rolls.reduce((n,h)=>n+h.castShare,0),1);assert.deepEqual(impacts.map(i=>i.at),HEUKWOL_IMPACTS);}
  assert.equal(target.hp,mode==='normal'?95800:mode==='kill'||mode==='lost'?0:100000);
  if(expected)assert.equal(events[0].type,'MERCENARY_COMBO');
 }
});
test('one energy charge and cooldown per combo, no charge without a target',()=>{
 for(const lost of [false,true]){
  const actor=buildMercenaryFighter(snapshot,'A','PVP'),enemy={...actor,id:'B:target',side:'B',isMercenary:false,hp:lost?0:100000},events=[];
  const runtime=mercenaryCombat({teams:{A:[actor],B:[enemy]},hit:(_a,_t,r)=>({damage:1000*r}),damage:(t,n)=>{t.hp-=n;return{hpDamage:n,absorbed:0};},knockout:()=>{},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
  actor.actions++;assert.equal(runtime.beforeAction(actor),!lost);assert.equal(runtime.state(actor).energy,lost?100:75);assert.equal(runtime.state(actor).cooldown.get('MS-048'),lost?undefined:6);assert.equal(runtime.state(actor).pending,null);assert.equal(events.filter(e=>e.type==='MERCENARY_COMBO').length,lost?0:1);
 }
});
test('visual stop follows server contacts; evasion has no fabricated impact and no local damage',()=>{
 const contacts=HEUKWOL_IMPACTS.map(at=>({at,dodge:false})),full=heukwolPlaybackPlan('skill',contacts);assert.equal(full.duration,3.8);assert.equal(full.damageAuthority,'SERVER_ONLY');
 assert.equal(heukwolPlaybackPlan('skill',contacts.slice(0,1)).duration,.94);assert.equal(heukwolPlaybackPlan('skill',contacts.map(c=>({...c,dodge:true}))).contacts.length,0);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} SS acquisition is idempotent and equips one mercenary with its skill`,async t=>{
 const f=await mercenaryFixture(t,{postgres});for(const o of f.draw.outcomes)o.chancePpm=o.id==='CARD_SS'?1000000:0;await f.setDraw(f.draw);
 const pools=mercenaryGradePools(f.document.mercenaries,seed.catalog.cards.map(c=>c.code)),index=pools.SS.indexOf('V-048');assert.ok(index>=0);
 const before=await f.coin(),request={requestId:crypto.randomUUID(),count:1};const result=await openMercenaryCards(f.env,f.user,request,{randomInt:n=>n===pools.SS.length?index:0});assert.equal(result.draws[0].mercenaryCode,'V-048');
 assert.equal(mercenaryPackResults(result)[0].mercenaryCode,'V-048');
 await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('Duplicate reroll');}});assert.equal(await f.coin(),before-1000);
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-048',revision:0});const deployed=await loadMercenaryBattleSnapshot(f.env,f.user);
 assert.equal(deployed.rank,'SS');assert.equal(deployed.basePower,120000);assert.equal(deployed.sourceArt,art.sourceArt);assert.equal(deployed.battleSprite,art.battleSprite);assert.deepEqual(deployed.skills.map(s=>s.id),['MS-048']);
});
test('PVE and both PVP teams use five regular cards plus Heukwol with server combo events',()=>{
 const cards=Array.from({length:5},(_,i)=>({id:'TEST-'+i,title:'검수 '+i,rarity:'FUR',power:100000,power_type:'ATTACK'})),merc={...snapshot,statMode:'RANK_FIXED'};
 for(const data of [createPveBattleV2({cards,mercenary:merc,monster:{id:1,name:'검수',battle_power:1000000},seed:17}),createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:merc,defenderMercenary:merc,seed:12})]){
  assert.equal(data.teams.A.cards.length,5);assert.equal(data.teams.A.mercenaries.length,1);assert.equal(data.teams.A.mercenaries[0].cardId,'V-048');assert.ok(data.result.timeline.some(e=>e.skillId==='MS-048'&&e.type==='MERCENARY_COMBO'));
  if(data.mode==='PVP')assert.ok(data.result.timeline.some(e=>e.type==='MERCENARY_COMBO'&&e.actorId.startsWith('B:')));
 }
});
