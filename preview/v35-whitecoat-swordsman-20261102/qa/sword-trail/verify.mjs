import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const dir=fileURLToPath(new URL('.',import.meta.url)),hero=fileURLToPath(new URL('../../',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const report={checks:{},views:[],realDevice:false,continuousVideoWatched:false,method:'Actual headless V3 playback, native sockets and rendered geometry; not a separate motion renderer.'};
async function open(kind='whitecoat',mobile=false){
 const p=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:950}});
 await p.route('**/*',r=>['127.0.0.1'].includes(new URL(r.request().url()).hostname)||['data:','blob:'].includes(new URL(r.request().url()).protocol)?r.continue():r.abort());
 await p.goto('http://127.0.0.1:18766/?case='+kind);
 await p.waitForFunction(()=>window.v35Review?.ready||window.v35Review?.errors.length,{},{timeout:60000});
 const errors=await p.evaluate(()=>v35Review.errors);if(errors.length)throw Error(errors.join('\n'));return p;
}
async function start(p,action,on=true){await p.evaluate(({action,on})=>{const a=v35Review;a.effects.setEnabled(on);a.pending=a.attack(1,action);a.engine.pendingTails.get(a.spine.actor).instance.pause();},{action,on});}
async function seek(p,time){return p.evaluate(time=>{const a=v35Review;a.engine.pendingTails.get(a.spine.actor).instance.time(time,false);a.engine.app.render();return {time,fx:a.effects.audit(),attachment:a.spine.rig.skeleton.findSlot('body').appliedPose.attachment.name};},time);}
async function cancel(p){await p.evaluate(async()=>{v35Review.engine.cancelTimelines();await v35Review.pending;});}
async function record(p,on){
 await p.evaluate(on=>{const a=v35Review;a.effects.setEnabled(on);const stream=document.querySelector('#pvPixiBattle canvas').captureStream(60),chunks=[];const media=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4500000});media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};a.recording={media,chunks};media.start();},on);
 for(let i=0;i<3;i++)for(const action of ['attack_basic','skill_iai']){await p.evaluate(async action=>{await v35Review.attack(1,action);},action);await p.waitForTimeout(100);}
 const data=await p.evaluate(async()=>{const r=v35Review.recording;await new Promise(done=>{r.media.onstop=done;r.media.stop();});r.media.stream.getTracks().forEach(t=>t.stop());const b=new Uint8Array(await new Blob(r.chunks,{type:'video/webm'}).arrayBuffer());let s='';for(const n of b)s+=String.fromCharCode(n);return btoa(s);});
 await fs.writeFile(dir+'normal-effects-'+(on?'on':'off')+'.webm',Buffer.from(data,'base64'));
}
try{
 const p=await open();
 for(const action of ['attack_basic','skill_iai']){
  await start(p,action);
  for(const time of action==='attack_basic'?[.28,.32,.35,.40,.44,.52,.60]:[.26,.30,.35,.43,.51,.55,.62,.72]){
   const sample=await seek(p,time),file=action+'-'+Math.round(time*1000)+'.png';
   await p.screenshot({path:dir+file});report.views.push({file,...sample});
  }
  await cancel(p);
 }
 const anchors=report.views.flatMap(v=>v.fx.active.trail.strokes.map(s=>s.bladeAnchorError).filter(n=>n!==null));
 report.anchorErrors=anchors;report.checks.nativeBladeAnchors=anchors.length>=8&&anchors.every(n=>n<.002);
 report.checks.poseChangeAnchors=report.views.filter(v=>[.30,.32,.40,.51].includes(v.time)).every(v=>v.fx.active.trail.strokes.some(s=>Math.abs(s.end-v.time)<1e-6&&s.visible&&s.bladeAnchorError!==null&&s.bladeAnchorError<.002));
 report.checks.noTrailBeforePoseChange=report.views.filter(v=>[.26,.28].includes(v.time)).every(v=>v.fx.active.trail.active===0);
 report.checks.finishedTrailsClear=report.views.filter(v=>[.6,.72].includes(v.time)).every(v=>v.fx.active.trail.active===0);
 // Frame rate independent history: direct seek and many small steps must agree.
 const histories=[];for(const step of [0,1/24,1/60]){await start(p,'skill_iai');if(step)for(let t=step;t<.55;t+=step)await seek(p,t);const s=await seek(p,.55);histories.push(s.fx.active.trail);await cancel(p);}
 report.checks.deterministicGeometry=histories.every(h=>JSON.stringify(h)===JSON.stringify(histories[0]));
 report.histories=histories;
 const controls=await p.evaluate(async()=>{
  const a=v35Review,e=a.engine,actor=a.spine.actor,checks={},count=()=>e.effectLayer.children.filter(c=>c.label?.startsWith('V35_WHITECOAT_FX_')).length;
  a.pending=a.attack(1,'skill_iai');let t=e.pendingTails.get(actor).instance;t.pause();t.time(.55,false);
  const frozen=JSON.stringify(a.effects.audit());await new Promise(r=>setTimeout(r,160));checks.pauseFreezesGeometry=JSON.stringify(a.effects.audit())===frozen;
  a.effects.setEnabled(false);checks.offHidesAll=a.effects.session.audit().active===0;
  a.effects.setEnabled(true);checks.toggleRestoresSameGeometry=JSON.stringify(a.effects.audit())===frozen;
  const n=a.impacts.length;t.time(.32,false);t.time(.55,false);checks.seekDoesNotRepeatDamage=a.impacts.length===n;
  e.cancelTimelines();await a.pending;checks.cancelAfterClears=count()===0;
  a.pending=a.attack(1,'attack_basic');t=e.pendingTails.get(actor).instance;t.pause();t.time(.2,false);const before=a.impacts.length;e.cancelTimelines();await a.pending;checks.cancelBeforeNoDamage=count()===0&&a.impacts.length===before;
  a.pending=a.attack(1,'skill_iai');t=e.pendingTails.get(actor).instance;t.pause();t.time(.55,false);await e.setVisible(false);await a.pending;checks.hiddenClears=count()===0;await e.setVisible(true);
  a.pending=a.attack(1,'skill_iai');t=e.pendingTails.get(actor).instance;t.pause();t.time(.55,false);actor.setHp(0);checks.deathClears=count()===0;e.cancelTimelines();await a.pending;actor.setHp(100);
  checks.reviveGuard=a.spine.rig.skeleton.findSlot('body').appliedPose.attachment.name==='guard';
  checks.singleCanvas=document.querySelectorAll('canvas').length===1;checks.noRuntimeErrors=a.errors.length===0;
  return {checks,errors:a.errors};
 });Object.assign(report.checks,controls.checks);report.controls=controls;
 const before=await p.evaluate(()=>v35Review.impacts.length);await record(p,false);await record(p,true);
 report.normal=await p.evaluate(()=>({audit:v35Review.audit(),fx:v35Review.effects.audit(),playback:v35Review.normalPlayback.slice(-12)}));
 report.checks.twelveNormalAttacksOneHit=report.normal.audit.impacts.length-before===12&&report.normal.playback.every(r=>r.last.damageApplications===1);
 report.checks.normalReturn=report.normal.audit.actors.every(a=>Math.hypot(a.root.x-a.base.x,a.root.y-a.base.y)<.01);
 const times=[];for(const speed of ['.25','2']){await p.selectOption('#speed',speed==='.25'?'0.25':speed);const t=Date.now();await p.evaluate(async()=>{await v35Review.attack(1,'attack_basic');});times.push(Date.now()-t);}
 report.speedMilliseconds=times;report.checks.sharedSpeed=times[0]/times[1]>6&&times[0]/times[1]<10;
 await p.close();
 for(const [kind,mobile] of [['whitecoat-enemy',false],['whitecoat',true]]){
  const page=await open(kind,mobile),label=mobile?'mobile':'enemy',samples=[];
  for(const action of ['attack_basic','skill_iai']){await start(page,action);const s=await seek(page,action==='attack_basic'?.40:.51);samples.push(s);await page.screenshot({path:dir+label+'-'+action+'.png'});await cancel(page);}
  const errors=samples.flatMap(v=>v.fx.active.trail.strokes.map(s=>s.bladeAnchorError).filter(n=>n!==null));
  report.checks[label+'BladeAnchors']=errors.length===2&&errors.every(n=>n<.002);
  report[label]={samples,errors:await page.evaluate(()=>v35Review.errors)};report.checks[label+'NoErrors']=report[label].errors.length===0;await page.close();
 }
 const panels=[];for(const [i,file] of ['attack_basic-320.png','attack_basic-400.png','skill_iai-300.png','skill_iai-510.png'].entries()){
  const b=await sharp(dir+file).extract({left:695,top:420,width:380,height:245}).resize(760,490).png().toBuffer();panels.push({input:b,left:(i%2)*760,top:Math.floor(i/2)*530});
 }
 panels.push({input:Buffer.from('<svg width="1520" height="1060"><g fill="#edf4fa" font-family="Arial" font-size="24"><text x="15" y="518">Forward cut / 0.32s</text><text x="775" y="518">Follow-through / 0.40s</text><text x="15" y="1048">Quick draw / 0.30s</text><text x="775" y="1048">Rising cut / 0.51s</text></g></svg>'),left:0,top:0});
 await sharp({create:{width:1520,height:1060,channels:4,background:'#111c29'}}).composite(panels).png().toFile(dir+'trail-review.png');
 report.nativeSha256=createHash('sha256').update(await fs.readFile(hero+'whitecoat-c3ad326c9e61.spine')).digest('hex');
 report.checks.nativePreserved=report.nativeSha256==='a2e45365a8f830266d3b91c1e9c76dc35f0bf93409b69027300954977f7bbf57';
 report.passed=Object.values(report.checks).every(Boolean);
}catch(error){report.error=error.stack;report.passed=false;}
finally{await fs.writeFile(dir+'verification.json',JSON.stringify(report,null,2));console.log({checks:report.checks,passed:report.passed,error:report.error});await browser.close();if(!report.passed)process.exitCode=1;}
