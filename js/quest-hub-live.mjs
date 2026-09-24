const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value||0).toLocaleString('ko-KR');
const paths={POST:'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h6',CORE_RAID:'M12 2 21 7v10l-9 5-9-5V7ZM12 7v10M8 10l4-3 4 3v4l-4 3-4-3Z',TERRITORY:'M5 22V3m0 1c5-5 9 5 15 0v10c-6 5-10-5-15 0',CLAN:'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7ZM8 10l8 7m0-7-8 7'};
const icon=id=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[id]||paths.POST}"/></svg>`;
const rewardIcon=type=>type==='COIN'?'<span class="qh-coin">C</span>':`<span class="qh-reward-symbol">${type==='MASTER_STAR'?'✦':'＋'}</span>`;
const state=q=>q.claimed?'수령 완료':q.blocked?'인증 필요':q.enabled===false?'보상 준비 중':q.count>=q.target?'목표 달성':'진행 중';
function ensureStyle(){if(document.getElementById('quest-hub-style'))return;const link=document.createElement('link');link.id='quest-hub-style';link.rel='stylesheet';link.href='/css/quest-hub-20260924.css?v=1';document.head.append(link)}
export async function mountQuestHub({root,api,onUser=()=>{},navigate=()=>{}}){
 ensureStyle();let data=null,tab='daily',selected='POST',busy=false,notice='',error=false,disposed=false;
 const connected=()=>!disposed&&root.isConnected;
 const tasks=()=>tab==='daily'?[{...data.daily,id:'POST'}]:data.weekly;
 function render(){
  if(!connected())return;
  if(!data){root.innerHTML=`<div class="qh-loading"><span class="qh-loader"></span><h2>퀘스트 기록을 불러오는 중</h2><p>오늘의 목표와 이번 주 참여 내역을 확인합니다.</p></div>`;return}
  const list=tasks(),quest=list.find(q=>q.id===selected)||list[0],pct=Math.min(100,Math.floor(quest.count/quest.target*100)),weekly=tab==='weekly',unknown=weekly&&quest.id==='POST'&&!quest.checkedAt;
  const done=list.filter(q=>q.claimed).length,period=weekly?`${data.period.weekKey.replaceAll('-','.')} — ${data.period.lastDate.replaceAll('-','.')}`:data.period.today.replaceAll('-','.');
  root.innerHTML=`<section class="qh-hub" aria-label="일일·주간 퀘스트">
   <header class="qh-heading"><div><span class="qh-kicker">숲켓몬 · 활동 기록</span><h2>퀘스트</h2><p>하루의 기록을 쌓아, 이번 주 목표까지.</p></div><div class="qh-reset"><span>한국 시간 기준</span><b>${weekly?'매주 월요일':'매일'} 00:00</b><small>진행도와 수령 기회 초기화</small></div></header>
   <div class="qh-toolbar"><div class="qh-tabs" role="tablist" aria-label="퀘스트 기간"><button role="tab" aria-selected="${!weekly}" data-qh-tab="daily">일일 퀘스트 <span>01</span></button><button role="tab" aria-selected="${weekly}" data-qh-tab="weekly">주간 퀘스트 <span>04</span></button></div><span class="qh-period">${period}</span></div>
   <div class="qh-notice ${error?'is-error':''}" role="status" ${notice?'':'hidden'}>${escape(notice)}</div>
   ${!data.verified?'<div class="qh-verify">PLAY DK 2차 인증 후 게시글 확인과 보상 수령을 이용할 수 있습니다.<button data-qh-nav="messages">인증하러 가기 →</button></div>':''}
   <div class="qh-workspace"><aside class="qh-list"><div class="qh-list-head"><b>${weekly?'이번 주 작전':'오늘의 미션'}</b><span>수령 ${done} / ${list.length}</span></div>
    ${list.map((q,i)=>`<button class="qh-mission ${q.id===quest.id?'is-selected':''}" data-qh-select="${q.id}" aria-pressed="${q.id===quest.id}"><span class="qh-mission-icon">${icon(q.id)}</span><span class="qh-mission-copy"><small>${weekly?'W':'D'}-${String(i+1).padStart(2,'0')} <i>${state(q)}</i></small><b>${escape(q.title)}</b><span>${weekly&&q.id==='POST'&&!q.checkedAt?'집계 확인 필요':`${number(q.count)} / ${q.target}${q.unit}`}</span></span><span class="qh-mission-arrow">${q.claimed?'✓':'›'}</span></button>`).join('')}
    <div class="qh-list-note">${weekly?'월요일~일요일 누적 기록<br>퀘스트마다 주 1회 수령':'하루에 게시글 15개<br>하루 1회 수령'}</div></aside>
    <article class="qh-detail" aria-label="선택한 퀘스트"><div class="qh-detail-top"><span>${icon(quest.id)} ${weekly?'주간':'일일'} 미션</span><b class="qh-status ${quest.claimed?'is-done':''}">${state(quest)}</b></div>
     <div class="qh-objective"><div><h3>${escape(quest.title)}</h3><p>${escape(quest.description)}</p></div><div class="qh-progress-number"><strong>${unknown?'—':number(quest.count)}</strong><span>/ ${quest.target}<small>${quest.unit}</small></span></div></div>
     <div class="qh-meter-meta"><span>${unknown?'작성글 확인을 눌러 집계하세요':quest.count>=quest.target?'목표 달성':`목표까지 ${number(quest.target-quest.count)}${quest.unit}`}</span><b>${unknown?'—':pct+'%'}</b></div><div class="qh-meter" role="progressbar" aria-label="퀘스트 진행도" aria-valuenow="${Math.min(quest.count,quest.target)}" aria-valuemin="0" aria-valuemax="${quest.target}"><span style="width:${unknown?0:pct}%"></span></div>
     ${weekly?`<div class="qh-week" aria-label="월요일부터 일요일 주간 기록">${data.period.allDays.map((date,i)=>{const day=quest.days?.find(d=>d.date===date);return `<div class="${date===data.period.today?'is-today':''} ${date>data.period.today?'is-future':''}"><small>${['월','화','수','목','금','토','일'][i]}</small><b>${date.slice(-2)}</b><span>${quest.id==='POST'?(day?day.count+'개':'—'):(date===data.period.today?'오늘':'·')}</span></div>`}).join('')}</div>`:'<div class="qh-daily-note"><span>PLAY DK</span><p>인증한 계정의 게시글을 기준으로 확인합니다.<br>집계된 글은 일일·주간 목표에 함께 반영됩니다.</p></div>'}
     <div class="qh-reward"><div class="qh-reward-art">${rewardIcon(quest.rewardType)}</div><div><small>달성 보상</small><strong>${quest.rewardAmount>0?`${number(quest.rewardAmount)} <span>${escape(quest.rewardLabel)}</span>`:'보상 설정 대기'}</strong><p>${weekly?'운영자 설정 후 지급 · 메시지함에서 수령':'CMS에 설정된 보상 · 수령 시 즉시 지급'}</p></div>${quest.enabled===false?'<span class="qh-off">지급 OFF</span>':''}</div>
     <div class="qh-actions"><button class="qh-refresh" data-qh-action="check" ${busy||quest.blocked?'disabled':''}>${busy?'확인 중…':quest.id==='POST'?'작성글 확인':'참여 기록 새로고침'}</button><button class="qh-claim" data-qh-action="claim" ${busy||quest.claimed||quest.blocked||quest.enabled===false||quest.count<quest.target||unknown?'disabled':''}>${quest.claimed?'수령 완료':quest.enabled===false?'보상 준비 중':weekly?'보상 메시지 받기':'보상 수령'}</button></div>
     <footer class="qh-detail-foot">${quest.checkedAt?'최근 확인 '+escape(new Date(quest.checkedAt.includes('T')?quest.checkedAt:quest.checkedAt.replace(' ','T')+'Z').toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})):'서버에 기록된 참여 내역 기준'}${weekly?' · 다음 월요일 00시 초기화':''}</footer>
    </article></div>
  </section>`;
 }
 async function refresh(){const value=await api('quests/status');if(connected())data=value;return value}
 root.onclick=async event=>{
  const button=event.target.closest('button');if(!button||!root.contains(button)||button.disabled)return;
  if(button.dataset.qhTab){if(busy)return;tab=button.dataset.qhTab;selected='POST';notice='';render();return}
  if(button.dataset.qhSelect){if(busy)return;selected=button.dataset.qhSelect;notice='';render();return}
  if(button.dataset.qhNav){navigate(button.dataset.qhNav);return}
  const action=button.dataset.qhAction;if(!action||busy)return;
  busy=true;notice='';error=false;render();
  try{
   if(action==='check'){
    if(selected==='POST'){await api(tab==='daily'?'playdk-daily-quest/check':'quests/weekly/check',{method:'POST',body:JSON.stringify({questType:'POST'})})}
    await refresh();notice='최신 기록을 확인했습니다.';
   }else{
    const result=await api(tab==='daily'?'playdk-daily-quest/claim':'quests/weekly/claim',{method:'POST',body:JSON.stringify(tab==='daily'?{questType:'POST'}:{questId:selected})});
    if(!connected())return;if(result.user)onUser(result.user);await refresh();notice=tab==='daily'?`${number(result.rewardCoin)}코인을 받았습니다.`:'보상 메시지가 도착했습니다. 메시지함에서 수령해 주세요.';
   }
  }catch(e){notice=e.message||'처리하지 못했습니다. 다시 확인해 주세요.';error=true}
  finally{busy=false;render()}
 };
 render();try{await refresh();render()}catch(e){if(connected()){root.innerHTML='<div class="qh-loading"><h2>퀘스트 기록을 불러오지 못했습니다.</h2><p></p><button type="button">다시 시도</button></div>';root.querySelector('p').textContent=e.message;root.querySelector('button').onclick=()=>mountQuestHub({root,api,onUser,navigate})}}
 return ()=>{disposed=true;root.onclick=null};
}
