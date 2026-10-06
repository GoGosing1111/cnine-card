import {jointAdminRequest} from '../js/joint-account-transport.mjs';
export function mountPetPotentialCms(root){
  let settings=null,busy=false,disposed=false;
  root.className='cp-potential';
  root.innerHTML=`<div class="cp-potential-art"><img src="/assets/items/pet-opening-v1/potential-potion.svg" alt="잠재력 물약"></div><div class="cp-potential-settings"><p class="cp-kicker">PET POTENTIAL</p><h3>자석 잠재력 · 물약 도전</h3><p>물약 1개를 소모해 자석 잠재력에 도전합니다. 획득한 펫을 장착하면 군단토벌 드랍을 자동 흡수합니다.</p><div class="cp-potential-inputs"><label>성공확률 (%)<input data-potential-chance type="number" min="0" max="100" step="0.0001" placeholder="미정"></label><label class="cp-potential-toggle"><input data-potential-enabled type="checkbox"> 잠재력 도전 사용</label><button type="button" data-potential-save class="cp-primary">잠재력 설정 저장</button></div><p data-potential-status role="status">설정 확인 중…</p><small>물약 획득처는 아이템 드랍·지급 CMS에서 ‘잠재력 물약’을 선택해 설정하세요. 자동으로 획득처나 확률을 추가하지 않습니다.</small></div>`;
  const $=s=>root.querySelector(s),status=(text,error=false)=>{$('[data-potential-status]').textContent=text;$('[data-potential-status]').classList.toggle('cp-error',error);};
  const sync=()=>root.querySelectorAll('input,button').forEach(e=>e.disabled=busy||!settings);
  async function load(){busy=true;sync();try{const r=await jointAdminRequest('admin/pets/potential');if(disposed)return;settings=r.settings;$('[data-potential-chance]').value=settings.successPpm===null?'':settings.successPpm/10000;$('[data-potential-enabled]').checked=settings.enabled;status(settings.successPpm===null?'성공확률 미정 · 도전 OFF':`저장된 성공확률 ${settings.successPpm/10000}% · ${settings.enabled?'ON':'OFF'}`);}catch(e){if(!disposed)status(e.message,true);}finally{busy=false;if(!disposed)sync();}}
  async function save(){
    if(busy||!settings)return;const text=$('[data-potential-chance]').value.trim(),percent=text===''?null:Number(text),enabled=$('[data-potential-enabled]').checked;
    if(percent!==null&&(!Number.isFinite(percent)||percent<0||percent>100||Math.abs(percent*10000-Math.round(percent*10000))>1e-6)||enabled&&percent===null)return status('0~100% 범위에서 소수점 4자리까지 설정하세요. ON에는 확률이 필요합니다.',true);
    busy=true;sync();status('잠재력 설정을 저장하고 있습니다.');try{const r=await jointAdminRequest('admin/pets/potential',{method:'PATCH',body:{settings:{...settings,enabled,successPpm:percent===null?null:Math.round(percent*10000)}}});if(disposed)return;settings=r.settings;status(`저장 완료 · ${percent===null?'확률 미정':percent+'%'} · ${enabled?'ON':'OFF'}`);}catch(e){if(!disposed){status(e.message,true);if(e.status===409)void load();}}finally{busy=false;if(!disposed)sync();}
  }
  $('[data-potential-save]').onclick=save;void load();return {dispose(){disposed=true;root.replaceChildren();}};
}

const ensureGrantOption=()=>{const select=document.querySelector('#inventoryItemCode');if(select&&!select.querySelector('[value="PET_POTENTIAL_POTION"]')){const option=document.createElement('option');option.value='PET_POTENTIAL_POTION';option.textContent='잠재력 물약 · 펫 자석 도전';select.append(option);}};
new MutationObserver(ensureGrantOption).observe(document.documentElement,{childList:true,subtree:true});ensureGrantOption();
