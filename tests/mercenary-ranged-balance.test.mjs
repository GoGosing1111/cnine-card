import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter,simulateBattleV2Preview,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {applyMercenaryCombatLink} from '../shared/mercenary-combat-link-v2103.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {MERCENARY_RANGED_RULES,MERCENARY_SS_RANGED_PVP_SCALE,rangedMercenaryProfile,isRangedMercenarySkill,rangedMercenarySkillText,rangedMercenaryPvpScale,rangedMercenaryPvpRule,cheongaHigherTierPvpScale} from '../shared/mercenary-ranged-balance-v1.mjs';
import {mercenaryAttackStyle} from '../shared/mercenary-attack-style-v1.mjs';
import {MERCENARY_SKILL_BALANCE_V2103 as balances} from '../shared/mercenary-skill-balance-v2103.mjs';
const snapshot=(mechanic,extra={})=>({code:'V-004',rank:'SS',name:'베스페라',role:'SNIPER',position:'REAR',level:1,basePower:70000,stats:{hp:100000,attack:1000,defense:100,speed:100},combat,skills:[{...seed.document.skills.find(s=>s.mechanic===mechanic),review:'REVIEWED',balance:{damageRatio:3,cost:25,cooldownTurns:5}}],...extra});
function harness(mechanic,{miss=[],rank='S',hp=100000,targets=1,opponentRank,mode='PVP',...extra}={}){
 const a=buildMercenaryFighter(snapshot(mechanic,{rank,...extra}),'A',mode);
 const enemies=Array.from({length:targets},(_,i)=>({id:'B:'+i,side:'B',slot:i,row:'BACK',attack:100,hp,maxHp:hp,shield:0,defense:100,gauge:80,actions:0,alive:true,attackStyle:'RANGED',...(opponentRank&&i===targets-1?{isMercenary:true,rank:opponentRank}:{})}));
 const events=[],ratios=[];
 const runtime=mercenaryCombat({teams:{A:[a],B:enemies},hit:(_a,t,scale,options)=>{ratios.push({target:t.id,scale,options});return {damage:1000*scale,dodge:miss.includes(ratios.length)};},damage:(t,n)=>{const absorbed=Math.min(t.shield,n),hpDamage=Math.min(t.hp,n-absorbed);t.hp-=hpDamage;t.shield-=absorbed;return {hpDamage,absorbed};},knockout:t=>{if(t.hp<=0)t.alive=false;},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
 return {a,enemies,events,ratios,runtime,turn:()=>{a.actions++;return runtime.beforeAction(a);}};
}
const sniper=['LOCKED_THREAT_SHOT','OBSERVED_SHIELD_BREAK','ABYSS_SHIELD_ECHO','FINISHER_WITH_RELOAD'];
const sequential=['SAME_TARGET_CALIBRATION','DANCING_TARGET_VOLLEY','PLATINUM_FOCUS_LOCK','DISTRIBUTED_CORAL_VOLLEY','TWO_BEAT_FOLLOWUP'];
test('sniper skills spend one action, cost and cast cap; shots do not create extra turns or energy',()=>{
 for(const mechanic of sniper){
  const h=harness(mechanic,{targets:3});h.turn();
  assert.equal(h.a.actions,1);assert.equal(h.runtime.state(h.a).pending,null);
  assert.equal(h.runtime.state(h.a).energy,75);assert.equal(h.runtime.state(h.a).reload,undefined);
  assert.equal(h.events.filter(e=>e.type==='MERCENARY_END').length,1);
  assert.equal(h.ratios.length,mechanic==='ABYSS_SHIELD_ECHO'?2:1);
  assert.ok(Math.abs(h.ratios.reduce((sum,r)=>sum+r.options.castShare,0)-1)<.00001);
  assert.equal(h.turn(),false);assert.equal(h.runtime.state(h.a).energy,75);
 }
});
test('slow multi-shot weapons fire once per actor action and retain their distinct two/three-shot sequences',()=>{
 for(const mechanic of sequential){
  const h=harness(mechanic,{code:'V-009',role:'MARKSMAN',targets:3}),count=mechanic==='TWO_BEAT_FOLLOWUP'?2:3;
  for(let i=0;i<count;i++){h.turn();assert.equal(h.ratios.length,i+1);assert.equal(h.a.actions,i+1);assert.equal(h.runtime.state(h.a).energy,75);}
  assert.equal(h.runtime.state(h.a).pending,null);assert.equal(h.runtime.state(h.a).reload,undefined);
  assert.ok(h.ratios.every(r=>r.options.castShare===1));assert.equal(h.events.filter(e=>e.type==='MERCENARY_END').length,1);
  assert.equal(h.turn(),false);
 }
});
test('a first-shot miss never cancels later shots or the final calibration bonus',()=>{
 for(const [mechanic,count,sum] of [['SAME_TARGET_CALIBRATION',3,2.4],['ABYSS_SHIELD_ECHO',2,2.7],['TWO_BEAT_FOLLOWUP',2,1.5]]){
  const h=harness(mechanic,{miss:[1]});h.turn();
  while(h.runtime.state(h.a).pending)h.turn();
  assert.equal(h.ratios.length,count);assert.ok(Math.abs(h.a.damageDealt-1000*sum)<.001,mechanic);
  assert.deepEqual(h.events.filter(e=>e.type==='MERCENARY_HIT').map(e=>e.skillPhaseIndex),Array.from({length:count},(_,i)=>i));
 }
});
test('remaining shots retarget after either their own kill or an ally kill; empty teams end the volley',()=>{
 const h=harness('SAME_TARGET_CALIBRATION',{targets:3,hp:900});h.turn();h.turn();h.turn();
 assert.deepEqual(h.ratios.map(r=>r.target),['B:0','B:1','B:2']);assert.deepEqual(h.ratios.map(r=>r.scale),[1,1,1.4]);
 assert.equal(h.events.filter(e=>e.type==='MERCENARY_WINDUP'&&e.continuation).length,2);
 const lost=harness('TWO_BEAT_FOLLOWUP',{targets:2});lost.turn();lost.enemies[0].hp=0;lost.turn();assert.equal(lost.ratios[1].target,'B:1');
 const one=harness('ABYSS_SHIELD_ECHO',{hp:1});one.turn();assert.equal(one.ratios.length,1);assert.equal(one.runtime.state(one.a).pending,null);
 const empty=harness('DANCING_TARGET_VOLLEY');empty.turn();empty.enemies[0].hp=0;empty.turn();assert.equal(empty.ratios.length,1);assert.equal(empty.runtime.state(empty.a).pending,null);
 const coral=harness('DISTRIBUTED_CORAL_VOLLEY',{targets:3});coral.turn();coral.turn();coral.turn();assert.equal(coral.ratios.reduce((n,r)=>n+r.scale,0),3);
 const boss=harness('DISTRIBUTED_CORAL_VOLLEY');boss.enemies[0].isBoss=true;boss.turn();assert.deepEqual(boss.ratios.map(r=>r.scale),[3]);
});
test('sniper shield/HP conditions and slow burst full-hit conditions no longer discard the intended effect',()=>{
 const shield=harness('OBSERVED_SHIELD_BREAK');shield.turn();assert.ok(Math.abs(shield.a.damageDealt-3600)<.001);
 const finisher=harness('FINISHER_WITH_RELOAD');finisher.turn();assert.equal(finisher.a.damageDealt,4500);
 const abyss=harness('ABYSS_SHIELD_ECHO');abyss.turn();assert.ok(Math.abs(abyss.a.damageDealt-4200)<.001);
 const platinum=harness('PLATINUM_FOCUS_LOCK',{miss:[1,3]});platinum.turn();platinum.turn();platinum.turn();assert.equal(platinum.runtime.debuffs.get('B:0').veil.percent,25);
 const clean=harness('PLATINUM_FOCUS_LOCK');clean.turn();clean.turn();clean.turn();assert.equal(clean.events.filter(e=>e.type==='MERCENARY_DEBUFF').length,1);
});
test('death, control, no targets, cooldown and insufficient energy prevent casts; control still interrupts multi-action fire',()=>{
 for(const kind of ['dead','silenced','stunned','targets','energy','cooldown']){
  const h=harness('LOCKED_THREAT_SHOT');
  if(kind==='dead')h.a.hp=0;else if(kind==='targets')h.enemies[0].hp=0;else if(kind==='energy')h.runtime.state(h.a).energy=0;
  else if(kind==='cooldown')h.runtime.state(h.a).cooldown.set(h.a.skills[0].id,10);else h.a[kind]=true;
  h.turn();assert.equal(h.ratios.length,0,kind);
 }
 for(const kind of ['silenced','stunned','dead']){
  const h=harness('TWO_BEAT_FOLLOWUP');h.turn();if(kind==='dead')h.a.hp=0;else h.a[kind]=true;h.turn();
  assert.equal(h.ratios.length,1);assert.equal(h.runtime.state(h.a).pending,null);assert.equal(h.runtime.state(h.a).energy,75);assert.equal(h.runtime.state(h.a).reload,undefined);
 }
});
test('rank, actual weapon, role and specific mechanic gate upgrades; ordinary guns, crossbows, magic and melee keep their existing behavior',()=>{
 for(const rank of ['C','B','A'])for(const mechanic of ['LOCKED_THREAT_SHOT','SAME_TARGET_CALIBRATION']){const h=harness(mechanic,{rank});h.turn();assert.equal(h.ratios.length,0);assert.ok(h.runtime.state(h.a).pending);}
 for(const code of ['V-001','V-021']){const h=harness('SAME_TARGET_CALIBRATION',{rank:'SSS',code});h.turn();assert.equal(h.ratios.length,0);}
 const wrongRole=harness('LOCKED_THREAT_SHOT',{code:'V-044',role:'MARKSMAN'});wrongRole.turn();assert.equal(wrongRole.ratios.length,0);
 for(const [code,role,mechanic] of [['V-022','MARKSMAN','THORN_RECOIL_SEAL'],['V-042','CONTROLLER','REPEAT_OFFENDER_RESTRAINT'],['V-044','MARKSMAN','TIDAL_BARRAGE']]){
  const h=harness(mechanic,{code,role});h.turn();assert.equal(h.ratios.length,0);assert.ok(h.runtime.state(h.a).pending);h.turn();assert.equal(h.ratios.length,1);
  assert.equal(rangedMercenaryProfile(h.a,h.a.skills[0]),null);
 }
 const support=harness('FRONT_SHARED_BARRIER');support.turn();assert.ok(support.runtime.state(support.a).pending);
 const first=harness('UNDISTURBED_FIRST_SHOT');first.turn();first.turn();first.a.actions=10;assert.equal(first.turn(),false);
 assert.equal(mercenaryAttackStyle({code:'V-022'}),'RANGED');assert.equal(mercenaryAttackStyle({code:'V-021'}),'CAST');
});
const party=power=>['ATTACK','DEFENSE','SPEED','HP','ATTACK'].map((power_type,i)=>({id:String(i+1),power,power_type}));
const current=[['V-004','SS','MS-004'],['V-005','S','MS-005'],['V-008','S','MS-008'],['V-009','SS','MS-009'],['V-036','SS','MS-032','MS-036'],['V-037','SS','MS-037'],['V-040','SS','MS-040'],['V-043','SS','MS-043']];
const released=row=>({...seed.catalog.cards.find(c=>c.code===row[0]),...seed.document.mercenaries.find(c=>c.code===row[0]),code:row[0],rank:row[1],level:1,statMode:'RANK_FIXED',combat,skills:row.slice(2).map(id=>({...seed.document.skills.find(s=>s.id===id),review:'REVIEWED',balance:balances.find(s=>s.id===id)?.balance||{damageRatio:4.2,cooldownTurns:5,cost:25}}))});
const contribution=b=>b.result.timeline.filter(e=>e.actorId?.includes(':MERCENARY:')).reduce((n,e)=>n+Number(e.damage||0)+Number(e.absorbed||0),0);
test('selected sniper and slow-shot loadouts outperform A ranged and their own basic-only PVE contribution across power bands',()=>{
 for(const power of [100000,1000000,20000000])for(const row of current){
  let skilled=0,basic=0,lower=0;
  for(let i=1;i<=24;i++){
   const options={cards:party(power),monster:{id:1,battle_power:power*40,is_boss:1},seed:i*7919},mercenary=released(row);
   skilled+=contribution(createPveBattleV2({...options,mercenary}));
   basic+=contribution(createPveBattleV2({...options,mercenary:{...mercenary,skills:[]}}));
   lower+=contribution(createPveBattleV2({...options,mercenary:released(['V-002','A'])}));
  }
  assert.ok(skilled>basic*1.05,`${row[0]} skill / basic ${skilled/basic}`);assert.ok(skilled>lower*1.05,`${row[0]} vs A ${skilled/lower}`);
 }
});
test('PVP mirrored sides keep 5+1 slots and higher ranged grades maintain aggregate advantage over A',()=>{
 for(const row of current){let wins=0;
  for(const side of ['A','B'])for(let i=1;i<=24;i++){
   const own=side==='A'?'attackerMercenary':'defenderMercenary',other=side==='A'?'defenderMercenary':'attackerMercenary';
   const b=createPvpBattleV2({attackerCards:party(1000000),defenderCards:party(1000000),[own]:released(row),[other]:released(['V-002','A']),seed:i*7919});
   wins+=Number(b.result.winner===side);assert.equal(b.teams[side].cards.length,5);assert.equal(b.teams[side].mercenaries.length,1);
  }
  assert.ok(wins>24,`${row[0]} ${wins}/48`);
 }
});
test('PVP adjusted ranged stays within its same-grade melee range across power, composition and both sides',()=>{
 const compositions=[['ATTACK','DEFENSE','SPEED','HP','ATTACK'],['ATTACK','ATTACK','ATTACK','ATTACK','HP'],['DEFENSE','DEFENSE','DEFENSE','HP','SPEED'],['SPEED','SPEED','SPEED','HP','ATTACK']];
 for(const row of current){let wins=0,games=0;
  const melee=row[1]==='S'?['V-001','S','MS-001']:['V-010','SS','MS-010'];
  for(const power of [100000,1000000,20000000])for(const types of compositions)for(const side of ['A','B'])for(let i=1;i<=128;i++){
   const cards=types.map((power_type,n)=>({id:String(n+1),power,power_type}));
   const own=side==='A'?'attackerMercenary':'defenderMercenary',other=side==='A'?'defenderMercenary':'attackerMercenary';
   const battle=createPvpBattleV2({attackerCards:cards,defenderCards:cards,[own]:released(row),[other]:released(melee),seed:i*7919});
   games++;wins+=Number(battle.result.winner===side);
  }
  assert.ok(wins/games>=(row[0]==='V-005'?.6:row[1]==='SS'?.45:.5),`${row[0]} vs ${melee[0]}: ${wins}/${games}`);
  assert.ok(wins/games<(row[1]==='SS'?.55:row[0]==='V-005'?.8:.85),`${row[0]} exceeds intended PVP range: ${wins}/${games}`);
 }
});

test('SS PVP rebalance scales each chosen skill and its cap, preserving basic attacks, PVE, other ranks and unaffected weapons',()=>{
 for(const mechanic of Object.keys(MERCENARY_SS_RANGED_PVP_SCALE)){
  const h=harness(mechanic,{rank:'SS'}),factor=MERCENARY_SS_RANGED_PVP_SCALE[mechanic];h.turn();
  assert.equal(rangedMercenaryPvpScale(h.a,h.a.skills[0]),factor);
  assert.equal(h.runtime.basicMultiplier(h.a),1);assert.equal(h.runtime.state(h.a).energy,75);
  assert.ok(h.ratios.every(r=>r.options.castShare<=factor));
  const pve=harness(mechanic,{rank:'SS'});pve.a.battleMode='PVE';pve.turn();
  assert.equal(rangedMercenaryPvpScale(pve.a,pve.a.skills[0]),1);
  assert.equal(h.ratios.length,pve.ratios.length);
  h.ratios.forEach((r,i)=>{assert.ok(Math.abs(r.scale-pve.ratios[i].scale*factor)<1e-9);assert.ok(Math.abs(r.options.castShare-pve.ratios[i].options.castShare*factor)<1e-9);});
  for(const rank of ['C','B','A','S','SSS'])assert.equal(rangedMercenaryPvpScale({...h.a,rank},h.a.skills[0]),1);
 }
 for(const id of ['MS-022','MS-042','MS-044'])assert.equal(rangedMercenaryPvpScale({rank:'SS',battleMode:'PVP',attackStyle:'RANGED',role:'MARKSMAN'},seed.document.skills.find(s=>s.id===id)),1);
});
test('public descriptions reflect per-actor rules without changing CMS values, grades, assignments or lower ranks',()=>{
 const document=structuredClone(seed.document),card=document.mercenaries.find(c=>c.code==='V-005');card.rank='S';
 document.assignments.find(a=>a.code===card.code).skillIds=['MS-005'];const before=JSON.stringify(document);
 const view=mercenaryCodexDocument({payload_json:before,revision:55,updated_at:new Date().toISOString()}).cards.find(c=>c.code===card.code);
 assert.match(view.skills[0].effect,/다음 두 행동/);assert.match(view.combatLinkDescription,/다단 사격/);assert.equal(JSON.stringify(document),before);
 const skill=document.skills.find(s=>s.id==='MS-005');assert.equal(rangedMercenarySkillText(skill,{rank:'A',attackStyle:'RANGED'}),skill);
 assert.equal(isRangedMercenarySkill({rank:'S',attackStyle:'RANGED'},skill),true);assert.deepEqual(view.skills[0].balance,skill.balance);
 assert.match(view.skills[0].effect,/S등급 청아.*PVP.*100%/);
 assert.match(view.skills[0].effect,/SS·SSS.*전투 종료까지.*기본 공격 50%/);
 assert.match(view.skills[0].effect,/최종 적용은 기본 공격 50%, 탄착 교정 35%/);
 assert.equal(rangedMercenaryPvpRule(skill,{code:'V-009',rank:'S',attackStyle:'RANGED'}),'');
 assert.match(rangedMercenaryPvpRule(skill),/S등급 청아/);
});

test('every SS has a material advantage over S Cheonga, including each power and deck group',()=>{
 const ss=[['V-004','SS','MS-004'],['V-009','SS','MS-009'],['V-010','SS','MS-010'],['V-036','SS','MS-032','MS-036'],['V-037','SS','MS-037'],['V-040','SS','MS-040'],['V-042','SS','MS-042'],['V-043','SS','MS-043'],['V-044','SS','MS-044']];
 const types=[['ATTACK','DEFENSE','SPEED','HP','ATTACK'],['ATTACK','ATTACK','ATTACK','ATTACK','HP'],['DEFENSE','DEFENSE','DEFENSE','HP','SPEED'],['SPEED','SPEED','SPEED','HP','ATTACK']];
 for(const row of ss){let wins=0,games=0;const groups=new Map();
  for(const power of [100000,1000000,20000000])for(const deck of types)for(const side of ['A','B'])for(let n=1001;n<=1032;n++){
   const cards=deck.map((power_type,i)=>({id:String(i+1),power,power_type}));
   const own=side==='A'?'attackerMercenary':'defenderMercenary',other=side==='A'?'defenderMercenary':'attackerMercenary';
   const b=createPvpBattleV2({attackerCards:cards,defenderCards:cards,[own]:released(['V-005','S','MS-005']),[other]:released(row),seed:n*7919});
   const won=Number(b.result.winner===side),key=power+'/'+deck.join(',');
   if(!groups.has(key))groups.set(key,{wins:0,games:0});const group=groups.get(key);group.games++;group.wins+=won;
   games++;wins+=won;
  }
  assert.ok(wins/games<.25,`Cheonga vs ${row[0]}: ${wins}/${games}`);
  for(const [key,group] of groups)assert.ok(group.wins/group.games<.45,`Cheonga vs ${row[0]} at ${key}: ${group.wins}/${group.games}`);
 }
});

test('Cheonga cannot defeat any current SS in isolated linked PVP duels on either side',()=>{
 const ss=[['V-004','SS','MS-004'],['V-009','SS','MS-009'],['V-010','SS','MS-010'],['V-036','SS','MS-032','MS-036'],['V-037','SS','MS-037'],['V-040','SS','MS-040'],['V-042','SS','MS-042'],['V-043','SS','MS-043'],['V-044','SS','MS-044']];
 for(const row of ss)for(const power of [100000,1000000,20000000])for(const side of ['A','B'])for(let n=2001;n<=2032;n++){
  const cheonga=buildMercenaryFighter(released(['V-005','S','MS-005']),side,'PVP',buildFighter),opponent=buildMercenaryFighter(released(row),side==='A'?'B':'A','PVP',buildFighter);
  applyMercenaryCombatLink([cheonga,opponent].map(m=>[...party(power).map((c,i)=>buildFighter(c,i,m.side,null,'PVP')),m]));
  const result=simulateBattleV2Preview({teamA:[side==='A'?cheonga:opponent],teamB:[side==='B'?cheonga:opponent],seed:n*7919,maxActions:83,suddenDeathAfter:64,healerPenalty:true});
  assert.equal(result.winner,opponent.side,`Cheonga vs ${row[0]} at ${power} / ${side} / ${n}`);
 }
});

test('higher-tier opposition scales basics and all three calibration shots once, frozen through enemy KO',()=>{
 for(const opponentRank of ['SS','SSS']){
  const h=harness('SAME_TARGET_CALIBRATION',{code:'V-005',role:'MARKSMAN',targets:2,opponentRank,miss:[1]});
  assert.equal(h.runtime.basicMultiplier(h.a),.5);assert.equal(h.runtime.basicDamageCapScale(h.a),.5);
  h.turn();h.enemies[1].hp=0;h.enemies[1].alive=false;h.turn();h.turn();
  assert.equal(h.ratios.length,3);
  h.ratios.forEach((r,i)=>{assert.ok(Math.abs(r.scale-[.35,.35,.49][i])<1e-9);assert.equal(r.options.castShare,.35);});
  assert.equal(h.runtime.basicMultiplier(h.a),.5);assert.equal(h.runtime.basicDamageCapScale(h.a),.5);
  assert.equal(h.runtime.state(h.a).energy,75);assert.equal(h.runtime.state(h.a).cooldown.get('MS-005'),6);
  assert.equal(h.runtime.state(h.a).pending,null);assert.equal(h.events.filter(e=>e.type==='MERCENARY_END').length,1);
  h.runtime.buffs.set(h.a.id,{order:{percent:15}});h.runtime.debuffs.set(h.a.id,{restraint:25});
  assert.ok(Math.abs(h.runtime.basicMultiplier(h.a)-.5*1.15*.75)<1e-9);assert.equal(h.runtime.basicDamageCapScale(h.a),.5);
  assert.equal(h.runtime.basicMultiplier(h.a),.5,'consumed order/restraint cannot persist or reapply the tier factor');
 }
});

test('tier correction requires S Cheonga with calibration and a living opposing SS/SSS mercenary at entry',()=>{
 const h=harness('SAME_TARGET_CALIBRATION',{code:'V-005',role:'MARKSMAN'}),actor=h.a,opponent={isMercenary:true,rank:'SS',hp:100,alive:true};
 assert.equal(cheongaHigherTierPvpScale(actor,[opponent]),.5);
 for(const change of [{battleMode:'PVE'},{battleMode:undefined},{code:'V-009'},{isMercenary:false},{attackStyle:'MELEE'},{skills:[]},...['C','B','A','SS','SSS'].map(rank=>({rank}))])assert.equal(cheongaHigherTierPvpScale({...actor,...change},[opponent]),1);
 for(const change of [{isMercenary:false},{hp:0},{alive:false},...['C','B','A','S',undefined].map(rank=>({rank}))])assert.equal(cheongaHigherTierPvpScale(actor,[{...opponent,...change}]),1);
 assert.equal(cheongaHigherTierPvpScale({...actor,skills:[{...actor.skills[0],id:'MS-009'}]},[opponent]),1);
 assert.equal(cheongaHigherTierPvpScale({...actor,skills:[{...actor.skills[0],mechanic:'DANCING_TARGET_VOLLEY'}]},[opponent]),1);
 assert.equal(h.runtime.basicMultiplier(actor),1);assert.equal(h.runtime.basicDamageCapScale(actor),1);
 h.enemies[0]={...h.enemies[0],...opponent};assert.equal(h.runtime.basicMultiplier(actor),1,'a later rank mutation cannot change the entry rule');
 const pve=harness('SAME_TARGET_CALIBRATION',{code:'V-005',role:'MARKSMAN',mode:'PVE',opponentRank:'SS'});
 assert.equal(pve.runtime.basicMultiplier(pve.a),1);assert.equal(pve.runtime.basicDamageCapScale(pve.a),1);
 pve.turn();pve.turn();pve.turn();assert.deepEqual(pve.ratios.map(r=>r.scale),[1,1,1.4]);assert.ok(pve.ratios.every(r=>r.options.castShare===1));
});

test('the real PVP damage engine applies tier caps to normal attacks and skill impacts',()=>{
 for(const side of ['A','B']){
  const own=side==='A'?'attackerMercenary':'defenderMercenary',other=side==='A'?'defenderMercenary':'attackerMercenary';
  const cheonga=released(['V-005','S','MS-005']);cheonga.skills[0].balance={damageRatio:10000,cost:25,cooldownTurns:5};
  const battle=createPvpBattleV2({attackerCards:party(20000000),defenderCards:party(20000000),[own]:cheonga,[other]:released(['V-042','SS','MS-042']),seed:7919});
  const enemy=battle.teams[side==='A'?'B':'A'],targets=new Map([...enemy.cards,...enemy.mercenaries].map(t=>[t.id,t]));
  const hits=battle.result.timeline.filter(e=>e.actorId===side+':MERCENARY:V-005'&&!e.dodge&&['TURN','MERCENARY_HIT'].includes(e.type));
  for(const type of ['TURN','MERCENARY_HIT'])assert.ok(hits.some(e=>e.type===type),type);
  for(const e of hits){const hp=e.targetMaxHp+(targets.get(e.targetId)?.mercenaryLink?.openingShield||0),scale=e.type==='TURN'?.5:.35;assert.ok(e.damage+e.absorbed<=Math.round(hp*.6*scale)+1,`${e.type}: ${e.damage+e.absorbed}`);}
  assert.ok(hits.some(e=>e.type==='MERCENARY_HIT'&&Math.abs(e.damage+e.absorbed-Math.round(e.targetMaxHp*.6*.35))<=1));
 }
});

test('S Cheonga restores full same/lower-tier PVP calibration without changing cadence, cost or cooldown',()=>{
 const h=harness('SAME_TARGET_CALIBRATION',{code:'V-005',role:'MARKSMAN',miss:[1]});
 for(let i=0;i<3;i++){h.turn();assert.equal(h.ratios.length,i+1);assert.equal(h.runtime.state(h.a).energy,75);}
 h.ratios.forEach((r,i)=>{assert.ok(Math.abs(r.scale-[1,1,1.4][i])<1e-9);assert.equal(r.options.castShare,1);});
 assert.equal(h.runtime.state(h.a).pending,null);assert.equal(h.runtime.state(h.a).reload,undefined);
 assert.equal(h.events.filter(e=>e.type==='MERCENARY_WINDUP').length,1);assert.equal(h.events.filter(e=>e.type==='MERCENARY_END').length,1);
 assert.equal(h.runtime.state(h.a).cooldown.get('MS-005'),6);assert.equal(h.runtime.basicMultiplier(h.a),1);
 assert.equal(h.turn(),false);assert.equal(h.runtime.state(h.a).energy,75);
});

test('Cheonga upper-tier skill budget cannot leak to PVE, other owners, skills, weapons or grades',()=>{
 const h=harness('SAME_TARGET_CALIBRATION',{code:'V-005',role:'MARKSMAN'}),skill=h.a.skills[0];
 for(const extra of [{battleMode:'PVE'},{code:'V-002'},{code:'V-009'},{attackStyle:'MELEE'},...['C','B','A','SS','SSS'].map(rank=>({rank}))])assert.equal(rangedMercenaryPvpScale({...h.a,...extra},skill,.5),1);
 assert.equal(rangedMercenaryPvpScale(h.a,{...skill,id:'MS-009'},.5),1);
 assert.equal(rangedMercenaryPvpScale(h.a,{...skill,mechanic:'DANCING_TARGET_VOLLEY'},.5),1);
 h.a.battleMode='PVE';h.turn();h.turn();h.turn();assert.deepEqual(h.ratios.map(r=>r.scale),[1,1,1.4]);assert.ok(h.ratios.every(r=>r.options.castShare===1));
 const capped=released(['V-005','S','MS-005']);capped.skills[0].balance={damageRatio:10000,cost:25,cooldownTurns:5};
 const battle=createPvpBattleV2({attackerCards:party(20000000),defenderCards:party(1000000),attackerMercenary:capped,seed:7919});
 const hits=battle.result.timeline.filter(e=>e.type==='MERCENARY_HIT'&&e.actorId==='A:MERCENARY:V-005'&&!e.dodge);
 assert.ok(hits.length>=3);assert.ok(hits.some(e=>Math.abs(e.damage+e.absorbed-Math.round(e.targetMaxHp*.6))<=1));
 for(const e of hits)assert.ok(e.damage+e.absorbed<=Math.round(e.targetMaxHp*.6)+1);
});

// Frozen operating roster (CMS revision 55), including every A and S assignment.
const operating=JSON.parse(readFileSync(new URL('../docs/mercenary-cheonga-pvp-nerf-20260918.json',import.meta.url),'utf8'));
const operatingSnapshot=row=>({...seed.catalog.cards.find(c=>c.code===row.code),...row,level:1,statMode:'RANK_FIXED',combat:operating.combat,skills:row.skills.map(s=>({...seed.document.skills.find(d=>d.id===s.id),...s,review:'REVIEWED'}))});
const tierDecks=[['ATTACK','DEFENSE','SPEED','HP','ATTACK'],['ATTACK','ATTACK','ATTACK','ATTACK','HP'],['DEFENSE','DEFENSE','DEFENSE','HP','SPEED'],['SPEED','SPEED','SPEED','HP','ATTACK']];

test('Cheonga stays in the upper S tier against every current peer with equal five-card support',()=>{
 const opponents=operating.roster.filter(c=>c.rank==='S'&&c.code!=='V-005');assert.equal(opponents.length,5);
 const cheonga=operatingSnapshot(operating.roster.find(c=>c.code==='V-005'));
 for(const row of opponents){let wins=0,games=0;
  for(const power of [100000,1000000,20000000])for(const types of tierDecks)for(const side of ['A','B'])for(let n=1001;n<=1032;n++){
   const cards=types.map((power_type,i)=>({id:String(i+1),power,power_type}));
   const own=side==='A'?'attackerMercenary':'defenderMercenary',other=side==='A'?'defenderMercenary':'attackerMercenary';
   const b=createPvpBattleV2({attackerCards:cards,defenderCards:cards,[own]:cheonga,[other]:operatingSnapshot(row),seed:n*7919});
   wins+=Number(b.result.winner===side);games++;
  }
  assert.ok(wins/games>=.54,`Cheonga vs S ${row.name}: ${wins}/${games}`);
  assert.ok(wins/games<.95,`S peers must retain counterplay: ${row.name} ${wins}/${games}`);
 }
});

test('every current A mercenary loses isolated linked PVP duels to Cheonga across all power/deck groups and sides',()=>{
 const opponents=operating.roster.filter(c=>c.rank==='A');assert.equal(opponents.length,10);
 const cheongaSnapshot=operatingSnapshot(operating.roster.find(c=>c.code==='V-005'));
 for(const row of opponents)for(const power of [100000,1000000,20000000])for(const types of tierDecks)for(const side of ['A','B'])for(let n=2001;n<=2032;n++){
  const cards=types.map((power_type,i)=>({id:String(i+1),power,power_type}));
  const cheonga=buildMercenaryFighter(cheongaSnapshot,side,'PVP',buildFighter),opponent=buildMercenaryFighter(operatingSnapshot(row),side==='A'?'B':'A','PVP',buildFighter);
  applyMercenaryCombatLink([cheonga,opponent].map(m=>[...cards.map((c,i)=>buildFighter(c,i,m.side,null,'PVP')),m]));
  const result=simulateBattleV2Preview({teamA:[side==='A'?cheonga:opponent],teamB:[side==='B'?cheonga:opponent],seed:n*7919,maxActions:83,suddenDeathAfter:64,healerPenalty:true});
  assert.equal(result.winner,side,`Cheonga vs A ${row.name}: ${power}/${types}/${side}/${n}`);
 }
});
test('PVE skill floors share the actual ratio, inherit apocalypse scaling and obey the existing per-hit cap',()=>{
 for(const apocalypse of [false,true])for(const id of ['MS-004','MS-005']){
  const mercenary=released([id==='MS-004'?'V-004':'V-005','SS',id]);
  const battle=createPveBattleV2({cards:party(100000),mercenary,monster:{id:1,battle_power:1000000000,is_boss:1,...(apocalypse?{pve_difficulty:'APOCALYPSE'}:{})},seed:7919});
  const enemy=battle.teams.B.cards[0],first=battle.result.timeline.filter(e=>e.type==='MERCENARY_HIT').slice(0,id==='MS-004'?1:3);
  assert.equal(enemy.isApocalypse,apocalypse);
  const parts=id==='MS-004'?[3.8]:[1.4,1.4,1.96];
  assert.equal(first.length,parts.length);
  for(const [i,e] of first.entries())if(!e.dodge)assert.equal(e.damage+e.absorbed,Math.round(enemy.maxHp*.016*(apocalypse?.4:1)*parts[i]));
 }
 const mercenary=released(['V-004','SS','MS-004']);mercenary.skills[0].balance={damageRatio:10000,cost:25,cooldownTurns:5};
 const capped=createPveBattleV2({cards:party(100000),mercenary,monster:{id:1,battle_power:1000000000,is_boss:1},seed:7919});
 const first=capped.result.timeline.find(e=>e.type==='MERCENARY_HIT');assert.equal(first.damage+first.absorbed,Math.round(capped.teams.B.cards[0].maxHp*.46));
});
test('PVP groups both instant sniper shots under one cast cap even when remaining shots change targets',()=>{
 const mercenary=released(['V-036','SS','MS-036']);
 const b=createPvpBattleV2({attackerCards:party(20000000),defenderCards:party(1000000),attackerMercenary:mercenary,seed:7919});
 const start=b.result.timeline.findIndex(e=>e.type==='MERCENARY_WINDUP'),end=b.result.timeline.findIndex((e,i)=>i>start&&e.type==='MERCENARY_END');
 const hits=b.result.timeline.slice(start,end).filter(e=>e.type==='MERCENARY_HIT');assert.ok(hits.length>1);
 // Opening HP synergies can change the combat max HP after card projection.
 // Use each canonical impact's max HP, as the damage engine does.
 const total=hits.reduce((sum,e)=>sum+(e.damage+e.absorbed)/(e.targetMaxHp*.6),0);
 assert.ok(total<=1.00001,`volley applied ${total} full PVP caps`);
});
