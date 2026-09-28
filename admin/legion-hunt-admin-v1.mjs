import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const names={normal:'보통',hard:'어려움',nightmare:'악몽',inferno:'지옥'},types={INVENTORY_ITEM:'아이템',CARD:'카드',EQUIPMENT:'장비',VEHICLE:'이동수단'};
export async function mountLegionHuntCms(root){
  let policy,catalog=[],busy=false,testUsers=new Map(),searchResults=[];
  root.innerHTML='<p class="legion-cms-status" role="status"></p><form></form>';
  const status=root.querySelector('[role=status]'),form=root.querySelector('form');
  const number=(name,label,value,min,max,step=1)=>`<label>${label}<input type="number" name="${name}" aria-label="${label}" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`;
  function collect(){
    const next=structuredClone(policy);
    for(const input of form.querySelectorAll('[name]')){
      if(input.type==='radio'&&!input.checked)continue;
      const keys=input.name.split('.');let target=next;for(const key of keys.slice(0,-1))target=target[key];
      target[keys.at(-1)]=input.name==='mode'?input.value:input.type==='checkbox'?input.checked:Number(input.value);
    }
    return next;
  }
  function probabilities(){
    const p=collect(),sum=p.items.reduce((n,item)=>n+(item.enabled?item.weight:0),0);
    form.querySelectorAll('[data-odds]').forEach(el=>{const item=p.items[Number(el.dataset.odds)],odds=sum&&item.enabled?item.weight/sum*100:0;el.textContent='드랍 시 '+(odds>0&&odds<.00001?'0.00001% 미만':odds.toFixed(5).replace(/\.?0+$/,'')+'%');});
  }
  function fillCatalog(){
    const term=form.querySelector('[data-search]').value.trim().toLocaleLowerCase(),selected=new Set(policy.items.map(i=>i.code)),select=form.querySelector('[data-catalog]');
    const rows=catalog.filter(i=>!selected.has(i.code)&&(!term||(i.name+' '+i.code+' '+types[i.type]).toLocaleLowerCase().includes(term)));
    select.innerHTML=rows.length?rows.map(i=>`<option value="${esc(i.code)}">[${types[i.type]}] ${esc(i.name)} · ${esc(i.ref)}</option>`).join(''):'<option value="">추가할 아이템이 없습니다</option>';
  }
  function drawTestUsers(){
    const ids=policy.testUserIds||[];
    form.querySelector('[data-test-count]').textContent=ids.length+' / 100';
    form.querySelector('[data-test-selected]').innerHTML=ids.map(id=>`<li><div><strong>${esc(testUsers.get(id)?.nickname||'계정 확인 필요')}</strong><small>계정번호 ${id}</small></div><button type="button" data-test-remove="${id}" aria-label="계정번호 ${id} 테스트 참여 제외">제외</button></li>`).join('')||'<li class="legion-cms-empty">지정된 참여자가 없습니다. OWNER는 기본으로 입장 가능합니다.</li>';
    form.querySelector('[data-test-results]').innerHTML=searchResults.map(user=>`<li><div><strong>${esc(user.nickname||'이름 없음')}</strong><small>계정번호 ${user.id}</small></div><button type="button" data-test-add="${user.id}" ${ids.includes(user.id)||ids.length>=100?'disabled':''}>${ids.includes(user.id)?'추가됨':'참여자 추가'}</button></li>`).join('');
  }
  async function searchTestUsers(){
    if(busy)return;
    const query=form.querySelector('[data-test-query]').value.trim(),note=form.querySelector('[data-test-status]');
    if(!query){note.textContent='정확한 닉네임 또는 계정번호를 입력하세요.';return;}
    disable(true);note.textContent='계정을 찾는 중입니다.';
    try{const data=await api('admin/legion-hunt/test-users?q='+encodeURIComponent(query));searchResults=data.users;drawTestUsers();note.textContent=searchResults.length?'확인한 계정을 참여자에 추가한 뒤 설정을 저장하세요.':'일치하는 계정이 없습니다. 정확한 닉네임 또는 계정번호를 확인하세요.';}
    catch(e){note.textContent=e.message;}finally{disable(false);}
  }
  function draw(){
    form.innerHTML=`<header><div><span class="legion-cms-eyebrow">군단토벌 · 잊혀진 섬</span><h2>운영 · 필드 드랍 설정</h2><p>저장된 운영 모드 <b>${esc(policy.mode||'TEST')}</b> · 설정 r${policy.revision}</p></div><button type="button" data-reload>새로 불러오기</button></header>
      <section class="legion-cms-operation"><h3>운영 모드</h3><div class="legion-cms-modes">${[['OFF','운영 중지','모든 계정 입장·전투 요청 차단'],['TEST','지정 인원 검수','OWNER + 지정 참여자 · 보상 미지급'],['ON','정식 운영','일반 유저 입장 · 계정 보상 지급']].map(([mode,title,detail])=>`<label data-mode="${mode}"><input type="radio" name="mode" value="${mode}" ${(policy.mode||'TEST')===mode?'checked':''}><span><b>${mode}</b><strong>${title}</strong><small>${detail}</small></span></label>`).join('')}</div><p>모드는 저장 즉시 적용됩니다. 일반 계정은 하루 2회, OWNER는 무제한으로 입장합니다. TEST에서 시작한 원정은 계속 검수용으로 유지됩니다.</p></section>
      <section class="legion-cms-testers"><h3>TEST 참여자 <small data-test-count></small></h3><p>OWNER는 항상 포함됩니다. 아래 지정 계정은 TEST에서만 추가로 허용되며, 계정 보상은 지급하지 않습니다. 추가·제외 후 설정을 저장하면 바로 적용됩니다.</p><div class="legion-cms-tester-search"><label>닉네임 또는 계정번호<input type="search" data-test-query maxlength="80" placeholder="정확한 닉네임 또는 계정번호"></label><button type="button" data-test-search>계정 찾기</button></div><p data-test-status role="status" aria-live="polite"></p><ul data-test-results aria-label="계정 검색 결과"></ul><ul data-test-selected aria-label="지정된 테스트 참여자"></ul></section>
      <div class="legion-cms-notice"><b>직접 클릭한 아이템만 획득</b><span>ON에서 출전한 원정은 전리품을 주울 때 보관함에 지급됩니다. 드랍 확률·수량은 다음 원정부터 적용되며, 신규 후보는 드랍 사용을 직접 켜야 합니다.</span></div>
      <section><h3>난이도별 드랍</h3><p>몬스터 처치 때 드랍 여부를 판정합니다. 중간·최종 보스에는 보스 확률을 적용합니다.</p><div class="legion-cms-difficulties">${policy.difficulties.map((d,i)=>`<fieldset><legend>${names[d.id]}</legend>${number('difficulties.'+i+'.dropPercent','일반 몬스터 확률 (%)',d.dropPercent,0,100,.01)}${number('difficulties.'+i+'.bossDropPercent','보스 확률 (%)',d.bossDropPercent,0,100,.01)}${number('difficulties.'+i+'.lifetimeSeconds','필드 소멸 시간 (초)',d.lifetimeSeconds,3,30,.1)}</fieldset>`).join('')}</div></section>
      <section><h3>드랍 후보 <small>${policy.items.length} / 100</small></h3><p>드랍에 성공하면 사용 중인 후보에서 1종을 선택합니다. 가중치는 0.001 단위로 입력하며, 선택 확률은 가중치 ÷ 사용 중인 가중치 합계입니다. 수량은 최소~최대 사이에서 추첨합니다.</p><div class="legion-cms-items">${policy.items.map((item,i)=>`<article data-item="${i}"><div class="legion-cms-item-title"><img src="${esc(item.image)}" alt="" loading="lazy"><div><strong>${esc(item.name)}</strong><small>${types[item.type]} · ${esc(item.ref)}</small><b data-odds="${i}"></b></div><button type="button" data-remove="${i}" aria-label="${esc(item.name)} 제외">제외</button></div><div class="legion-cms-item-fields"><label class="legion-cms-check"><input type="checkbox" name="items.${i}.enabled" ${item.enabled?'checked':''}>드랍 사용</label>${number('items.'+i+'.weight','선택 가중치',item.weight,0,1000000,.001)}${number('items.'+i+'.minQuantity','최소 수량',item.minQuantity,1,item.type==='VEHICLE'?1:item.type==='EQUIPMENT'?100:1000000)}${number('items.'+i+'.maxQuantity','최대 수량',item.maxQuantity,1,item.type==='VEHICLE'?1:item.type==='EQUIPMENT'?100:1000000)}</div></article>`).join('')||'<div class="legion-cms-empty">등록된 후보가 없습니다. 아래 목록에서 아이템을 추가하세요.</div>'}</div>
      <div class="legion-cms-add"><label>아이템 검색<input type="search" data-search placeholder="이름 또는 코드"></label><label>추가할 아이템<select data-catalog aria-label="추가할 아이템"></select></label><button type="button" data-add ${policy.items.length>=100?'disabled':''}>후보 추가</button></div></section>
      <footer><span>운영 모드와 드랍 설정을 함께 저장합니다.</span><button type="submit">운영 · 드랍 설정 저장</button></footer>`;
    fillCatalog();probabilities();drawTestUsers();
  }
  function disable(value){busy=value;form.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);if(!value&&policy?.items.length>=100)form.querySelector('[data-add]').disabled=true;if(!value)form.querySelectorAll('[data-test-add]').forEach(el=>el.disabled=(policy.testUserIds||[]).includes(Number(el.dataset.testAdd))||(policy.testUserIds||[]).length>=100);}
  async function load(){
    if(busy)return;disable(true);status.textContent='아이템 목록과 설정을 불러오는 중입니다.';
    try{const data=await api('admin/legion-hunt');policy=data.policy;catalog=data.catalog;testUsers=new Map((data.testUsers||[]).map(user=>[user.id,user]));searchResults=[];draw();status.textContent=policy.items.length?'저장된 운영·참여자·드랍 설정을 불러왔습니다.':'드랍 후보가 비어 있습니다. 후보를 추가한 뒤 드랍 사용을 켜고 저장하세요.';}
    catch(e){status.textContent=e.message;}finally{disable(false);}
  }
  form.addEventListener('input',event=>{if(event.target.matches('[data-search]'))fillCatalog();else if(event.target.name?.startsWith('items.'))probabilities();});
  form.addEventListener('keydown',event=>{if(event.target.matches('[data-test-query]')&&event.key==='Enter'){event.preventDefault();void searchTestUsers();}});
  form.addEventListener('click',event=>{
    if(busy)return;
    if(event.target.closest('[data-test-search]')){void searchTestUsers();return;}
    const addTester=event.target.closest('[data-test-add]');if(addTester){
      const user=searchResults.find(row=>row.id===Number(addTester.dataset.testAdd));if(!user)return;
      policy=collect();policy.testUserIds||=[];
      if(policy.testUserIds.length>=100||policy.testUserIds.includes(user.id))return;
      policy.testUserIds.push(user.id);testUsers.set(user.id,user);drawTestUsers();status.textContent=user.nickname+' 참여자 추가 · 설정을 저장하면 적용됩니다.';return;
    }
    const removeTester=event.target.closest('[data-test-remove]');if(removeTester){policy=collect();policy.testUserIds=(policy.testUserIds||[]).filter(id=>id!==Number(removeTester.dataset.testRemove));drawTestUsers();status.textContent='참여자 제외 · 설정을 저장하면 적용됩니다.';return;}
    if(event.target.closest('[data-reload]'))void load();
    const remove=event.target.closest('[data-remove]');if(remove){policy=collect();policy.items.splice(Number(remove.dataset.remove),1);draw();}
    if(event.target.closest('[data-add]')){
      const item=catalog.find(r=>r.code===form.querySelector('[data-catalog]').value);if(!item)return;
      policy=collect();if(policy.items.length>=100||policy.items.some(r=>r.code===item.code))return;
      policy.items.push({...item,enabled:false,weight:1,minQuantity:1,maxQuantity:1});draw();status.textContent=item.name+' 후보 추가 · 드랍 사용과 수치를 확인한 뒤 저장하세요.';
    }
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!policy)return;const next=collect();disable(true);
    try{const data=await api('admin/legion-hunt',{method:'PATCH',body:{policy:next}});policy=data.policy;draw();status.textContent='저장 완료 · '+policy.mode+' · 설정 r'+policy.revision+' · 모드·참여자는 즉시, 드랍 설정은 다음 원정부터 적용됩니다.';}
    catch(e){status.textContent=e.message;}finally{disable(false);}
  });
  await load();
}
function install(){
  const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;
  const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='군단토벌';button.dataset.view='legion-hunt';button.hidden=true;panel.className='view legion-cms';panel.id='view-legion-hunt';panel.hidden=true;nav.append(button);cms.append(panel);
  let mounted=false;
  button.addEventListener('click',event=>{event.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='군단토벌 · 드랍 설정';if(!mounted){mounted=true;void mountLegionHuntCms(panel);}},true);
  const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;panel.replaceChildren();mounted=false;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
