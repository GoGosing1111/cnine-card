import {WISH_CHOICES,WISH_REWARDS,cleanWishSettings} from '../js/wish-lamp-model-v2077.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#edb18f','#d7a5ee','#efb7d2','#94c4de','#c4d29b','#716774'];
const token=()=>localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
const kst=value=>value?new Date(Date.parse(value)+9*3600000).toISOString().slice(0,16):'';
let panel,revision=null,loaded=false,busy=false;
async function api(body){
 const response=await fetch('/api/admin/wish-lamp',{method:body?'PATCH':'GET',cache:'no-store',headers:{authorization:'Bearer '+token(),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'이벤트 설정을 확인하지 못했습니다.');return data;
}
const field=name=>panel.querySelector(`[name="${name}"]`);
const numeric=name=>field(name).value.trim()===''?null:Number(field(name).value);
function form(){return {revision,visible:field('visible').checked,enabled:field('enabled').checked,startsAt:field('startsAt').value?field('startsAt').value+':00+09:00':null,endsAt:field('endsAt').value?field('endsAt').value+':00+09:00':null,coinCost:numeric('coinCost'),ticketCost:numeric('ticketCost'),choices:Object.fromEntries(WISH_CHOICES.map(c=>[c.id,{rates:Object.fromEntries([...c.keys,'MISS'].map(k=>[k,numeric(c.id+'-'+k)]))}]))}}
function meters(){
 for(const c of WISH_CHOICES){const keys=[...c.keys,'MISS'],rates=keys.map(k=>numeric(c.id+'-'+k)),sum=rates.reduce((n,r)=>n+(Number.isFinite(r)?r:0),0),out=panel.querySelector(`[data-total="${c.id}"]`);out.textContent=`합계 ${Number(sum.toFixed(4))}% / 100% · 당첨 ${Number((sum-(rates.at(-1)||0)).toFixed(4))}% · 꽝 ${rates.at(-1)??'미설정'}${rates.at(-1)===null?'':'%'}${rates.includes(null)?' · 미설정 있음':''}`;out.classList.toggle('wish-error',Math.abs(sum-100)>1e-6||rates.includes(null));panel.querySelectorAll(`[data-meter="${c.id}"] i`).forEach((bar,i)=>bar.style.width=Math.max(0,Math.min(100,rates[i]||0))+'%')}
}
async function update(save=false){
 if(busy)return;const out=panel.querySelector('output');let body;
 if(save){try{body=form();cleanWishSettings(body)}catch(e){out.textContent=e.message;out.className='wish-error';return}if(body.enabled&&!confirm('설정한 기간과 비용·확률로 실제 소원 결제 및 아이템 지급을 활성화할까요?'))return}
 busy=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);out.className='';out.textContent=save?'설정 저장 중…':'운영 설정과 지급 아이템을 확인 중…';
 try{
  const data=await api(body);loaded=true;revision=data.revision;
  for(const k of ['visible','enabled'])field(k).checked=data.settings[k];
  for(const k of ['startsAt','endsAt'])field(k).value=kst(data.settings[k]);
  for(const k of ['coinCost','ticketCost'])field(k).value=data.settings[k]??'';
  for(const c of WISH_CHOICES)for(const k of [...c.keys,'MISS'])field(c.id+'-'+k).value=data.settings.choices[c.id].rates[k]??'';
  for(const [key,r] of Object.entries(data.items)){const node=panel.querySelector(`[data-catalog="${key}"]`);node.textContent=r.available?'지급 준비됨':'비활성·비공개·누락 확인';node.classList.toggle('wish-error',!r.available)}
  meters();out.textContent=`${save?'저장 완료 · ':''}${data.settings.enabled?'운영 ON (설정 기간에만 개봉 가능)':'운영 OFF · 재화 차감 불가'} · ${data.complete?'필수 설정 완료':'기간·비용·확률 미설정'}`;
 }catch(e){out.textContent=e.message;out.className='wish-error'}
 finally{busy=false;panel.querySelector('[data-load]').disabled=false;panel.querySelector('[data-save]').disabled=!loaded;panel.querySelector('[data-ticket-coupon]').disabled=false}
}
export function openWishTicketCouponForm(){
 const nav=document.querySelector('#nav [data-view="coupons"]'),select=document.getElementById('couponRewardType');
 if(!nav||nav.hidden||!select){if(panel)panel.querySelector('output').textContent='쿠폰 발급 권한이 있는 관리자 계정으로 쿠폰관리를 열어주세요.';return}
 nav.click();select.value='PINGDU_WISH_TICKET';select.dispatchEvent(new Event('change',{bubbles:true}));
 const amount=document.getElementById('couponRewardAmount');if(amount)amount.value='1';
 document.getElementById('couponCode')?.focus();
 document.querySelector('#view-coupons .couponForm')?.scrollIntoView({block:'start'});
}
function mount(){
 const target=document.getElementById('view-settings');if(!target||panel)return;
 panel=document.createElement('section');panel.id='wishLampAdmin';panel.className='wish-admin';
 panel.innerHTML=`<small>LIMITED EVENT / WISH LAMP</small><h3>핑두의 소원램프</h3><p>유저가 <b>이동수단·장비·배틀슈트 중 종류를 먼저 선택</b>하고 코인과 소원권을 사용합니다. 선택한 목록의 아이템 1개 또는 꽝이 나옵니다.<br>초기 상태는 비공개·운영 OFF이며, 미설정 항목이 있으면 개봉할 수 없습니다. 모든 일시는 <b>한국 시간(KST)</b>입니다.</p><div class="wish-admin-grid"><label>시작 일시 (KST)<input name="startsAt" type="datetime-local"></label><label>종료 일시 (KST)<input name="endsAt" type="datetime-local"></label><label>1회 코인 비용<input name="coinCost" type="number" min="1" max="1000000000000" step="1" placeholder="미설정"></label><label>1회 소원권 수량<input name="ticketCost" type="number" min="1" max="1000000" step="1" placeholder="미설정"></label></div><div class="wish-admin-flags"><label><input name="visible" type="checkbox">유저 메뉴 공개</label><label><input name="enabled" type="checkbox">실제 개봉 ON</label></div><p>차량은 <b>보유 차량 제외 · 모두 보유 시 이동수단 소원 차단</b>입니다. 보유 차량의 당첨확률은 남은 차량에 비례 배분하고 꽝 확률은 유지합니다. 장비·배틀슈트는 새 인스턴스 1개로 지급하며 자동 장착하지 않습니다.</p>${WISH_CHOICES.map(c=>`<section class="wish-admin-pool"><h4>${c.name} 소원 · 실제 등장확률</h4><p>각 아이템과 꽝의 합계를 정확히 100%로 입력하세요. <b>가중치가 아닌 최종 %</b>입니다.</p><table><thead><tr><th>보상 (당첨 시 1개)</th><th>등장확률 %</th><th>지급 상태</th></tr></thead><tbody>${[...c.keys,'MISS'].map((k,i)=>`<tr><td><span style="color:${colors[i]}">●</span> ${k==='MISS'?'꽝 · 획득 없음':esc(WISH_REWARDS[k].name)}</td><td><input name="${c.id}-${k}" type="number" min="0" max="100" step="0.0001" placeholder="미설정" aria-label="${c.name} ${k==='MISS'?'꽝':esc(WISH_REWARDS[k].name)} 등장확률"></td><td ${k==='MISS'?'':`data-catalog="${k}"`}>${k==='MISS'?'참여 비용 소모':'확인 전'}</td></tr>`).join('')}</tbody></table><div class="rate-meter" data-meter="${c.id}">${[...c.keys,'MISS'].map((k,i)=>`<i style="background:${colors[i]}"></i>`).join('')}</div><b data-total="${c.id}">미설정</b></section>`).join('')}<p>소원권: <b>핑두의 소원권 (PINGDU_WISH_TICKET)</b> — <b>쿠폰관리 → 새 영구 쿠폰 발급 → 보상 종류 「핑두의 소원권」</b>에서 수량과 전체 사용 한도를 지정해 발급하세요. 유저가 쿠폰을 등록하면 소원권만 즉시 적립됩니다. 같은 쿠폰은 계정당 1회이며, 쿠폰을 삭제·비활성화하면 추가 사용이 중지됩니다. 유저관리의 개별 아이템 지급도 유지됩니다.<br>꽝에도 비용이 소모되며, 차감·지급·완료 기록은 한 거래로 처리합니다. 저장 충돌 시 다른 관리자 설정을 덮어쓰지 않습니다.</p><div class="admin-actions"><button type="button" data-ticket-coupon>소원권 쿠폰 만들기</button><button type="button" data-load>다시 불러오기</button><button type="button" data-save disabled>이벤트 설정 저장</button><a href="/preview/wish-lamp-v1/">연출 미리보기</a><a href="/assets/ui/events/wish-lamp-v2077/announcement-poster.png" download>유저 공지 포스터</a></div><output aria-live="polite"></output>`;
 target.querySelector('.sectionIntro').after(panel);panel.querySelector('[data-ticket-coupon]').onclick=openWishTicketCouponForm;panel.querySelector('[data-load]').onclick=()=>update();panel.querySelector('[data-save]').onclick=()=>update(true);panel.addEventListener('input',meters);
 const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&token()&&!loaded&&!busy)void update()});observer.observe(panel);
}
mount();if(!panel){const observer=new MutationObserver(()=>{mount();if(panel)observer.disconnect()});observer.observe(document.body,{childList:true,subtree:true})}
let ticketReady=false,ticketLoading=false;
function ticketOption(){
 const select=document.getElementById('inventoryItemCode');if(!select||select.querySelector('option[value="PINGDU_WISH_TICKET"]'))return;
 if(!ticketReady){if(!ticketLoading&&token()){ticketLoading=true;void api().then(()=>{ticketReady=true;ticketOption()}).catch(()=>{}).finally(()=>{ticketLoading=false})}return}
 const option=document.createElement('option');option.value='PINGDU_WISH_TICKET';option.textContent='핑두의 소원권 · 소원램프 이벤트';select.append(option);
}
new MutationObserver(ticketOption).observe(document.body,{childList:true,subtree:true});ticketOption();
