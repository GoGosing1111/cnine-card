const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountWeeklyQuestAdmin({panel,api}){
 let root=panel.querySelector('#weeklyQuestSettings');if(root?.dataset.saving==='1')return;
 if(!root){root=document.createElement('section');root.id='weeklyQuestSettings';root.className='qw-admin';const daily=panel.querySelector('.dailyQuestAdminPanel');if(daily)daily.after(root);else panel.prepend(root)}
 if(!document.getElementById('weeklyQuestAdminStyle')){const style=document.createElement('link');style.id='weeklyQuestAdminStyle';style.rel='stylesheet';style.href='weekly-quest-admin.css?v=20260924-2';document.head.append(style)}
 const target=document.getElementById('dqRequiredPosts');if(target){target.value='15';target.readOnly=true;target.title='일일 목표는 글 15개로 고정됩니다.'}
 const data=await api('admin/weekly-quests');if(!root.isConnected)return;
 panel.querySelector('[data-weekly-load-error]')?.remove();
 root.innerHTML=`<header><div><span>WEEKLY QUEST SETTINGS</span><h3>주간 퀘스트 보상</h3><p>월요일 00:00 ~ 다음 월요일 00:00 · 한국 시간 · 퀘스트별 주 1회</p></div><b>4개 미션</b></header>
 <p class="qw-guidance">집계는 유지되며, 지급을 ON으로 저장한 퀘스트만 보상 수령이 열립니다. 일일과 주간의 보상·지급 상태는 각각 저장됩니다.</p>
 <form>${data.definitions.map((q,i)=>{const s=data.settings.quests[q.id];return `<fieldset data-quest="${q.id}" ${data.canEdit?'':'disabled'}><legend><span>0${i+1}</span> ${escape(q.title)} <b>${q.target}${q.unit}</b></legend><p>${escape(q.description)}</p><div class="qw-fields"><label>보상 종류<select name="rewardType">${Object.entries(data.rewardTypes).map(([type,label])=>`<option value="${type}" ${s.rewardType===type?'selected':''}>${escape(label)}</option>`).join('')}</select></label><label>지급 수량<input name="rewardAmount" type="number" min="0" max="9007199254740991" step="1" value="${s.rewardAmount}" inputmode="numeric" required></label><label>보상 지급<select name="enabled"><option value="0" ${s.enabled?'':'selected'}>OFF · 지급 대기</option><option value="1" ${s.enabled?'selected':''}>ON · 수령 가능</option></select></label></div><small>목표는 고정 · 보상은 메시지함으로 지급</small></fieldset>`}).join('')}
 <footer><p role="status" data-qw-status>${data.canEdit?'설정한 보상과 ON/OFF는 재배포 후에도 보존됩니다.':'조회 전용입니다. OWNER 계정에서 설정할 수 있습니다.'}</p><button type="submit" ${data.canEdit?'':'disabled'}>주간 보상 설정 저장</button></footer></form>`;
 root.querySelector('form').onsubmit=async event=>{
  event.preventDefault();if(root.dataset.saving==='1'||!data.canEdit)return;
  const output=root.querySelector('[data-qw-status]'),button=root.querySelector('button[type=submit]');
  try{
   const quests={};for(const field of root.querySelectorAll('fieldset')){
    const raw=field.querySelector('[name=rewardAmount]').value,rewardAmount=Number(raw),enabled=field.querySelector('[name=enabled]').value==='1';
    if(raw===''||!Number.isSafeInteger(rewardAmount)||rewardAmount<0)throw Error('지급 수량은 0 이상의 정수로 입력하세요.');
    if(enabled&&rewardAmount===0)throw Error('보상을 1개 이상 설정한 뒤 지급을 켜세요.');
    quests[field.dataset.quest]={rewardType:field.querySelector('[name=rewardType]').value,rewardAmount,enabled};
   }
   root.dataset.saving='1';button.disabled=true;output.textContent='설정을 저장하고 있습니다.';
   const response=await api('admin/weekly-quests',{method:'PATCH',body:JSON.stringify({revision:data.settings.revision,settings:{quests}})});
   data.settings=response.settings;output.textContent='주간 퀘스트 보상 설정을 저장했습니다.';
  }catch(error){output.textContent=error.message||'저장하지 못했습니다. 새로고침 후 다시 시도하세요.'}
  finally{root.dataset.saving='0';button.disabled=false}
 };
}
