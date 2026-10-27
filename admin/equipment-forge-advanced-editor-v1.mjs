import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {forgeInputNumber} from '../shared/equipment-forge-cms-v1.mjs';
import {FORGE_ADVANCED_FIELDS,FORGE_SCROLL_ITEMS,validateForgeAdvanced,forgeAdvancedReadiness} from '../shared/equipment-forge-advanced-v1.mjs?v=20261027-star-limit';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountForgeAdvancedEditor(host){
 let policy=null,dirty=false,busy=false,disposed=false,generation=0;
 const status=message=>{const node=host.querySelector('[data-advanced-status]');if(node)node.textContent=message;};
 const setBusy=value=>{busy=value;const fieldset=host.querySelector('fieldset');if(fieldset)fieldset.disabled=value;};
 function read(){
  const next=structuredClone(policy);
  for(const input of host.querySelectorAll('[data-advanced-field]'))next.steps[Number(input.dataset.advancedIndex)][input.dataset.advancedField]=forgeInputNumber(input.value,input.dataset.numberType);
  return validateForgeAdvanced(next);
 }
 function refresh(){
  try{const next=read(),rows=forgeAdvancedReadiness(next);for(const row of rows){const target=host.querySelector('[data-advanced-readiness="'+row.level+'"]');target.textContent=row.ready?'설정 완료 · 저장 후 이용 가능':'잠김 · 미설정 '+row.missing.length+'개 항목';target.title=row.missing.join(' / ');target.dataset.ready=String(row.ready);}}
  catch(error){status(error.message);}
 }
 function render(message=''){
  if(disposed)return;
  host.innerHTML='<section class="forge-advanced"><header><div><small>ADVANCED ENHANCEMENT / +11 — +15</small><h3>고급 강화 · 주문서</h3><p>무기는 무기 주문서, 상의·하의·신발·장신구는 방어구 주문서를 사용합니다.</p></div><span class="forge-advanced-limit">MAX +15</span></header><div class="forge-scrolls">'+FORGE_SCROLL_ITEMS.map(item=>'<div><img src="/'+item.image+'" alt=""><span><b>'+item.name+'</b><small>+10 → +11부터 시도 시 소모</small></span></div>').join('')+'</div><p class="forge-advanced-notice">빈 칸이 있는 단계는 잠깁니다. 완성된 단계는 저장 시 운영에 적용됩니다. 기존 +1~+10 설정은 유지됩니다. 전투력 증가율 변경은 해당 단계의 보유 장비에도 반영됩니다. 이미 받은 견적은 유효기간 동안 발급 당시 비용·확률을 유지합니다.</p><form><fieldset><div class="forge-advanced-steps">'+(policy?policy.steps.map((row,i)=>'<section class="forge-advanced-step"><div class="forge-advanced-step-head"><h4>+'+row.level+' <span>→</span> +'+(row.level+1)+'</h4><p data-advanced-readiness="'+row.level+'"></p></div><div class="forge-advanced-fields">'+FORGE_ADVANCED_FIELDS.map(([key,label,min,max,type])=>'<label><span>'+label+'</span><input type="number" data-advanced-index="'+i+'" data-advanced-field="'+key+'" data-number-type="'+type+'" aria-label="+'+(row.level+1)+' '+label+'" min="'+min+'" max="'+max+'" step="'+(type==='percent'?'0.0001':'1')+'" value="'+(row[key]===null?'':type==='percent'?row[key]/10000:row[key])+'" placeholder="미설정"></label>').join('')+'</div></section>').join(''):'<p>설정을 불러오는 중…</p>')+'</div><div class="forge-advanced-save"><div><b>확률 합계 100% · 성공률 최소 10%</b><p>주문서는 결과와 관계없이 매 시도 소모합니다. 기존 특정 장비의 마별 2배 규칙이 적용됩니다.</p></div><button type="button" data-advanced-reload>다시 불러오기</button><button type="submit" '+(!policy?'disabled':'')+'>고급 강화 설정 저장</button></div><p role="status" aria-live="polite" data-advanced-status>'+esc(message)+'</p></fieldset></form></section>';
  host.querySelector('[data-advanced-reload]').onclick=()=>{if(!dirty||confirm('편집 중인 고급 강화 설정을 버리고 다시 불러올까요?'))void load();};
  host.querySelector('form').oninput=()=>{dirty=true;status('저장하지 않은 변경사항이 있습니다.');refresh();};
  host.querySelector('form').onsubmit=async event=>{
   event.preventDefault();if(busy||!policy)return;let next;try{next=read();}catch(error){status(error.message);return;}
   const stamp=generation;setBusy(true);status('고급 강화 설정 저장 중…');
   try{const result=await api('admin/equipment-forge/advanced',{method:'PATCH',body:{policy:next}});if(disposed||stamp!==generation)return;policy=result.policy;dirty=false;render('저장 완료 · '+result.readiness.filter(row=>row.ready).length+'/5단계 설정 완료. 미입력 단계는 잠겨 있습니다.');}
   catch(error){if(!disposed&&stamp===generation)status(error.message);}
   finally{if(!disposed&&stamp===generation)setBusy(false);}
  };
  if(policy)refresh();setBusy(busy);
 }
 async function load(){if(busy||disposed)return;const stamp=++generation;setBusy(true);try{const result=await api('admin/equipment-forge/advanced');if(disposed||stamp!==generation)return;policy=result.policy;dirty=false;render('현재 고급 강화 설정을 불러왔습니다.');}catch(error){if(!disposed&&stamp===generation){render();status(error.message);}}finally{if(!disposed&&stamp===generation)setBusy(false);}}
 render();void load();
 return {get dirty(){return dirty;},destroy(){disposed=true;generation++;policy=null;host.replaceChildren();}};
}
