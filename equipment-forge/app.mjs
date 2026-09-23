import {ForgeFX} from '/preview/equipment-forge-v1/source/fx.mjs';
import {forgePower} from '/shared/equipment-forge-policy-v1.mjs';
import {forgeQuoteShortages} from '/shared/equipment-forge-resources-v1.mjs?v=20260924-shortage';
import {createForgeTransport,createForgeQuoteQueue,readForgePending,terminalForgeErrors} from './requests.mjs?v=20260923-recovery';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slots={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구'};
const token=()=>localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
function imageUrl(raw){try{const u=new URL(raw,location.origin+'/');return ((u.origin===location.origin&&u.pathname.startsWith('/assets/'))||u.protocol==='https:')&&!u.username&&!u.password?u.href:'';}catch{return '';}}
const number=v=>{try{return BigInt(v).toLocaleString('ko-KR');}catch{return '—';}};
const coin=v=>{try{const n=BigInt(v);if(n<100000000n)return number(n);const fraction=(n%100000000n).toString().padStart(8,'0').replace(/0+$/,'');return `${number(n/100000000n)}${fraction?'.'+fraction:''}억`;}catch{return '—';}};
let data=null,items=[],cursor=null,group='all',mode='enhance',selected=null,loading=false,generation=0,controller=null,fx=null,activeToken=token(),lastLoad=0,quote=null,quoteGeneration=0,executing=false;
let lifetime=new AbortController(),recovering=false,quoteRetry=null,checkedPending='',fxGeneration=0;
const request=createForgeTransport();
const quoteQueue=createForgeQuoteQueue((body,options)=>request('quote',{...options,body,retries:2}));
const outcomeNames={SUCCESS:'강화 성공',MAINTAIN:'강화 유지',DESTROY:'장비 파괴',PROTECTED:'장비 보호 성공',RESTORED:'장비 복구 완료'};
const visibleItems=()=>mode==='restore'?(data?.records||[]).filter(r=>!r.restoredInstanceId).map(r=>({...r,selectionId:r.recordId})):items.map(r=>({...r,selectionId:r.instanceId}));
const pendingKey=()=>`cnine.forge.pending:${data?.accountId||''}`;
class EquipmentPresentation extends ForgeFX{
  layout(){super.layout();if(this.texture&&this.item?.slot!=='WEAPON'){
    this.weaponWidth=Math.min(this.w*.62,this.h*.35*this.texture.width/this.texture.height);this.weaponHeight=this.weaponWidth*this.texture.height/this.texture.width;this.center.y=this.h*.5;
    this.weapon.width=this.weaponWidth;this.weapon.height=this.weaponHeight;this.makeFragments();this.render();
  }}
}
const api=(path,signal,body,options={})=>request(path,{signal:signal||lifetime.signal,body,token:activeToken,...options});
const connection=document.createElement('section');connection.className='forge-connection';connection.id='forge-connection';connection.hidden=true;connection.setAttribute('role','status');
connection.innerHTML='<p></p><button type="button" class="text-button" id="forge-retry">다시 시도</button>';document.querySelector('.control-panel').prepend(connection);
function connectionNotice(text='',retry=null,label='다시 시도'){
 connection.hidden=!text;connection.querySelector('p').textContent=text;const b=$('forge-retry');b.hidden=!retry;b.disabled=executing||recovering;b.textContent=label;b.onclick=retry;
}
function getPending(){return data?.accountId?readForgePending(localStorage,pendingKey()):null;}
function safePending(){try{return getPending();}catch(error){connectionNotice(error.message);return {invalid:true};}}
function removePending(key,requestId){try{if(readForgePending(localStorage,key)?.requestId===requestId)localStorage.removeItem(key);}catch{}}
function pendingNotice(){connectionNotice('이전 강화·복구 결과를 확인해야 합니다. 새 강화와 중복 차감은 막아 두었습니다.',()=>void recoverPending(false),'이전 결과 확인');$('rate-level').textContent='결과 확인';$('stage-status').textContent='이전 결과 확인 필요';recover.hidden=false;}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3500);}
function renderList(){
  const list=$('inventory-list'),viewport=$('inventory-scroll'),scrollTop=viewport.scrollTop;
  document.querySelectorAll('[data-filter],[data-mode]').forEach(b=>b.disabled=loading||executing||recovering);refresh.disabled=loading||executing||recovering;
  const focusedId=list.contains(document.activeElement)?document.activeElement.closest('[data-id]')?.dataset.id:null;
  $('inventory-count').textContent=String(visibleItems().length).padStart(2,'0')+(mode==='enhance'&&cursor?'+':'');
  $('inventory-more').hidden=!cursor||mode==='restore';$('inventory-more').disabled=loading||executing||recovering;
  list.innerHTML=visibleItems().map(item=>{
    const equipped=mode==='enhance'&&item.equipped===true;
    const power=item.enhancement?.power?.total??(mode==='restore'?forgePower(item.basePower.total,item.level).total:item.basePower?.total);
    return `<button class="equipment-row" data-id="${esc(item.selectionId)}" data-grade="${esc(item.grade)}" data-equipped="${equipped}" aria-pressed="${item.selectionId===selected}" aria-label="${esc(item.name)}, ${slots[item.slot]}, 전투력 ${number(power)}, ${mode==='restore'?'파괴 기록':equipped?'장착 중':'보유 장비'}, #${esc(item.instanceId)}" ${executing||recovering?'disabled':''}><span class="equipment-thumb"><img src="${esc(imageUrl(item.image))}" alt="" loading="lazy">${equipped?'<span class="equipment-equipped-badge"><svg aria-hidden="true"><use href="#i-shield"/></svg>장착 중</span>':''}</span><span class="equipment-copy"><small>${esc(item.grade)} · ${slots[item.slot]}</small><b>${esc(item.name)}</b><em>전투력 ${number(power)}</em><em>${mode==='restore'?'파괴 기록':equipped?'장착 중':'보유 장비'} · #${esc(item.instanceId)}</em></span><span class="equipment-level">${item.enhancement?`+${item.enhancement.level}`:mode==='restore'?`+${item.level}`:'—'}</span></button>`;
  }).join('')||`<div class="empty-inventory">${loading?'장비를 불러오는 중…':!activeToken?'로그인하면 보유한 무기와 방어구를 확인할 수 있습니다.':data?.publicVisible===false?'강화 센터를 준비하고 있습니다.':mode==='restore'?'복구할 파괴 기록이 없습니다.':'이 종류의 보유 장비가 없습니다.'}${!activeToken?'<a class="public-login" href="/">게임 로그인 ↗</a>':''}</div>`;
  list.querySelectorAll('img').forEach(img=>img.onerror=()=>{img.hidden=true;});
  viewport.scrollTop=scrollTop;
  if(focusedId)Array.from(list.querySelectorAll('[data-id]')).find(row=>row.dataset.id===focusedId)?.focus({preventScroll:true});
}
async function select(id){
  if(executing||recovering)return;selected=id;quote=null;quoteRetry=null;renderList();void updateQuote();const item=visibleItems().find(r=>r.selectionId===selected),stamp=generation;
  $('stage-empty').hidden=!!item;$('weapon-fallback').hidden=true;
  if(!item){$('stage-item-sub').dataset.equipped='false';$('stage-item-name').textContent=mode==='restore'?'파괴 기록 보관소':'장비를 선택하세요';$('stage-item-sub').textContent='무기 · 상의 · 하의 · 신발 · 장신구';$('stage-grade').textContent='EQUIPMENT ARCHIVE';$('power-before').textContent='—';$('stage-code').textContent='EQUIPMENT ARCHIVE';$('stage-rule').textContent='무기 · 방어구 · 장신구';if(fx?.weapon){fx.loadGeneration++;fx.weapon.visible=false;fx.texture=null;}return;}
  $('stage-item-sub').dataset.equipped=String(mode==='enhance'&&item.equipped===true);$('stage-item-name').textContent=item.name;$('stage-grade').textContent=item.grade+' EQUIPMENT';$('stage-item-sub').textContent=slots[item.slot]+(mode==='restore'?' · 파괴 기록':item.equipped===true?' · 장착 중':' · 보유 장비');$('stage-code').textContent='EQUIPMENT / #'+item.instanceId;
  const currentPower=item.enhancement?.power||(mode==='restore'?forgePower(item.basePower.total,item.level):item.basePower);$('power-before').textContent=number(Math.max(0,Math.trunc(currentPower.total)));$('stage-rule').textContent=`PVE ${number(currentPower.pve)} · PVP ${number(currentPower.pvp)}`;$('stage-level').textContent=item.enhancement?`+${item.enhancement.level}`:mode==='restore'?`파괴 당시 +${item.level}`:'강화 대기';
  const image=imageUrl(item.image);$('weapon-fallback').src=image;$('weapon-fallback').classList.toggle('is-armor',item.slot!=='WEAPON');
  if(fx){try{await fx.setItem({...item,image});if(stamp!==generation||selected!==id)return;fx.weapon.visible=true;$('weapon-fallback').hidden=true;return;}catch{}}
  if(stamp===generation&&selected===id)$('weapon-fallback').hidden=!image;
}
async function load(more=false){
  if(executing||recovering||loading&&activeToken===token())return;controller?.abort();const loadController=new AbortController();controller=loadController;const current=++generation,nextToken=token();
  if(activeToken!==nextToken){lifetime.abort();lifetime=new AbortController();data=null;items=[];selected=null;checkedPending='';}
  activeToken=nextToken;loading=true;quoteGeneration++;quoteQueue.invalidate();quote=null;quoteRetry=null;for(const id of ['enhance-button','restore-button'])$(id).disabled=true;
  if(!more){cursor=null;$('inventory-scroll').scrollTop=0;}renderList();
  try{
    if(!activeToken){data=await api('status',loadController.signal);if(current!==generation)return;items=[];selected=null;$('wallet-coins').textContent='—';$('opening-notice').textContent=data.notice;$('opening-title').textContent=data.canEnhance?'장비 강화 센터':'강화 센터 준비 중';document.querySelector('.forge-opening > strong').textContent=data.canEnhance?'강화 OPEN':'강화 OFF';void select(null);return;}
    const result=await api('state?group='+group+(more&&cursor?'&beforeId='+encodeURIComponent(cursor):''),loadController.signal);
    if(current!==generation||activeToken!==token())return;data=result;items=more?[...items,...result.items]:result.items;cursor=result.nextCursor;
    $('wallet-coins').textContent=number(result.wallet.coins);$('inventory-note').textContent='강화 전투력 높은 순 · 같은 장비도 개별 선택';
    $('opening-title').textContent=result.canEnhance?'장비 강화 센터':result.publicVisible?'강화 오픈 준비 중':'강화 센터 준비 중';$('opening-notice').textContent=result.notice;document.querySelector('.forge-opening > strong').textContent=result.canEnhance?(result.executionMode==='TEST'?'검수 모드':'강화 OPEN'):'강화 OFF';
    $('record-count').textContent=String((result.records||[]).filter(r=>!r.restoredInstanceId).length);
    $('stage-status').textContent=result.canEnhance?'확률·비용 확인':'현재 이용 불가';
    if(result.canEnhance){document.querySelector('.success-label p').textContent='장비를 선택하면 현재 단계의 확률을 확인합니다.';document.querySelector('.risk-note p').textContent='확률·비용 확인 후 강화할 수 있습니다. 견적 조회만으로는 재료가 소모되지 않습니다.';}
    document.querySelector('.history-list').innerHTML=(result.history||[]).map(r=>`<p>${esc(outcomeNames[r.outcome]||'결과 확인 중')} · ${esc(new Date(r.createdAt).toLocaleString('ko-KR'))}</p>`).join('')||'<p class="empty-history">아직 강화 기록이 없습니다.</p>';
    $('protection-toggle').disabled=!result.canEnhance||!result.policy.protection?.itemCode||executing;$('protection-toggle').setAttribute('aria-label','장비보호권 사용');
    document.querySelector('.protection-card small').textContent=result.wallet.protection===null?'출시 예정':`보유 ${number(result.wallet.protection)}장`;
    const rows=visibleItems();void select(rows.some(r=>r.selectionId===selected)?selected:mode==='enhance'?items.find(r=>r.equipped)?.instanceId||items[0]?.instanceId||null:rows[0]?.selectionId||null);lastLoad=Date.now();
    const pending=safePending();recover.hidden=!pending;if(pending&&!pending.invalid&&checkedPending!==pending.requestId){checkedPending=pending.requestId;void recoverPending(false);}
  }catch(e){if(current!==generation)return;if(e.status===401){data=null;items=[];activeToken='';$('wallet-coins').textContent='—';void select(null);}if(e.name!=='AbortError'){$('inventory-note').textContent=e.message;connectionNotice(e.message,()=>void load(),'목록 다시 불러오기');toast(e.message);}}
  finally{if(current===generation){loading=false;renderList();}}
}
async function switchMode(next){if(executing||recovering)return;mode=next;$('inventory-scroll').scrollTop=0;for(const b of document.querySelectorAll('[data-mode]')){const active=b.dataset.mode===mode;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}$('workspace').setAttribute('aria-labelledby','tab-'+mode);$('inventory-heading').textContent=mode==='enhance'?'보유 장비':'파괴 기록';$('inventory-filters').hidden=mode==='restore';$('enhance-options').hidden=mode==='restore';$('restore-options').hidden=mode==='enhance';renderList();await select(visibleItems()[0]?.selectionId||null);}
$('inventory-list').addEventListener('click',e=>{const row=e.target.closest('[data-id]');if(row)void select(row.dataset.id);});
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{group=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));void load();});
document.querySelectorAll('[data-mode]').forEach(b=>{b.onclick=()=>void switchMode(b.dataset.mode);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=mode==='enhance'?'restore':'enhance';void switchMode(next);$('tab-'+next).focus();}};});
$('inventory-more').onclick=()=>void load(true);$('archive-button').onclick=()=>void switchMode('restore');
$('rules-button').onclick=()=>$('rules-dialog').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('rules-dialog').close());
async function updateQuote(){
 const stamp=++quoteGeneration;quote=null;for(const id of ['enhance-button','restore-button'])$(id).disabled=true;
 const pending=safePending();if(pending){$('protection-toggle').disabled=true;if(!pending.invalid)pendingNotice();for(const id of ['enhance-button','restore-button'])$(id).querySelector('span').textContent='이전 결과 확인 필요';return;}
 if(mode==='enhance'){
  $('success-rate').textContent='—';$('rate-level').textContent='견적 확인';$('power-after').textContent='—';
  document.querySelectorAll('.rate-legend b').forEach(b=>b.textContent='—');document.querySelector('.probability-bar').style.background='';
  document.querySelector('.material-list').textContent='장비를 선택하면 확정 비용을 확인합니다.';
 }else{document.querySelector('.restore-snapshot').textContent='복구할 파괴 기록을 선택하세요.';document.querySelector('.restore-policy').textContent='선택 후 복구 비용을 확인합니다.';}
 const item=visibleItems().find(r=>r.selectionId===selected),protection=$('protection-toggle');
 const protectionQuantity=data?.policy?.steps?.[item?.enhancement?.level]?.protectionQuantity;
 protection.disabled=executing||recovering||mode!=='enhance'||!data?.canEnhance||!data?.policy?.protection?.itemCode||!(protectionQuantity>0);
 if(protection.disabled&&!executing)protection.checked=false;
 protection.title=protectionQuantity===0?'이 단계에서는 보호권을 사용할 수 없습니다.':'';
 if(executing||recovering)return;
 if(!item||!(mode==='enhance'?data?.canEnhance:data?.canRestore)){connectionNotice();$(mode+'-button').querySelector('span').textContent=!activeToken?'로그인 필요':!item?'장비를 선택하세요':'현재 이용 불가';return;}
 const button=$(mode+'-button');button.querySelector('span').textContent='확률·비용 확인 중';
 const body={requestId:crypto.randomUUID(),kind:mode.toUpperCase(),...(mode==='enhance'?{instanceId:item.instanceId,useProtection:$('protection-toggle').checked}:{recordId:item.recordId})};
 const key=JSON.stringify([activeToken,body.kind,item.selectionId,item.enhancement?.revision,data.policy?.revision,body.useProtection]);
 connectionNotice('확률과 비용을 확인하고 있습니다.');
 try{const q=await quoteQueue.select(key,body,{token:activeToken,signal:lifetime.signal,onRetry:()=>{if(stamp===quoteGeneration)connectionNotice('연결을 다시 확인 중입니다. 재료는 소모되지 않았습니다.');}});if(!q||stamp!==quoteGeneration||activeToken!==token())return;quote=q;quoteRetry=null;connectionNotice();
  if(mode==='enhance'){$('success-rate').textContent=`${q.cost.successPpm/10000}%`;$('rate-level').textContent=`+${q.item.level} → +${q.item.level+1}`;$('power-after').textContent=number(forgePower(q.item.basePower.total,q.item.level+1).total);
   const success=q.cost.successPpm/10000,maintain=(q.cost.successPpm+q.cost.maintainPpm)/10000;document.querySelector('.probability-bar').style.background=`linear-gradient(to right,#cbff66 0 ${success}%,#8499b4 ${success}% ${maintain}%,#fc7382 ${maintain}% 100%)`;
   for(const [key,label]of[['success','successPpm'],['maintain','maintainPpm'],['destroy','destroyPpm']])document.querySelector(`.rate-legend .${key} b`).textContent=`${q.cost[label]/10000}%`;
   document.querySelector('.material-heading span').textContent=`마스터의 별 보유 ${number(data.wallet.masterStars)}개`;document.querySelector('.success-label p').textContent='현재 장비 단계의 확정된 견적입니다.';document.querySelector('.material-list').textContent=`${coin(q.cost.coinCost)} 코인${q.cost.itemCode?` · ${q.cost.itemCode==='MASTER_STAR'?'마스터의 별':q.cost.itemName||q.cost.itemCode} ${number(q.cost.itemQuantity)}개`:''}`;
   document.querySelector('.consumption-note').textContent=q.protectedAttempt?`+${q.item.level+1} 도전 · 보호권 ${q.cost.protectionQuantity}장 필요 · ${q.protection.consume==='ON_DESTROY'?'파괴 결과일 때만 소모':'강화 시도 시 소모'}`:'보호권 미사용';
   document.querySelector('.risk-note p').textContent=q.protectedAttempt?'파괴 결과가 나오면 보호권으로 장비를 보존합니다.':'파괴 시 장착이 해제되며 장비는 파괴 기록에 보관됩니다.';
  }else{document.querySelector('.restore-coupon').hidden=!q.cost.itemCode;const couponImage=document.querySelector('.restore-coupon img'),source=q.cost.itemImage?imageUrl(q.cost.itemImage):'';couponImage.hidden=!source;if(source)couponImage.src=source;document.querySelector('.restore-coupon b').textContent=q.cost.itemName||'복구 재료';document.querySelector('.restore-coupon div span').textContent=`${q.cost.itemQuantity||0}개 사용`;document.querySelector('.restore-snapshot').textContent=`${q.item.name} · +${q.cost.levelMode==='PREVIOUS'?q.item.level:0} 복구`;document.querySelector('.restore-policy').textContent=`${coin(q.cost.coinCost)} 코인${q.cost.itemCode?` · ${q.cost.itemCode==='MASTER_STAR'?'마스터의 별':q.cost.itemName||q.cost.itemCode} ${q.cost.itemQuantity}개`:''} · ${q.cost.expiresHours?`${q.cost.expiresHours}시간 이내`:'기간 제한 없음'}`;}
  const shortages=forgeQuoteShortages(q,data.wallet);
  if(shortages.length)connectionNotice(shortages.join('\n'),()=>void load(),'보유 수량 새로고침');
  button.querySelector('span').textContent=shortages.length?'재료 수량 확인 필요':mode==='enhance'?`+${q.item.level+1} 강화 시도`:'선택 장비 복구';button.disabled=executing||shortages.length>0;
 }catch(e){if(stamp===quoteGeneration&&e.name!=='AbortError'){quoteRetry=()=>void updateQuote();button.querySelector('span').textContent='견적 다시 확인';button.disabled=false;connectionNotice(e.message,quoteRetry,'견적 다시 확인');toast(e.message);}}
}
async function showReceipt(receipt,{animate=true}={}){
 const renderer=fx,stamp=++fxGeneration;
 if(animate&&renderer&&!document.hidden){let timer;try{
  await Promise.race([(async()=>{if(receipt.item)await renderer.setItem({...receipt.item,image:imageUrl(receipt.item.image)});if(stamp!==fxGeneration)return;await renderer.sound.enable(localStorage.getItem('cnine_battle_sound')!=='OFF');if(stamp!==fxGeneration)return;await renderer.play(receipt.outcome==='RESTORED'?'restore':receipt.outcome.toLowerCase());})(),new Promise(resolve=>{timer=setTimeout(()=>{fxGeneration++;renderer.loadGeneration++;renderer.cancel();resolve();},8500);})]);
 }catch{toast('확정된 결과를 갱신합니다.');}finally{clearTimeout(timer);}}
 toast(`${outcomeNames[receipt.outcome]}${receipt.outcome==='DESTROY'?'':` · +${receipt.level}`}`);$('stage-status').textContent=outcomeNames[receipt.outcome];
}
async function recoverPending(submit=false){
 if(executing||recovering)return;const pending=safePending();if(!pending||pending.invalid)return;
 const key=pendingKey(),auth=activeToken;recovering=true;quoteGeneration++;quoteQueue.invalidate();quote=null;recover.disabled=true;renderList();
 connectionNotice('이전 요청의 서버 영수증을 확인하고 있습니다.');let refreshNeeded=false;
 try{
  let receipt;try{receipt=await api('receipt?requestId='+encodeURIComponent(pending.requestId)+'&kind='+pending.kind,undefined,undefined,{token:auth});}catch(error){if(error.code!=='JOINT_NOT_FOUND')throw error;}
  if(receipt?.status!=='COMPLETED'&&submit){recovering=false;return await submitPending(pending,key,auth);}
  if(receipt?.status==='COMPLETED'){removePending(key,pending.requestId);if(auth===token()){connectionNotice();await showReceipt(receipt,{animate:false});refreshNeeded=true;}}
  else if(auth===token())connectionNotice('완료된 결과가 아직 없습니다. 같은 요청을 이어서 확인하면 중복 차감 없이 재개합니다.',()=>void recoverPending(true),'같은 요청 이어서 확인');
 }catch(error){if(auth===token()){if(terminalForgeErrors.has(error.code)){removePending(key,pending.requestId);toast(error.message);refreshNeeded=true;}else connectionNotice(error.message,()=>void recoverPending(false),'결과 다시 확인');}}
 finally{recovering=false;recover.disabled=false;$('forge-retry').disabled=false;recover.hidden=!safePending();renderList();if(refreshNeeded||auth!==token())await load();}
}
async function submitPending(pending,key,auth){
 executing=true;quoteGeneration++;quoteQueue.invalidate();quote=null;renderList();for(const id of ['enhance-button','restore-button'])$(id).disabled=true;$('protection-toggle').disabled=true;recover.disabled=true;
 connectionNotice('강화 요청을 처리하고 있습니다. 결과가 확정될 때까지 중복 요청을 막습니다.');let refreshNeeded=false;
 try{
  const receipt=await api(pending.kind==='ENHANCE'?'enhance':'restore',undefined,{requestId:pending.requestId,quoteId:pending.quoteId},{token:auth,retries:2,lockOnly:true,onRetry:()=>connectionNotice('같은 계정의 작업이 끝나기를 잠시 기다린 뒤 재확인합니다. 새 요청은 만들지 않습니다.')});
  if(receipt.status!=='COMPLETED')throw Error('아직 처리 중입니다. 결과 다시 확인을 눌러 주세요.');
  removePending(key,pending.requestId);if(auth===token()){connectionNotice();await showReceipt(receipt);refreshNeeded=true;}
 }catch(error){if(auth===token()){toast(error.message);if(terminalForgeErrors.has(error.code)){removePending(key,pending.requestId);refreshNeeded=true;}else connectionNotice(error.message,()=>void recoverPending(false),'결과 다시 확인');}}
 finally{executing=false;recover.disabled=false;recover.hidden=!safePending();$('forge-retry').disabled=false;renderList();if(refreshNeeded||auth!==token())await load();else if(!safePending())void updateQuote();}
}
async function execute(){
 if(executing||recovering)return;if(safePending())return recoverPending(true);if(quoteRetry)return quoteRetry();if(!quote)return;
 if(forgeQuoteShortages(quote,data?.wallet).length)return;
 if(Date.parse(quote.expiresAt)<=Date.now()+1000){quoteQueue.invalidate();return updateQuote();}
 const pending={requestId:crypto.randomUUID(),quoteId:quote.quoteId,kind:quote.kind},key=pendingKey();
 try{localStorage.setItem(key,JSON.stringify(pending));}catch{return connectionNotice('요청 기록을 저장할 수 없어 강화를 시작하지 않았습니다. 브라우저 저장 공간을 확인하세요.');}
 return submitPending(pending,key,activeToken);
}
$('enhance-button').onclick=execute;$('restore-button').onclick=execute;$('protection-toggle').onchange=()=>void updateQuote();
const recover=document.createElement('button');recover.className='text-button';recover.textContent='결과 다시 확인';recover.hidden=true;recover.onclick=()=>void recoverPending(false);document.querySelector('.inventory-footer').append(recover);
document.addEventListener('visibilitychange',()=>{fx?.suspend(document.hidden);if(!document.hidden&&fx?.running)fx.pause(false);});
$('weapon-fallback').onerror=()=>{$('weapon-fallback').hidden=true;$('stage-empty').hidden=false;};
const refresh=document.createElement('button');refresh.className='text-button';refresh.id='refresh-equipment';refresh.textContent='다시 불러오기';refresh.onclick=()=>void load();document.querySelector('.inventory-footer').append(refresh);
window.addEventListener('storage',e=>{if(e.key==='cnine_card_api_token')void load();else if(e.key===pendingKey()){quoteGeneration++;quoteQueue.invalidate();quote=null;if(safePending())void updateQuote();else void load();}});window.addEventListener('focus',()=>{if(activeToken!==token()||Date.now()-lastLoad>60000)void load();});
window.addEventListener('pagehide',()=>{controller?.abort();lifetime.abort();quoteQueue.invalidate();fxGeneration++;fx?.destroy();fx=null;});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
void (async()=>{const renderer=new EquipmentPresentation($('fx-host'));let timer;try{await Promise.race([renderer.init(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FX_INIT_TIMEOUT')),10000);})]);if(lifetime.signal.aborted){renderer.destroy();return;}fx=renderer;fx.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;fx.suspend(document.hidden);if(selected&&!executing&&!recovering)void select(selected);}catch{renderer.destroy();}finally{clearTimeout(timer);}})();
await load();
