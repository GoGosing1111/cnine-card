import {loadQuestFonts} from './quest-command-ui.mjs?v=comeback-20261108-v1';
export {mountQuestHub} from './quest-command-ui.mjs?v=comeback-20261108-v1';
import {QUEST_NPC} from '../shared/quest-command-v1.mjs?v=20261103-v1';

const art='/assets/quest-command-20261103/';
const button=(action,text,primary=false)=>`<button class="${primary?'primary-button panel-skin':'text-button'}" data-action="${action}">${text}</button>`;
const date=raw=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(raw.replace(' ','T')+'Z'));
const ruleText='2차 인증 완료 · 누적 출석 30일 이상 · 전체 보유 전투력 850만 이하';
const rewards=[['엠퍼러 장비','슈트·레깅스·슈즈·듀얼디스크 각 +10'],['보레아스 - Ω','차량 1대'],['라자크 · 바토리','각 21레벨 · 30일'],['지원 코인','3,000조']];

function powerDetail(power,label){
  if(!Number.isFinite(power?.total))return '';
  const categories=[['equipment','일반·용병 장비'],['cards','카드'],['mercenaries','용병'],['vehicles','이동수단'],['titles','칭호'],['avatar','아바타 보너스']];
  const rows=categories.filter(([key])=>Number.isFinite(power[key])).map(([key,name])=>'<div class="objective-row"><span>'+name+'</span><strong>'+power[key].toLocaleString('ko-KR')+'</strong></div>').join('');
  return '<details class="comeback-power"><summary>'+label+' · '+power.total.toLocaleString('ko-KR')+'</summary>'+rows+'<p class="detail-description">같은 종류는 최고 강화 1개만 합산합니다. 배틀슈트는 제외합니다.</p></details>';
}

