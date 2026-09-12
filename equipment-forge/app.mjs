import {ForgeFX} from '/preview/equipment-forge-v1/source/fx.mjs';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slots={WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구'};
const token=()=>localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
function imageUrl(raw){try{const u=new URL(raw,location.origin+'/');return ((u.origin===location.origin&&u.pathname.startsWith('/assets/'))||u.protocol==='https:')&&!u.username&&!u.password?u.href:'';}catch{return '';}}
const number=v=>{try{return BigInt(v).toLocaleString('ko-KR');}catch{return '—';}};
let data=null,items=[],cursor=null,group='all',mode='enhance',selected=null,loading=false,generation=0,controller=null,fx=null,activeToken=token(),lastLoad=0;
class EquipmentPresentation extends ForgeFX{
  layout(){super.layout();if(this.texture&&this.item?.slot!=='WEAPON'){
    this.weaponWidth=Math.min(this.w*.62,this.h*.35*this.texture.width/this.texture.height);this.weaponHeight=this.weaponWidth*this.texture.height/this.texture.width;this.center.y=this.h*.5;
    this.weapon.width=this.weaponWidth;this.weapon.height=this.weaponHeight;this.makeFragments();this.render();
  }}
}
async function api(path,signal){const response=await fetch('/api/character/equipment/forge/'+path,{signal,cache:'no-store',headers:activeToken?{authorization:`Bearer ${activeToken}`}:{}});const body=await response.json();if(!response.ok){const e=Error(body.error||'장비 정보를 불러오지 못했습니다.');e.status=response.status;throw e;}return body;}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3500);}
function renderList(){
  $('inventory-count').textContent=mode==='restore'?'00':String(items.length).padStart(2,'0')+(cursor?'+':'');
  $('inventory-more').hidden=!cursor||mode==='restore';$('inventory-more').disabled=loading;
  if(mode==='restore'){$('inventory-list').innerHTML='<p class="empty-inventory">파괴 기록이 없습니다.<br>무기와 방어구의 기록이 이곳에 보관됩니다.</p>';return;}
  $('inventory-list').innerHTML=items.map(item=>`<button class="equipment-row" data-id="${esc(item.instanceId)}" data-grade="${esc(item.grade)}" aria-pressed="${item.instanceId===selected}" aria-label="${esc(item.name)}, ${slots[item.slot]}"><span class="equipment-thumb"><img src="${esc(imageUrl(item.image))}" alt="" loading="lazy"></span><span class="equipment-copy"><small>${esc(item.grade)} · ${slots[item.slot]}</small><b>${esc(item.name)}</b><em>${item.equipped?'장착 중':'보유 장비'} · #${esc(item.instanceId)}</em></span><span class="equipment-level">—</span></button>`).join('')||`<div class="empty-inventory">${loading?'장비를 불러오는 중…':!activeToken?'로그인하면 보유한 무기와 방어구를 확인할 수 있습니다.':data?.publicVisible===false?'강화 센터를 준비하고 있습니다.':'이 종류의 보유 장비가 없습니다.'}${!activeToken?'<a class="public-login" href="/">게임 로그인 ↗</a>':''}</div>`;
  $('inventory-list').querySelectorAll('img').forEach(img=>img.onerror=()=>{img.hidden=true;});
}
async function select(id){
  selected=id;renderList();const item=items.find(r=>r.instanceId===selected),stamp=generation;
  $('stage-empty').hidden=!!item;$('weapon-fallback').hidden=true;
  if(!item){$('stage-item-name').textContent=mode==='restore'?'파괴 기록 보관소':'장비를 선택하세요';$('stage-item-sub').textContent='무기 · 상의 · 하의 · 신발 · 장신구';$('stage-grade').textContent='EQUIPMENT ARCHIVE';$('power-before').textContent='—';$('stage-code').textContent='EQUIPMENT ARCHIVE';$('stage-rule').textContent='무기 · 방어구 · 장신구';if(fx?.weapon){fx.loadGeneration++;fx.weapon.visible=false;fx.texture=null;}return;}
  $('stage-item-name').textContent=item.name;$('stage-grade').textContent=item.grade+' EQUIPMENT';$('stage-item-sub').textContent=slots[item.slot]+(item.equipped?' · 장착 중':' · 보유 장비');$('stage-code').textContent='EQUIPMENT / #'+item.instanceId;
  $('power-before').textContent=number(Math.max(0,Math.trunc(item.basePower.total)));$('stage-rule').textContent=`PVE ${number(item.basePower.pve)} · PVP ${number(item.basePower.pvp)}`;
  const image=imageUrl(item.image);$('weapon-fallback').src=image;$('weapon-fallback').classList.toggle('is-armor',item.slot!=='WEAPON');
  if(fx){try{await fx.setItem({...item,image});if(stamp!==generation||selected!==id)return;fx.weapon.visible=true;$('weapon-fallback').hidden=true;return;}catch{}}
  if(stamp===generation&&selected===id)$('weapon-fallback').hidden=!image;
}
async function load(more=false){
  controller?.abort();controller=new AbortController();const current=++generation;activeToken=token();loading=true;
  if(!more){items=[];cursor=null;selected=null;await select(null);}renderList();
  const timeout=setTimeout(()=>controller?.abort(),25000);
  try{
    if(!more){data=await api('status',controller.signal);if(current!==generation)return;$('opening-notice').textContent=data.notice;$('opening-title').textContent=data.publicVisible?'강화 오픈 준비 중':'강화 센터 준비 중';}
    if(!activeToken||!data?.publicVisible){$('wallet-coins').textContent='—';return;}
    const result=await api('state?group='+group+(more&&cursor?'&beforeId='+encodeURIComponent(cursor):''),controller.signal);
    if(current!==generation||activeToken!==token())return;data=result;items=more?[...items,...result.items]:result.items;cursor=result.nextCursor;
    $('wallet-coins').textContent=number(result.wallet.coins);$('inventory-note').textContent='무기 · 방어구 · 장신구를 개별 장비 단위로 확인합니다.';
    if(mode==='enhance')await select(selected||items.find(r=>r.equipped)?.instanceId||items[0]?.instanceId||null);lastLoad=Date.now();
  }catch(e){if(current!==generation)return;if(e.status===401){items=[];activeToken='';$('wallet-coins').textContent='—';await select(null);}if(e.name!=='AbortError'){$('inventory-note').textContent=e.message;toast(e.message);}else $('inventory-note').textContent='연결이 지연됩니다. 다시 불러오기를 눌러 주세요.';}
  finally{clearTimeout(timeout);if(current===generation){loading=false;renderList();}}
}
async function switchMode(next){mode=next;for(const b of document.querySelectorAll('[data-mode]')){const active=b.dataset.mode===mode;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}$('workspace').setAttribute('aria-labelledby','tab-'+mode);$('inventory-heading').textContent=mode==='enhance'?'보유 장비':'파괴 기록';$('inventory-filters').hidden=mode==='restore';$('enhance-options').hidden=mode==='restore';$('restore-options').hidden=mode==='enhance';renderList();await select(mode==='enhance'?(selected||items[0]?.instanceId):null);}
$('inventory-list').addEventListener('click',e=>{const row=e.target.closest('[data-id]');if(row)void select(row.dataset.id);});
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{group=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));void load();});
document.querySelectorAll('[data-mode]').forEach(b=>{b.onclick=()=>void switchMode(b.dataset.mode);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=mode==='enhance'?'restore':'enhance';void switchMode(next);$('tab-'+next).focus();}};});
$('inventory-more').onclick=()=>void load(true);$('archive-button').onclick=()=>void switchMode('restore');
$('rules-button').onclick=()=>$('rules-dialog').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('rules-dialog').close());
for(const id of ['enhance-button','restore-button'])$(id).onclick=()=>toast('아직 강화·복구가 오픈되지 않았습니다.');
$('weapon-fallback').onerror=()=>{$('weapon-fallback').hidden=true;$('stage-empty').hidden=false;};
const refresh=document.createElement('button');refresh.className='text-button';refresh.id='refresh-equipment';refresh.textContent='다시 불러오기';refresh.onclick=()=>void load();document.querySelector('.inventory-footer').append(refresh);
window.addEventListener('storage',e=>{if(e.key==='cnine_card_api_token')void load();});window.addEventListener('focus',()=>{if(activeToken!==token()||Date.now()-lastLoad>60000)void load();});
window.addEventListener('pagehide',()=>{controller?.abort();fx?.destroy();fx=null;});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
try{fx=new EquipmentPresentation($('fx-host'));await fx.init();fx.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;}catch{fx?.destroy();fx=null;}
await load();
