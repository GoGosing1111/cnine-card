import {CHUSEOK_EVENTS,CHUSEOK_KINDS,cleanChuseokSettings} from '../js/chuseok-model-v1.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kst=v=>v?new Date(Date.parse(v)+9*3600000).toISOString().slice(0,16):'';
let panel,revision=null,catalog=[],loaded=false,busy=false,saved=null;
const token=()=>localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
const field=(scope,name)=>scope.querySelector('[name="'+name+'"]');
const number=(scope,name)=>field(scope,name).value.trim()===''?null:Number(field(scope,name).value);
async function api(body){const response=await fetch('/api/admin/chuseok',{method:body?'PATCH':'GET',cache:'no-store',headers:{authorization:'Bearer '+token(),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw Error(data.error||'설정 조회 실패');return data;}
function rowData(row){return {id:row.dataset.id,kind:field(row,'kind').value,ref:field(row,'ref').value,amount:number(row,'amount'),rate:number(row,'rate')};}
function form(){
 return {revision,visible:field(panel,'visible').checked,events:Object.fromEntries(Object.keys(CHUSEOK_EVENTS).map(key=>{const scope=panel.querySelector('[data-config="'+key+'"]');return [key,{enabled:field(scope,'enabled').checked,startsAt:field(scope,'startsAt').value?field(scope,'startsAt').value+':00+09:00':null,endsAt:field(scope,'endsAt').value?field(scope,'endsAt').value+':00+09:00':null,coinCost:number(scope,'coinCost'),dailyLimit:number(scope,'dailyLimit'),rewards:[...scope.querySelectorAll('[data-reward]')].map(rowData)}];}))};
}
function rewardOptions(kind,ref){const list=catalog.filter(c=>c.kind===kind);return '<option value="">상품 선택</option>'+(!list.some(c=>c.ref===ref)&&ref?'<option value="'+esc(ref)+'" selected>지급 불가 · '+esc(ref)+'</option>':'')+list.map(c=>'<option value="'+esc(c.ref)+'" '+(c.ref===ref?'selected':'')+'>'+esc((c.rank?c.rank+' · ':'')+c.name+' ['+c.ref+']')+'</option>').join('');}
function rewardRow(r){
 const row=document.createElement('tr');row.dataset.reward='';row.dataset.id=r.id;
 row.innerHTML=`<td><select name="kind" aria-label="상품 종류">${Object.entries(CHUSEOK_KINDS).map(([k,v])=>'<option value="'+k+'" '+(r.kind===k?'selected':'')+'>'+v+'</option>').join('')}</select></td><td><select name="ref" aria-label="상품 선택">${rewardOptions(r.kind,r.ref)}</select><small data-availability></small></td><td><input name="amount" type="number" min="1" step="1" placeholder="미설정" value="${r.amount??''}" aria-label="지급 수량"></td><td><input name="rate" type="number" min="0" max="100" step="0.0001" placeholder="미설정" value="${r.rate??''}" aria-label="등장확률 퍼센트"></td><td><button type="button" data-remove aria-label="상품 삭제">×</button></td>`;
 const sync=()=>{const kind=field(row,'kind').value,select=field(row,'ref'),amount=field(row,'amount'),isCatalog=['ITEM','EQUIPMENT','MERCENARY'].includes(kind);select.disabled=!isCatalog;amount.disabled=kind==='MISS'||kind==='EQUIPMENT'||kind==='MERCENARY';amount.max=kind==='COIN'?String(Number.MAX_SAFE_INTEGER):kind==='ITEM'?'1000000':'1';row.querySelector('[data-availability]').textContent=!isCatalog?kind==='MISS'?'상품 없음 · 비용 소모':'일반 게임 코인':catalog.some(c=>c.kind===kind&&c.ref===select.value)?'공개·활성 상품':'상품을 선택하세요';};
 field(row,'kind').onchange=()=>{const kind=field(row,'kind').value;field(row,'ref').innerHTML=rewardOptions(kind,'');field(row,'amount').value=['EQUIPMENT','MERCENARY'].includes(kind)?'1':'';sync();totals();};
 field(row,'ref').onchange=sync;row.querySelector('[data-remove]').onclick=()=>{row.remove();totals();};sync();return row;
}
function totals(){
 if(!loaded)return;for(const scope of panel.querySelectorAll('[data-config]')){const rewards=[...scope.querySelectorAll('[data-reward]')].map(rowData),sum=rewards.reduce((n,r)=>n+Math.round((r.rate??0)*10000),0)/10000,node=scope.querySelector('[data-total]');node.textContent='확률 합계 '+sum+'% / 100%'+(rewards.some(r=>r.rate===null)?' · 미설정 있음':'');node.classList.toggle('ck-admin-error',sum!==100||!rewards.length||rewards.some(r=>r.rate===null));}
}
function paint(data){
 revision=data.revision;catalog=data.catalog;saved=data.settings;loaded=true;field(panel,'visible').checked=saved.visible;
 for(const [key,s] of Object.entries(saved.events)){const scope=panel.querySelector('[data-config="'+key+'"]');field(scope,'enabled').checked=s.enabled;for(const name of ['startsAt','endsAt'])field(scope,name).value=kst(s[name]);for(const name of ['coinCost','dailyLimit'])field(scope,name).value=s[name]??'';const tbody=scope.querySelector('tbody');tbody.replaceChildren(...s.rewards.map(rewardRow));scope.querySelector('[data-current]').textContent=s.enabled?'도전 ON':'도전 OFF';}
 totals();
}
async function confirmEnable(){
 const dialog=document.createElement('dialog');dialog.className='ck-admin-confirm';dialog.setAttribute('aria-labelledby','chuseokEnableTitle');
 dialog.innerHTML='<h3 id="chuseokEnableTitle">실제 도전을 켤까요?</h3><p>ON으로 선택한 이벤트에서 추석 코인이 차감되고 상품이 지급됩니다.<br>기간·비용·상품·확률을 모두 확인한 뒤 진행하세요.</p><div><button type="button" data-cancel>OFF 유지 · 돌아가기</button><button type="button" data-confirm>실제 도전 ON으로 저장</button></div>';
 document.body.append(dialog);return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;dialog.close();dialog.remove();resolve(value);};dialog.querySelector('[data-cancel]').onclick=()=>finish(false);dialog.querySelector('[data-confirm]').onclick=()=>finish(true);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});dialog.addEventListener('click',e=>{if(e.target===dialog)finish(false);});dialog.showModal();dialog.querySelector('[data-cancel]').focus();});
}
async function update(save=false){
 if(busy)return;const output=panel.querySelector('output');let body;
 if(save){try{body=form();cleanChuseokSettings(body);if(Object.keys(CHUSEOK_EVENTS).some(k=>body.events[k].enabled&&!saved.events[k].enabled)){busy=true;const confirmed=await confirmEnable();busy=false;if(!confirmed)return;}}catch(e){busy=false;output.textContent=e.message;output.className='ck-admin-error';return;}}
 busy=true;panel.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);output.className='';output.textContent=save?'설정을 저장하고 있습니다…':'설정과 지급 가능한 상품을 확인하고 있습니다…';
 try{const data=await api(body);paint(data);output.textContent=(save?'저장 완료 · ':'')+Object.entries(data.settings.events).map(([k,s])=>CHUSEOK_EVENTS[k]+' '+(s.enabled?'ON':'OFF')).join(' / ');}
 catch(e){output.textContent=e.message;output.className='ck-admin-error';}
 finally{busy=false;panel.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);panel.querySelector('[data-save]').disabled=!loaded;panel.querySelectorAll('[data-reward]').forEach(row=>{field(row,'ref').disabled=!['ITEM','EQUIPMENT','MERCENARY'].includes(field(row,'kind').value);field(row,'amount').disabled=['MISS','EQUIPMENT','MERCENARY'].includes(field(row,'kind').value);});}
}
function coupon(){const nav=document.querySelector('#nav [data-view="coupons"]'),select=document.getElementById('couponRewardType');if(!nav||nav.hidden||!select){panel.querySelector('output').textContent='쿠폰관리 권한이 있는 관리자 계정으로 발급하세요.';return;}nav.click();select.value='CHUSEOK_COIN';select.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('couponCode')?.focus();}
function mount(){
 const target=document.getElementById('view-settings');if(!target||panel)return;
 panel=document.createElement('section');panel.id='chuseokAdmin';panel.className='ck-admin';
 panel.innerHTML=`<header><div><small>CHUSEOK · EVENT CONTROL</small><h3>추석 달빛 잔치</h3></div><a href="/events/chuseok/" target="_blank" rel="noopener">이벤트·연출 확인 ↗</a></header><p>송편 고르기와 추석 떡값을 각각 설정합니다. <b>초기 실제 도전은 모두 OFF</b>이며, 비용·기간·상품·확률은 자동으로 채우지 않습니다.</p><label class="ck-admin-visible"><input type="checkbox" name="visible"> 유저 메뉴·이벤트 화면 공개 (도전 ON/OFF와 별개)</label>
 ${Object.entries(CHUSEOK_EVENTS).map(([key,name],i)=>`<section data-config="${key}"><div class="ck-admin-event-head"><h4><span>0${i+1}</span> ${name}</h4><b data-current>도전 OFF</b></div><div class="ck-admin-grid"><label>시작 일시 (KST)<input name="startsAt" type="datetime-local"></label><label>종료 일시 (KST)<input name="endsAt" type="datetime-local"></label><label>1회 추석 코인 소모량<input name="coinCost" type="number" min="1" max="1000000" step="1" placeholder="미설정"></label><label>계정당 일일 도전 · 0 = 무제한<input name="dailyLimit" type="number" min="0" max="100000" step="1" placeholder="미설정"></label></div><div class="ck-admin-table"><table><thead><tr><th>종류</th><th>당첨 상품</th><th>수량 / 코인액</th><th>최종 확률 (%)</th><th></th></tr></thead><tbody></tbody></table></div><div class="ck-admin-add"><button type="button" data-add="${key}">+ 상품·꽝 추가</button><span data-total>확률 합계 0% / 100%</span></div><label class="ck-admin-on"><input name="enabled" type="checkbox"> ${name} 실제 도전·차감·지급 ON</label></section>`).join('')}
 <div class="ck-admin-notes"><b>운영·지급 기준</b><p>각 이벤트의 확률 합계는 정확히 100%여야 ON으로 저장됩니다. 꽝을 원하면 꽝 행을 직접 추가하세요. 선택하는 색·위치가 확률을 바꾸지 않으며, 꽝에도 추석 코인이 소모됩니다. 일일 횟수는 이벤트별로 매일 00시 KST에 초기화됩니다.</p><p>장비·용병은 1개/1장, 아이템·일반 코인은 입력 수량으로 지급합니다. 용병 중복은 기존 중복 카드 장부에 반영합니다. 종료된 낡은도끼·소원권과 참가용 추석 코인은 보상으로 등록할 수 없습니다.</p><p><b>추석 코인 지급:</b> 아래 쿠폰 버튼에서 지급 수량·사용 횟수를 지정하거나 유저관리 → 아이템 지급에서 <code>CHUSEOK_COIN</code>을 선택하세요. 자동 지급·자동 전환은 없습니다. 낡은도끼 보유량을 추석 코인으로 자동 교환하지 않습니다.</p></div>
 <div class="ck-admin-actions"><button type="button" data-coupon>추석 코인 쿠폰 만들기</button><button type="button" data-load>다시 불러오기</button><button type="button" class="ck-admin-save" data-save disabled>두 이벤트 설정 저장</button></div><output role="status" aria-live="polite"></output>`;
 target.querySelector('.sectionIntro')?.after(panel);if(!panel.isConnected)target.append(panel);
 panel.querySelector('[data-coupon]').onclick=coupon;panel.querySelector('[data-load]').onclick=()=>void update();panel.querySelector('[data-save]').onclick=()=>void update(true);panel.addEventListener('input',totals);
 panel.querySelectorAll('[data-add]').forEach(button=>button.onclick=()=>{if(!loaded||busy)return;const body=panel.querySelector('[data-config="'+button.dataset.add+'"] tbody');if(body.children.length>=60){panel.querySelector('output').textContent='상품은 최대 60종까지 등록할 수 있습니다.';return;}body.append(rewardRow({id:crypto.randomUUID(),kind:'COIN',ref:'',amount:null,rate:null}));totals();});
 const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&token()&&!loaded&&!busy)void update();});observer.observe(panel);
}
mount();if(!panel){const observer=new MutationObserver(()=>{mount();if(panel)observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}
