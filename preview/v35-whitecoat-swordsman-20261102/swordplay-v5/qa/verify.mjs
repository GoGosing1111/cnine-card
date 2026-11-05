import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {browser,open,start,seek,cancel,capture,dir,modes,elapsed} from './probe.mjs';
import {prepareStrike} from '../skills.mjs';

const b=await browser(), checks=[], views=[];
function check(name,value,detail) { checks.push({name,pass:Boolean(value),detail}); }
function body(v) { return JSON.stringify([v.time,v.pose,v.root,v.hud]); }
async function changedPixels(p) {
  return p.evaluate(()=>{
    const a=v35Review,canvas=a.engine.app.canvas, scratch=document.createElement('canvas');
    scratch.width=canvas.width;scratch.height=canvas.height;
    const ctx=scratch.getContext('2d',{willReadFrequently:true});
    const sample=()=>{a.engine.app.render();ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
    const on=sample();a.effects.setEnabled(false);const off=sample();a.effects.setEnabled(true);
    let minX=canvas.width,minY=canvas.height,maxX=0,maxY=0,changed=0;
    for(let i=0;i<on.length;i+=4) {
      if(Math.max(Math.abs(on[i]-off[i]),Math.abs(on[i+1]-off[i+1]),Math.abs(on[i+2]-off[i+2]))<24)continue;
      const x=i/4%canvas.width,y=Math.floor(i/4/canvas.width);
      changed++;minX=Math.min(x,minX);minY=Math.min(y,minY);maxX=Math.max(x,maxX);maxY=Math.max(y,maxY);
    }
    return {width:(maxX-minX+1)/canvas.width,height:(maxY-minY+1)/canvas.height,
      coverage:changed/(canvas.width*canvas.height),bounds:[minX,minY,maxX,maxY],canvas:[canvas.width,canvas.height]};
  });
}
try {
  const native=JSON.parse(await fs.readFile(dir+'../../skills-v4/qa/native.json'));
  const hash=createHash('sha256').update(await fs.readFile(dir+'../../'+native.native)).digest('hex');
  check('Spine authoring master matches approved existing motion source',hash===native.nativeSha256,hash);
  for(const [kind,width] of [['whitecoat-squad',1440],['whitecoat-squad-enemy',390]]) {
    const p=await open(b,kind,width);
    await p.waitForTimeout(2200);
    const scene=await p.evaluate(()=>{const a=v35Review;return {canvases:document.querySelectorAll('#pvPixiBattle canvas').length,
      overflow:document.documentElement.scrollWidth>innerWidth,auto:a.spine.rig.autoUpdate,
      side:a.spine.actor.team,facing:a.spine.actor.view.scale.x};});
    check(kind+' native V3 canvas and size',scene.canvases===1&&!scene.overflow&&!scene.auto,scene);
    for(const m of modes) {
      const label=kind+'/'+m.id;
      const cast=await start(p,m.id);
      const before=await seek(p,elapsed(m,m.contact-.02));
      const impact=await seek(p,elapsed(m,m.contact)+.001);
      const expected=m.id==='skill_flash'||m.id==='skill_thrust'?1:kind.endsWith('-enemy')?5:3;
      check(label+' targets before and after contact',before.impacts===cast.impacts &&
        impact.impacts===cast.impacts+expected && new Set(impact.targets).size===expected,{expected,targets:impact.targets});
      await seek(p,.075);
      const second=await seek(p,elapsed(m,m.contact)+.01);
      check(label+' seek across contact twice',second.impacts===impact.impacts);
      const samples=[];
      for(const phase of m.phases)samples.push(await seek(p,elapsed(m,phase)));
      const peak=await seek(p,elapsed(m,m.peak)),pixels=await changedPixels(p);
      check(label+' 2x actor clock',Math.abs(cast.timeScale-2*cast.engineRate)<1e-7,cast);
      check(label+' anchored blade and visible painted frames',Math.max(0,...samples.flatMap(s=>s.anchors))<1 &&
        peak.visible>0 && pixels.coverage>.001,{anchorErrors:samples.flatMap(s=>s.anchors),pixels});
      if(width===1440 || m.id==='skill_rain')await capture(p,m.id+(width===1440?'-peak':'-mobile'));
      const frozen=await p.evaluate(async()=>{
        const a=v35Review,s=a.effects.session,first=JSON.stringify(s.audit());
        a.effects.setEnabled(false);const off=s.audit().active;a.effects.setEnabled(true);
        await new Promise(resolve=>setTimeout(resolve,80));
        return {off,same:JSON.stringify(s.audit())===first};
      });
      check(label+' paused or toggled FX keep native phase',frozen.off===0 && frozen.same);
      await cancel(p);
      const restored=await p.evaluate(()=>{const a=v35Review;return {
        idle:a.spine.actor.state==='IDLE'&&!a.spine.busy,
        remaining:a.engine.effectLayer.children.filter(c=>c.label?.startsWith('V35_WHITECOAT_FX_')).length,
        handles:a.engine.pendingTails.has(a.spine.actor),applications:a.engine.lastMercenaryPlayback.damageApplications};});
      check(label+' cleanup and authoritative count',restored.idle&&!restored.handles&&!restored.remaining&&restored.applications===expected,restored);
      // The old skill and the new effect must resolve to the same drawing,
      // root, HUD and native clock at all sampled points.
      const base=await start(p,m.motion);
      const same=[];
      for(const [i,phase] of m.phases.entries())same.push(body(samples[i])===body(await seek(p,elapsed(m,phase))));
      check(label+' existing poses, travel and holds',same.every(Boolean)&&base.duration===cast.duration,same);
      await cancel(p);
      await start(p,m.id);const early=await seek(p,elapsed(m,m.contact-.025));await cancel(p);
      check(label+' cancel before impact',await p.evaluate(n=>v35Review.impacts.length===n,early.impacts));
      views.push({kind,width,skill:m.id,phases:samples.map(s=>s.pose),pixels});
    }
    if(width===1440) {
      // Observe elapsed wall time too. First warm the real scene at both speeds.
      const ms=[];
      for(const rate of ['1','0.5','1','0.5']) {
        await p.selectOption('#speed',rate);
        const result=await p.evaluate(async()=>{const a=v35Review;await a.attack(a.engine.mercenaries.indexOf(a.spine.actor),'skill_rain');return a.normalPlayback.at(-1);});
        ms.push(result.elapsedMs);
      }
      check('measured normal vs half speed',Math.abs(ms[3]/ms[2]-2)<.18,{normalMs:ms[2],halfMs:ms[3],ratio:ms[3]/ms[2]});
      await p.selectOption('#speed','0.25');const slow=await start(p,'skill_flash');
      check('0.25 review setting shares the same actor clock',Math.abs(slow.timeScale-.65)<.0001,slow.timeScale);await cancel(p);
    }
    check(kind+' no playback errors',!(await p.evaluate(()=>v35Review.errors.length)));
    await p.close();
  }
  // Distinct server maxima, duplicates, friendlies, dead targets and empty
  // AoE snapshots. The pure resolver used by the V3 adapter owns no hit rolls.
  const actors=['caster','first','second','dead','friend'].map((id,i)=>({id,team:i===0||i===4?'ALLY':'ENEMY',hp:i===3?0:100,root:{}}));
  const [caster,first,second]=actors, hp=[],shield=[],callbacks=[],damage=[];
  const engine={isAlive:t=>t?.hp>0,combatantById:id=>actors.find(t=>t.id===id),
    eventHpPercent:(a,n,max)=>100*n/max,syncTargetHp:(a,n)=>hp.push([a.id,n]),
    syncTargetShield:(a,n)=>shield.push([a.id,n]),showAccountBattleUnitDamage:(a,x)=>damage.push([a.id,x.damage])};
  const hits=[{targetId:first.id,targetHpAfter:125,targetMaxHp:500,targetShieldAfter:5,damage:375},
    {targetId:second.id,targetHpAfter:800,targetMaxHp:1000,targetShieldAfter:0,damage:200}];
  const cast=prepareStrike(engine,caster,{action:'skill_wheel',target:second,
    hits:[...hits,hits[0],{targetId:'friend'},{targetId:'dead'},{targetId:'missing'}],onImpact:t=>callbacks.push(t.id)});
  cast.apply();cast.apply();
  check('per-target snapshots applied once',cast.primary===second && cast.count===2 &&
    JSON.stringify(hp)==='[["first",25],["second",80]]' && JSON.stringify(shield)==='[["first",5],["second",0]]' &&
    callbacks.join(',')==='first,second' && damage[1][1]===200,{hp,shield,callbacks,damage});
  check('AoE needs an explicit hit row',!prepareStrike(engine,caster,{action:'skill_rain',target:first}).primary);
  check('single-target ignores secondary rows',prepareStrike(engine,caster,{action:'skill_flash',target:second,hits}).targets.length===1);
  const panels=[];
  for(const [i,m] of modes.entries())panels.push({input:await sharp(dir+m.id+'-peak.png').resize(620,350,{fit:'contain',background:'#101926'}).png().toBuffer(),left:i%2*620,top:Math.floor(i/2)*350});
  await sharp({create:{width:1240,height:700,channels:4,background:'#101926'}}).composite(panels).png().toFile(dir+'four-cuts.png');
} catch(error) {check('execution',false,error.stack);}
finally {
  await b.close();
  const failed=checks.filter(c=>!c.pass);
  await fs.writeFile(dir+'verification.json',JSON.stringify({checks,views,realDevice:false,passed:!failed.length},null,2));
  console.log({checks:checks.length,failed});if(failed.length)process.exitCode=1;
}
