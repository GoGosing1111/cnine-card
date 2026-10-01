import {cleanAxeSettings} from '../js/golden-axe-model-v1.js?v=20261002-editor';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kst=value=>value?new Date(Date.parse(value)+9*3600000).toISOString().slice(0,23):'';
const percentage=n=>Number(n.toFixed(8)).toLocaleString('ko-KR',{maximumFractionDigits:8})+'%';
let panel,revision=null,loaded=false,busy=false,rewards=[],catalog=[],removed=[];
const token=()=>localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
const field=name=>panel.querySelector(`[name="${name}"]`);
const inputNumber=input=>input.value.trim()===''?null:Number(input.value);
const number=name=>inputNumber(field(name));
async function api(body){const response=await fetch('/api/admin/golden-axe',{method:body?'PATCH':'GET',cache:'no-store',headers:{authorization:'Bearer '+token(),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw Error(data.error||'설정 조회 실패');return data;}
function syncRewards(){for(const row of panel.querySelectorAll('[data-reward-row]')){const reward=rewards.find(r=>r.key===row.dataset.rewardRow);reward.rate=inputNumber(row.querySelector('[data-rate]'));if(reward.kind==='ITEM')reward.quantity=inputNumber(row.querySelector('[data-quantity]'));}}
function form(){
 syncRewards();return {revision,visible:field('visible').checked,enabled:field('enabled').checked,startsAt:field('startsAt').value?field('startsAt').value+'+09:00':null,endsAt:field('endsAt').value?field('endsAt').value+'+09:00':null,axeCost:number('axeCost'),dailyLimit:number('dailyLimit'),rewards:rewards.map(r=>({key:r.key,quantity:r.quantity})),rates:Object.fromEntries(rewards.map(r=>[r.key,r.rate])),mercenaryRates:Object.fromEntries(['S','SS','SSS'].map(rank=>[rank,!rewards.some(r=>r.key==='MERCENARY_'+rank)||field('mercenaryMode_'+rank).value==='uniform'?null:Object.fromEntries([...panel.querySelectorAll('[data-mercenary-rank="'+rank+'"]')].map(input=>[input.dataset.code,Number(input.value||0)]))]))};
}
function total(){
 syncRewards();const sum=rewards.reduce((s,r)=>s+Math.round((r.rate??0)*10000),0)/10000,miss=rewards.find(r=>r.kind==='MISS')?.rate??0,node=panel.querySelector('[data-total]'),incomplete=rewards.some(r=>r.rate===null);
 node.textContent=`보상 ${rewards.filter(r=>r.kind!=='MISS').length}종 · 확률 합계 ${percentage(sum)} / 100% · 당첨 ${percentage(sum-miss)} · 꽝 ${percentage(miss)}${incomplete?' · 미설정 항목 있음':''}`;
 node.classList.toggle('axe-admin-error',incomplete||Math.abs(sum-100)>1e-6);mercenaryTotals();
}
function notice(text){const output=panel.querySelector('output');output.className='';output.textContent=text;}
function paintRewards(){
 panel.querySelector('[data-reward-rows]').innerHTML=rewards.map(r=>`<tr data-reward-row="${esc(r.key)}"><td class="axe-reward-label"><img loading="lazy" src="${esc(r.image)}" alt=""><span><b>${esc(r.name)}</b><small>${esc(r.code||r.tag)}</small></span></td><td data-label="지급 수량">${r.kind==='ITEM'?`<input type="number" min="1" max="1000000" step="1" data-quantity value="${r.quantity??''}" aria-label="${esc(r.name)} 지급 수량">`:r.kind==='COIN'?r.amount.toLocaleString('ko-KR')+' 코인':r.kind==='MISS'?'—':'1개'}</td><td data-label="등장확률 (%)"><input type="number" min="0" max="100" step="0.0001" data-rate name="${esc(r.key)}" value="${r.rate??''}" placeholder="미설정" aria-label="${esc(r.name)} 확률"></td><td class="axe-reward-state ${r.available?'':'axe-admin-error'}">${r.available?'지급 준비됨':'지급 불가 · 카탈로그 확인'}</td><td><button type="button" data-remove="${esc(r.key)}" class="axe-remove" aria-label="${esc(r.name)} 보상 삭제">삭제</button></td></tr>`).join('')||'<tr><td colspan="5">아래에서 보상을 추가하세요.</td></tr>';
 panel.querySelector('[data-undo]').disabled=!removed.length;paintCatalog();total();
}
function paintCatalog(){
 const search=field('itemSearch').value.trim().toLocaleLowerCase(),kind=field('itemKind').value,available=catalog.filter(r=>!rewards.some(v=>v.key===r.key)&&(!kind||r.kind===kind)&&(!search||[r.name,r.code,r.category,r.tag].some(v=>String(v||'').toLocaleLowerCase().includes(search))));
 const select=field('newReward'),selected=select.value;select.innerHTML=available.map(r=>`<option value="${esc(r.key)}">${esc(r.name)}${r.code?' · '+esc(r.code):''}${r.available?'':' · 지급 준비 필요'}</option>`).join('')||'<option value="">추가할 상품이 없습니다</option>';
 if(available.some(r=>r.key===selected))select.value=selected;
 panel.querySelector('[data-add-count]').textContent=`추가 가능한 상품 ${available.length}종`;
 panel.querySelector('[data-add]').disabled=busy||!loaded||!select.value;newRewardPreview();
}
function newRewardPreview(){
 const reward=catalog.find(r=>r.key===field('newReward').value);field('newQuantity').disabled=reward?.kind!=='ITEM';if(reward?.kind!=='ITEM')field('newQuantity').value=1;
 panel.querySelector('[data-new-reward]').innerHTML=reward?`<img src="${esc(reward.image)}" alt=""><span><b>${esc(reward.name)}</b><small>${esc(reward.detail)}</small></span>`:'';
}
function addReward(){
 if(busy||!loaded)return;const reward=catalog.find(r=>r.key===field('newReward').value);if(!reward||rewards.some(r=>r.key===reward.key))return;
 const quantity=reward.kind==='ITEM'?number('newQuantity'):1;
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000){notice('지급 수량은 1~1,000,000 사이의 정수로 입력하세요.');return;}
 if(rewards.length>=200){notice('상품은 최대 200종까지 설정할 수 있습니다.');return;}
 syncRewards();rewards.push({...reward,quantity,rate:0});paintRewards();notice(reward.name+' 추가 · 확률은 0%입니다. 확률을 입력한 뒤 저장하세요.');
}
async function update(save=false){
 if(busy)return;const output=panel.querySelector('output');let body;
 if(save){try{body=form();cleanAxeSettings(body);}catch(e){output.textContent=e.message;output.className='axe-admin-error';return;}}
 busy=true;panel.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);notice(save?'설정을 저장하고 있습니다…':'운영 설정과 상품 지급 상태를 확인하고 있습니다…');
 try{
  const data=await api(body);revision=data.revision;loaded=true;removed=[];catalog=data.itemCatalog||data.rewards;
  rewards=data.rewards.map(r=>({...r,rate:data.settings.rates[r.key]}));
  for(const key of ['visible','enabled'])field(key).checked=data.settings[key];
  for(const key of ['startsAt','endsAt'])field(key).value=kst(data.settings[key]);
  for(const key of ['axeCost','dailyLimit'])field(key).value=data.settings[key]??'';
  paintMercenaries(data);paintRewards();notice(`${save?'저장 완료 · ':''}${data.settings.enabled?'운영 ON · 지정 기간에만 참가 가능':'운영 OFF · 낡은도끼 차감 없음'} · ${data.complete?'필수 설정 완료':'기간·참가 수량·일일 횟수·확률을 설정하세요.'}`);
 }catch(e){output.textContent=e.message;output.className='axe-admin-error';}
 finally{busy=false;panel.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);panel.querySelector('[data-save]').disabled=!loaded;panel.querySelector('[data-undo]').disabled=!removed.length;paintCatalog();mercenaryTotals();}
}
function paintMercenaries(data){
 panel.querySelector('[data-mercenary-pools]').innerHTML='<h4>용병 등급 내 개별 확률</h4><p>최종 획득확률 = 등급 상품 확률 × 등급 내 용병 확률 ÷ 100<br>「용병별 직접 설정」을 선택하면 각 용병의 비율을 입력할 수 있습니다. 등급 내 합계는 100%, 0% 용병은 추첨에서 제외됩니다. 현재 획득 가능한 용병만 표시합니다.</p>'+['S','SS','SSS'].map(rank=>{
  const list=(data.mercenaries||[]).filter(m=>m.rank===rank),rates=data.settings.mercenaryRates?.[rank],custom=Boolean(rates);
  return `<details class="axe-mercenary-pool" data-pool="${rank}" ${custom||data.settings.rates['MERCENARY_'+rank]>0?'open':''}><summary>${rank} 용병 · ${list.length}종 <span>용병별 확률 변경</span></summary><div class="axe-pool-actions"><label>추첨 방식 <select name="mercenaryMode_${rank}" aria-label="${rank} 용병 추첨 방식"><option value="uniform" ${!custom?'selected':''}>균등 추첨</option><option value="custom" ${custom?'selected':''}>용병별 직접 설정</option></select></label><button type="button" data-equal="${rank}">균등값 채우기</button></div><div class="axe-admin-table"><table><thead><tr><th>용병</th><th>등급 내 확률 (%)</th><th>최종 획득확률</th></tr></thead><tbody>${list.map(m=>`<tr><td><img loading="lazy" src="${esc(m.image)}" alt="">${esc(m.name)} <small>${esc(m.code)}</small></td><td><input type="number" min="0" max="100" step="0.0001" data-mercenary-rank="${rank}" data-code="${esc(m.code)}" aria-label="${esc(rank+' '+m.name+' 등급 내 확률')}" value="${custom?rates[m.code]??0:''}" placeholder="${list.length?percentage(100/list.length):'0%'}"></td><td data-final-code="${esc(m.code)}">—</td></tr>`).join('')}</tbody></table></div><p data-pool-total></p></details>`;
 }).join('');
}
function equalRates(rank){
 const inputs=[...panel.querySelectorAll('[data-mercenary-rank="'+rank+'"]')];if(!inputs.length)return;
 const each=Math.floor(1000000/inputs.length),remainder=1000000%inputs.length;inputs.forEach((input,i)=>input.value=(each+(i<remainder?1:0))/10000);field('mercenaryMode_'+rank).value='custom';mercenaryTotals();
}
function mercenaryTotals(){
 for(const section of panel.querySelectorAll('[data-pool]')){
  const rank=section.dataset.pool,reward=rewards.find(r=>r.key==='MERCENARY_'+rank),uniform=field('mercenaryMode_'+rank).value==='uniform',inputs=[...section.querySelectorAll('[data-mercenary-rank]')],grade=reward?.rate||0;
  field('mercenaryMode_'+rank).disabled=busy||!reward;section.querySelector('[data-equal]').disabled=busy||!reward||!inputs.length;
  let sum=0;for(const input of inputs){input.disabled=busy||uniform||!reward;const rate=uniform?(inputs.length?100/inputs.length:0):Number(input.value||0);sum+=Math.round(rate*10000);section.querySelector('[data-final-code="'+input.dataset.code+'"]').textContent=percentage(grade*rate/100);}
  const total=section.querySelector('[data-pool-total]');total.textContent=!reward?'이 등급의 상품을 보상 목록에 추가하면 설정할 수 있습니다.':uniform?'획득 가능한 '+inputs.length+'종을 균등 추첨합니다.':'등급 내 합계 '+percentage(sum/10000)+' / 100%';total.classList.toggle('axe-admin-error',Boolean(reward)&&!uniform&&sum!==1000000);
 }
}
function coupon(){const nav=document.querySelector('#nav [data-view="coupons"]'),select=document.getElementById('couponRewardType');if(!nav||nav.hidden||!select){notice('쿠폰관리 권한이 있는 관리자 계정으로 발급하세요.');return;}nav.click();select.value='PINGDU_OLD_AXE';select.dispatchEvent(new Event('change',{bubbles:true}));const amount=document.getElementById('couponRewardAmount');if(amount)amount.value='1';document.getElementById('couponCode')?.focus();}
function mount(){
 const target=document.getElementById('view-settings');if(!target||panel)return;panel=document.createElement('section');panel.id='goldenAxeAdmin';panel.className='axe-admin';
 panel.innerHTML=`<small>LIMITED EVENT · GOLDEN / SILVER AXE</small><h3>핑두의 금도끼 은도끼</h3><p>참가 조건과 보상을 한곳에서 관리합니다. 추가·삭제·수량·확률 변경은 아래 <b>이벤트 설정 저장</b>을 눌러야 반영됩니다.</p><div class="axe-admin-grid"><label>시작 일시 (KST)<input name="startsAt" type="datetime-local" step="0.001"></label><label>종료 일시 (KST)<input name="endsAt" type="datetime-local" step="0.001"></label><label>1회 낡은도끼 수량<input name="axeCost" type="number" min="1" max="1000000" step="1" placeholder="미설정"></label><label>계정당 일일 참가 횟수 · 0 = 무제한<input name="dailyLimit" type="number" min="0" max="100000" step="1" placeholder="미설정"></label></div><div class="axe-admin-flags"><label><input name="visible" type="checkbox"> 유저 메뉴에 공개</label><label><input name="enabled" type="checkbox"> 실제 참가·차감·지급 ON</label></div><div class="axe-admin-note"><p>상품과 꽝의 확률 합계가 <b>100%</b>여야 ON으로 저장됩니다. 확률은 0.1%를 포함해 소수점 4자리까지 설정할 수 있습니다. 일일 제한은 매일 <b>00시 KST</b>에 초기화됩니다.</p></div><h4>보상 목록</h4><div class="axe-admin-table axe-rewards-table"><table><thead><tr><th>당첨 상품</th><th>지급 수량</th><th>등장확률 (%)</th><th>지급 상태</th><th>관리</th></tr></thead><tbody data-reward-rows></tbody></table></div><div class="axe-reward-tools"><button type="button" data-undo disabled>마지막 삭제 취소</button><span>삭제한 상품의 확률은 자동 배분되지 않습니다.</span></div><div class="axe-admin-total" data-total></div><section class="axe-add-reward"><header><h4>새 보상 추가</h4><span data-add-count></span></header><div class="axe-add-filters"><label>이름·코드 검색<input name="itemSearch" type="search" placeholder="예: 보호권, 강화석, 부품"></label><label>보상 종류<select name="itemKind"><option value="">전체</option><option value="ITEM">아이템·재료·이용권</option><option value="MERCENARY">용병 등급</option><option value="EQUIPMENT">배틀슈트</option><option value="COIN">코인</option><option value="MISS">꽝</option></select></label></div><label>추가할 상품<select name="newReward"></select></label><div class="axe-new-reward" data-new-reward></div><div class="axe-add-bottom"><label>지급 수량<input name="newQuantity" type="number" min="1" max="1000000" step="1" value="1"></label><button type="button" data-add disabled>보상 추가 · 확률 0%</button></div><p>CMS에 등록된 활성 아이템을 선택합니다. 필요한 수량을 입력한 뒤 추가하세요.</p></section><div data-mercenary-pools></div><p>장비·용병은 1개씩, 아이템은 설정 수량만큼 지급합니다. 보상 삭제는 이 이벤트의 추첨 목록에만 적용됩니다.<br><b>참가 아이템: 낡은도끼</b> — 쿠폰관리 또는 유저관리에서 지급할 수 있습니다.</p><div class="admin-actions"><button type="button" data-coupon>낡은도끼 쿠폰 만들기</button><button type="button" data-load>다시 불러오기</button><button type="button" class="axe-admin-save" data-save disabled>이벤트 설정 저장</button><a href="/preview/golden-axe-v1/" target="_blank" rel="noopener">연출 검수 열기 ↗</a></div><output aria-live="polite"></output>`;
 target.querySelector('.sectionIntro')?.after(panel);if(!panel.isConnected)target.append(panel);
 panel.querySelector('[data-coupon]').onclick=coupon;panel.querySelector('[data-load]').onclick=()=>update();panel.querySelector('[data-save]').onclick=()=>update(true);panel.querySelector('[data-add]').onclick=addReward;
 panel.querySelector('[data-undo]').onclick=()=>{if(busy||!removed.length)return;syncRewards();const entry=removed.pop();if(!rewards.some(r=>r.key===entry.reward.key))rewards.splice(entry.index,0,entry.reward);paintRewards();notice('삭제를 취소했습니다. 저장 전 변경 사항입니다.');};
 panel.addEventListener('click',event=>{if(busy)return;const remove=event.target.closest('[data-remove]');if(remove){syncRewards();const index=rewards.findIndex(r=>r.key===remove.dataset.remove);removed.push({index,reward:rewards.splice(index,1)[0]});paintRewards();notice('보상 목록에서 삭제했습니다. 합계를 확인한 뒤 저장하세요.');}const equal=event.target.closest('[data-equal]');if(equal)equalRates(equal.dataset.equal);});
 panel.addEventListener('input',event=>{if(event.target.name==='itemSearch')paintCatalog();else total();});
 panel.addEventListener('change',event=>{if(event.target.name==='itemKind')paintCatalog();else if(event.target.name==='newReward')newRewardPreview();else{if(event.target.name?.startsWith('mercenaryMode_')&&event.target.value==='custom'){const rank=event.target.name.slice(14),inputs=[...panel.querySelectorAll('[data-mercenary-rank="'+rank+'"]')];if(inputs.every(input=>!input.value))equalRates(rank);}total();}});
 total();new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&token()&&!loaded&&!busy)void update();}).observe(panel);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
