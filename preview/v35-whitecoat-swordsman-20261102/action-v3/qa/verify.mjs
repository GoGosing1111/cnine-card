import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {action,elapsedAt,elapsedDuration} from '../timing.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const report={checks:{},views:[],realDevice:false,continuousVideoWatched:false};
async function open(kind='whitecoat',mobile=false){const p=await b.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:950}});await p.goto('http://127.0.0.1:18766/?case='+kind);await p.waitForFunction(()=>v35Review.ready||v35Review.errors.length);if((await p.evaluate(()=>v35Review.errors)).length)throw Error('Runtime init error');return p;}
async function start(p){await p.evaluate(()=>{const a=v35Review;a.effects.setEnabled(true);const target=(a.spine.actor.team==='ALLY'?a.engine.enemies:a.engine.allies).find(x=>a.engine.isAlive(x));a.qaReactionStart={x:target.view.x,y:target.view.y};a.pending=a.attack(1,'skill_tempest');a.engine.pendingTails.get(a.spine.actor).instance.pause();});}
async function seek(p,elapsed){return p.evaluate(elapsed=>{const a=v35Review;a.engine.pendingTails.get(a.spine.actor).instance.time(elapsed,false);a.engine.app.render();return {time:a.spine.clock.time,fx:a.effects.session.audit(),impacts:a.impacts.length,root:[a.spine.actor.root.x,a.spine.actor.root.y],hudY:a.spine.actor.hud.y};},elapsed);}
async function cancel(p){await p.evaluate(async()=>{v35Review.engine.cancelTimelines();await v35Review.pending;});}
async function record(p,on){await p.evaluate(on=>{const a=v35Review;a.effects.setEnabled(on);const chunks=[],media=new MediaRecorder(document.querySelector('#pvPixiBattle canvas').captureStream(60),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4500000});media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};a.recording={media,chunks};media.start();},on);for(let i=0;i<3;i++){await p.evaluate(async()=>{await v35Review.attack(1,'skill_tempest');});await p.waitForTimeout(180);}const bytes=await p.evaluate(async()=>{const{media,chunks}=v35Review.recording;await new Promise(r=>{media.onstop=r;media.stop();});media.stream.getTracks().forEach(t=>t.stop());const data=new Uint8Array(await new Blob(chunks).arrayBuffer());let s='';for(const n of data)s+=String.fromCharCode(n);return btoa(s);});await fs.writeFile(dir+'normal-effects-'+(on?'on':'off')+'.webm',Buffer.from(bytes,'base64'));}
try{
 const p=await open();await start(p);const before=await p.evaluate(()=>v35Review.impacts.length);
 const holds=[];for(const beat of action.visualBeats){const elapsed=elapsedAt(beat.time),a=await seek(p,elapsed+.004),z=await seek(p,elapsed+beat.hold-.004);holds.push({beat,a,z,same:JSON.stringify(a)===JSON.stringify(z)});}
 report.holds=holds;report.checks.allThreeHitstopsFreezeBodyAndEffects=holds.every(h=>h.same&&Math.abs(h.a.time-h.beat.time)<1e-6);
 report.checks.onlyFinalBeatAppliesDamage=holds[0].a.impacts===before&&holds[1].a.impacts===before&&holds[2].a.impacts===before+1;
 await seek(p,.4);await seek(p,elapsedAt(1.32));report.checks.seekDoesNotDuplicateDamage=(await p.evaluate(()=>v35Review.impacts.length))===before+1;await cancel(p);
 const histories=[];for(const step of [0,1/24,1/60]){await start(p);const elapsed=elapsedAt(1.16);if(step)for(let t=step;t<elapsed;t+=step)await seek(p,t);histories.push((await seek(p,elapsed)).fx);await cancel(p);}report.histories=histories;report.checks.deterministicHistory=histories.every(h=>JSON.stringify(h)===JSON.stringify(histories[0]));
 await start(p);await seek(p,elapsedAt(1.1));const controls=await p.evaluate(async()=>{
  const a=v35Review,e=a.engine,actor=a.spine.actor,target=e.enemies.find(x=>e.isAlive(x)),checks={},count=()=>e.effectLayer.children.filter(c=>c.label?.startsWith('V35_WHITECOAT_FX_')).length;
  const frozen=JSON.stringify(a.effects.audit());await new Promise(r=>setTimeout(r,150));checks.pause=JSON.stringify(a.effects.audit())===frozen;
  a.effects.setEnabled(false);checks.off=a.effects.session.audit().active===0;a.effects.setEnabled(true);checks.toggleRestores=JSON.stringify(a.effects.audit())===frozen;
  const n=a.impacts.length;e.cancelTimelines();await a.pending;checks.cancelBeforeFinalNoDamage=count()===0&&a.impacts.length===n;checks.cancelRestoresHud=actor.hud.y===-403;checks.cancelRestoresTarget=Math.hypot(target.view.x-a.qaReactionStart.x,target.view.y-a.qaReactionStart.y)<1e-6;
  a.pending=a.attack(1,'skill_tempest');let t=e.pendingTails.get(actor).instance;t.pause();t.time(1.4,false);const after=a.impacts.length;e.cancelTimelines();await a.pending;checks.cancelAfterFinalOneDamage=count()===0&&a.impacts.length===after&&after===n+1;
  a.pending=a.attack(1,'skill_tempest');t=e.pendingTails.get(actor).instance;t.pause();t.time(1.1,false);await e.setVisible(false);await a.pending;checks.hide=count()===0&&actor.hud.y===-403;await e.setVisible(true);
  a.pending=a.attack(1,'skill_tempest');t=e.pendingTails.get(actor).instance;t.pause();t.time(1.1,false);actor.setHp(0);checks.death=count()===0&&actor.hud.y===-403;e.cancelTimelines();await a.pending;actor.setHp(100);checks.revive=a.spine.rig.skeleton.findSlot('body').appliedPose.attachment.name==='guard';
  checks.oneCanvas=document.querySelectorAll('canvas').length===1;checks.noErrors=a.errors.length===0;return checks;
 });Object.assign(report.checks,controls);
 const impacts=await p.evaluate(()=>v35Review.impacts.length);await record(p,false);await record(p,true);report.normal=await p.evaluate(()=>({audit:v35Review.audit(),fx:v35Review.effects.audit(),playback:v35Review.normalPlayback.slice(-6)}));
 report.checks.sixNormalCombosOneDamage=report.normal.audit.impacts.length-impacts===6&&report.normal.playback.every(x=>x.last.damageApplications===1&&x.last.visualContacts.join(',')==='draw,turn,slam');
 report.checks.normalReturn=report.normal.audit.actors.every(a=>Math.hypot(a.root.x-a.base.x,a.root.y-a.base.y)<.01);
 const speeds=[];for(const speed of ['0.25','2']){await p.selectOption('#speed',speed);const started=Date.now();await p.evaluate(async()=>{await v35Review.attack(1,'skill_tempest');});speeds.push(Date.now()-started);}report.speedMs=speeds;report.checks.speedRatio=speeds[0]/speeds[1]>6&&speeds[0]/speeds[1]<10;
 await p.close();
 for(const [kind,mobile]of [['whitecoat-enemy',false],['whitecoat',true]]){
  const q=await open(kind,mobile),label=mobile?'mobile':'enemy';await start(q);const samples=[];
  for(const time of [.64,.98,1.10,1.16,1.22,1.32]){const v=await seek(q,elapsedAt(time));samples.push(v);await q.screenshot({path:dir+label+'-'+Math.round(time*1000)+'.png'});}
  const errors=samples.flatMap(v=>v.fx.trail.strokes.map(s=>s.bladeAnchorError).filter(n=>n!==null));report.checks[label+'BladeAnchors']=errors.length>=5&&errors.every(e=>e<.002);report.views.push({label,samples,errors});await cancel(q);report.checks[label+'NoErrors']=(await q.evaluate(()=>v35Review.errors)).length===0;await q.close();
 }
 report.passed=Object.values(report.checks).every(Boolean);
}catch(error){report.error=error.stack;report.passed=false;}
finally{await fs.writeFile(dir+'verification.json',JSON.stringify(report,null,2));console.log({passed:report.passed,checks:report.checks,error:report.error});await b.close();if(!report.passed)process.exitCode=1;}
