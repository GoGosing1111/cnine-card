import {MODES} from '../motion.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function link(doc,id,blob,name){const a=doc.getElementById(id);if(a.dataset.blob)URL.revokeObjectURL(a.dataset.blob);const url=URL.createObjectURL(blob);a.href=url;a.dataset.blob=url;a.download=name;a.hidden=false;return url;}
export function attachReviewTools(review,doc){
 const $=id=>doc.getElementById(id),{fx,engine}=review;
 $('qa-run').onclick=async()=>{
  $('qa-run').disabled=true;review.queue.active=false;
  const report={version:'LEONEL_RUNTIME_QA_V2',viewport:{width:doc.documentElement.clientWidth,height:doc.defaultView.innerHeight,innerWidth:doc.defaultView.innerWidth,mobileMedia:doc.defaultView.matchMedia('(max-width:700px)').matches,frame:{width:window.innerWidth,height:window.innerHeight,mobileMedia:window.matchMedia('(max-width:760px)').matches,engineMobile:engine.mobile},canvas:engine.app.canvas.getBoundingClientRect().toJSON()},snapshots:[],speeds:[],errors:[],muted:localStorage.getItem('cnine_battle_sound')==='OFF'};
  try{
   fx.setEffects(false);fx.setAura(false);
   for(const mode of ['attack','skill','ultimate']){
    fx.setMode(mode);
    for(const at of MODES[mode].physicalContacts||MODES[mode].contacts){fx.seek(at);await delay(60);const s=fx.diagnostics();report.snapshots.push(s);if(!s.bladeContact.intersects)report.errors.push(mode+' '+at+' blade misses torso');if(s.groundError>1e-6)report.errors.push(mode+' ground offset');}
   }
   for(const speed of [.25,.5,1,2]){fx.setMode('ultimate');fx.setSpeed(speed);fx.seek(0);fx.play();await delay(320);fx.pause();const t=fx.time;await delay(100);report.speeds.push({speed,advance:t,pausedStable:t===fx.time});if(t<=0||t!==fx.time)report.errors.push('clock '+speed);}
   fx.setEffects(true);fx.setAura(true);fx.setMode('ultimate');fx.seek(2.65);report.peak=fx.diagnostics();
   fx.cutInState.shown=false;fx.setMode('ultimate');fx.seek(.55);report.cinematic=fx.diagnostics();if(!report.cinematic.cinematicVisible)report.errors.push('first awakening cut-in not visible');fx.setMode('ultimate');fx.seek(.55);report.repeatedCinematic=fx.screenLayer.visible;if(report.repeatedCinematic)report.errors.push('repeated cut-in');fx.cancel();report.stopped=fx.diagnostics();if(report.stopped.registeredTimelines||report.stopped.visibleEffects||report.stopped.visibleGhosts||report.stopped.cinematicVisible)report.errors.push('cancel cleanup');
   report.overflow=doc.documentElement.scrollWidth>doc.documentElement.clientWidth;if(report.overflow)report.errors.push('horizontal overflow');
   report.passed=!report.errors.length;fx.setSpeed(1);fx.setMode('idle');fx.seek(0);
  }catch(e){report.errors.push(e.message);report.passed=false;}
  $('qa-result').textContent=JSON.stringify(report,null,2);link(doc,'qa-download',new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),'leonel-runtime-'+report.viewport.width+'.json');$('qa-run').disabled=false;
 };
 $('record').onclick=async()=>{
  $('record').disabled=true;review.queue.active=false;$('record-status').textContent='실제 전장 재생을 녹화하고 있습니다';
  const previousComplete=fx.onComplete;let stream,recorder;
  try{
   fx.cutInState.shown=false;fx.setEffects(true);fx.setAura(true);fx.setSpeed(1);fx.setMode('idle');fx.play();
   stream=engine.app.canvas.captureStream(60);const chunks=[],type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
   recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:7000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();await delay(700);
   for(const mode of ['attack','dash','skill','ultimate']){fx.setMode(mode);await new Promise(resolve=>{fx.onComplete=resolve;fx.play();});await delay(180);}
   await delay(350);recorder.stop();await stopped;
   const blob=new Blob(chunks,{type});link(doc,'record-download',blob,'leonel-battle-review.webm');$('record-status').textContent='무음 전투 영상 준비 완료';
  }catch(e){$('record-status').textContent='녹화 실패: '+e.message;}finally{if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());fx.onComplete=previousComplete;fx.pause();$('record').disabled=false;}
 };
}
