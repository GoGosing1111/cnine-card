import {ForgeFX} from '/preview/equipment-forge-v1/source/fx.mjs';
import {forgePower} from '/shared/equipment-forge-policy-v1.mjs';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slots={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구'};
const token=()=>localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
function imageUrl(raw){try{const u=new URL(raw,location.origin+'/');return ((u.origin===location.origin&&u.pathname.startsWith('/assets/'))||u.protocol==='https:')&&!u.username&&!u.password?u.href:'';}catch{return '';}}
const number=v=>{try{return BigInt(v).toLocaleString('ko-KR');}catch{return '—';}};
const coin=v=>{try{const n=BigInt(v);if(n<100000000n)return number(n);const fraction=(n%100000000n).toString().padStart(8,'0').replace(/0+$/,'');return `${number(n/100000000n)}${fraction?'.'+fraction:''}억`;}catch{return '—';}};
let data=null,items=[],cursor=null,group='all',mode='enhance',selected=null,loading=false,generation=0,controller=null,fx=null,activeToken=token(),lastLoad=0,quote=null,quoteGeneration=0,executing=false;
const outcomeNames={SUCCESS:'강화 성공',MAINTAIN:'강화 유지',DESTROY:'장비 파괴',PROTECTED:'장비 보호 성공',RESTORED:'장비 복구 완료'};
const visibleItems=()=>mode==='restore'?(data?.records||[]).filter(r=>!r.restoredInstanceId).map(r=>({...r,selectionId:r.recordId})):items.map(r=>({...r,selectionId:r.instanceId}));
const pendingKey=()=>`cnine.forge.pending:${data?.accountId||''}`;
class EquipmentPresentation extends ForgeFX{
  layout(){super.layout();if(this.texture&&this.item?.slot!=='WEAPON'){
    this.weaponWidth=Math.min(this.w*.62,this.h*.35*this.texture.width/this.texture.height);this.weaponHeight=this.weaponWidth*this.texture.height/this.texture.width;this.center.y=this.h*.5;
    this.weapon.width=this.weaponWidth;this.weapon.height=this.weaponHeight;this.makeFragments();this.render();
  }}
}
async function api(path,signal,body){const response=await fetch('/api/character/equipment/forge/'+path,{signal,cache:'no-store',method:body?'POST':'GET',headers:{...(activeToken?{authorization:`Bearer ${activeToken}`} :{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok){const e=Error(result.error||'장비 정보를 불러오지 못했습니다.');e.status=response.status;e.code=result.code;throw e;}return result;}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3500);}
function renderList(){
  const list=$('inventory-list'),viewport=$('inventory-scroll'),scrollTop=viewport.scrollTop;
  const focusedId=list.contains(document.activeElement)?document.activeElement.closest('[data-id]')?.dataset.id:null;
  $('inventory-count').textContent=String(visibleItems().length).padStart(2,'0')+(mode==='enhance'&&cursor?'+':'');
  $('inventory-more').hidden=!cursor||mode==='restore';$('inventory-more').disabled=loading;
  list.innerHTML=visibleItems().map(item=>{
    const equipped=mode==='enhance'&&item.equipped===true;
    return `<button class="equipment-row" data-id="${esc(item.selectionId)}" data-grade="${esc(item.grade)}" data-equipped="${equipped}" aria-pressed="${item.selectionId===selected}" aria-label="${esc(item.name)}, ${slots[item.slot]}, ${mode==='restore'?'파괴 기록':equipped?'장착 중':'보유 장비'}, #${esc(item.instanceId)}" ${executing?'disabled':''}><span class="equipment-thumb"><img src="${esc(imageUrl(item.image))}" alt="" loading="lazy">${equipped?'<span class="equipment-equipped-badge"><svg aria-hidden="true"><use href="#i-shield"/></svg>장착 중</span>':''}</span><span class="equipment-copy"><small>${esc(item.grade)} · ${slots[item.slot]}</small><b>${esc(item.name)}</b><em>${mode==='restore'?'파괴 기록':equipped?'장착 중':'보유 장비'} · #${esc(item.instanceId)}</em></span><span class="equipment-level">${item.enhancement?`+${item.enhancement.level}`:mode==='restore'?`+${item.level}`:'—'}</span></button>`;
  }).join('')||`<div class="empty-inventory">${loading?'장비를 불러오는 중…':!activeToken?'로그인하면 보유한 무기와 방어구를 확인할 수 있습니다.':data?.publicVisible===false?'강화 센터를 준비하고 있습니다.':mode==='restore'?'복구할 파괴 기록이 없습니다.':'이 종류의 보유 장비가 없습니다.'}${!activeToken?'<a class="public-login" href="/">게임 로그인 ↗</a>':''}</div>`;
  list.querySelectorAll('img').forEach(img=>img.onerror=()=>{img.hidden=true;});
  viewport.scrollTop=scrollTop;
  if(focusedId)Array.from(list.querySelectorAll('[data-id]')).find(row=>row.dataset.id===focusedId)?.focus({preventScroll:true});
}
async function select(id){
  if(executing)return;selected=id;quote=null;renderList();void updateQuote();const item=visibleItems().find(r=>r.selectionId===selected),stamp=generation;
  $('stage-empty').hidden=!!item;$('weapon-fallback').hidden=true;
  if(!item){$('stage-item-sub').dataset.equipped='false';$('stage-item-name').textContent=mode==='restore'?'파괴 기록 보관소':'장비를 선택하세요';$('stage-item-sub').textContent='무기 · 상의 · 하의 · 신발 · 장신구';$('stage-grade').textContent='EQUIPMENT ARCHIVE';$('power-before').textContent='—';$('stage-code').textContent='EQUIPMENT ARCHIVE';$('stage-rule').textContent='무기 · 방어구 · 장신구';if(fx?.weapon){fx.loadGeneration++;fx.weapon.visible=false;fx.texture=null;}return;}
  $('stage-item-sub').dataset.equipped=String(mode==='enhance'&&item.equipped===true);$('stage-item-name').textContent=item.name;$('stage-grade').textContent=item.grade+' EQUIPMENT';$('stage-item-sub').textContent=slots[item.slot]+(mode==='restore'?' · 파괴 기록':item.equipped===true?' · 장착 중':' · 보유 장비');$('stage-code').textContent='EQUIPMENT / #'+item.instanceId;
  const currentPower=item.enhancement?.power||(mode==='restore'?forgePower(item.basePower.total,item.level):item.basePower);$('power-before').textContent=number(Math.max(0,Math.trunc(currentPower.total)));$('stage-rule').textContent=`PVE ${number(currentPower.pve)} · PVP ${number(currentPower.pvp)}`;$('stage-level').textContent=item.enhancement?`+${item.enhancement.level}`:mode==='restore'?`파괴 당시 +${item.level}`:'강화 대기';
  const image=imageUrl(item.image);$('weapon-fallback').src=image;$('weapon-fallback').classList.toggle('is-armor',item.slot!=='WEAPON');
  if(fx){try{await fx.setItem({...item,image});if(stamp!==generation||selected!==id)return;fx.weapon.visible=true;$('weapon-fallback').hidden=true;return;}catch{}}
  if(stamp===generation&&selected===id)$('weapon-fallback').hidden=!image;
}
async function load(more=false){
  if(executing)return;controller?.abort();controller=new AbortController();const current=++generation;activeToken=token();loading=true;
  if(!more){items=[];cursor=null;selected=null;$('inventory-scroll').scrollTop=0;await select(null);}renderList();
  const timeout=setTimeout(()=>controller?.abort(),25000);
  try{
    if(!more){data=await api('status',controller.signal);if(current!==generation)return;$('opening-notice').textContent=data.notice;$('opening-title').textContent=data.publicVisible?'강화 오픈 준비 중':'강화 센터 준비 중';}
    if(!activeToken||!data?.publicVisible){$('wallet-coins').textContent='—';return;}
    const result=await api('state?group='+group+(more&&cursor?'&beforeId='+encodeURIComponent(cursor):''),controller.signal);
    if(current!==generation||activeToken!==token())return;data=result;items=more?[...items,...result.items]:result.items;cursor=result.nextCursor;
    $('wallet-coins').textContent=number(result.wallet.coins);$('inventory-note').textContent='무기 · 방어구 · 장신구를 개별 장비 단위로 확인합니다.';
    $('opening-title').textContent=result.canEnhance?'장비 강화 센터':result.publicVisible?'강화 오픈 준비 중':'강화 센터 준비 중';$('opening-notice').textContent=result.notice;document.querySelector('.forge-opening > strong').textContent=result.canEnhance?(result.executionMode==='TEST'?'검수 모드':'강화 OPEN'):'강화 OFF';
    $('record-count').textContent=String((result.records||[]).filter(r=>!r.restoredInstanceId).length);
    document.querySelector('.history-list').innerHTML=(result.history||[]).map(r=>`<p>${esc(outcomeNames[r.outcome]||'결과 확인 중')} · ${esc(new Date(r.createdAt).toLocaleString('ko-KR'))}</p>`).join('')||'<p class="empty-history">아직 강화 기록이 없습니다.</p>';
    $('protection-toggle').disabled=!result.canEnhance||!result.policy.protection?.itemCode||executing;$('protection-toggle').setAttribute('aria-label','장비보호권 사용');
    document.querySelector('.protection-card small').textContent=result.wallet.protection===null?'출시 예정':`보유 ${number(result.wallet.protection)}개`;
    if(mode==='enhance')await select(selected||items.find(r=>r.equipped)?.instanceId||items[0]?.instanceId||null);else await select(visibleItems()[0]?.selectionId||null);lastLoad=Date.now();
  }catch(e){if(current!==generation)return;if(e.status===401){items=[];activeToken='';$('wallet-coins').textContent='—';await select(null);}if(e.name!=='AbortError'){$('inventory-note').textContent=e.message;toast(e.message);}else $('inventory-note').textContent='연결이 지연됩니다. 다시 불러오기를 눌러 주세요.';}
  finally{clearTimeout(timeout);if(current===generation){loading=false;renderList();}}
}
async function switchMode(next){if(executing)return;mode=next;$('inventory-scroll').scrollTop=0;for(const b of document.querySelectorAll('[data-mode]')){const active=b.dataset.mode===mode;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}$('workspace').setAttribute('aria-labelledby','tab-'+mode);$('inventory-heading').textContent=mode==='enhance'?'보유 장비':'파괴 기록';$('inventory-filters').hidden=mode==='restore';$('enhance-options').hidden=mode==='restore';$('restore-options').hidden=mode==='enhance';renderList();await select(visibleItems()[0]?.selectionId||null);}
$('inventory-list').addEventListener('click',e=>{const row=e.target.closest('[data-id]');if(row)void select(row.dataset.id);});
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{group=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));void load();});
document.querySelectorAll('[data-mode]').forEach(b=>{b.onclick=()=>void switchMode(b.dataset.mode);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=mode==='enhance'?'restore':'enhance';void switchMode(next);$('tab-'+next).focus();}};});
$('inventory-more').onclick=()=>void load(true);$('archive-button').onclick=()=>void switchMode('restore');
$('rules-button').onclick=()=>$('rules-dialog').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('rules-dialog').close());
async function updateQuote(){
 const stamp=++quoteGeneration;quote=null;for(const id of ['enhance-button','restore-button'])$(id).disabled=true;
 if(mode==='enhance'){
  $('success-rate').textContent='—';$('rate-level').textContent='견적 확인';$('power-after').textContent='—';
  document.querySelectorAll('.rate-legend b').forEach(b=>b.textContent='—');document.querySelector('.probability-bar').style.background='';
  document.querySelector('.material-list').textContent='장비를 선택하면 확정 비용을 확인합니다.';
 }else{document.querySelector('.restore-snapshot').textContent='복구할 파괴 기록을 선택하세요.';document.querySelector('.restore-policy').textContent='선택 후 복구 비용을 확인합니다.';}
 const item=visibleItems().find(r=>r.selectionId===selected),protection=$('protection-toggle');
 const protectionQuantity=data?.policy?.steps?.[item?.enhancement?.level]?.protectionQuantity;
 protection.disabled=executing||Boolean(localStorage.getItem(pendingKey()))||mode!=='enhance'||!data?.canEnhance||!data?.policy?.protection?.itemCode||!(protectionQuantity>0);
 if(protection.disabled&&!executing)protection.checked=false;
 protection.title=protectionQuantity===0?'이 단계에서는 보호권을 사용할 수 없습니다.':'';
 if(localStorage.getItem(pendingKey())||!item||!(mode==='enhance'?data?.canEnhance:data?.canRestore))return;
 const button=$(mode+'-button');button.querySelector('span').textContent='확률·비용 확인 중';
 try{const q=await api('quote',undefined,{requestId:crypto.randomUUID(),kind:mode.toUpperCase(),...(mode==='enhance'?{instanceId:item.instanceId,useProtection:$('protection-toggle').checked}:{recordId:item.recordId})});if(stamp!==quoteGeneration)return;quote=q;
  if(mode==='enhance'){$('success-rate').textContent=`${q.cost.successPpm/10000}%`;$('rate-level').textContent=`+${q.item.level} → +${q.item.level+1}`;$('power-after').textContent=number(forgePower(q.item.basePower.total,q.item.level+1).total);
   const success=q.cost.successPpm/10000,maintain=(q.cost.successPpm+q.cost.maintainPpm)/10000;document.querySelector('.probability-bar').style.background=`linear-gradient(to right,#cbff66 0 ${success}%,#8499b4 ${success}% ${maintain}%,#fc7382 ${maintain}% 100%)`;
   for(const [key,label]of[['success','successPpm'],['maintain','maintainPpm'],['destroy','destroyPpm']])document.querySelector(`.rate-legend .${key} b`).textContent=`${q.cost[label]/10000}%`;
   document.querySelector('.material-heading span').textContent=`마스터의 별 보유 ${number(data.wallet.masterStars)}개`;document.querySelector('.success-label p').textContent='현재 장비 단계의 확정된 견적입니다.';document.querySelector('.material-list').textContent=`${coin(q.cost.coinCost)} 코인${q.cost.itemCode?` · ${q.cost.itemCode==='MASTER_STAR'?'마스터의 별':q.cost.itemName||q.cost.itemCode} ${number(q.cost.itemQuantity)}개`:''}`;
   document.querySelector('.consumption-note').textContent=q.protectedAttempt?`보호권 ${q.cost.protectionQuantity}개 · ${q.protection.consume==='ON_DESTROY'?'파괴 결과일 때만 소모':'강화 시도 시 소모'}`:'보호권 미사용';
   document.querySelector('.risk-note p').textContent=q.protectedAttempt?'파괴 결과가 나오면 보호권으로 장비를 보존합니다.':'파괴 시 장착이 해제되며 장비는 파괴 기록에 보관됩니다.';
  }else{document.querySelector('.restore-coupon').hidden=!q.cost.itemCode;const couponImage=document.querySelector('.restore-coupon img'),source=q.cost.itemImage?imageUrl(q.cost.itemImage):'';couponImage.hidden=!source;if(source)couponImage.src=source;document.querySelector('.restore-coupon b').textContent=q.cost.itemName||'복구 재료';document.querySelector('.restore-coupon div span').textContent=`${q.cost.itemQuantity||0}개 사용`;document.querySelector('.restore-snapshot').textContent=`${q.item.name} · +${q.cost.levelMode==='PREVIOUS'?q.item.level:0} 복구`;document.querySelector('.restore-policy').textContent=`${coin(q.cost.coinCost)} 코인${q.cost.itemCode?` · ${q.cost.itemCode==='MASTER_STAR'?'마스터의 별':q.cost.itemName||q.cost.itemCode} ${q.cost.itemQuantity}개`:''} · ${q.cost.expiresHours?`${q.cost.expiresHours}시간 이내`:'기간 제한 없음'}`;}
  button.querySelector('span').textContent=mode==='enhance'?`+${q.item.level+1} 강화 시도`:'선택 장비 복구';button.disabled=executing;
 }catch(e){if(stamp===quoteGeneration){button.querySelector('span').textContent=e.message;toast(e.message);}}
}
async function execute(){
 if(executing)return;let pending;try{pending=JSON.parse(localStorage.getItem(pendingKey())||'null');}catch{}
 if(!pending){if(!quote)return;pending={requestId:crypto.randomUUID(),quoteId:quote.quoteId,kind:quote.kind};localStorage.setItem(pendingKey(),JSON.stringify(pending));}
 executing=true;renderList();for(const id of ['enhance-button','restore-button'])$(id).disabled=true;$('protection-toggle').disabled=true;
 try{const receipt=await api(pending.kind==='ENHANCE'?'enhance':'restore',undefined,{requestId:pending.requestId,quoteId:pending.quoteId});
  if(receipt.status!=='COMPLETED')throw Error('아직 처리 중입니다. 결과 다시 확인을 눌러 주세요.');
  localStorage.removeItem(pendingKey());if(fx){try{if(receipt.item){$('stage-item-name').textContent=receipt.item.name;await fx.setItem({...receipt.item,image:imageUrl(receipt.item.image)});}await fx.sound.enable(localStorage.getItem('cnine_battle_sound')!=='OFF');await fx.play(receipt.outcome==='RESTORED'?'restore':receipt.outcome.toLowerCase());}catch{toast('연출을 불러오지 못했습니다. 확정된 결과를 갱신합니다.');}}
  toast(`${outcomeNames[receipt.outcome]}${receipt.outcome==='DESTROY'?'':` · +${receipt.level}`}`);$('stage-status').textContent=outcomeNames[receipt.outcome];executing=false;await load();
 }catch(e){toast(e.message);if(['JOINT_OPERATION_SUPERSEDED','FORGE_RECORD','FORGE_QUOTE_EXPIRED','FORGE_STALE','FORGE_FUNDS','FORGE_MATERIAL','FORGE_QUOTE'].includes(e.code))localStorage.removeItem(pendingKey());}
 finally{executing=false;recover.hidden=!localStorage.getItem(pendingKey());renderList();void updateQuote();}
}
$('enhance-button').onclick=execute;$('restore-button').onclick=execute;$('protection-toggle').onchange=()=>void updateQuote();
const recover=document.createElement('button');recover.className='text-button';recover.textContent='결과 다시 확인';recover.hidden=true;recover.onclick=execute;document.querySelector('.inventory-footer').append(recover);
document.addEventListener('visibilitychange',()=>{fx?.suspend(document.hidden);if(!document.hidden&&fx?.running)fx.pause(false);});
$('weapon-fallback').onerror=()=>{$('weapon-fallback').hidden=true;$('stage-empty').hidden=false;};
const refresh=document.createElement('button');refresh.className='text-button';refresh.id='refresh-equipment';refresh.textContent='다시 불러오기';refresh.onclick=()=>void load();document.querySelector('.inventory-footer').append(refresh);
window.addEventListener('storage',e=>{if(e.key==='cnine_card_api_token')void load();});window.addEventListener('focus',()=>{if(activeToken!==token()||Date.now()-lastLoad>60000)void load();});
window.addEventListener('pagehide',()=>{controller?.abort();fx?.destroy();fx=null;});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
try{fx=new EquipmentPresentation($('fx-host'));await fx.init();fx.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{fx?.destroy();fx=null;}
await load();
recover.hidden=!localStorage.getItem(pendingKey());if(!recover.hidden)toast('확인하지 못한 강화 결과가 있습니다. 결과 다시 확인을 눌러 주세요.');
