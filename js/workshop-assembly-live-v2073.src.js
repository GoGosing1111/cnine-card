import {liveAssemblyReceipt} from '../preview/workshop-assembly-v1/source/live-contract.mjs';
import {MODELS} from '../preview/workshop-assembly-v1/source/models.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>Number(value||0).toLocaleString('ko-KR');
function imageUrl(value){
  const raw=String(value||'').replace(/\\/g,'/');
  if(!raw)return '';
  try{const url=new URL(raw,location.origin+'/');return /^https?:$/.test(url.protocol)?url.href:'';}catch{return '';}
}

// Lightweight UI first; the shared Pixi/GSAP runtime is loaded only AFTER a
// server receipt exists. Replaying/skipping this dialog never calls the API.
export function createWorkshopAssemblyPresenter({loadFilm=async()=>{
  await window.ensureFeatureResources('workshopAssemblyFx');
  return window.WorkshopAssemblyFilm;
},loadTimeout=12000}={}){
  let active=null,last=null;
  function cancel(){active?.finish(false);}
  function play({data,recipe,isActive=()=>true}){
    const receipt=liveAssemblyReceipt(data,recipe);
    if(!receipt?.model||!isActive())return Promise.resolve(false);
    cancel();
    return new Promise(resolve=>{
      const model=MODELS[receipt.model],previousFocus=document.activeElement;
      const root=document.createElement('div');root.className='ws-assembly-overlay';
      root.dataset.model=receipt.model;root.style.setProperty('--assembly-accent',model.css);
      root.innerHTML=`<section class="ws-assembly-panel" role="dialog" aria-modal="true" aria-labelledby="ws-assembly-title" tabindex="-1">
        <header class="ws-assembly-header"><div><small>MASTER WORKS / ${receipt.mode==='suit'?'EXOSUIT':'AUTOMOTIVE'}</small><h2 id="ws-assembly-title">${receipt.mode==='suit'?'배틀슈트 조립':'차량 제작'}</h2></div><button type="button" data-action="close" aria-label="제작 연출 닫기">닫기 <span aria-hidden="true">×</span></button></header>
        <div class="ws-assembly-stage">
          <div class="ws-assembly-canvas"></div><div class="ws-assembly-vignette"></div>
          <div class="ws-assembly-line"><span>${esc(model.line)}</span><span data-status>리소스 준비 중</span></div>
          <div class="ws-assembly-phase" aria-live="polite"><small data-phase-en>ASSEMBLY STANDBY</small><h3 data-phase>조립 설비를 준비합니다</h3></div>
          <div class="ws-assembly-loading"><i></i><span>제작 결과가 저장되었습니다.<br>조립 연출을 준비하고 있습니다.</span></div>
          <div class="ws-assembly-complete" hidden><small data-result-en></small><h3 data-result-title></h3><strong>${esc(receipt.name)}</strong><p data-result-note></p></div>
          <div class="ws-assembly-progress" role="progressbar" aria-label="제작 연출 진행도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
        </div>
        <footer class="ws-assembly-footer"><div class="ws-assembly-receipt"><strong>${esc(receipt.name)}</strong><span>${receipt.coinSpent?`코인 ${fmt(receipt.coinSpent)} 사용`:''}${receipt.coinSpent&&receipt.masterStarSpent?' · ':''}${receipt.masterStarSpent?`마스터의 별 ${fmt(receipt.masterStarSpent)}개 사용`:''}</span><small>${receipt.replayed?'이전 요청의 확정 결과입니다. 추가로 소모되지 않습니다.':'연출을 닫아도 확정된 제작 결과는 유지됩니다.'}</small></div>
          <div class="ws-assembly-controls"><button type="button" data-action="sound" disabled aria-pressed="false">사운드 OFF</button><button type="button" data-action="pause" disabled>일시정지</button><button type="button" data-action="skip" class="ws-assembly-primary">건너뛰고 결과 보기</button><button type="button" data-action="done" class="ws-assembly-primary" hidden>확인</button></div>
        </footer></section>`;
      document.body.append(root);
      const $=selector=>root.querySelector(selector),panel=$('.ws-assembly-panel');
      const state={root,film:null,ready:false,closed:false,resultVisible:false,finish:null,timer:null,poll:null,observer:null,phase:'',soundBusy:false};
      const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
      active=state;
      const valid=()=>!state.closed&&root.isConnected&&isActive();
      function disposeFilm(){
        if(!state.film)return;
        try{state.film.destroy();}catch(error){console.warn('Workshop assembly cleanup:',error);}
        state.film=null;state.ready=false;
      }
      function finish(shown=true){
        if(state.closed)return;state.closed=true;
        clearTimeout(state.timer);clearInterval(state.poll);state.observer?.disconnect();
        window.removeEventListener('cnine:route-will-change',onLeave);window.removeEventListener('pagehide',onLeave);
        document.removeEventListener('keydown',onKey,{capture:true});
        disposeFilm();root.remove();if(active===state)active=null;
        if(document.body.style.overflow==='hidden')document.body.style.overflow=previousOverflow;
        last={model:receipt.model,success:receipt.result.success,closed:true,activeTimelines:0};
        if(shown&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
        resolve(true); // Canceled presentation is handled; do not reopen a fallback.
      }
      state.finish=finish;
      function revealResult(staticOnly=false){
        if(!valid()){finish(false);return;}
        clearTimeout(state.timer);
        if(state.resultVisible)return;
        state.resultVisible=true;root.dataset.state=staticOnly?'fallback':'complete';
        root.classList.toggle('is-failure',!receipt.result.success);
        $('.ws-assembly-loading').hidden=true;$('.ws-assembly-phase').hidden=true;
        $('.ws-assembly-complete').hidden=false;
        $('[data-result-en]').textContent=receipt.result.success?'ASSEMBLY COMPLETE':'ASSEMBLY FAILED';
        $('[data-result-title]').textContent=receipt.result.success?'제작 성공':'제작 실패';
        $('[data-result-note]').textContent=receipt.result.success
          ?(receipt.mode==='suit'?'완성된 배틀슈트가 장비창에 지급되었습니다.':'완성된 차량이 차고에 지급되었습니다.')
          :'제작 판정에 실패했습니다. 투입한 재료와 재화는 반환되지 않습니다.';
        $('[data-status]').textContent=staticOnly?'저장된 결과 확인':'조립 시퀀스 완료';
        $('[data-action="skip"]').hidden=true;$('[data-action="done"]').hidden=false;$('[data-action="pause"]').disabled=true;
        $('.ws-assembly-progress').setAttribute('aria-valuenow','100');$('.ws-assembly-progress i').style.width='100%';
        if(staticOnly){
          disposeFilm();$('[data-action="sound"]').disabled=true;
          const src=imageUrl(receipt.image);
          if(src){const img=document.createElement('img');img.className='ws-assembly-still';img.src=src;img.alt=receipt.name;$('.ws-assembly-canvas').replaceChildren(img);}
        }
      }
      function skip(){
        try{if(state.ready){state.film.skip();revealResult();}else revealResult(true);}catch{revealResult(true);}
      }
      function onLeave(){finish(false);}
      function onKey(event){
        if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();state.resultVisible?finish():skip();return;}
        if(event.key!=='Tab')return;
        const focusable=[...root.querySelectorAll('button:not([disabled]):not([hidden])')];
        const first=focusable[0],end=focusable.at(-1);
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel)){event.preventDefault();end?.focus();}
        else if(!event.shiftKey&&(document.activeElement===end||!root.contains(document.activeElement))){event.preventDefault();first?.focus();}
      }
      function update(d){
        if(!valid()){finish(false);return;}
        if(state.resultVisible)return;
        root.dataset.state=d.playing?'playing':'paused';
        if(state.phase!==d.phase[0]){state.phase=d.phase[0];$('[data-phase]').textContent=d.phase[0];$('[data-phase-en]').textContent=d.phase[1];}
        $('[data-status]').textContent=d.playing?'조립 진행 중':'일시정지';
        $('[data-action="pause"]').textContent=d.playing?'일시정지':'계속 재생';
        $('.ws-assembly-progress i').style.width=`${d.progress*100}%`;
        $('.ws-assembly-progress').setAttribute('aria-valuenow',String(Math.round(d.progress*100)));
        if(d.finished)revealResult();
      }
      $('[data-action="close"]').onclick=()=>finish();$('[data-action="done"]').onclick=()=>finish();
      $('[data-action="skip"]').onclick=skip;
      $('[data-action="pause"]').onclick=()=>{if(!state.ready)return;state.film.diagnostics().playing?state.film.pause():state.film.resume();};
      $('[data-action="sound"]').onclick=async()=>{
        if(!state.ready||state.soundBusy)return;
        state.soundBusy=true;
        try{const enabled=await state.film.setSound(!state.film.audio.enabled);
          if(!valid())return;$('[data-action="sound"]').textContent=enabled?'사운드 ON':'사운드 OFF';$('[data-action="sound"]').setAttribute('aria-pressed',String(enabled));
        }catch{if(valid())$('[data-action="sound"]').title='효과음을 사용할 수 없습니다. 영상은 정상 재생됩니다.';}
        finally{state.soundBusy=false;}
      };
      window.addEventListener('cnine:route-will-change',onLeave);window.addEventListener('pagehide',onLeave);
      document.addEventListener('keydown',onKey,{capture:true});
      state.poll=setInterval(()=>{if(!valid())finish(false);},250);
      state.observer=new MutationObserver(()=>{if(!root.isConnected)finish(false);});state.observer.observe(document.body,{childList:true});
      panel.focus({preventScroll:true});
      // Reduced-motion users get the saved result without downloading a GPU film.
      if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){revealResult(true);return;}
      state.timer=setTimeout(()=>revealResult(true),loadTimeout);
      (async()=>{
        try{
          const Film=await loadFilm();
          if(!valid()||state.resultVisible)return;
          state.film=new Film($('.ws-assembly-canvas'),update);
          const film=state.film;await film.init(receipt.model);
          if(!valid()||state.resultVisible){film.destroy();return;}
          film.app?.canvas?.addEventListener('webglcontextlost',()=>revealResult(true),{once:true});
          clearTimeout(state.timer);
          film.prepare(receipt.mode,receipt.result,receipt.model);state.ready=true;
          $('.ws-assembly-loading').hidden=true;$('[data-action="sound"]').disabled=false;$('[data-action="pause"]').disabled=false;
          film.play();
        }catch(error){
          console.warn('Workshop film unavailable; showing saved receipt.',error);
          if(valid())revealResult(true);
        }
      })();
    });
  }
  return Object.freeze({play,cancel,diagnostics:()=>active?{model:active.root.dataset.model,state:active.root.dataset.state,ready:active.ready,...active.film?.diagnostics()}:last||{activeTimelines:0}});
}
globalThis.WorkshopAssemblyLive=createWorkshopAssemblyPresenter();
