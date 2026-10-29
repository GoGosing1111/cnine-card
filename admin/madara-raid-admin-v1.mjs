import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let settings=null,users=new Map(),searchResults=[],busy=false,loaded=false;
function install(){
  const view=document.getElementById('view-raid');if(!view)return;
  const panel=document.createElement('section');panel.className='panel lich-cms';panel.id='madaraRaidAdmin';
  panel.innerHTML='<header><div><small>VARSEN RAID</small><h2>바르센 레이드</h2><p>무료 입장 공대 · 3~6인 역할 배분 · V3 전장 기믹</p></div><span data-state>설정 확인 전</span></header><p data-status role="status" aria-live="polite"></p><div data-load-recovery hidden><button type="button" data-retry>다시 불러오기</button></div><form hidden></form>';
  view.prepend(panel);const form=panel.querySelector('form'),status=panel.querySelector('[data-status]'),badge=panel.querySelector('[data-state]');
  const note=text=>status.textContent=text,recovery=panel.querySelector('[data-load-recovery]');
  function draw(){
    form.hidden=false;
    form.innerHTML='<fieldset><legend>공개 모드</legend><div class="lich-mode-options">'+[
      ['OFF','운영 중지','모든 계정 입장·행동 차단'],['TEST','지정 인원 테스트','OWNER와 등록한 계정만 입장'],['ON','전체 공개','일반 유저에게 정벌 공개']
    ].map(([value,title,help])=>'<label><input type="radio" name="mode" value="'+value+'" '+(settings.mode===value?'checked':'')+'><span><b>'+value+'</b><strong>'+title+'</strong><small>'+help+'</small></span></label>').join('')+'</div></fieldset>'+
    '<section><h3>테스트 참여자 <small data-count></small></h3><p>정확한 닉네임 또는 계정번호로 추가하세요. OWNER는 기본 포함이며, 저장 즉시 입장 권한에 반영됩니다.</p><div class="lich-search"><label>계정 찾기<input type="search" data-query maxlength="80" placeholder="닉네임 또는 계정번호"></label><button type="button" data-search>검색</button></div><ul data-results></ul><ul data-selected></ul></section>'+
    '<fieldset class="lich-settings-grid"><legend>공대 · 전투 설정</legend><label>보스 고정 전투력<input type="number" name="bossCombatPower" min="1000" max="2000000000" step="1" value="'+settings.bossCombatPower+'" required></label><label>공대 모집 시간 (분)<input type="number" name="lobbyMinutes" min="1" max="60" step="1" value="'+settings.lobbyMinutes+'" required></label></fieldset>'+
    '<fieldset class="lich-settings-grid"><legend>난이도 · 입장 설정</legend>'+[['enrageSeconds','광폭화 시간 (초)',180,1800],['mechanicTimePercent','기믹 전체 제한 시간 (%)',80,200],['weeklyRewardLimit','계정별 주간 보상 횟수',1,30]].map(([key,label,min,max])=>'<label>'+label+'<input type="number" name="'+key+'" min="'+min+'" max="'+max+'" step="1" value="'+settings[key]+'" required></label>').join('')+'<label><input type="checkbox" name="rewardsEnabled" '+(settings.rewardsEnabled?'checked':'')+'> ON 공대 클리어 보상 지급</label></fieldset>'+
    '<p>공대 생성과 참가는 입장권 없이 무료입니다.</p>'+
    '<fieldset class="lich-settings-grid"><legend>클리어 보상 · 계정별 주간 '+settings.weeklyRewardLimit+'회</legend><label>펫 정수 · 1회 지급 수량<input type="number" name="petEssenceReward" min="0" max="1000000" step="1" value="'+settings.petEssenceReward+'" required></label><label>마별 · 1회 지급 수량<input type="number" name="masterStarReward" min="0" max="100000000" step="1" value="'+settings.masterStarReward+'" required><small>0 입력 시 미지급 · 최대 1억 개</small></label><label>피그코인 · 1회 지급 수량<input type="number" name="pigCoinReward" min="0" max="1000000000" step="1" value="'+(settings.pigCoinReward||0)+'" required><small>0 입력 시 미지급</small></label><label>코인 · 1회 지급 금액<input type="number" name="coinReward" min="0" max="1000000000000" step="1" value="'+settings.coinReward+'" required><small>0 입력 시 미지급 · 최대 1조 코인</small></label></fieldset>'+
    '<p class="lich-cms-policy"><strong>매주 월요일 00:00 (한국 시간) 초기화 · 주간 '+settings.weeklyRewardLimit+'회</strong><br>보상 지급 ON과 각 수량을 설정해야 실제 지급합니다. 0은 미지급입니다. 기믹 전체 제한 시간만 비율로 조정하며 개별 반응 구간은 유지합니다. 이미 받은 이번 주 보상도 횟수에 포함되며, '+settings.weeklyRewardLimit+'회 수령 후에는 참여만 가능합니다.<br>공대 생성 당시 전투력·시간 설정을 적용하며 보상은 출정 시 고정합니다. TEST에서 만든 공대는 나중에 ON으로 바꿔도 보상을 지급하지 않습니다. TEST·실패·해산·이탈·강퇴는 지급하지 않으며, 지급할 보상이 없으면 횟수를 소모하지 않습니다.</p>'+
    '<footer><button type="button" data-reload>다시 불러오기</button><button type="submit">바르센 설정 저장</button></footer>';
    drawUsers();badge.textContent=settings.mode;
  }
  function drawUsers(){
    form.querySelector('[data-count]').textContent=settings.testUserIds.length+' / 100명';
    form.querySelector('[data-selected]').innerHTML=settings.testUserIds.map(id=>'<li><span><b>'+esc(users.get(id)?.nickname||'계정')+'</b><small>#'+id+'</small></span><button type="button" data-remove="'+id+'">제외</button></li>').join('')||'<li class="lich-empty">등록된 테스트 참여자가 없습니다. OWNER만 입장할 수 있습니다.</li>';
    form.querySelector('[data-results]').innerHTML=searchResults.map(user=>'<li><span><b>'+esc(user.nickname)+'</b><small>#'+user.id+'</small></span><button type="button" data-add="'+user.id+'" '+(settings.testUserIds.includes(user.id)||settings.testUserIds.length>=100?'disabled':'')+'>'+(settings.testUserIds.includes(user.id)?'추가됨':'참여자 추가')+'</button></li>').join('');
  }
  function lock(value){busy=value;panel.querySelectorAll('button,input').forEach(el=>el.disabled=value);if(!value&&settings)drawUsers();}
  async function load(){
    if(busy)return;lock(true);recovery.hidden=true;if(!loaded)badge.textContent='불러오는 중';note('운영 설정을 불러오는 중입니다.');
    try{const result=await api('admin/raid/madara/settings');settings=result.settings;users=new Map(result.testUsers.map(u=>[u.id,u]));searchResults=[];draw();loaded=true;note('저장된 설정입니다. TEST에서는 지정 계정만 공대에 참가할 수 있습니다.');}
    catch(error){recovery.hidden=false;if(!loaded)badge.textContent='불러오기 실패';note(error.message);}finally{lock(false);}
  }
  panel.querySelector('[data-retry]').addEventListener('click',()=>{void load();});
  async function search(){
    const q=form.querySelector('[data-query]').value.trim();if(!q)return note('정확한 닉네임 또는 계정번호를 입력하세요.');
    lock(true);
    try{searchResults=(await api('admin/raid/madara/test-users?q='+encodeURIComponent(q))).users;drawUsers();note(searchResults.length?'계정을 확인하고 참여자 추가를 누르세요.':'일치하는 계정이 없습니다.');}
    catch(error){note(error.message);}finally{lock(false);}
  }
  form.addEventListener('click',event=>{
    if(busy)return;
    if(event.target.closest('[data-search]')){void search();return;}
    if(event.target.closest('[data-reload]')){void load();return;}
    if(event.target.closest('[data-users]')){document.querySelector('#nav [data-view="users"]')?.click();return;}
    const add=event.target.closest('[data-add]'),remove=event.target.closest('[data-remove]');
    if(add){const user=searchResults.find(u=>u.id===Number(add.dataset.add));if(user&&!settings.testUserIds.includes(user.id)&&settings.testUserIds.length<100){users.set(user.id,user);settings.testUserIds.push(user.id);drawUsers();note(user.nickname+' 추가 · 설정을 저장하면 적용됩니다.');}}
    if(remove){settings.testUserIds=settings.testUserIds.filter(id=>id!==Number(remove.dataset.remove));drawUsers();note('참여자 제외 · 설정을 저장하면 적용됩니다.');}
  });
  form.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-query]')){event.preventDefault();if(!busy)void search();}});
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!settings||!form.reportValidity())return;
    const data=new FormData(form),next={...settings,mode:data.get('mode'),bossCombatPower:Number(data.get('bossCombatPower')),lobbyMinutes:Number(data.get('lobbyMinutes')),petEssenceReward:Number(data.get('petEssenceReward')),testEntryFree:true,rewardsEnabled:data.has('rewardsEnabled'),enrageSeconds:Number(data.get('enrageSeconds')),mechanicTimePercent:Number(data.get('mechanicTimePercent')),entryTicketCost:0,weeklyRewardLimit:Number(data.get('weeklyRewardLimit')),masterStarReward:Number(data.get('masterStarReward')),coinReward:Number(data.get('coinReward')),pigCoinReward:Number(data.get('pigCoinReward'))};
    if(next.mode==='ON'&&settings.mode!=='ON'&&!confirm('바르센 레이드를 전체 유저에게 공개할까요?'))return;
    lock(true);note('저장 중입니다.');
    try{const result=await api('admin/raid/madara/settings',{method:'POST',body:{settings:next}});settings=result.settings;users=new Map(result.testUsers.map(u=>[u.id,u]));draw();note('저장 완료 · '+settings.mode+' · 테스트 참여자 '+settings.testUserIds.length+'명');}
    catch(error){note(error.message);}finally{lock(false);}
  };
  document.querySelector('#nav [data-view="raid"]')?.addEventListener('click',()=>{if(!loaded)void load();});
  if(!view.hidden)void load();
  // The existing user dialog grants inventory items through its audited OWNER flow.
  const dialog=document.getElementById('userDialog');
  const addTicket=()=>{const select=document.getElementById('inventoryItemCode');if(select&&!select.querySelector('option[value="MADARA_RAID_ENTRY_TICKET"]')){const option=document.createElement('option');option.value='MADARA_RAID_ENTRY_TICKET';option.textContent='바르센 레이드 입장권 · 공대 생성';select.appendChild(option);}};
  if(dialog)new MutationObserver(addTicket).observe(dialog,{childList:true,subtree:true});
  addTicket();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
