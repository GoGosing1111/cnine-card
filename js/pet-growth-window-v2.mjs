import {PET_GRADES,PET_STATS,PET_STAT_LABELS,PET_TRAITS,gradePool,perfectProbability} from '../shared/pet-growth-v2.mjs';
import {PET_GROWTH_IMAGES,petTraitVisual} from '../shared/pet-trait-visuals-v2.mjs';
import {preparePetDice,playPetDice} from './pet-dice-roll-v3.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(src,label='')=>'<img class="pg-icon" src="'+esc(src)+'" alt="'+esc(label)+'" width="48" height="48">';
const badge=grade=>'<strong class="pg-grade pg-grade-'+esc(grade)+'">'+esc(grade)+'</strong>';
const money=n=>{const value=BigInt(n||0);return value>=1000000000000n?(Number(value/10000000000n)/100).toLocaleString('ko-KR')+'조':value.toLocaleString('ko-KR');};
const traitDetail=(trait,policy)=>trait.activated===false?'아직 부여되지 않았습니다. 특성 주사위로 개방하세요.':PET_TRAITS[trait.id].description+(policy.values?' +'+policy.values[trait.id][trait.grade]+'%':'');
const statIcon=key=>'/assets/ui/pets/buffs-v1/'+({attack:'attack',defense:'defense',hp:'vitality',speed:'speed'}[key])+'-icon.webp';
export function mountPetGrowth(root,{adapter,pet,petCatalog=[],onClose,onSelectPet,onLockChange=()=>{},createEffectPreview,embedded=false}){
 if(!adapter?.read||!adapter?.execute)throw Error('Pet growth transport required');
 let state=null,selected=null,busy=false,disposed=false,message='',failedRequest=null,effect=null,loadSequence=0,previewEpoch=0,effectController=null,rollController=null,rolling=null,rollUpdates=0;
 root.classList.add('pet-growth');root.hidden=false;
 const current=()=>state?.instances.find(row=>row.id===selected);
 const rowStats=stats=>PET_STATS.map(key=>PET_STAT_LABELS[key]+' '+stats[key]).join(' · ');
 function stopEffect(){previewEpoch++;effectController?.abort();effectController=null;effect?.dispose();effect=null;}
 function rollingMarkup(kind){return '<div class="pg-dice-stage" data-dice-stage data-kind="'+kind+'" role="status"><div class="pg-dice-sprite" data-dice-sprite aria-hidden="true"></div><strong>'+(kind==='stats'?'능력치 주사위를':'특성 주사위를')+' 굴리는 중…</strong><small>결과를 확인하고 있습니다.</small></div>';}
 function rollControl(kind){
  const cost=adapter.policy.costs[kind],locked=busy||!!failedRequest||!!state.pending,title=kind==='stats'?'능력치':'특성';
  if(rolling===kind)return rollingMarkup(kind);
  if(typeof cost==='object'){
   const enough=BigInt(state.wallet.coin)>=BigInt(cost.coin)&&state.wallet.masterStars>=cost.masterStars;
   return '<div class="pg-roll-actions pg-currency-cost"><div>'+icon(PET_GROWTH_IMAGES[kind])+'<span><b>1회 코인 '+money(cost.coin)+'</b><small>마스터의 별 '+cost.masterStars.toLocaleString('ko-KR')+'개</small></span></div><button type="button" class="pg-button" data-pg-action="roll" data-kind="'+kind+'" '+(locked||!enough?'disabled':'')+'>'+title+' 굴리기</button></div><p class="pg-wallet">보유 코인 '+money(state.wallet.coin)+' · 마스터의 별 '+state.wallet.masterStars.toLocaleString('ko-KR')+'개</p>';
  }
  return '<div class="pg-roll-actions"><div>'+icon(PET_GROWTH_IMAGES[kind])+'<span><b>'+title+' 주사위</b><small>보유 <strong>'+state.wallet[kind]+'</strong>개 · 1회 '+cost+'개</small></span></div><button type="button" class="pg-button" data-pg-action="roll" data-kind="'+kind+'" '+(locked||state.wallet[kind]<cost?'disabled':'')+'>'+title+' 굴리기</button></div>';
 }
 function comparison(kind){
  const p=state.pending;if(!p||p.kind!==kind||rolling)return '';
  const value=v=>kind==='stats'?'<dl>'+PET_STATS.map(k=>'<div><dt>'+PET_STAT_LABELS[k]+'</dt><dd>'+badge(v[k])+'</dd></div>').join('')+'</dl>':'<div class="pg-trait-result">'+icon(petTraitVisual(v.id).icon)+'<b>'+esc(v.activated===false?'미개방':PET_TRAITS[v.id].name)+'</b>'+badge(v.grade)+'</div>';
  return '<section class="pg-comparison" aria-label="주사위 결과 비교" tabindex="-1"><h4>남길 결과를 선택하세요</h4><div class="pg-result-columns"><div><h5>기존 결과</h5>'+value(p.before)+'</div><div><h5>새 결과</h5>'+value(p.candidate)+'</div></div><div class="pg-result-actions"><button type="button" class="pg-button pg-quiet" data-pg-action="keep" '+(busy||failedRequest?'disabled':'')+'>기존 유지</button><button type="button" class="pg-button" data-pg-action="apply" '+(busy||failedRequest?'disabled':'')+'>새 결과 적용</button></div><p>결과 선택 시 추가 비용 없음</p></section>';
 }
 function render(){
  if(disposed)return;stopEffect();
  const petRow=current(),pending=state?.pending,locked=busy||!!failedRequest||!!pending;
  onLockChange(locked);root.setAttribute('aria-busy',String(busy));
  const head='<div class="pg-heading"><div><h2>'+esc(pet.name)+'</h2><p>'+esc(pet.animal||'함께하는 동료')+'</p></div>'+(petRow?'<div class="pg-cap">성장 상한 '+badge(petRow.cap)+'</div>':'')+(embedded?'':'<button class="pg-button pg-quiet" type="button" data-pg-action="close">도감 목록으로</button>')+'</div>';
  if(!state){root.innerHTML=head+'<p class="pg-status" role="status">'+esc(message||'펫 정보를 불러오고 있습니다.')+'</p>'+(busy?'':'<button class="pg-button" type="button" data-pg-action="refresh">다시 불러오기</button>');return;}
  const pendingPet=pending&&state.instances.find(row=>row.id===pending.instanceId);
  if(pending&&!pendingPet){root.innerHTML=head+'<section class="pg-empty"><h3>결과를 선택할 펫을 현재 보유하지 않았습니다</h3><p>기존 결과를 유지하면 남아 있는 선택을 종료합니다. 사용한 비용은 반환되지 않습니다.</p><button class="pg-button" data-pg-action="keep" '+(busy?'disabled':'')+'>기존 결과 유지</button></section>';return;}
  if(pending&&pendingPet?.petCode!==pet.code){
   const name=petCatalog.find(row=>row.code===pendingPet?.petCode)?.name||'다른 펫';
   root.innerHTML=head+'<section class="pg-empty"><h3>'+esc(name)+'의 결과 선택이 남아 있습니다</h3><p>해당 펫에서 이전 주사위 결과를 먼저 확정해 주세요.</p>'+(onSelectPet&&pendingPet?'<button class="pg-button" type="button" data-pg-pending-pet="'+esc(pendingPet.petCode)+'">'+esc(name)+' 결과 확인</button>':'')+'</section>';return;
  }
  const options=state.instances.filter(row=>row.petCode===pet.code),art=pet.portrait||'/'+pet.sourceArt.replace(/^\//,'');
  if(!options.length){root.innerHTML=head+'<div class="pg-unowned"><img src="'+esc(art)+'" alt="'+esc(pet.name)+'"><div><h3>아직 보유하지 않은 펫입니다</h3><p>'+esc(pet.description||'보유한 펫의 능력치와 특성을 이 화면에서 관리할 수 있습니다.')+'</p><p>펫 획득 후 개체별 성장 정보가 표시됩니다.</p></div></div>';return;}
  const trait=PET_TRAITS[petRow.trait.id],visual=petTraitVisual(petRow.trait.id),pool=gradePool(petRow.cap,adapter.policy.weights);
  const identity='<aside class="pg-identity"><div class="pg-portrait"><img src="'+esc(art)+'" alt="'+esc(pet.name)+'"></div><label class="pg-instance-label">보유 개체 <span>'+options.length+'마리</span><select data-pg-instance aria-label="보유 개체 선택" '+(locked?'disabled':'')+'>'+options.map((row,i)=>'<option value="'+esc(row.id)+'" '+(row.id===selected?'selected':'')+'>'+esc(row.label||'개체 '+(i+1))+'</option>').join('')+'</select></label><p class="pg-instance-summary">'+esc(rowStats(petRow.stats))+'</p><div class="pg-loadouts">'+['PVE','PVP'].map(mode=>'<button type="button" class="pg-button pg-quiet" data-pg-equip="'+mode+'" '+(locked||state.loadouts[mode]===selected?'disabled':'')+'>'+({PVE:'PvE',PVP:'PvP'}[mode])+' '+(state.loadouts[mode]===selected?'편성 중':'편성')+'</button>').join('')+'</div><p class="pg-pet-note">'+esc(pet.description||'')+'</p></aside>';
  const stats='<section class="pg-stats-pane pg-panel" aria-labelledby="pg-stats-title"><div class="pg-section-head"><h3 id="pg-stats-title">능력치</h3><span>C ~ '+esc(petRow.cap)+'</span></div><p class="pg-pane-intro">네 능력치는 각각 독립 추첨됩니다.</p><div class="pg-stat-list">'+PET_STATS.map(key=>'<div class="pg-stat-row">'+icon(statIcon(key))+'<b>'+PET_STAT_LABELS[key]+'</b>'+badge(petRow.stats[key])+(adapter.policy.values?'<small class="pg-stat-value">+'+adapter.policy.values[key][petRow.stats[key]]+'%</small>':'')+'<div class="pg-grade-scale" aria-label="현재 '+PET_STAT_LABELS[key]+' '+petRow.stats[key]+'">'+PET_GRADES.map(grade=>'<span class="'+(grade===petRow.stats[key]?'is-current ':'')+(PET_GRADES.indexOf(grade)>PET_GRADES.indexOf(petRow.cap)?'is-unavailable':'')+'">'+grade+'</span>').join('')+'</div></div>').join('')+'</div><p class="pg-explain">네 항목을 함께 굴린 뒤, 기존 또는 새 결과 한 묶음을 선택합니다.</p>'+rollControl('stats')+comparison('stats')+'<details class="pg-probability"><summary>등급별 확률</summary><div>'+pool.entries.map(x=>'<span>'+x.grade+' <b>'+(100*x.weight/pool.total).toLocaleString('ko-KR',{maximumFractionDigits:3})+'%</b></span>').join('')+'</div><p>전체 '+petRow.cap+': '+(perfectProbability(petRow.cap,adapter.policy.weights)*100).toLocaleString('ko-KR',{maximumFractionDigits:9})+'% · 확정 횟수 없음</p></details></section>';
  const traits='<section class="pg-trait-pane pg-panel" aria-labelledby="pg-trait-title"><div class="pg-section-head"><h3 id="pg-trait-title">고유 특성</h3><span>전투 시작 발동</span></div><div class="pg-current-trait">'+icon(visual.icon)+'<div><h4>'+esc(petRow.trait.activated===false?'미개방':trait.name)+' '+(petRow.trait.activated===false?'':badge(petRow.trait.grade))+'</h4><p>'+esc(traitDetail(petRow.trait,adapter.policy))+'</p></div></div><button type="button" class="pg-effect-button" data-pg-action="effect" '+(busy?'disabled':'')+'>'+icon(visual.icon)+'시작 이펙트 보기</button><p class="pg-explain">특성과 특성 등급을 다시 추첨합니다.<br>네 능력치는 그대로 유지됩니다.</p>'+rollControl('trait')+comparison('trait')+'<details class="pg-trait-options"><summary>변경 가능한 특성 '+(adapter.policy.traitPools[pet.code]||[]).length+'종</summary><div class="pg-trait-list">'+(adapter.policy.traitPools[pet.code]||[]).map(id=>'<button type="button" data-pg-preview-trait="'+id+'" '+(busy?'disabled':'')+' aria-label="'+esc(PET_TRAITS[id].name)+' 이펙트 보기">'+icon(petTraitVisual(id).icon)+'<span><b>'+esc(PET_TRAITS[id].name)+'</b><small>'+esc(PET_TRAITS[id].description)+'</small></span></button>').join('')+'</div><p>후보 특성은 같은 확률로 추첨됩니다.</p></details></section>';
  root.innerHTML=head+'<div class="pg-layout">'+identity+stats+traits+'</div><div class="pg-status-row"><p class="pg-status" role="status" aria-live="polite">'+esc(message)+'</p>'+(failedRequest?'<button type="button" class="pg-button" data-pg-action="retry">같은 요청 결과 재확인</button>':'')+'</div><section class="pg-effect-section" data-pg-effect-section hidden><div class="pg-effect-heading"><h3 data-pg-effect-title>전투 시작 이펙트</h3><button class="pg-button pg-quiet" type="button" data-pg-action="close-effect">미리보기 닫기</button></div><div data-pg-effect></div></section>';
 }
 async function load(){
  if(busy)return;const seq=++loadSequence;busy=true;render();
  try{
   const next=await adapter.read();if(disposed||seq!==loadSequence)return;state=next;
   selected=next.instances.find(row=>row.id===next.pending?.instanceId&&row.petCode===pet.code)?.id||next.instances.find(row=>row.petCode===pet.code&&row.id===selected)?.id||next.instances.find(row=>row.petCode===pet.code)?.id||null;
   message='';failedRequest=null;
  }catch(error){if(!disposed)message=error.message;}
  finally{if(!disposed&&seq===loadSequence){busy=false;render();}}
 }
 async function execute(command,extra={},retry=false){
  if(busy||disposed)return;
  const request=retry?failedRequest:{command,expectedRevision:state.revision,requestId:crypto.randomUUID(),...extra};if(!request)return;
  busy=true;rolling=!retry&&command.startsWith('ROLL_')?(command==='ROLL_STATS'?'stats':'trait'):null;message='';render();
  rollController=new AbortController();
  const animation=rolling?playPetDice(root.querySelector('[data-dice-stage]'),{kind:rolling,signal:rollController.signal,onFrame:()=>{rollUpdates++;}}):Promise.resolve();
  const [result]=await Promise.allSettled([adapter.execute(request),animation]);if(disposed)return;rolling=null;
  if(result.status==='fulfilled'){
   state=result.value;failedRequest=null;
   message=command.startsWith('ROLL_')?'새 결과가 나왔습니다. 남길 결과를 선택하세요.':command==='APPLY'?'새 결과를 적용했습니다. 다음 전투부터 적용됩니다.':command==='KEEP'?'기존 결과를 유지했습니다.':'편성을 저장했습니다.';
  }else{
   const error=result.reason;if(!error.code||error.retryable){failedRequest=request;message='응답을 받지 못했습니다. 같은 요청으로 결과를 다시 확인하세요.';}
   else{failedRequest=null;message=error.message;if(error.code==='STALE_REVISION'){try{state=await adapter.read();}catch{message='정보를 다시 불러오지 못했습니다. 새로고침해 주세요.';}}}
  }
  busy=false;render();
  if(state.pending){root.querySelector('.pg-comparison')?.focus({preventScroll:true});root.querySelector('.pg-comparison')?.scrollIntoView({block:'nearest',behavior:'instant'});}
 }
 async function showEffect(traitId){
  if(busy)return;stopEffect();const epoch=previewEpoch,section=root.querySelector('[data-pg-effect-section]'),host=root.querySelector('[data-pg-effect]'),instance={...current(),trait:{...current().trait,id:traitId||current().trait.id}};
  effectController=new AbortController();section.hidden=false;host.hidden=false;host.textContent='이펙트를 불러오고 있습니다.';
  root.querySelector('[data-pg-effect-title]').textContent=PET_TRAITS[instance.trait.id].name+' · 시작 이펙트';section.scrollIntoView({block:'nearest',behavior:'instant'});
  try{
   const next=await createEffectPreview?.(host,{pet,instance,signal:effectController.signal});
   if(disposed||epoch!==previewEpoch||!host.isConnected){next?.dispose();return;}effect=next;if(!next)host.textContent='이펙트 미리보기를 준비 중입니다.';
  }catch{if(!disposed&&epoch===previewEpoch)host.textContent='이펙트를 불러오지 못했습니다. 다시 시도해 주세요.';}
 }
 async function click(event){
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.pgPendingPet){onSelectPet?.(button.dataset.pgPendingPet);return;}
  if(button.dataset.pgEquip){await execute('EQUIP',{instanceId:selected,mode:button.dataset.pgEquip});return;}
  if(button.dataset.pgPreviewTrait){await showEffect(button.dataset.pgPreviewTrait);return;}
  const action=button.dataset.pgAction;
  if(action==='close'){onClose?.();return;}if(action==='refresh'){void load();return;}
  if(action==='roll'){await execute(button.dataset.kind==='stats'?'ROLL_STATS':'ROLL_TRAIT',{instanceId:selected});return;}
  if(action==='keep'||action==='apply'){await execute(action==='keep'?'KEEP':'APPLY',{pendingId:state.pending.id});return;}
  if(action==='retry'){await execute(failedRequest.command,{},true);return;}if(action==='effect'){await showEffect();return;}
  if(action==='close-effect'){stopEffect();root.querySelector('[data-pg-effect-section]').hidden=true;root.querySelector('[data-pg-effect]').replaceChildren();}
 }
 function change(event){if(event.target.matches('[data-pg-instance]')&&!busy&&!state.pending){selected=event.target.value;message='';render();}}
 root.addEventListener('click',click);root.addEventListener('change',change);
 preparePetDice('stats').catch(()=>{});preparePetDice('trait').catch(()=>{});void load();
 return {reload:load,dispose(){disposed=true;loadSequence++;rollController?.abort();stopEffect();onLockChange(false);root.removeEventListener('click',click);root.removeEventListener('change',change);root.replaceChildren();root.hidden=true;},get state(){return state;},get animation(){return {active:!!rolling&&!disposed,updates:rollUpdates};}};
}
