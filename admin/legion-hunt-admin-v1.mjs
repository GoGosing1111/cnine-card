import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {mountLegionRegionsCms} from './legion-regions-admin-v1.mjs?v=20261029-legion-ascendant-v1';
import {legionItemTypeLabel} from './legion-region-drops-v1.mjs?v=20261018-coins-paced-v2';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const names={normal:'보통',hard:'어려움',nightmare:'악몽',inferno:'지옥'};
function mountCitadelEditor(panel){
 const path='admin/legion-hunt/citadel',body=panel.querySelector('[data-editor]'),note=panel.querySelector('[role=status]');
 let policy,catalog,tiers=[],tier='gate',busy=false;
 const drafts=new Map();
 const field=(key,label,value,min,max,step)=>'<label>'+label+'<input name="'+key+'" type="number" required min="'+min+'" max="'+max+'" step="'+step+'" value="'+esc(value)+'"></label>';
 function available(){
  const select=body.querySelector('[data-supply-options]'),term=body.querySelector('[data-supply-search]').value.trim().toLowerCase();
  const used=new Set([...body.querySelectorAll('[data-supply]')].map(row=>row.dataset.supply));
  const rows=catalog.supplies.filter(v=>!used.has(v.code)&&(v.name+' '+v.code).toLowerCase().includes(term));
  select.innerHTML=rows.length?rows.map(v=>'<option value="'+esc(v.code)+'">'+esc(v.name)+'</option>').join(''):'<option value="">추가할 재료가 없습니다</option>';
  body.querySelector('[data-add-supply]').disabled=!rows.length||used.size>=100;
 }
 function supplyRow(item){
  const name=(catalog.supplies.find(v=>v.code===item.code)?.name||item.code)+(catalog.partyRewards?.calamity?.materialCodes.includes(item.code)?' · 재앙 연동':'');
  return '<div data-supply="'+esc(item.code)+'"><strong>'+esc(name)+'</strong>'+field('quantity','드롭 수량',item.quantity,1,1000000,1)+field('weight','가중치',item.weight,1,1000000,1)+'<button type="button" data-remove-supply aria-label="'+esc(name)+' 제외">제외</button></div>';
 }
 function dependencies(){
  const f=body.querySelector('[data-drops]');
  body.querySelector('[data-tier-fields]').disabled=f.elements.shareDrops?.checked===true;
 }
 function edited(f){
  const get=key=>f.elements[key].valueAsNumber;
  const previous=drafts.get(tier)?.drops??policy.tierDrops?.[tier]??policy.drops;
  return {normalPercent:get('normalPercent'),elitePercent:get('elitePercent'),bossPercent:get('bossPercent'),bossMultiplier:get('bossMultiplier'),
   bossSetPercent:previous.bossSetPercent,equipmentCodes:previous.equipmentCodes,
   supplies:[...f.querySelectorAll('[data-supply]')].map(row=>({code:row.dataset.supply,quantity:row.querySelector('[name=quantity]').valueAsNumber,weight:row.querySelector('[name=weight]').valueAsNumber}))};
 }
 function draw(){
  const draft=drafts.get(tier),own=policy.tierDrops?.[tier],shared=tier!=='gate'&&(draft?.shared??!own),d=shared?policy.drops:draft?.drops??own??policy.drops;
  const rewards=catalog.partyRewards,unique=rewards?.unique[tier];
  body.innerHTML='<form data-mode-form><fieldset><legend>파티 신규 입장</legend><label>입장 상태<select name="mode"><option value="OFF">OFF · 입장 중지</option><option value="ON">ON · 입장 허용</option></select></label><button type="submit">입장 상태 저장</button></fieldset></form>'+
  '<form data-drops><label>드롭 설정 난이도<select name="tier">'+tiers.map(t=>'<option value="'+esc(t.id)+'" '+(tier===t.id?'selected':'')+'>'+esc(t.stage+'단계 · '+t.name)+'</option>').join('')+'</select></label>'+
  (tier==='gate'?'':'<label class="legion-cms-check"><input type="checkbox" name="shareDrops" '+(shared?'checked':'')+'>1단계 드롭 설정 사용</label>')+
  (unique?.tiers?'<fieldset><legend>성주 유니크 장비</legend><p>이 성주의 확률은 왕좌의 '+Math.round(unique.scale*100)+'%입니다. 아래 평균은 보너스 전 1인 기준입니다.</p><ul>'+
   unique.tiers.map(row=>'<li>'+esc(row.tier+'단계 '+row.family)+' · 10단계 용병장비 확률의 1/'+row.divisor+' × '+Math.round(unique.scale*100)+'% · '+(row.expectedRuns?'평균 약 '+Math.round(row.expectedRuns).toLocaleString('ko-KR')+'회에 1개':'지역 상위 장비 드롭 중지')+'</li>').join('')+'</ul></fieldset>':'')+
  (rewards?'<p>처치 코인은 재앙의 '+rewards.coinMultiplier+'배, 1인 최대 '+rewards.coinCap.toLocaleString('ko-KR')+'코인입니다.</p>':'')+
  '<fieldset><legend>솔로 재앙 연동</legend>'+(rewards?.calamity?'<p>운영 지역 '+rewards.calamity.regions+'곳 · 필드 아이템 '+rewards.calamity.fieldItems+'종</p>':'')+'<p>공개 지역의 필드 아이템, 연마석, 지역 세트·보스 고유 장비와 용병 장비 1~10단계를 각 참가자가 획득할 수 있습니다. 품목별 확률은 같은 처치의 솔로 재앙 기준 '+esc(rewards?.itemMultiplier??1.3)+'배이며 최대 100%입니다. 성주 처치 확정 연마석은 개인 가방에 담깁니다.</p></fieldset>'+
  '<fieldset data-tier-fields><legend>파티 전용 추가 재료</legend><fieldset><legend>몬스터별 기본 확률</legend>'+
  '<p>재앙 드롭과 겹치는 품목은 재앙 설정을 따릅니다. 아래 확률과 가중치는 추가 재료에 적용합니다.</p><div class="legion-cms-region-fields">'+
  field('normalPercent','일반 몬스터 드롭 확률 (%)',d.normalPercent,0,100,'any')+field('elitePercent','정예 몬스터 드롭 확률 (%)',d.elitePercent,0,100,'any')+
  field('bossPercent','성주 드롭 확률 (%)',d.bossPercent,0,100,'any')+field('bossMultiplier','성주 재료 수량 배수',d.bossMultiplier,1,100,1)+'</div></fieldset>'+
  '<fieldset><legend>개인 재료 후보</legend><p>서로 다른 재료를 2종 이상 등록하세요. 출전 시 두 사람에게 후보를 나눈 뒤, 각자 배정된 후보 안에서 가중치에 따라 추첨합니다.</p><div data-supplies>'+d.supplies.map(supplyRow).join('')+'</div>'+
  '<div class="legion-cms-add"><label>재료 검색<input type="search" data-supply-search></label><label>추가할 재료<select data-supply-options></select></label><button type="button" data-add-supply>재료 추가</button></div></fieldset>'+
  '</fieldset><footer><span>다음 출전부터 적용됩니다.</span><button type="submit">성채 드롭 저장</button></footer></form>';
  body.querySelector('[name=mode]').value=policy.mode;available();dependencies();
 }
 async function load(){
  if(busy)return;busy=true;body.inert=true;note.textContent='성채 설정을 불러오는 중입니다.';
  try{const data=await api(path);policy=data.policy;catalog=data.catalog;tiers=data.tiers;drafts.clear();draw();note.textContent='신규 입장 '+policy.mode+' · 설정 r'+policy.revision;}
  catch(err){note.textContent=err.message;}finally{busy=false;body.inert=false;}
 }
 panel.addEventListener('toggle',()=>{if(panel.open&&!policy)void load();});
 panel.querySelector('[data-citadel-reload]').addEventListener('click',load);
 body.addEventListener('input',e=>{if(e.target.matches('[data-supply-search]'))available();});
 body.addEventListener('change',e=>{
  if(e.target.name==='tier'){const f=e.target.form;drafts.set(tier,{shared:!!f.elements.shareDrops?.checked,drops:edited(f)});tier=e.target.value;draw();return;}
  if(e.target.name==='shareDrops'){
   const saved=drafts.get(tier)?.drops??policy.tierDrops?.[tier]??policy.drops;
   drafts.set(tier,{shared:e.target.checked,drops:e.target.checked?edited(e.target.form):saved});draw();return;
  }
 });
 body.addEventListener('click',e=>{
  const remove=e.target.closest('[data-remove-supply]');if(remove){remove.closest('[data-supply]').remove();available();return;}
  if(e.target.closest('[data-add-supply]')){const code=body.querySelector('[data-supply-options]').value;if(!code)return;body.querySelector('[data-supplies]').insertAdjacentHTML('beforeend',supplyRow({code,quantity:1,weight:1}));available();}
 });
 body.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;const f=e.target,mode=f.hasAttribute('data-mode-form'),data={revision:policy.revision};
  if(mode)data.mode=f.elements.mode.value;
  else{data.tier=tier;data.drops=f.elements.shareDrops?.checked?null:edited(f);}
  busy=true;body.inert=true;
  try{policy=(await api(path,{method:'PATCH',body:data})).policy;if(!mode){drafts.delete(tier);draw();}note.textContent=(mode?'입장 상태 저장 완료':'성채 드롭 저장 완료')+' · 신규 입장 '+policy.mode+' · 설정 r'+policy.revision;}
  catch(err){note.textContent=err.message;}finally{busy=false;body.inert=false;}
 });
}
export async function mountLegionHuntCms(root){
  let policy,coinCaps=null,catalog=[],busy=false,testUsers=new Map(),searchResults=[];
  root.innerHTML='<details class="legion-citadel-cms"><summary>불타는 성채 파티 · 입장 및 드롭 설정</summary><p role="status" aria-live="polite"></p><button type="button" data-citadel-reload>성채 설정 다시 불러오기</button><div data-editor></div></details><p class="legion-cms-status" role="status"></p><form></form><section class="legion-regions-cms"></section>';
  const status=root.querySelector('.legion-cms-status'),form=root.querySelector('form');
  mountCitadelEditor(root.querySelector('.legion-citadel-cms'));
  const number=(name,label,value,min,max,step=1)=>`<label>${label}<input type="number" name="${name}" aria-label="${label}" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`;
  function coinTable(){
    if(!coinCaps)return '';
    const labels={...names,calamity:'재앙'},amount=n=>n?Number(n/100000000).toLocaleString('ko-KR')+'억':'—';
    return `<section class="legion-cms-coin-policy"><h3>몬스터 처치 코인</h3><p>처치할 때마다 자동 습득합니다. 아래 금액은 <b>보너스를 포함한 한 판 최대치</b>입니다. 클리어 추가 지급은 없습니다.</p><table><caption>판당 코인 상한</caption><thead><tr><th>난이도</th><th>잊혀진 섬</th><th>신규 5지역</th></tr></thead><tbody>${Object.entries(labels).map(([id,name])=>`<tr><th>${name}</th><td>${amount(coinCaps.island[id])}</td><td>${amount(coinCaps.regions[id])}</td></tr>`).join('')}</tbody></table><p>일반 1배 · 정예 3배 · 보스 5배로 나누어 수급합니다. 펫·트로피 보너스가 있어도 상한을 넘지 않습니다. 모든 지역이 행동력을 공유합니다. 최대 10회, 후원 기간에는 13회까지 저장하며 3시간마다 1회 충전됩니다. OWNER의 코인 수급도 같은 행동력을 사용합니다. OFF·TEST에서는 실제 코인을 지급하지 않습니다.</p></section>`;
  }
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
    const rows=catalog.filter(i=>!selected.has(i.code)&&(!term||(i.name+' '+i.code+' '+legionItemTypeLabel(i)).toLocaleLowerCase().includes(term)));
    select.innerHTML=rows.length?rows.map(i=>`<option value="${esc(i.code)}">[${legionItemTypeLabel(i)}] ${esc(i.name)}</option>`).join(''):'<option value="">추가할 아이템이 없습니다</option>';
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
      <section class="legion-cms-operation"><h3>운영 모드</h3><div class="legion-cms-modes">${[['OFF','운영 중지','모든 계정 입장·전투 요청 차단'],['TEST','지정 인원 검수','OWNER + 지정 참여자 · 보상 미지급'],['ON','정식 운영','일반 유저 입장 · 계정 보상 지급']].map(([mode,title,detail])=>`<label data-mode="${mode}"><input type="radio" name="mode" value="${mode}" ${(policy.mode||'TEST')===mode?'checked':''}><span><b>${mode}</b><strong>${title}</strong><small>${detail}</small></span></label>`).join('')}</div><p>모드는 저장 즉시 적용됩니다. 일반 계정은 행동력 최대 10회(후원 13회), 3시간마다 1회 충전됩니다. OWNER는 입장 무제한이며 코인 수급에는 행동력을 사용합니다. TEST에서 시작한 원정은 계속 검수용으로 유지됩니다.</p></section>
      ${coinTable()}<section class="legion-cms-testers"><h3>TEST 참여자 <small data-test-count></small></h3><p>OWNER는 항상 포함됩니다. 아래 지정 계정은 TEST에서만 추가로 허용되며, 계정 보상은 지급하지 않습니다. 추가·제외 후 설정을 저장하면 바로 적용됩니다.</p><div class="legion-cms-tester-search"><label>닉네임 또는 계정번호<input type="search" data-test-query maxlength="80" placeholder="정확한 닉네임 또는 계정번호"></label><button type="button" data-test-search>계정 찾기</button></div><p data-test-status role="status" aria-live="polite"></p><ul data-test-results aria-label="계정 검색 결과"></ul><ul data-test-selected aria-label="지정된 테스트 참여자"></ul></section>
      <div class="legion-cms-notice"><b>코인은 사냥 중 · 아이템은 종료 정산</b><span>ON에서 몬스터 처치 코인은 자동 지급됩니다. 주운 아이템은 클리어·패배·철수 정산 시 지급됩니다. 코인을 받은 원정은 중단해도 입장 횟수를 사용합니다. 코인을 받지 않은 미확정 중단만 횟수를 복구합니다.</span></div>
      <section><h3>일반 아이템 · 난이도별 드랍</h3><p>몬스터 처치 때 드랍 여부를 판정합니다. 중간·최종 보스에는 보스 확률을 적용합니다.</p><div class="legion-cms-difficulties">${policy.difficulties.map((d,i)=>`<fieldset><legend>${names[d.id]}</legend>${number('difficulties.'+i+'.dropPercent','일반 몬스터 확률 (%)',d.dropPercent,0,100,.01)}${number('difficulties.'+i+'.bossDropPercent','보스 확률 (%)',d.bossDropPercent,0,100,.01)}${number('difficulties.'+i+'.lifetimeSeconds','필드 소멸 시간 (초)',d.lifetimeSeconds,3,30,.1)}</fieldset>`).join('')}</div></section>
      <section><h3>드랍 후보 <small>${policy.items.length} / 100</small></h3><p>드랍에 성공하면 사용 중인 후보에서 1종을 선택합니다. 가중치는 0.001 단위로 입력하며, 선택 확률은 가중치 ÷ 사용 중인 가중치 합계입니다. 수량은 최소~최대 사이에서 추첨합니다.</p><div class="legion-cms-items">${policy.items.map((item,i)=>`<article data-item="${i}"><div class="legion-cms-item-title"><img src="${esc(item.image)}" alt="" loading="lazy"><div><strong>${esc(item.name)}</strong><small>${legionItemTypeLabel(catalog.find(r=>r.code===item.code)||item)}</small><b data-odds="${i}"></b></div><button type="button" data-remove="${i}" aria-label="${esc(item.name)} 제외">제외</button></div><div class="legion-cms-item-fields"><label class="legion-cms-check"><input type="checkbox" name="items.${i}.enabled" ${item.enabled?'checked':''}>드랍 사용</label>${number('items.'+i+'.weight','선택 가중치',item.weight,0,1000000,.001)}${number('items.'+i+'.minQuantity','최소 수량',item.minQuantity,1,item.type==='VEHICLE'?1:item.type==='EQUIPMENT'?100:1000000)}${number('items.'+i+'.maxQuantity','최대 수량',item.maxQuantity,1,item.type==='VEHICLE'?1:item.type==='EQUIPMENT'?100:1000000)}</div></article>`).join('')||'<div class="legion-cms-empty">등록된 후보가 없습니다. 아래 목록에서 아이템을 추가하세요.</div>'}</div>
      <div class="legion-cms-add"><label>아이템 검색<input type="search" data-search placeholder="이름 또는 코드"></label><label>추가할 아이템<select data-catalog aria-label="추가할 아이템"></select></label><button type="button" data-add ${policy.items.length>=100?'disabled':''}>후보 추가</button></div></section>
      <footer><span>운영 모드와 드랍 설정을 함께 저장합니다.</span><button type="submit">운영 · 드랍 설정 저장</button></footer>`;
    fillCatalog();probabilities();drawTestUsers();
  }
  function disable(value){busy=value;form.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);if(!value&&policy?.items.length>=100)form.querySelector('[data-add]').disabled=true;if(!value)form.querySelectorAll('[data-test-add]').forEach(el=>el.disabled=(policy.testUserIds||[]).includes(Number(el.dataset.testAdd))||(policy.testUserIds||[]).length>=100);}
  async function load(){
    if(busy)return;disable(true);status.textContent='아이템 목록과 설정을 불러오는 중입니다.';
    try{const data=await api('admin/legion-hunt');policy=data.policy;coinCaps=data.coinCaps;catalog=data.catalog;testUsers=new Map((data.testUsers||[]).map(user=>[user.id,user]));searchResults=[];draw();status.textContent=policy.items.length?'저장된 운영·참여자·드랍 설정을 불러왔습니다.':'드랍 후보가 비어 있습니다. 후보를 추가한 뒤 드랍 사용을 켜고 저장하세요.';}
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
  await mountLegionRegionsCms(root.querySelector('.legion-regions-cms'));
}
function install(){
  const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;
  const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='군단토벌';button.dataset.view='legion-hunt';button.hidden=true;panel.className='view legion-cms';panel.id='view-legion-hunt';panel.hidden=true;nav.append(button);cms.append(panel);
  let mounted=false;
  button.addEventListener('click',event=>{event.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='군단토벌 · 코인 · 용병장비';if(!mounted){mounted=true;void mountLegionHuntCms(panel);}},true);
  const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;panel.replaceChildren();mounted=false;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
