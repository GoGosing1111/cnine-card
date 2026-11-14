const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={ATTACK_PERCENT:'공격',DEFENSE_PERCENT:'방어',MAX_HP_PERCENT:'최대 체력',SPEED_PERCENT:'속도',START_SHIELD_PERCENT:'시작 보호막',dropPercent:'드랍률',accountXpPercent:'계정 경험치',coinPercent:'코인'};
export function mountPetGrowthExtras(root,{pet,model,request,onBusy=()=>{}}){
 let disposed=false,busy=false,message='',support=null,pending=null,locked=false;
 const uid=model.userId,key=`cnine_pet_extra_pending_v2:${uid}`;
 try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 const isActive=()=>support?.subscription?.active&&support.subscription.endsAt>support.serverNow;
 function render(){
  if(disposed)return;const potential=model.potential,permanent=pet.potential==='MAGNET',chance=potential?.settings?.successPpm;
  root.innerHTML='<section class="pg-extra-panel pg-panel"><h3>기본 효과 · 자석</h3><p>기본 효과는 성장 결과와 함께 적용됩니다.</p><div class="pg-base-buffs">'+[...(pet.buffs||[]).map(b=>[labels[b.type],b.percent]),...Object.entries(pet.rewardBonuses||{}).filter(([,n])=>n>0).map(([k,n])=>[labels[k],n])].map(([label,n])=>'<span>'+esc(label)+' <b>+'+n+'%</b></span>').join('')+'</div>'+(pet.rentalExpiresAt?'<p>대여 종료: '+esc(new Date(pet.rentalExpiresAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+'. 성장 결과는 같은 기간제 개체에 보관됩니다.</p>':'')+(pet.owned?'<div class="pg-extra-grid"><div><h4>'+ (permanent?'영구 자석 · 활성':'자석 잠재력')+'</h4><p>군단토벌 드랍 아이템을 자동 수집합니다.<br>같은 종류의 중복 펫은 자석을 공유합니다.</p>'+(permanent?'':potential?'<p>잠재력 물약 '+potential.potion.quantity.toLocaleString()+'개 · 성공률 '+(chance===null?'설정 대기':chance/10000+'%')+'</p><button type="button" class="pg-button pg-quiet" data-extra="potential" '+(busy||locked||pending||!potential.settings.enabled||chance===null||potential.potion.quantity<1?'disabled':'')+'>물약 1개로 도전</button><small>성공·실패와 관계없이 물약 1개를 소모합니다.</small>':'')+'</div><div><h4>시즌패스 자석</h4><p>'+(isActive()?(support.subscription.magnetPetCode===pet.code?'이 펫에 적용 중':'다른 펫으로 자석 효과를 옮길 수 있습니다.'):'이용 중인 시즌패스의 자석 혜택을 확인합니다.')+'</p>'+(isActive()?'<button type="button" class="pg-button pg-quiet" data-extra="support" '+(busy||locked||pending||permanent||support.subscription.magnetPetCode===pet.code?'disabled':'')+'>이 펫에 적용 · 무료</button>':'')+'</div></div>':'')+(pending?'<button type="button" class="pg-button" data-extra="retry" '+(busy||locked?'disabled':'')+'>이전 자석 요청 결과 확인</button>':'')+'<p role="status">'+esc(message)+'</p></section>';
 }
 async function execute(kind){
  if(disposed||busy||locked)return;
  if(kind!=='retry'){
   if(pending)return;
   pending=kind==='potential'?{path:'pets/v1/potential',body:{petCode:pet.code,requestId:crypto.randomUUID(),expectedRevision:model.potential.revision,settingsRevision:model.potential.settings.revision}}:{path:'server-support/pet',body:{petCode:pet.code,requestId:crypto.randomUUID(),expectedRevision:support.subscription.revision}};
   try{localStorage.setItem(key,JSON.stringify(pending));}catch{pending=null;message='요청을 보관하지 못했습니다. 저장 공간을 확인해 주세요.';render();return;}
  }
  busy=true;onBusy(true);render();
  try{
   const result=await request(pending.path,{method:'POST',body:pending.body});const path=pending.path;localStorage.removeItem(key);pending=null;
   if(disposed)return;message=path==='pets/v1/potential'?(result.success?'자석 잠재력을 획득했습니다.':'이번 도전은 실패했습니다.'):'시즌패스 자석을 적용했습니다.';
   const fresh=await request('pets/v1/codex');if(disposed)return;model=fresh;pet=fresh.cards.find(p=>p.code===pet.code)||pet;
   support=await request('server-support/info');
  }catch(error){if(disposed)return;message=error.message;if(error.status&&error.status<500&&![408,429].includes(error.status)&&!error.retryable){pending=null;localStorage.removeItem(key);}}
  finally{busy=false;onBusy(false);render();}
 }
 const click=event=>{const b=event.target.closest('[data-extra]');if(b&&!b.disabled)void execute(b.dataset.extra);};
 root.addEventListener('click',click);render();
 if(pet.owned)request('server-support/info',{timeoutMs:8000}).then(value=>{support=value;render();}).catch(()=>{message='시즌패스 정보를 불러오지 못했습니다. 새로고침해 주세요.';render();});
 return {lock(value){locked=value;render();},dispose(){disposed=true;root.removeEventListener('click',click);root.replaceChildren();}};
}
