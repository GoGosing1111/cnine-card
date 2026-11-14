import {mountPetGrowthExtras} from './pet-growth-extras-v2.mjs';
import {mountPetGrowth} from './pet-growth-window-v2.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base='/assets/ui/pets/rework-20261114/codex-v3/';
export function mountPetCodexGrowth(root,{growth,request,review=false}){
 let disposed=false,model=null,selected=null,view=null,extras=null,locked=false,query='',filter='all';
 const controller=new AbortController();
 root.classList.add('pet-codex-v3');
 const nav=document.querySelector('.pet-page-nav');if(nav)nav.hidden=true;
 root.innerHTML='<header class="pc-heading"><div class="pc-title"><img src="'+base+'codex-icon.webp" width="70" height="70" alt=""><div><h1>펫 도감</h1><p>함께할 동료의 잠재력을 완성하세요.</p></div></div><div class="pc-collection"><strong data-pc-count>불러오는 중</strong><span>나의 동료</span></div></header><section class="pc-toolbar" aria-label="펫 찾기"><label>펫 검색<input type="search" data-pc-search placeholder="이름으로 검색" aria-label="펫 검색"></label><div class="pc-filters" role="group" aria-label="보유 필터"><button type="button" data-pc-filter="all" aria-pressed="true">전체</button><button type="button" data-pc-filter="owned" aria-pressed="false">보유</button><button type="button" data-pc-filter="missing" aria-pressed="false">미보유</button></div><button type="button" class="pg-button pg-quiet pc-refresh" data-pc-refresh>새로고침</button><div class="pc-route-links"><a href="/">로비</a><a href="/pets/opening/">봉인구 개봉</a><a href="/pets/">편성 해제</a></div></section><nav class="pc-roster" data-pc-roster aria-label="펫 선택"></nav><main data-pc-detail></main><section data-pc-extras></section><p class="pc-error" data-pc-error role="status"></p>';
 const $=s=>root.querySelector(s);
 function lock(value){locked=value;extras?.lock(value);for(const b of root.querySelectorAll('[data-pc-pet],[data-pc-filter],[data-pc-refresh]'))b.disabled=value;$('[data-pc-search]').disabled=value;}
 function roster(){
  if(!model)return;
  const cards=model.cards.filter(row=>(filter==='all'||(filter==='owned'?row.owned:!row.owned))&&(!query||row.name.toLowerCase().includes(query)));
  $('[data-pc-roster]').innerHTML=cards.length?cards.map(row=>'<button type="button" class="pc-pet" data-pc-pet="'+esc(row.code)+'" aria-pressed="'+(row.code===selected)+'" aria-label="'+esc(row.name)+' 선택"><img src="'+esc(row.thumb||'/'+row.sourceArt)+'" alt="" width="70" height="70" loading="lazy"><strong>'+esc(row.name)+'</strong><small>'+esc((row.growthCap?row.growthCap+' · ':'')+(row.owned?'보유 '+row.quantity+'마리':'미보유'))+'</small></button>').join(''):'<p class="pc-no-results">검색 조건에 맞는 펫이 없습니다.</p>';
  for(const b of root.querySelectorAll('[data-pc-filter]'))b.setAttribute('aria-pressed',String(b.dataset.pcFilter===filter));lock(locked);
 }
 function select(code){
  if(disposed||!model?.cards.some(row=>row.code===code))return;
  extras?.dispose();extras=null;view?.dispose();selected=code;roster();
  view=mountPetGrowth($('[data-pc-detail]'),{...growth,pet:model.cards.find(row=>row.code===code),petCatalog:model.cards,embedded:true,onSelectPet:select,onLockChange:lock});
  if(growth.live)extras=mountPetGrowthExtras($('[data-pc-extras]'),{pet:model.cards.find(row=>row.code===code),model,request,onBusy:value=>{lock(value);$('[data-pc-detail]').inert=value;}});
 }
 async function load(){
  if(locked||disposed)return;lock(true);
  try{
   growth.adapter.invalidate?.();
   const [next,portraits]=await Promise.all([request(review?'admin/pets/equipment/codex':'pets/v1/codex',{signal:controller.signal}),growth.live?fetch('/assets/ui/pets/rework-20261114/codex-v3/pets.json',{signal:controller.signal}).then(r=>r.json()):null,growth.live?growth.adapter.read():null]);if(disposed)return;
   if(portraits)for(const row of next.cards)Object.assign(row,portraits[row.code]||{});
   if(growth.live)next.cards=next.cards.filter(row=>row.sourceArt&&row.growthCap);
   model=next;$('[data-pc-count]').textContent=next.ownedCount+' / '+next.cards.length+'종';
   selected=next.cards.some(row=>row.code===selected)?selected:next.loadout.petCode||next.cards[0]?.code;
   $('[data-pc-error]').textContent='';select(selected);
  }catch{if(!disposed){$('[data-pc-error]').textContent='펫 정보를 불러오지 못했습니다. 새로고침해 주세요.';lock(false);}}
 }
 function click(event){
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.pcPet){select(b.dataset.pcPet);return;}
  if(b.dataset.pcFilter){filter=b.dataset.pcFilter;roster();return;}
  if(b.hasAttribute('data-pc-refresh'))void load();
 }
 function input(event){if(event.target.hasAttribute('data-pc-search')){query=event.target.value.trim().toLowerCase();roster();}}
 root.addEventListener('click',click);root.addEventListener('input',input);void load();
 return {reload:load,dispose(){disposed=true;controller.abort();view?.dispose();extras?.dispose();root.removeEventListener('click',click);root.removeEventListener('input',input);root.replaceChildren();root.classList.remove('pet-codex-v3');if(nav)nav.hidden=false;},get animation(){return view?.animation||{active:false,updates:0};}};
}

