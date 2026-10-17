import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {makePlan,sample,motionTime,MODES} from '../skill.mjs';
import {JINMU_BASELINE as old,JOKRO_COMBAT as now,resolveJokroPreviewCast,jokroIncomingDamage} from '../balance.mjs';
const before=await import('data:text/javascript;base64,'+Buffer.from(execFileSync('git',['show','a2506bd7f:preview/mercenary-jokro-iaido-20261017-v1/skill.mjs'])).toString('base64'));
test('existing effects keep authored seconds while body movement doubles around contact',()=>{
 for(const mode of Object.keys(before.MODES)){
  const p=makePlan({mode});assert.deepEqual(p.contacts,before.makePlan({mode}).contacts);assert.equal(p.duration,before.MODES[mode].duration);
  for(let i=0;i<=100;i++){
   const t=p.duration*i/100,a=sample(p,t),b=before.sample(p,t),body=before.sample(p,motionTime(p,t));
   for(const k of ['effects','impacts','flash','charge','auraBoost'])assert.deepEqual(a[k],b[k],mode+' '+k+' '+t);
   assert.equal(a.cutin,0);assert.deepEqual(a.pose,body.pose);assert.equal(a.travel,body.travel);
  }
  const mid=p.contacts[0]??.4;assert.ok(Math.abs(motionTime(p,mid+.02)-motionTime(p,mid)-.04)<1e-9);
 }
});
test('awakening uses two visual contacts and clears every effect on cancel or loss',()=>{
 assert.deepEqual(MODES.awakening.contacts,[2.12,2.72]);
 for(const key of ['cancelAt','targetLostAt']){const p=makePlan({mode:'awakening',[key]:2.4});assert.deepEqual(p.contacts,[2.12]);for(const t of [2.4,2.72,4]){const s=sample(p,t);assert.ok(s.cancelled);assert.equal(s.effects.length,0);assert.equal(s.impacts.length,0);}}
});
test('master pixels remain locked and 24 new effect frames have alpha, unique content and safe atlas bounds',async()=>{
 const root=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
 assert.equal(hash(await fs.readFile(new URL('assets/sources/master-v4-facing-right.png',root))),'0C7B37275767E6FC428F3AE484C76B1D1BE7958CDF1E91E3F725A4C2A11DF48C');
 const m=JSON.parse(await fs.readFile(new URL('manifest.json',root)));assert.deepEqual(m.counts,{motion:24,effects:108});
 for(const key of ['cleave','shatter']){
  const s=m.effects[key],atlas=await sharp(await fs.readFile(new URL(s.atlas,root))).metadata(),seen=new Set();assert.equal(atlas.width,s.columns*s.cellWidth);assert.equal(atlas.height,s.rows*s.cellHeight);
  for(const f of s.frames){const b=await fs.readFile(new URL(f.file,root));assert.equal(hash(b),f.sha256);seen.add(f.sha256);const {data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});let visible=0,empty=0,edge=0;
   for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a>8){visible++;if(!x||!y||x===info.width-1||y===info.height-1)edge++;}else empty++;}
   assert.ok(visible>50&&empty>visible);assert.equal(edge,0);
  }assert.equal(seen.size,12);
 }
});
test('Jokro exceeds Jinmu power and mitigation without losing action credit or immunities',()=>{
 assert.equal(now.basePower,old.basePower*1.2);assert.ok(now.statScale>old.statScale);assert.ok(now.basicCapScale>old.basicCapScale);assert.ok(now.damageTakenScale<old.damageTakenScale);
 for(const k of Object.keys(old.link))assert.ok(now.link[k]>old.link[k]);
 for(const k of ['actionCredit','speedScale','counterImmune','controlImmune','poisonImmune'])assert.equal(now[k],old[k]);
 assert.ok(now.skills.ultimate.damageRatio>old.area.damageRatio);assert.ok(now.skills.ultimate.cooldownTurns<old.area.cooldownTurns);assert.ok(now.skills.ultimate.cost<old.area.cost);
 assert.ok(now.skills.awakening.damageRatio>old.area.damageRatio);assert.equal(jokroIncomingDamage(1000,'V-055'),0);assert.equal(jokroIncomingDamage(1000,'V-989'),200);
});
test('1260% is one total pool split once per living target; repeat cast is idempotent',()=>{
 const receipts=new Map(),args={skillKey:'awakening',attack:100,castId:'cast-1',receipts,targets:[{id:'a',hp:10},{id:'b',hp:10},{id:'b',hp:10},{id:'dead',hp:0},{id:'suit',hp:10,isBattleSuit:true},{id:'hidden',hp:10,untargetable:true}]};
 const r=resolveJokroPreviewCast(args);assert.deepEqual(r.hits,[{targetId:'a',damage:630},{targetId:'b',damage:630}]);assert.equal(r.totalDamage,1260);assert.equal(resolveJokroPreviewCast(args),r);assert.equal(receipts.size,1);
 assert.equal(resolveJokroPreviewCast({...args,mode:'PVP'}),null);assert.equal(resolveJokroPreviewCast({...args,castId:'empty',targets:[]}),null);assert.equal(receipts.size,1);
});
