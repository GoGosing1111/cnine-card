import assert from 'node:assert/strict';
import path from 'node:path';
import {startKnightRecording} from './apocalypse-knight-recording.mjs';

export async function verifyKnightScreen(page, {boss, battle, width, out}) {
  const expected = battle.result.timeline.filter(event => event.type === 'APOCALYPSE_SKILL');
  assert.equal(expected.length,3);
  const record = process.env.KNIGHT_QA_FFMPEG ? await startKnightRecording(page) : null;
  await page.evaluate(async ({id,codes})=>{
    const engine = await ProjectVPixiBattle.mount();
    const probe = window.__knights = {casts:{},facings:0,wrongFacing:0,textureIds:new Set()};
    const sample = ()=>{
      const actor = engine.enemies.find(a=>a.battleCard?.cardId==='MONSTER:'+id), body=actor?.fullBodySprite;
      if (body?.visible && actor.root.visible && actor.battleActive && actor.hp>0) {
        const left = body.toGlobal({x:-10,y:-40}), right = body.toGlobal({x:10,y:-40});
        if (left.x>=right.x || actor.artFacing!==-1) probe.wrongFacing++;
        probe.facings++;
        probe.textureIds.add(body.texture.uid);
      }
      const fx=engine.activeKnightFX, last=engine.lastKnightPlayback;
      const t=Date.now();
      if (fx && !fx.released) {
        const code=fx.skill.code;
        const cast=probe.casts[code]??={start:t,end:t,contact:null,ink:[],light:[],targets:fx.points.map(p=>p.id),
          subjects:fx.subjects.length,contacts:fx.contacts.length};
        cast.end=t;
        if (!cast.ink.includes(fx.currentFrame)) cast.ink.push(fx.currentFrame);
        const uid=fx.contacts[0].texture.uid;
        if (!cast.light.includes(uid)) cast.light.push(uid);
        if (last?.impacts && !cast.contact) {
          cast.contact=t;
          cast.groundHits=fx.wakes.filter(({sprite})=>sprite.visible && sprite.alpha*fx.display.alpha>.3).length;
        }
      }
      if (!fx && codes.every(code=>probe.casts[code]?.contact)) probe.done=true;
      if (last && probe.casts[last.code]) probe.casts[last.code].receipt={...last};
    };
    engine.app.ticker.add(sample);
    probe.finish=()=>{
      engine.app.ticker.remove(sample);
      return {facings:probe.facings,wrongFacing:probe.wrongFacing,textures:probe.textureIds.size,casts:probe.casts,
        remainingEffects:engine.effectLayer.children.filter(fx=>codes.includes(fx.label)).length,active:!!engine.activeKnightFX,
        overflow:document.documentElement.scrollWidth>innerWidth};
    };
  },{id:boss.monsterId,codes:boss.skills.map(s=>s.code)});
  await page.locator('.apocalypse-dodge .is-safe').click();
  if (!record) {
    await page.waitForFunction(code=>!!window.__knights?.casts[code]?.contact,boss.skills[0].code,{timeout:90000});
    await page.screenshot({path:path.join(out,boss.key+'-'+width+'.png')});
  }
  if (record) {
    await page.waitForFunction(()=>window.__knights?.done,null,{timeout:150000});
    const casts=await page.evaluate(()=>window.__knights.casts);
    await record({boss,width,out,casts});
    await page.evaluate(counts=>{for(const [code,n] of counts)window.__knights.casts[code].videoFrames=n;},
      Object.entries(casts).map(([code,cast])=>[code,cast.videoFrames]));
  }
  await page.locator('#pveResultConfirm').waitFor({timeout:180000});
  const result=await page.evaluate(()=>window.__knights.finish());
  assert(result.facings>3);
  assert.equal(result.wrongFacing,0);
  assert.equal(result.textures,1);
  for (const event of expected) {
    const cast=result.casts[event.skillCode], skill=boss.skills.find(s=>s.code===event.skillCode);
    assert(cast?.contact,event.skillCode+' contact frame');
    assert.deepEqual(cast.targets,event.hits.map(h=>h.targetId));
    assert.equal(cast.contacts,event.hits.length);
    assert.equal(cast.groundHits,skill.targetCount==='ALL'?event.hits.length:0);
    assert.equal(cast.subjects,skill.targetCount==='ALL'?1:event.hits.length);
    assert.equal(cast.receipt.impacts,1);
    assert.equal(cast.receipt.targets,event.hits.length);
    assert.equal(cast.receipt.damage,event.hits.reduce((n,h)=>n+Number(h.damage||0),0));
    assert(cast.ink.length>=9 && cast.light.length>=12,event.skillCode+' drawable frames '+cast.ink.length+'/'+cast.light.length);
    Object.assign(cast,{recipients:cast.targets.length,paintedFrames:cast.ink.length,lightFrames:cast.light.length,contactMs:cast.contact-cast.start,
      visibleMs:cast.end-cast.start});
    for (const key of ['start','end','contact','ink','light','targets']) delete cast[key];
  }
  assert.equal(result.remainingEffects,0);
  assert.equal(result.active,false);
  assert.equal(result.overflow,false);
  return result;
}
