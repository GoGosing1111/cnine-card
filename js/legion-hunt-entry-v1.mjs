import {jointAccountRequest} from './joint-account-transport.mjs';
import {equipmentEffectText} from '../shared/equipment-growth-text-v1.mjs';

const art='/preview/sustained-hunt-v2/assets/';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imagePath=value=>{
  const path=String(value||'').trim().replace(/^\//,'');
  if(/^https:\/\//i.test(path)){try{return new URL(path).href;}catch{return '';}}
  if(!/^(assets|preview)\//.test(path)||path.includes('..'))return '';
  return '/'+path;
};
const power=value=>Math.round(Number(value)||0).toLocaleString('ko-KR');
export function createHuntEntry({request=jointAccountRequest,render,enter,dispose}){
  let state={phase:'loading',difficulty:'normal',regionId:undefined,data:null,error:''},revision=0;
  const difficulties=()=>state.regionId?state.data?.regionExpansion?.difficulties:state.data?.difficulties;
  const update=next=>{state={...state,...next};render(state);};
  return {
    get state(){return state;},
    async refresh(priorRecovery=null){
      const token=++revision;update({phase:'loading',data:null,error:''});
      try{
        const recovered=await request('legion-hunt/recover',{method:'POST',body:{}});
        if(token!==revision)return;
        const data=await request('legion-hunt/bootstrap');
        if(token===revision){
          const regions=data.regionExpansion?.regions||[];
          const regionId=state.regionId===undefined?regions[0]?.id||null:state.regionId&&regions.some(r=>r.id===state.regionId)?state.regionId:null;
          update({phase:'lobby',regionId,difficulty:regionId||state.difficulty!=='calamity'?state.difficulty:'normal',data:{...data,recovery:recovered?.recovery||priorRecovery},error:data.loadoutError||''});
        }
      }
      catch(error){if(token===revision)update({phase:'lobby',error:error.message});}
    },
    select(id){if(state.phase==='lobby'&&difficulties()?.some(d=>d.id===id))update({difficulty:id});},
    selectRegion(id){if(state.phase==='lobby'&&(id===null||state.data?.regionExpansion?.regions.some(r=>r.id===id)))update({regionId:id,difficulty:!id&&state.difficulty==='calamity'?'normal':state.difficulty});},
    enter(){
      if(state.phase!=='lobby'||!state.data?.loadout||state.error||(!state.data.entries?.unlimited&&state.data.entries?.remaining===0))return;
      update({phase:'battle'});enter(state.difficulty,state.regionId);
    },
    close(){++revision;state={...state,phase:'closed'};dispose();}
  };
}

let active=null;
export function openLegionHunt(button){
  if(active)return;
  const dialog=document.createElement('dialog');dialog.className='legion-hunt-portal';dialog.setAttribute('aria-label','군단토벌 입장');
  dialog.innerHTML=`<header class="legion-portal-bar"><div class="legion-brand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M8 6v12l8-6Z"/></svg><span>숲켓몬<small>SOOPKETMON</small></span></div><nav class="legion-breadcrumb" aria-label="현재 위치"><span>모험</span><i aria-hidden="true">/</i><b>군단토벌</b></nav><button type="button" data-hunt-close><span aria-hidden="true">←</span> PVE로 돌아가기</button></header>
    <div class="legion-lobby"><div class="legion-lobby-layout">
      <nav class="legion-regions" aria-label="토벌 지역 선택" hidden></nav>
      <section class="legion-intro" aria-labelledby="legion-island-title">
        <div class="legion-hero-halo" aria-hidden="true"></div><img class="legion-guardian" src="${art}monsters/ancient-forge-warden-boss-sd-v2.png" alt="섬의 최종 보스 태고의 수호자">
        <div class="legion-intro-copy"><p class="legion-kicker"><span></span> LEGION HUNT · CHAPTER 01</p><h1 id="legion-island-title">잊혀진 섬</h1><p class="legion-intro-text">길은 끊겼다.<br>돌아갈 방법은, 끝까지 돌파하는 것.</p>
        <div class="legion-facts"><span><b>15분</b> 연속 토벌</span><span><b>1</b> 최종 보스</span><span><b data-hunt-entry-limit>—</b> 하루 입장</span></div></div>
        <div class="legion-guardian-caption"><span>FINAL TARGET</span><strong>태고의 수호자</strong></div>
      </section>
      <nav class="legion-route" aria-label="토벌 진행 경로">
        <div><img src="${art}monsters/ember-mantis-sd-v2.png" alt=""><span><small>00:00 · 상륙</small><b>군단 조우</b></span></div>
        <div><img src="${art}monsters/mossback-tortoise-sd-v2.png" alt=""><span><small>05:00 · 교전</small><b>끊임없는 증원</b></span></div>
        <div><img src="${art}monsters/cobalt-bat-sd-v2.png" alt=""><span><small>10:00 · 돌파</small><b>끝까지 생존</b></span></div>
        <div><img src="${art}monsters/ancient-forge-warden-boss-sd-v2.png" alt=""><span><small data-hunt-boss-at>마지막 구간 · 최종 보스</small><b>태고의 수호자</b></span></div>
      </nav>
      <section class="legion-squad"><div class="legion-section-heading"><div><span>YOUR EXPEDITION</span><h2>출전 원정대</h2></div><button type="button" data-hunt-refresh>편성 새로고침 <span aria-hidden="true">↻</span></button></div>
        <p class="legion-account"></p><div class="legion-loadout"><div class="legion-cards" aria-label="저장된 일반 카드 5장"></div><div class="legion-mercenary" aria-label="용병 전용 슬롯"></div></div><p class="legion-equipment"></p>
      </section>
      <section class="legion-region-loot" hidden aria-label="지역 전용 전리품"></section>
      <aside class="legion-select"><div class="legion-section-heading"><div><span>SELECT DIFFICULTY</span><h2>난이도 선택</h2></div></div>
        <div class="legion-difficulties" role="group" aria-label="사냥 난이도"></div>
        <div class="legion-conditions"><span>토벌 진행 <strong class="legion-limit"></strong></span><span>오늘 입장 <b class="legion-entries"></b></span></div>
        <div class="legion-drop-guide"><div class="legion-pickup-symbol" aria-hidden="true"><i></i><svg viewBox="0 0 32 40"><path d="M6 2v28l7-7 7 12 5-3-7-12h11z"/></svg></div><div><b>전리품은 직접 눌러 획득</b><p>필드에 나타난 아이템을<br>사라지기 전에 챙기세요.</p></div></div>
        <button class="legion-poster-link" data-hunt-poster type="button"><img src="${art}posters/legion-hunt-forgotten-island-v3.png" alt="군단토벌 공식 포스터"><span><small>군단토벌 · 잊혀진 섬</small><b>콘텐츠 소개 보기</b></span><span aria-hidden="true">↗</span></button>
        <footer class="legion-entry-footer"><p class="legion-entry-status" role="status" aria-live="polite">저장된 편성을 불러오는 중입니다.</p><button type="button" class="legion-enter" data-hunt-enter disabled>편성 불러오는 중</button><small data-hunt-reward-mode></small></footer>
      </aside>
    </div></div><div class="legion-play" hidden></div><dialog class="legion-poster-view" aria-label="군단토벌 콘텐츠 소개"><button type="button" data-hunt-poster-close aria-label="소개 닫기">닫기 ×</button><img src="${art}posters/legion-hunt-forgotten-island-v3.png" alt="군단토벌 · 잊혀진 섬 콘텐츠 소개 포스터"></dialog>`;
  const find=s=>dialog.querySelector(s);
  let frame=null,session=null,rewardsChanged=false,recoveryWait=Promise.resolve();
  const clearFrame=()=>{
    if(session){recoveryWait=jointAccountRequest('legion-hunt/cancel',{method:'POST',body:{id:session}}).catch(()=>{});session=null;}
    if(frame){frame.src='about:blank';frame.remove();frame=null;}
    if(rewardsChanged){rewardsChanged=false;window.dispatchEvent(new Event('cnine:account-mutation'));}
    find('.legion-play').hidden=true;find('.legion-lobby').hidden=false;dialog.dataset.phase='lobby';
  };
  const render=state=>{
    dialog.dataset.phase=state.phase;
    if(state.phase==='battle')return;
    const data=state.data,loadout=data?.loadout,loading=state.phase==='loading';
    const expansion=data?.regionExpansion,region=expansion?.regions.find(r=>r.id===state.regionId);
    const choices=region?expansion.difficulties:data?.difficulties||[];
    dialog.classList.toggle('has-regions',!!expansion?.regions.length);
    find('.legion-regions').hidden=!expansion?.regions.length;
    find('.legion-regions').innerHTML=(expansion?.regions||[]).map((r,i)=>`<button type="button" data-hunt-region="${escape(r.id)}" aria-pressed="${r.id===state.regionId}" style="--region-art:url('${escape(imagePath(r.background))}');--region-accent:${escape(r.accent)}"><small>REGION 0${i+1}</small><strong>${escape(r.name)}</strong><span>${escape(r.setRole)}</span></button>`).join('')+(expansion?.regions.length?`<button type="button" data-hunt-region="legacy" aria-pressed="${!region}"><small>ORIGINAL</small><strong>잊혀진 섬</strong><span>기존 군단토벌</span></button>`:'');
    const boss=region?.boss||{name:'태고의 수호자',sprite:art+'monsters/ancient-forge-warden-boss-sd-v2.png'};
    find('#legion-island-title').textContent=region?.name||'잊혀진 섬';
    find('.legion-intro-text').textContent=region?.description||'길은 끊겼다. 돌아갈 방법은, 끝까지 돌파하는 것.';
    find('.legion-kicker').innerHTML='<span></span> '+escape(region?.english||'LEGION HUNT · CHAPTER 01');
    find('.legion-guardian').src=imagePath(boss.sprite);find('.legion-guardian').alt=boss.name;
    find('.legion-guardian-caption strong').textContent=boss.name;
    find('.legion-intro').style.backgroundImage=region?`linear-gradient(90deg,#081322f5,#0b1923a6 48%,#0b15252d 80%),url("${imagePath(region.background)}")`:'';
    find('.legion-intro').style.setProperty('--region-accent',region?.accent||'#c8ff6b');
    const oldNames=['군단 조우','끊임없는 증원','끝까지 생존','태고의 수호자'],oldSprites=['ember-mantis-sd-v2.png','mossback-tortoise-sd-v2.png','cobalt-bat-sd-v2.png','ancient-forge-warden-boss-sd-v2.png'];
    [...dialog.querySelectorAll('.legion-route>div')].forEach((el,i)=>{const m=region?(i===3?region.boss:region.monsters[i]):null;el.querySelector('b').textContent=m?.name||oldNames[i];el.querySelector('img').src=imagePath(m?.sprite||art+'monsters/'+oldSprites[i]);});
    find('[data-hunt-poster]').hidden=!!region;
    find('.legion-region-loot').hidden=!region;
    if(region){
      const gear=expansion.equipment.filter(i=>i.regionId===region.id),d=choices.find(d=>d.id===state.difficulty),loot=d?.loot;
      find('.legion-region-loot').innerHTML=`<div class="legion-section-heading"><div><span>REGION EXCLUSIVE</span><h2>${escape(region.setName)} 세트 & 고유 장비</h2></div><span class="legion-pve-tag">PVE 전용 효과</span></div><p class="legion-region-counter">${escape(region.counter)}</p><div class="legion-loot-grid">${gear.map(i=>`<figure class="${i.kind==='UNIQUE'?'unique':''}"><img src="${escape(imagePath(i.image))}" alt="${escape(i.name)}" loading="lazy"><figcaption><small>${i.kind==='UNIQUE'?'고유 장비':'세트 장비'}</small><strong>${escape(i.name)}</strong><span>${escape(i.kind==='UNIQUE'?i.description:'기본 전투력 '+power(i.totalPower))}</span></figcaption></figure>`).join('')}</div><div class="legion-set-effects"><p><b>2세트</b> ${escape(equipmentEffectText(region.two))}</p><p><b>4세트</b> ${escape(equipmentEffectText(region.four))}</p></div><p class="legion-stone-guide">보스 처치 시 연마석 <b>${loot?.bossStones||0}개 확정</b> · 세트 ${loot?.bossSetPercent||0}% · 고유 ${loot?.bossUniquePercent||0}%<br><small>확정 연마석은 원정 가방에 바로 보관됩니다. 필드 장비는 직접 줍거나 자석 펫으로 수집하세요. 표시 확률은 기본값이며 운영 드랍 버프가 별도로 적용됩니다.</small></p>`;
    }
    const unlimited=data?.entries?.unlimited===true,exhausted=!unlimited&&data?.entries?.remaining===0;
    find('[data-hunt-enter]').disabled=loading||!loadout||!!state.error||exhausted;
    find('[data-hunt-enter]').textContent=loading?'편성 불러오는 중':exhausted?'오늘 입장 횟수 소진':'토벌 입장';
    find('[data-hunt-refresh]').disabled=loading;
    const recoveryNotice=data?.recovery?.kind==='SETTLED'?'이전 원정의 전리품 정산을 완료했습니다.':data?.recovery?.refunded?'중단된 원정의 입장 1회를 복구했습니다.':'';
    find('.legion-entry-status').textContent=state.error||recoveryNotice||(loading?'저장된 편성을 불러오는 중입니다.':unlimited?'OWNER 계정 · 입장 횟수 제한 없음':exhausted?'한국시간 자정에 입장 횟수가 초기화됩니다.':'결과 미확정 중단 시 입장 복구 · 매일 한국시간 자정 초기화');
    find('.legion-entry-status').classList.toggle('error',!!state.error);
    find('[data-hunt-reward-mode]').textContent=data?.access?.liveRewards&&(!region||expansion.mode==='ON')?'클리어·패배·철수 정산 시 획득 전리품 지급':data?.access?.mode==='TEST'||region&&expansion.mode==='TEST'?'TEST · 지정 참여자 검수 · 계정 보상 미지급':'';
    find('.legion-account').textContent=loadout?loadout.accountNickname+' · 편성 전투력 '+power(Object.values(loadout.power).reduce((a,b)=>a+Number(b||0),0)):'';
    find('.legion-cards').innerHTML=(loadout?.cards||[]).map((card,i)=>`<figure data-card-id="${escape(card.id)}" data-grade="${escape(card.rarity||card.grade)}"><span class="legion-card-slot">0${i+1}</span><img src="${escape(imagePath(card.originalCardArt||card.sourceArt||card.image_url||card.image||'/assets/ui/cninelogo.png'))}" alt="${escape(card.title||card.name)}"><figcaption><small>${escape(card.rarity||card.grade)}</small><strong>${escape(card.title||card.name)}</strong></figcaption></figure>`).join('');
    const merc=loadout?.mercenary;
    find('.legion-mercenary').innerHTML=merc?`<img src="${escape(imagePath(merc.sourceArt))}" alt="${escape(merc.name)}"><b class="legion-merc-rank">${escape(merc.rank)}</b><div><small>용병 전용 슬롯</small><strong>${escape(merc.name)}</strong><span>${escape((merc.skills||[]).map(s=>s.name).join(' · ')||merc.role||'편성된 용병')}</span></div>`:'<div><small>용병 전용 슬롯</small><strong>용병 미편성</strong><span>편성한 용병 1명이<br>원정대에 합류합니다.</span></div>';
    const eq=loadout?.characterBonus;
    if(loading)find('.legion-mercenary').innerHTML='<div><small>용병 전용 슬롯</small><strong>편성 불러오는 중</strong></div>';
    find('.legion-equipment').textContent=loadout?'장착 슈트 · '+(eq?.equippedBattleSuit?.name||eq?.equippedBattleSuit?.code||'없음')+' / 무기 · '+(eq?.equippedWeapon?.name||eq?.equippedWeapon?.code||'없음'):'';
    find('.legion-difficulties').innerHTML=choices.map((d,i)=>`<button type="button" data-hunt-difficulty="${escape(d.id)}" aria-pressed="${d.id===state.difficulty}"><span class="legion-difficulty-number">0${i+1}</span><span class="legion-difficulty-copy"><strong>${escape(d.name)}</strong><small>${escape(d.recommendation||d.description)}</small></span><span class="legion-threat-bars" aria-hidden="true">${choices.map((_,n)=>`<i class="${n<=i?'lit':''}"></i>`).join('')}</span><span class="legion-selection-dot" aria-hidden="true"></span></button>`).join('');
    const selected=choices.find(d=>d.id===state.difficulty);
    find('.legion-limit').textContent=selected?'보스전 포함 총 15분':'';
    if(selected)find('[data-hunt-boss-at]').textContent=Math.floor(selected.huntDurationMs/60000)+':'+String(selected.huntDurationMs/1000%60).padStart(2,'0')+' · 최종 보스';
    find('.legion-entries').textContent=unlimited?'무제한':data?.entries?data.entries.remaining+' / '+data.entries.limit+'회 남음':'';
    find('[data-hunt-entry-limit]').textContent=unlimited?'무제한':data?.entries?data.entries.limit+'회':'—';
    dialog.dataset.difficulty=state.difficulty;
  };
  const controller=createHuntEntry({render,enter:()=>{
    find('.legion-lobby').hidden=true;find('.legion-play').hidden=false;
    frame=document.createElement('iframe');frame.title='군단토벌 전투';frame.src='/pve/legion-hunt/?v=20261011-background1';frame.allow='autoplay; fullscreen';find('.legion-play').append(frame);
  },dispose:()=>{clearFrame();window.removeEventListener('message',onMessage);dialog.close();dialog.remove();active=null;button?.focus();}});
  const onMessage=event=>{
    if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
    if(event.data?.type==='legion-hunt-ready')frame.contentWindow.postMessage({type:'legion-hunt-enter',difficulty:controller.state.difficulty,regionId:controller.state.regionId},location.origin);
    if(event.data?.type==='legion-hunt-session')session=event.data.id;
    if(event.data?.type==='legion-hunt-rewards-changed')rewardsChanged=true;
    if(event.data?.type==='legion-hunt-return'){clearFrame();void recoveryWait.then(result=>controller.refresh(result?.recovery));}
  };
  dialog.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-hunt-close'))controller.close();
    else if(target.hasAttribute('data-hunt-refresh'))void controller.refresh();
    else if(target.hasAttribute('data-hunt-enter'))controller.enter();
    else if(target.hasAttribute('data-hunt-poster'))find('.legion-poster-view').showModal();
    else if(target.hasAttribute('data-hunt-poster-close'))find('.legion-poster-view').close();
    else if(target.dataset.huntDifficulty){const id=target.dataset.huntDifficulty;controller.select(id);dialog.querySelector('[data-hunt-difficulty="'+id+'"]')?.focus();}
    else if(target.dataset.huntRegion){const id=target.dataset.huntRegion;controller.selectRegion(id==='legacy'?null:id);dialog.querySelector('[data-hunt-region="'+id+'"]')?.focus();}
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(event.target===find('.legion-poster-view'))find('.legion-poster-view').close();else controller.close();});
  window.addEventListener('message',onMessage);active=controller;document.body.append(dialog);dialog.showModal();void controller.refresh();
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-legion-hunt-entry]');if(!button||button.hidden)return;event.preventDefault();openLegionHunt(button);
});

// One small policy read per mounted PVE navigation. No account-wide polling or
// deck/catalog reads just to decide whether the content button is visible.
const checkedNavigation=new WeakSet();
export function syncLegionHuntNavigation(root=document,request=jointAccountRequest){
  for(const button of root.querySelectorAll('[data-legion-hunt-entry]')){
    if(checkedNavigation.has(button))continue;
    checkedNavigation.add(button);
    button.hidden=true;
    void request('legion-hunt/status').then(data=>{
      if(!button.isConnected)return;
      button.hidden=data.canEnter!==true;
      const detail=button.querySelector('small');if(detail)detail.textContent=data.access?.mode==='TEST'?'잊혀진 섬 · TEST':'잊혀진 섬';
    }).catch(()=>{button.hidden=true;checkedNavigation.delete(button);});
  }
}
window.openLegionHunt=openLegionHunt;
window.syncLegionHuntNavigation=syncLegionHuntNavigation;
syncLegionHuntNavigation();
