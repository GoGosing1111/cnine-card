/* V1353 equipment/title CMS vehicle manager */
(()=>{
  const ROOT_ID='equipmentAdminRoot';
  const PANEL_ID='equipmentVehicleAdminV1353';
  const rarityLabels={NORMAL:'일반',MAGIC:'고급',RARE:'희귀',EPIC:'영웅',LEGENDARY:'전설',MYTHIC:'신화'};
  const state={payload:null,editingId:0,selectedUser:null,searchTimer:0,busy:false};
  const escValue=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const n=value=>Math.max(0,Math.floor(Number(value)||0));
  const apiCall=(path,opt={})=>typeof api==='function'?api(path,opt):Promise.reject(new Error('CMS API를 찾을 수 없습니다.'));
  const byId=id=>document.getElementById(id);

  function splitPower(total){const safe=n(total),pve=Math.floor(safe*.9);return {total:safe,pve,pvp:safe-pve}}
  function vehicleRows(){return Array.isArray(state.payload?.garageItems)?state.payload.garageItems:[]}
  function formVehicle(){return vehicleRows().find(row=>Number(row.id)===Number(state.editingId))||null}

  function mount(){
    const root=byId(ROOT_ID);if(!root||byId(PANEL_ID))return;
    const panel=document.createElement('section');panel.id=PANEL_ID;panel.className='panel equipmentVehicleAdminV1353';
    panel.innerHTML=`<div class="vehicleCmsHeroV1353"><div><small>GARAGE VEHICLE CONTROL</small><h2>이동수단 관리 <span class="buildBadge">v1353</span></h2><p>장비·칭호와 같은 등급 체계로 이동수단을 등록하고 유저에게 지급합니다.</p></div><button type="button" id="vehicleReloadBtnV1353" class="ghost">새로고침</button></div><div id="vehicleCmsBodyV1353" class="vehicleCmsLoadingV1353">이동수단 정보를 불러오는 중입니다.</div>`;
    root.prepend(panel);
    panel.addEventListener('click',onClick);
    panel.addEventListener('input',onInput);
    load();
  }

  async function load(){
    const body=byId('vehicleCmsBodyV1353');if(body)body.innerHTML='<div class="vehicleCmsLoadingV1353">이동수단 정보를 불러오는 중입니다.</div>';
    try{state.payload=await apiCall('admin/equipment-system');render()}
    catch(error){if(body)body.innerHTML=`<div class="vehicleCmsErrorV1353">${escValue(error.message||'이동수단 정보를 불러오지 못했습니다.')}</div>`}
  }

  function render(){
    const body=byId('vehicleCmsBodyV1353');if(!body)return;
    const current=formVehicle(),power=splitPower(current?.totalPower||0),rows=vehicleRows();
    body.innerHTML=`
      <div class="vehicleCmsTabsV1353" role="tablist"><button type="button" class="active">이동수단 등록·목록</button><span>장비·칭호 관리 화면 안에서 함께 운영됩니다.</span></div>
      <div class="vehicleCmsGridV1353">
        <section class="vehicleEditorV1353">
          <div class="vehicleSectionHeadV1353"><div><small>${current?'EDIT VEHICLE':'NEW VEHICLE'}</small><h3>${current?'이동수단 수정':'이동수단 추가'}</h3></div>${current?'<button type="button" class="ghost" data-vehicle-new>새 이동수단</button>':''}</div>
          <div class="vehicleFormV1353">
            <label><span>이동수단명</span><input id="vehicleNameV1353" maxlength="80" value="${escValue(current?.name||'')}"></label>
            <label><span>관리 코드</span><input id="vehicleCodeV1353" maxlength="60" placeholder="VALKYRIE_BIKE" value="${escValue(current?.code||'')}"><small>영문 대문자·숫자·밑줄 권장</small></label>
            <label><span>등급</span><select id="vehicleRarityV1353">${Object.entries(rarityLabels).map(([key,label])=>`<option value="${key}" ${String(current?.rarity||'NORMAL')===key?'selected':''}>${label}</option>`).join('')}</select></label>
            <label><span>정렬 순서</span><input id="vehicleSortV1353" type="number" min="0" value="${n(current?.sortOrder||0)}"></label>
            <label class="wide"><span>이미지 경로</span><input id="vehicleImageV1353" maxlength="500" placeholder="assets/ui/garage/vehicles/valkyrie_bike.png" value="${escValue(current?.image||'')}"></label>
            <label class="wide"><span>설명</span><textarea id="vehicleDescriptionV1353" maxlength="500" rows="3">${escValue(current?.description||'')}</textarea></label>
            <label><span>총 전투력</span><input id="vehiclePowerV1353" type="number" min="0" max="100000000" value="${n(current?.totalPower||0)}"></label>
            <div class="vehiclePowerPreviewV1353"><span>PVE <b id="vehiclePvePreviewV1353">+${power.pve.toLocaleString()}</b></span><span>PVP <b id="vehiclePvpPreviewV1353">+${power.pvp.toLocaleString()}</b></span><small>총 전투력의 90% / 10% 자동 배분</small></div>
            <label><span>사용 상태</span><select id="vehicleActiveV1353"><option value="1" ${current?.isActive===false?'':'selected'}>사용</option><option value="0" ${current?.isActive===false?'selected':''}>중지</option></select></label>
            <label><span>유저 공개</span><select id="vehiclePublicV1353"><option value="1" ${current?.isPublic===false?'':'selected'}>공개</option><option value="0" ${current?.isPublic===false?'selected':''}>숨김</option></select></label>
          </div>
          <div class="vehicleEditorActionsV1353"><button type="button" id="vehicleSaveBtnV1353">${current?'수정 저장':'이동수단 추가'}</button>${current?'<button type="button" class="danger" data-vehicle-delete>삭제·비활성화</button>':''}</div>
        </section>

        <section class="vehicleGrantV1353">
          <div class="vehicleSectionHeadV1353"><div><small>USER GRANT</small><h3>유저 수동 지급</h3></div></div>
          <label class="vehicleSearchV1353"><span>닉네임 검색</span><input id="vehicleUserSearchV1353" autocomplete="off" placeholder="닉네임 입력"><div id="vehicleUserResultsV1353"></div></label>
          <div id="vehicleSelectedUserV1353" class="vehicleSelectedUserV1353">${state.selectedUser?`<b>${escValue(state.selectedUser.nickname)}</b><span>#${state.selectedUser.id} · ${escValue(state.selectedUser.role||'USER')}</span>`:'지급할 유저를 검색해 선택하세요.'}</div>
          <label><span>이동수단 선택</span><select id="vehicleGrantItemV1353"><option value="">선택</option>${rows.map(row=>`<option value="${row.id}">${escValue(row.name)} · ${escValue(rarityLabels[row.rarity]||row.rarity)}</option>`).join('')}</select></label>
          <div class="vehicleGrantActionsV1353"><button type="button" data-vehicle-grant="GRANT">지급</button><button type="button" class="ghostDanger" data-vehicle-grant="REVOKE">회수</button></div>
          <div class="vehicleGrantNoticeV1353">회수 시 해당 이동수단이 장착 중이면 장착 상태도 함께 해제됩니다.</div>
        </section>
      </div>

      <section class="vehicleListSectionV1353">
        <div class="vehicleSectionHeadV1353"><div><small>REGISTERED VEHICLES</small><h3>등록 이동수단 ${rows.length}개</h3></div></div>
        <div class="vehicleListV1353">${rows.length?rows.map(vehicleCard).join(''):'<div class="vehicleEmptyV1353">등록된 이동수단이 없습니다.</div>'}</div>
      </section>`;
  }

  function vehicleCard(row){
    const power=splitPower(row.totalPower||0),rarity=rarityLabels[row.rarity]||row.rarity;
    return `<article class="vehicleCardV1353 ${row.isActive===false?'disabled':''}">
      <div class="vehicleThumbV1353">${row.image?`<img src="${escValue(/^https?:\/\//i.test(row.image)?row.image:'../'+String(row.image).replace(/^\//,''))}" alt="${escValue(row.name)}">`:'<span>NO IMAGE</span>'}</div>
      <div class="vehicleCardCopyV1353"><div><em>${escValue(rarity)}</em>${row.isPublic===false?'<i>비공개</i>':''}${row.isActive===false?'<i>중지</i>':''}</div><strong>${escValue(row.name)}</strong><small>${escValue(row.code||'')}</small><p>${escValue(row.description||'설명 없음')}</p><div class="vehicleCardPowerV1353"><b>PVE +${power.pve.toLocaleString()}</b><b>PVP +${power.pvp.toLocaleString()}</b></div></div>
      <button type="button" data-vehicle-edit="${row.id}">수정</button>
    </article>`;
  }

  function payloadFromForm(){
    return {id:state.editingId||undefined,name:byId('vehicleNameV1353')?.value.trim(),code:byId('vehicleCodeV1353')?.value.trim(),rarity:byId('vehicleRarityV1353')?.value,image:byId('vehicleImageV1353')?.value.trim(),description:byId('vehicleDescriptionV1353')?.value.trim(),totalPower:n(byId('vehiclePowerV1353')?.value),sortOrder:n(byId('vehicleSortV1353')?.value),isActive:byId('vehicleActiveV1353')?.value==='1',isPublic:byId('vehiclePublicV1353')?.value==='1'};
  }

  async function saveVehicle(){
    if(state.busy)return;const data=payloadFromForm();if(!data.name)return alert('이동수단명을 입력하세요.');
    state.busy=true;const btn=byId('vehicleSaveBtnV1353');if(btn)btn.disabled=true;
    try{const result=await apiCall('admin/garage-item',{method:state.editingId?'PATCH':'POST',body:JSON.stringify(data)});state.payload=result;state.editingId=0;render();alert(data.id?'이동수단을 수정했습니다.':'이동수단을 추가했습니다.')}
    catch(error){alert(error.message||'이동수단 저장에 실패했습니다.')}
    finally{state.busy=false;if(btn)btn.disabled=false}
  }

  async function deleteVehicle(){
    if(!state.editingId||!confirm('이 이동수단을 삭제하시겠습니까?\n보유 유저가 있으면 안전하게 비활성화 처리됩니다.'))return;
    try{const result=await apiCall('admin/garage-item',{method:'DELETE',body:JSON.stringify({id:state.editingId})});state.payload=result;state.editingId=0;render();alert(result.disabled?'보유 유저가 있어 비활성화했습니다.':'이동수단을 삭제했습니다.')}
    catch(error){alert(error.message||'이동수단 삭제에 실패했습니다.')}
  }

  async function searchUsers(query){
    const box=byId('vehicleUserResultsV1353');if(!box)return;if(!query.trim()){box.innerHTML='';return}
    try{const result=await apiCall(`admin/equipment-user-search?q=${encodeURIComponent(query.trim())}`);box.innerHTML=(result.users||[]).map(user=>`<button type="button" data-vehicle-user="${user.id}" data-nickname="${escValue(user.nickname)}" data-role="${escValue(user.role||'USER')}"><b>${escValue(user.nickname)}</b><span>#${user.id} · ${escValue(user.role||'USER')}</span></button>`).join('')||'<div>검색 결과 없음</div>'}
    catch(error){box.innerHTML=`<div>${escValue(error.message||'검색 실패')}</div>`}
  }

  async function grantVehicle(action){
    const garageId=n(byId('vehicleGrantItemV1353')?.value),userId=n(state.selectedUser?.id);if(!userId)return alert('유저를 선택하세요.');if(!garageId)return alert('이동수단을 선택하세요.');
    try{await apiCall('admin/garage-grant',{method:'POST',body:JSON.stringify({userId,garageId,action})});alert(action==='REVOKE'?'이동수단을 회수했습니다.':'이동수단을 지급했습니다.')}
    catch(error){alert(error.message||'이동수단 지급 처리에 실패했습니다.')}
  }

  function onClick(event){
    const target=event.target.closest('button');if(!target)return;
    if(target.id==='vehicleReloadBtnV1353')return load();
    if(target.id==='vehicleSaveBtnV1353')return saveVehicle();
    if(target.matches('[data-vehicle-new]')){state.editingId=0;render();return}
    if(target.matches('[data-vehicle-delete]'))return deleteVehicle();
    if(target.dataset.vehicleEdit){state.editingId=n(target.dataset.vehicleEdit);render();byId(PANEL_ID)?.scrollIntoView({behavior:'smooth',block:'start'});return}
    if(target.dataset.vehicleUser){state.selectedUser={id:n(target.dataset.vehicleUser),nickname:target.dataset.nickname,role:target.dataset.role};render();return}
    if(target.dataset.vehicleGrant)return grantVehicle(target.dataset.vehicleGrant);
  }

  function onInput(event){
    if(event.target.id==='vehiclePowerV1353'){
      const power=splitPower(event.target.value);const pve=byId('vehiclePvePreviewV1353'),pvp=byId('vehiclePvpPreviewV1353');if(pve)pve.textContent='+'+power.pve.toLocaleString();if(pvp)pvp.textContent='+'+power.pvp.toLocaleString();
    }
    if(event.target.id==='vehicleUserSearchV1353'){
      clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>searchUsers(event.target.value),250);
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    mount();
    const observer=new MutationObserver(()=>mount());observer.observe(document.body,{childList:true,subtree:true});
  });
})();