export async function mountComeback({root,readEvent,navigate}){
  const host=document.createElement('section');
  host.className='quest-command-mount';host.setAttribute('aria-label','컴백 유저');
  document.body.append(host);
  const shadow=host.attachShadow({mode:'open'});
  void loadQuestFonts(art);
  shadow.innerHTML=`<link rel="stylesheet" href="/css/quest-command-20261103.css?v=20261103-v1"><style>
      .comeback-board .objective-row{gap:9px;flex-wrap:wrap;margin:7px 0}.comeback-board .objective-row span{overflow-wrap:anywhere}
      .comeback-power{margin-top:8px}.comeback-power summary{cursor:pointer;padding:6px 0}.comeback-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.comeback-actions .text-button{min-height:36px}
      @media(max-width:760px){.headquarters .portrait{filter:none}.portrait-scene,.scene-background{contain:paint}}
      .comeback-board{display:flex;flex-direction:column;min-height:0}.comeback-board .mission-detail{overflow:auto}
    </style>`;
  const page=document.createElement('div');shadow.append(page);
  let state=null,step=0,busy=false,error='',disposed=false;
  const observer=new MutationObserver(()=>{if(!root.isConnected)leave();});
  observer.observe(document.body,{childList:true,subtree:true});
  function leave(){disposed=true;observer.disconnect();host.remove();}
  function render(focus){
    if(disposed)return;
    const grant=state?.grant,complete=state?.phase==='COMPLETE',member=complete||state?.clan;
    const weeks=complete?state.final.weeks:(state?.weeks||[]);
    let title='복귀 대상 안내',speech='지휘관, 복귀 지원 기록을 확인하고 있습니다.',contents='',actions='';
    if(grant){
      if(step===0){
        title='복귀 보급 완료';speech='돌아오셨군요, 지휘관. 엠퍼러 장비와 보레아스, 지원 코인을 전달했습니다. 라자크와 바토리도 보급일부터 30일간 함께합니다.';
        contents=rewards.map(([name,value])=>`<div class="objective-row"><strong>${name}</strong><span>${value}</span></div>`).join('');
        contents+=powerDetail(grant.power,'지급 당시 보유 전투력');
        actions=button('next','후속 임무 듣기 ›',true);
      }else{
        title=complete?'카미시로 합류 완료':'카미시로 합류 작전';
        speech=complete?'두 주의 활동 보고와 클랜 소속을 확인했습니다. 약속한 카미시로가 지휘관의 용병단에 합류했습니다.':weeks.length===2?'두 주의 보고서를 모두 확인했습니다. 클랜 소속을 확인하면 카미시로가 영구 합류합니다.':'PLAY DK 글작성 주간 퀘스트를 서로 다른 두 주에 완료하십시오. 그 뒤 클랜 소속이 확인되면 카미시로 한 장을 지급합니다.';
        contents=`<div class="objective-row"><strong>DK 글작성 주간 퀘스트</strong><span>${weeks.length} / 2주</span></div>
          <div class="objective-row"><strong>클랜 가입</strong><span>${member?'가입 확인':'가입 필요'}</span></div>
          <p class="detail-description">${weeks.length?'완료 주차 '+weeks.join(' · '):'첫 보급을 받은 뒤 완료한 주간 퀘스트부터 집계됩니다.'}</p>
          <p class="reward-label">임무 보상 · SSS 리미티드 카미시로 1장 영구 지급</p>`;
        actions=complete?button('mercenaries','용병 도감 열기',true):button('quests','주간 퀘스트 열기',true)+button('clan','클랜으로 이동')+button('refresh','진행 갱신');
      }
    }else{
      const verify=state?.phase==='VERIFY';
      if(verify)speech='누적 출석을 확인했습니다. 2차 인증을 마치면 지휘관의 보유 전투력을 확인하겠습니다.';
      else if(state)speech='보급 대상은 2차 인증, 누적 출석, 보유 전투력으로 확인합니다. 미장착 보유분까지 계산하며, 배틀슈트 전투력은 제외합니다.';
      const days=state?.attendance;
      contents='<p class="detail-description">'+ruleText+'</p><p class="detail-description">장비·카드·용병·칭호·차량은 미장착 보유분까지 합산합니다. 같은 종류는 최고 강화 1개만 반영하며, 배틀슈트는 제외합니다.</p>';
      if(Number.isFinite(days))contents+='<div class="objective-row"><strong>누적 출석</strong><span>'+days.toLocaleString('ko-KR')+'일</span></div>';
      contents+=powerDetail(state?.power,'내 전체 보유 전투력');
      actions=verify?button('verify','2차 인증하기',true):error?button('refresh','다시 확인',true):'';
    }
    if(!page.firstElementChild)page.innerHTML=`<div class="quest-document"><header class="topbar"><button class="brand" data-action="home"><img src="${art}brand.png" alt=""><span>REVERSE : CALL<small>리버스콜</small></span></button><div class="breadcrumb"><span>로비</span><i>›</i><strong>컴백 유저</strong></div><button class="close-button panel-skin" data-action="home" aria-label="로비로 돌아가기">×</button></header>
    <main class="headquarters"><div class="scene-background" aria-hidden="true"></div><div class="scene-shade" aria-hidden="true"></div><div class="portrait-scene"><img class="portrait" src="${art}commander-seorin-v1.png" alt="지휘관 서린" fetchpriority="high"></div>
    <div class="location"><p class="eyebrow">SUPREME COMMAND</p><h1>컴백 유저</h1><p class="location-subtitle">최고사령부 <span>복귀 지원</span></p></div>
    <section class="mission-board comeback-board" aria-label="복귀 진행"><header class="board-heading"><h2>${title}</h2></header>
    <div class="qh-notice is-error" role="status" ${error?'':'hidden'}></div><article class="mission-detail panel-skin"><div class="detail-scroll">${contents}
    ${grant&&step===0?`<p class="detail-description">용병 사용 기한 · ${date(grant.expiresAt)} KST</p>`:''}</div><div class="comeback-actions">${actions}</div></article></section>
    <section class="dialogue panel-skin" aria-label="서린과 대화"><div class="speaker-label panel-skin"><span class="speaker-mark" aria-hidden="true">✦</span><h2>최고사령부 - <strong>${QUEST_NPC.name}</strong></h2></div><div class="dialogue-copy" aria-live="polite"><p>${speech}</p></div>
    <div class="dialogue-footer"><span class="dialogue-context">${title}</span><div class="dialogue-actions">${step?button('back','‹ 보급품 확인'):''}${button('home','다음에 다시 오겠습니다 ›')}</div></div></section></main></div>`;
    else{
      page.querySelector('.board-heading h2').textContent=title;
      page.querySelector('.dialogue-copy p').textContent=speech;
      page.querySelector('.dialogue-context').textContent=title;
      page.querySelector('.detail-scroll').innerHTML=contents+(grant&&step===0?'<p class="detail-description">용병 사용 기한 · '+date(grant.expiresAt)+' KST</p>':'');
      page.querySelector('.comeback-actions').innerHTML=actions;
      page.querySelector('.dialogue-actions').innerHTML=(step?button('back','‹ 보급품 확인'):'')+button('home','다음에 다시 오겠습니다 ›');
    }
    const notice=page.querySelector('.qh-notice');notice.hidden=!error;notice.textContent=error;
    if(busy)for(const b of shadow.querySelectorAll('[data-action]:not([data-action="home"])'))b.disabled=true;
    if(focus)shadow.querySelector(focus)?.focus({preventScroll:true});
  }
  async function refresh(){
    if(busy||disposed)return;busy=true;error='';render();
    try{state=await readEvent();}
    catch(e){error=e.message||'복귀 기록을 불러오지 못했습니다.';}
    finally{busy=false;render();}
  }
  async function go(route){try{const result=await navigate(route);if(result!==false&&!result?.cancelled)leave();}catch(e){error=e.message||'화면을 열지 못했습니다.';render();}}
  shadow.addEventListener('click',e=>{
    const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
    const a=b.dataset.action;if(a==='refresh'){void refresh();return;}
    if(a==='next'||a==='back'){step=a==='next'?1:0;render('.comeback-actions button');return;}
    const routes={home:'home',quests:'dailyquest',clan:'clan',verify:'verification',mercenaries:'mercenaryDex'};
    if(routes[a])void go(routes[a]);
  });
  shadow.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();void go('home');}});
  await refresh();return leave;
}

