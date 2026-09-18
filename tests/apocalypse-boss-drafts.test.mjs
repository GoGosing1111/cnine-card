import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {BOSSES,REFERENCE,RELEASE,makeRegistrationDraft} from '../preview/apocalypse-bosses-v1/bosses.mjs';
import {APOCALYPSE_LEGION_BOSSES} from '../shared/apocalypse-legion-v1.mjs';
import {canUseSkill,resolveHealing,finishAction,cleanse,castDraftSkill} from '../preview/apocalypse-bosses-v1/skill-contract.mjs';
import {DraftSkillFX} from '../preview/apocalypse-bosses-v1/DraftSkillFX.js';
import {buildMonsterFighter} from '../functions/_battle_v2_preview.js';
after(()=>gsap.ticker.sleep());
const json=async p=>JSON.parse(await fs.readFile(new URL('../preview/apocalypse-bosses-v1/'+p,import.meta.url),'utf8'));
const squad=()=>Array.from({length:5},(_,i)=>({id:'A:'+i,hp:10000000,maxHp:10000000,shield:1000000,defense:150000,attack:100000+i*10000,alive:true}));
const actor={id:'B:0',hp:100000000,attack:3000000,alive:true};
test('draft stays OFF, has no live IDs or rewards, and has exactly three skills per boss',()=>{
 assert.equal(RELEASE.enabled,false);assert.equal(RELEASE.registered,false);assert.equal(RELEASE.visualApproval,true);
 const rows=makeRegistrationDraft();assert.equal(rows.length,2);
 for(const b of rows){assert.equal(b.monsterId,null);assert.equal(b.isActive,false);assert.equal(b.pveEnabled,false);assert.equal(b.rewardCoin,null);assert.deepEqual(b.skills.map(s=>s.kind),['seal','curse','ultimate']);assert.notEqual(b.sourceArt,b.battleSprite);}
});
test('Hashirama < Alucard < Kaneki applies to actual engine stats and refreshed reference power',()=>{
 for(const base of [5500000,9000000]){
  const ref={...REFERENCE,battlePower:base},rows=[{battleProfile:ref},...makeRegistrationDraft(ref)];
  const stats=rows.map(({battleProfile:p})=>buildMonsterFighter({is_boss:1,battle_power:p.battlePower,pve_difficulty:'APOCALYPSE',pve_hp_percent:p.hpPercent,pve_attack_percent:p.attackPercent,pve_defense_percent:p.defensePercent,pve_speed_percent:p.speedPercent,pve_shield_percent:p.shieldPercent}));
  for(const k of ['power','maxHp','attack','defense','shield']){assert(stats[0][k]<stats[1][k],k);assert(stats[1][k]<stats[2][k],k);}
 }
 assert.throws(()=>makeRegistrationDraft({battlePower:0}));
});
test('seal selects strongest living targets and expires on each affected unit own actions',()=>{
 for(const boss of BOSSES){const t=squad(),s=boss.skills[0];t[4].hp=0;const events=castDraftSkill(s,actor,t);assert.equal(events.length,s.targetCount);assert.equal(events[0].targetId,'A:3');assert.equal(canUseSkill(t[3]),false);assert.equal(canUseSkill(t[4]),true);
  for(let i=1;i<s.statusActions;i++){finishAction(t[3]);assert.equal(canUseSkill(t[3]),false);}
  finishAction(t[3]);assert.equal(canUseSkill(t[3]),true);assert.equal(canUseSkill(t[2]),false,'another unit did not spend its actions');assert.equal(t[3].attack,130000,'basic attacks unchanged');}
});
test('curse prevents healing without spending HP, clears with cleanse, and cannot resurrect',()=>{
 for(const boss of BOSSES){const t=squad(),s=boss.skills[1];t[0].hp=2000000;castDraftSkill(s,actor,t);assert.equal(resolveHealing(t[0],3000000),0);assert.equal(t[0].hp,2000000);assert.deepEqual(cleanse(t[0]),['curse']);assert.equal(resolveHealing(t[0],3000000),3000000);t[0].hp=0;assert.equal(resolveHealing(t[0],1000),0);}
});
test('ultimate resolves shield absorption and HP exactly once; Kaneki hits harder',()=>{
 const damages=BOSSES.map(b=>{const t=squad(),events=castDraftSkill(b.skills[2],actor,t);assert.equal(events.length,5);for(const [i,e]of events.entries()){assert.equal(10000000-t[i].hp,e.damage);assert.equal(1000000-t[i].shield,e.absorbed);assert(t[i].hp>=0);assert(t[i].shield>=0);}return events[0].damage;});assert(damages[1]>damages[0]);assert.deepEqual(castDraftSkill(BOSSES[0].skills[2],{...actor,hp:0},squad()),[]);
});
test('eight generated originals have real alpha and immutable recorded hashes; six distinct 12-frame sheets',async()=>{
 const m=await json('asset-manifest.json'),hashes=new Set();assert.equal(m.files.length,8);assert.equal(m.pixelEdits,false);
 for(const f of m.files){const buf=await fs.readFile(new URL('../preview/apocalypse-bosses-v1/'+f.file,import.meta.url)),meta=await sharp(buf).metadata();assert(meta.hasAlpha);assert(f.transparentRatio>.1);assert.equal(createHash('sha256').update(buf).digest('hex'),f.sha256);hashes.add(f.sha256);}
 assert.equal(hashes.size,8);
 for(const b of BOSSES)for(const s of b.skills){const atlas=await json('assets/'+s.asset+'-atlas.json');assert.equal(Object.keys(atlas.frames).length,12);assert.equal(atlas.meta.collisionFrame,6);const png=await fs.readFile(new URL('../preview/apocalypse-bosses-v1/assets/'+atlas.meta.image,import.meta.url)),frames=new Set();for(const f of Object.values(atlas.frames)){const {x:left,y:top,w:width,h:height}=f.frame;frames.add(createHash('sha256').update(await sharp(png).extract({left,top,width,height}).raw().toBuffer()).digest('hex'));}assert.equal(frames.size,12,'no duplicate frames');}
});
test('Pixi frames and GSAP impact share one clock; pause, slow playback, seek and cancellation cleanly release',()=>{
 for(const boss of BOSSES)for(const s of boss.skills){const layer=new Container(),fx=new DraftSkillFX(s,Array(12).fill(Texture.EMPTY),[{x:500,y:500}]).attach(layer);let hits=0;const tl=gsap.timeline({paused:true});fx.play(tl,{onImpact:()=>hits++});tl.time(s.impactAt,false);assert.equal(fx.sprites[0].currentFrame,6);assert.equal(hits,1);assert.equal(fx.sprites[0].autoUpdate,false);tl.timeScale(.25);tl.pause();assert.equal(tl.paused(),true);tl.time(s.duration-.001,false);assert.equal(fx.sprites[0].currentFrame,11);assert.equal(hits,1);tl.kill();fx.release();fx.release();assert.equal(layer.children.length,0);layer.destroy();}
});
test('fixtures preserve actual card art, separate new SD, and no production route imports draft code',async()=>{
 const fixtures=await json('payloads.json');for(const b of APOCALYPSE_LEGION_BOSSES){const p=fixtures[b.key];assert.equal(p.battleV2.teams.A.cards.length,5);assert(p.battleV2.teams.A.cards.every(c=>c.image.startsWith('assets/')&&!c.image.includes('-sd-')));assert.equal(p.monster.image_url,b.sourceArt);assert.equal(p.monster.projectVMonsterArt.primaryUrl,b.battleSprite);assert.equal(p.monster.isBoss,true);assert.deepEqual(Object.keys(p.draftSkillEvents),['seal','curse','ultimate']);}
 for(const file of ['index.html','js/app.js','js/battle-v3-live.js','functions/api/[[path]].js','preview/project-v-v3/source/battle/BattleEngine.js']){const body=await fs.readFile(new URL('../'+file,import.meta.url),'utf8');assert(!body.includes('apocalypse-bosses-v1'),file);}
});
