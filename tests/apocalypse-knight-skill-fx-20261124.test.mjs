import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
import {Container,Texture} from 'pixi.js';
import {APOCALYPSE_KNIGHTS} from '../shared/apocalypse-knights-v1.mjs';
import {KnightSkillFX} from '../preview/project-v-v3/source/battle/KnightSkillFX.js';
import {ApocalypseLegionFX} from '../preview/project-v-v3/source/battle/ApocalypseLegionFX.js';
import {playApocalypseLegionSkill} from '../preview/project-v-v3/source/battle/ApocalypseLegionPlayback.js';

const root=path.resolve(import.meta.dirname,'..'),skills=APOCALYPSE_KNIGHTS.flatMap(b=>b.skills);
const frames={art:Array(12).fill(Texture.WHITE),light:Array(24).fill(Texture.WHITE)};
const points=[{id:'A1',x:170,y:350},{id:'A2',x:380,y:418}];

test('six distinct RGBA flipbooks and their particle passes decode inside the mobile texture limit',async()=>{
  const art=new Set();
  for(const skill of skills){
    const file=path.join(root,skill.atlas),atlas=JSON.parse(await fs.readFile(file)),source=await fs.readFile(path.join(path.dirname(file),atlas.meta.image));
    assert(isProductionFile(skill.atlas.slice(1)));
    assert(isProductionFile(path.posix.join(path.posix.dirname(skill.atlas.slice(1)),atlas.meta.image)));
    assert(!isProductionFile('preview/apocalypse-knights-fx-20261124/source/'+skill.asset+'.png'));
    const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert(info.width<=2048 && info.height<=2048);
    assert.deepEqual([info.width,info.height],[atlas.meta.size.w,atlas.meta.size.h]);
    const light=new Set();
    for(const [name,{frame:r}] of Object.entries(atlas.frames)){
      assert(r.x>=0 && r.y>=0 && r.x+r.w<=info.width && r.y+r.h<=info.height);
      const hash=createHash('sha256');let painted=0,clear=0;
      for(let y=r.y;y<r.y+r.h;y++){
        const row=data.subarray(4*(y*info.width+r.x),4*(y*info.width+r.x+r.w));
        hash.update(row);
        for(let i=3;i<row.length;i+=4){if(row[i]>32)painted++;else if(row[i]===0)clear++;}
      }
      assert(clear>r.w*r.h*.12,name+' transparent field');
      if(name.includes('-light_')){if(painted)light.add(hash.digest('hex'));continue;}
      assert(painted>80,name+' visible ink');art.add(hash.digest('hex'));
    }
    assert(light.size>=12,skill.code+' moving native light');
  }
  assert.equal(art.size,72);
});

test('each cast meets its contact exposure on the exact timeline beat in normal and reduced motion',()=>{
  for(const skill of skills)for(const reducedMotion of [false,true]){
    const fx=new KnightSkillFX(skill,frames,points,{viewport:{width:1080,height:1240},origin:{x:820,y:410},reducedMotion});
    fx.render(skill.impactAt);
    assert.equal(fx.currentFrame,skill.collisionFrame);
    assert(fx.subjects.every(s=>s.ink.alpha===1 && s.next.alpha===0));
    assert.equal(fx.subjects.length,skill.targetCount==='ALL'?1:points.length);
    assert.deepEqual(fx.contacts.map(s=>s.x),points.map(p=>p.x));
    assert.equal(fx.wakes.length,skill.targetCount==='ALL'?points.length:0);
    assert(fx.wakes.every(({sprite,point})=>sprite.visible && sprite.alpha>.45 && Math.abs(sprite.x-point.x)<5));
    fx.render(skill.duration-.01);
    assert(fx.display.alpha<.02);
    fx.release();fx.release();
    assert(fx.display.destroyed);assert(!Texture.WHITE.destroyed);
  }
});

function battle() {
  const actor={id:'boss',root:{x:810,y:400}},target={id:'ally',root:{x:170,y:350},apocalypseStatusLabel:{}};
  const values={hp:[],shields:[],damage:[]};
  const engine={playbackEpoch:4,battleData:{},scene:{width:1600,height:820},effectLayer:new Container(),
    combatantById:id=>id==='boss'?actor:id==='ally'?target:null,queueBanner(){},
    eventHpPercent:(_target,hp,max)=>100*hp/max,syncTargetHp:(_target,hp)=>values.hp.push(hp),
    syncTargetShield:(_target,shield)=>values.shields.push(shield),showAccountBattleUnitDamage:(_target,{damage})=>values.damage.push(damage)};
  const event={actorId:'boss',skillCode:'RAHDEN_ULTIMATE',hits:[{targetId:'ally',damage:27,absorbed:3,targetHpAfter:55,targetMaxHp:100,targetShieldAfter:5,statuses:{seal:{remaining:3}}}]};
  return {engine,target,values,event};
}

test('replayed impact, cancellation, expired loads and missing art respect server authority',async t=>{
  for(const mode of ['complete','cancel-before','cancel-after','late-load','no-atlas']){
    await t.test(mode,async t=>{
      const {engine,target,values,event}=battle();
      t.mock.method(ApocalypseLegionFX,'preload',async()=>{
        if(mode==='late-load') engine.playbackEpoch++;
        if(mode==='no-atlas') throw Error('texture unavailable');
        return frames;
      });
      engine.timeline=async(build,cleanup)=>{
        let trigger;
        build({to(){},call(fn){trigger=fn;}});
        if(mode==='cancel-before')engine.playbackEpoch++;
        else trigger();
        if(mode==='cancel-after')engine.playbackEpoch++;
        trigger();cleanup();cleanup();
      };
      const played=await playApocalypseLegionSkill(engine,event);
      const expected=mode==='cancel-before'||mode==='late-load'?0:1;
      assert.equal(played,mode!=='late-load');assert.equal(values.hp.length,expected);
      if(expected){assert.deepEqual(values.hp,[55]);assert.deepEqual(values.shields,[5]);assert.deepEqual(values.damage,[30]);assert.equal(target.apocalypseStatusLabel.text,'봉인 3');}
      assert.equal(engine.effectLayer.children.length,0);assert(!engine.activeKnightFX);
      engine.effectLayer.destroy();
    });
  }
});
