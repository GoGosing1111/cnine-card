import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {BikiniJoeunSkillFX} from '../preview/mercenary-bikini-joeun-v1/source/BikiniJoeunSkillFX.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {BIKINI_JOEUN_BALANCE,bikiniJoeunPoseAt,bikiniJoeunVisualPlan} from '../shared/mercenary-bikini-joeun-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {openMercenaryCards,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCardChances,mercenaryGradePools} from '../shared/mercenary-draw-policy-v1.mjs';
const art=seed.catalog.cards.find(c=>c.code==='V-047'),skill=seed.document.skills.find(s=>s.id==='MS-047');
const snapshot={code:art.code,name:art.name,rank:'SS',role:'MARKSMAN',position:'MIDDLE',level:1,basePower:120000,stats:{hp:100000,attack:1000,defense:100,speed:100},skills:[skill],combat,sourceArt:art.sourceArt,battleSprite:art.battleSprite};
test('previous complete CMS adds only Bikini Joeun while preserving live edits and assignments',()=>{
 const old=structuredClone(seed.document);old.mercenaries=old.mercenaries.filter(c=>c.code!=='V-047');old.assignments=old.assignments.filter(c=>c.code!=='V-047');old.skills=old.skills.filter(s=>s.id!=='MS-047');
 old.mercenaries[0].name='운영 이름';old.skills[0].balance.cost=37;old.assignments[0].skillIds=['MS-004'];
 const before=structuredClone(old),next=expandMercenarySkillCatalog(old,seed.document,seed.catalog);
 for(const key of ['mercenaries','skills','assignments'])assert.deepEqual(next[key].slice(0,-1),before[key]);
 assert.deepEqual(old,before);assert.deepEqual(next.settings,old.settings);assert.deepEqual(next.skills.at(-1).balance,BIKINI_JOEUN_BALANCE);assert.deepEqual(next.assignments.at(-1).skillIds,['MS-047']);
 next.skills.at(-1).balance.cost=31;next.assignments.at(-1).skillIds=[];assert.deepEqual(expandMercenarySkillCatalog(next,seed.document,seed.catalog),next);
 old.mercenaries.pop();assert.throws(()=>expandMercenarySkillCatalog(old,seed.document,seed.catalog));
});
test('approved card art stays separate; native six poses and sixteen impact frames have safe alpha borders',async()=>{
 const base=new URL('../',import.meta.url),m=JSON.parse(fs.readFileSync(new URL('preview/mercenary-bikini-joeun-v1/manifest.json',base)));
 for(const [file,hash]of [[art.sourceArt,art.sourceArtSha256],[art.battleSprite,art.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file,base))).digest('hex').toUpperCase(),hash);
 assert.equal(art.sourceArtSha256,m.sourceArtInfo.sha256);assert.notEqual(art.sourceArt,art.battleSprite);assert.equal(m.sourceArtInfo.width,1024);assert.equal(m.sourceArtInfo.height,1536);
 for(const [type,count]of [['motion',6],['impact',16]]){
  const frames=m[type].frames;assert.equal(frames.length,count);assert.equal(new Set(frames.map(f=>f.sha256)).size,count);
  for(const f of frames){const {data,info}=await sharp(new URL('preview/mercenary-bikini-joeun-v1/'+f.file,base).pathname.replace(/^\/([A-Z]:)/,'$1')).ensureAlpha().raw().toBuffer({resolveWithObject:true});let filled=0;
   for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a>=24)filled++;if(x===0||y===0||x===info.width-1||y===info.height-1)assert.equal(a,0,'padded frame edge');}
   assert.ok(filled>20);if(type==='motion'){assert.ok(f.muzzle.x>f.footAnchor.x);assert.ok(f.muzzle.y<f.footAnchor.y);assert.ok(f.bodyPixels>400);}
  }
 }
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL(art.battleSprite,base))).digest('hex').toUpperCase(),m.motion.frames[0].sha256,'idle and shooting costume must match');
});
test('both attacks sample real recoil poses; visual plans never own damage',()=>{
 const poses=new Set(Array.from({length:190},(_,i)=>bikiniJoeunPoseAt(i/100)));assert.deepEqual([...poses].sort(),[0,1,2,3,4,5]);
 assert.equal(bikiniJoeunPoseAt(.44,{basic:true}),1);assert.equal(bikiniJoeunPoseAt(.54,{basic:true}),2);assert.equal(bikiniJoeunPoseAt(.7,{basic:true}),5);
 for(const basic of [false,true])for(const dodge of [false,true]){const p=bikiniJoeunVisualPlan({basic,dodge});assert.equal(p.budget,0);assert.equal(p.damageAuthority,'SERVER_ONLY');assert.equal(p.events.filter(e=>e.kind==='SHOT').length,basic?1:6);assert.equal(p.events.filter(e=>e.kind==='HIT').length,dodge?0:basic?1:6);assert.ok(p.events.every(e=>!e.ratio));}
});
test('Pixi pose playback preserves scale, HP and anchors, cancels cleanly and keeps shared atlas textures',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../preview/mercenary-bikini-joeun-v1/manifest.json',import.meta.url)));
 const stage=new Container(),effectLayer=new Container();stage.addChild(effectLayer);
 const source=new TextureSource({width:640,height:640});
 const make=x=>{const root=new Container(),sprite=new Sprite(new Texture({source}));sprite.anchor.set(260/640,600/640);sprite.width=sprite.height=320;root.addChild(sprite);root.position.set(x,400);stage.addChild(root);return {root,fullBodySprite:sprite,fullBodyHeight:320,hp:77,animationController:{kill(){}},neutralAvatarPose:{mainSprite:{scaleX:sprite.scale.x,scaleY:sprite.scale.y}}};};
 const actor=make(100),target=make(600),engine={effectLayer,simpleTimelines:new Set(),allies:[]};
 for(const basic of [false,true]){
  const assets={flash:Texture.EMPTY,smoke:Texture.EMPTY,motion:Array.from({length:6},()=>new Texture({source})),impact:Array.from({length:16},()=>new Texture({source}))};
  const before={texture:actor.fullBodySprite.texture,width:actor.fullBodySprite.width,height:actor.fullBodySprite.height,anchor:actor.fullBodySprite.anchor.clone()};
  const fx=new BikiniJoeunSkillFX(engine,actor,[target],assets,manifest,bikiniJoeunVisualPlan({basic}),()=>{},{authoritative:true});
  for(const time of basic?[.44,.54,.7]:[.44,.51,1.12,1.26,1.41]){fx.seek(time);assert.notEqual(actor.fullBodySprite.texture,before.texture);assert.equal(actor.fullBodySprite.height,before.height);assert.equal(actor.hp,77);assert.equal(target.hp,77);}
  fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();assert.equal(fx.playing,false);fx.cancel();assert.equal(engine.simpleTimelines.size,0);assert.equal(actor.fullBodySprite.texture,before.texture);assert.deepEqual(actor.fullBodySprite.anchor,before.anchor);assert.equal(fx.diagnostics().visibleSprites,0);
  fx.destroy();fx.destroy();assert.equal(effectLayer.children.length,0);assert.equal(source.destroyed,false);
 }
 stage.destroy({children:true});source.destroy();
});
test('six visual shots spend one server hit budget, one cost and one cooldown, respecting evasion and absent targets',()=>{
 for(const outcome of ['hit','dodge','lost']){
  const actor=buildMercenaryFighter(snapshot,'A','PVP'),enemy={...actor,id:'B:TARGET',side:'B',slot:0,isMercenary:false,hp:100000},events=[];let rolls=0;
  const runtime=mercenaryCombat({teams:{A:[actor],B:[enemy]},hit:(_a,_t,r)=>{rolls++;return {damage:1000*r,dodge:outcome==='dodge'};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout:()=>{},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
  if(outcome==='lost'){enemy.hp=0;enemy.alive=false;}actor.actions++;assert.equal(runtime.beforeAction(actor),outcome!=='lost');assert.equal(rolls,outcome==='lost'?0:1);
  assert.equal(events.filter(e=>e.type==='MERCENARY_HIT').length,outcome==='lost'?0:1);if(outcome!=='lost')assert.equal(enemy.hp,outcome==='hit'?95800:100000);
  assert.equal(runtime.state(actor).energy,outcome==='lost'?100:75);assert.equal(runtime.state(actor).cooldown.get('MS-047'),outcome==='lost'?undefined:6);assert.equal(runtime.state(actor).pending,null);
 }
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} SS acquisition is repeat-safe and deploys the assigned skill in a separate slot`,async t=>{
 const f=await mercenaryFixture(t,{postgres});for(const o of f.draw.outcomes)o.chancePpm=o.id==='CARD_SS'?1000000:0;await f.setDraw(f.draw);
 const pools=mercenaryGradePools(f.document.mercenaries,seed.catalog.cards.map(c=>c.code)),index=pools.SS.indexOf('V-047');assert.ok(index>=0);
 const choices=mercenaryCardChances(1000000,pools.SS,f.draw.cardRules),ticket=choices.slice(0,index).reduce((n,r)=>n+r.weight,0);
 const before=await f.coin(),request={requestId:crypto.randomUUID(),count:1};const result=await openMercenaryCards(f.env,f.user,request,{randomInt:n=>n===1000000?0:ticket});assert.equal(result.draws[0].mercenaryCode,'V-047');
 await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('Duplicate reroll')}});assert.equal(await f.coin(),before-1000);
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-047',revision:0});const deployed=await loadMercenaryBattleSnapshot(f.env,f.user);
 assert.equal(deployed.rank,'SS');assert.equal(deployed.basePower,120000);assert.equal(deployed.sourceArt,art.sourceArt);assert.equal(deployed.battleSprite,art.battleSprite);assert.deepEqual(deployed.skills.map(s=>s.id),['MS-047']);
});
test('PVE and both PVP sides receive five regular cards plus SS Joeun and immediate skill events',()=>{
 const cards=Array.from({length:5},(_,i)=>({id:'TEST-'+i,title:'검수 '+i,rarity:'FUR',power:100000,power_type:'ATTACK'})),merc={...snapshot,statMode:'RANK_FIXED'};
 for(const data of [createPveBattleV2({cards,mercenary:merc,monster:{id:1,name:'검수',battle_power:1000000},seed:17}),createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:merc,defenderMercenary:merc,seed:12})]){
  assert.equal(data.teams.A.cards.length,5);assert.equal(data.teams.A.mercenaries.length,1);assert.equal(data.teams.A.mercenaries[0].cardId,'V-047');assert.ok(data.result.timeline.some(e=>e.skillId==='MS-047'&&e.type==='MERCENARY_HIT'));
 }
});
