import {buildHyperPreview,HYPER_PREVIEW_LABELS} from '/js/hyper-pack-preview-model-v2076.js';
const $=id=>document.getElementById(id);let results=[],fx=null,ready=false;
function renderSlots(){
  $('results').replaceChildren(...results.map((result,index)=>{const li=document.createElement('li');li.dataset.index=String(index+1).padStart(2,'0');const image=new Image();image.src='/assets/ui/packs/hyper-pack-v2076.png';image.alt='미공개';li.append(image);return li;}));$('resultCount').textContent='0';
}
function reveal(index){
  const result=results[index],li=$('results').children[index];if(!li||li.classList.contains('revealed'))return;
  li.className=`revealed ${result.kind}`;li.replaceChildren();
  if(result.kind==='MERCENARY'||result.kind==='MYSTIC_ENERGY'){const image=new Image();image.alt=HYPER_PREVIEW_LABELS[result.kind];image.src=result.kind==='MERCENARY'?'/assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png':'/assets/items/starlight-armor-core-v1749.png';li.append(image);}
  else{const icon=document.createElement('span');icon.className='symbol';icon.textContent=result.kind==='MISS'?'—':'★';li.append(icon);}
  const label=document.createElement('b');label.textContent=HYPER_PREVIEW_LABELS[result.kind];const hint=document.createElement('em');hint.textContent='미리보기';li.append(label,hint);
  $('resultCount').textContent=String($('results').querySelectorAll('.revealed').length);
}
function state(event){
  if(event.state==='ready'){ready=true;$('phase').textContent='봉인 대기';}
  if(event.state==='playing'){$('phase').textContent='봉인 해제 · 순차 공개';$('pause').textContent='일시정지';}
  if(event.state==='paused'){$('phase').textContent='일시정지';$('pause').textContent='계속 재생';}
  if(event.state==='revealed'){reveal(event.index);$('progress').textContent=`${String(event.index+1).padStart(2,'0')} / ${String(results.length).padStart(2,'0')}`;$('phase').textContent=HYPER_PREVIEW_LABELS[event.result.kind]+' · 미리보기';}
  if(event.state==='complete'){results.forEach((_,i)=>reveal(i));$('progress').textContent=`${results.length} / ${results.length}`;$('phase').textContent='전체 결과 공개 완료';}
  const running=fx?.running===true;
  $('openOne').disabled=$('openTen').disabled=!ready||running;$('scenario').disabled=running;$('pause').disabled=$('skip').disabled=!running;
}
async function play(count){
  if(!ready||fx.running)return;results=buildHyperPreview(count,$('scenario').value);renderSlots();$('progress').textContent=`00 / ${String(count).padStart(2,'0')}`;
  if(innerWidth<680)$('hyperStage').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  try{await fx.play(results);}catch(error){$('stageError').textContent=error.message;}
}
async function init(){
  try{fx=globalThis.HyperPackFX.create($('hyperStage'),state);await fx.init();}
  catch(error){$('stageError').textContent='연출 리소스를 불러오지 못했습니다. 새로고침해주세요. '+error.message;}
}
$('openOne').onclick=()=>play(1);$('openTen').onclick=()=>play(10);$('pause').onclick=()=>fx?.pause();$('skip').onclick=()=>fx?.skip();
$('speed').onclick=()=>{const fast=$('speed').getAttribute('aria-pressed')!=='true';$('speed').setAttribute('aria-pressed',String(fast));$('speed').textContent=fast?'속도 ×2':'속도 ×1';fx?.setSpeed(fast?2:1);};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&fx?.running&&!fx.paused)fx.pause();});
window.addEventListener('pagehide',()=>fx?.destroy(),{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
// Defer bundles and module execution are not ordered relative to each other.
if(document.readyState==='complete')void init();else window.addEventListener('load',()=>void init(),{once:true});
