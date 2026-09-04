(()=>{
  'use strict';
  const MYSTIC_ENERGY_CODE='STARLIGHT_ARMOR_CORE';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const asset=value=>`/${String(value||'').trim().replace(/\\/g,'/').replace(/^\/+/, '').replace(/ /g,'%20')}`;
  const auth=()=>localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
  const request=async body=>{const response=await fetch('/api/admin/workshop',{method:body?'POST':'GET',credentials:'include',cache:'no-store',headers:{'content-type':'application/json',...(auth()?{authorization:`Bearer ${auth()}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'장비 합성 레시피 요청에 실패했습니다.');return data};
  let snapshot=null,selected=0,mounted=false;
  const current=()=>snapshot?.synthesisRecipes?.find(row=>Number(row.id)===Number(selected))||snapshot?.synthesisRecipes?.[0]||null;
  const equipmentOption=(row,value)=>`<option value="${row.id}" ${Number(row.id)===Number(value)?'selected':''}>${esc(row.name)} · ${esc(row.slot)} · ${esc(row.rarity)}</option>`;
  const materialOption=(row,value)=>`<option value="${esc(row.code)}" ${String(row.code)===String(value)?'selected':''}>${esc(row.name)} · ${esc(row.rarity)}</option>`;
  const materialRows=()=>((snapshot?.inventoryItems||[]).filter(row=>String(row.category||'').toUpperCase()==='MATERIAL'));

  function mount(){
    const host=document.getElementById('view-workshop');
    if(!host||document.getElementById('workshopSynthesisCmsV1677'))return false;
    const panel=document.createElement('section');panel.id='workshopSynthesisCmsV1677';panel.className='panel ws77-cms';panel.innerHTML='<div class="inlineNotice">장비 합성 계보를 불러오는 중입니다.</div>';host.insertBefore(panel,host.children[2]||null);mounted=true;load();return true;
  }

  async function load(){
    const root=document.getElementById('workshopSynthesisCmsV1677');if(!root)return;
    try{snapshot=await request();if(!snapshot.synthesisRecipes?.some(row=>Number(row.id)===Number(selected)))selected=Number(snapshot.synthesisRecipes?.[0]?.id||0);render()}catch(error){root.innerHTML=`<div class="inlineNotice">${esc(error.message)}</div>`}
  }

  function draft({mystic=false}={}){
    const equipment=snapshot?.equipment||[],base=equipment[0],energy=materialRows().find(row=>row.code===MYSTIC_ENERGY_CODE);
    return {id:0,code:`SYNTH_NEW_${Date.now()}`,name:mystic?'미스틱 장비 도전':'새 장비 합성 계보',description:mystic?'프라임 장비 3개와 미스틱 에너지 5개를 투입해 미스틱 장비에 도전합니다.':'동일 장비를 지정 결과 장비 1개로 합성합니다.',input_equipment_id:base?.id,output_equipment_id:base?.id,input_quantity:3,material_code:mystic&&energy?energy.code:'',material_quantity:mystic&&energy?5:0,success_rate:100,is_active:1,is_public:0,owner_test_only:1,sort_order:100};
  }

  function render(){
    const root=document.getElementById('workshopSynthesisCmsV1677'),recipe=current(),equipment=snapshot?.equipment||[],materials=materialRows();if(!root)return;
    root.innerHTML=`<div class="ws77-cms-head"><div><small>EQUIPMENT LINEAGE RECIPES</small><h2>장비 합성 계보</h2><p>동일 입력 장비와 선택 재료 1종의 소모량, 결과 장비와 성공 확률을 관리합니다. 실패 시 모든 투입 재료가 소모됩니다.</p></div><div><button type="button" id="ws77CmsMystic" class="ghost">+ 미스틱 도전 템플릿</button><button type="button" id="ws77CmsNew" class="ghost">+ 새 계보</button><button type="button" id="ws77CmsReload">새로고침</button></div></div><div class="ws77-cms-layout"><aside>${(snapshot.synthesisRecipes||[]).map(row=>`<button type="button" data-ws77-recipe="${row.id}" class="${Number(row.id)===Number(selected)?'active':''}"><span><b>${esc(row.input_name)}</b><i>${Number(row.input_quantity||3)}${row.material_code?` + ${esc(row.material_name||row.material_code)} ${Number(row.material_quantity||0)}`:''} → 1 · ${Number(row.success_rate??100)}%</i><strong>${esc(row.output_name)}</strong></span><small>${esc(row.code)}</small></button>`).join('')||'<p>등록된 계보가 없습니다.</p>'}</aside><main>${recipe?editor(recipe,equipment,materials):'<div class="inlineNotice">새 계보를 추가하세요.</div>'}</main></div>`;
    root.querySelectorAll('[data-ws77-recipe]').forEach(button=>button.onclick=()=>{selected=Number(button.dataset.ws77Recipe);render()});
    root.querySelector('#ws77CmsNew').onclick=()=>{snapshot.synthesisRecipes.unshift(draft());selected=0;render()};
    root.querySelector('#ws77CmsMystic').onclick=()=>{snapshot.synthesisRecipes.unshift(draft({mystic:true}));selected=0;render()};
    root.querySelector('#ws77CmsReload').onclick=load;
    root.querySelector('#ws77CmsSave')?.addEventListener('click',save);
    root.querySelectorAll('[data-ws77-select]').forEach(select=>select.onchange=updatePreview);
    root.querySelector('#ws77RecipeMaterialQuantity')?.addEventListener('input',updatePreview);
  }

  function editor(recipe,equipment,materials){
    const input=equipment.find(row=>Number(row.id)===Number(recipe.input_equipment_id))||equipment[0],output=equipment.find(row=>Number(row.id)===Number(recipe.output_equipment_id))||equipment[0],material=materials.find(row=>String(row.code)===String(recipe.material_code)),required=Math.max(1,Number(recipe.input_quantity||3)),materialQuantity=material?Math.max(1,Number(recipe.material_quantity||1)):0;
    return `<div class="ws77-cms-preview"><figure><span>${esc(input?.rarity)}</span><img id="ws77InputImage" src="${esc(asset(input?.image_url))}" alt=""></figure><b><em>${required}</em><i>+</i></b><figure id="ws77MaterialPreview" class="material ${material?'':'empty'}"><span id="ws77MaterialRarity">${esc(material?.rarity||'OPTIONAL')}</span><img id="ws77MaterialImage" src="${esc(asset(material?.image_url))}" alt=""><figcaption id="ws77MaterialCaption">${esc(material?.name||'추가 재료 없음')}${material?` × ${materialQuantity}`:''}</figcaption></figure><b><i>→</i><em>1</em></b><figure class="result"><span>${esc(output?.rarity)}</span><img id="ws77OutputImage" src="${esc(asset(output?.image_url))}" alt=""></figure></div><div class="formgrid"><label class="field"><span>계보 코드</span><input id="ws77RecipeCode" value="${esc(recipe.code)}"></label><label class="field"><span>계보 이름</span><input id="ws77RecipeName" value="${esc(recipe.name)}"></label><label class="field full"><span>설명</span><input id="ws77RecipeDescription" value="${esc(recipe.description||'')}"></label><label class="field"><span>입력 장비</span><select id="ws77RecipeInput" data-ws77-select>${equipment.map(row=>equipmentOption(row,input?.id)).join('')}</select></label><label class="field"><span>입력 장비 소모 수량</span><input id="ws77RecipeInputQuantity" type="number" min="1" max="20" step="1" value="${required}"></label><label class="field"><span>추가 제작 재료 · 선택</span><select id="ws77RecipeMaterial" data-ws77-select><option value="">추가 재료 없음</option>${materials.map(row=>materialOption(row,material?.code)).join('')}</select><small>미스틱 승급 예시: 미스틱 에너지 선택</small></label><label class="field"><span>추가 재료 1회 소모 수량</span><input id="ws77RecipeMaterialQuantity" type="number" min="1" max="1000000" step="1" value="${materialQuantity||1}" ${material?'':'disabled'}><small>일괄 합성 시 회차 수만큼 함께 차감됩니다.</small></label><label class="field"><span>결과 장비 · 성공 시 1개 지급</span><select id="ws77RecipeOutput" data-ws77-select>${equipment.map(row=>equipmentOption(row,output?.id)).join('')}</select></label><label class="field"><span>합성 성공 확률 (%)</span><input id="ws77RecipeRate" type="number" min="0" max="100" step="0.01" value="${Number(recipe.success_rate??100)}"><small>실패해도 장비와 추가 재료가 모두 소모됩니다.</small></label><label class="field"><span>정렬</span><input id="ws77RecipeSort" type="number" value="${Number(recipe.sort_order||0)}"></label><label class="field"><span>노출</span><select id="ws77RecipePublic"><option value="1" ${Number(recipe.is_public)?'selected':''}>유저 공개</option><option value="0" ${!Number(recipe.is_public)?'selected':''}>숨김</option></select></label><label class="field"><span>상태</span><select id="ws77RecipeActive"><option value="1" ${Number(recipe.is_active)?'selected':''}>활성</option><option value="0" ${!Number(recipe.is_active)?'selected':''}>중지</option></select></label><label class="field"><span>접근</span><select id="ws77RecipeOwner"><option value="0" ${!Number(recipe.owner_test_only)?'selected':''}>전체</option><option value="1" ${Number(recipe.owner_test_only)?'selected':''}>OWNER 테스트</option></select></label></div><button type="button" id="ws77CmsSave">계보 레시피 저장</button>`;
  }

  function updatePreview(){
    const equipment=snapshot?.equipment||[],materials=materialRows(),input=equipment.find(row=>Number(row.id)===Number(document.getElementById('ws77RecipeInput').value)),output=equipment.find(row=>Number(row.id)===Number(document.getElementById('ws77RecipeOutput').value)),material=materials.find(row=>String(row.code)===String(document.getElementById('ws77RecipeMaterial').value)),materialQuantity=document.getElementById('ws77RecipeMaterialQuantity'),preview=document.getElementById('ws77MaterialPreview');
    document.getElementById('ws77InputImage').src=asset(input?.image_url);document.getElementById('ws77OutputImage').src=asset(output?.image_url);materialQuantity.disabled=!material;preview.classList.toggle('empty',!material);document.getElementById('ws77MaterialImage').src=asset(material?.image_url);document.getElementById('ws77MaterialRarity').textContent=material?.rarity||'OPTIONAL';document.getElementById('ws77MaterialCaption').textContent=material?`${material.name} × ${Math.max(1,Number(materialQuantity.value)||1)}`:'추가 재료 없음';
  }

  async function save(event){
    event.currentTarget.disabled=true;
    try{
      const recipe=current(),materialCode=document.getElementById('ws77RecipeMaterial').value,result=await request({action:'SAVE_SYNTHESIS_RECIPE',recipe:{id:Number(recipe?.id||0),code:document.getElementById('ws77RecipeCode').value,name:document.getElementById('ws77RecipeName').value,description:document.getElementById('ws77RecipeDescription').value,inputEquipmentId:Number(document.getElementById('ws77RecipeInput').value),inputQuantity:Number(document.getElementById('ws77RecipeInputQuantity').value),materialCode,materialQuantity:materialCode?Number(document.getElementById('ws77RecipeMaterialQuantity').value):0,outputEquipmentId:Number(document.getElementById('ws77RecipeOutput').value),successRate:Number(document.getElementById('ws77RecipeRate').value),sortOrder:Number(document.getElementById('ws77RecipeSort').value),isPublic:Number(document.getElementById('ws77RecipePublic').value),isActive:Number(document.getElementById('ws77RecipeActive').value),ownerTestOnly:Number(document.getElementById('ws77RecipeOwner').value)}});
      snapshot=result.snapshot;selected=Number(result.recipeId);render();alert('장비 합성 계보, 추가 재료와 성공 확률을 저장했습니다.');
    }catch(error){alert(error.message)}finally{if(event.currentTarget?.isConnected)event.currentTarget.disabled=false}
  }

  const observer=new MutationObserver(()=>{if(!mounted)mount()});observer.observe(document.documentElement,{childList:true,subtree:true});document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount):mount();
})();
