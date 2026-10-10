import {iconRoleDescription,loadIconRoleView} from './icon-role-view-v1.mjs';
import {iconDefinition} from '../shared/icon-roles-v1.mjs';
import {ICON_FUSION_POLICY as POLICY,ICON_LIVE_CARDS,ICON_FUSION_CARDS,formatIconAmount} from '../shared/icon-fusion-policy-v1.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const state={root:null,data:null,target:ICON_LIVE_CARDS[0].code,superstarId:'',furId:'',picker:null,ack:false,busy:false,result:null,recovery:null,account:'',generation:0,cleanup:null,api:null};
const storageKey=account=>`cnine:icon-fusion:v1:${account}`;
function persist(account,value){localStorage.setItem(storageKey(account),JSON.stringify(value));if(account===state.account)state.recovery=value;}
function forget(){localStorage.removeItem(storageKey(state.account));state.recovery=null;}
const catalog=()=>(state.data?.catalog?.length?state.data.catalog:ICON_FUSION_CARDS).filter(card=>ICON_FUSION_CARDS.some(c=>c.code===card.code));
const target=()=>catalog().find(c=>c.code===state.target)||catalog()[0];
const materials=grade=>(state.data?.materials||[]).filter(c=>c.grade===grade);
const selected=grade=>materials(grade).find(c=>c.id===state[grade==='SUPERSTAR'?'superstarId':'furId']);
const alive=()=>state.root?.isConnected;
const money=value=>formatIconAmount(value);

