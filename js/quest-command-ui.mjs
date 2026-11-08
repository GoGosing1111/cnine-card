import {QUEST_NPC,QUEST_PRESENTATION,questNpcLines} from '../shared/quest-command-v1.mjs?v=20261103-v1';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value||0).toLocaleString('ko-KR');
export const questAmount=value=>{const n=Number(value||0);for(const [unit,size]of [['조',1e12],['억',1e8],['만',1e4]])if(n>=size)return Number((n/size).toFixed(2)).toLocaleString('ko-KR')+unit;return number(n);};
const state=q=>q.claimed?'수령 완료':q.blocked?'인증 필요':q.enabled===false?'지급 대기':q.available===false&&q.id!=='POST'?'집계 확인':q.count>=q.target?'보상 수령':'진행 중';
let fontReady;
export function loadQuestFonts(assets){
 if(!fontReady&&typeof FontFace==='function')fontReady=Promise.all([new FontFace('Quest Pretendard',`url("${assets}PretendardVariable.woff2")`,{weight:'45 920'}),new FontFace('Quest Black Han',`url("${assets}BlackHanSans-Regular.ttf")`)].map(async font=>{document.fonts.add(font);await font.load();})).catch(()=>{});
 return fontReady;
}
export async function mountQuestHub({root,api,onUser=()=>{},navigate=()=>{},assets='/assets/quest-command-20261103/',style='/css/quest-command-20261103.css?v=20261103-v1',preview=false}){
 let data=null,tab='weekly',selected=null,busy=false,notice='',error=false,phase='inspect',disposed=false;
 const acknowledged=new Set();
 root.innerHTML='<section class="quest-command-mount" aria-label="최고사령부 퀘스트"></section>';
 const host=root.firstElementChild,shadow=host.attachShadow({mode:'open'});document.body.append(host);
 const observer=new MutationObserver(()=>{if(!root.isConnected){disposed=true;host.remove();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
 void loadQuestFonts(assets);
 const connected=()=>!disposed&&host.isConnected;
 const icon=(name,cls='')=>globalThis.SoopTacticalIcons?.html(name,cls)||`<img class="${cls}" src="${assets}${name}.webp" alt="">`;
 const all=()=>tab==='weekly'?[...data.weekly.filter(q=>q.id!=='POST'),...data.weekly.filter(q=>q.id==='POST')]:[...(data.dailyCombat||[]),{...data.daily,id:'POST',available:!!data.daily.checkedAt}];
 const quest=()=>selected?all().find(q=>q.id===selected):null;
 const statusKey=q=>`${tab}:${tab==='weekly'?data.period.weekKey:data.period.today}:${q.id}`;
 const rewardRows=q=>q.claimed&&q.claimedReward?[q.claimedReward]:q.rewards||[{type:q.rewardType,label:q.rewardLabel,amount:q.rewardAmount}];
 const speak=q=>questNpcLines(q,{phase,weekly:tab==='weekly'}).map(s=>`<p>${escape(s)}</p>`).join('');
 function render(focus){
  if(!connected())return;
  const weekly=tab==='weekly',list=data?all():[],q=data?quest():null;
  const unknown=q?.id==='POST'&&!q.checkedAt,ready=q&&q.count>=q.target&&!unknown&&q.available!==false;
  const actionable=ready&&!q.claimed&&!q.blocked&&q.enabled!==false;
  const period=data?(weekly?`${data.period.weekKey.replaceAll('-','.')} — ${data.period.lastDate.slice(5).replace('-','.')}`:data.period.today.replaceAll('-','.')):'';
  shadow.innerHTML=`<link rel="stylesheet" href="${style}"><div class="quest-document">
   <header class="topbar"><button class="brand" data-action="close" aria-label="로비로 돌아가기"><img src="${assets}brand.png" alt=""><span>REVERSE : CALL<small>리버스콜</small></span></button><div class="breadcrumb"><span>로비</span><i>›</i><strong>최고사령부</strong></div><span class="draft-label">${preview?'승인된 사령부 미리보기':weekly?'매주 월요일':'매일'}<b>${preview?'일일 · 주간 퀘스트':'00:00 KST 초기화'}</b></span><button class="close-button panel-skin" data-action="close" aria-label="퀘스트 닫고 로비로">×</button></header>
   <main class="headquarters"><div class="scene-background" aria-hidden="true"></div><div class="scene-shade" aria-hidden="true"></div><div class="portrait-scene"><img class="portrait" src="${assets}commander-seorin-v1.png" alt="최고사령부 지휘관 서린" fetchpriority="high"></div>
   <div class="location"><p class="eyebrow">SUPREME COMMAND</p><h1>최고사령부</h1><p class="location-subtitle">작전통제실 <span>일일 · 주간 임무</span></p></div>
   <section class="mission-board" aria-label="작전 선택"><div class="quest-tabs" role="tablist" aria-label="퀘스트 기간">${['daily','weekly'].map(t=>`<button class="panel-skin" role="tab" aria-selected="${tab===t}" data-tab="${t}" ${busy?'disabled':''}>${t==='daily'?'일일 퀘스트':'주간 퀘스트'} <small>${data?(t==='daily'?(data.dailyCombat||[]).length+1:data.weekly.length):''}</small></button>`).join('')}</div>
   <header class="board-heading"><div><p class="eyebrow">${weekly?'WEEKLY':'DAILY'} OPERATIONS</p><h2>${q?'작전 상세':weekly?'이번 주 작전':'오늘의 작전'}</h2></div><span class="board-count">${q?state(q):data?`수령 ${list.filter(m=>m.claimed).length} / ${list.length}`:''}</span></header><p class="selection-prompt">${q?(q.id==='POST'?'인증된 PLAY DK 계정의 작성 기록을 확인합니다.':'서버에 기록된 완료 전투를 자동으로 집계합니다.'):period||'전투 보고를 불러오고 있습니다.'}</p>
   <div class="qh-notice ${error?'is-error':''}" role="status" ${notice?'':'hidden'}>${escape(notice)}</div>
   ${!data?`<div class="mission-detail panel-skin"><p>${error?'전투 보고를 불러오지 못했습니다.':'작전 기록을 확인하고 있습니다.'}</p><button class="primary-button panel-skin" data-action="refresh" ${busy?'disabled':''}>${busy?'확인 중…':'다시 확인'}</button></div>`:q?`<article class="mission-detail panel-skin" aria-label="${escape(q.title)}"><div class="detail-scroll"><p class="detail-type">${weekly?'WEEKLY':'DAILY'} / ${q.id==='POST'?'후방 지원':'전투 임무'}</p><h3>${escape(q.title)}</h3><p class="detail-description">${escape(q.description)}</p><div class="objective-row"><strong>${q.id==='POST'?'게시글 작성':'전투 참여 완료'}</strong><span>${unknown?'미확인':number(q.count)} / ${q.target}${q.unit}</span></div><div class="progress" role="progressbar" aria-label="작전 진행도" aria-valuemin="0" aria-valuemax="${q.target}" aria-valuenow="${Math.min(q.target,q.count)}"><i style="width:${unknown?0:Math.min(100,100*q.count/q.target)}%"></i></div><p class="reward-label">${q.claimed?'이미 수령한 보상':'작전 완료 보상'} · ${weekly?'메시지함 전달':'즉시 지급'}</p><div class="rewards">${rewardRows(q).map(r=>`<div class="reward"><img src="${assets}${r.type==='COIN'?'coin':'master-star'}.webp" alt=""><span><small>${escape(r.label)}</small><b title="${number(r.amount)}">${questAmount(r.amount)}</b></span></div>`).join('')}</div></div><div class="detail-actions"><button class="secondary-button panel-skin" data-action="back" ${busy?'disabled':''}>‹ 목록</button><button class="primary-button panel-skin" data-action="${actionable?'claim':q.blocked?'verify':q.claimed&&weekly?'messages':q.claimed?'back':q.id==='POST'?'check':acknowledged.has(statusKey(q))?'depart':'acknowledge'}" ${busy||q.enabled===false?'disabled':''}>${busy?'확인 중…':actionable?'보상을 수령하겠습니다':q.blocked?'2차 인증 확인':q.claimed?(weekly?'메시지함 확인':'지급 완료'):q.id==='POST'?'작성글 확인':acknowledged.has(statusKey(q))?'출전하겠습니다':'임무를 확인했습니다'}<span aria-hidden="true">›</span></button></div><button class="refresh-link" data-action="check" ${busy?'disabled':''}>${q.id==='POST'?'작성글 다시 확인':'참여 기록 새로고침'} ↻</button></article>`:`<div class="mission-options">${list.map((m,i)=>`<button class="mission-option panel-skin" data-mission="${m.id}" aria-label="${escape(m.title)}, ${state(m)}" ${busy?'disabled':''}>${icon(QUEST_PRESENTATION[m.id]?.icon||'messages')}<span class="mission-text"><small>${String(i+1).padStart(2,'0')} / ${m.id==='POST'?'후방 지원':weekly?'주간 전투':'일일 전투'}</small><strong>${escape(m.title)}</strong><span class="mission-meta">${m.id==='POST'&&!m.checkedAt?'작성글 확인':`${number(m.count)} / ${m.target}${m.unit}`} · ${rewardRows(m).map(r=>questAmount(r.amount)+(r.type==='COIN'?' 코인':' 마별')).join(' + ')}</span></span><span class="mission-status">${state(m)}</span><span class="mission-arrow" aria-hidden="true">›</span></button>`).join('')}</div>`}
   </section>
   <section class="dialogue panel-skin" aria-labelledby="speakerName"><div class="speaker-label panel-skin"><span class="speaker-mark" aria-hidden="true">✦</span><h2 id="speakerName">최고사령부 - <strong>${QUEST_NPC.name}</strong></h2></div><div class="dialogue-copy" aria-live="polite">${data?speak(q):'<p>전선에서 들어온 전투 보고를 확인하고 있습니다.</p><p>잠시 기다려 주십시오, 지휘관.</p>'}</div><div class="dialogue-footer"><span class="dialogue-context">${q?escape(q.title):weekly?'주간 작전 브리핑':'일일 작전 브리핑'}</span><div class="dialogue-actions">${q?'<button class="text-button" data-action="back">‹ 다른 임무 확인</button>':''}<button class="text-button" data-action="close">다음에 다시 오겠습니다 <span aria-hidden="true">›</span></button></div></div></section><p class="scene-footer">REVERSE : CALL <span>SUPREME COMMAND / 01</span></p></main></div>`;
  if(focus)shadow.querySelector(focus)?.focus({preventScroll:true});
 }
 async function refresh(){const next=await api('quests/status');if(connected()){if(data&&data.period.today!==next.period.today)acknowledged.clear();data=next;}return next;}
 const leave=async route=>{if(busy)return;busy=true;try{await navigate(route);disposed=true;host.remove();observer.disconnect();}catch(err){error=true;notice=err.message||'출전 화면을 열지 못했습니다.';}finally{busy=false;render();}};
 shadow.addEventListener('keydown',e=>{if(e.key==='Escape'&&!busy){e.preventDefault();if(selected){const old=selected;selected=null;notice='';phase='inspect';render(`[data-mission="${old}"]`);}else leave('home');}});
 shadow.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.disabled||busy)return;
  if(b.dataset.tab){tab=b.dataset.tab;selected=null;notice='';phase='inspect';render(`[data-tab="${tab}"]`);return;}
  if(b.dataset.mission){selected=b.dataset.mission;notice='';phase='inspect';render('.primary-button');return;}
  const action=b.dataset.action,q=data?quest():null;
  if(action==='close'){leave('home');return;}
  if(action==='back'){const old=selected;selected=null;notice='';phase='inspect';render(`[data-mission="${old}"]`);return;}
  if(action==='acknowledge'){acknowledged.add(statusKey(q));phase='accepted';render('.primary-button');return;}
  if(action==='depart'){leave(QUEST_PRESENTATION[q.id]?.route||'battle');return;}
  if(action==='verify'||action==='messages'){leave('messages');return;}
  if(!['claim','check','refresh'].includes(action))return;
  busy=true;notice='';error=false;render();
  try{
   if(action==='claim'){
    const weekly=tab==='weekly',post=q.id==='POST';
    const result=await api(weekly?'quests/weekly/claim':post?'playdk-daily-quest/claim':'quests/daily/claim',{method:'POST',body:JSON.stringify(!weekly&&post?{questType:'POST'}:{questId:q.id})});
    if(!connected())return;
    if(result.user)onUser(result.user);
    await refresh();
    notice=weekly?'작전 보상 메시지를 전달했습니다. 메시지함에서 수령하십시오.':'코인'+(!post?'과 마스터의 별':'')+' 지급을 완료했습니다.';
    if(!weekly&&!result.user){try{const me=await api('me');if(connected()&&me.user)onUser(me.user);}catch{notice+=' 보유 재화는 다음 조회에서 갱신됩니다.';}}
   }else{
    if(action==='check'&&q?.id==='POST')await api(tab==='weekly'?'quests/weekly/check':'playdk-daily-quest/check',{method:'POST',body:JSON.stringify({questType:'POST'})});
    await refresh();notice='최신 전투 보고와 수령 내역을 확인했습니다.';
   }
   phase='inspect';
  }catch(err){
   error=true;notice=err.message||'전투 보고를 확인하지 못했습니다.';phase='error';
   if(action==='claim'){try{await refresh();if(quest()?.claimed){error=false;notice='이미 처리된 보상 수령 내역을 확인했습니다.';phase='inspect';}}catch{}}
  }finally{busy=false;render('.primary-button');}
 });
 render();busy=true;try{await refresh();}catch(e){error=true;notice=e.message||'전투 보고를 불러오지 못했습니다.';}finally{busy=false;render();}
 return ()=>{disposed=true;host.remove();observer.disconnect();};
}
