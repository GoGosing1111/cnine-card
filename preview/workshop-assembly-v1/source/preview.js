import {AssemblyFilm} from './AssemblyFilm.js';
import {MODES,DURATION,previewResult} from './contract.mjs';
import {MODELS,MODEL_ORDER,DEFAULT_MODEL,resolveModel,modelPhases} from './models.mjs';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
let mode=params.get('mode')==='vehicle'?'vehicle':'suit',film;
const selected={...DEFAULT_MODEL};selected[mode]=resolveModel(mode,params.get('item'));
let phases=MODES[mode].phases;
let lastPhase='',lastComplete=false;
const elements={phase:$('phase'),phaseEn:$('phase-en'),progress:$('progress-fill'),progressTrack:$('progress-track'),pause:$('pause'),play:$('play'),seek:$('seek'),time:$('time'),completion:$('completion'),status:$('status'),diagnostic:$('diagnostic')};
function render(d){
  const config=MODELS[d.model];
  if(d.phase[0]!==lastPhase){elements.phase.textContent=d.phase[0];elements.phaseEn.textContent=d.phase[1];lastPhase=d.phase[0];}
  elements.progress.style.width=`${d.progress*100}%`;elements.progressTrack.setAttribute('aria-valuenow',Math.round(d.progress*100));
  elements.seek.value=d.time;elements.time.textContent=`${d.time.toFixed(2)} / ${DURATION.toFixed(2)}s`;
  elements.pause.textContent=d.playing?'일시정지':'계속 재생';elements.pause.disabled=d.finished||d.time===0||d.reducedMotion;
  $('skip').disabled=d.finished||d.time===0;
  elements.play.querySelector('span').textContent=d.time>0?'처음부터 다시 보기':'조립 시퀀스 시작';
  elements.status.textContent=d.finished?'시퀀스 종료':d.playing?'조립 진행 중':d.time>0?'프레임 확인 중':'준비 완료';
  elements.completion.hidden=!d.complete;$('stage-title').hidden=d.complete;$('part-callout').hidden=d.complete;
  $('stage').classList.toggle('is-failure',!d.success&&d.time>=10.3);
  if(d.complete!==lastComplete||d.complete){
    $('completion-en').textContent=d.success?(d.mode==='suit'?'ASSEMBLY COMPLETE':'READY TO ROLL'):'ASSEMBLY FAILED';
    $('completion-title').textContent=d.success?(d.mode==='suit'?'배틀슈트 제작 성공':'차량 제작 성공'):'제작 실패';
    $('completion-item').textContent=d.success?config.name:`${config.name} · 최종 품질 검사 불합격`;
    $('completion-note').textContent='검수용 연출입니다. 실제 재화는 사용되지 않습니다.';lastComplete=d.complete;
  }
  const i=Math.max(0,phases.findLastIndex(p=>p[0]<=d.time));$('part-index').textContent=`${String(i+1).padStart(2,'0')} / ${String(phases.length).padStart(2,'0')}`;$('part-label').textContent=phases[i][2];
  [...$('phase-rail').children].forEach((el,j)=>{el.classList.toggle('active',j===i);el.classList.toggle('done',j<i);});
  elements.diagnostic.textContent=`PixiJS 8.20.0 + GSAP 3.13.0 · 타임라인 ${d.activeTimelines} · 별도 Pixi ticker ${d.pixiTickerRunning?'ON':'OFF'} · 실제 제작 API 호출 ${d.apiMutations}`;
  elements.diagnostic.dataset.state=JSON.stringify(d);
}
function select(next,item=selected[next]){
  mode=next;selected[mode]=resolveModel(mode,item);lastPhase='';const key=selected[mode],c=MODELS[key];
  phases=modelPhases(mode,key,MODES[mode].phases);
  document.querySelectorAll('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.mode===mode));
  document.documentElement.style.setProperty('--accent',c.css);
  $('line-code').textContent=c.line;$('item-name').textContent=c.name;$('item-description').textContent=c.description;
  $('phase-detail').textContent=mode==='suit'?'부품 결합 → 장갑 장착 → 코어 점화':key==='ignis'?'차체 · 휠 결합 → 상부 터빈 장착 → 부스터 점화':'프레임 → 엔진 · 휠 → 차체 결합 → 시동';
  $('model-label').textContent=mode==='suit'?'슈트 모델 선택':'차량 모델 선택';
  $('model-selector').replaceChildren(...MODEL_ORDER[mode].map(id=>{
    const m=MODELS[id],b=document.createElement('button'),img=document.createElement('img'),copy=document.createElement('span'),title=document.createElement('strong'),tag=document.createElement('small');
    b.type='button';b.dataset.model=id;b.setAttribute('aria-pressed',String(id===key));img.src=m.source;img.alt='';img.loading='lazy';
    title.textContent=m.name;tag.textContent=id==='veneno'?'기존 샘플':'SUCCESS / FAILURE';copy.append(title,tag);b.append(img,copy);b.addEventListener('click',()=>select(mode,id));return b;
  }));
  $('phase-rail').replaceChildren(...phases.map((p,i)=>{const el=document.createElement('div');el.className='rail-step';const num=document.createElement('b');num.textContent=String(i+1).padStart(2,'0');el.append(num,document.createTextNode(p[1]));return el;}));
  film.prepare(mode,previewResult($('outcome').value==='success'),key);
  if(film.reducedMotion)film.skip();
}
async function boot(){
  film=new AssemblyFilm($('canvas-host'),render);await film.init();
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');$('reduce-motion').checked=motionQuery.matches;
  film.reducedMotion=motionQuery.matches;
  if(params.get('result')==='failure')$('outcome').value='failure';
  select(mode);$('loading').hidden=true;elements.play.disabled=false;
  document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>select(el.dataset.mode)));
  elements.play.addEventListener('click',()=>film.play());
  elements.pause.addEventListener('click',()=>film.diagnostics().playing?film.pause():film.resume());
  $('skip').addEventListener('click',()=>film.skip());
  $('outcome').addEventListener('change',()=>select(mode));$('speed').addEventListener('change',()=>film.setRate($('speed').value));
  $('reduce-motion').addEventListener('change',()=>film.setReducedMotion($('reduce-motion').checked));
  $('sound').addEventListener('click',async()=>{const enabled=await film.setSound(!film.audio.enabled);$('sound').textContent=enabled?'사운드 ON':'사운드 OFF';$('sound').setAttribute('aria-pressed',enabled);if(film.audio.error)$('sound').title='효과음 로드 실패 · 영상 연출은 정상 재생됩니다.';});
  elements.seek.addEventListener('input',()=>film.seek(elements.seek.value));
  $('mobile').addEventListener('click',()=>{$('lab').classList.toggle('mobile-preview');$('mobile').textContent=$('lab').classList.contains('mobile-preview')?'데스크톱 보기':'모바일 보기';});
  document.addEventListener('keydown',e=>{if(e.code==='Escape')film.skip();});
  window.addEventListener('pagehide',e=>{if(e.persisted)film.pause();else film.destroy();});
  globalThis.WorkshopAssemblyPreview=Object.freeze({diagnostics:()=>film.diagnostics(),seek:t=>film.seek(t),selectMode:select,selectModel:key=>select(MODELS[key].mode,key),play:()=>film.play(),pause:()=>film.pause(),skip:()=>film.skip(),destroy:()=>film.destroy()});
  if(params.has('t'))film.seek(Number(params.get('t')));else if(params.has('play'))film.play();
}
boot().catch(e=>{$('loading').replaceChildren(Object.assign(document.createElement('strong'),{textContent:'제작 연출을 불러오지 못했습니다.'}),Object.assign(document.createElement('p'),{textContent:e.message}));console.error(e);});
