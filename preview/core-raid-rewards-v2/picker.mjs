import {ReliquaryStage} from './reliquary-stage.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=value=>Number(value||0).toLocaleString('ko-KR');
const money=value=>Number(value)>=100000000&&Number(value)%100000000===0?count(value/100000000)+'억':count(value);
const asset=value=>/^\/?assets\/[\w./% -]+$/.test(String(value||''))&&!String(value).includes('..')?'/'+String(value).replace(/^\//,''):'';
const types={MERCENARY:'용병 계약',EQUIPMENT:'장비',MASTER_STAR:'성장 재료',COIN:'재화',INVENTORY_ITEM:'아이템 · 재료',MAGIC_CRYSTAL:'강화 재료',CARD_SHARDS:'카드 조각'};

// This is an isolated visual review. The injected claim remains the sole source
// of the selected result; animation and sample controls never call a game API.
export function showCoreRewardPickerV2({offer,claim,speed=1}){
  return new Promise(resolve=>{
    const previous=document.activeElement,dialog=document.createElement('dialog');
    dialog.className='reliquary';dialog.setAttribute('aria-labelledby','reliquary-title');dialog.tabIndex=-1;
    let closed=false,loading=true,pending=false,selected=offer.selectedIndex??null,paid=offer.result||null,stage,rewardTween,claimTimer,loadTimer,generation=0;
    const base=offer.baseReward||paid?.reward||{};
    dialog.innerHTML=`<div class="reliquary-scene"><div class="reliquary-backdrop" aria-hidden="true"></div><div class="reliquary-shade" aria-hidden="true"></div><div class="reliquary-canvas"></div><div class="reliquary-topline"><span>붕괴 코어 <i></i> 클리어 보상</span><span class="reliquary-review">연출 미리보기</span></div><div class="reliquary-tools"><button class="reliquary-sound" type="button" aria-pressed="true" aria-label="효과음 끄기">소리 켬</button><button class="reliquary-close" type="button" aria-label="미리보기 닫기">×</button></div><header class="reliquary-heading"><p class="reliquary-eyebrow">CORE PROTOCOL · VICTORY</p><h1 id="reliquary-title">봉인된 전리품</h1><p class="reliquary-lead">당신의 승리에 응답할, 단 하나의 봉인.</p><div class="reliquary-rule" aria-hidden="true"><span></span><i></i><span></span></div></header><div class="reliquary-choices">${[0,1,2].map(i=>`<button class="reliquary-choice" data-slot="${i}" type="button" disabled aria-label="${i+1}번 봉인 선택"><span class="reliquary-label"><small>봉인 0${i+1}</small><b>선택하기</b><i aria-hidden="true"></i></span></button>`).join('')}</div><div class="reliquary-instruction"><span class="reliquary-step">01 — SELECT</span><p>세 개의 보관함 중 하나를 선택하세요.</p></div><section class="reliquary-result" aria-live="polite" hidden></section><div class="reliquary-status" role="status"><span>봉인 보관함을 불러오는 중…</span><button class="reliquary-retry" type="button" hidden>다시 불러오기</button></div><footer class="reliquary-footer"><div class="reliquary-base"><span>기본 클리어 보상</span><b>${money(base.coin)} <small>코인</small></b></div><div class="reliquary-guarantee"><span>추가 보상 1개</span><b>모든 봉인에 보상이 있습니다</b></div><p class="reliquary-sample-note">시연 화면 · 실제 보상은 지급되지 않습니다</p></footer></div>`;
    document.body.append(dialog);dialog.showModal();
    const q=selector=>dialog.querySelector(selector),buttons=[...dialog.querySelectorAll('[data-slot]')];
    function finish(){
      if(closed)return;closed=true;generation++;clearTimeout(claimTimer);clearTimeout(loadTimer);stage?.destroy();rewardTween?.kill();
      document.removeEventListener('visibilitychange',visibility);dialog.close();dialog.remove();previous?.focus?.();resolve(paid);
    }
    function status(message,retryLabel=''){
      q('.reliquary-status span').textContent=message;q('.reliquary-retry').hidden=!retryLabel;
      if(retryLabel)q('.reliquary-retry').textContent=retryLabel;
    }
    function phase(name){
      if(closed)return;
      if(name==='UNLOCK'){q('.reliquary-step').textContent='02 — UNSEAL';q('.reliquary-instruction p').textContent='봉인이 해제됩니다';}
      if(name==='REVEAL'){q('.reliquary-step').textContent='03 — REVEAL';q('.reliquary-instruction p').textContent='';}
    }
    function reveal(){
      if(closed||!paid||dialog.classList.contains('is-revealed'))return;
      const reward=paid.choiceReward||{},portrait=reward.rewardType==='MERCENARY';
      const image=asset(reward.image)||(reward.rewardType==='COIN'?'/assets/ui/events/golden-axe-v1/coin.svg':reward.rewardType==='MASTER_STAR'?new URL('./assets/master-star.svg',import.meta.url).href:'');
      dialog.classList.add('is-revealed');dialog.classList.toggle('has-portrait',portrait);
      const panel=q('.reliquary-result');
      panel.innerHTML=`<div class="reliquary-prize-art ${portrait?'is-portrait':'is-item'}"><div class="reliquary-prize-aura"></div>${image?`<img class="reliquary-prize-image" src="${esc(image)}" alt="${esc(reward.name)}">`:'<span class="reliquary-prize-placeholder">획득</span>'}${portrait?'<img class="reliquary-prize-frame" src="/assets/ui/card-frames/mercenary-contract-frame-premium-v2.png" alt="">':''}<div class="reliquary-prize-glint"></div>${portrait?`<span class="reliquary-card-rank">${esc(reward.rarity||'')}</span>`:''}</div><div class="reliquary-prize-copy"><span class="reliquary-acquired">봉인 해제 완료</span><p class="reliquary-prize-kind">${esc(types[reward.rewardType]||'추가 보상')}${reward.rarity?' <i>·</i> '+esc(reward.rarity):''}</p><h2>${esc(reward.name||'클리어 보상')}</h2><p class="reliquary-quantity">${reward.rewardType==='COIN'?money(reward.quantity):count(reward.quantity)}<span>${reward.rewardType==='COIN'?' 코인':portrait?' 장':' 개'}</span></p><p class="reliquary-prize-note">${portrait?'깨어난 힘이 새로운 전투를 기다립니다.':'다음 도전을 위한 전리품을 회수했습니다.'}</p><button class="reliquary-done" type="button">다시 보기 <span aria-hidden="true">↻</span></button></div>`;
      panel.hidden=false;panel.querySelector('.reliquary-done').onclick=finish;status('');
      const gsap=stage.gsap,reduced=stage.reduced;
      rewardTween=gsap.timeline({onComplete:()=>{if(!closed)panel.querySelector('.reliquary-done').focus({preventScroll:true});}});
      rewardTween.fromTo(panel.querySelector('.reliquary-prize-art'),{opacity:0,y:90,scale:.72,rotationY:-14},{opacity:1,y:0,scale:1,rotationY:0,duration:reduced?.01:1.05,ease:'power3.out'},0)
        .fromTo(panel.querySelectorAll('.reliquary-prize-copy > *'),{opacity:0,y:15},{opacity:1,y:0,duration:reduced?.01:.7,stagger:reduced?0:.075,ease:'power2.out'},reduced?0:.25)
        .fromTo(panel.querySelector('.reliquary-prize-glint'),{xPercent:-180},{xPercent:210,duration:reduced?.01:1.1,ease:'power2.inOut'},reduced?0:.3);
      rewardTween.timeScale(speed);
    }
    async function choose(index){
      if(loading||pending||paid||closed)return;
      selected=index;pending=true;buttons.forEach(button=>button.disabled=true);dialog.classList.add('is-selected');status('');
      const focus=stage.selected===null?stage.select(index):Promise.resolve();
      try{
        const result=await Promise.race([claim({offerId:offer.offerId,selectedIndex:index,requestId:offer.offerId+'-CLAIM'}),new Promise((_,reject)=>{claimTimer=setTimeout(()=>reject(Error('결과 확인이 늦어지고 있습니다. 선택한 봉인을 다시 확인하세요.')),15000);})]);
        clearTimeout(claimTimer);if(closed)return;
        if(!result?.choiceReward)throw Error('보상 결과를 확인하지 못했습니다.');
        paid=result;await focus;if(closed)return;await stage.reveal();
      }catch(error){if(!closed)status(error.message||'보상을 확인하지 못했습니다.','선택한 봉인 다시 확인');}
      finally{clearTimeout(claimTimer);pending=false;}
    }
    async function load(){
      const attempt=++generation;loading=true;status('봉인 보관함을 불러오는 중…');stage?.destroy();
      dialog.classList.remove('is-ready');
      const current=new ReliquaryStage(q('.reliquary-canvas'),{speed,onPhase:phase,onReveal:reveal,onLayout:positions=>{
        positions.forEach((p,i)=>Object.assign(buttons[i].style,{left:(p.x-p.width*.52)+'px',top:(p.y-p.height)+'px',width:p.width*1.04+'px',height:(p.height+(innerWidth<650&&innerHeight<700?52:68))+'px'}));
      }});stage=current;
      try{
        await Promise.race([current.init(),new Promise((_,reject)=>{loadTimer=setTimeout(()=>reject(Error('보관함을 불러오지 못했습니다. 다시 시도해 주세요.')),12000);})]);
        clearTimeout(loadTimer);if(closed||attempt!==generation)return;loading=false;status('');dialog.classList.add('is-ready');
        if(paid){dialog.classList.add('is-selected');stage.showSettled(paid.selectedIndex??selected??1);}
        else if(selected!==null){dialog.classList.add('is-selected');await stage.select(selected);status('이전에 선택한 봉인이 보존되어 있습니다.','선택한 봉인 다시 확인');}
        else{buttons.forEach(button=>button.disabled=false);dialog.focus({preventScroll:true});}
      }catch(error){clearTimeout(loadTimer);if(!closed&&attempt===generation){current.destroy();status(error.message||'보관함을 불러오지 못했습니다.','다시 불러오기');}}
    }
    buttons.forEach((button,index)=>{
      button.onclick=()=>void choose(index);button.onpointerenter=()=>stage?.hover(index,true);button.onpointerleave=()=>stage?.hover(index,false);
      button.onfocus=()=>stage?.hover(index,true);button.onblur=()=>stage?.hover(index,false);
    });
    q('.reliquary-retry').onclick=()=>loading?void load():void choose(selected);
    q('.reliquary-close').onclick=finish;
    q('.reliquary-sound').onclick=()=>{const enabled=stage?.mute();q('.reliquary-sound').setAttribute('aria-pressed',String(enabled));q('.reliquary-sound').setAttribute('aria-label',enabled?'효과음 끄기':'효과음 켜기');q('.reliquary-sound').textContent=enabled?'소리 켬':'소리 끔';};
    const visibility=()=>{if(document.hidden)rewardTween?.pause();else rewardTween?.resume();};document.addEventListener('visibilitychange',visibility);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});void load();
  });
}