export function iconLiveCardHtml(card,owned=true,classes=''){
  const source=ICON_LIVE_CARDS.find(c=>c.cardId===String(card.id||card.cardId)||c.code===card.code)||card;
  const src=source.sourceArt||card.image||'',name=source.name||card.name||'아이콘';
  let art=`<img class="icon-live-art" src="/${esc(src.replace(/^\//,''))}" alt="" loading="lazy" decoding="async" style="object-position:${source.focusX??50}% ${source.focusY??50}%">`;
  if(source.sourceCrop){const {left,top,width,height}=source.sourceCrop,aspect=.804/(.828*1.5),vw=Math.min(width,height*aspect),vh=vw/aspect,x=left+(width-vw)*(source.focusX??50)/100,y=top+(height-vh)*(source.focusY??50)/100;
    art=`<div class="icon-live-art icon-live-crop"><img src="/${esc(src)}" alt="" loading="lazy" decoding="async" style="width:${source.sourceWidth/vw*100}%;left:${-x/vw*100}%;top:${-y/vh*100}%"></div>`;}
  return `<article class="card-frame grade-ICON icon-live-card ${esc(classes)}${owned?'':' locked'}" data-id="${esc(card.id||source.cardId)}" aria-label="${esc(name)} 아이콘"><div class="icon-live-portrait">${owned?art:'<span class="icon-live-unknown">?</span>'}<img class="icon-live-frame" src="/assets/ui/card-frames/icon-streamer-frame-v1.png" alt="" loading="lazy" decoding="async"></div><div class="icon-live-name"><small>ICON <span class="ir-card-label">${esc(iconDefinition(source.cardId)?.label||'')}</span></small><strong>${owned?esc(name):'미획득 카드'}</strong></div></article>`;
}
const materialArt=card=>`<span class="if-source-viewport"><span class="if-source-canvas">${typeof globalThis.cardHtml==='function'?globalThis.cardHtml({...card,basePower:card.basePower||0},true,'if-source-card',{quantities:{[card.id]:card.quantity},breakthroughs:{[card.id]:13}}):`<div class="if-source-fallback"><img src="/${esc(String(card.image||'').replace(/^\//,''))}" alt=""><b>${esc(card.name)}</b><span>${esc(card.grade)} +13</span></div>`}</span></span>`;
function canRun(){const r=state.data?.resources;return Boolean(state.data?.enabled&&selected('SUPERSTAR')?.eligible&&selected('FUR')?.eligible&&state.ack&&!state.busy&&!state.recovery&&!state.result&&r&&BigInt(r.coin)>=BigInt(POLICY.coinCost)&&r.masterStars>=POLICY.masterStarCost);}
const currencyAsset=key=>`/assets/ui/icon-fusion-20261004/${key}.webp`;
function materialSlot(grade,index){
  const card=selected(grade);
  return `<button type="button" class="if-material ${card?'is-filled':''} if-material-${grade.toLowerCase()}" data-pick="${grade}" ${state.busy||state.recovery||state.result?'disabled':''}><span class="if-material-top"><b>${grade}</b><em>+13</em></span><span class="if-material-art">${card?materialArt(card):`<i class="if-empty-seal"><span>+</span><small>재료 선택</small></i>`}</span><span class="if-material-bottom"><strong>${card?esc(card.name):'카드 선택'}</strong><small>${card?'1장 소모 · 변경 가능':'보유한 +13 카드'}</small>${arrow}</span></button>`;
}
function costRow(key,name,cost,owned,suffix=''){
  const available=state.data?.resources!=null,short=available&&BigInt(owned||0)<BigInt(cost),balance=available?`보유 ${money(owned)}${suffix}`:'보유량 확인 중';
  return `<div class="if-cost-row ${short?'is-short':''}"><img src="${currencyAsset(key)}" width="64" height="64" alt="" decoding="async"><div><small>${name}</small><strong>${money(cost)}${suffix?`<em>${suffix}</em>`:''}</strong></div><span>${balance}</span><small class="if-cost-state">${short?`${money(BigInt(cost)-BigInt(owned||0))}${suffix} 부족`:available?'보유량 충족':'확인 중'}</small></div>`;
}
function render(){
  if(!alive())return;
  const card=target(),r=state.data?.resources||{},result=state.result,reviewLocked=state.data?.enabled===false;
  state.root.classList.toggle('is-review-locked',reviewLocked);
  state.root.innerHTML=`<header class="if-heading"><div class="if-heading-title"><span class="if-rarity-badge">ICON</span><div><p>최고등급 카드</p><h1>아이콘 합성</h1></div></div><div class="if-heading-meta"><span>선택형 합성 <b>7종</b></span><span>기본 전투력 <b>18만</b></span></div></header>
    ${reviewLocked?'<div class="if-review-notice" role="status"><span class="if-lock-mark" aria-hidden="true">◇</span><b>최종 검토 중 · 합성 잠금</b><span>카드와 합성 조건을 미리 확인하세요. 현재는 재료와 재화가 소모되지 않습니다.</span></div>':''}
    <div class="if-workspace">
      <nav class="if-targets" aria-label="획득할 아이콘 선택"><div class="if-section-title"><span>01</span><b>아이콘 선택</b><small>${catalog().length}종</small></div><div class="if-target-list">${catalog().map((c,i)=>`<button type="button" data-target="${esc(c.code)}" class="${c.code===card.code?'is-selected':''}" aria-pressed="${c.code===card.code}" ${state.busy||state.recovery||result?'disabled':''}><span class="if-target-art">${iconLiveCardHtml(c,true,'if-target-mini')}</span><span class="if-target-name"><small>ICON <em>0${i+1}</em></small><b>${esc(c.name)}</b><i>${c.quantity?'보유 중':'획득 가능 카드'}</i></span><span class="if-target-indicator" aria-hidden="true">${c.code===card.code?'◆':'◇'}</span></button>`).join('')}</div><p class="if-target-help">성공 시 선택한 아이콘을<br>확정 획득합니다.</p></nav>
      <section class="if-stage ${result?result.success?'is-success':'is-failed':''}" aria-label="아이콘 합성 무대"><div class="if-stage-backdrop" aria-hidden="true"></div><div class="if-stage-orbit" aria-hidden="true"></div><div class="if-stage-rays" aria-hidden="true"></div><canvas class="if-particles" aria-hidden="true"></canvas><div class="if-stage-top"><span>ICON</span><small>${result?result.success?'최고등급 획득 완료':'합성 결과':'최고등급 · 선택한 아이콘'}</small></div><div class="if-hero-card">${iconLiveCardHtml(card,true,'if-hero')}</div><div class="if-stage-caption"><small>${result?result.success?'ICON ACQUIRED':'SYNTHESIS FAILED':'SELECTED ICON'}</small><h2>${result&&!result.success?'합성 실패':esc(card.name)}</h2><p>${result?result.success?'선택한 아이콘이 도감에 등록되었습니다.':'투입한 카드 2장과 재화가 모두 소모되었습니다.':'기본 전투력 <b>180,000</b><span>·</span>추가 강화 불가'}</p></div><div class="if-stage-flash" aria-hidden="true"></div><div class="if-video-slot"></div><button type="button" class="if-skip" hidden>연출 건너뛰기 ${arrow}</button></section>
      <aside class="if-checkout" aria-label="아이콘 합성 준비"><div class="if-console-heading"><div><small>SYNTHESIS</small><h2>합성 준비</h2></div><div class="if-odds"><small>성공 확률</small><b>${POLICY.successRate}<span>%</span></b></div></div><section class="if-materials"><div class="if-section-title"><span>02</span><b>재료 카드</b><small>각 1장 소모</small></div><div class="if-material-pair">${materialSlot('SUPERSTAR',1)}${materialSlot('FUR',2)}</div></section><section class="if-costs"><div class="if-section-title"><span>03</span><b>필요 재화</b><small>시도 1회 기준</small></div><div class="if-cost-grid">${costRow('coin','코인',POLICY.coinCost,r.coin)}${costRow('master-star','마스터의 별',POLICY.masterStarCost,r.masterStars,'개')}</div></section><div class="if-sacrifice"><b>실패해도 재료와 재화가 모두 소모됩니다.</b><p>카드 2장 · 코인 ${money(POLICY.coinCost)} · 마스터의 별 ${money(POLICY.masterStarCost)}개</p><small>매회 독립 확률 · 천장 없음<br>사용 후 남은 중복 카드의 강화는 +0으로 초기화됩니다.</small></div><label class="if-ack"><input type="checkbox" ${state.ack?'checked':''} ${reviewLocked||state.busy||state.recovery||result?'disabled':''}><span>소모되는 재료와 확률을 확인했습니다.</span></label><button type="button" class="if-submit" ${canRun()?'':'disabled'}><span><small>${reviewLocked?'FINAL REVIEW':state.busy?'SYNTHESIS IN PROGRESS':'ICON SYNTHESIS'}</small><b>${reviewLocked?'합성 잠금':state.busy?'합성 결과 확인 중':'아이콘 합성 시도'}</b></span>${arrow}</button><p class="if-availability" role="status">${reviewLocked?'최종 검토 후 합성이 오픈됩니다.':state.data?.enabled?'SUPERSTAR +13 · FUR +13 각 1장 필요':'합성 정보를 확인하고 있습니다.'}</p>${result?'<button type="button" class="if-again">다음 합성 준비 '+arrow+'</button>':''}</aside>
    </div><div class="if-role-slot">${iconRoleDescription(card,{compact:true})}</div><section class="if-picker" ${state.picker?'':'hidden'}></section><div class="if-status" role="status" aria-live="polite"></div><section class="if-recovery" ${state.recovery?'':'hidden'}><div><small>PREVIOUS ATTEMPT</small><b>이전 합성 결과 확인</b><p>같은 요청으로 결과를 확인합니다. 중복으로 소모되지 않습니다.</p></div><button type="button" class="if-resume">결과 확인 ${arrow}</button></section>`;
  // All seven small portraits are immediately visible; do not wait on viewport lazy loading.
  state.root.querySelectorAll('.if-target-art img,.if-hero-card img,.if-material-art img').forEach(img=>{img.loading='eager';});
  const list=state.root.querySelector('.if-target-list'),active=list.querySelector('.is-selected');
  if(active&&list.scrollWidth>list.clientWidth)list.scrollLeft=active.getBoundingClientRect().left-list.getBoundingClientRect().left-(list.clientWidth-active.clientWidth)/2;
  state.root.querySelectorAll('[data-target]').forEach(button=>button.onclick=()=>{state.target=button.dataset.target;state.ack=false;render();});
  state.root.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>{state.picker=button.dataset.pick;renderPicker();state.root.querySelector('.if-picker').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});});
  state.root.querySelector('.if-ack input').onchange=e=>{state.ack=e.target.checked;state.root.querySelector('.if-submit').disabled=!canRun();};
  state.root.querySelector('.if-submit').onclick=()=>begin();
  state.root.querySelector('.if-resume').onclick=()=>recover();
  const again=state.root.querySelector('.if-again');if(again)again.onclick=async()=>{forget();state.result=null;state.ack=false;state.superstarId='';state.furId='';await load();};
  if(state.picker)renderPicker();
}
function renderPicker(){
  const box=state.root.querySelector('.if-picker'),grade=state.picker;if(!grade){box.hidden=true;return;}box.hidden=false;
  box.innerHTML=`<header><div><small>MATERIAL SELECTION</small><h3>${grade} +13 카드 선택</h3><p>전투 덱과 저장 덱에 편성한 카드는 해제 후 선택할 수 있습니다.</p></div><button type="button" class="if-picker-close" aria-label="재료 목록 접기">접기 −</button></header><div class="if-picker-grid">${materials(grade).length?materials(grade).map(c=>`<button type="button" data-material="${esc(c.id)}" ${c.eligible?'':'disabled'} class="${c.id===(grade==='SUPERSTAR'?state.superstarId:state.furId)?'is-selected':''}">${materialArt(c)}<strong>${esc(c.name)}</strong><span>${c.eligible?`보유 ${c.quantity}장 · 1장 소모`:esc(c.blockedReason)}</span></button>`).join(''):'<div class="if-empty"><b>선택 가능한 카드가 없습니다.</b><p>보유한 SUPERSTAR 또는 FUR 카드를 +13까지 강화하면<br>이곳에서 합성 재료로 선택할 수 있습니다.</p></div>'}</div>`;
  box.querySelector('.if-picker-close').onclick=()=>{state.picker=null;box.hidden=true;state.root.querySelector(`[data-pick="${grade}"]`)?.focus({preventScroll:true});};
  box.querySelectorAll('[data-material]').forEach(button=>button.onclick=()=>{state[grade==='SUPERSTAR'?'superstarId':'furId']=button.dataset.material;state.picker=null;state.ack=false;render();state.root.querySelector(`[data-pick="${grade}"]`)?.focus();});
}

