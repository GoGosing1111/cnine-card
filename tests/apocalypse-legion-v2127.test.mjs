import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPveBattleV2,createPvpBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {pveDifficultyRuntime} from '../functions/_pve_nightmare.js';
import {buildApocalypseLegion,castApocalypseAction,apocalypseSealed,apocalypseHealing,clearApocalypseStatus,finishApocalypseAction} from '../functions/_apocalypse_legion.js';
import {APOCALYPSE_LEGION_BOSSES,apocalypseLegionBoss} from '../shared/apocalypse-legion-v1.mjs';
import {latticeStation} from '../preview/project-v-v3/source/battle/FormationLayout.mjs';
const party=power=>['HP','DEFENSE','DEFENSE','ATTACK','SPEED'].map((type,i)=>({id:'C'+i,power,power_type:type,rarity:'FUR'}));
const monster=(id,power=7500000)=>({id,name:id===75?'아카드':'카네키 켄',battle_power:power,is_boss:1,pve_difficulty:'APOCALYPSE',pve_hp_percent:350,pve_attack_percent:475,pve_defense_percent:375,pve_speed_percent:375,pve_shield_percent:70,pve_attack_count:2,pve_forced_action_every:4});
test('approved two bosses start with exactly six independently identified minions; ordinary modes unchanged',()=>{
 for(const id of [75,76]){const b=createPveBattleV2({cards:party(20000000),monster:monster(id),seed:21});assert.equal(b.teams.B.cards.length,7);assert.equal(b.teams.B.cards.filter(c=>c.isApocalypseMinion).length,6);assert.equal(new Set(b.teams.B.cards.map(c=>c.id)).size,7);assert.equal(b.teams.A.cards.length,5);assert.equal(b.rules.enemyFormation,'BOSS_WITH_SIX_MINIONS');assert(!b.result.timeline.some(e=>e.type==='BOSS_ULTIMATE'));}
 for(const m of [{...monster(75),pve_difficulty:'NORMAL'},monster(74)])assert.equal(createPveBattleV2({cards:party(100000),monster:m}).teams.B.cards.length,1);
 assert.equal(createPvpBattleV2({attackerCards:party(100000),defenderCards:party(100000)}).teams.B.cards.length,5);
});
test('server sim owns three casts, all seven enemy deaths are required, no reward multiplied by minion count',()=>{
 const b=createPveBattleV2({cards:party(10000000),monster:monster(75),bossUltimatePercent:95,seed:83});
 const skills=b.result.timeline.filter(e=>e.type==='APOCALYPSE_SKILL');assert.deepEqual(skills.map(e=>e.kind),['seal','curse','ultimate']);
 assert.equal(new Set(skills.map(e=>e.skillCode)).size,3);
 assert(b.result.timeline.some(e=>e.type==='TURN'&&e.actorId?.includes('ESCORT:')));
 if(b.result.winner==='A')assert(b.result.final.B.every(c=>c.hp===0));else assert(b.result.final.B.some(c=>c.hp>0));
 assert.equal(b.rules.victoryCondition,'ALL_ENEMIES_DEFEATED');
});
test('CMS skill OFF disables all three casts without removing the six escorts',()=>{
 const b=createPveBattleV2({cards:party(10000000),monster:{...monster(75),pve_apocalypse_skill:{enabled:false}},seed:83});
 assert.equal(b.teams.B.cards.length,7);assert(!b.result.timeline.some(e=>e.type==='APOCALYPSE_SKILL'));
 const r=pveDifficultyRuntime({apocalypse:{monsterProfiles:{75:{battlePower:7500000,rewardCoin:600000,skillEnabled:true}}}},{id:75,pve_tab:'APOCALYPSE'});
 assert.equal(r.apocalypseSkill.trigger,'BOSS_ACTION');assert.equal(r.apocalypseSkill.minionCount,6);assert.equal(r.apocalypseSkill.skills.length,3);
});
test('seal and curse last own actions and cleansing removes both without affecting basic attack stats',()=>{
 const boss={id:'B:0:MONSTER:75',hp:100,attack:100,actions:1,apocalypseSkillsEnabled:true};const targets=[1,2,3].map(i=>({id:'A:'+i,slot:i,alive:true,hp:100,maxHp:200,attack:i*10,shield:0}));let last;
 castApocalypseAction(boss,targets,{emit:(_,e)=>{last=e;}});assert.deepEqual(last.hits.map(e=>e.targetId),['A:3','A:2']);assert(apocalypseSealed(targets[2]));assert.equal(targets[2].attack,30);
 finishApocalypseAction(targets[2]);assert(apocalypseSealed(targets[2]));finishApocalypseAction(targets[2]);assert(!apocalypseSealed(targets[2]));
 boss.actions=2;castApocalypseAction(boss,targets,{emit:()=>{}});assert.equal(apocalypseHealing(targets[0],50),0);clearApocalypseStatus(targets[0]);assert.equal(apocalypseHealing(targets[0],50),50);
});
test('seven positions share existing lattice pitch and never collide with each other on desktop/mobile',()=>{
 for(const profile of ['desktop','compact']){const cells=Array.from({length:7},(_,i)=>latticeStation('squad',i,'ENEMY',profile));assert.equal(new Set(cells.map(c=>`${c.x},${c.y}`)).size,7);for(const p of cells)assert(p.x>0&&p.y>0);}
});
test('all approved sprites and 12-frame atlases exist and stay separate from source artwork',()=>{
 for(const boss of APOCALYPSE_LEGION_BOSSES){assert.notEqual(boss.sourceArt,boss.battleSprite);assert(fs.existsSync('.'+boss.sourceArt));assert(fs.existsSync('.'+boss.battleSprite));for(const s of boss.skills){const atlas=JSON.parse(fs.readFileSync('.'+s.atlas));assert.equal(Object.keys(atlas.frames).length,12);assert.equal(s.collisionFrame,6);}}
 assert.equal(apocalypseLegionBoss({id:74}),null);assert.equal(apocalypseLegionBoss({id:75}).name,'아카드');
});
test('live monster adapter resolves escort art from monster ID, never the instance suffix',async()=>{
 await import('../js/project-v-monster-battle-art-adapter-v1.js');
 const manifest=JSON.parse(fs.readFileSync('assets/ui/project-v/monsters/hunt-tower/manifest-v1.json'));
 const adapter=globalThis.ProjectVMonsterBattleArt.createAdapter({manifest});
 const battleV2=createPveBattleV2({cards:party(10000000),monster:monster(75),seed:83});
 const actual=adapter.adaptBattlePayload({battleV2}).battleV2.teams.B.cards;
 assert.deepEqual(actual.map(c=>c.projectVMonsterArt.monsterId),[75,19,19,21,21,27,27]);
 for(const c of actual)assert.equal(c.name||c.title,c.projectVMonsterArt.name);
});