function status(message){if(alive())state.root.querySelector('.if-status').textContent=message;}
function updateWallet(data){
  const user=globalThis.loadUser?.();if(!user||String(user.serverUserId??user.id)!==state.account)return;
  if(data?.resources){user.coin=Number(data.resources.coin);user.masterStars=data.resources.masterStars;}
  globalThis.saveUser?.(user);
}
async function syncUser(){try{const data=await state.api('me',{}, {ttl:0,microcache:false,replaceInflight:true});if(String(data.user?.id)===state.account&&typeof globalThis.apiUserToLocal==='function')globalThis.saveUser(globalThis.apiUserToLocal(data.user));}catch{}}
async function load(){
  const generation=state.generation;
  try{const data=await state.api('icons/fusion/overview',{}, {ttl:0,microcache:false,replaceInflight:true});if(generation!==state.generation||!alive())return;state.data=data;await loadIconRoleView().catch(()=>{});if(generation!==state.generation||!alive())return;globalThis.mergeClientCards?.(data.catalog.map(c=>({...c,id:c.cardId,title:c.name,image:c.sourceArt})));if(!data.catalog.some(c=>c.code===state.target)&&data.catalog.length)state.target=data.catalog[0].code;
    if(data.pendingRequestId&&!state.recovery)state.recovery={requestId:data.pendingRequestId};updateWallet(data);render();
  }catch(error){if(generation===state.generation&&alive()){render();status(error.message||'합성 정보를 불러오지 못했습니다.');const b=document.createElement('button');b.type='button';b.className='if-reload';b.textContent='다시 불러오기';b.onclick=()=>load();state.root.querySelector('.if-status').append(b);}}
}
async function begin(){
  if(!canRun())return;const plan={requestId:crypto.randomUUID(),superstarId:state.superstarId,furId:state.furId,targetCode:state.target,policyVersion:POLICY.version};
  try{persist(state.account,{plan});}catch{status('요청 기록을 저장할 수 없습니다. 브라우저 저장 공간을 확인해 주세요.');return;}
  await execute(plan);
}
async function recover(){
  if(state.busy||!state.recovery)return;const requestId=state.recovery.plan?.requestId||state.recovery.requestId,generation=state.generation;
  state.busy=true;render();status('이전 결과를 확인하고 있습니다.');
  try{const receipt=await state.api(`icons/fusion/receipt?requestId=${encodeURIComponent(requestId)}`,{}, {ttl:0,microcache:false,replaceInflight:true});if(generation!==state.generation)return;
    if(receipt.status==='COMPLETED'){state.result=receipt;state.target=receipt.target.code;state.recovery=null;forget();state.busy=false;await syncUser();await load();return;}
    const plan=state.recovery?.plan||{...receipt.input,requestId};state.busy=false;await execute(plan);
  }catch(error){if(generation!==state.generation)return;state.busy=false;
    if(error.code==='JOINT_NOT_FOUND'&&state.recovery?.plan){await execute(state.recovery.plan);return;}
    if(error.code==='JOINT_OPERATION_SUPERSEDED'){forget();await load();}else render();status(error.message);}
}
async function execute(plan){
  if(state.busy)return;const generation=state.generation,account=state.account;state.busy=true;state.result=null;state.target=plan.targetCode;render();state.root?.querySelector('.if-stage')?.classList.add('is-committing');status('합성 결과를 확정하고 있습니다.');
  try{
    const result=await state.api('icons/fusion',{method:'POST',body:JSON.stringify(plan)},{timeoutMs:45000});
    persist(account,{plan,result});if(generation!==state.generation||!alive())return;
    await playReveal(result,generation);if(generation!==state.generation||!alive())return;
    state.result=result;state.busy=false;state.recovery=null;forget();await syncUser();await load();status(result.success?'아이콘 획득이 완료되었습니다.':'합성에 실패했습니다. 투입한 재료가 모두 소모되었습니다.');
  }catch(error){if(generation!==state.generation||!alive())return;state.busy=false;
    const terminal=error.retryable===false&&!/PENDING/.test(error.code||'');if(terminal)forget();render();status(error.message||'결과 확인이 지연되고 있습니다. 이전 결과 확인을 눌러 주세요.');}
}
function playReveal(result,generation){
  return new Promise(resolve=>{
    const stage=state.root.querySelector('.if-stage'),canvas=stage.querySelector('canvas'),ctx=canvas.getContext('2d'),skip=stage.querySelector('.if-skip'),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Mobile checkout is below the stage; bring the video into view before playback.
    stage.scrollIntoView({behavior:reduce?'instant':'smooth',block:'center'});
    let done=false,raf=0,video=null,timer=0,start=performance.now();
    const finish=()=>{if(done)return;done=true;cancelAnimationFrame(raf);clearTimeout(timer);if(video){video.pause();video.removeAttribute('src');video.load();video.remove();}skip.hidden=true;stage.classList.remove('is-committing','is-converging','is-revealing');if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height);if(state.cleanup===finish)state.cleanup=null;resolve();};
    state.cleanup=finish;skip.hidden=false;skip.onclick=finish;
    stage.classList.remove('is-committing');stage.classList.add('is-converging');stage.dataset.outcome=result.success?'success':'failure';
    const w=stage.clientWidth,h=stage.clientHeight,dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;ctx?.scale(dpr,dpr);
    const particles=Array.from({length:reduce?0:90},(_,i)=>({angle:i*2.399963,speed:.4+(i%11)/13,r:25+(i*37)%(w*.7),size:1+i%3}));
    const playVideo=()=>{
      stage.classList.add('is-revealing');if(!result.success||!result.successVideo?.url){timer=setTimeout(finish,reduce?200:1000);return;}
      video=document.createElement('video');video.className='if-success-video';video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.preload='auto';video.src=result.successVideo.url;
      video.muted=typeof globalThis.battleSoundEnabled==='function'?!globalThis.battleSoundEnabled():localStorage.getItem('cnine_battle_sound')==='OFF';video.controls=false;
      video.addEventListener('ended',finish,{once:true});video.addEventListener('error',finish,{once:true});stage.querySelector('.if-video-slot').append(video);
      timer=setTimeout(finish,Math.min(65000,Math.max(5000,result.successVideo.durationMs+5000)));video.play().catch(error=>{if(error.name==='AbortError'&&video?.dataset.runtimeWasPlaying==='1'&&!done)return;finish();});
    };
    const frame=now=>{if(done)return;if(generation!==state.generation||!stage.isConnected){finish();return;}const elapsed=now-start,duration=reduce?180:3100,t=Math.min(1,elapsed/duration);ctx?.clearRect(0,0,w,h);
      if(ctx){for(const p of particles){const a=p.angle+elapsed*.00025*p.speed,r=p.r*(1-t*.84),x=w/2+Math.cos(a)*r,y=h*.42+Math.sin(a)*r*.7;ctx.globalAlpha=Math.min(1,t*4)*(1-t*.3);ctx.fillStyle=result.success?'#fbe6a9':'#c98782';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(x,y,p.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
      stage.style.setProperty('--if-charge',String(t));if(t<1)raf=requestAnimationFrame(frame);else playVideo();};raf=requestAnimationFrame(frame);
  });
}
function dispose(){state.cleanup?.();state.generation++;state.root=null;state.busy=false;}
function view(){return '<section id="iconFusionRoot" class="icon-fusion"><div class="if-loading">아이콘 합성실을 준비하고 있습니다.</div></section>';}
function mount({apiRequest=globalThis.apiRequest,user=globalThis.loadUser?.()}={}){
  dispose();state.root=document.getElementById('iconFusionRoot');if(!state.root)return;state.account=String(user?.serverUserId??user?.id??'');state.api=apiRequest;state.data=null;state.result=null;state.recovery=null;state.ack=false;state.superstarId='';state.furId='';state.picker=null;
  try{state.recovery=JSON.parse(localStorage.getItem(storageKey(state.account))||'null');if(state.recovery?.result){state.result=state.recovery.result;state.target=state.result.target.code;forget();}}catch{status('저장된 합성 기록을 확인할 수 없습니다.');}
  render();return (state.result?syncUser():Promise.resolve()).then(load);
}
globalThis.IconFusion=Object.freeze({view,mount,dispose,cardHtml:iconLiveCardHtml,formatAmount:formatIconAmount});
